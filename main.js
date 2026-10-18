const { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut } = require('electron');
const { execFile, exec, spawn } = require('child_process');
const fs = require('fs');
const claudeHooks = require('./hooks');
const os = require('os');
const path = require('path');

// GEMINI_API_KEY lives in .env: next to the app when run from source, or in %APPDATA%Duddy.env for the installed app
for (const f of [path.join(app.getPath('appData'), 'Duddy', '.env'), path.join(__dirname, '.env')]) { try { process.loadEnvFile(f); } catch {} }
if (!app.requestSingleInstanceLock()) app.quit(); // never run two copies

app.commandLine.appendSwitch('js-flags', '--max-old-space-size=96');
app.commandLine.appendSwitch('disable-features', 'Translate,MediaRouter,OptimizationHints,AutofillServerCommunication');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // Duddy's little sounds play on hover

// fastest first; a busy model (503/429) or retired one (404) falls through to the next
const MODELS = [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash-lite'].filter(Boolean))];
const W = 720, H = 320;
const loginOpts = { path: process.execPath, args: app.isPackaged ? [] : [__dirname] }; // installed Duddy.exe starts by itself; from source Electron needs the folder
let win;

const send = (ch, ...a) => win && !win.isDestroyed() && win.webContents.send(ch, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ps = (cmd) => new Promise((res) =>
  execFile('powershell', ['-NoProfile', '-Command', cmd], { timeout: 30000, maxBuffer: 1e7, windowsHide: true },
    (e, out, err) => res((out + (err || '')).trim() || (e ? String(e) : '(no output)'))));
const gb = (n) => (n / 1073741824).toFixed(1) + ' GB';

// ---------- laptop tools ----------
let prevCpu = null; // cpu delta since the last call: no timers, only runs while the island is open
function stats() {
  const c = os.cpus().reduce((a, x) => [a[0] + Object.values(x.times).reduce((p, q) => p + q, 0), a[1] + x.times.idle], [0, 0]);
  const cpu = prevCpu ? Math.round(100 * (1 - (c[1] - prevCpu[1]) / (c[0] - prevCpu[0]))) : 0;
  prevCpu = c;
  return { cpu, ram: Math.round(100 * (1 - os.freemem() / os.totalmem())) };
}

async function disks() {
  const raw = await ps('Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select DeviceID,Size,FreeSpace | ConvertTo-Json -Compress');
  try {
    return [].concat(JSON.parse(raw)).map((d) =>
      `${d.DeviceID} ${gb(d.Size - d.FreeSpace)} used / ${gb(d.Size)} (${gb(d.FreeSpace)} free)`).join('\n');
  } catch { return raw; }
}

// Spotify (or whatever is playing) through Windows' media session: see media.ps1
const media = (a) => new Promise((res) =>
  execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'media.ps1'), a],
    { timeout: 15000, maxBuffer: 1e7, windowsHide: true }, (e, out) => { try { res(JSON.parse(out)); } catch { res({ none: true }); } }));

const procs = () => ps('Get-Process | Sort WS -Desc | Select -First 8 | ForEach-Object { "{0,-24}{1,7} MB" -f $_.Name, [int]($_.WS/1MB) }');

async function health() {
  stats(); await sleep(400); const cpu = stats().cpu; // two samples = a real reading
  const total = os.totalmem(), used = total - os.freemem();
  const [bat, top, d] = await Promise.all([
    ps('$b = Get-CimInstance Win32_Battery; if ($b) { "$($b.EstimatedChargeRemaining)% " + $(if ($b.BatteryStatus -eq 2) { "(charging)" } else { "(on battery)" }) } else { "no battery" }'),
    procs(), disks(),
  ]);
  return `CPU ${cpu}%   RAM ${gb(used)} / ${gb(total)}\nBattery ${bat}   Uptime ${(os.uptime() / 3600).toFixed(1)} h\n\nDisks\n${d}\n\nTop memory\n${top}`;
}

async function cleanTemp() {
  const old = '$f = Get-ChildItem $env:TEMP -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) };';
  const mb = await ps(old + ' [math]::Round((($f | Measure-Object Length -Sum).Sum) / 1MB)');
  if (!(Number(mb) > 0)) return 'Temp folder is already clean.';
  const { response } = await dialog.showMessageBox(win, {
    type: 'question', buttons: ['Clean', 'Cancel'], defaultId: 1, cancelId: 1,
    message: `Delete ${mb} MB of temp files?`, detail: 'Only files in your Temp folder that are older than 1 day. Files in use are skipped.',
  });
  if (response !== 0) return 'Cancelled, nothing deleted.';
  await ps(old + ' $f | Remove-Item -Force -ErrorAction SilentlyContinue');
  return `Cleaned about ${mb} MB of temp files.`;
}

