import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Permite requisições do navegador
app.use(express.json());

// Endpoint que o site vai chamar com os dados da venda
app.get('/marcar-venda', (req, res) => {
  const {
    valor,
    nome,
    email,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term
  } = req.query;

  // Exemplo: imprimir no log (você pode salvar em banco depois)
  console.log('🔥 NOVA VENDA RECEBIDA:');
  console.log({
    valor,
    nome,
    email,
    utms: {
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term
    }
  });

  res.json({ status: 'ok', message: 'Venda recebida com sucesso' });
});

// Rota de teste
app.get('/', (req, res) => {
  res.send('🟢 API do UTMify está rodando!');
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
