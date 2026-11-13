// Starts bt-worker.ps1 the way Duddy does and checks it answers with a device list (and a battery level when a headset is connected).
// Read-only: it never connects, disconnects or mutes anything.
const { spawn } = require('child_process'), path = require('path');
const w = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'bt-worker.ps1'), '-Parent', String(process.pid)], { windowsHide: true });
let buf = '', list = null, bat = null;
w.stdout.setEncoding('utf8').on('data', (d) => { buf += d; for (let i; (i = buf.indexOf('\n')) >= 0;) { const j = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (j.type === 'list') list = j; if (j.type === 'battery') bat = j; } });
setTimeout(() => {
  w.stdin.write('quit\n'); setTimeout(() => w.kill(), 500);
  if (!list) { console.error('FAIL: no device list'); process.exit(1); }
  const on = list.devices.filter((d) => d.connected);
  console.log(`ok: ${list.devices.length} paired, ${on.length} connected, radio=${list.radio}, battery=${bat ? bat.value + '%' : 'n/a'}`);
  process.exit(0);
}, 9000);
