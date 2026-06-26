#!/usr/bin/env node
/**
 * Run Tauri dev or build.
 * Local STT has been removed (cloud-only), so no GPU feature detection is needed.
 */

const { execSync } = require('child_process');

const command = process.argv[2];
if (!command || !['dev', 'build'].includes(command)) {
  console.error('Usage: node tauri-auto.js [dev|build]');
  process.exit(1);
}

const tauriCmd = `tauri ${command}`;
console.log(`Running: ${tauriCmd}`);

try {
  execSync(tauriCmd, { stdio: 'inherit' });
} catch (err) {
  process.exit(err.status || 1);
}
