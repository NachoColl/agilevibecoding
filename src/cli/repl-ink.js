import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectInitiator } from './init.js';
import { UpdateChecker } from './update-checker.js';
import { UpdateInstaller } from './update-installer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get version from package.json (cached once at startup)
let _cachedVersion = null;
function getVersion() {
  if (_cachedVersion) return _cachedVersion;
  try {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    _cachedVersion = packageJson.version;
  } catch {
    _cachedVersion = 'unknown';
  }
  return _cachedVersion;
}

// ASCII art letter definitions (4 chars wide, 6 rows tall; I is 3 wide)
const LOGO_LETTERS = {
  'A': [' ██ ', '█  █', '█  █', '████', '█  █', '█  █'],
  'G': [' ██ ', '█   ', '█   ', '█ ██', '█  █', ' ██ '],
  'I': ['███', ' █ ', ' █ ', ' █ ', ' █ ', '███'],
  'L': ['█   ', '█   ', '█   ', '█   ', '█   ', '████'],
  'E': ['████', '█   ', '███ ', '█   ', '█   ', '████'],
  'V': ['█  █', '█  █', '█  █', '█  █', ' ██ ', ' ██ '],
  'B': ['███ ', '█  █', '███ ', '█  █', '█  █', '███ '],
  'C': [' ███', '█   ', '█   ', '█   ', '█   ', ' ███'],
  'O': [' ██ ', '█  █', '█  █', '█  █', '█  █', ' ██ '],
  'D': ['███ ', '█  █', '█  █', '█  █', '█  █', '███ '],
  'N': ['█  █', '██ █', '█ ██', '█  █', '█  █', '█  █'],
};

// Gradient colors top to bottom
const LOGO_COLORS = ['#04e762', '#f5b700', '#dc0073', '#008bf8', '#dc0073', '#04e762'];

function renderLogo(text) {
  const HEIGHT = 6;
  const words = text.split(' ');
  const lines = [];

  for (let row = 0; row < HEIGHT; row++) {
    const wordParts = words.map(word => {
      return [...word].map(ch => {
        const letter = LOGO_LETTERS[ch.toUpperCase()];
        return letter ? letter[row] : '    ';
      }).join(' ');
    });
    lines.push(wordParts.join('   '));
  }

  return lines;
}

// Banner component with ASCII art logo
const Banner = () => {
  const version = getVersion();
  const logoLines = renderLogo('AGILE VIBE CODING');

  return React.createElement(Box, { flexDirection: 'column', marginBottom: 1 },
    React.createElement(Text, null, ' '),
    ...logoLines.map((line, i) =>
      React.createElement(Text, { bold: true, color: LOGO_COLORS[i] }, '  ' + line)
    ),
    React.createElement(Text, null, ' '),
    React.createElement(Text, null, `  v${version}  │  AI-powered Agile development framework`),
    React.createElement(Text, null, ' '),
    React.createElement(Text, { bold: true, color: 'red' }, '  ⚠️  UNDER DEVELOPMENT - DO NOT USE  ⚠️'),
    React.createElement(Text, null, ' '),
    React.createElement(Text, { dimColor: true }, '  Type / to see commands')
  );
};

// Separator line component
const Separator = () => {
  const [width, setWidth] = useState(process.stdout.columns || 80);

  useEffect(() => {
    const handleResize = () => {
      setWidth(process.stdout.columns || 80);
    };

    process.stdout.on('resize', handleResize);
    return () => process.stdout.off('resize', handleResize);
  }, []);

  return React.createElement(Text, null, '─'.repeat(width));
};

// Loading spinner component
const LoadingSpinner = ({ message }) => {
  return React.createElement(Box, null,
    React.createElement(Text, { color: 'green' },
      React.createElement(Spinner, { type: 'dots' }),
      ' ',
      message
    )
  );
};

// Command selector component with number shortcuts
const CommandSelector = ({ onSelect, onCancel, filter }) => {
  const allCommands = [
    { label: '/init        Initialize an AVC project (Sponsor Call ceremony)', value: '/init', key: '1' },
    { label: '/status      Show current project status', value: '/status', key: '2' },
    { label: '/help        Show this help message', value: '/help', key: '3' },
    { label: '/version     Show version information', value: '/version', key: '4' },
    { label: '/exit        Exit AVC interactive mode', value: '/exit', key: '5' }
  ];

  // Filter commands if filter is provided
  const commands = filter
    ? allCommands.filter(c => c.value.startsWith(filter.toLowerCase()))
    : allCommands;

  // Add number prefix to labels
  const commandsWithNumbers = commands.map((cmd, idx) => ({
    ...cmd,
    label: `[${idx + 1}] ${cmd.label}`
  }));

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
    }
    // Number shortcuts
    const num = parseInt(input);
    if (num >= 1 && num <= commands.length) {
      onSelect(commands[num - 1]);
    }
  }, { isActive: true });

  if (commands.length === 0) {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { color: 'yellow' }, 'No matching commands'),
      React.createElement(Text, { dimColor: true }, '(Press Esc to cancel)')
    );
  }

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(SelectInput, { items: commandsWithNumbers, onSelect: onSelect }),
    React.createElement(Text, { dimColor: true }, '(Use arrows, number keys, or Esc to cancel)')
  );
};

