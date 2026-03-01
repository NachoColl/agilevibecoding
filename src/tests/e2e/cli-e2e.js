#!/usr/bin/env node
/**
 * AVC CLI — E2E Tests (tmux-based, no interactive terminal required)
 * Run: npm run test:e2e
 *
 * Uses tmux to drive the full interactive CLI in a headless terminal.
 * API keys are loaded from .env (never hardcoded).
 *
 * Requirements: tmux must be installed (`tmux -V` to check).
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '../../');

// ─── Require tmux ─────────────────────────────────────────────────────────────
try {
  execSync('tmux -V', { stdio: 'pipe' });
} catch (_) {
  console.log('\n⚠  E2E tests require tmux to be installed.');
  console.log('   Install tmux and re-run `npm run test:e2e`.\n');
  process.exit(0); // exit 0 so CI doesn't fail — just skips
}

// ─── Load .env — search src/, parent, and grandparent for API keys ────────────
// Outer directories override inner so a repo-level .env can supply keys
// without requiring them to be duplicated inside src/.env.
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  fs.readFileSync(filePath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const k = match[1].trim();
      const v = match[2].trim().replace(/^["']|["']$/g, '');
      if (v) process.env[k] = v; // only set non-empty values; inherited by tmux
    }
  });
}
// Load outermost first so closer directories win on conflict
const parent = path.dirname(SRC_ROOT);
const grandparent = path.dirname(parent);
loadEnv(path.join(grandparent, '.env'));
loadEnv(path.join(parent, '.env'));
loadEnv(path.join(SRC_ROOT, '.env'));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[mGKHFJ]/g, '').replace(/\r/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Synchronous sleep used inside send() to pace tmux key delivery
const sleepSync = ms => execSync(`sleep ${(ms / 1000).toFixed(3)}`);

// ─── CLIDriver (tmux-based) ───────────────────────────────────────────────────
class CLIDriver {
  constructor() {
    // Unique session name — alphanumeric/dash only (safe for tmux and shell)
    this.sessionName = `avc${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    this.scriptPath = null;
  }

  /**
   * Spawn the CLI in `cwd` inside a new detached tmux session.
   * AVC_PROJECT_ROOT is passed via a temp shell script to avoid quoting issues.
   * All other env vars (including API keys) are inherited from process.env.
   */
  spawn(cwd) {
    this.scriptPath = path.join(os.tmpdir(), `${this.sessionName}.sh`);
    fs.writeFileSync(
      this.scriptPath,
      // cd to the test project dir so process.cwd() == tmpDir inside the CLI.
      // AVC_LLM_MOCK=1 replaces all LLM API calls with instant canned responses
      // so the full ceremony flow runs in seconds without a real API key.
      `#!/bin/sh\ncd ${cwd}\nexec env AVC_LLM_MOCK=1 node ${path.join(SRC_ROOT, 'cli/index.js')}\n`,
      { mode: 0o700 }
    );
    // Kill any leftover session with this name, then create a fresh one
    try { execSync(`tmux kill-session -t ${this.sessionName} 2>/dev/null`); } catch (_) {}
    execSync(`tmux new-session -d -s ${this.sessionName} -x 220 -y 50`);
    execSync(`tmux send-keys -t ${this.sessionName} ${this.scriptPath} Enter`);
    return this;
  }

  /** Capture full scrollback + visible area, stripped of ANSI codes */
  capture() {
    try {
      const raw = execSync(`tmux capture-pane -p -S -10000 -t ${this.sessionName}`, { encoding: 'utf8' });
      return stripAnsi(raw);
    } catch (_) { return ''; }
  }

  /**
   * Send a string to the tmux pane.
   * Handles: \r → Enter, \x1b[A → Up, \x1b[B → Down, \x1b → Escape,
   *          all other chars sent one-at-a-time with a 30 ms gap.
   *
   * WHY per-char: Ink's useInput handlers use stale closures (`input + char`
   * instead of `prev => prev + char`). With React 19 automatic batching, if
   * all chars arrive in one pty write they are processed in a single JS event
   * loop tick and only the last setInput() wins — e.g. "/help" → filter="p"
   * → "No matching commands". Sending each char separately lets Ink commit
   * the state update before the next char arrives.
   *
   * Uses execSync (shell invocation) — required for tmux to receive keys
   * correctly in raw-mode panes (spawnSync doesn't work here).
   */
  send(data) {
    let i = 0;
    while (i < data.length) {
      if (data[i] === '\r') {
        sleepSync(150); // let Ink process the last char before Enter
        execSync(`tmux send-keys -t ${this.sessionName} Enter`);
        i++;
      } else if (data.slice(i, i + 3) === '\x1b[A') {
        execSync(`tmux send-keys -t ${this.sessionName} Up`);
        i += 3;
      } else if (data.slice(i, i + 3) === '\x1b[B') {
        execSync(`tmux send-keys -t ${this.sessionName} Down`);
        i += 3;
      } else if (data[i] === '\x1b') {
        execSync(`tmux send-keys -t ${this.sessionName} Escape`);
        i++;
      } else {
        // Send one char at a time so Ink's event loop can commit the state
        // update (setInput) before the next character arrives.
        // 100 ms ≈ 3× the Ink frame time (30 fps = 33 ms/frame), providing
        // comfortable margin on loaded systems (WSL2 I/O variability).
        execSync(`tmux send-keys -t ${this.sessionName} -l ${JSON.stringify(data[i])}`);
        sleepSync(100);
        i++;
      }
    }
    return this;
  }

  /** Poll until captured output contains `str`, or throw on timeout */
  async waitFor(str, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (this.capture().includes(str)) return true;
      await sleep(200);
    }
    const snippet = this.capture().slice(-800);
    throw new Error(`waitFor(${JSON.stringify(str)}) timed out\n--- tail ---\n${snippet}`);
  }

  /** Assert captured output does NOT contain `str` */
  notContains(str, context = '') {
    if (this.capture().includes(str)) {
      throw new Error(`Unexpected content: ${JSON.stringify(str)}${context ? ' — ' + context : ''}`);
    }
    return true;
  }

  /** Return current capture length as a position marker */
  mark() { return this.capture().length; }

  /** Return captured text added since `mark` */
  since(m) { return this.capture().slice(m); }

  /** Capture only the current visible pane (no scrollback) — a point-in-time screen snapshot */
  screen() {
    try {
      const raw = execSync(`tmux capture-pane -p -t ${this.sessionName}`, { encoding: 'utf8' });
      return stripAnsi(raw);
    } catch (_) { return ''; }
  }

  kill() {
    try { execSync(`tmux kill-session -t ${this.sessionName} 2>/dev/null`); } catch (_) {}
    try { if (this.scriptPath) fs.unlinkSync(this.scriptPath); } catch (_) {}
  }
}

