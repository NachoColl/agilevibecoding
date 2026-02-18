#!/usr/bin/env node
/**
 * AVC CLI — E2E Tests (requires real interactive terminal)
 * Run: npm run test:e2e
 *
 * Uses node-pty to drive the full interactive CLI, testing Ink rendering and
 * input handler behaviour. API keys are loaded from .env (never hardcoded).
 *
 * NOTE: This script must be run in a real terminal with a TTY.
 *       It will print a warning and exit gracefully if no TTY is detected.
 */

import pty from 'node-pty';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '../../');

// ─── Require TTY ──────────────────────────────────────────────────────────────
if (!process.stdout.isTTY) {
  console.log('\n⚠  E2E tests require an interactive terminal (TTY).');
  console.log('   Run `npm run test:e2e` from your terminal, not from CI or a pipe.\n');
  process.exit(0); // exit 0 so it doesn't fail CI — just skips
}

// ─── Load .env (API keys only, never hardcoded) ───────────────────────────────
const envPath = path.join(SRC_ROOT, '.env');
const envVars = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) envVars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[mGKHFJ]/g, '').replace(/\r/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── CLIDriver ────────────────────────────────────────────────────────────────
class CLIDriver {
  constructor() {
    this.raw = '';
    this.text = '';
    this.proc = null;
  }

  /** Spawn the CLI in `cwd` (the test project directory) */
  spawn(cwd) {
    this.proc = pty.spawn('node', ['cli/index.js'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: SRC_ROOT,
      env: {
        ...process.env,
        ...envVars,          // load keys from .env, not hardcoded
        AVC_PROJECT_ROOT: cwd,
      }
    });
    this.proc.on('data', d => {
      this.raw += d;
      this.text = stripAnsi(this.raw);
    });
    return this;
  }

  send(text) { this.proc.write(text); return this; }

  async waitFor(str, timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.text.includes(str)) return true;
      await sleep(30);
    }
    const snippet = this.text.slice(-600);
    throw new Error(`waitFor(${JSON.stringify(str)}) timed out\n--- tail ---\n${snippet}`);
  }

  notContains(str, context = '') {
    if (this.text.includes(str)) {
      throw new Error(`Unexpected content: ${JSON.stringify(str)}${context ? ' — ' + context : ''}`);
    }
    return true;
  }

  /** Return text appended since mark */
  since(mark) { return this.text.slice(mark); }

  mark() { return this.text.length; }

  kill() { try { this.proc?.kill(); } catch (_) {} }
}

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  const cli = new CLIDriver();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'avc-e2e-'));
  try {
    await fn(cli, tmpDir);
    console.log('\x1b[32mPASS\x1b[0m');
    passed++;
  } catch (err) {
    console.log('\x1b[31mFAIL\x1b[0m');
    console.error(`    ${err.message.split('\n')[0]}`);
    failures.push({ name, err });
    failed++;
  } finally {
    cli.kill();
    await sleep(150);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ─── Setup helpers ────────────────────────────────────────────────────────────
async function startCLI(cli, tmpDir) {
  cli.spawn(tmpDir);
  await cli.waitFor('>', 10000);
  await sleep(400);
}

async function initProject(cli, tmpDir) {
  await startCLI(cli, tmpDir);
  cli.send('/init\r');
  await cli.waitFor('Project initialized', 10000);
  await sleep(400);
}

// ─── Tests ────────────────────────────────────────────────────────────────────
console.log('\n\x1b[1mAVC CLI — E2E Tests\x1b[0m');
console.log('─'.repeat(52));

console.log('\nBasic Commands');

await test('/help shows command groups', async (cli, tmpDir) => {
  await startCLI(cli, tmpDir);
  cli.send('/help\r');
  await cli.waitFor('Available Commands');
  await cli.waitFor('/sponsor-call');
});

await test('/version shows AVC and Node labels', async (cli, tmpDir) => {
  await startCLI(cli, tmpDir);
  cli.send('/version\r');
  await cli.waitFor('AVC');
  await cli.waitFor('Node');
});

await test('non-command shows "must start with /"', async (cli, tmpDir) => {
  await startCLI(cli, tmpDir);
  cli.send('hello\r');
  await cli.waitFor('must start with /');
});

await test('/exit shows goodbye', async (cli, tmpDir) => {
  await startCLI(cli, tmpDir);
  cli.send('/exit\r');
  await cli.waitFor('Thanks for using AVC');
});

console.log('\nProject Init');

await test('/init creates .avc structure', async (cli, tmpDir) => {
  await startCLI(cli, tmpDir);
  cli.send('/init\r');
  await cli.waitFor('Project initialized', 10000);
  if (!fs.existsSync(path.join(tmpDir, '.avc'))) throw new Error('.avc not created');
});

await test('/init on existing project shows already-initialized', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/init\r');
  await cli.waitFor('already initialized');
});

