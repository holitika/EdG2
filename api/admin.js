const { list, readJSON, writeJSON, newCode, normCode, safeEqual, send } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !safeEqual(req.headers['x-admin-token'], expected)) return send(res, 401, { error: 'unauthorized' });
  try {
    const b = req.body || {};
    if (b.action === 'create') {
      const n = Math.max(1, Math.min(50, parseInt(b.n, 10) || 1));
      const note = String(b.note || '').slice(0, 80);
      const out = [];
      for (let i = 0; i < n; i++) {
        const code = newCode();
        await writeJSON('codes/' + code + '.json', { active: true, note, created: new Date().toISOString() });
        out.push(code);
      }
      return send(res, 200, { codes: out });
    }
    if (b.action === 'list') {
      const r = await list({ prefix: 'codes/', limit: 1000 });
      const rows = await Promise.all(r.blobs.map(async x => {
        const code = x.pathname.replace('codes/', '').replace('.json', '');
        const rec = await readJSON(x.pathname) || {};
        return { code, active: rec.active !== false, note: rec.note || '', created: rec.created || '', firstUse: rec.firstUse || '' };
      }));
      rows.sort((a, c) => (c.created || '').localeCompare(a.created || ''));
      return send(res, 200, { rows });
    }
    if (b.action === 'revoke' || b.action === 'restore') {
      const code = normCode(b.code);
      if (!code) return send(res, 400, { error: 'bad_code' });
      const rec = await readJSON('codes/' + code + '.json');
      if (!rec) return send(res, 404, { error: 'not_found' });
      rec.active = b.action === 'restore';
      await writeJSON('codes/' + code + '.json', rec);
      return send(res, 200, { ok: true });
    }
    send(res, 400, { error: 'action' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
};
