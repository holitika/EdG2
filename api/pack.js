const fs = require('fs');
const path = require('path');
const { authorize, sendErr, send } = require('./_lib');

module.exports = async (req, res) => {
  const b = req.method === 'POST' ? (req.body || {}) : req.query;
  try {
    const v = await authorize(b.code, b.device, false);
    if (v.err) return sendErr(res, v.err);
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
