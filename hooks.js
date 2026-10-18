// Claude Code <-> Duddy. A localhost-only server that duddy-relay.js talks to, plus install/remove of the hook entries.
// Rule: nothing is ever allowed without a human click. No click (or Duddy closed) = silence, and Claude asks in its own terminal as usual.
const http = require('http'), crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const { app, dialog } = require('electron');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const RELAY = path.join(__dirname, 'duddy-relay.js').replace(/\\/g, '/');
const MARKER = 'duddy-relay';
const EVENTS = [['PermissionRequest', 120], ['Notification', 10], ['Stop', 10]]; // [event, hook timeout in seconds]
const reply = (behavior, extra) => JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior, ...extra } } });
const VERBS = { Bash: 'Run a command', Edit: 'Edit a file', MultiEdit: 'Edit a file', Write: 'Write a file', Read: 'Read a file', WebFetch: 'Open a web page', WebSearch: 'Search the web' };

// installed app: Duddy.exe itself runs the relay as plain Node, so nothing else has to be installed. From source: node.
const runner = () => (app.isPackaged ? `ELECTRON_RUN_AS_NODE=1 '${process.execPath.split(path.sep).join('/')}'` : 'node');

const pending = new Map();
let nextId = 1, token = '', send = () => {};

function onPermission(j, res) {
  if (j.tool_name === 'AskUserQuestion') { send('note', { kind: 'ask', cwd: j.cwd }); return res.end(); } // questions are answered in the terminal
  const id = nextId++, input = j.tool_input || {};
  const timer = setTimeout(() => decide(id, null), 110000); // nobody clicked: fall back to the terminal prompt
  pending.set(id, { res, timer });
  res.on('close', () => { // answered in the terminal first (Claude kills the relay): drop the card
    if (pending.delete(id)) { clearTimeout(timer); send('perm-gone', id); }
  });
  send('perm', {
    id, verb: VERBS[j.tool_name] || j.tool_name || 'Use a tool', tool: j.tool_name,
    detail: String(input.command || input.file_path || input.url || input.query || input.pattern || JSON.stringify(input)).slice(0, 400),
    project: j.cwd ? path.basename(j.cwd) : '',
  });
}

function decide(id, d) {
  const p = pending.get(id); if (!p) return;
  pending.delete(id); clearTimeout(p.timer);
  p.res.end(d === 'allow' ? reply('allow') : d === 'deny' ? reply('deny', { message: 'Denied from Duddy' }) : '');
}

function start(sendFn) {
  send = (ch, ...a) => sendFn(ch, ...a);
  token = crypto.randomBytes(16).toString('hex');
  const srv = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.headers['x-duddy'] !== token) { res.writeHead(403); return res.end(); }
    const event = new URL(req.url, 'http://x').searchParams.get('event');
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 2e6) req.destroy(); });
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(body); } catch {}
      res.setHeader('content-type', 'application/json');
      if (event === 'PermissionRequest') return onPermission(j, res);
      if (event === 'Notification') send('note', { kind: 'notify', text: j.message || 'Claude needs your attention', cwd: j.cwd });
      if (event === 'Stop') send('note', { kind: 'stop', cwd: j.cwd });
      res.end();
    });
  });
  srv.listen(0, '127.0.0.1', () => { // random port, rewritten on every start
    const dir = path.join(app.getPath('appData'), 'Duddy'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'hook.json'), JSON.stringify({ port: srv.address().port, token }));
  });
  app.on('will-quit', () => { try { fs.rmSync(path.join(app.getPath('appData'), 'Duddy', 'hook.json')); } catch {} });
}

// ---------- install / remove (explicit click, backup first, other people's hooks untouched) ----------
const ours = (entry) => (entry.hooks || []).some((h) => String(h.command || '').includes(MARKER));
function read() {
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw new Error('Your Claude settings.json is not valid JSON, so Duddy did not touch it.');
  }
}
const installed = () => { try { return Object.values(read().hooks || {}).flat().some(ours); } catch { return false; } };

async function toggle(win) {
  const data = read(), on = installed();
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: [on ? 'Remove' : 'Connect', 'Cancel'], defaultId: 1, cancelId: 1,
    message: on ? 'Disconnect Duddy from Claude Code?' : 'Let Duddy show Claude Code permission requests?',
    detail: on ? `Removes Duddy's 3 hook entries from\n${SETTINGS}\nOther hooks are left alone.`
      : `Adds 3 hook entries (PermissionRequest, Notification, Stop) to\n${SETTINGS}\n\nA backup is saved next to it first. Claude Code keeps working normally when Duddy is closed, and nothing is ever allowed without your click.`,
  });
  if (response !== 0) return on;
  const hooks = data.hooks ?? {};
  if (typeof hooks !== 'object' || Array.isArray(hooks)) throw new Error('"hooks" in settings.json has an unexpected shape, so Duddy did not touch it.');
  for (const [ev, timeout] of EVENTS) {
    if (hooks[ev] !== undefined && !Array.isArray(hooks[ev])) throw new Error(`"hooks.${ev}" has an unexpected shape, so Duddy did not touch it.`);
    const list = (hooks[ev] || []).filter((e) => !ours(e));
    if (!on) list.push({ hooks: [{ type: 'command', command: `${runner()} '${RELAY.replace(/'/g, `'\\''`)}' ${ev}`, timeout }] });
    if (list.length) hooks[ev] = list; else delete hooks[ev];
  }
  if (Object.keys(hooks).length) data.hooks = hooks; else delete data.hooks;
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, `${SETTINGS}.duddy-backup-${Date.now()}`);
  fs.writeFileSync(SETTINGS, JSON.stringify(data, null, 2) + '\n');
  return !on;
}

module.exports = { start, decide, toggle, installed };
