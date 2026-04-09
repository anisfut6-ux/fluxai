// netlify/functions/gpt-image.js
// Proxy OpenAI Image API — gère edits (image+prompt) et generations (prompt seul)

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Endpoint',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const authHeader = event.headers['authorization'] || event.headers['Authorization'];
  if (!authHeader) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Authorization manquant' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const { prompt, image, size, quality } = body;

    let openaiUrl, fetchOptions;

    if (image) {
      // --- Mode EDITS : image en input ---
      // Decode base64
      const base64 = image.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64, 'base64');

      // Build multipart manually
      const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
      const CRLF = '\r\n';

      const parts = [];

      // image field
      parts.push(
        Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="image"; filename="product.png"${CRLF}Content-Type: image/png${CRLF}${CRLF}`),
        imageBuffer,
        Buffer.from(CRLF)
      );

      // prompt field
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="prompt"${CRLF}${CRLF}${prompt}${CRLF}`));

      // model
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}gpt-image-1${CRLF}`));

      // n
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="n"${CRLF}${CRLF}1${CRLF}`));

      // size
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="size"${CRLF}${CRLF}${size || '1024x1024'}${CRLF}`));

      // quality
      parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="quality"${CRLF}${CRLF}${quality || 'high'}${CRLF}`));

      // closing boundary
      parts.push(Buffer.from(`--${boundary}--${CRLF}`));

      const bodyBuffer = Buffer.concat(parts);

      openaiUrl = 'https://api.openai.com/v1/images/edits';
      fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': bodyBuffer.length.toString(),
        },
        body: bodyBuffer,
      };

    } else {
      // --- Mode GENERATIONS : texte seul ---
      openaiUrl = 'https://api.openai.com/v1/images/generations';
      fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt,
          n: 1,
          size: size || '1024x1024',
          quality: quality || 'high',
        }),
      };
    }

    const res = await fetch(openaiUrl, fetchOptions);
    const data = await res.text();
    return {
      statusCode: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: data,
    };

  } catch (err) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
