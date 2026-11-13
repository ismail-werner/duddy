// outside Electron (plain browser preview) fall back to a stub
const bridge = window.api || { btCmd() {}, onBt(fn) { setTimeout(() => fn({ type: 'list', radio: true, devices: [{ addr: 'A4AC0F7FBDEE', name: 'HUAWEI FreeBuds 5i', connected: true, kind: 'headset', audio: true, battery: 90, muted: false, vol: 70, isDefault: false, hasOutput: true }, { addr: 'F421CA8D7AC4', name: 'Jarvis jr', connected: true, kind: 'phone', audio: false, battery: null, muted: false, vol: null, isDefault: false, hasOutput: false }, { addr: '445ECD59F23C', name: 'Razer Barracuda X (BT)', connected: false, kind: 'headset', audio: true, battery: null, muted: false, vol: null, isDefault: false, hasOutput: false }, { addr: '50EE3222B275', name: 'DualSense Wireless Controller', connected: false, kind: 'gamepad', audio: false, battery: null, muted: false, vol: null, isDefault: false, hasOutput: false }] }), 300); }, onIdle() {}, keysGet: async () => true, keysSet: async (o) => o, onSys() {}, geocode: async () => [{ name: 'Marrakech', admin: 'Marrakech-Safi', country: 'Morocco', lat: 31.63, lon: -8.0 }], lyrics: async () => ({ synced: '[00:01.00] Preview line one\n[00:06.00] Preview line two\n[00:11.00] Preview line three\n[00:16.00] Preview line four\n[00:21.00] Preview line five', plain: '' }), pathOf: (f) => f.name, shelfDrag() {}, shelfOpen() {}, shelfReveal() {}, shelfStat: async (p) => p.map(() => ({})), fileRead: async () => ({ error: 'preview' }), clipGet: async () => true, clipSet: async (o) => o, clipCopy() {}, onClip(fn) { setTimeout(() => fn('Sample copied text from the clipboard'), 500); }, toast() {}, ready() {}, onPerm() {}, onPermGone() {}, onNote() {}, onNotif() {}, decide() {}, shape() {}, terminal() {}, quit() {}, setLogin() {}, onChunk() {}, onCmd() {},
  hooksStatus: async () => false, hooksToggle: async () => ({ on: true }), notifGet: async () => true, notifSet: async (o) => o, getLogin: async () => false,
  ask: async () => 'Preview **mode** reply with `code`.', health: async () => 'CPU 7%  RAM 8.1 GB / 16 GB', disks: async () => 'C: 210 GB used / 476 GB', procs: async () => 'chrome  812 MB',
  onMedia(fn) { setTimeout(() => fn({ type: 'state', title: 'Italiana', artist: 'Severina', app: 'Spotify', playing: true, seek: true, pos: 40, dur: 250 }), 300); }, mediaCmd() {}, mediaGet: async () => true, mediaSet: async (o) => o, clean: async () => 'Temp folder is already clean.',
  stats: async () => ({ cpu: 7, ram: 52 }), audio: async () => ({ vol: 42, mute: false, bright: 70, apps: [{ pid: 1, name: 'brave', vol: 100, mute: false }, { pid: 2, name: 'Spotify', vol: 60, mute: false }] }) };
const $ = (id) => document.getElementById(id);
const island = $('island'), pet = $('pet'), chat = $('chat'), q = $('q'), status = $('status'), svg = pet.firstElementChild;
const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('duddy.' + k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('duddy.' + k, JSON.stringify(v)); } catch {} } };
const cfg = { minimal: store.get('minimal', false), brain: store.get('brain', 'gemini'), hover: store.get('hover', true), sound: store.get('sound', true), body: store.get('body', 0), hat: store.get('hat', ''), accent: store.get('accent', '#ff2d4f') };
let files = [], busy = false, hovering = false, closeT, shrinkT, statsT, idleT, toastT, lastMove = Date.now();
document.documentElement.style.setProperty('--accent', cfg.accent);

/* ---- tiny synthesized sounds (no audio files) ---- */
let ac;
function snd(name) {
  if (!cfg.sound) return;
  const seq = { open: [[520, .07], [780, .09]], done: [[660, .08], [880, .08], [1100, .12]], err: [[240, .16]], poke: [[900, .05], [700, .07]], love: [[880, .08], [1180, .12]], dizzy: [[400, .1], [300, .1], [400, .1]] }[name];
  try {
    ac = ac || new AudioContext(); let t = ac.currentTime;
    for (const [f, d] of seq) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.04, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d); t += d * .85;
    }
  } catch {}
}

