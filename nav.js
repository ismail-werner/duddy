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
  if (g === 'health') $('b-health').click(); else if (g === 'terminal') $('b-term').click(); else view(g);
};

/* Home: greeting, live meters, tiles with a line of live info each */
function setMeter(k, pct, label) {
  $('m-' + k).style.width = Math.max(0, Math.min(100, pct)) + '%'; $('m-' + k + '-v').textContent = label ?? pct + '%';
  if (k === 'bat') $('m-bat').parentElement.dataset.state = $('ring').classList.contains('low') ? 'low' : $('ring').classList.contains('chg') ? 'chg' : '';
}
const dayFmt = new Intl.DateTimeFormat([], { weekday: 'short', day: 'numeric', month: 'short' });
function tilesPaint() {
  const h = new Date().getHours();
  $('greet').textContent = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('ts-today').textContent = dayFmt.format(new Date());
  $('ts-shelf').textContent = shelf.length ? shelf.length + ' file' + (shelf.length > 1 ? 's' : '') : 'Drop files';
  $('ts-inbox').textContent = unread ? unread + ' new' : 'All read'; $('nb-inbox').textContent = unread > 9 ? '9+' : unread; $('nb-inbox').classList.toggle('on', unread > 0);
  const n = PR.on && PR.city ? prNext() : null, t6 = $('tile6');
  t6.dataset.go = n ? 'prayer' : 'terminal';
  t6.querySelector('u').innerHTML = '<svg class="icon" viewBox="0 0 24 24">' + (n ? '<path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z"/>' : '<path d="M5 7l5 5-5 5M13 18h6"/>') + '</svg>';
  t6.querySelector('u').className = n ? 'g7' : 'g6';
  t6.querySelector('b').textContent = n ? 'Prayer' : 'Terminal'; t6.querySelector('span').textContent = n ? n.name + ' ' + hhmm(n.at) : 'PowerShell';
}
window.tilesPaint = tilesPaint;
tilesPaint(); tabInd('home');
window.addEventListener('resize', () => tabInd(current));
