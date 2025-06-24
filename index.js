const express = require('express');
const axios = require('axios');
require('dotenv').config(); // Garante que as variáveis do .env sejam carregadas

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

// Adicione esta linha para habilitar CORS (essencial para testes locais)
const cors = require('cors');
app.use(cors({ origin: 'https://conteudoaquiamor.netlify.app' })); // Para testar, pode usar assim. Para produção, considere restringir a origem: app.use(cors({ origin: 'https://conteudoaquiamor.netlify.app' }));


// 📦 Banco de dados
const dbPath = path.resolve(__dirname, 'banco.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar no banco:', err.message);
    } else {
        console.log('🗄️ Banco conectado com sucesso');
    }
});

// 🔧 Cria tabela se não existir
db.run(`CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE,
    valor REAL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    orderId TEXT,
    timestamp INTEGER
)`);

// 🔑 Função para gerar chave única para o banco de dados local
function gerarChaveUnica({ valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term }) {
    return `${valor}|${utm_source}|${utm_medium}|${utm_campaign}|${utm_content}|${utm_term}`;
}

// 🔍 Verifica se já existe no banco
function vendaExiste(chave) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM vendas WHERE chave = ?`, [chave], (err, row) => {
            if (err) reject(err);
            resolve(row); // Retorna a linha se existir, ou undefined se não
        });
    });
}

// 💾 Salva venda no banco
function salvarVenda({ chave, valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term, orderId }) {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now(); // Salva o timestamp da venda
        db.run(`INSERT INTO vendas (chave, valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term, orderId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [chave, valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term, orderId, timestamp],
            function (err) {
                if (err) reject(err);
                resolve(this.lastID);
            });
    });
}


// 🚀 Endpoint principal para marcar venda
app.get('/marcar-venda', async (req, res) => {
    const { valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc } = req.query;

    if (!valor || !email) {
        return res.status(400).json({ success: false, message: 'Parâmetros "valor" e "email" são obrigatórios.' });
    }

    const valorNum = parseFloat(valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
        return res.status(400).json({ success: false, message: 'Valor inválido.' });
    }

    // Gerar chave única para verificar duplicidade no banco de dados local
    const chave = gerarChaveUnica({ valor: valorNum, utm_source, utm_medium, utm_campaign, utm_content, utm_term });

    try {
        const existe = await vendaExiste(chave);
        if (existe) {
            console.warn('⚠️ Venda duplicada detectada no banco de dados:', chave);
            return res.status(409).json({ success: false, message: 'Venda já registrada para esses parâmetros.' });
        }

        // Gera um ID de pedido único (para sua referência e para a UTMify)
        const orderId = `VENDA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        // Pega o timestamp atual no formato ISO 8601 (necessário pela UTMify)
        const currentTimestampISO = new Date().toISOString();

        // ✅ Prepara o NOVO payload para a API de Orders da UTMify
        const payload = {
            orderId: orderId, // ID único do pedido
            platform: "web", // Ex: "Hotmart", "Kiwi", "Stripe" - Coloque o da sua plataforma
            paymentMethod: "unknown", // Ex: "credit_card", "boleto", "pix" - Coloque o método de pagamento
            status: "paid", // ATUALIZADO: Usando "paid" conforme o erro exigia
            createdAt: currentTimestampISO, // Data de criação do pedido
            approvedDate: currentTimestampISO, // Data de aprovação (pode ser a mesma do createdAt para aprovação imediata)
            customer: {
                name: nome || 'Cliente Sem Nome',
                email: email,
                phone: null, // Se tiver telefone no front-end, passe aqui
                document: null // Se tiver documento (CPF/CNPJ) no front-end, passe aqui
            },
            trackingParameters: {
                utm_source: utm_source || null,
                utm_campaign: utm_campaign || null,
                utm_medium: utm_medium || null,
                utm_content: utm_content || null,
                utm_term: utm_term || null
            },
            product: {
                id: `PROD-${Math.floor(Math.random() * 100000)}`, // NOVO: ID único do produto
                name: 'Venda Geral', // Nome do produto para a UTMify
                planId: `PLAN-${Math.floor(Math.random() * 100000)}`, // NOVO: ID do plano (pode ser um padrão)
                planName: 'Plano Único', // NOVO: Nome do plano (pode ser um padrão)
                quantity: 1, // NOVO: Quantidade do produto (assumindo 1 por padrão)
                priceInCents: Math.round(valorNum * 100), // NOVO: Valor do produto em centavos
            },
            // 'commission' e 'isTest' mantidos no nível superior, pois não foram listados como erros de esquema
            commission: {
                totalPriceInCents: Math.round(valorNum * 100),
                gatewayFeeInCents: 0,
                userCommissionInCents: Math.round(valorNum * 100) // Se for 100% do valor, será o valor total
            },
            isTest: false // Mudar para true se estiver em ambiente de testes da UTMify
        };

        // 📤 Envia para a API de Orders da UTMify
        const response = await axios.post('https://api.utmify.com.br/api-credentials/orders', payload, {
            headers: {
                'x-api-token': process.env.API_KEY, // A chave da API da UTMify (do seu arquivo .env)
                'Content-Type': 'application/json'
            }
        });

        // 💾 Salva a venda no banco de dados local após sucesso na UTMify
        salvarVenda({ chave, valor: valorNum, utm_source, utm_medium, utm_campaign, utm_content, utm_term, orderId });

        console.log('✅ Pedido criado e registrado com sucesso na UTMify. Resposta:', response.data);
        return res.status(200).json({
            success: true,
            message: '✅ Pedido criado e registrado com sucesso na UTMify',
            data: response.data // Retorna a resposta da UTMify
        });

    } catch (error) {
        console.error('❌ Erro ao criar pedido na UTMify:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            error: 'Erro ao criar pedido na UTMify',
            details: error.response?.data || error.message
        });
    }
});

// 🚀 Inicia servidor
const PORT = process.env.PORT || 3000; // Usa porta do ambiente ou 3000
app.listen(PORT, () => {
    console.log(`🚀 API rodando em http://localhost:${PORT}`);
});