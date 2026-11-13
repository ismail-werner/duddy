// Long-lived PowerShell helpers. Each one only runs while it is needed:
//   audio worker  - volume, brightness, per-app volume; started on first use, stopped after 90 s without a command
//   notify worker - Windows notifications; runs only while "Windows notifications" is switched on in Settings
const { spawn } = require('child_process');
const path = require('path'), fs = require('fs');
const { app } = require('electron');

const run = (file, stdin) => spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, file), '-Parent', String(process.pid)],
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

// ---- media: one long-lived watcher pushes now-playing changes; commands go back in ----
let mw = null, mlast = { none: true }, mwait = [];
function mediaStart(send) {
  if (mw) return;
  const w = mw = run('media-worker.ps1', true);
  lines(w.stdout, (l) => {
    try { const m = JSON.parse(l); if (m.type === 'state') { mlast = m; mwait.splice(0).forEach((r) => r(m)); } send('media', m); } catch {}
  });
  w.on('exit', () => { if (mw === w) { mw = null; mlast = { none: true }; send('media', { type: 'state', none: true }); } });
  w.stdin.on('error', () => {});
}
const mediaStop = () => { if (mw) mw.kill(); mw = null; };
const MEDIA_OK = /^(play|next|prev|seek:\d{1,6})$/; // renderer input is never passed through unchecked
const mediaCmd = (c) => { if (!mw || !MEDIA_OK.test(c)) return false; mw.stdin.write(c + '\n'); return true; };
async function mediaTool(action) { // for the chat's media_control tool
  if (action === 'info') return mlast;
  if (!mediaCmd(action)) return { error: 'The music helper is off. Turn on "Music in the pill" in Settings.' };
  return Promise.race([new Promise((r) => mwait.push(r)), new Promise((r) => setTimeout(() => r(mlast), 3000))]);
}

// ---- system events (volume, brightness, Caps Lock, language, headphones): runs only while "Key overlays" is on ----
let kw = null;
function keysStart(send) {
  if (kw) return;
  const w = kw = run('keys-worker.ps1', false);
  lines(w.stdout, (l) => { try { send('sys', JSON.parse(l)); } catch {} });
  w.on('exit', () => { if (kw === w) kw = null; });
}
const keysStop = () => { if (kw) kw.kill(); kw = null; };

// compile the COM bridges in the background once (one after the other), so the first visit to the Sound tab doesn't stall the animations
const warmOne = (file) => new Promise((res) => spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, file), '-Warm'], { windowsHide: true, stdio: 'ignore' }).on('error', res).on('exit', res));
const warm = () => warmOne('audio-worker.ps1').then(() => warmOne('keys-worker.ps1'));

const stopAll = () => { notifStop(); mediaStop(); keysStop(); if (aw) aw.kill(); };
module.exports = { audio, notifStart, notifStop, mediaStart, mediaStop, mediaCmd, mediaTool, keysStart, keysStop, warm, stopAll, getPrefs, setPref };
