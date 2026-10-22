const fs = require('fs');
const path = require('path');
const { authorize, keep, writeJSON, sendErr, send } = require('./_lib');

module.exports = async (req, res) => {
  const b = req.method === 'POST' ? (req.body || {}) : req.query;
  try {
    const v = await authorize(b.code, b.device, { req });
    if (v.err) return sendErr(res, v.err);
    try {
      const r = v.rec;
      r.downloads = (r.downloads || 0) + 1;
      r.downloadLog = Array.isArray(r.downloadLog) ? r.downloadLog : [];
      keep(r.downloadLog, { t: new Date().toISOString(), label: v.label || '?', dev: String(v.device).slice(0, 6) }, 10);
      await writeJSON('codes/' + v.code + '.json', r);
    } catch (e) { console.error(e); }
    const file = path.join(process.cwd(), 'data', 'carpeta-estudio.zip');
    const buf = fs.readFileSync(file);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="carpeta-estudio-edg.zip"');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buf);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
};