/* ---- warm-up: the very first open used to drop frames (Chromium builds layers and glyphs on first use, worst on battery power).
   So at launch, while the window is still fully transparent, play every view once, then reveal the window. ---- */
let warming = true;
async function warmUp() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try { ac = ac || new AudioContext(); } catch {} // creating the audio engine costs a few hundred ms: do it now, not on the first hover
  await bridge.shape(...OPEN); island.classList.add('open', 'warming'); // 'warming' shows staggered tiles at once so every layer gets drawn
  for (const v of ['chat', 'mixer', 'tasks', 'inbox', 'settings', 'music', 'focus', 'shelf', 'today', 'prayer', 'bluetooth', 'home']) { view(v); await wait(130); }
  island.classList.remove('open', 'warming'); await wait(500);
  await bridge.shape(...closedShape());
}

/* ---- idle pill: clock + battery (the battery API is event-driven, nothing polls) ---- */
(function tick() {
  $('clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
})();
navigator.getBattery?.().then((b) => {
  const paint = () => {
    const p = Math.round(b.level * 100);
    $('bat').textContent = p + '%'; $('bat').classList.toggle('chg', b.charging);
    $('rp').style.strokeDasharray = p + ' 100'; $('rn').textContent = p; $('ring').classList.toggle('chg', b.charging); $('ring').classList.toggle('low', !b.charging && p <= 20);
    $('ring').setAttribute('title', p + '%' + (b.charging ? ' (charging)' : ''));
  };
  b.addEventListener('levelchange', paint); b.addEventListener('chargingchange', paint); paint();
});

/* ---- views ---- */
const VIEWS = ['home', 'music', 'chat', 'mixer', 'tasks', 'inbox', 'settings', 'approval', 'focus', 'shelf', 'today', 'prayer', 'bluetooth'];
const VIEW_H = { home: 292, music: 244, chat: 300, mixer: 256, tasks: 290, inbox: 290, settings: 300, approval: 214, focus: 236, shelf: 290, today: 292, prayer: 290, bluetooth: 290 };
const viewHooks = []; // feature files add themselves here: (viewName) => void
let current = 'home';
function view(v) {
  current = v; island.style.setProperty('--h', ((v === 'music' && island.classList.contains('lyrics') ? 290 : VIEW_H[v]) || 214) + 'px');
  for (const n of VIEWS) island.classList.toggle(n, v === n);
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.view === v));
  if (v === 'inbox') { unread = 0; badge(); }
  if (v === 'chat') setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 60);
  syncMedia(); syncMix(); viewHooks.forEach((h) => h(v));
}
document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => view(t.dataset.view); });
$('c-new').onclick = () => { bridge.ask('/new', [], cfg.brain); chat.replaceChildren(); add('bot', 'New chat. What\'s up?'); q.focus(); };
$('quit').onclick = () => bridge.quit();

/* ---- open / close: the window never resizes, only the visible shape does ---- */
const OPEN = [680, 312], CLOSED = [260, 36], CLOSED_P = [332, 36], TOAST = [428, 80]; // CLOSED_P: the wider pill while music plays
const CLOSED_M = [224, 14]; // minimal notch: a thin line, still easy to hover
const closedShape = () => (island.classList.contains('minimal') ? CLOSED_M : island.classList.contains('playing') ? CLOSED_P : CLOSED); // island + the 11px ears + room for the spring overshoot
let opening = false;
async function open() {
  if (island.classList.contains('open') || opening) return;
  window.wake?.(); opening = true; clearTimeout(toastT); clearTimeout(shrinkT); clearTimeout(hudT); island.classList.remove('hud');
  await bridge.shape(...OPEN); // the visible shape must be big enough BEFORE the animation starts, or the first frames get clipped
  opening = false;
  const wasToast = island.classList.contains('toast'); island.classList.remove('toast'); island.classList.add('open');
  if (wasToast) view('inbox');
  snd('open'); mood('happy', 1300); refreshStats();
  statsT = setInterval(refreshStats, 3000); idleT = setInterval(wander, 2200); syncMedia(); syncMix();
}
function close() {
  clearInterval(statsT); clearInterval(idleT); island.classList.remove('open'); syncMedia(); syncMix(); $('wardrobe').classList.remove('show');
  clearTimeout(shrinkT); shrinkT = setTimeout(() => { if (!['open', 'toast', 'hud'].some((c) => island.classList.contains(c))) bridge.shape(...closedShape()); }, 600);
}
const tryClose = () => { if (!hovering && !busy && !perms.length && document.activeElement !== q && document.activeElement !== $('taskadd') && document.activeElement !== $('notes')) close(); };
island.onmouseenter = () => { hovering = true; clearTimeout(closeT); if (cfg.hover) open(); };
island.onmouseleave = () => { hovering = false; closeT = setTimeout(tryClose, 450); };
island.onclick = () => open(); // with "Open on hover" off, click the bar
for (const el of [q, $('taskadd'), $('notes')]) el.onblur = () => { closeT = setTimeout(tryClose, 450); };
q.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { document.activeElement.blur?.(); hovering = false; close(); } });
bridge.onCmd((c) => {
  if (c === 'chat') { open(); view('chat'); setTimeout(() => q.focus(), 250); }
  else if (island.classList.contains('open')) { hovering = false; close(); }
  else { open(); closeT = setTimeout(tryClose, 5000); }
});

