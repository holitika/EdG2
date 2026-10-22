const { writeJSON, authorize, sendErr, send } = require('./_lib');

const KEYS = ['classes', 'exams', 'tasks'];
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function cleanConfig(c) {
  if (!c || typeof c !== 'object') return null;
  if (!isDate(c.start) || !isDate(c.exam)) return null;
  const days = Array.isArray(c.days) ? c.days.filter(n => Number.isInteger(n) && n >= 0 && n <= 6) : [1, 2, 3, 4, 5];
  const breaks = Array.isArray(c.breaks) ? c.breaks.filter(b => b && isDate(b.from) && isDate(b.to)).slice(0, 12).map(b => ({ from: b.from, to: b.to, label: String(b.label || '').slice(0, 40) })) : [];
  const rec = Number.isInteger(c.recovery) && c.recovery >= 0 && c.recovery <= 6 && !days.includes(c.recovery) ? c.recovery : null;
  return { start: c.start, exam: c.exam, days: [...new Set(days)], breaks, recovery: rec, name: String(c.name || '').slice(0, 40) };
}
function cleanMap(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const out = {}; let n = 0;
  for (const k of Object.keys(m)) {
    if (k.length > 60) continue;
    const v = m[k];
    if (v === true || (Number.isInteger(v) && v >= 0 && v <= 3)) { out[k] = v; if (++n > 2000) break; }
  }
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const body = req.body || {};
    const v = await authorize(body.code, body.device, {});
    if (v.err) return sendErr(res, v.err);
    const writes = [];
    if (body.config !== undefined) {
      const c = cleanConfig(body.config);
      if (!c) return send(res, 400, { error: 'bad_config' });
      writes.push(writeJSON('users/' + v.code + '/config.json', c));
    }
    for (const k of KEYS) {
      if (body[k] === undefined) continue;
      const m = cleanMap(body[k]);
      if (!m) return send(res, 400, { error: 'bad_' + k });
      writes.push(writeJSON('users/' + v.code + '/' + k + '.json', m));
    }
    await Promise.all(writes);
    send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
};
