/* ---- system peeks: volume, brightness, Caps Lock, language, headphones, charger, Wi-Fi ---- */
let keysOn = true;
bridge.onSys((m) => {
  if (!keysOn) return;
  switch (m.type) {
    case 'vol': peek({ icon: m.mute || m.vol === 0 ? 'mute' : 'volume', title: m.mute ? 'Muted' : 'Volume', text: m.mute ? '' : m.vol + '%', value: m.mute ? 0 : m.vol, ms: 1300 }); break;
    case 'bright': peek({ icon: 'brightness', title: 'Brightness', text: m.value + '%', value: m.value, ms: 1300 }); break;
    case 'caps': peek({ icon: 'caps', title: 'Caps Lock', text: m.on ? 'On' : 'Off', tone: m.on ? 'warn' : 'accent', ms: 1500 }); break;
    case 'lang': peek({ icon: 'lang', title: 'Keyboard language', text: m.code, ms: 1500 }); break;
    case 'dev': { const hp = /head|bud|pod|hands-?free|bluetooth/i.test(m.name); snd('open'); peek({ icon: hp ? 'headphones' : 'volume', title: hp ? 'Headphones connected' : 'Audio output', text: m.name, tone: 'good', ms: 2800 }); break; }
  }
});
bridge.keysGet().then((on) => { keysOn = on; $('s-keys').classList.toggle('on', on); });
$('s-keys').onclick = async () => { const on = !$('s-keys').classList.contains('on'); $('s-keys').classList.toggle('on', on); keysOn = await bridge.keysSet(on); };

// charger and low battery (the battery API is event driven, nothing polls)
navigator.getBattery?.().then((b) => {
  b.addEventListener('chargingchange', () => { const p = Math.round(b.level * 100); snd('open'); peek({ icon: 'charge', title: b.charging ? 'Charging' : 'Unplugged', text: p + '%', value: p, tone: b.charging ? 'good' : 'warn', ms: 2600 }); });
  b.addEventListener('levelchange', () => { const p = Math.round(b.level * 100); if (!b.charging && (p === 20 || p === 10 || p === 5)) { snd('err'); peek({ icon: 'charge', title: 'Battery low', text: p + '% left', value: p, tone: 'bad', ms: 4500 }); } });
});
// Wi-Fi / internet
window.addEventListener('offline', () => { peek({ icon: 'wifioff', title: 'No internet', text: 'Connection lost', tone: 'warn', ms: 3200 }); });
window.addEventListener('online', () => { peek({ icon: 'wifi', title: 'Back online', text: 'Connected', tone: 'good', ms: 2000 }); });

/* ---- idle mascot + minimal notch ---- */
let sleeping = false;
bridge.onIdle((idle) => {
  if (idle) { if (['open', 'toast', 'hud'].some((c) => island.classList.contains(c))) return; sleeping = true; island.classList.add('sleepy'); mood('sleep'); }
  else if (sleeping) window.wake();
});
window.wake = () => { // anything that happens (hover, alert, you coming back) wakes the mascot up with a wave
  if (!sleeping) return; sleeping = false; island.classList.remove('sleepy'); mood('wave', 1900); snd('love');
};
const applyMinimal = () => { island.classList.toggle('minimal', cfg.minimal); $('s-minimal').classList.toggle('on', cfg.minimal); if (!['open', 'toast', 'hud'].some((c) => island.classList.contains(c))) bridge.shape(...closedShape()); };
$('s-minimal').onclick = () => { cfg.minimal = !cfg.minimal; store.set('minimal', cfg.minimal); applyMinimal(); };
island.classList.toggle('minimal', cfg.minimal); $('s-minimal').classList.toggle('on', cfg.minimal);
