const express = require('express');
const axios = require('axios');
require('dotenv').config(); // Garante que as variáveis do .env sejam carregadas

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

// Adicione esta linha para habilitar CORS (essencial para testes locais e em produção)
const cors = require('cors');
// Para produção no Render, use a origem exata do seu Netlify:
// app.use(cors({ origin: 'https://conteudoaquiamor.netlify.app' }));
// Para desenvolvimento/testes locais, ou se ainda não definiu a origem exata para produção:
app.use(cors());


// 📦 Banco de dados
const dbPath = path.resolve(__dirname, 'banco.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar no banco:', err.message);
    } else {
        console.log('🗄️ Banco conectado com sucesso');
    }
});

// 🔧 Cria tabela se não existir (AGORA COM orderId como UNIQUE e sem 'chave'!)
db.run(`CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    orderId TEXT UNIQUE, -- orderId agora é o campo único para o banco de dados local
    valor REAL,
    nome TEXT,
    email TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    fbp TEXT,             -- Adicionado para registrar fbp localmente
    fbc TEXT,             -- Adicionado para registrar fbc localmente
    timestamp INTEGER
)`);

// Removidas as funções 'gerarChaveUnica' e 'vendaExiste'
// Não são mais necessárias, pois a deduplicação local foi removida.

// 💾 Salva venda no banco (AJUSTADO: não usa mais 'chave' e inclui 'nome', 'email', 'fbp', 'fbc')
function salvarVenda({ valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, orderId }) {
    return new Promise((resolve, reject) => {
        const timestamp = Date.now(); // Salva o timestamp da venda
        db.run(`INSERT INTO vendas (valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, orderId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, orderId, timestamp],
            function (err) {
                if (err) {
                    console.error('Erro ao salvar venda no banco de dados local:', err.message);
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
    });
}


// 🚀 Endpoint principal para marcar venda
app.get('/marcar-venda', async (req, res) => {
    // Parâmetros (email ainda é obrigatório para o payload da UTMify)
    const { valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc } = req.query;

    if (!valor || !email) { // Email ainda é necessário para o payload UTMify
        return res.status(400).json({ success: false, message: 'Parâmetros "valor" e "email" são obrigatórios.' });
    }

    const valorNum = parseFloat(valor.replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
        return res.status(400).json({ success: false, message: 'Valor inválido.' });
    }

    try {
        // Gera um ID de pedido único para CADA CHAMADA (para sua referência e para a UTMify)
        const orderId = `VENDA-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const currentTimestampISO = new Date().toISOString();

        // 📦 Mapeamento de Produtos (Mantido para categorização na UTMify)
        let productId, productName, planId, planName;

        switch (valorNum) {
            case 12.90:
                productId = "PKG-BASICO-1290";
                productName = "Pacote Básico";
                planId = "PLAN-BASICO-PADRAO";
                planName = "Plano Básico";
                break;
            case (12.90 + 3.90): // 16.80
                productId = "PKG-BASICO-1290-BUMP";
                productName = "Pacote Básico + OrderBump";
                planId = "PLAN-BASICO-PADRAO";
                planName = "Plano Básico (c/ Bump)";
                break;
            case 17.90:
                productId = "PKG-INTERMEDIARIO-1790";
                productName = "Pacote Intermediário";
                planId = "PLAN-INTERMEDIARIO-PADRAO";
                planName = "Plano Intermediário";
                break;
            case (17.90 + 3.90): // 21.80
                productId = "PKG-INTERMEDIARIO-1790-BUMP";
                productName = "Pacote Intermediário + OrderBump";
                planId = "PLAN-INTERMEDIARIO-PADRAO";
                planName = "Plano Intermediário (c/ Bump)";
                break;
            case 29.90:
                productId = "PKG-PREMIUM-2990";
                productName = "Pacote Premium";
                planId = "PLAN-PREMIUM-PADRAO";
                planName = "Plano Premium";
                break;
            case (29.90 + 3.90): // 33.80
                productId = "PKG-PREMIUM-2990-BUMP";
                productName = "Pacote Premium + OrderBump";
                planId = "PLAN-PREMIUM-PADRAO";
                planName = "Plano Premium (c/ Bump)";
                break;
            default:
                // Fallback para qualquer outro valor ou valor não mapeado
                productId = `PROD-OUTROS-${Math.floor(Math.random() * 100000)}`;
                productName = 'Venda Geral Desconhecida';
                planId = `PLAN-OUTROS-${Math.floor(Math.random() * 100000)}`;
                planName = 'Plano Desconhecido';
                break;
        }

        // ✅ Prepara o payload para a API de Orders da UTMify
        const payload = {
            orderId: orderId,
            platform: "Pushinpay",
            paymentMethod: "pix",
            status: "paid", // Assumimos que a página só carrega com pagamento confirmado
            createdAt: currentTimestampISO,
            approvedDate: currentTimestampISO,
            customer: {
                name: nome || 'Cliente Sem Nome',
                email: email, // O email AINDA É NECESSÁRIO para a UTMify
                phone: null,
                document: null
            },
            trackingParameters: {
                utm_source: utm_source || null,
                utm_campaign: utm_campaign || null,
                utm_medium: utm_medium || null,
                utm_content: utm_content || null,
                utm_term: utm_term || null,
                // --- ADICIONADO: Enviando fbp e fbc para UTMify ---
                fbp: fbp || null,
                fbc: fbc || null
                // --- FIM DA ADIÇÃO ---
            },
            product: {
                id: productId,
                name: productName,
                planId: planId,
                planName: planName,
                quantity: 1,
                priceInCents: Math.round(valorNum * 100),
            },
            commission: {
                totalPriceInCents: Math.round(valorNum * 100),
                gatewayFeeInCents: 0,
                userCommissionInCents: Math.round(valorNum * 100)
            },
            isTest: false // Lembre-se de mudar para 'true' para testes na UTMify
        };

        // 📤 Envia para a API de Orders da UTMify
        const response = await axios.post('https://api.utmify.com.br/api-credentials/orders', payload, {
            headers: {
                'x-api-token': process.env.API_KEY,
                'Content-Type': 'application/json'
            }
        });

        // 💾 Salva a venda no banco de dados local (incluindo fbp e fbc)
        salvarVenda({ valor: valorNum, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, orderId });

        console.log('✅ Pedido criado e registrado com sucesso na UTMify. Resposta:', response.data);
        return res.status(200).json({
            success: true,
            message: '✅ Pedido criado e registrado com sucesso na UTMify',
            data: response.data
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API rodando em http://localhost:${PORT}`);
});