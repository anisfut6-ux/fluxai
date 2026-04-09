// FluxAI — Railway proxy server
// Node 18+ — timeout illimité — GPT Image 1.5 edits

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3001;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Endpoint',
};

// ─── Multipart builder ────────────────────────────────────────────────────────
function buildMultipart(fields, files) {
  const boundary = '----FluxAIBoundary' + Date.now().toString(36);
  const CRLF = '\r\n';
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`)
    );
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

// ─── GPT Image call ──────────────────────────────────────────────────────────
async function callGPTImage(authHeader, prompt, imageBase64, size, quality) {
  const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64, 'base64');

  const { body, contentType } = buildMultipart(
    {
      model:   'gpt-image-1',
      prompt,
      n:       '1',
      size:    size    || '1024x1024',
      quality: quality || 'high',
    },
    [{ name: 'image', filename: 'product.png', type: 'image/png', data: imageBuffer }]
  );

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path:     '/v1/images/edits',
      method:   'POST',
      headers: {
        'Authorization':  authHeader,
        'Content-Type':   contentType,
        'Content-Length': body.length,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── HTTP server ─────────────────────────────────────────────────────────────
http.createServer(async (req, res) => {

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end(); return;
  }

  // Health check
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'FluxAI Railway Proxy' }));
    return;
  }

  // Only POST /api/gpt-image
  if (req.method !== 'POST' || req.url !== '/api/gpt-image') {
    res.writeHead(404, CORS); res.end(JSON.stringify({ error: 'Not found' })); return;
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authorization manquant' })); return;
  }

  // Read body
  const rawBody = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { res.writeHead(400, CORS); res.end(JSON.stringify({ error: 'JSON invalide' })); return; }

  const { prompt, image, size, quality } = payload;

  if (!prompt) {
    res.writeHead(400, CORS); res.end(JSON.stringify({ error: 'prompt manquant' })); return;
  }
  if (!image) {
    res.writeHead(400, CORS); res.end(JSON.stringify({ error: 'image manquante' })); return;
  }

  console.log(`[${new Date().toISOString()}] GPT Image edits — prompt: ${prompt.substring(0, 80)}…`);

  try {
    const result = await callGPTImage(authHeader, prompt, image, size, quality);
    console.log(`[${new Date().toISOString()}] OpenAI responded: ${result.status}`);
    res.writeHead(result.status, { ...CORS, 'Content-Type': 'application/json' });
    res.end(result.body);
  } catch (err) {
    console.error('Error:', err.message);
    res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }

}).listen(PORT, () => {
  console.log(`\n✅ FluxAI Railway Proxy — port ${PORT}`);
  console.log(`   POST /api/gpt-image — GPT Image 1.5 edits\n`);
});
