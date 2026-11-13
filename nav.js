/* ---- navigation: five main tabs, a back-crumb for every other page, live tiles on Home ---- */
const MAIN = ['home', 'music', 'focus', 'tasks', 'chat'];
const SUB_TITLES = { shelf: 'Shelf', today: 'Today', mixer: 'Sound and display', inbox: 'Notifications', settings: 'Settings', prayer: 'Prayer times' };
let from = 'home'; // the main tab a sub page was opened from: "Back" returns there

function tabInd(v) { // the highlight glides under the active tab
  const t = document.querySelector('.tab[data-view="' + v + '"]'), ind = $('tabind');
  if (!t) { ind.style.opacity = 0; return; }
  ind.style.opacity = 1; ind.style.width = t.offsetWidth + 'px'; ind.style.transform = 'translateX(' + t.offsetLeft + 'px)';
}
function navPaint(v) {
  const main = MAIN.includes(v); if (main) from = v;
  island.classList.toggle('sub', !main && v !== 'approval');
  if (!main) { $('c-title').textContent = SUB_TITLES[v] || ''; $('c-from').textContent = from[0].toUpperCase() + from.slice(1); }
  tabInd(v);
  $('t-inbox').classList.toggle('on', v === 'inbox'); $('t-settings').classList.toggle('on', v === 'settings');
  if (v === 'home') tilesPaint();
}
viewHooks.push(navPaint);
$('c-back').onclick = () => view(from);
document.querySelectorAll('.rbtn[data-view]').forEach((b) => { b.onclick = () => view(current === b.dataset.view ? from : b.dataset.view); });
$('tilegrid').onclick = (e) => {
  const t = e.target.closest('.tilex'); if (!t) return; const g = t.dataset.go;
  if (g === 'terminal') $('b-term').click(); else view(g);
};

/* Home: greeting, live meters, tiles with a line of live info each */
function setMeter(k, pct, label) { // an activity ring: the arc grows with the value, the number sits in the middle
  const p = Math.max(0, Math.min(100, pct));
  $('m-' + k).style.strokeDasharray = p + ' 100'; $('m-' + k + '-v').textContent = label ?? Math.round(p) + '%';
  if (k === 'bat') $('rg-bat').dataset.state = $('ring').classList.contains('low') ? 'low' : $('ring').classList.contains('chg') ? 'chg' : '';
}
const dayFmt = new Intl.DateTimeFormat([], { weekday: 'short', day: 'numeric', month: 'short' });
function tilesPaint() {
  const h = new Date().getHours();
  $('greet').textContent = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('ts-today').textContent = dayFmt.format(new Date());
  $('ts-shelf').textContent = shelf.length ? shelf.length + ' file' + (shelf.length > 1 ? 's' : '') : 'Drop files here';
  const n = PR.on && PR.city ? prNext() : null; // Prayer only gets a tile when it is switched on
  $('tile-prayer').hidden = !n; $('tilegrid').classList.toggle('five', !!n); if (n) $('ts-prayer').textContent = n.name + ' ' + hhmm(n.at);
}
window.tilesPaint = tilesPaint;
tilesPaint(); tabInd('home');
window.addEventListener('resize', () => tabInd(current));
