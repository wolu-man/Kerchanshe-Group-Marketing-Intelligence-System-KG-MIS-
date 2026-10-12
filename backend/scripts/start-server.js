// Minimal server launcher that outputs a marker when ready.
const { spawn } = require('child_process');
const path = require('path');

const server = spawn('node', [path.join(__dirname, '..', 'dist', 'index.js')], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (d) => process.stdout.write(d));
server.stderr.on('data', (d) => process.stderr.write(d));

let ready = false;
server.stdout.on('data', (d) => {
  if (!ready && d.toString().includes('listening')) {
    ready = true;
    console.log('SERVER_READY');
  }
});

process.on('SIGTERM', () => { server.kill(); process.exit(0); });
process.on('SIGINT', () => { server.kill(); process.exit(0); });

// Safety timeout
setTimeout(() => {
  if (!ready) { console.error('Server start timeout'); server.kill(); process.exit(1); }
}, 15000);