// ─── Test runner ──────────────────────────────────────────────────────────────
// All LLM calls are mocked via AVC_LLM_MOCK=1 injected into the CLI process,
// so all tests run unconditionally — no real API key required.
let passed = 0, failed = 0, skipped = 0;
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
    await sleep(300);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
}

// ─── Setup helpers ────────────────────────────────────────────────────────────

/**
 * Start the CLI and wait for the prompt.
 * 30s timeout — Ink loads yoga-layout WASM (10-15s in WSL2) on first render.
 */
async function startCLI(cli, tmpDir) {
  cli.spawn(tmpDir);
  await cli.waitFor('>', 30000);
  // 600 ms: safely past isStableRender (200 ms) AND the 500 ms updateStatus
  // setTimeout (synchronous readFileSync), while staying before the 1000 ms
  // checkForUpdates timer (also synchronous readFileSync).  Ink renders '>'
  // on first frame (mount+0 ms); waitFor may return up to 200 ms later, so
  // we send the first char no earlier than mount+600 ms and no later than
  // mount+800 ms — squarely inside the safe 500–1000 ms window.
  await sleep(600);
}

async function initProject(cli, tmpDir) {
  // Write .env in tmpDir from resolved process.env values.
  // Never copy src/.env directly — it may have empty values that overwrite inherited keys
  // because init.js calls dotenv.config({ override: true }) on the project's .env file.
  const apiKeys = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY'];
  const lines = apiKeys.filter(k => process.env[k] && process.env[k].trim()).map(k => `${k}=${process.env[k]}`);
  if (lines.length) fs.writeFileSync(path.join(tmpDir, '.env'), lines.join('\n') + '\n');
  await startCLI(cli, tmpDir);
  const m = cli.mark();
  cli.send('/init\r');
  await cli.waitFor('Project initialized', 20000);
  // Wait for the prompt to reappear after /init (CLI back at mode='prompt')
  const waitStart = Date.now();
  while (!cli.since(m).includes('>') && Date.now() - waitStart < 10000) {
    await sleep(100);
  }
  await sleep(600); // extra margin for Ink state to settle
}

/**
 * Assert visible screen (no scrollback) for step isolation.
 * mustHave: strings the current step's React component must render on screen.
 * mustNotHave: strings from previous steps that must no longer be visible.
 */
function snap(label, s, mustHave, mustNotHave) {
  for (const str of mustHave) {
    if (!s.includes(str))
      throw new Error(`[${label}] screen missing ${JSON.stringify(str)}\n--- screen ---\n${s}`);
  }
  for (const str of mustNotHave) {
    if (s.includes(str))
      throw new Error(`[${label}] screen has stale/unexpected ${JSON.stringify(str)}\n--- screen ---\n${s}`);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
console.log('\n\x1b[1mAVC CLI — E2E Tests\x1b[0m');
console.log('─'.repeat(52));

console.log('\nBasic Commands');

await test('/help shows command groups', async (cli, tmpDir) => {
  await startCLI(cli, tmpDir);
  cli.send('/help\r');
  await cli.waitFor('Available Commands');
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
  await cli.waitFor('Project initialized', 20000);
  if (!fs.existsSync(path.join(tmpDir, '.avc'))) throw new Error('.avc not created');
});

await test('/init on existing project shows already-initialized', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/init\r');
  await cli.waitFor('already initialized');
});


// ─── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(52));
const total = passed + failed + skipped;
if (failed === 0) {
  const skipNote = skipped > 0 ? `, ${skipped} skipped` : '';
  console.log(`\x1b[32m✓ ${passed}/${total} tests passed\x1b[0m${skipNote}\n`);
} else {
  console.log(`\x1b[31m✗ ${failed}/${total} tests failed\x1b[0m (${skipped} skipped)`);
  failures.forEach(({ name, err }) => {
    console.log(`\n  \x1b[31mFAIL\x1b[0m: ${name}`);
    console.error('  ' + err.message.replace(/\n/g, '\n  '));
  });
  console.log();
  process.exit(1);
}
