import readline from 'readline';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectInitiator } from './init.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AVC REPL - Interactive command-line interface
 * Similar to Claude Code's interactive shell
 */
export class AvcRepl {
  constructor() {
    this.running = false;
    this.rl = null;
    this.version = this.getVersion();
    this.commands = [
      { cmd: '/init', desc: 'Initialize an AVC project (Sponsor Call ceremony)' },
      { cmd: '/status', desc: 'Show current project status' },
      { cmd: '/help', desc: 'Show this help message' },
      { cmd: '/version', desc: 'Show version information' },
      { cmd: '/exit', desc: 'Exit AVC interactive mode' }
    ];
    this.lastInput = '';
    this.commandListShown = false;
  }

  getVersion() {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  }

  showBanner() {
    console.log('\n');
    console.log('AGILE VIBE CODING');
    console.log('═════════════════');
    console.log(`Version: ${this.version}`);
    console.log('Framework for AI-powered Agile development\n');
  }

  showHelp() {
    console.log('\n📚 Available Commands:\n');
    this.commands.forEach(c => {
      console.log(`  ${c.cmd.padEnd(12)} ${c.desc}`);
    });
    console.log('\n');
  }

  showVersion() {
    console.log(`\n🎯 AVC Framework v${this.version}`);
    console.log('   Agile Vibe Coding - AI-powered development framework');
    console.log('   https://agilevibecoding.org\n');
  }

  async handleCommand(command) {
    const cmd = command.trim().toLowerCase();

    switch (cmd) {
      case '/help':
      case '/h':
        this.showHelp();
        break;

      case '/version':
      case '/v':
        this.showVersion();
        break;

      case '/exit':
      case '/quit':
      case '/q':
        console.log('\n👋 Thanks for using AVC!\n');
        this.stop();
        break;

      case '/init':
        await this.runInit();
        break;

      case '/status':
        await this.runStatus();
        break;

      case '':
        // Empty command, just show prompt again
        break;

      default:
        if (cmd.startsWith('/')) {
          console.log(`\n❌ Unknown command: ${cmd}`);
          console.log('   Type /help to see available commands\n');
        } else {
          console.log('\n💡 Commands must start with /');
          console.log('   Example: /init, /status, /help\n');
        }
        break;
    }
  }

  async runInit() {
    console.log(''); // Empty line before init output
    const initiator = new ProjectInitiator();
    await initiator.init();
    console.log(''); // Empty line after init output
  }

  async runStatus() {
    console.log(''); // Empty line before status output
    const initiator = new ProjectInitiator();
    initiator.status();
    console.log(''); // Empty line after status output
  }

  showPrompt() {
    process.stdout.write('> ');
  }

  getTerminalWidth() {
    // Try multiple ways to get terminal width
    return process.stdout.columns ||
           process.stderr.columns ||
           (this.rl && this.rl.output && this.rl.output.columns) ||
           80;
  }

  showTopLine() {
    const width = this.getTerminalWidth();
    console.log('─'.repeat(width));
  }

  showBottomLine() {
    const width = this.getTerminalWidth();
    console.log('─'.repeat(width));
  }

  showInfoLine() {
    console.log('Available: /init /status /help /version /exit | Type / to see commands');
  }

  clearCommandList() {
    if (this.commandListShown) {
      // Clear the command list lines (they're between input line and bottom line)
      // Move down 1 to the first command line
      readline.moveCursor(process.stdout, 0, 1);

      // Clear each command line
      this.commands.forEach(() => {
        readline.clearLine(process.stdout, 0);
        readline.moveCursor(process.stdout, 0, 1);
      });

      // Clear bottom line and redraw it
      readline.clearLine(process.stdout, 0);
      this.showBottomLine();

      // Move cursor back up to input line (past commands + 1 for bottom line)
      readline.moveCursor(process.stdout, 0, -(this.commands.length + 1));
      readline.cursorTo(process.stdout, this.rl.cursor + 2); // +2 for "> "

      this.commandListShown = false;
    }
  }

