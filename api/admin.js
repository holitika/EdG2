const { list, readJSON, writeJSON, newCode, normCode, safeEqual, send, MAX_DEVICES } = require('./_lib');

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
        const devs = Array.isArray(rec.devices) ? rec.devices : [];
        const lastSeen = devs.reduce((a, d) => (d.last > a ? d.last : a), '');
        return {
          code, active: rec.active !== false, note: rec.note || '', created: rec.created || '', firstUse: rec.firstUse || '',
          devices: devs.length, max: MAX_DEVICES, lastSeen,
          devList: devs.map(d => ({ id: String(d.id).slice(0, 6), fid: String(d.id), label: d.label || '?', first: d.first || '', last: d.last || '' })),
          blocked: rec.blocked || 0, blockedLog: Array.isArray(rec.blockedLog) ? rec.blockedLog : [],
          resets: rec.resets || 0, lastReset: rec.lastReset || '', kicks: rec.kicks || 0,
          downloads: rec.downloads || 0, downloadLog: Array.isArray(rec.downloadLog) ? rec.downloadLog : [],
        };
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
    if (b.action === 'kick_device') {
      const code = normCode(b.code);
      if (!code) return send(res, 400, { error: 'bad_code' });
      const rec = await readJSON('codes/' + code + '.json');
      if (!rec) return send(res, 404, { error: 'not_found' });
      const dev = String(b.device || '');
      const devs = Array.isArray(rec.devices) ? rec.devices : [];
      if (!devs.some(d => d.id === dev)) return send(res, 404, { error: 'device_not_found' });
      rec.devices = devs.filter(d => d.id !== dev);
      rec.kicked = (Array.isArray(rec.kicked) ? rec.kicked : []).concat(dev).slice(-50);
      rec.kicks = (rec.kicks || 0) + 1;
      rec.lastKick = new Date().toISOString();
      await writeJSON('codes/' + code + '.json', rec);
      return send(res, 200, { ok: true });
    }
    if (b.action === 'reset_devices') {
      const code = normCode(b.code);
      if (!code) return send(res, 400, { error: 'bad_code' });
      const rec = await readJSON('codes/' + code + '.json');
      if (!rec) return send(res, 404, { error: 'not_found' });
      rec.devices = [];
      rec.resets = (rec.resets || 0) + 1;
      rec.lastReset = new Date().toISOString();
      await writeJSON('codes/' + code + '.json', rec);
      return send(res, 200, { ok: true });
    }
    send(res, 400, { error: 'action' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
};
