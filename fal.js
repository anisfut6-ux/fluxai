// netlify/functions/fal.js
// Proxy vers fal.run — la clé fal.ai vient du header Authorization

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

  // Modèle fal.ai depuis query param ou path
  // /api/fal?model=fal-ai/flux-pro/v1.1
  const falModel = event.queryStringParameters?.model
    || event.path?.replace('/api/fal/', '').replace('/.netlify/functions/fal/', '');

  if (!falModel || falModel === '/api/fal' || falModel === '') {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Modèle fal.ai manquant' }) };
  }

  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Authorization header manquant' }) };
  }

  try {
    const falUrl = `https://fal.run/${falModel}`;
    const response = await fetch(falUrl, {
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
