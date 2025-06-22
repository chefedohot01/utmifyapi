// --- 1. Imports e Inicialização do Express ---
const express = require('express'); // Importa o Express
const axios = require('axios');     // Importa o Axios para fazer requisições HTTP
const crypto = require('crypto');   // Importa o módulo Crypto do Node.js para hashing

const app = express(); // <<< ESTA LINHA CRIA A INSTÂNCIA DO SEU APLICATIVO EXPRESS
const port = process.env.PORT || 3000; // Define a porta do servidor, usando a do Render ou 3000

// --- 2. Configurações da CAPI (variáveis de ambiente) ---
// Pega o token e o Pixel ID das variáveis de ambiente do Render
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PIXEL_ID = process.env.META_PIXEL_ID;

// --- 3. Função Auxiliar para Hashing ---
function hashData(data) {
  if (!data) return null;
  // Hashea os dados usando SHA256, como exigido pelo Meta.
  // Converte para string, remove espaços e minúsculas antes de hashear.
  return crypto.createHash('sha256').update(String(data).trim().toLowerCase()).digest('hex');
}

// --- 4. Função para Enviar o Evento de Purchase para a CAPI ---
async function sendPurchaseToMetaCAPI(
  valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, clientIp, clientUserAgent,
  requestObject // Objeto 'req' do Express para pegar a URL de origem
) {
  const eventTime = Math.floor(Date.now() / 1000); // Timestamp Unix em segundos
  // Gerar um event_id único. Crucial para desduplicação!
  // Combina o timestamp com um hash aleatório para garantir unicidade.
  const eventId = `purchase_${eventTime}_${crypto.randomBytes(8).toString('hex')}`;

  // Preparar dados do usuário (TODOS DEVERÃO SER HASHEADOS, EXCETO fbp/fbc)
  const userData = {
    em: [hashData(email)], // Email hasheado com SHA256
    fbp: fbp,              // Cookie _fbp (não hasheado)
    fbc: fbc,              // Cookie _fbc (não hasheado)
    client_ip_address: clientIp, // Endereço IP do cliente
    client_user_agent: clientUserAgent // User-Agent do navegador do cliente
  };

  // Limpa dados nulos ou indefinidos do objeto userData para não enviar campos vazios
  Object.keys(userData).forEach(key => {
    if (userData[key] === null || userData[key] === undefined) {
      delete userData[key];
    }
  });

  // Preparar os dados do evento de compra
  const eventData = {
    event_name: "Purchase",    // Nome do evento padrão do Meta
    event_time: eventTime,     // Quando o evento ocorreu
    action_source: "website",  // Fonte da ação
    event_id: eventId,         // ID único para desduplicação
    user_data: userData,       // Dados do usuário (hasheados e cookies)
    custom_data: {             // Dados personalizados do evento (parâmetros da URL)
      value: parseFloat(valor), // Valor da compra
      currency: "BRL",          // Moeda da compra
      utm_source: utm_source,
      utm_medium: utm_medium,
      utm_campaign: utm_campaign,
      utm_content: utm_content,
      utm_term: utm_term,
      nome_cliente: nome        // Exemplo de dado personalizado adicional
    },
    // URL da página onde o evento ocorreu. Usa referrer ou a URL atual da requisição.
    event_source_url: requestObject ? (requestObject.headers.referer || requestObject.url) : undefined
  };

  // Payload final a ser enviado para a CAPI
  const payload = {
    data: [eventData],
    // Para testar eventos no Gerenciador de Eventos do Facebook:
    // Descomente a linha abaixo e substitua "SEU_CODIGO_DE_TESTE" pelo código
    // que você encontra na aba "Testar Eventos" do seu Pixel.
    // Lembre-se de REMOVER ou COMENTAR esta linha em produção!
    // test_event_code: "SEU_CODIGO_DE_TESTE",
  };

  // URL da API de Conversões do Meta
  const url = `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`;

  try {
    // Faz a requisição POST para a CAPI do Meta
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ Evento de Purchase enviado para a CAPI:', response.data);
    return { success: true, capi_response: response.data }; // Retorna sucesso e a resposta da CAPI
  } catch (error) {
    // Captura e loga erros da requisição HTTP (por exemplo, token inválido, payload malformado)
    console.error('❌ Erro ao enviar evento de Purchase para a CAPI:', error.response ? error.response.data : error.message);
    return { success: false, capi_error: error.response ? error.response.data : error.message }; // Retorna falha e o erro
  }
}

// --- 5. Sua Rota de Vendas ---
// Esta rota processa a venda recebida do seu front-end
app.get('/marcar-venda', async (req, res) => {
  // Extrai os parâmetros da URL da requisição
  const { valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc } = req.query;

  // Obtém o endereço IP do cliente e o User-Agent do navegador para melhor atribuição
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const clientUserAgent = req.headers['user-agent'];

  // Validação básica dos parâmetros necessários
  if (!valor || !email) {
    return res.status(400).json({ success: false, message: "Parâmetros 'valor' e 'email' são obrigatórios." });
  }

  // Converte o valor para float, tratando vírgulas como decimais
  const parsedValor = parseFloat(valor.replace(',', '.'));
  if (isNaN(parsedValor)) {
    return res.status(400).json({ success: false, message: "Valor inválido." });
  }

  // --- 6. Lógica de Venda da Sua API (MUITO IMPORTANTE!) ---
  // ESTE É O LUGAR ONDE VOCÊ DEVE INSERIR A LÓGICA DE NEGÓCIO REAL DA SUA APLICAÇÃO.
  // EXEMPLOS:
  // - Registrar a venda em seu banco de dados.
  // - Verificar se esta venda já foi processada (para evitar duplicidade no seu sistema).
  // - Atualizar o status de um pedido.
  // - Enviar um e-mail de confirmação ao cliente.
  //
  // Substitua 'true' pela sua lógica real que define se a venda foi registrada com sucesso no SEU sistema.
  let vendaRegistradaComSucessoNaSuaAPI = true;
  let message = "Venda processada.";

  // Exemplo de como você poderia lidar com duplicidade (se sua API registrasse vendas)
  // if (await suaFuncaoParaVerificarVendaExistente(email, valor, algumIdDeTransacao)) {
  //   vendaRegistradaComSucessoNaSuaAPI = false;
  //   message = "Venda já registrada na sua API.";
  // }

  if (vendaRegistradaComSucessoNaSuaAPI) {
    // Se a venda foi registrada com sucesso no seu sistema, envia para a CAPI
    const { success: capiSuccess, capi_response, capi_error } = await sendPurchaseToMetaCAPI(
      parsedValor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, clientIp, clientUserAgent,
      req // Passa o objeto de requisição 'req' para a função da CAPI
    );

    if (capiSuccess) {
      // Retorna sucesso se a venda foi registrada e o evento enviado para a CAPI
      return res.status(200).json({ success: true, message: message + " Evento enviado para Meta CAPI.", capi_response });
    } else {
      // Retorna erro se a venda foi registrada, mas houve falha ao enviar para a CAPI
      return res.status(500).json({ success: false, message: message + " Falha ao enviar para Meta CAPI.", capi_error });
    }
  } else {
    // Retorna status de conflito se a venda já existia ou não pôde ser registrada na sua API
    return res.status(409).json({ success: false, message: message });
  }
});

// --- 7. Inicializa o Servidor Express ---
// Faz com que sua API comece a escutar por requisições na porta configurada.
app.listen(port, () => {
  console.log(`API rodando na porta ${port}`);
});