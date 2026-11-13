/* ---- Synced lyrics (from lrclib.net): the card splits in two, each line lights up as it is sung, click a line to jump there ---- */
let LY = { key: '', lines: null, plain: '', state: 'idle', cur: -1 };
const parseLrc = (s) => (s || '').split('\n').map((l) => { const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/); return m ? { t: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() } : null; }).filter(Boolean);

function lyPaint() {
  const box = $('lyr');
  if (LY.state === 'loading') { box.innerHTML = '<div class="lymsg">Finding lyrics…</div>'; return; }
  if (LY.state === 'none') { box.innerHTML = '<div class="lymsg">No lyrics found for this song.</div>'; return; }
  if (LY.state !== 'ready') { box.innerHTML = '<div class="lymsg">Play a song to see its lyrics.</div>'; return; }
  const wrap = document.createElement('div'); wrap.className = 'lylines';
  if (LY.lines) {
    LY.lines.forEach((l, i) => { const d = document.createElement('div'); d.className = 'lyl'; d.textContent = l.text || '♪'; d.onclick = () => { if (canSeek()) { mi.pos = l.t; mi.at = Date.now(); holdPosUntil = Date.now() + 1800; paintMedia(); bridge.mediaCmd('seek:' + Math.round(l.t)); } }; wrap.append(d); });
  } else wrap.innerHTML = '<div class="lyplain"></div>', wrap.firstChild.textContent = LY.plain;
  box.replaceChildren(wrap); LY.cur = -1; lyTick();
}
async function lyLoad() {
  if (!mi || !mi.title) { LY = { key: '', lines: null, plain: '', state: 'idle', cur: -1 }; lyPaint(); return; }
  const key = mi.title + '|' + mi.artist; if (key === LY.key && LY.state !== 'idle') return;
  LY = { key, lines: null, plain: '', state: 'loading', cur: -1 }; lyPaint();
  const r = await bridge.lyrics(mi.artist, mi.title, mi.dur);
  if (LY.key !== key) return; // the song changed while we were asking
  if (r && r.synced) { LY.lines = parseLrc(r.synced); LY.state = LY.lines.length ? 'ready' : 'none'; }
  else if (r && r.plain) { LY.plain = r.plain; LY.state = 'ready'; } else LY.state = 'none';
  lyPaint();
}
function lyTick() { // highlight the line being sung and keep it centred
  if (!LY.lines || !island.classList.contains('lyrics') || !mi) return;
  const p = curPos() + 0.25; let i = -1; for (let k = 0; k < LY.lines.length && LY.lines[k].t <= p; k++) i = k;
  if (i === LY.cur) return; LY.cur = i;
  const els = $('lyr').querySelectorAll('.lyl'); els.forEach((e, k) => { e.classList.toggle('now', k === i); e.classList.toggle('past', k < i); });
  const e = els[Math.max(0, i)], box = $('lyr'); if (e) box.scrollTo({ top: e.offsetTop - box.clientHeight / 2 + e.offsetHeight / 2, behavior: 'smooth' });
}
function lyToggle(on = !island.classList.contains('lyrics')) {
  island.classList.toggle('lyrics', on); $('m-lyrics').classList.toggle('on', on);
  island.style.setProperty('--h', (current === 'music' && on ? 290 : VIEW_H.music) + 'px');
  if (on) lyLoad(); snd('poke'); syncMedia();
}
$('m-lyrics').onclick = () => lyToggle();
window.onTrackChange = () => { if (island.classList.contains('lyrics')) lyLoad(); else LY = { key: '', lines: null, plain: '', state: 'idle', cur: -1 }; };
viewHooks.push((v) => { if (v !== 'music' && island.classList.contains('lyrics')) island.classList.remove('lyrics'), $('m-lyrics').classList.remove('on'); });
setInterval(() => { if (island.classList.contains('lyrics')) lyTick(); }, 400); // only does work while the lyrics are open
