const { get, put, list } = require('@vercel/blob');
const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L

function normCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = s.startsWith('EDG') ? s.slice(3) : s;
  if (!/^[A-Z0-9]{8}$/.test(body)) return null;
  return 'EDG-' + body.slice(0, 4) + '-' + body.slice(4);
}
function newCode() {
  let b = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) b += ALPHABET[bytes[i] % ALPHABET.length];
  return 'EDG-' + b.slice(0, 4) + '-' + b.slice(4);
}

async function readJSON(pathname) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  const text = await new Response(r.stream).text();
  try { return JSON.parse(text); } catch (e) { return null; }
}
async function writeJSON(pathname, obj) {
  await put(pathname, JSON.stringify(obj), {
    access: 'private',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
}

async function getValidCode(raw) {
  const code = normCode(raw);
  if (!code) return null;
  const rec = await readJSON('codes/' + code + '.json');
  if (!rec || rec.active === false) return null;
  return { code, rec };
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')); const y = Buffer.from(String(b || ''));
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

module.exports = { get, put, list, readJSON, writeJSON, getValidCode, normCode, newCode, safeEqual, send };
