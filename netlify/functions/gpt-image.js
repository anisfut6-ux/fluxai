// netlify/functions/gpt-image.js
// Relai vers Railway — timeout 26s Netlify Pro ou direct Railway

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Authorization manquant' }) };
  }

  const RAILWAY_URL = 'https://fluxai-production.up.railway.app/api/gpt-image';

  try {
    const response = await fetch(RAILWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
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
