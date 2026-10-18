const fs = require('fs');
const path = require('path');
const { getValidCode, send } = require('./_lib');

module.exports = async (req, res) => {
  const code = req.method === 'POST' ? (req.body || {}).code : req.query.code;
  try {
    const v = await getValidCode(code);
    if (!v) return send(res, 401, { error: 'invalid_code' });
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
