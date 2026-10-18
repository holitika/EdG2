const { readJSON, authorize, sendErr, MAX_DEVICES, send } = require('./_lib');
const fs = require('fs');
const path = require('path');
const template = require('../data/template.json');
let prompt = '';
try { prompt = fs.readFileSync(path.join(process.cwd(), 'data', 'prompt_inicio.md'), 'utf8'); } catch (e) { prompt = ''; }

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  try {
    const b = req.body || {};
    const v = await authorize(b.code, b.device, true);
    if (v.err) return sendErr(res, v.err, { max: MAX_DEVICES });
    const [config, classes, exams, tasks] = await Promise.all([
      readJSON('users/' + v.code + '/config.json'),
      readJSON('users/' + v.code + '/classes.json'),
      readJSON('users/' + v.code + '/exams.json'),
      readJSON('users/' + v.code + '/tasks.json'),
    ]);
    send(res, 200, {
      code: v.code,
      config: config || null,
      state: { classes: classes || {}, exams: exams || {}, tasks: tasks || {} },
      template,
      prompt,
    });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server' });
  }
};
