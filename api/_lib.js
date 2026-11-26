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

const MAX_DEVICES = Math.max(1, parseInt(process.env.MAX_DEVICES, 10) || 1);

// Etiqueta general del aparato (sistema + navegador). No guarda IP ni ubicación.
function uaLabel(req) {
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  let os = 'Otro';
  if (/iPhone/i.test(ua)) os = 'iPhone';
  else if (/iPad/i.test(ua)) os = 'iPad';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'Mac';
  else if (/Linux|CrOS/i.test(ua)) os = 'Linux';
  let br = 'Otro';
  if (/Edg\//i.test(ua)) br = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) br = 'Opera';
  else if (/Firefox|FxiOS/i.test(ua)) br = 'Firefox';
  else if (/Chrome|CriOS/i.test(ua)) br = 'Chrome';
  else if (/Safari/i.test(ua)) br = 'Safari';
  return os + ' · ' + br;
}
const keep = (arr, item, n) => { arr.push(item); while (arr.length > n) arr.shift(); };

// Valida el código y registra el dispositivo. Devuelve { code, rec } o { err }.
// opts: { touch, req, countBlock }
async function authorize(raw, device, opts) {
  opts = opts || {};
  const code = normCode(raw);
  if (!code) return { err: 'invalid_code' };
  const rec = await readJSON('codes/' + code + '.json');
  if (!rec || rec.active === false) return { err: 'invalid_code' };
  const dev = String(device || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(dev)) return { err: 'bad_device' };
  rec.devices = Array.isArray(rec.devices) ? rec.devices : [];
  if (Array.isArray(rec.kicked) && rec.kicked.includes(dev)) return { err: 'session_closed' };
  const now = new Date().toISOString();
  const label = opts.req ? uaLabel(opts.req) : '';
  const known = rec.devices.find(x => x.id === dev);
  if (!known) {
    if (rec.devices.length >= MAX_DEVICES) {
      if (opts.countBlock) {
        rec.blocked = (rec.blocked || 0) + 1;
        rec.blockedLog = Array.isArray(rec.blockedLog) ? rec.blockedLog : [];
        keep(rec.blockedLog, { t: now, label: label || '?' }, 5);
        await writeJSON('codes/' + code + '.json', rec);
      }
      return { err: 'device_limit', max: MAX_DEVICES };
    }
    rec.devices.push({ id: dev, first: now, last: now, label: label || '?' });
    rec.firstUse = rec.firstUse || now;
    await writeJSON('codes/' + code + '.json', rec);
  } else if (opts.touch && Date.now() - Date.parse(known.last || 0) > 3600 * 1000) {
    known.last = now;
    if (label) known.label = label;
    await writeJSON('codes/' + code + '.json', rec);
  }
  return { code, rec, label, device: dev };
}
const ERR_STATUS = { invalid_code: 401, session_closed: 401, device_limit: 403, bad_device: 400 };
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

module.exports = { get, put, list, readJSON, writeJSON, authorize, uaLabel, keep, sendErr, MAX_DEVICES, normCode, newCode, safeEqual, send };
