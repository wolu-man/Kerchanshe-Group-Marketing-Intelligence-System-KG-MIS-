const { spawn } = require('child_process');

const child = spawn('node', ['node_modules/.bin/tsx', 'src/index.ts'], {
  cwd: 'C:\\2026 Projects\\MIS\\backend',
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true
});

child.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
});

child.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

child.on('close', (code) => {
  console.log(`Process exited with code ${code}`);
});

child.on('error', (err) => {
  console.error('Failed to start:', err);
});

setTimeout(() => {
  console.log('Timeout - killing process');
  child.kill();
}, 60000);