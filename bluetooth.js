/* ---- Bluetooth: paired devices at a glance. Connect or disconnect with a switch, mute, pick the sound output, battery,
   and smart touches (pause the music when headphones disconnect, low battery alerts, favourites). ---- */
const BTc = Object.assign({ pause: true, low: true, takeover: false, last: null, fav: [] }, store.get('bt', {}));
const btSave = () => store.set('bt', BTc);
const BT = { devices: null, radio: null, sel: null, busy: {}, alerted: {} };
const BI = { // icons by kind: [label, svg paths]
  headphones: ['Headphones', HUD_ICONS.headphones], headset: ['Headset', HUD_ICONS.headphones], speaker: ['Speaker', HUD_ICONS.volume],
  phone: ['Phone', '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>'],
  gamepad: ['Controller', '<rect x="2" y="7" width="20" height="11" rx="5.5"/><path d="M7 10v5M4.5 12.5h5M15.5 11.5h.01M18 14h.01"/>'],
  keyboard: ['Keyboard', '<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'],
  mouse: ['Mouse', '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 6v4"/>'],
  computer: ['Computer', '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>'], other: ['Device', HUD_ICONS.bluetooth],
};
const BG = { headphones: 'g3', headset: 'g3', speaker: 'g3', phone: 'g5', gamepad: 'g4', keyboard: 'g2', mouse: 'g2', computer: 'g6', other: 'g7' };
const STAR = '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>';
const ico = (p, c = 'icon') => '<svg class="' + c + '" viewBox="0 0 24 24">' + p + '</svg>';
const btOrder = (list) => { const fav = (d) => BTc.fav.includes(d.addr); return [...list].sort((a, b) => (fav(b) - fav(a)) || (b.connected - a.connected) || a.name.localeCompare(b.name)); };
const btSel = () => BT.devices && (BT.devices.find((d) => d.addr === BT.sel) || btOrder(BT.devices)[0]);
const SVC = { '111F': 'Calls', '111E': 'Calls and mic', '110B': 'Stereo audio', '110A': 'Audio source', '112F': 'Contacts', '1132': 'Messages', '1116': 'Network sharing', '1124': 'Controller' };
const btChips = (d) => [...new Set((d.svc || []).map((s) => SVC[s]).filter(Boolean))];
const btCmd = (c) => bridge.btCmd(c);
const PHONE = '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>';
// the headphones to bring over to this laptop: a favourite (or the last ones used here) that are not connected right now
const btPickTakeover = (devs, cfg, busy = {}) => (devs || []).find((d) => d.audio && !d.connected && !busy[d.addr] && (cfg.fav.includes(d.addr) || d.addr === cfg.last)) || null;