async function refreshStats() { const s = await bridge.stats(); setMeter('cpu', s.cpu); setMeter('ram', s.ram); const b = parseInt($('bat').textContent); setMeter('bat', isNaN(b) ? 0 : b, isNaN(b) ? 'n/a' : b + '%'); }

/* ---- Duddy: moods, eyes, blinking, poking, wardrobe ---- */
const MOODS = ['happy', 'sad', 'think', 'annoyed', 'dizzy', 'love', 'sleep', 'wave']; let moodT;
function mood(name, ms) {
  clearTimeout(moodT);
  for (const el of [pet, svg]) { el.classList.remove(...MOODS); if (name) el.classList.add(name); }
  if (ms) moodT = setTimeout(() => mood(busy ? 'think' : null), ms);
}
let ticking = false, mx = 0, my = 0;
document.addEventListener('mousemove', (e) => {
  lastMove = Date.now(); mx = e.clientX; my = e.clientY;
  if (ticking) return; ticking = true;
  requestAnimationFrame(() => { ticking = false; const r = pet.getBoundingClientRect(), k = (v) => Math.max(-1, Math.min(1, v / 160)); look(k(mx - (r.left + r.width / 2)), k(my - (r.top + r.height / 2))); });
});
const look = (x, y) => { pet.style.setProperty('--px', x); pet.style.setProperty('--py', y); };
const wander = () => { if (Date.now() - lastMove > 3000 && !busy) look(Math.random() * 2 - 1, Math.random() * 1.2 - .6); };
(function blink() { svg.classList.add('blink'); setTimeout(() => svg.classList.remove('blink'), 140); setTimeout(blink, 2500 + Math.random() * 3500); })();

let pokes = [], loveT;
pet.onclick = () => {
  const now = Date.now(); pokes = pokes.filter((t) => now - t < 1500); pokes.push(now);
  if (pokes.length >= 3) { pokes = []; mood('dizzy', 2200); snd('dizzy'); } else { mood('annoyed', 700); snd('poke'); }
};
pet.onmouseenter = () => { loveT = setTimeout(() => { mood('love', 2500); snd('love'); for (let i = 0; i < 5; i++) setTimeout(heart, i * 160); }, 2000); };
pet.onmouseleave = () => clearTimeout(loveT);
function heart() {
  const h = document.createElement('span'); h.className = 'heart'; h.textContent = '♥';
  const r = pet.getBoundingClientRect(), b = island.getBoundingClientRect();
  h.style.left = (r.left - b.left + 10 + Math.random() * (r.width - 20)) + 'px'; h.style.top = (r.top - b.top - 4) + 'px';
  $('clip').appendChild(h); setTimeout(() => h.remove(), 1400);
}
const BODIES = [['#d9a82b', '#8f6a0e'], ['#5ac8a0', '#2d7a5f'], ['#e8799b', '#9a3d5c'], ['#5aa9e8', '#2b5f93'], ['#9096a3', '#4a4e56']];
const HATS = {
  party: '<polygon points="46,5 74,5 60,-26" fill="#e8523f"/><path d="M52,-8L68,-8" stroke="#fff" stroke-width="3"/><circle cx="60" cy="-27" r="4" fill="#fff"/>',
  crown: '<path d="M44,6L44,-12L52,-4L60,-16L68,-4L76,-12L76,6Z" fill="#ffd34d" stroke="#b8860b" stroke-width="2"/>',
};
function dress() {
  const [c, s] = BODIES[cfg.body]; pet.style.setProperty('--body', c); pet.style.setProperty('--bstroke', s);
  $('hat').innerHTML = HATS[cfg.hat] || '';
  [...$('swatches').children].forEach((b, i) => b.classList.toggle('on', i === cfg.body));
  [...$('hats').children].forEach((b) => b.classList.toggle('on', b.dataset.hat === cfg.hat));
}
$('swatches').replaceChildren(...BODIES.map(([c], i) => { const b = document.createElement('button'); b.className = 'sw2'; b.style.background = c; b.onclick = () => { cfg.body = i; store.set('body', i); dress(); snd('love'); }; return b; }));
$('hats').onclick = (e) => { if (e.target.dataset.hat === undefined) return; cfg.hat = e.target.dataset.hat; store.set('hat', cfg.hat); dress(); snd('love'); };
pet.oncontextmenu = (e) => { e.preventDefault(); $('wardrobe').classList.toggle('show'); };
document.addEventListener('click', (e) => { if (!e.target.closest('#wardrobe') && !e.target.closest('#pet')) $('wardrobe').classList.remove('show'); });
dress();

