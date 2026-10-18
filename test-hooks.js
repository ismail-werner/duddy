// Standalone check of hooks.js + duddy-relay.js with a mocked electron (never touches the real settings.json)
const Module = require('module'), os = require('os'), fs = require('fs'), path = require('path'), assert = require('assert');
const { spawn } = require('child_process');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duddy-test-'));
const origLoad = Module._load;
Module._load = function (req, ...a) {
  if (req === 'electron') return { app: { getPath: () => tmp, on() {} }, dialog: {} };
  return origLoad.call(this, req, ...a);
};
const proj = __dirname.split(path.sep).join('/') + '/';
const hooks = require(proj + 'hooks.js');
const events = [];
hooks.start((ch, ...a) => events.push([ch, ...a]));

const relay = (event, input) => new Promise((resolve) => {
  const c = spawn('node', [proj + 'duddy-relay.js', event], { env: { ...process.env, APPDATA: tmp } });
  let out = ''; c.stdout.on('data', (d) => { out += d; }); c.on('close', () => resolve(out)); c.stdin.end(JSON.stringify(input));
  relay.last = c;
});
const waitFor = async (fn) => { for (let i = 0; i < 100; i++) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 50)); } throw new Error('timeout'); };

(async () => {
  await waitFor(() => fs.existsSync(path.join(tmp, 'Duddy', 'hook.json')));
  // allow
  let p = relay('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'npm test' }, cwd: 'C:/x/proj' });
  let e = await waitFor(() => events.find((x) => x[0] === 'perm'));
  assert.equal(e[1].verb, 'Run a command'); assert.equal(e[1].detail, 'npm test'); assert.equal(e[1].project, 'proj');
  hooks.decide(e[1].id, 'allow');
  assert.equal(JSON.parse(await p).hookSpecificOutput.decision.behavior, 'allow');
  // deny
  events.length = 0;
  p = relay('PermissionRequest', { tool_name: 'Edit', tool_input: { file_path: 'a.js' } });
  e = await waitFor(() => events.find((x) => x[0] === 'perm'));
  hooks.decide(e[1].id, 'deny');
  assert.equal(JSON.parse(await p).hookSpecificOutput.decision.behavior, 'deny');
  // terminal answered first: relay killed -> card disappears
  events.length = 0;
  p = relay('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  e = await waitFor(() => events.find((x) => x[0] === 'perm'));
  relay.last.kill(); await p;
  await waitFor(() => events.find((x) => x[0] === 'perm-gone' && x[1] === e[1].id));
  // stop notification, and wrong token is refused
  assert.equal(await relay('Stop', { cwd: 'C:/x/proj' }), '');
  assert(events.find((x) => x[0] === 'note' && x[1].kind === 'stop'));
  const cfg = JSON.parse(fs.readFileSync(path.join(tmp, 'Duddy', 'hook.json')));
  const bad = await fetch(`http://127.0.0.1:${cfg.port}/hook?event=Stop`, { method: 'POST', headers: { 'x-duddy': 'nope' }, body: '{}' });
  assert.equal(bad.status, 403);
  // Duddy not running: relay stays silent
  fs.rmSync(path.join(tmp, 'Duddy', 'hook.json'));
  assert.equal(await relay('PermissionRequest', { tool_name: 'Bash' }), '');
  console.log('all hook checks passed');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
