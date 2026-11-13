/* ---- Prayer times page (optional): sun arc, reminders, music that can pause by itself. Calculated on this PC. ---- */
const PR = Object.assign({ on: false, city: null, method: 'Morocco', asr: 1, remind: 10, pauseMusic: true }, store.get('prayer', {}));
const prSave = () => store.set('prayer', PR);
const PR_NAMES = [['fajr', 'Fajr'], ['dhuhr', 'Dhuhr'], ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha']];
const hhmm = (d) => (d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--');
let prT = null;

const prToday = (day = new Date()) => (PR.city ? PrayerCalc.times(day, PR.city.lat, PR.city.lon, PR.method, PR.asr) : null);
function prNext(now = new Date()) { // the next prayer from now (Fajr of tomorrow after Isha)
  const t = prToday(now); if (!t) return null;
  for (const [k, n] of PR_NAMES) if (t[k] && t[k] > now) return { key: k, name: n, at: t[k] };
  const tm = prToday(new Date(now.getTime() + 86400000)); return tm && tm.fajr ? { key: 'fajr', name: 'Fajr', at: tm.fajr } : null;
}
const untilTxt = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + ' min'; };

function prPaint() {
  const t = prToday(), nxt = prNext(), has = !!PR.city;
  $('psetup-hint').hidden = has; $('pbody').hidden = !has;
  $('pcity').textContent = has ? PR.city.name : 'No city yet';
  if (!has) return;
  $('plist').innerHTML = PR_NAMES.map(([k, n]) => '<div class="prow' + (nxt && nxt.key === k ? ' next' : '') + '"><span>' + n + '</span><b>' + hhmm(t[k]) + '</b></div>').join('');
  $('pnext').innerHTML = nxt ? '<small>NEXT</small><b>' + nxt.name + '</b><span>in ' + untilTxt(nxt.at - Date.now()) + '</span>' : '';
  // sun arc: the sun travels from sunrise to sunset; at night it rests on the horizon
  const now = Date.now(), a = t.sunrise?.getTime(), sb = t.sunset?.getTime();
  const f = a && sb ? (now - a) / (sb - a) : -1, day = f >= 0 && f <= 1, ang = Math.PI * Math.min(1, Math.max(0, f));
  const x = 100 - 80 * Math.cos(ang), y = 100 - 80 * Math.sin(ang);
  $('arcprog').setAttribute('d', day ? 'M20 100 A80 80 0 0 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) : '');
  const sun = $('arcsun'); sun.setAttribute('cx', x.toFixed(1)); sun.setAttribute('cy', y.toFixed(1)); sun.classList.toggle('night', !day);
  $('arcrise').textContent = hhmm(t.sunrise); $('arcset').textContent = hhmm(t.maghrib);
}

/* reminders: one timer aimed at the next event (a few minutes before, and at the time itself) */
function prSchedule() {
  clearTimeout(prT); if (!PR.on || !PR.city) return;
  const nxt = prNext(), now = Date.now(); if (!nxt) return;
  const warn = nxt.at - PR.remind * 60000, at = nxt.at.getTime();
  const [when, kind] = PR.remind > 0 && warn > now + 500 ? [warn, 'soon'] : [at, 'now'];
  prT = setTimeout(() => prFire(nxt, kind), Math.min(Math.max(0, when - now), 2 ** 31 - 1));
}
function prFire(n, kind) {
  if (kind === 'soon') {
    peek({ icon: 'moon', title: n.name + ' in ' + PR.remind + ' min', text: hhmm(n.at), ms: 5000 }); bridge.toast(n.name + ' in ' + PR.remind + ' minutes', hhmm(n.at));
  } else {
    snd('done'); mood('happy', 1500);
    peek({ icon: 'moon', title: 'Time for ' + n.name, text: hhmm(n.at), ms: 8000, tone: 'good' }); bridge.toast('Time for ' + n.name, hhmm(n.at));
    if (PR.pauseMusic && mi && mi.playing) mediaCmd('play'); // pause the music by itself
  }
  setTimeout(() => { prSchedule(); prPaint(); }, kind === 'now' ? 2000 : 1000);
}

/* setup */
let prSearchT;
$('pcityq').oninput = () => {
  clearTimeout(prSearchT); const q = $('pcityq').value.trim(); if (q.length < 2) { $('pres').innerHTML = ''; return; }
  prSearchT = setTimeout(async () => {
    const r = await bridge.geocode(q); $('pres').replaceChildren(...(r || []).map((c) => {
      const b = document.createElement('button'); b.textContent = c.name + (c.admin ? ', ' + c.admin : '') + ' · ' + c.country;
      b.onclick = () => { PR.city = { name: c.name, lat: c.lat, lon: c.lon }; prSave(); $('pcityq').value = ''; $('pres').innerHTML = ''; $('psetup').hidden = true; prPaint(); prSchedule(); snd('done'); };
      return b;
    }));
    if (!r || !r.length) $('pres').innerHTML = '<span class="dim">No match. Check the spelling, or you may be offline.</span>';
  }, 350);
};
$('pmethod').innerHTML = Object.entries(PrayerCalc.METHODS).map(([k, m]) => '<option value="' + k + '">' + m.name + '</option>').join('');
const prInputs = () => { $('pmethod').value = PR.method; $('pasr').value = String(PR.asr); $('premind').value = String(PR.remind); $('s-ppause').classList.toggle('on', PR.pauseMusic); };
$('pmethod').onchange = () => { PR.method = $('pmethod').value; prSave(); prPaint(); prSchedule(); };
$('pasr').onchange = () => { PR.asr = Number($('pasr').value); prSave(); prPaint(); prSchedule(); };
$('premind').onchange = () => { PR.remind = Number($('premind').value); prSave(); prSchedule(); };
$('s-ppause').onclick = () => { PR.pauseMusic = !PR.pauseMusic; prSave(); prInputs(); };
$('p-gear').onclick = () => { $('psetup').hidden = !$('psetup').hidden; if (!$('psetup').hidden) $('pcityq').focus(); };
$('p-hint-btn').onclick = () => { $('psetup').hidden = false; $('pcityq').focus(); };

/* the optional tab */
function prTab() { window.tilesPaint?.(); $('s-prayer').classList.toggle('on', PR.on); if (!PR.on && current === 'prayer') view('home'); }
$('s-prayer').onclick = () => { PR.on = !PR.on; prSave(); prTab(); prSchedule(); if (PR.on) { prInputs(); prPaint(); } };
viewHooks.push((v) => { if (v === 'prayer') { prPaint(); prInputs(); } });
setInterval(() => { if (island.classList.contains('open') && current === 'prayer') prPaint(); }, 30000);
prTab(); prInputs(); prPaint(); prSchedule();