/* ---- Claude Code permission requests (via hooks): always a human click, never automatic ---- */
const perms = []; let backTo = 'home';
function showPerm() {
  if (!perms.length) { view(backTo); mood(null); if (!hovering) closeT = setTimeout(tryClose, 1500); return; }
  const p = perms[0];
  $('awho').textContent = 'Claude Code' + (p.project ? ' / ' + p.project : '');
  $('averb').textContent = p.verb; $('adetail').textContent = p.detail;
  $('amore').textContent = perms.length > 1 ? '+' + (perms.length - 1) + ' waiting' : '';
  if (current !== 'approval') backTo = current;
  open(); view('approval'); mood('sad');
}
bridge.onPerm((p) => { perms.push(p); if (perms.length === 1) snd('err'); showPerm(); });
bridge.onPermGone((id) => { const i = perms.findIndex((p) => p.id === id); if (i >= 0) { perms.splice(i, 1); showPerm(); } });
function decide(d) { const p = perms.shift(); if (!p) return; bridge.decide(p.id, d); snd(d === 'allow' ? 'done' : 'poke'); showPerm(); if (!perms.length) mood(d === 'allow' ? 'happy' : null, 1200); }
$('a-allow').onclick = () => decide('allow'); $('a-deny').onclick = () => decide('deny');
bridge.onNote((n) => { // Claude finished / needs you: a short peek, then back to sleep
  const proj = n.cwd ? n.cwd.split(/[\\/]/).pop() : '';
  status.textContent = n.kind === 'stop' ? 'Claude finished' + (proj ? ' in ' + proj : '') : n.kind === 'ask' ? 'Claude has a question: check the terminal' : n.text;
  if (perms.length) return;
  view('home'); open(); mood('happy', 1500); snd(n.kind === 'stop' ? 'done' : 'open');
  if (!hovering) closeT = setTimeout(tryClose, 3500);
});

/* ---- Windows notifications: fold out of the pill as a toast, collect in the Inbox ---- */
const inbox = []; let unread = 0;
function badge() {
  window.tilesPaint?.();
  $('rbadge').textContent = unread > 9 ? '9+' : unread; $('rbadge').classList.toggle('on', unread > 0);
  $('t-inbox').classList.toggle('dot', unread > 0 && current !== 'inbox');
}
function paintInbox() {
  const box = $('inbox');
  if (!inbox.length) {
    const on = $('s-notif').classList.contains('on');
    box.innerHTML = '<div class="empty">' + (on ? 'No notifications yet. New ones show up here.' : 'Windows notifications are off.<br><button id="n-on">Turn on</button>') + '</div>';
    if (!on) $('n-on').onclick = () => $('s-notif').click();
    return;
  }
  box.replaceChildren(...inbox.map((n) => {
    const d = document.createElement('div'); d.className = 'note';
    const l = document.createElement('div'); l.className = 'lbl'; const a = document.createElement('span'); a.textContent = n.app; const t = document.createElement('span');
    t.textContent = new Date(n.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); l.append(a, t);
    const b = document.createElement('b'); b.textContent = n.title; const p = document.createElement('p'); p.textContent = n.body;
    d.append(l, b, p); return d;
  }));
}
bridge.onNotif(async (n) => {
  if (n.error) { $('s-notif').classList.remove('on'); status.textContent = 'Error: ' + n.error; return; }
  inbox.unshift(n); if (inbox.length > 60) inbox.pop(); paintInbox();
  if (current !== 'inbox' || !island.classList.contains('open')) { unread++; badge(); }
  if (perms.length) return;
  snd('open');
  if (island.classList.contains('open')) return;
  $('ta').textContent = n.app; $('tw').textContent = ''; $('tt').textContent = n.title; $('tb').textContent = n.body;
  clearTimeout(shrinkT); clearTimeout(hudT); island.classList.remove('hud'); await bridge.shape(...TOAST); island.classList.add('toast');
  clearTimeout(toastT); toastT = setTimeout(endToast, 5000);
});
function endToast() {
  island.classList.remove('toast');
  clearTimeout(shrinkT); shrinkT = setTimeout(() => { if (!['open', 'toast', 'hud'].some((c) => island.classList.contains(c))) bridge.shape(...closedShape()); }, 500);
}
$('toast').onclick = () => { if (!island.classList.contains('open')) { open(); view('inbox'); } };
$('n-clear').onclick = () => { inbox.length = 0; unread = 0; badge(); paintInbox(); };
paintInbox();

