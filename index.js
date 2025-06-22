// ... (imports e configurações iniciais) ...

// --- Função para Enviar o Evento de Purchase para a CAPI ---
async function sendPurchaseToMetaCAPI(
  valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, clientIp, clientUserAgent,
  requestObject // <<< NOVO PARÂMETRO AQUI
) {
  const eventTime = Math.floor(Date.now() / 1000); // Unix timestamp em segundos
  const eventId = `purchase_${eventTime}_${crypto.randomBytes(8).toString('hex')}`;

  const userData = {
    em: [hashData(email)],
    fbp: fbp,
    fbc: fbc,
    client_ip_address: clientIp,
    client_user_agent: clientUserAgent
  };

  Object.keys(userData).forEach(key => {
    if (userData[key] === null || userData[key] === undefined) {
      delete userData[key];
    }
  });

  const eventData = {
    event_name: "Purchase",
    event_time: eventTime,
    action_source: "website",
    event_id: eventId,
    user_data: userData,
    custom_data: {
      value: parseFloat(valor),
      currency: "BRL",
      utm_source: utm_source,
      utm_medium: utm_medium,
      utm_campaign: utm_campaign,
      utm_content: utm_content,
      utm_term: utm_term,
      nome_cliente: nome
    },
    // Usamos o requestObject passado como parâmetro
    event_source_url: requestObject ? (requestObject.headers.referer || requestObject.url) : undefined
  };

  const payload = {
    data: [eventData],
    // test_event_code: "TESTXXXXXXXXX",
  };

  const url = `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`;

  try {
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ Evento de Purchase enviado para a CAPI:', response.data);
    return { success: true, capi_response: response.data };
  } catch (error) {
    console.error('❌ Erro ao enviar evento de Purchase para a CAPI:', error.response ? error.response.data : error.message);
    return { success: false, capi_error: error.response ? error.response.data : error.message };
  }
}

// --- Sua Rota de Vendas ---
app.get('/marcar-venda', async (req, res) => {
  const { valor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc } = req.query;

  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const clientUserAgent = req.headers['user-agent'];

  if (!valor || !email) {
    return res.status(400).json({ success: false, message: "Parâmetros 'valor' e 'email' são obrigatórios." });
  }

  const parsedValor = parseFloat(valor.replace(',', '.'));
  if (isNaN(parsedValor)) {
    return res.status(400).json({ success: false, message: "Valor inválido." });
  }

  let vendaRegistradaComSucessoNaSuaAPI = true;
  let message = "Venda processada.";

  if (vendaRegistradaComSucessoNaSuaAPI) {
    const { success: capiSuccess, capi_response, capi_error } = await sendPurchaseToMetaCAPI(
      parsedValor, nome, email, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbp, fbc, clientIp, clientUserAgent,
      req // <<< PASSANDO O OBJETO 'req' AQUI
    );

    if (capiSuccess) {
      return res.status(200).json({ success: true, message: message + " Evento enviado para Meta CAPI.", capi_response });
    } else {
      return res.status(500).json({ success: false, message: message + " Falha ao enviar para Meta CAPI.", capi_error });
    }
  } else {
    return res.status(409).json({ success: false, message: message });
  }
});

// ... (app.listen no final) ...