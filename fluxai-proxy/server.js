const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8080;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function sendJSON(res, status, data) {
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function buildMultipart(fields, files) {
  const boundary = '----FluxAI' + Date.now().toString(36);
  const CRLF = '\r\n';
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`));
  }
  for (const { name, filename, type, data } of files) {
    parts.push(
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"; filename="${filename}"${CRLF}Content-Type: ${type}${CRLF}${CRLF}`),
      data,
      Buffer.from(CRLF)
    );
  }
  parts.push(Buffer.from(`--${boundary}--${CRLF}`));
  const body = Buffer.concat(parts);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end(); return;
  }

  if (req.method === 'GET') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' })); return;
  }

  if (req.url !== '/api/gpt-image') {
    sendJSON(res, 404, { error: 'Not found' }); return;
  }

  // Read body with size limit check
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) { // 20MB max
      sendJSON(res, 413, { error: 'Body too large' }); return;
    }
    chunks.push(chunk);
  }
  const rawBody = Buffer.concat(chunks).toString('utf8');
  console.log(`Body size: ${rawBody.length} chars`);

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch(e) {
    console.error('JSON parse error:', e.message, '| First 200 chars:', rawBody.substring(0, 200));
    sendJSON(res, 400, { error: 'JSON invalide: ' + e.message }); return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) { sendJSON(res, 401, { error: 'Authorization manquant' }); return; }

  const { prompt, image, size: imgSize, quality } = payload;
  if (!prompt) { sendJSON(res, 400, { error: 'prompt manquant' }); return; }
  if (!image)  { sendJSON(res, 400, { error: 'image manquante' }); return; }

  console.log(`Calling OpenAI — prompt: ${prompt.substring(0, 60)}…`);
  console.log(`Image type: ${image.substring(0, 30)}…`);

  const base64 = image.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64, 'base64');
  console.log(`Image buffer size: ${imageBuffer.length} bytes`);

  const { body, contentType } = buildMultipart(
    { model: 'gpt-image-1', prompt, n: '1', size: imgSize || '1024x1024', quality: quality || 'high' },
    [{ name: 'image', filename: 'product.png', type: 'image/png', data: imageBuffer }]
  );

  try {
    const result = await new Promise((resolve, reject) => {
      const reqOAI = https.request({
        hostname: 'api.openai.com',
        path: '/v1/images/edits',
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': contentType,
          'Content-Length': body.length,
        },
        timeout: 180000,
      }, (r) => {
        const chunks = [];
        r.on('data', c => chunks.push(c));
        r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      reqOAI.on('error', reject);
      reqOAI.on('timeout', () => { reqOAI.destroy(); reject(new Error('OpenAI timeout')); });
      reqOAI.write(body);
      reqOAI.end();
    });

    console.log(`OpenAI responded: ${result.status}`);
    res.writeHead(result.status, { ...CORS, 'Content-Type': 'application/json' });
    res.end(result.body);

  } catch(err) {
    console.error('OpenAI error:', err.message);
    sendJSON(res, 502, { error: err.message });
  }

}).listen(PORT, () => {
  console.log(`✅ FluxAI Railway Proxy — port ${PORT}`);
  console.log(`   POST /api/gpt-image — GPT Image 1.5 edits`);
});