/* ---- sound + brightness + per-app volume: the helper only runs while this tab is in use ---- */
let mixT, sliding = false, appKey = '';
const paintRange = (el, v) => { el.value = v; el.style.setProperty('--v', v + '%'); };
function paintMix(r) {
  if (r.error) { $('mixmsg').textContent = r.error; return; }
  $('mixmsg').textContent = '';
  if (!sliding) {
    paintRange($('vol'), r.vol); $('volp').textContent = r.mute ? 'mute' : r.vol + '%'; $('mutebtn').classList.toggle('off', r.mute);
    $('bright').disabled = r.bright == null; r.bright == null ? ($('brightp').textContent = 'n/a', paintRange($('bright'), 0)) : (paintRange($('bright'), r.bright), $('brightp').textContent = r.bright + '%');
  }
  const key = r.apps.map((a) => a.pid + a.name).join();
  if (key !== appKey && !sliding) {
    appKey = key;
    $('apps').replaceChildren(...r.apps.map((a) => {
      const row = document.createElement('div'); row.className = 'app' + (a.mute ? ' muted' : '');
      const name = document.createElement('span'); name.textContent = a.name === 'app' ? 'System' : a.name; name.title = 'Click to mute'; name.onclick = async () => paintMix(await bridge.audio('appmute ' + a.pid));
      const rg = document.createElement('input'); rg.type = 'range'; rg.max = 100; paintRange(rg, a.vol);
      const pc = document.createElement('span'); pc.className = 'pct'; pc.textContent = a.vol + '%';
      rg.oninput = () => { sliding = true; paintRange(rg, rg.value); pc.textContent = rg.value + '%'; send('app ' + a.pid + ' ' + rg.value); };
      row.append(name, rg, pc); return row;
    }));
    if (!r.apps.length) $('apps').innerHTML = '<div class="empty">Nothing is playing sound right now.</div>';
  }
}
let sendT, pendingCmd = null;
function send(cmd) { // sliders fire constantly: send at most ~12 commands per second, always the latest
  pendingCmd = cmd; if (sendT) return;
  sendT = setTimeout(async () => { const c = pendingCmd; sendT = null; await bridge.audio(c); }, 80);
}
document.addEventListener('pointerup', () => { if (sliding) setTimeout(() => { sliding = false; }, 600); });
$('vol').oninput = () => { sliding = true; paintRange($('vol'), $('vol').value); $('volp').textContent = $('vol').value + '%'; send('vol ' + $('vol').value); };
$('bright').oninput = () => { sliding = true; paintRange($('bright'), $('bright').value); $('brightp').textContent = $('bright').value + '%'; send('bright ' + $('bright').value); };
$('mutebtn').onclick = async () => paintMix(await bridge.audio('mute'));
function syncMix() {
  clearInterval(mixT); if (warming) return;
  if (!(island.classList.contains('open') && current === 'mixer')) return;
  bridge.audio('get').then(paintMix); mixT = setInterval(() => { if (!sliding) bridge.audio('get').then(paintMix); }, 4000);
}

