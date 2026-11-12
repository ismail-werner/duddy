// Long-lived PowerShell helpers. Each one only runs while it is needed:
//   audio worker  - volume, brightness, per-app volume; started on first use, stopped after 90 s without a command
//   notify worker - Windows notifications; runs only while "Windows notifications" is switched on in Settings
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const { app } = require('electron');

const run = (file, stdin) => spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, file)],
  { windowsHide: true, stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'ignore'] });
const lines = (stream, fn) => {
  let b = '';
  stream.setEncoding('utf8').on('data', (d) => { b += d; for (let i; (i = b.indexOf('\n')) >= 0;) { const l = b.slice(0, i).trim(); b = b.slice(i + 1); if (l) fn(l); } });
};

// ---- small prefs file the main process owns (things that must work before any window exists) ----
const prefsFile = () => path.join(app.getPath('appData'), 'Duddy', 'prefs.json');
const getPrefs = () => { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch { return {}; } };
const setPref = (k, v) => { fs.mkdirSync(path.dirname(prefsFile()), { recursive: true }); fs.writeFileSync(prefsFile(), JSON.stringify({ ...getPrefs(), [k]: v })); };

// ---- audio ----
const AUDIO_OK = /^(get|mute|vol \d{1,3}|bright \d{1,3}|app \d+ \d{1,3}|appmute \d+)$/; // renderer input is never passed through unchecked
let aw = null, waiting = [], idleT;
function audio(cmd) {
  if (!AUDIO_OK.test(cmd)) return Promise.resolve({ error: 'bad command' });
  if (!aw) {
    const w = aw = run('audio-worker.ps1', true);
    lines(w.stdout, (l) => { const r = waiting.shift(); if (r) { try { r(JSON.parse(l)); } catch { r({ error: 'bad reply' }); } } });
    w.on('exit', () => { if (aw === w) aw = null; for (const r of waiting.splice(0)) r({ error: 'audio helper stopped' }); });
    w.stdin.on('error', () => {});
  }
  clearTimeout(idleT); idleT = setTimeout(() => aw && aw.kill(), 90000);
  return new Promise((res) => { waiting.push(res); aw.stdin.write(cmd + '\n'); });
}

// ---- notifications ----
let nw = null;
function notifStart(send) {
  if (nw) return;
  const w = nw = run('notify-worker.ps1', false);
  lines(w.stdout, (l) => { try { send('notif', JSON.parse(l)); } catch {} });
  w.on('exit', () => { if (nw === w) nw = null; });
}
const notifStop = () => { if (nw) nw.kill(); nw = null; };

const stopAll = () => { notifStop(); if (aw) aw.kill(); };
module.exports = { audio, notifStart, notifStop, stopAll, getPrefs, setPref };