console.log('\nSponsor-call Questionnaire (no LLM)');

await test('questionnaire starts after /sponsor-call', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  await cli.waitFor('1/6');
});

await test('Q1 double-Enter advances to Q2', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  cli.send('Build a test task manager\r\r');
  await cli.waitFor('Initial Scope', 10000);
});

await test('deployment strategy selector appears after Q2', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  cli.send('Build a test task manager\r\r');
  await cli.waitFor('Initial Scope', 10000);
  cli.send('MVP with auth and basic todo list\r\r');
  await cli.waitFor('Deployment Strategy', 10000);
  await cli.waitFor('Local MVP First');
  await cli.waitFor('Cloud Deployment');
});

console.log('\nRegression: Input handler isolation');

await test('Enter in deployment selector does NOT run a command', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  cli.send('Build a test task manager\r\r');
  await cli.waitFor('Initial Scope', 10000);
  cli.send('MVP with auth and basic todo list\r\r');
  await cli.waitFor('Deployment Strategy', 10000);
  await sleep(500);

  const m = cli.mark();
  cli.send('\r'); // confirm selection
  await sleep(800);

  const newOut = cli.since(m);
  if (/>\s*\/\w/.test(newOut)) {
    throw new Error(`Spurious command in output after Enter:\n${newOut.slice(0, 300)}`);
  }
});

await test('"2" in deployment selector does NOT emit spurious command', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  cli.send('Build a test task manager\r\r');
  await cli.waitFor('Initial Scope', 10000);
  cli.send('MVP with auth and basic todo list\r\r');
  await cli.waitFor('Deployment Strategy', 10000);
  await sleep(500);

  const m = cli.mark();
  cli.send('2');
  await sleep(600);

  const newOut = cli.since(m);
  if (/>\s*\/\w/.test(newOut)) {
    throw new Error(`Spurious command after pressing "2":\n${newOut.slice(0, 300)}`);
  }
});

await test('arrow keys in selector do NOT produce spurious command', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  cli.send('Build a test task manager\r\r');
  await cli.waitFor('Initial Scope', 10000);
  cli.send('MVP with auth and basic todo list\r\r');
  await cli.waitFor('Deployment Strategy', 10000);
  await sleep(500);

  const m = cli.mark();
  cli.send('\x1b[B'); // arrow down
  cli.send('\x1b[A'); // arrow up
  await sleep(600);

  const newOut = cli.since(m);
  if (/>\s*\/\w/.test(newOut)) {
    throw new Error(`Spurious command after arrow keys:\n${newOut.slice(0, 300)}`);
  }
});

// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(52));
if (failed === 0) {
  console.log(`\x1b[32m✓ All ${passed + failed} tests passed\x1b[0m\n`);
} else {
  console.log(`\x1b[31m✗ ${failed}/${passed + failed} tests failed\x1b[0m`);
  failures.forEach(({ name, err }) => {
    console.log(`\n  \x1b[31mFAIL\x1b[0m: ${name}`);
    console.error('  ' + err.message.replace(/\n/g, '\n  '));
  });
  console.log();
  process.exit(1);
}