// ---------- agent: Gemini with tools, streamed, loops until it stops calling them ----------
const noArgs = (name, description) => ({ name, description });
const tools = [{ functionDeclarations: [
  noArgs('system_health', 'CPU, RAM, battery, uptime, disks and top memory processes of this laptop.'),
  noArgs('disk_usage', 'Used/free space per drive.'),
  noArgs('top_processes', 'The 8 processes using the most memory.'),
  noArgs('clean_temp', 'Delete old files from the Temp folder (user must approve).'),
  { name: 'media_control', description: 'Control the music player (Spotify etc.): play = toggle play/pause, next, prev, info = what is playing.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['play', 'next', 'prev', 'info'] } }, required: ['action'] } },
  { name: 'run_powershell', description: 'Run a PowerShell command on the user\'s laptop (user must approve each one).',
    parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
] }];
const impl = {
  media_control: async ({ action }) => JSON.stringify(await media(action)), system_health: health, disk_usage: disks, top_processes: procs, clean_temp: cleanTemp,
  run_powershell: async ({ command }) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Run', 'Deny'], defaultId: 1, cancelId: 1,
      message: 'Duddy wants to run:', detail: command,
    });
    return response === 0 ? ps(command) : 'User denied the command.';
  },
};

async function openStream(history, key) {
  let last;
  for (const model of MODELS) {
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({
          tools, contents: history,
          systemInstruction: { parts: [{ text: 'You are Duddy, a tiny friendly assistant living in a floating island at the top of the user\'s Windows laptop screen. Be concise. Use your tools for anything about the laptop.' }] },
        }),
      });
      if (res.ok) return res;
      last = await res.json().catch(() => ({}));
      if (![429, 503, 404].includes(res.status)) throw new Error(last.error?.message || `HTTP ${res.status}`);
      if (res.status === 404) break; // retired model: next one
      await sleep(500);
    }
  }
  throw new Error(last?.error?.message || 'Every model is busy, try again in a minute.');
}

let history = [];
async function ask(text, files = []) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Put GEMINI_API_KEY=... in the .env file (free key: aistudio.google.com/apikey) and restart.');
  if (text.trim() === '/new') { history = []; return 'New conversation.'; }
  const parts = files.map((f) =>
    f.type.startsWith('image/') || f.type === 'application/pdf'
      ? { inlineData: { mimeType: f.type, data: f.data } }
      : { text: `File ${f.name}:\n${Buffer.from(f.data, 'base64').toString('utf8')}` });
  parts.push({ text });
  // keep memory and tokens small: old attachments become a note, only the last 16 turns are sent
  for (const m of history) m.parts = m.parts.map((p) => (p.inlineData ? { text: '[earlier attachment]' } : p));
  while (history.length > 16 || (history[0] && (history[0].role !== 'user' || !history[0].parts.some((p) => p.text)))) history.shift();
  history.push({ role: 'user', parts });
  const mark = history.length - 1;
  try {
    for (;;) {
      const res = await openStream(history, key);
      const got = [], dec = new TextDecoder(); let buf = '', said = '';
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true }).replace(/\r/g, '');
        for (let i; (i = buf.indexOf('\n\n')) >= 0;) {
          const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data:')); buf = buf.slice(i + 2);
          if (!line) continue;
          for (const p of JSON.parse(line.slice(5)).candidates?.[0]?.content?.parts || []) {
            got.push(p);
            if (p.text) { said += p.text; send('chunk', p.text); }
          }
        }
      }
      if (!got.length) throw new Error('Empty reply (blocked?)');
      history.push({ role: 'model', parts: got });
      const calls = got.filter((p) => p.functionCall);
      if (!calls.length) return said;
      const results = [];
      for (const { functionCall: c } of calls)
        results.push({ functionResponse: { id: c.id, name: c.name, response: { result: String(await impl[c.name](c.args || {})) } } });
      history.push({ role: 'user', parts: results });
    }
  } catch (e) { history.length = mark; throw e; } // failed turn leaves no half-written history
}

// ---------- Claude through the Claude Code CLI: uses your Pro/Max plan, no API key, no API bill ----------
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'haiku'; // haiku = fastest; set CLAUDE_MODEL=sonnet for smarter
const claudeBin = [path.join(os.homedir(), '.local', 'bin', 'claude.exe'), 'claude'].find((p) => p === 'claude' || fs.existsSync(p));
let claudeSid = null;

