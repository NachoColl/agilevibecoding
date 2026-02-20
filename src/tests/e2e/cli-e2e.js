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
  await cli.waitFor('Project initialized', 20000);
  if (!fs.existsSync(path.join(tmpDir, '.avc'))) throw new Error('.avc not created');
});

await test('/init on existing project shows already-initialized', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/init\r');
  await cli.waitFor('already initialized');
});

console.log('\nSponsor-call Questionnaire (mocked LLM)');

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
  await cli.waitFor('Initial Scope', 15000);
});

await test('deployment strategy selector appears after Q2', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  cli.send('Build a test task manager\r\r');
  await cli.waitFor('Initial Scope', 15000);
  cli.send('MVP with auth and basic todo list\r\r');
  await cli.waitFor('Select deployment strategy:', 15000);
  await cli.waitFor('Local MVP First');
  await cli.waitFor('Cloud Deployment');
});

console.log('\nRegression: Input handler isolation');

await test('Enter in deployment selector does NOT run a command', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  cli.send('Build a test task manager\r\r');
  await cli.waitFor('Initial Scope', 15000);
  cli.send('MVP with auth and basic todo list\r\r');
  await cli.waitFor('Select deployment strategy:', 15000);
  await sleep(500);

  const m = cli.mark();
  cli.send('\r'); // confirm selection
  await sleep(1000);

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
  await cli.waitFor('Initial Scope', 15000);
  cli.send('MVP with auth and basic todo list\r\r');
  await cli.waitFor('Select deployment strategy:', 15000);
  await sleep(500);

  const m = cli.mark();
  cli.send('2');
  await sleep(800);

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
  await cli.waitFor('Initial Scope', 15000);
  cli.send('MVP with auth and basic todo list\r\r');
  await cli.waitFor('Select deployment strategy:', 15000);
  await sleep(500);

  const m = cli.mark();
  cli.send('\x1b[B'); // arrow down
  cli.send('\x1b[A'); // arrow up
  await sleep(800);

  const newOut = cli.since(m);
  if (/>\s*\/\w/.test(newOut)) {
    throw new Error(`Spurious command after arrow keys:\n${newOut.slice(0, 300)}`);
  }
});

console.log('\nSponsor-call Full Flow & UI Snapshots');

// ── Screen-snapshot note ─────────────────────────────────────────────────────
// cli.screen() returns the current VISIBLE pane (50 rows × 220 cols) — a
// point-in-time snapshot showing exactly what is on the terminal right now.
// It does NOT include scrollback history, so it reveals the *active* UI only.
// cli.capture() returns full scrollback — useful for "did this ever appear?"
// Use screen() to assert step isolation; use capture() to confirm output exists.

// Full end-to-end sponsor-call flow:
//   Q1 → Q2 → DeploySelector → [AI: DB analysis] → DbSelector →
//   [AI: architecture] → ArchSelector → [AI: prefill Q3-Q6] →
//   Review Preview → Submit → [AI: ceremony doc] → Done
await test('full questionnaire completes and produces sponsor-call document', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  await cli.waitFor('1/6');

  // Q1: Mission Statement (MANDATORY — must provide text, double-Enter submits)
  cli.send('Build a test task manager app\r\r');
  await cli.waitFor('Initial Scope', 20000);

  // Q2: Initial Scope & Key Features
  cli.send('MVP with task creation and basic auth\r\r');
  await cli.waitFor('Select deployment strategy:', 20000);

  // Deployment Strategy selector → Enter accepts "Local MVP First" (highlighted default)
  cli.send('\r');

  // Mock LLM: database analysis completes instantly → database choice selector appears
  await cli.waitFor('Choose your database approach', 30000);
  // Accept the default "Let AI choose SQL" with Enter
  cli.send('\r');

  // Mock LLM: architecture recommendation completes instantly → architecture selector appears
  await cli.waitFor('Select architecture', 30000);
  // Accept the first (highlighted) architecture with Enter
  cli.send('\r');

  // Mock LLM: Q3–Q6 prefill completes instantly → review preview appears.
  // NOTE: appendAnswersPreview() is NOT called in the AI-prefill flow path,
  // so "Review Your Answers" is never written to the static output buffer.
  // Only the compact AnswersPreviewActions component ("Enter to submit") is shown.
  await cli.waitFor('Enter to submit', 30000);

  // Confirm preview → triggers ceremony document generation (all mocked)
  cli.send('\r');

  // All 5 ceremony stages use mock LLM — completes in seconds.
  await cli.waitFor('Sponsor Call completed', 60000);
  await cli.waitFor('Files created');

  // Verify the output file was written to disk (.avc/project/doc.md)
  const scFile = path.join(tmpDir, '.avc', 'project', 'doc.md');
  if (!fs.existsSync(scFile)) throw new Error('doc.md not created in .avc/project/');
});

