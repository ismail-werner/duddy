/* ---- Focus timer: calm Pomodoro, a breathing Live Activity in the pill, gentle alerts ---- */
const PH = { focus: ['Focus', 'var(--accent)'], short: ['Short break', '#30d158'], long: ['Long break', '#0a84ff'] };
const F = Object.assign({ phase: 'focus', len: { focus: 25, short: 5, long: 15 }, endAt: null, left: null, round: 1, today: { d: '', n: 0 } }, store.get('focus', {}));
const fSave = () => store.set('focus', F);
const fFull = () => F.len[F.phase] * 60000;
const fLeft = () => (F.endAt ? Math.max(0, F.endAt - Date.now()) : F.left ?? fFull());
const mmss = (ms) => { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
let fTimer = null;

function fPaint() {
  const left = fLeft(), pct = 100 * (1 - left / fFull()), running = !!F.endAt, started = running || F.left != null;
  const [name, col] = PH[F.phase];
  $('fsec').style.setProperty('--fc', col);
  $('ftxt').textContent = mmss(left); $('fph').textContent = name.toUpperCase();
  $('fp').style.strokeDasharray = pct + ' 100';
  $('f-go').textContent = running ? 'Pause' : started ? 'Resume' : 'Start';
  $('fdial').classList.toggle('run', running);
  $('fround').textContent = F.phase === 'focus' ? 'Round ' + F.round + ' of 4' : 'Break';
  $('flv').textContent = F.len[F.phase];
  document.querySelectorAll('#fmodes b').forEach((b) => b.classList.toggle('on', b.dataset.p === F.phase));
  $('fdots').innerHTML = [1, 2, 3, 4].map((i) => '<i class="' + (i < F.round || (i === F.round && F.phase !== 'focus') ? 'done' : i === F.round ? 'now' : '') + '"></i>').join('') + '<span>' + (F.today.n || 0) + ' today</span>';
  // Live Activity in the pill
  island.classList.toggle('focusing', started);
  $('fpill').classList.toggle('run', running); $('fpill').style.setProperty('--fc', col);
  $('ftime').textContent = mmss(left); $('fpp').style.strokeDasharray = pct + ' 100';
}
function fTick() {
  if (F.endAt && fLeft() <= 0) fDone(true);
  fPaint();
}
function fRun() { clearInterval(fTimer); if (F.endAt) fTimer = setInterval(fTick, 1000); } // ticks only while a timer actually runs
function fGo() {
  if (F.endAt) { F.left = fLeft(); F.endAt = null; } else { F.endAt = Date.now() + (F.left ?? fFull()); F.left = null; snd('poke'); }
  fSave(); fRun(); fPaint();
}
function fReset() { F.endAt = null; F.left = null; fSave(); fRun(); fPaint(); }
function fSetPhase(p) { F.phase = p; F.endAt = null; F.left = null; fSave(); fRun(); fPaint(); }
function fDone(natural) {
  const was = F.phase, d = new Date().toDateString();
  if (F.today.d !== d) F.today = { d, n: 0 };
  if (was === 'focus') { F.today.n++; F.phase = F.round >= 4 ? 'long' : 'short'; }
  else { F.phase = 'focus'; F.round = was === 'long' ? 1 : F.round + 1; }
  F.endAt = null; F.left = null; fSave(); fRun(); fPaint();
  if (!natural) return;
  const msg = was === 'focus' ? ['Focus complete', F.phase === 'long' ? 'Great work. Take a long break.' : 'Nice. Take a short break.'] : ['Break over', 'Ready for the next round?'];
  snd('done'); mood('happy', 1600); peek({ icon: was === 'focus' ? 'check' : 'timer', title: msg[0], text: msg[1], ms: 4500, tone: 'good' });
  bridge.toast(msg[0], msg[1]); // also a Windows notification: shows on the lock screen if Windows allows it
}
$('f-go').onclick = fGo; $('f-reset').onclick = fReset; $('f-skip').onclick = () => fDone(false);
document.querySelectorAll('#fmodes b').forEach((b) => { b.onclick = () => fSetPhase(b.dataset.p); });
const fStep = (n) => { const max = F.phase === 'focus' ? 120 : 30, min = F.phase === 'focus' ? 5 : 1; F.len[F.phase] = Math.max(min, Math.min(max, F.len[F.phase] + n)); if (!F.endAt) F.left = null; fSave(); fPaint(); };
$('f-minus').onclick = () => fStep(-5 + (F.phase === 'focus' ? 0 : 4)); $('f-plus').onclick = () => fStep(5 - (F.phase === 'focus' ? 0 : 4));
if (F.endAt && F.endAt <= Date.now()) fDone(false); // finished while Duddy was closed
fRun(); fPaint();
