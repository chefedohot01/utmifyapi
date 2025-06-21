const express = require('express');
const axios = require('axios');
require('dotenv').config();

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

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

// 🔑 Função para gerar chave única
function gerarChaveUnica({ valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term }) {
    return `${valor}|${utm_source}|${utm_medium}|${utm_campaign}|${utm_content}|${utm_term}`;
}

// 🔍 Verifica se já existe no banco
function vendaExiste(chave) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM vendas WHERE chave = ?`, [chave], (err, row) => {
            if (err) reject(err);
            resolve(!!row);
        });
    });
}

// 💾 Salva venda no banco
function salvarVenda({ chave, valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term, orderId }) {
    const timestamp = Math.floor(Date.now() / 1000);
    db.run(`INSERT INTO vendas (chave, valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term, orderId, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [chave, valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term, orderId, timestamp]);
}

// 🚀 Endpoint POST manual (opcional, pode usar se quiser enviar via POST)
app.post('/criar-pedido', async (req, res) => {
    const { nome, email, valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.body;

    if (!nome || !email || !valor) {
        return res.status(400).json({ error: 'Nome, email e valor são obrigatórios' });
    }

    const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const payload = {
        orderId: 'pedido-' + Date.now(),
        platform: 'PushinPay',
        paymentMethod: 'pix',
        status: 'paid',
        createdAt: agora,
        approvedDate: agora,
        refundedAt: null,
        customer: {
            name: nome,
            email: email,
            phone: null,
            document: null,
            country: 'BR'
        },
        products: [
            {
                id: 'produto-1',
                name: 'Acesso VIP',
                planId: 'vip-acesso',
                planName: 'Acesso VIP Mensal',
                quantity: 1,
                priceInCents: Math.round(valor * 100)
            }
        ],
        trackingParameters: {
            src: null,
            sck: null,
            utm_source: utm_source || null,
            utm_campaign: utm_campaign || null,
            utm_medium: utm_medium || null,
            utm_content: utm_content || null,
            utm_term: utm_term || null
        },
        commission: {
            totalPriceInCents: Math.round(valor * 100),
            gatewayFeeInCents: 0,
            userCommissionInCents: Math.round(valor * 100)
        },
        isTest: false
    };

    try {
        const response = await axios.post('https://api.utmify.com.br/api-credentials/orders', payload, {
            headers: {
                'x-api-token': process.env.API_KEY,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).json({
            message: 'Pedido criado com sucesso na UTMify',
            data: response.data
        });
    } catch (error) {
        console.error('Erro ao criar pedido:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Erro ao criar pedido',
            details: error.response?.data || error.message
        });
    }
});

// 🚦 Endpoint principal COM VERIFICAÇÃO DE DUPLICIDADE
app.get('/marcar-venda', async (req, res) => {
    const { valor, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = req.query;

    if (!valor) {
        return res.status(400).json({ error: 'Parâmetro valor é obrigatório' });
    }

    const valorNum = parseFloat(valor);
    if (isNaN(valorNum)) {
        return res.status(400).json({ error: 'Valor inválido' });
    }

    const chave = gerarChaveUnica({ valor: valorNum, utm_source, utm_medium, utm_campaign, utm_content, utm_term });
    const orderId = 'pedido-' + Date.now();
    const agora = new Date().toISOString().replace('T', ' ').substring(0, 19);

    try {
        const jaExiste = await vendaExiste(chave);

        if (jaExiste) {
            return res.status(200).json({ success: false, message: '⚠️ Venda já registrada anteriormente' });
        }

        const payload = {
            orderId,
            platform: 'PushinPay',
            paymentMethod: 'pix',
            status: 'paid',
            createdAt: agora,
            approvedDate: agora,
            refundedAt: null,
            customer: {
                name: "ClienteVIP",
                email: "cliente@email.com",
                phone: null,
                document: null,
                country: 'BR'
            },
            products: [
                {
                    id: 'produto-1',
                    name: 'Acesso VIP',
                    planId: 'vip-acesso',
                    planName: 'Acesso VIP Mensal',
                    quantity: 1,
                    priceInCents: Math.round(valorNum * 100)
                }
            ],
            trackingParameters: {
                src: null,
                sck: null,
                utm_source: utm_source || null,
                utm_campaign: utm_campaign || null,
                utm_medium: utm_medium || null,
                utm_content: utm_content || null,
                utm_term: utm_term || null
            },
            commission: {
                totalPriceInCents: Math.round(valorNum * 100),
                gatewayFeeInCents: 0,
                userCommissionInCents: Math.round(valorNum * 100)
            },
            isTest: false
        };

        const response = await axios.post('https://api.utmify.com.br/api-credentials/orders', payload, {
            headers: {
                'x-api-token': process.env.API_KEY,
                'Content-Type': 'application/json'
            }
        });

        salvarVenda({ chave, valor: valorNum, utm_source, utm_medium, utm_campaign, utm_content, utm_term, orderId });

        return res.status(200).json({
            success: true,
            message: '✅ Pedido criado e registrado com sucesso na UTMify',
            data: response.data
        });

    } catch (error) {
        console.error('Erro ao criar pedido:', error.response?.data || error.message);
        return res.status(500).json({
            error: 'Erro ao criar pedido',
            details: error.response?.data || error.message
        });
    }
});

// 🚀 Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
