/* ---- To-do with reminders: give a task a time and the notch taps you on the shoulder when it's due ---- */
// overrides paintTasks / the add box from core.js (this file loads after it)
function parseDue(text) {
  const now = new Date(); let due = null, t = text;
  let m = t.match(/\b(?:in)\s+(\d{1,3})\s*(min(?:ute)?s?|m|h(?:ours?|rs?)?)\b/i);
  if (m) { due = Date.now() + Number(m[1]) * (/^h/i.test(m[2]) ? 3600000 : 60000); t = t.replace(m[0], ''); }
  else if ((m = t.match(/\b(?:at|@)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i))) {
    let h = Number(m[1]); const min = Number(m[2] || 0), ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && min < 60) { const d = new Date(now); d.setHours(h, min, 0, 0); if (d <= now) d.setDate(d.getDate() + 1); due = d.getTime(); t = t.replace(m[0], ''); }
  }
  if (due && /\btomorrow\b/i.test(t)) { due += 86400000 * (new Date(due).getDate() === now.getDate() ? 1 : 0); t = t.replace(/\btomorrow\b/i, ''); }
  return { t: t.replace(/\s{2,}/g, ' ').trim(), due };
}
const dueLabel = (ts) => {
  const d = new Date(ts), today = new Date(), tm = new Date(Date.now() + 86400000), hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toDateString() === today.toDateString() ? hm : d.toDateString() === tm.toDateString() ? 'Tomorrow ' + hm : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + hm;
};

function paintTasks() {
  $('tcount').textContent = tasks.filter((t) => !t.done).length + ' open';
  const list = [...tasks.keys()].sort((a, b) => (tasks[a].done - tasks[b].done) || ((tasks[a].due || 9e15) - (tasks[b].due || 9e15)));
  $('tasklist').replaceChildren(...list.map((i) => {
    const t = tasks[i], d = document.createElement('div'); d.className = 'task' + (t.done ? ' done' : '');
    const c = document.createElement('i'); c.onclick = () => { t.done = !t.done; store.set('tasks', tasks); paintTasks(); scheduleReminder(); if (t.done) snd('done'); };
    const s = document.createElement('span'); s.textContent = t.t; d.append(c, s);
    if (t.due) { const e = document.createElement('em'); e.textContent = dueLabel(t.due); e.className = !t.done && t.due < Date.now() ? 'late' : ''; d.append(e); }
    const x = document.createElement('button'); x.textContent = '×'; x.onclick = () => { tasks.splice(i, 1); store.set('tasks', tasks); paintTasks(); scheduleReminder(); };
    d.append(x); return d;
  }));
  if (!tasks.length) $('tasklist').innerHTML = '<div class="empty">Nothing to do. Add a task, or try<br>"call mom at 18:30" or "stretch in 20 min".</div>';
}
let dueSet = null;
const showDue = () => { $('taskclock').classList.toggle('set', !!dueSet); $('taskclock').title = dueSet ? 'Reminder ' + dueLabel(dueSet) : 'Set a reminder'; };
$('taskclock').onclick = () => { try { $('taskdue').showPicker(); } catch { $('taskdue').focus(); } };
$('taskdue').onchange = () => { dueSet = $('taskdue').value ? new Date($('taskdue').value).getTime() : null; showDue(); };
$('taskadd').onkeydown = (e) => {
  if (e.key !== 'Enter' || !e.target.value.trim()) return;
  const p = parseDue(e.target.value.trim()), due = dueSet || p.due;
  tasks.unshift({ t: p.t || e.target.value.trim(), done: false, ...(due ? { due } : {}) });
  e.target.value = ''; dueSet = null; $('taskdue').value = ''; showDue();
  store.set('tasks', tasks); paintTasks(); scheduleReminder(); snd('poke');
};

let remT;
function scheduleReminder() { // one timer, always aimed at the next due task
  clearTimeout(remT);
  const next = tasks.filter((t) => t.due && !t.done && !t.fired).sort((a, b) => a.due - b.due)[0];
  if (next) remT = setTimeout(fireReminders, Math.min(Math.max(0, next.due - Date.now()), 2 ** 31 - 1));
}
function fireReminders() {
  const now = Date.now(), due = tasks.filter((t) => t.due && !t.done && !t.fired && t.due <= now + 1000);
  for (const t of due) {
    t.fired = true; snd('done'); mood('happy', 1600);
    peek({ icon: 'task', title: 'Reminder', text: t.t, ms: 7000, tone: 'warn' });
    bridge.toast('Reminder', t.t); // also a Windows notification (shows on the lock screen if Windows allows it)
    if (island.classList.contains('open')) status.textContent = 'Reminder: ' + t.t;
  }
  store.set('tasks', tasks); paintTasks(); scheduleReminder();
}
paintTasks(); fireReminders(); // anything that came due while Duddy was closed fires now
