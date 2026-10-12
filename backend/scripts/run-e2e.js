/**
 * Combined: starts the server, runs the e2e test, then kills the server.
 * Usage: node scripts/run-e2e.js
 */
const { execSync, spawn } = require('child_process');

function main() {
  console.log('Starting backend server...');
  const server = spawn('node', ['dist/index.js'], {
    cwd: __dirname + '/..',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverReady = false;
  server.stdout.on('data', (data) => {
    const msg = data.toString();
    process.stdout.write('[server] ' + msg);
    if (msg.includes('listening') || msg.includes('port 4000')) serverReady = true;
  });
  server.stderr.on('data', (data) => {
    process.stderr.write('[server:err] ' + data.toString());
  });

  // Wait for server to be ready, then run test
  const maxWait = 15000;
  const start = Date.now();
  const waitInterval = setInterval(() => {
    if (serverReady || Date.now() - start > maxWait) {
      clearInterval(waitInterval);
      if (!serverReady) {
        console.error('Server failed to start within timeout');
        server.kill();
        process.exit(1);
      }
      console.log('\n--- Running e2e test ---\n');
      try {
        execSync('npx tsx scripts/test-e2e-notification-center.ts', {
          cwd: __dirname + '/..',
          stdio: 'inherit',
          timeout: 90000,
        });
        console.log('\n--- E2E test passed ---');
      } catch (err) {
        console.error('\n--- E2E test failed ---');
      }
      console.log('\nShutting down server...');
      server.kill();
      process.exit(0);
    }
  }, 500);
}

main();
