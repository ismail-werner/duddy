// Dev aid, only runs with DUDDY_PERF=1: opens/closes the island a few times, records every frame time and writes
// %TEMP%\duddy-perf.json, then quits. A frame over ~20 ms is a visible hitch at 60 Hz.
const fs = require('fs'), os = require('os'), path = require('path');
module.exports = (win, app) => {
  win.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 4500));
    const stats = await win.webContents.executeJavaScript(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      let frames = [], last = performance.now(), run = true;
      (function f(t) { if (!run) return; frames.push(t - last); last = t; requestAnimationFrame(f); })(last);
      const sum = () => { const a = frames.slice(2).sort((x, y) => x - y); const r = { frames: a.length, avg: +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(1), p95: +a[Math.floor(a.length * .95)].toFixed(1), max: +a[a.length - 1].toFixed(1), over20: a.filter((x) => x > 20).length }; frames = []; return r; };
      const out = {}; out.sync = {};
      const timed = (v) => { const t = performance.now(); view(v); out.sync[v] = +(performance.now() - t).toFixed(1); };
      frames = []; await wait(1000); out.idle = sum();
      open(); await wait(1000); out.open = sum();
      hovering = false; close(); await wait(900); sum();
      open(); await wait(1000); out.openAgain = sum(); // same animation a second time: shows whether the first one pays a warm-up cost
      view('chat'); await wait(900); out.toChat = sum();
      view('mixer'); await wait(900); out.toMixer = sum();
      view('tasks'); await wait(900); out.toTasks = sum();
      view('shelf'); await wait(900); out.toShelf = sum();
      timed('today'); await wait(900); out.toToday = sum();
      view('focus'); await wait(900); out.toFocus = sum();
      view('home'); await wait(900); out.toHome = sum();
      hovering = false; close(); await wait(900); out.close = sum();
      run = false; return out;
    })()`);
    stats.gpu = app.getGPUFeatureStatus();
    fs.writeFileSync(path.join(os.tmpdir(), 'duddy-perf.json'), JSON.stringify(stats, null, 1));
    app.quit();
  });
};