function btPaint() {
  const rows = $('btrows'), list = BT.devices;
  $('s-btradio').classList.toggle('on', BT.radio !== false); $('s-btradio').hidden = BT.radio == null;
  if (!list) { rows.innerHTML = '<div class="empty">Looking for your devices…</div>'; $('btdetail').innerHTML = ''; return; }
  if (BT.radio === false) { rows.innerHTML = '<div class="empty">Bluetooth is off.<br><button id="bt-on">Turn on</button></div>'; $('bt-on').onclick = () => btCmd('radio on'); $('btdetail').innerHTML = ''; return; }
  if (!list.length) { rows.innerHTML = '<div class="empty">No paired devices yet.<br>Pair one in Windows Settings > Bluetooth.</div>'; $('btdetail').innerHTML = ''; return; }
  const sel = btSel(); BT.sel = sel.addr;
  const fav = (d) => BTc.fav.includes(d.addr);
  const sorted = btOrder(list);
  rows.replaceChildren(...sorted.map((d) => {
    const r = document.createElement('div'); r.className = 'btrow' + (d.addr === sel.addr ? ' sel' : '') + (BT.busy[d.addr] ? ' busy' : '');
    const k = BI[d.kind] || BI.other, bat = d.battery != null ? ' · ' + d.battery + '%' : '';
    r.innerHTML = '<u class="' + BG[d.kind] + '">' + ico(k[1]) + '</u><div class="bti"><b></b><span></span></div><i class="btsw' + (d.connected ? ' on' : '') + '"></i>';
    r.querySelector('b').textContent = (fav(d) ? '★ ' : '') + d.name;
    r.querySelector('span').textContent = BT.busy[d.addr] ? (BT.busy[d.addr] === 'connect' ? 'Connecting…' : 'Disconnecting…') : d.connected ? 'Connected' + bat : k[0] + ' · Not connected';
    r.onclick = () => { BT.sel = d.addr; btPaint(); };
    r.querySelector('.btsw').onclick = (e) => { e.stopPropagation(); if (BT.busy[d.addr]) return; BT.busy[d.addr] = d.connected ? 'disconnect' : 'connect'; btCmd((d.connected ? 'disconnect ' : 'connect ') + d.addr); snd('poke'); btPaint(); };
    return r;
  }));
  btDetail(sel);
}
function btDetail(d) {
  const k = BI[d.kind] || BI.other, el = $('btdetail'), fav = BTc.fav.includes(d.addr), canSound = d.audio && d.connected && d.hasOutput;
  const low = d.battery != null && d.battery <= 20, p = d.battery ?? 0;
  el.innerHTML = '<div class="bth"><u class="' + BG[d.kind] + '">' + ico(k[1]) + '</u><div><b></b><span>' + k[0] + (d.connected ? ' · Connected' : ' · Not connected') + '</span></div>' +
    (d.connected && d.battery != null ? '<div class="btbat' + (low ? ' low' : '') + '"><svg viewBox="0 0 44 44"><circle class="t" cx="22" cy="22" r="18"/><circle class="p" cx="22" cy="22" r="18" pathLength="100" style="stroke-dasharray:' + p + ' 100"/></svg><b>' + p + '%</b></div>' : '') + '</div>' +
    (d.connected ? '<div class="btact">' +
      (canSound ? '<button id="bt-mute" class="' + (d.muted ? 'on' : '') + '">' + ico(d.muted ? HUD_ICONS.mute : HUD_ICONS.volume) + '<span>' + (d.muted ? 'Unmute' : 'Mute') + '</span></button>' +
        '<button id="bt-out" class="' + (d.isDefault ? 'on' : '') + '">' + ico(HUD_ICONS.headphones) + '<span>' + (d.isDefault ? 'Back to speakers' : 'Use for sound') + '</span></button>' : '') +
      '<button id="bt-fav" class="' + (fav ? 'on' : '') + '">' + ico(STAR) + '<span>' + (fav ? 'Favourite' : 'Favourite') + '</span></button></div>' +
      (d.audio ? '<button id="bt-hand" class="hand">' + ico(PHONE) + '<span>Switch to phone</span></button>' : '') +
      (canSound && d.vol != null ? '<div class="btvol">' + ico(HUD_ICONS.volume) + '<input type="range" id="bt-vol" min="0" max="100" value="' + d.vol + '" style="--v:' + d.vol + '%"><em>' + d.vol + '%</em></div>' : '')
      : '<div class="btact"><button id="bt-conn" class="big">' + (BT.busy[d.addr] ? 'Connecting…' : d.audio ? 'Switch to laptop' : 'Connect') + '</button><button id="bt-fav" class="' + (fav ? 'on' : '') + '">' + ico(STAR) + '<span>Favourite</span></button></div>' +
        '<p class="btnote">' + (d.audio ? 'On your phone right now? This takes them over for the laptop. Use "Switch to phone" to give them back.' : 'Turn the device on and keep it close.') + ' It stays paired either way.</p>') +
    '<div class="btsm"><button id="bt-smart" class="smartbtn">Smart options <svg class="icon" viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button><div class="btsmp' + (BT.smart ? ' open' : '') + '"><label><span>Take headphones over when music plays here</span><i class="btsw' + (BTc.takeover ? ' on' : '') + '" id="bt-s-take"></i></label><label><span>Pause music on disconnect</span><i class="btsw' + (BTc.pause ? ' on' : '') + '" id="bt-s-pause"></i></label><label><span>Low battery alert</span><i class="btsw' + (BTc.low ? ' on' : '') + '" id="bt-s-low"></i></label></div></div>';
  el.querySelector('.bth b').textContent = d.name;
  const chips = d.audio && d.connected ? [] : btChips(d); if (chips.length) { const c = document.createElement('div'); c.className = 'btchips'; chips.forEach((t) => { const s = document.createElement('span'); s.textContent = t; c.append(s); }); el.querySelector('.bth').after(c); }
  const on = (id, fn) => { const x = $(id); if (x) x.onclick = fn; };
  on('bt-mute', () => { btCmd('mute ' + d.addr); snd('poke'); });
  on('bt-out', () => { btCmd('output ' + d.addr); snd('poke'); });
  on('bt-hand', () => { // give the headphones to the phone: let go here (and stop the music so it doesn't jump to the speakers)
    if (mi && mi.playing) mediaCmd('play');
    BT.busy[d.addr] = 'disconnect'; BT.handed = d.addr; btCmd('disconnect ' + d.addr); btPaint();
    peek({ icon: 'phone', title: 'Switching to your phone', text: d.name + ' is free for it now', tone: 'good', ms: 3200 });
  });
  on('bt-smart', () => { BT.smart = !BT.smart; btPaint(); });
  on('bt-s-take', () => { BTc.takeover = !BTc.takeover; btSave(); btPaint(); });
  on('bt-conn', () => { BT.busy[d.addr] = 'connect'; btCmd('connect ' + d.addr); btPaint(); });
  on('bt-fav', () => { BTc.fav = fav ? BTc.fav.filter((a) => a !== d.addr) : [...BTc.fav, d.addr]; btSave(); btPaint(); snd('love'); });
  on('bt-s-pause', () => { BTc.pause = !BTc.pause; btSave(); btPaint(); });
  on('bt-s-low', () => { BTc.low = !BTc.low; btSave(); btPaint(); });
  const v = $('bt-vol'); if (v) { let t; v.oninput = () => { v.style.setProperty('--v', v.value + '%'); v.nextElementSibling.textContent = v.value + '%'; clearTimeout(t); t = setTimeout(() => btCmd('vol ' + d.addr + ' ' + v.value), 90); }; }
}