// Command history display
const HistoryHint = ({ hasHistory }) => {
  if (!hasHistory) return null;

  return React.createElement(Text, { dimColor: true, italic: true },
    '(↑/↓ for history)'
  );
};

// Input display with cursor
const InputWithCursor = ({ input }) => {
  return React.createElement(Box, null,
    React.createElement(Text, null, '> '),
    React.createElement(Text, null, input),
    React.createElement(Text, { inverse: true }, ' ')
  );
};

// Bottom-right status display (version + update info)
const BottomRightStatus = () => {
  const version = getVersion();
  const [updateState, setUpdateState] = useState(null);
  const [width, setWidth] = useState(process.stdout.columns || 80);

  useEffect(() => {
    const handleResize = () => {
      setWidth(process.stdout.columns || 80);
    };

    process.stdout.on('resize', handleResize);
    return () => process.stdout.off('resize', handleResize);
  }, []);

  // Poll update state every 2 seconds
  useEffect(() => {
    const checker = new UpdateChecker();

    const updateStatus = () => {
      const state = checker.readState();
      setUpdateState(state);
    };

    updateStatus(); // Initial read
    const interval = setInterval(updateStatus, 2000);

    return () => clearInterval(interval);
  }, []);

  // Build status text
  let statusText = `v${version}`;
  let statusColor = 'gray';

  if (updateState && updateState.updateAvailable && !updateState.userDismissed) {
    if (updateState.updateReady) {
      statusText = `v${version} → v${updateState.downloadedVersion} ready! (Ctrl+R)`;
      statusColor = 'green';
    } else if (updateState.updateStatus === 'downloading') {
      statusText = `v${version} → v${updateState.latestVersion} downloading...`;
      statusColor = 'blue';
    } else if (updateState.updateStatus === 'failed') {
      statusText = `v${version} | Update failed`;
      statusColor = 'red';
    } else if (updateState.updateStatus === 'pending' || updateState.updateStatus === 'idle') {
      statusText = `v${version} → v${updateState.latestVersion} available`;
      statusColor = 'yellow';
    }
  }

  // Calculate padding to align to the right
  const padding = Math.max(0, width - statusText.length - 2);

  return React.createElement(Box, { justifyContent: 'flex-end' },
    React.createElement(Text, { dimColor: statusColor === 'gray', color: statusColor === 'gray' ? undefined : statusColor },
      ' '.repeat(padding),
      statusText
    )
  );
};

