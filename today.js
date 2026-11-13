/* ---- Today: your week at a glance and two widgets of your choice (next prayer, focus, world clock, battery, moon, countdown) ---- */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ZONES = ['Africa/Casablanca', 'Europe/Paris', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Riyadh', 'Asia/Tokyo', 'Asia/Kolkata', 'Australia/Sydney', 'Africa/Cairo', 'Europe/Istanbul'];
const TD = Object.assign({ w: ['world', 'moon'], zones: ['Europe/Paris', 'America/New_York', 'Asia/Tokyo'], count: { title: 'Countdown', date: '' } }, store.get('today', {}));
const tdSave = () => store.set('today', TD);
let battery = null; navigator.getBattery?.().then((b) => { battery = b; });
// Intl formatters are slow to create, so each one is made once and reused
const fmtCache = new Map();
const zoneFmt = (z) => { if (!fmtCache.has(z)) fmtCache.set(z, new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit', hour12: false, day: 'numeric' })); return fmtCache.get(z); };
const wdFmt = new Intl.DateTimeFormat([], { weekday: 'short' }), dateFmt = new Intl.DateTimeFormat([], { weekday: 'long', day: 'numeric', month: 'long' });
const WIDGETS = { world: 'World clock', moon: 'Moon', focus: 'Focus', battery: 'Battery', prayer: 'Next prayer', count: 'Countdown' };

function moonInfo(date = new Date()) {
  const syn = 29.530588853, jd = date.getTime() / 86400000 + 2440587.5, p = (((jd - 2451550.1) / syn) % 1 + 1) % 1;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return { p, name: names[Math.round(p * 8) % 8], lit: Math.round((1 - Math.cos(2 * Math.PI * p)) / 2 * 100), toFull: ((0.5 - p + 1) % 1) * syn, toNew: ((1 - p) % 1) * syn };
}
function moonSvg(p, r = 30) {
  const k = Math.cos(2 * Math.PI * p), rx = (r * Math.abs(k)).toFixed(1), c = 36, wax = p < 0.5;
  const lit = wax ? 'M' + c + ' ' + (c - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + c + ' ' + (c + r) + ' A' + rx + ' ' + r + ' 0 0 ' + (k > 0 ? 0 : 1) + ' ' + c + ' ' + (c - r)
    : 'M' + c + ' ' + (c - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + c + ' ' + (c + r) + ' A' + rx + ' ' + r + ' 0 0 ' + (k > 0 ? 1 : 0) + ' ' + c + ' ' + (c - r);
  return '<svg viewBox="0 0 72 72" class="moon"><circle cx="36" cy="36" r="30" fill="#2a2a33"/><path d="' + lit + 'Z" fill="#f3efe0"/><circle cx="36" cy="36" r="30" fill="none" stroke="rgba(255,255,255,.12)"/></svg>';
}
const WR = {
  world: () => '<div class="wclocks">' + TD.zones.map((z, i) => {
    const now = new Date(), parts = Object.fromEntries(zoneFmt(z).formatToParts(now).map((p) => [p.type, p.value])), t = parts.hour + ':' + parts.minute;
    const day = Number(parts.day) - now.getDate(), tag = day === 0 ? '' : day > 0 || day < -20 ? ' <small>+1d</small>' : ' <small>-1d</small>';
    return '<div class="wc" data-i="' + i + '" title="Click to change"><span>' + esc(z.split('/').pop().replace(/_/g, ' ')) + '</span><b>' + t + tag + '</b></div>';
  }).join('') + '</div>',
  moon: () => { const m = moonInfo(); return '<div class="wmoon">' + moonSvg(m.p) + '<div><b>' + m.name + '</b><span>' + m.lit + '% lit</span><small>' + (m.toFull < m.toNew ? 'Full moon in ' + Math.round(m.toFull) + ' days' : 'New moon in ' + Math.round(m.toNew) + ' days') + '</small></div></div>'; },
  focus: () => { const n = F.today.d === new Date().toDateString() ? F.today.n : 0; return '<div class="wbig"><b>' + n + '</b><span>focus session' + (n === 1 ? '' : 's') + ' today</span><small>' + (n * F.len.focus) + ' min · ' + PH[F.phase][0] + ' ' + mmss(fLeft()) + '</small></div>'; },
  battery: () => {
    if (!battery) return '<div class="wbig"><span>No battery found</span></div>';
    const p = Math.round(battery.level * 100), left = battery.charging ? (battery.chargingTime < Infinity ? 'Full in ' + untilTxt(battery.chargingTime * 1000) : 'Charging') : (battery.dischargingTime < Infinity ? untilTxt(battery.dischargingTime * 1000) + ' left' : 'On battery');
    return '<div class="wbig"><b>' + p + '%</b><span>' + (battery.charging ? 'Charging' : 'On battery') + '</span><small>' + left + '</small></div>';
  },
  prayer: () => { const n = PR.on && PR.city ? prNext() : null; return n ? '<div class="wbig"><small>NEXT PRAYER</small><b>' + n.name + '</b><span>' + hhmm(n.at) + ' · in ' + untilTxt(n.at - Date.now()) + '</span></div>' : '<div class="wbig"><span>Turn on Prayer times in Settings</span></div>'; },
  count: () => {
    const d = TD.count.date ? Math.ceil((new Date(TD.count.date + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000) : null;
    return '<div class="wbig">' + (d == null ? '<span>Pick a date</span>' : '<b>' + Math.max(0, d) + '</b><span>' + (d < 0 ? 'days ago' : d === 0 ? 'today!' : 'days to') + ' ' + esc(TD.count.title) + '</span>') + '<input class="wtitle" value="' + esc(TD.count.title) + '" placeholder="Title"><input type="date" class="wdate" value="' + esc(TD.count.date) + '"></div>';
  },
};
function tdWeek() {
  const now = new Date(), mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  $('todaydate').textContent = dateFmt.format(now);
  $('weekstrip').replaceChildren(...[...Array(7).keys()].map((i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    const due = tasks.filter((t) => t.due && !t.done && new Date(t.due).toDateString() === d.toDateString()).length;
    const el = document.createElement('div'); el.className = 'wd' + (d.toDateString() === now.toDateString() ? ' today' : '');
    el.innerHTML = '<small>' + wdFmt.format(d).slice(0, 3) + '</small><b>' + d.getDate() + '</b><i class="' + (due ? 'on' : '') + '"></i>';
    el.title = due ? due + ' task' + (due > 1 ? 's' : '') + ' due' : ''; return el;
  }));
}
function tdPaint() {
  tdWeek();
  ['w1', 'w2'].forEach((id, i) => {
    const el = $(id), type = TD.w[i];
    el.innerHTML = '<div class="wh"><select>' + Object.entries(WIDGETS).map(([k, n]) => '<option value="' + k + '"' + (k === type ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></div><div class="wb">' + WR[type]() + '</div>';
    el.querySelector('select').onchange = (e) => { TD.w[i] = e.target.value; tdSave(); tdPaint(); };
    el.querySelectorAll('.wc').forEach((c) => { c.onclick = () => { const z = TD.zones[c.dataset.i]; TD.zones[c.dataset.i] = ZONES[(ZONES.indexOf(z) + 1) % ZONES.length]; tdSave(); tdPaint(); }; });
    const t = el.querySelector('.wtitle'), d = el.querySelector('.wdate');
    if (t) t.onchange = () => { TD.count.title = t.value || 'Countdown'; tdSave(); tdPaint(); };
    if (d) d.onchange = () => { TD.count.date = d.value; tdSave(); tdPaint(); };
  });
}
viewHooks.push((v) => { if (v === 'today') tdPaint(); });
setInterval(() => { if (island.classList.contains('open') && current === 'today' && !document.activeElement.matches?.('input, select')) tdPaint(); }, 20000);
tdPaint();