function askClaude(text, files = []) {
  const dir = path.join(os.tmpdir(), 'duddy-claude'); fs.mkdirSync(dir, { recursive: true });
  let prompt = '', needRead = false;
  for (const f of files) {
    if (f.type.startsWith('image/') || f.type === 'application/pdf') {
      const p = path.join(dir, Date.now() + '-' + f.name.replace(/[^\w.-]/g, '_')); fs.writeFileSync(p, Buffer.from(f.data, 'base64'));
      prompt += `Attached file (read it): ${p}\n`; needRead = true;
    } else prompt += `File ${f.name}:\n${Buffer.from(f.data, 'base64').toString('utf8')}\n\n`;
  }
  prompt += text;
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--model', CLAUDE_MODEL,
    '--tools', needRead ? 'Read' : '', '--settings', '{"disableAllHooks":true}', '--setting-sources', '',
    '--system-prompt', 'You are Duddy, a tiny friendly assistant living in a floating island at the top of the user\'s Windows laptop screen. Be concise.'];
  if (needRead) args.push('--allowedTools', 'Read');
  if (claudeSid) args.push('--resume', claudeSid);
  return new Promise((resolve, reject) => {
    const c = spawn(claudeBin, args, { cwd: dir, windowsHide: true });
    let buf = '', final = null, said = '', err = '';
    const kill = setTimeout(() => c.kill(), 120000);
    c.on('error', () => reject(new Error('Claude Code not found. Install it from claude.com/claude-code, run "claude" once and log in.')));
    c.stderr.on('data', (d) => { err += d; });
    c.stdout.on('data', (d) => {
      buf += d;
      for (let i; (i = buf.indexOf('\n')) >= 0;) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        try {
          const j = JSON.parse(line), t = j.event?.delta?.text;
          if (j.type === 'stream_event' && t) { said += t; send('chunk', t); }
          else if (j.type === 'result') final = j;
        } catch {}
      }
    });
    c.on('close', () => {
      clearTimeout(kill);
      if (!final) return reject(new Error(err.trim().split('\n').pop() || 'Claude did not answer (are you logged in? run "claude" once).'));
      if (final.is_error) return reject(new Error(final.result));
      claudeSid = final.session_id; resolve(final.result || said);
    });
    c.stdin.end(prompt); // via stdin: no command-line length limit, no quoting problems
  });
}

// ---------- window ----------
// Fixed 720x320 panel glued to the top edge. setShape makes everything outside the island
// invisible AND click-through, so no resizing, no mouse-forwarding lag.
function shape(w, h) {
  try { win.setShape([{ x: Math.round((W - w) / 2), y: 0, width: w, height: h }]); } catch {}
}

app.whenReady().then(() => {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: W, height: H, x: Math.round((width - W) / 2), y: 0, show: false,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), spellcheck: false, devTools: false },
  });
  shape(296, 36);
  claudeHooks.start(send);
  win.once('ready-to-show', () => win.show());
  win.loadFile('index.html');
  globalShortcut.register('Control+Alt+Space', () => { win.focus(); send('cmd', 'chat'); });
  globalShortcut.register('Control+Alt+D', () => send('cmd', 'toggle'));
});

ipcMain.on('shape', (_, w, h) => shape(w, h));
ipcMain.on('perm-decision', (_, id, d) => claudeHooks.decide(id, d));
ipcMain.handle('hooks-status', () => claudeHooks.installed());
ipcMain.handle('hooks-toggle', async () => { try { return { on: await claudeHooks.toggle(win) }; } catch (e) { return { error: e.message, on: claudeHooks.installed() }; } });
ipcMain.on('quit', () => app.quit());
ipcMain.handle('ask', async (_, t, f, brain) => {
  try {
    if (t.trim() === '/new') claudeSid = null;
    return await (brain === 'claude' && t.trim() !== '/new' ? askClaude(t, f) : ask(t, f));
  } catch (e) { return 'Error: ' + e.message; }
});
ipcMain.handle('health', health);
ipcMain.handle('disks', disks);
ipcMain.handle('procs', procs);
ipcMain.handle('media', (_, a) => media(a));
ipcMain.handle('clean', cleanTemp);
ipcMain.handle('stats', stats);
ipcMain.handle('terminal', () => exec('start powershell'));
ipcMain.handle('login', () => app.getLoginItemSettings(loginOpts).openAtLogin);
ipcMain.on('set-login', (_, on) => app.setLoginItemSettings({ openAtLogin: on, ...loginOpts }));
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
