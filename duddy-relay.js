// Claude Code hook -> Duddy. Run by Claude Code (through Git Bash) as: node duddy-relay.js <EventName>
// Reads the hook JSON from stdin, hands it to Duddy on localhost and prints Duddy's answer.
// If Duddy isn't running it prints nothing and exits 0, so Claude Code behaves exactly as if this hook didn't exist.
const fs = require('fs'), path = require('path'), http = require('http');

let cfg;
try { cfg = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'Duddy', 'hook.json'), 'utf8')); } catch { process.exit(0); }

let body = '';
process.stdin.on('data', (d) => { body += d; }).on('end', () => {
  const req = http.request({
    host: '127.0.0.1', port: cfg.port, path: '/hook?event=' + encodeURIComponent(process.argv[2] || ''), method: 'POST',
    headers: { 'x-duddy': cfg.token, 'content-type': 'application/json' },
  }, (res) => {
    let out = '';
    res.on('data', (d) => { out += d; }).on('end', () => { if (out) process.stdout.write(out); process.exit(0); });
  });
  req.on('error', () => process.exit(0));
  req.end(body);
});
