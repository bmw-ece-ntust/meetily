#!/usr/bin/env node
/**
 * Run Tauri dev or build command
 * No GPU features needed - all transcription is API-backed
 */

const { execSync } = require('child_process');

const VALID_COMMANDS = ['dev', 'build'];

function parseCommand() {
  const command = process.argv[2];
  if (!command || !VALID_COMMANDS.includes(command)) {
    console.error('Usage: node tauri-auto.js [dev|build]');
    process.exit(1);
  }
  return command;
}

function main() {
  const command = parseCommand();
  const tauriCmd = `tauri ${command}`;

  console.log('ℹ️  Transcription handled by ai-meeting-agent API (no local GPU needed)');
  console.log(`🚀 Running: tauri ${command}`);
  console.log('');

  try {
    execSync(tauriCmd, { stdio: 'inherit' });
  } catch (err) {
    process.exit(err.status || 1);
  }
}

main();