/* ---- tasks and notes (saved locally) ---- */
let tasks = store.get('tasks', []);
function paintTasks() {
  $('tcount').textContent = tasks.filter((t) => !t.done).length + ' open';
  $('tasklist').replaceChildren(...tasks.map((t, i) => {
    const d = document.createElement('div'); d.className = 'task' + (t.done ? ' done' : '');
    const c = document.createElement('i'); c.onclick = () => { t.done = !t.done; store.set('tasks', tasks); paintTasks(); if (t.done) snd('done'); };
    const s = document.createElement('span'); s.textContent = t.t;
    const x = document.createElement('button'); x.textContent = '×'; x.onclick = () => { tasks.splice(i, 1); store.set('tasks', tasks); paintTasks(); };
    d.append(c, s, x); return d;
  }));
  if (!tasks.length) $('tasklist').innerHTML = '<div class="empty">Nothing to do. Add something above.</div>';
}
$('taskadd').onkeydown = (e) => { if (e.key === 'Enter' && e.target.value.trim()) { tasks.unshift({ t: e.target.value.trim(), done: false }); e.target.value = ''; store.set('tasks', tasks); paintTasks(); snd('poke'); } };
$('notes').value = store.get('notes', ''); let notesT;
$('notes').oninput = () => { clearTimeout(notesT); notesT = setTimeout(() => store.set('notes', $('notes').value), 400); };
paintTasks();

/* ---- music: a watcher in the main process pushes changes; this paints the pill and the Music tab ---- */
let mi = null, mkey = '', mTimer, scrub = null, holdPlay = null, holdPosUntil = 0, mediaOn = true;
const fmt = (n) => Math.floor(n / 60) + ':' + String(Math.floor(n % 60)).padStart(2, '0');
const curPos = () => (mi ? Math.min(mi.dur || 0, mi.pos + (mi.playing ? (Date.now() - mi.at) / 1000 : 0)) : 0);
function paintMedia() {
  const on = mi && mi.title, playing = !!(on && mi.playing);
  $('mtitle').textContent = on ? mi.title : 'Nothing playing';
  $('martist').textContent = on ? (mi.artist || (/spotify/i.test(mi.app) ? 'Spotify' : mi.app)) : mediaOn ? 'Start Spotify and press play' : 'Turned off in Settings';
  $('mapp').textContent = on ? (/spotify/i.test(mi.app) ? 'Spotify' : mi.app.replace(/\.exe$/i, '').split('!')[0]) : '-';
  const pos = scrub !== null ? scrub : curPos(), pct = on && mi.dur ? (100 * pos / mi.dur) + '%' : '0';
  $('bar').style.width = pct; $('thumb').style.left = pct; $('prog').classList.toggle('seekable', !!(on && mi.seek && mi.dur));
  $('tpos').textContent = fmt(pos); $('tdur').textContent = '-' + fmt(on ? Math.max(0, mi.dur - pos) : 0);
  $('m-play').classList.toggle('on', playing); $('art').classList.toggle('paused', !playing); $('eq2').classList.toggle('on', playing);
  setPlayingPill(playing);
}
let pillBusy = false;
async function setPlayingPill(on) {
  if (on !== island.classList.contains('playing')) window.onPlayState?.(on); // the Bluetooth page uses this to take your headphones over when music starts here // the idle pill widens while music plays; grow the window shape first so nothing is clipped
  if (on === island.classList.contains('playing') || pillBusy) return;
  pillBusy = true;
  if (on) { if (!island.classList.contains('open') && !island.classList.contains('toast')) await bridge.shape(...CLOSED_P); island.classList.add('playing'); }
  else { island.classList.remove('playing'); setTimeout(() => { if (!island.classList.contains('open') && !island.classList.contains('toast') && !island.classList.contains('playing')) bridge.shape(...CLOSED); }, 450); }
  pillBusy = false;
}
function setArt(url) {
  $('art').querySelector('img')?.remove(); $('art').firstElementChild.style.display = ''; $('msec').style.removeProperty('--tint');
  if (url) $('iart').src = url; else $('iart').removeAttribute('src');
  if (!url) return;
  const im = new Image(); im.onload = () => {
    $('art').firstElementChild.style.display = 'none'; $('art').append(im);
    const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, 8, 8);
    const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4; $('msec').style.setProperty('--tint', (r / n | 0) + ',' + (g / n | 0) + ',' + (b / n | 0));
  };
  im.src = url;
}
bridge.onMedia((m) => {
  if (m.type === 'art') { if (m.key === mkey) setArt('data:' + m.mime + ';base64,' + m.data); return; }
  const now = Date.now(), prev = mi;
  mi = m.none || !m.title ? null : { ...m, at: now };
  if (mi && holdPlay && now < holdPlay.until && mi.playing !== holdPlay.playing) mi.playing = holdPlay.playing; // players report a beat late after a click
  if (mi && prev && now < holdPosUntil) { mi.pos = Math.min(prev.dur || 0, prev.pos + (prev.playing ? (now - prev.at) / 1000 : 0)); mi.at = now; } // keep the spot we just seeked to
  const key = mi ? mi.title + mi.artist : '';
  if (key !== mkey) { mkey = key; setArt(''); window.onTrackChange?.(); }
  paintMedia();
});
function syncMedia() {
  clearInterval(mTimer); if (warming) return;
  if (island.classList.contains('open') && current === 'music') { paintMedia(); mTimer = setInterval(paintMedia, 1000); } // only the progress bar needs a tick (lyrics have their own 400 ms check)
}
function mediaCmd(a) { // flip the UI first so it feels instant; the watcher confirms a moment later
  if (a === 'play' && mi) { mi.pos = curPos(); mi.playing = !mi.playing; mi.at = Date.now(); holdPlay = { playing: mi.playing, until: Date.now() + 2500 }; paintMedia(); }
  bridge.mediaCmd(a); snd('poke');
}
// click or drag the bar to jump anywhere in the track (Spotify, YouTube, any player that allows seeking)
const prog = $('prog'), at = (e) => { const r = prog.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (mi?.dur || 0); };
const canSeek = () => mi && mi.seek && mi.dur;
prog.onpointerdown = (e) => { if (!canSeek()) return; prog.setPointerCapture(e.pointerId); prog.classList.add('drag'); scrub = at(e); paintMedia(); };
prog.onpointermove = (e) => {
  if (!canSeek()) return;
  const s = at(e); $('tip').textContent = fmt(s); $('tip').style.left = e.clientX - prog.getBoundingClientRect().left + 'px';
  if (scrub !== null) { scrub = s; paintMedia(); }
};
prog.onpointerup = () => {
  if (scrub === null) return;
  const s = Math.round(scrub); scrub = null; prog.classList.remove('drag');
  mi.pos = s; mi.at = Date.now(); holdPosUntil = Date.now() + 1800; paintMedia(); bridge.mediaCmd('seek:' + s); snd('poke');
};
$('m-play').onclick = () => mediaCmd('play'); $('m-next').onclick = () => mediaCmd('next'); $('m-prev').onclick = () => mediaCmd('prev');

