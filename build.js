// Packs Duddy into a real Windows app: Duddy.exe, no node or npm needed to run it.
//   node build.js            -> dist/Duddy/Duddy.exe
//   node build.js --install  -> also copies it to %LOCALAPPDATA%\Programs\Duddy, adds a Start Menu shortcut,
//                               and gives it your GEMINI_API_KEY (%APPDATA%\Duddy\.env)
// No asar on purpose: media.ps1 and duddy-relay.js must stay real files that PowerShell / Claude Code can run.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const out = path.join(__dirname, 'dist', 'Duddy');
const src = path.join(__dirname, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(path.join(src, 'electron.exe'))) throw new Error('Run "npm install" first (Electron is missing).');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });
fs.renameSync(path.join(out, 'electron.exe'), path.join(out, 'Duddy.exe'));
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });
fs.rmSync(path.join(out, 'LICENSES.chromium.html'), { force: true });
for (const f of fs.readdirSync(path.join(out, 'locales'))) if (f !== 'en-US.pak') fs.rmSync(path.join(out, 'locales', f)); // English only: -40 MB

const app = path.join(out, 'resources', 'app'); fs.mkdirSync(app, { recursive: true });
for (const f of ['main.js', 'preload.js', 'hooks.js', 'duddy-relay.js', 'media.ps1', 'index.html']) fs.copyFileSync(path.join(__dirname, f), path.join(app, f));
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'duddy', version: require('./package.json').version, main: 'main.js' }));
console.log('built', out);

if (process.argv.includes('--install')) {
  const dest = path.join(process.env.LOCALAPPDATA, 'Programs', 'Duddy');
  try { execFileSync('taskkill', ['/F', '/IM', 'Duddy.exe'], { stdio: 'ignore' }); } catch {} // not running: fine
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(out, dest, { recursive: true });

  const cfg = path.join(process.env.APPDATA, 'Duddy'); fs.mkdirSync(cfg, { recursive: true });
  const env = path.join(__dirname, '.env');
  if (fs.existsSync(env) && !fs.existsSync(path.join(cfg, '.env'))) fs.copyFileSync(env, path.join(cfg, '.env'));

  const lnk = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Duddy.lnk');
  execFileSync('powershell', ['-NoProfile', '-Command',
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}'); $s.TargetPath = '${path.join(dest, 'Duddy.exe')}'; $s.WorkingDirectory = '${dest}'; $s.Save()`]);
  console.log('installed to', dest, '\nStart Menu shortcut:', lnk);
}