  showCommandList(filter) {
    // Clear any existing list first
    this.clearCommandList();

    // Don't show list if filter is empty or doesn't start with /
    if (!filter || !filter.startsWith('/')) {
      return;
    }

    // Filter commands
    const filtered = this.commands.filter(c => c.cmd.startsWith(filter));

    if (filtered.length === 0) {
      return;
    }

    // Save cursor position
    const cursorPos = this.rl.cursor;

    // Move to line below input
    readline.moveCursor(process.stdout, 0, 1);

    // Clear the bottom line and write command list
    readline.clearLine(process.stdout, 0);
    filtered.forEach((c, i) => {
      process.stdout.write(`  ${c.cmd.padEnd(12)} ${c.desc}`);
      if (i < filtered.length - 1) {
        process.stdout.write('\n');
      }
    });

    // Write bottom line after commands
    process.stdout.write('\n');
    this.showBottomLine();

    // Move cursor back up to input position
    readline.moveCursor(process.stdout, 0, -(filtered.length + 1));
    readline.cursorTo(process.stdout, cursorPos + 2); // +2 for "> "

    this.commandListShown = true;
  }

  updateCommandList() {
    const currentInput = this.rl.line || '';

    // Only update if input changed
    if (currentInput !== this.lastInput) {
      this.lastInput = currentInput;

      if (currentInput.startsWith('/')) {
        this.showCommandList(currentInput);
      } else if (this.commandListShown) {
        this.clearCommandList();
      }
    }
  }

  completer(line) {
    // Return command names for TAB completion
    if (!line.startsWith('/')) {
      return [[], line];
    }

    const hits = this.commands
      .filter((c) => c.cmd.startsWith(line))
      .map(c => c.cmd);

    return [hits.length ? hits : this.commands.map(c => c.cmd), line];
  }

  start() {
    this.running = true;
    this.showBanner();
    this.showInfoLine();
    console.log(''); // Empty line after info

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '',
      completer: (line) => this.completer(line),
      tabSize: 4
    });

    // Enable keypress events for real-time command list
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
    }

    // Listen for terminal resize events
    process.stdout.on('resize', () => {
      // Terminal was resized - next prompt will use new width automatically
      // since we read width dynamically in getTerminalWidth()
    });

    // Listen for keypress events
    process.stdin.on('keypress', (str, key) => {
      if (!this.running) return;

      // Handle Ctrl+C
      if (key && key.ctrl && key.name === 'c') {
        this.clearCommandList();
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        console.log('\n\n👋 Thanks for using AVC!\n');
        process.exit(0);
      }

      // Handle Enter - clear command list
      if (key && key.name === 'return') {
        this.clearCommandList();
        return;
      }

      // Update command list after keystroke is processed
      setImmediate(() => {
        this.updateCommandList();
      });
    });

    // Show initial prompt with bottom line
    this.showTopLine();
    this.showPrompt();
    process.stdout.write('\n');
    this.showBottomLine();

    // Move cursor back up to input line
    readline.moveCursor(process.stdout, 2, -1); // +2 for "> ", -1 line up

    this.rl.on('line', async (line) => {
      // Clear command list
      this.clearCommandList();

      // Move cursor to after bottom line
      readline.moveCursor(process.stdout, 0, 1);
      process.stdout.write('\n');

      // Disable raw mode for command execution
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }

      // Process command (output appears here)
      await this.handleCommand(line);

      // Re-enable raw mode
      if (process.stdin.isTTY && this.running) {
        process.stdin.setRawMode(true);
      }

      // Show next prompt with bottom line
      if (this.running) {
        this.showTopLine();
        this.showPrompt();
        process.stdout.write('\n');
        this.showBottomLine();

        // Move cursor back up to input line
        readline.moveCursor(process.stdout, 2, -1); // +2 for "> ", -1 line up
      }
    });

    this.rl.on('close', () => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      if (this.running) {
        console.log('\n👋 Thanks for using AVC!\n');
        process.exit(0);
      }
    });
  }

  stop() {
    this.running = false;
    this.clearCommandList();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    if (this.rl) {
      this.rl.close();
    }
    process.exit(0);
  }
}