/* ---- settings ---- */
const ACCENTS = ['#ff2d4f', '#ff9f0a', '#f0b429', '#30d158', '#0a84ff', '#bf5af2'];
$('accents').replaceChildren(...ACCENTS.map((c) => { const b = document.createElement('button'); b.className = 'ac'; b.style.background = c; b.onclick = () => { cfg.accent = c; store.set('accent', c); document.documentElement.style.setProperty('--accent', c); toggles(); snd('love'); }; return b; }));
function toggles() {
  $('p-gem').classList.toggle('on', cfg.brain === 'gemini'); $('p-cla').classList.toggle('on', cfg.brain === 'claude');
  $('s-hover').classList.toggle('on', cfg.hover); $('s-sound').classList.toggle('on', cfg.sound);
  [...$('accents').children].forEach((b, i) => b.classList.toggle('on', ACCENTS[i] === cfg.accent));
}
$('p-gem').onclick = () => { cfg.brain = 'gemini'; store.set('brain', 'gemini'); toggles(); bridge.ask('/new', [], 'gemini'); };
$('p-cla').onclick = () => { cfg.brain = 'claude'; store.set('brain', 'claude'); toggles(); bridge.ask('/new', [], 'claude'); };
$('s-hover').onclick = () => { cfg.hover = !cfg.hover; store.set('hover', cfg.hover); toggles(); };
$('s-sound').onclick = () => { cfg.sound = !cfg.sound; store.set('sound', cfg.sound); toggles(); snd('love'); };
$('s-media').onclick = async () => { const on = !$('s-media').classList.contains('on'); $('s-media').classList.toggle('on', on); mediaOn = on; await bridge.mediaSet(on); if (!on) { mi = null; mkey = ''; setArt(''); } paintMedia(); };
bridge.mediaGet().then((on) => { mediaOn = on; $('s-media').classList.toggle('on', on); paintMedia(); });
$('s-login').onclick = () => { const on = !$('s-login').classList.contains('on'); $('s-login').classList.toggle('on', on); bridge.setLogin(on); };
$('s-notif').onclick = async () => { const on = !$('s-notif').classList.contains('on'); $('s-notif').classList.toggle('on', on); await bridge.notifSet(on); paintInbox(); };
bridge.getLogin().then((on) => $('s-login').classList.toggle('on', on));
bridge.notifGet().then((on) => { $('s-notif').classList.toggle('on', on); paintInbox(); });
warmUp().catch(() => {}).finally(() => { warming = false; unread = 0; badge(); bridge.ready(); });
bridge.hooksStatus().then((on) => $('s-hooks').classList.toggle('on', on));
$('s-hooks').onclick = async () => {
  const r = await bridge.hooksToggle(); $('s-hooks').classList.toggle('on', r.on);
  if (r.error) { status.textContent = 'Error: ' + r.error; mood('sad', 2500); }
};
toggles();

