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

const MAX_DEVICES = Math.max(1, parseInt(process.env.MAX_DEVICES, 10) || 2);

// Valida el código y registra el dispositivo. Devuelve { code, rec } o { err }.
async function authorize(raw, device, touch) {
  const code = normCode(raw);
  if (!code) return { err: 'invalid_code' };
  const rec = await readJSON('codes/' + code + '.json');
  if (!rec || rec.active === false) return { err: 'invalid_code' };
  const dev = String(device || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(dev)) return { err: 'bad_device' };
  rec.devices = Array.isArray(rec.devices) ? rec.devices : [];
  const now = new Date().toISOString();
  const known = rec.devices.find(x => x.id === dev);
  if (!known) {
    if (rec.devices.length >= MAX_DEVICES) return { err: 'device_limit', max: MAX_DEVICES };
    rec.devices.push({ id: dev, first: now, last: now });
    rec.firstUse = rec.firstUse || now;
    await writeJSON('codes/' + code + '.json', rec);
  } else if (touch && Date.now() - Date.parse(known.last || 0) > 3600 * 1000) {
    known.last = now;
    await writeJSON('codes/' + code + '.json', rec);
  }
  return { code, rec };
}
const ERR_STATUS = { invalid_code: 401, device_limit: 403, bad_device: 400 };
function sendErr(res, err, extra) {
  send(res, ERR_STATUS[err] || 400, Object.assign({ error: err }, extra || {}));
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

module.exports = { get, put, list, readJSON, writeJSON, authorize, sendErr, MAX_DEVICES, normCode, newCode, safeEqual, send };
