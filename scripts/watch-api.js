const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const watchRoot = path.resolve(__dirname, '../apps/api/src');
let currentSignature = '';
let child = null;
let restartInFlight = false;

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile() && fullPath.endsWith('.js')) return [fullPath];
    return [];
  });
}

function buildSignature() {
  return listFiles(watchRoot)
    .map((filePath) => `${filePath}:${fs.statSync(filePath).mtimeMs}`)
    .join('|');
}

function startServer() {
  child = spawn('node', ['apps/api/src/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit'
  });
}

function restartServer() {
  if (child) {
    child.kill('SIGTERM');
  }
  startServer();
}

function pollForChanges() {
  if (restartInFlight) return;

  const nextSignature = buildSignature();
  if (nextSignature !== currentSignature) {
    restartInFlight = true;
    currentSignature = nextSignature;
    restartServer();
    setTimeout(() => {
      restartInFlight = false;
    }, 250);
  }
}

process.on('SIGINT', () => {
  if (child) child.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (child) child.kill('SIGTERM');
  process.exit(0);
});

currentSignature = buildSignature();
startServer();
setInterval(pollForChanges, 800);