await test('each workflow step shows only its own UI — no stale content at any step', async (cli, tmpDir) => {
  await initProject(cli, tmpDir);
  cli.send('/sponsor-call\r');
  await cli.waitFor('Mission Statement');
  await cli.waitFor('1/6');

  // ── Q1: Mission Statement ─────────────────────────────────────────────────
  // Use DYNAMIC (Ink/React component) text as discriminators — static output text
  // from previous steps may still be visible on screen; React component text only
  // appears while that specific component is actively rendered.
  snap('Q1', cli.screen(),
    ['1/6', 'Mission Statement', 'What is the core purpose'],
    ['2/6',
     'Select deployment strategy:',
     'Choose your database approach:',
     'Select architecture:',
     'Enter to submit']);

  cli.send('Build a test task manager\r\r');
  await cli.waitFor('Initial Scope', 20000);
  await cli.waitFor('2/6');

  // ── Q2: Initial Scope & Key Features ─────────────────────────────────────
  // NOTE: progress line shows "1/6 questions answered | Current: 2/6" so '1/6'
  // legitimately appears on Q2 screen. Only assert on dynamic component content.
  snap('Q2', cli.screen(),
    ['2/6', 'Initial Scope', 'Describe the initial scope'],
    ['Select deployment strategy:',
     'Choose your database approach:',
     'Select architecture:',
     'Enter to submit']);

  cli.send('MVP with tasks and auth\r\r');
  // React DeploymentStrategySelector renders its own header — no static pre-selector text.
  await cli.waitFor('Select deployment strategy:', 20000);
  await sleep(500); // let selector render fully

  // ── Deployment Strategy selector ──────────────────────────────────────────
  // Everything shown here is React-only (unmounts on selection).
  // mustNotHave: future-step text that must never appear prematurely.
  snap('DeploySelector', cli.screen(),
    ['Select deployment strategy:', 'Local MVP First', 'Cloud Deployment',
     '↑/↓: Navigate | 1-2',
     'Zero cloud costs',            // Local MVP description — must be visible
     'Best for: Validating ideas',  // Local MVP bestFor  — must be visible
     'Best for: Enterprise'],       // Cloud bestFor      — must be visible
    ['1/6', '2/6',
     'Choose your database approach:',
     'Select architecture:',
     'Enter to submit']);

  // Select "Local MVP First" (Enter confirms the highlighted option)
  cli.send('\r');

  // Mock LLM: database analysis completes instantly → database choice selector appears
  await cli.waitFor('Choose your database approach:', 30000);
  await sleep(500);

  // ── Database choice selector ──────────────────────────────────────────────
  // Static output on screen: DB comparison table + "Deployment strategy: Local MVP First" confirmation.
  // Dynamic (React component only): "Choose your database approach:", choice list.
  // ISOLATION RULE: mustNotHave includes ALL static-buffer header strings from every
  // prior selector stage. If any prior-step header leaks into static output, these fail.
  snap('DbSelector', cli.screen(),
    ['Choose your database approach:', 'SQL', 'NoSQL', '↑/↓: Navigate | 1-4',
     'AI recommends this based on your project requirements',  // choice 1 description (always hardcoded)
     'No database analysis (proceed with general architecture)',  // choice 4 description (always hardcoded)
     'Relational data with ACID guarantees',  // choice 2 description from mock bestFor
     'Flexible document storage'],            // choice 3 description from mock bestFor
    ['Select deployment strategy:',          // React-only (deploy selector)
     'Deployment Strategy',                  // static header — must never appear
     'Choose how you want to deploy your application:',  // static subtitle — must never appear
     '1. Local MVP First',                   // numbered option — must never appear in static
     '2. Cloud Deployment',                  // numbered option — must never appear in static
     '↑/↓: Navigate | 1-2',                 // deploy nav hint (React-only)
     '1/6', '2/6',
     'Select architecture:',
     'Enter to submit']);

  // Accept the default "Let AI choose SQL" with Enter
  cli.send('\r');

  // Mock LLM: architecture recommendation completes instantly → architecture selector appears
  await cli.waitFor('Select architecture:', 30000);
  await sleep(500);

  // ── Architecture selector ─────────────────────────────────────────────────
  // ISOLATION RULE: mustNotHave includes ALL static-buffer header strings from every
  // prior selector stage (deploy + db). Fails if any prior-step header leaks into output.
  snap('ArchSelector', cli.screen(),
    ['Select architecture:', 'Local Hybrid Stack', 'Full Docker Compose',
     '↑/↓: Navigate | 1-N',
     'Express.js/FastAPI backend on localhost',     // arch 1 description from mock — must be visible
     'Experienced developers who want fast debugging',  // arch 1 bestFor from mock — must be visible
     'All services in Docker Compose'],             // arch 2 description from mock — must be visible
    ['Choose your database approach:',        // React-only (db selector)
     '↑/↓: Navigate | 1-4',                  // db nav hint (React-only)
     'AI recommends this based on your project requirements',  // DB choice 1 desc (React-only)
     'No database analysis (proceed with general architecture)',  // DB choice 4 desc (React-only)
     'Database Options Comparison',           // static header from appendDatabaseComparison — must never appear
     'R/W: 70/30',                            // static metrics row from mock — must never appear
     'SQL (e.g., PostgreSQL',                 // static from appendDatabaseComparison — must never appear
     'NoSQL (e.g., MongoDB',                  // static from appendDatabaseComparison — must never appear
     'Select deployment strategy:',           // React-only (deploy selector)
     'Deployment Strategy',                   // static header — must never appear
     'Choose how you want to deploy your application:',  // static subtitle — must never appear
     'Recommended Deployment Architectures',  // static header — must never appear
     'Based on your mission and scope',       // static subtitle — must never appear
     '1/6', '2/6',
     'Enter to submit']);

  // Accept the first (highlighted) architecture with Enter
  cli.send('\r');

  // Mock LLM: Q3–Q6 prefill completes instantly → review preview action hint appears.
  // NOTE: In the normal (AI-prefill) flow, appendAnswersPreview() is NOT called,
  // so "Review Your Answers" is never in the static output. The AnswersPreviewActions
  // React component renders only the action hint ("Enter to submit") in the dynamic area.
  await cli.waitFor('Enter to submit', 30000);
  await sleep(500); // let Ink settle

  // ── Review Answers preview ────────────────────────────────────────────────
  // Use capture() to confirm the hint appeared; use screen() for stale-content checks.
  const previewCapture = cli.capture();
  if (!previewCapture.includes('Enter to submit'))
    throw new Error('[Preview] "Enter to submit" not found in output');

  // AnswersPreview React component owns the full Q&A display (disappears on submit).
  // ISOLATION RULE: mustNotHave includes ALL static-buffer header strings from every
  // prior selector stage (deploy + arch + db). Fails if any leaks into output.
  snap('Preview', cli.screen(),
    ['Type 1-6 to edit a question | Enter to submit | Escape to cancel',  // AnswersPreview hint
     'Review Your Answers',                   // AnswersPreview header — must be visible
     '3. Target Users',                       // Q3 title in review — must be visible
     'Developers and project teams managing software development tasks'],  // Q3 AI-prefilled value from mock
    ['Select deployment strategy:',           // React-only (deploy selector)
     'Deployment Strategy',                   // static header — must never appear
     'Choose how you want to deploy your application:',  // static subtitle — must never appear
     'Choose your database approach:',        // React-only (db selector)
     'AI recommends this based on your project requirements',  // DB choice desc (React-only)
     'No database analysis (proceed with general architecture)',  // DB choice desc (React-only)
     'Database Options Comparison',           // static from appendDatabaseComparison — must never appear
     'R/W: 70/30',                            // static metrics row from mock — must never appear
     'SQL (e.g., PostgreSQL',                 // static from appendDatabaseComparison — must never appear
     'NoSQL (e.g., MongoDB',                  // static from appendDatabaseComparison — must never appear
     'Select architecture:',                  // React-only (arch selector)
     'Recommended Deployment Architectures',  // static header — must never appear
     'Based on your mission and scope',       // static subtitle — must never appear
     '↑/↓: Navigate | 1-N',                  // arch nav hint (React-only)
     '1. [Local] Local Hybrid Stack',         // numbered arch option — must never appear in static
     'Express.js/FastAPI backend on localhost',     // arch description (React-only once added)
     'Experienced developers who want fast debugging',  // arch bestFor (React-only once added)
     '1/6', '2/6']);

  // Submit the preview → triggers ceremony document generation
  cli.send('\r');

  // ── Ceremony completion ───────────────────────────────────────────────────
  // All 5 ceremony stages use mock LLM — completes in seconds.
  await cli.waitFor('Sponsor Call completed', 60000);
  await cli.waitFor('Files created');
  await cli.waitFor('doc.md');
  await cli.waitFor('context.md');

  const completionCapture = cli.capture();
  if (!completionCapture.includes('Sponsor Call completed'))
    throw new Error('[Completion] "Sponsor Call completed" not found');
  if (!completionCapture.includes('Files created'))
    throw new Error('[Completion] "Files created" not found');

  // At completion: all selector/preview components must be gone.
  // 'Review Your Answers' was React-only (AnswersPreview) — disappears immediately
  // when showPreview becomes false on submit, well before Stage 1/5 begins.
  snap('Completion', cli.screen(),
    ['Sponsor Call completed'],
    ['Select deployment strategy:',
     'Choose your database approach:',
     'Select architecture:',
     'Review Your Answers',                            // React-only, gone after submit
     'Type 1-6 to edit a question | Enter to submit',  // React-only, gone after submit
     'Generating cloud migration guide']);

  // Verify output files were written to disk
  const docPath = path.join(tmpDir, '.avc', 'project', 'doc.md');
  const contextPath = path.join(tmpDir, '.avc', 'project', 'context.md');
  const migrationPath = path.join(tmpDir, '.avc', 'DEPLOYMENT_MIGRATION.md');

  if (!fs.existsSync(docPath))
    throw new Error('doc.md not created in .avc/project/');
  if (!fs.existsSync(contextPath))
    throw new Error('context.md not created in .avc/project/');

  // Migration guide must NEVER be created — this feature was intentionally removed
  if (fs.existsSync(migrationPath))
    throw new Error('DEPLOYMENT_MIGRATION.md must not be created (migration guide feature removed)');

  // Verify doc.md has the expected mock-generated content (not empty / template stub)
  const docContent = fs.readFileSync(docPath, 'utf8');
  if (!docContent.includes('Sponsor Call'))
    throw new Error('[doc.md] missing expected content "Sponsor Call"');
  if (!docContent.includes('Mission Statement'))
    throw new Error('[doc.md] missing section "Mission Statement"');

  // Verify context.md has structured project context (mock generateJSON returns contextMarkdown)
  const contextContent = fs.readFileSync(contextPath, 'utf8');
  if (contextContent.trim().length < 50)
    throw new Error('[context.md] file is too short — context generation may have failed');
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
