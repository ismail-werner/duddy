/* ---- File shelf + clipboard history: drop files on the notch to keep them close, drag them out again ---- */
let shelf = store.get('shelf', []);
const clips = []; let clipOn = false; // clipboard history lives in memory only: it is gone when Duddy quits
const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23');
const isImg = (n) => /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n);
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

function paintShelf() {
  $('scount').textContent = shelf.length + ' file' + (shelf.length === 1 ? '' : 's');
  const box = $('shelfgrid');
  if (!shelf.length) { box.innerHTML = '<div class="empty">Drop files here to keep them close.<br>Drag them out into a chat, an email or a folder.</div>'; return; }
  box.replaceChildren(...shelf.map((f, i) => {
    const t = document.createElement('div'); t.className = 'tile' + (f.gone ? ' gone' : ''); t.title = f.path + (f.gone ? ' (moved or deleted)' : '');
    const th = document.createElement('div'); th.className = 'thumb';
    if (isImg(f.name) && !f.gone) { const im = new Image(); im.src = fileUrl(f.path); im.draggable = false; th.append(im); }
    else { th.textContent = (f.name.split('.').pop() || 'file').slice(0, 4).toUpperCase(); }
    const nm = document.createElement('span'); nm.textContent = f.name;
    const act = document.createElement('div'); act.className = 'tact';
    const ask = document.createElement('button'); ask.title = 'Ask Duddy about this'; ask.innerHTML = '<svg class="icon" viewBox="0 0 24 24"><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>';
    ask.onclick = async (e) => { e.stopPropagation(); const r = await bridge.fileRead(f.path); if (r.error) { peek({ icon: 'file', title: 'Cannot read', text: r.error, tone: 'bad' }); return; } files.push(r); renderChips(); view('chat'); mood('happy', 900); };
    const rm = document.createElement('button'); rm.title = 'Remove from shelf (the file stays where it is)'; rm.textContent = '×';
    rm.onclick = (e) => { e.stopPropagation(); shelf.splice(i, 1); store.set('shelf', shelf); paintShelf(); };
    act.append(ask, rm); t.append(th, nm, act);
    t.onclick = () => bridge.shelfOpen(f.path);
    t.oncontextmenu = (e) => { e.preventDefault(); bridge.shelfReveal(f.path); };
    t.draggable = true; t.ondragstart = (e) => { e.preventDefault(); bridge.shelfDrag(f.path); }; // a real OS drag: drop it into a chat, a mail, a folder
    return t;
  }));
}
function addToShelf(list) {
  let n = 0;
  for (const f of list) {
    const p = bridge.pathOf(f); if (!p || shelf.some((x) => x.path === p)) continue;
    shelf.unshift({ path: p, name: f.name, size: f.size, t: Date.now() }); n++;
  }
  shelf = shelf.slice(0, 60); store.set('shelf', shelf); paintShelf(); return n;
}
async function checkShelf() { // mark files that were moved or deleted
  const st = await bridge.shelfStat(shelf.map((f) => f.path));
  shelf.forEach((f, i) => { f.gone = !st[i]; }); paintShelf();
}
island.ondrop = (e) => {
  e.preventDefault(); island.classList.remove('drop');
  const n = addToShelf(e.dataTransfer.files); view('shelf'); mood('happy', 900); snd('done');
  if (!n) status.textContent = 'Already on the shelf';
};

/* clipboard */
function paintClips() {
  const box = $('cliplist');
  if (!clipOn) { box.innerHTML = '<div class="empty">Clipboard history is off.<br><button id="clip-on">Turn on</button></div>'; $('clip-on').onclick = () => $('s-clip').click(); return; }
  if (!clips.length) { box.innerHTML = '<div class="empty">Copy something and it shows up here.</div>'; return; }
  box.replaceChildren(...clips.map((c) => {
    const d = document.createElement('div'); d.className = 'clip'; d.title = 'Click to copy again'; d.textContent = c.length > 140 ? c.slice(0, 140) + '…' : c;
    d.onclick = () => { bridge.clipCopy(c); d.classList.add('copied'); snd('poke'); setTimeout(() => d.classList.remove('copied'), 700); };
    return d;
  }));
}
bridge.onClip((t) => { const i = clips.indexOf(t); if (i >= 0) clips.splice(i, 1); clips.unshift(t); if (clips.length > 30) clips.pop(); paintClips(); });
bridge.clipGet().then((on) => { clipOn = on; $('s-clip').classList.toggle('on', on); paintClips(); });
$('s-clip').onclick = async () => { const on = !$('s-clip').classList.contains('on'); $('s-clip').classList.toggle('on', on); clipOn = await bridge.clipSet(on); if (!on) clips.length = 0; paintClips(); };
viewHooks.push((v) => { if (v === 'shelf') checkShelf(); });
paintShelf();
