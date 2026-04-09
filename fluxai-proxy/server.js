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

// Download image from URL as buffer
function fetchImageBuffer(imageUrl) {
  return new Promise((resolve, reject) => {
    const mod = imageUrl.startsWith('https') ? https : http;
    mod.get(imageUrl, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), type: res.headers['content-type'] || 'image/jpeg' }));
    }).on('error', reject);
  });
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
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function callOpenAI(authHeader, prompt, imageBuffer, imageType, imgSize, quality) {
  const { body, contentType } = buildMultipart(
    { model: 'gpt-image-1', prompt, n: '1', size: imgSize || '1024x1024', quality: quality || 'high' },
    [{ name: 'image', filename: 'product.png', type: 'image/png', data: imageBuffer }]
  );

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/images/edits',
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': contentType, 'Content-Length': body.length },
      timeout: 180000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('OpenAI timeout after 180s')); });
    req.write(body);
    req.end();
  });
}

http.createServer(async (req, res) => {
  console.log(`${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.method === 'GET') { sendJSON(res, 200, { status: 'ok', service: 'FluxAI Railway Proxy' }); return; }
  if (req.url !== '/api/gpt-image') { sendJSON(res, 404, { error: 'Not found' }); return; }

  // Read body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  console.log(`Body received: ${rawBody.length} chars`);

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch(e) { console.error('JSON error:', e.message); sendJSON(res, 400, { error: 'JSON invalide' }); return; }

  const authHeader = req.headers['authorization'];
  if (!authHeader) { sendJSON(res, 401, { error: 'Authorization manquant' }); return; }

  const { prompt, imageUrl, image, size, quality } = payload;
  if (!prompt) { sendJSON(res, 400, { error: 'prompt manquant' }); return; }

  try {
    let imageBuffer, imageType;

    if (imageUrl) {
      // Fetch image from URL server-side
      console.log(`Fetching image from URL: ${imageUrl.substring(0, 80)}`);
      const fetched = await fetchImageBuffer(imageUrl);
      imageBuffer = fetched.buffer;
      imageType = fetched.type;
      console.log(`Image fetched: ${imageBuffer.length} bytes`);
    } else if (image) {
      // base64 fallback
      const base64 = image.replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64, 'base64');
      imageType = 'image/png';
      console.log(`Image from base64: ${imageBuffer.length} bytes`);
    } else {
      sendJSON(res, 400, { error: 'imageUrl ou image manquant' }); return;
    }

    console.log(`Calling OpenAI gpt-image-1 edits — prompt: ${prompt.substring(0, 80)}…`);
    const result = await callOpenAI(authHeader, prompt, imageBuffer, imageType, size, quality);
    console.log(`OpenAI responded: ${result.status}`);

    res.writeHead(result.status, { ...CORS, 'Content-Type': 'application/json' });
    res.end(result.body);

  } catch(err) {
    console.error('Error:', err.message);
    sendJSON(res, 502, { error: err.message });
  }

}).listen(PORT, () => {
  console.log(`✅ FluxAI Railway Proxy — port ${PORT}`);
  console.log(`   POST /api/gpt-image — imageUrl ou base64`);
});