/* ---- chat (streamed, light markdown) ---- */
function md(el, text) {
  el.replaceChildren(...text.split(/(```[\s\S]*?(?:```|$))/g).flatMap((blk) => {
    if (blk.startsWith('```')) { const p = document.createElement('pre'); p.textContent = blk.replace(/^```\w*\n?/, '').replace(/```$/, ''); return [p]; }
    return blk.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((s) => {
      const tag = /^`[^`]+`$/.test(s) ? 'code' : /^\*\*.+\*\*$/.test(s) ? 'b' : null;
      if (!tag) return document.createTextNode(s);
      const n = document.createElement(tag); n.textContent = s.slice(tag === 'code' ? 1 : 2, tag === 'code' ? -1 : -2); return n;
    });
  }));
}
function add(cls, text) {
  const d = document.createElement('div'); d.className = 'msg ' + cls;
  if (text) md(d, text);
  chat.appendChild(d); chat.scrollTop = chat.scrollHeight; return d;
}
let live = null; // the bubble currently being streamed into
bridge.onChunk((t) => {
  if (!live) return;
  if (!live.bub) { live.typing.remove(); live.bub = add('bot', ''); }
  live.acc += t; md(live.bub, live.acc); chat.scrollTop = chat.scrollHeight;
});
async function run(userText, fn, cls = 'bot') {
  view('chat'); busy = true; mood('think'); status.textContent = 'Thinking...'; island.classList.add('busy');
  if (userText) add('me', userText);
  const typing = add('bot typing', ''); typing.innerHTML = '<i></i><i></i><i></i>';
  live = { typing, bub: null, acc: '' };
  const out = await fn(); const l = live; live = null;
  if (l.bub) md(l.bub, out); else { typing.remove(); add(cls, out); }
  busy = false; island.classList.remove('busy');
  const bad = out.startsWith('Error:');
  status.textContent = bad ? 'Something went wrong' : 'Ready';
  mood(bad ? 'sad' : 'happy', bad ? 2500 : 1300); snd(bad ? 'err' : 'done');
  if (!hovering) closeT = setTimeout(tryClose, 2500);
}
function submit() {
  const text = q.value.trim(); if (!text) return;
  const f = files; q.value = ''; files = []; renderChips();
  run(text + (f.length ? `\n📎 ${f.map((x) => x.name).join(', ')}` : ''), () => bridge.ask(text, f, cfg.brain));
}
$('send').onclick = submit;
$('b-health').onclick = () => run('Health check', bridge.health, 'bot mono');
$('b-disk').onclick = () => run('Disk usage', bridge.disks, 'bot mono');
$('b-proc').onclick = () => run('Top processes', bridge.procs, 'bot mono');
$('b-clean').onclick = () => run('Clean temp files', bridge.clean);
$('b-term').onclick = () => { bridge.terminal(); status.textContent = 'Opened PowerShell'; mood('happy', 1000); snd('done'); setTimeout(() => { if (status.textContent === 'Opened PowerShell') status.textContent = 'Ready'; }, 3000); };

/* ---- files ---- */
function renderChips() {
  $('chips').replaceChildren(...files.map((f, i) => {
    const c = document.createElement('span'); c.className = 'chip'; c.textContent = '📎 ' + f.name; c.title = 'Click to remove';
    c.onclick = () => { files.splice(i, 1); renderChips(); }; return c;
  }));
}
async function addFiles(list) {
  for (const f of list) {
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(f); });
    files.push({ name: f.name, type: f.type || 'text/plain', data });
  }
  renderChips(); view('chat'); mood('happy', 900);
}
$('attach').onclick = () => $('pick').click();
$('pick').onchange = (e) => { addFiles(e.target.files); e.target.value = ''; };
island.ondragover = (e) => { e.preventDefault(); open(); island.classList.add('drop'); };
island.ondragleave = () => island.classList.remove('drop');
island.ondrop = (e) => { e.preventDefault(); island.classList.remove('drop'); addFiles(e.dataTransfer.files); };
