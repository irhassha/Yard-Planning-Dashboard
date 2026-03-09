/**
 * Simple backend proxy for Gemini API.
 *
 * Run:
 *   GEMINI_API_KEY=your_key node ai-proxy-server.js
 */
const http = require('http');

const PORT = process.env.PORT || 8787;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (req.method !== 'POST' || req.url !== '/api/ai/chat') {
    return sendJson(res, 404, { error: 'Not Found' });
  }

  if (!GEMINI_API_KEY) {
    return sendJson(res, 500, { error: 'Server missing GEMINI_API_KEY environment variable.' });
  }

  try {
    const raw = await readBody(req);
    const payload = JSON.parse(raw || '{}');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    if (!upstream.ok) {
      return sendJson(res, upstream.status, {
        error: 'Gemini upstream error',
        details: parsed
      });
    }

    return sendJson(res, 200, parsed);
  } catch (err) {
    return sendJson(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`AI proxy listening on http://localhost:${PORT}`);
});
