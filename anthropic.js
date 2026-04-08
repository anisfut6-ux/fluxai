// netlify/functions/anthropic.js
// Proxy sécurisé vers api.anthropic.com
// La clé API Anthropic vient du HEADER envoyé par le client (tu gardes ta clé dans le browser)

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  // Forward la clé API que le client envoie dans le header
  const apiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];
  if (!apiKey) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'x-api-key header manquant' }) };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': event.headers['anthropic-version'] || '2023-06-01',
      },
      body: event.body,
    });

    const data = await response.text();
    return {
      statusCode: response.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: data,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
