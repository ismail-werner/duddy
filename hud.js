/* ---- HUD: a small pill that folds out of the island for a moment (volume, Caps Lock, charger, timers...) ---- */
const HUD_SHAPE = [344, 66];
const HUD_ICONS = {
  volume: '<path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/>',
  brightness: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  caps: '<path d="M12 4l8 9h-5v4H9v-4H4zM9 20h6"/>',
  lang: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  charge: '<path d="M13 3L6 14h5l-1 7 7-11h-5z"/>',
  wifioff: '<path d="M2 9a15 15 0 0120 0M5 13a10 10 0 0114 0M8.5 16.5a5 5 0 017 0M3 3l18 18"/>',
  wifi: '<path d="M2 9a15 15 0 0120 0M5 13a10 10 0 0114 0M8.5 16.5a5 5 0 017 0"/><circle cx="12" cy="20" r="1"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0116 0v3M4 15h3v5H4zM17 15h3v5h-3z"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  bell: '<path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 004 0"/>',
  moon: '<path d="M20 14.5A8 8 0 119.5 4a6.5 6.5 0 0010.5 10.5z"/>',
  task: '<path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5 3-3M3.5 12l1.5 1.5 3-3M3.5 18l1.5 1.5 3-3"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
};
let hudT;
const hudBusy = () => island.classList.contains('open');
// peek({icon, title, text, value 0-100, ms, tone}): value fills a bar, repeated calls update the same pill in place
async function peek({ icon = 'bell', title = '', text = '', value = null, ms = 1900, tone = 'accent' } = {}) {
  if (hudBusy()) return;
  window.wake?.();
  const d = $('hud'); d.dataset.tone = tone;
  $('hi').innerHTML = '<svg class="icon" viewBox="0 0 24 24">' + (HUD_ICONS[icon] || '') + '</svg>';
  $('hh').textContent = title; $('hs').textContent = text;
  $('hbar').style.display = value == null ? 'none' : 'block'; if (value != null) $('hbar').firstElementChild.style.width = Math.max(0, Math.min(100, value)) + '%';
  clearTimeout(toastT); island.classList.remove('toast');
  if (!island.classList.contains('hud')) { clearTimeout(shrinkT); await bridge.shape(...HUD_SHAPE); island.classList.add('hud'); }
  clearTimeout(hudT); hudT = setTimeout(endPeek, ms);
}
function endPeek() {
  island.classList.remove('hud');
  clearTimeout(shrinkT); shrinkT = setTimeout(() => { if (!['open', 'toast', 'hud'].some((c) => island.classList.contains(c))) bridge.shape(...closedShape()); }, 500);
}