// Main App component
const App = () => {
  const { exit } = useApp();
  const [mode, setMode] = useState('prompt'); // 'prompt' | 'selector' | 'executing'
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingMessage, setExecutingMessage] = useState('');

  // Start update checker on mount
  useEffect(() => {
    const checker = new UpdateChecker();
    const installer = new UpdateInstaller();

    // Perform first update check immediately
    checker.checkForUpdates().catch(() => {
      // Silently fail
    });

    // Start background checker (checks every hour after first check)
    checker.startBackgroundChecker();

    // Auto-trigger update installation if available
    setTimeout(() => {
      installer.autoTriggerUpdate().catch(() => {
        // Silently fail
      });
    }, 5000); // Wait 5 seconds after startup to avoid blocking
  }, []);

  // Available commands for Tab completion
  const allCommands = [
    '/init',
    '/status',
    '/help',
    '/version',
    '/exit'
  ];

  // Handle Tab key autocomplete
  const handleTabComplete = () => {
    // Only autocomplete if input starts with "/"
    if (!input.startsWith('/')) return;

    // Filter commands that match the current input
    const matches = allCommands.filter(cmd =>
      cmd.toLowerCase().startsWith(input.toLowerCase())
    );

    // If exactly one match, complete to that command
    if (matches.length === 1) {
      setInput(matches[0]);
      // Show selector if not already shown
      if (mode !== 'selector') {
        setOutput('');
        setMode('selector');
      }
    }
    // If multiple matches, complete to common prefix
    else if (matches.length > 1) {
      // Find common prefix
      let commonPrefix = matches[0];
      for (let i = 1; i < matches.length; i++) {
        let j = 0;
        while (j < commonPrefix.length && j < matches[i].length &&
          commonPrefix[j].toLowerCase() === matches[i][j].toLowerCase()) {
          j++;
        }
        commonPrefix = commonPrefix.substring(0, j);
      }

      // If common prefix is longer than current input, use it
      if (commonPrefix.length > input.length) {
        setInput(commonPrefix);
      }

      // Show selector if not already shown
      if (mode !== 'selector') {
        setOutput('');
        setMode('selector');
      }
    }
  };

  // Command aliases
  const resolveAlias = (cmd) => {
    const aliases = {
      '/h': '/help',
      '/v': '/version',
      '/q': '/exit',
      '/quit': '/exit',
      '/i': '/init',
      '/s': '/status'
    };
    return aliases[cmd.toLowerCase()] || cmd;
  };

  // Handle command execution
  const executeCommand = async (cmd) => {
    const command = resolveAlias(cmd.trim());

    if (!command) {
      setMode('prompt');
      setInput('');
      return;
    }

    // Add to history (avoid duplicates of last command)
    if (command && (commandHistory.length === 0 || commandHistory[commandHistory.length - 1] !== command)) {
      setCommandHistory([...commandHistory, command]);
    }
    setHistoryIndex(-1);

    setMode('executing');
    setIsExecuting(true);
    setOutput(''); // Clear previous output

    try {
      switch (command.toLowerCase()) {
        case '/help':
          setExecutingMessage('Loading help...');
          setOutput(showHelp());
          break;

        case '/version':
          setExecutingMessage('Loading version info...');
          setOutput(showVersion());
          break;

        case '/exit':
          setIsExecuting(false);
          setOutput('\n👋 Thanks for using AVC!\n');
          setTimeout(() => {
            exit();
            process.exit(0);
          }, 500);
          return;

        case '/init':
          setExecutingMessage('Initializing project...');
          await runInit();
          break;

        case '/status':
          setExecutingMessage('Checking project status...');
          await runStatus();
          break;

        case '/restart':
          setIsExecuting(false);
          setOutput('\n🔄 Restarting AVC...\n');
          setTimeout(() => {
            exit();
            try {
              execSync(process.argv.join(' '), { stdio: 'inherit' });
            } catch { }
            process.exit(0);
          }, 500);
          return;

        default:
          if (command.startsWith('/')) {
            setOutput(`\n❌ Unknown command: ${command}\n   Type /help to see available commands\n   Tip: Try /h for help, /v for version, /q to exit\n`);
          } else {
            setOutput(`\n💡 Commands must start with /\n   Example: /init, /status, /help\n   Tip: Type / and press Enter to see all commands\n`);
          }
      }
    } catch (error) {
      setOutput(`\n❌ Error: ${error.message}\n`);
    }

    // Return to prompt mode
    setIsExecuting(false);
    setTimeout(() => {
      setMode('prompt');
      setInput('');
    }, 100);
  };

  const showHelp = () => {
    return `
📚 Available Commands:

  /init (or /i)      Initialize an AVC project (Sponsor Call ceremony)
  /status (or /s)    Show current project status
  /help (or /h)      Show this help message
  /version (or /v)   Show version information
  /restart           Restart AVC (Ctrl+R)
  /exit (or /q)      Exit AVC interactive mode

💡 Tips:
  - Type / and press Enter to see interactive command selector
  - Use arrow keys (↑/↓) to navigate command history
  - Use Tab key to auto-complete commands
  - Use number keys (1-5) to quickly select commands from the menu
  - Press Esc to cancel command selector or dismiss notifications
  - Press Ctrl+R to restart after updates
`;
  };

  const showVersion = () => {
    const version = getVersion();
    return `
🎯 AVC Framework v${version}
   Agile Vibe Coding - AI-powered development framework
   https://agilevibecoding.org
`;
  };

  const runInit = async () => {
    setOutput('\n'); // Empty line before init output
    const initiator = new ProjectInitiator();

    // Capture console.log output
    const originalLog = console.log;
    let logs = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
    };

    try {
      await initiator.init();
    } finally {
      console.log = originalLog;
    }

    setOutput(logs.join('\n') + '\n');
  };

  const runStatus = async () => {
    setOutput('\n'); // Empty line before status output
    const initiator = new ProjectInitiator();

    // Capture console.log output
    const originalLog = console.log;
    let logs = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
    };

    try {
      initiator.status();
    } finally {
      console.log = originalLog;
    }

    setOutput(logs.join('\n') + '\n');
  };

  // Handle keyboard input in prompt mode
  useInput((inputChar, key) => {
    if (mode !== 'prompt') return;

    // Handle Ctrl+R for restart (re-exec current process)
    if (key.ctrl && inputChar === 'r') {
      setOutput('\n🔄 Restarting AVC...\n');
      setTimeout(() => {
        exit();
        try {
          execSync(process.argv.join(' '), { stdio: 'inherit' });
        } catch { }
        process.exit(0);
      }, 500);
      return;
    }

    // Handle Esc to dismiss update notification
    if (key.escape) {
      const checker = new UpdateChecker();
      const state = checker.readState();
      if (state.updateAvailable && !state.userDismissed) {
        state.userDismissed = true;
        state.dismissedAt = new Date().toISOString();
        checker.writeState(state);
      }
      return;
    }

    // Handle up/down arrows for history
    if (key.upArrow && commandHistory.length > 0) {
      const newIndex = historyIndex === -1
        ? commandHistory.length - 1
        : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setInput(commandHistory[newIndex]);
      return;
    }

    if (key.downArrow && historyIndex !== -1) {
      const newIndex = historyIndex + 1;
      if (newIndex >= commandHistory.length) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
      return;
    }

    // Handle Tab key for autocomplete
    if (key.tab) {
      handleTabComplete();
      return;
    }

    // Handle Enter key
    if (key.return) {
      if (input === '/' || input.startsWith('/')) {
        // If just "/" or partial command, show/stay in selector
        if (input === '/') {
          setOutput(''); // Clear previous output
          setMode('selector');
          setInput(''); // Clear input when entering selector
        } else {
          // Execute the typed command or selected command
          executeCommand(input);
        }
      } else {
        // Execute command
        executeCommand(input);
      }
      return;
    }

    // Handle backspace
    if (key.backspace || key.delete) {
      const newInput = input.slice(0, -1);
      setInput(newInput);
      setHistoryIndex(-1);

      // If we're in selector mode and user deletes the "/", exit selector
      if (mode === 'selector' && !newInput.startsWith('/')) {
        setMode('prompt');
      }
      return;
    }

    // Handle character input
    if (inputChar) {
      const newInput = input + inputChar;
      setInput(newInput);
      setHistoryIndex(-1);

      // Show selector immediately when "/" is typed
      if (newInput === '/' || (newInput.startsWith('/') && newInput.length > 1)) {
        setOutput(''); // Clear previous output
        setMode('selector');
      }
    }
  }, { isActive: mode === 'prompt' });

  // Handle keyboard input in selector mode
  useInput((inputChar, key) => {
    if (mode !== 'selector') return;

    // Handle Tab key for autocomplete
    if (key.tab) {
      handleTabComplete();
      return;
    }

    // Handle backspace
    if (key.backspace || key.delete) {
      const newInput = input.slice(0, -1);
      setInput(newInput);

      // If user deletes the "/", exit selector
      if (!newInput.startsWith('/')) {
        setMode('prompt');
      }
      return;
    }

    // Handle character input (typing continues to filter)
    if (inputChar && !key.ctrl && !key.meta) {
      const newInput = input + inputChar;
      setInput(newInput);
    }
  }, { isActive: mode === 'selector' });

  // Render output - show spinner during execution, or output after completion
  const renderOutput = () => {
    // Show spinner while executing
    if (isExecuting) {
      return React.createElement(React.Fragment, null,
        React.createElement(Separator),
        React.createElement(Box, { marginY: 1 },
          React.createElement(LoadingSpinner, { message: executingMessage })
        )
      );
    }

    // Show output if available (even after returning to prompt mode)
    if (output) {
      return React.createElement(React.Fragment, null,
        React.createElement(Separator),
        React.createElement(Box, { marginY: 1 },
          React.createElement(Text, null, output)
        )
      );
    }

    return null;
  };

  // Render selector when in selector mode
  const renderSelector = () => {
    if (mode !== 'selector') return null;

    return React.createElement(React.Fragment, null,
      React.createElement(Separator),
      React.createElement(Box, { flexDirection: 'column', marginY: 1 },
        React.createElement(Box, { marginBottom: 1 },
          React.createElement(InputWithCursor, { input: input })
        ),
        React.createElement(CommandSelector, {
          filter: input,
          onSelect: (item) => {
            executeCommand(item.value);
          },
          onCancel: () => {
            setMode('prompt');
            setInput('');
          }
        })
      )
    );
  };

  // Render prompt when in prompt mode
  const renderPrompt = () => {
    if (mode !== 'prompt') return null;

    return React.createElement(React.Fragment, null,
      React.createElement(Separator),
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(InputWithCursor, { input: input }),
        React.createElement(HistoryHint, { hasHistory: commandHistory.length > 0 })
      ),
      React.createElement(Separator)
    );
  };

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Banner),
    renderOutput(),
    renderSelector(),
    renderPrompt(),
    React.createElement(BottomRightStatus)
  );
};

// Export render function
export function startRepl() {
  console.clear();
  render(React.createElement(App));
}