/* what changed since the last list: announce it, and do the smart things */
function btOnList(m) {
  const prev = BT.devices;
  BT.devices = m.devices.map((d) => ({ ...d, battery: d.battery ?? prev?.find((p) => p.addr === d.addr)?.battery ?? null })); BT.radio = m.radio;
  if (prev) for (const d of BT.devices) {
    const p = prev.find((x) => x.addr === d.addr); if (!p || p.connected === d.connected) continue;
    if (d.connected) { snd('open'); peek({ icon: BI[d.kind] ? (d.kind === 'phone' ? 'bluetooth' : 'headphones') : 'bluetooth', title: d.name + ' connected', text: d.battery != null ? 'Battery ' + d.battery + '%' : (BI[d.kind] || BI.other)[0], tone: 'good', ms: 3000 }); }
    else {
      const paused = d.audio && BTc.pause && mi && mi.playing; if (paused) mediaCmd('play'); // like on the iPhone: don't blast the speakers
      peek({ icon: 'bluetooth', title: d.name + ' disconnected', text: paused ? 'Music paused' : '', tone: 'warn', ms: 3200 });
    }
  }
  const lastOn = BT.devices.find((d) => d.audio && d.connected); if (lastOn && BTc.last !== lastOn.addr) { BTc.last = lastOn.addr; btSave(); }
  if (BT.wantTakeover && Date.now() - BT.wantTakeover < 8000) { // music just started on this laptop
    BT.wantTakeover = 0; const t = btPickTakeover(BT.devices, BTc, BT.busy);
    if (t && Date.now() - (BT.lastTake || 0) > 60000) { BT.lastTake = Date.now(); BT.auto = t.addr; BT.busy[t.addr] = 'connect'; btCmd('connect ' + t.addr); peek({ icon: 'headphones', title: 'Taking ' + t.name + ' over', text: 'Switching them to this laptop', tone: 'good', ms: 3200 }); }
  }
  BT.devices.forEach(btLow); btPaint(); window.tilesPaint?.();
}
window.onPlayState = (on) => { if (on && BTc.takeover) { BT.wantTakeover = Date.now(); btCmd('list'); } };
function btLow(d) {
  if (!d.connected || d.battery == null) return;
  if (d.battery > 30) delete BT.alerted[d.addr];
  else if (d.battery <= 20 && BTc.low && !BT.alerted[d.addr]) { BT.alerted[d.addr] = true; snd('err'); peek({ icon: 'charge', title: d.name + ' battery low', text: d.battery + '% left', value: d.battery, tone: 'bad', ms: 4500 }); }
}
bridge.onBt((m) => {
  if (m.type === 'list') btOnList(m);
  else if (m.type === 'battery') { const d = BT.devices?.find((x) => x.addr === m.addr); if (d) { d.battery = m.value; btLow(d); btPaint(); window.tilesPaint?.(); } }
  else if (m.type === 'busy') { BT.busy[m.addr] = m.op; btPaint(); }
  else if (m.type === 'result') { delete BT.busy[m.addr]; const auto = BT.auto === m.addr; if (auto) BT.auto = null; if (!m.ok && !auto) { snd('err'); peek({ icon: 'bluetooth', title: m.op === 'connect' ? "Couldn't connect" : "Couldn't disconnect", text: 'Is it turned on and nearby?', tone: 'bad', ms: 3500 }); } btPaint(); }
  else if (m.type === 'error') { status.textContent = 'Bluetooth: ' + m.message; }
});
$('s-btradio').onclick = () => { btCmd('radio ' + (BT.radio === false ? 'on' : 'off')); snd('poke'); };

/* keep it fresh while the page is open; otherwise Windows tells us (see events.js) and we look once */
setInterval(() => { if (island.classList.contains('open') && current === 'bluetooth') btCmd('list'); }, 4000);
viewHooks.push((v) => { if (v === 'bluetooth') { btPaint(); btCmd('list'); } });
let btKickT; window.btKick = () => { clearTimeout(btKickT); btKickT = setTimeout(() => btCmd('list'), 1500); };
setTimeout(() => btCmd('list'), 25000); // one look after start-up so later changes can be announced
btPaint();
