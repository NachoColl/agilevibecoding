import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectInitiator } from './init.js';
import { DocumentationBuilder } from './build-docs.js';
import { UpdateChecker } from './update-checker.js';
import { UpdateInstaller } from './update-installer.js';
import { CommandLogger } from './command-logger.js';
import { BackgroundProcessManager } from './process-manager.js';

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

// Create process manager instance (singleton pattern)
let globalProcessManager = null;

function getProcessManager() {
  if (!globalProcessManager) {
    globalProcessManager = new BackgroundProcessManager();
  }
  return globalProcessManager;
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
  const agileLines = renderLogo('AGILE');
  const vibeLines = renderLogo('VIBE CODING');

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, null, ' '),
    ...agileLines.map((agileLine, i) => {
      const vibeLine = vibeLines[i];
      return React.createElement(Text, { key: i },
        React.createElement(Text, { bold: true, color: LOGO_COLORS[i] }, agileLine),
        React.createElement(Text, { bold: true, color: 'white' }, '   ' + vibeLine)
      );
    }),
    React.createElement(Text, null, ' '),
    React.createElement(Text, null, `v${version}  │  AI-powered Agile development framework`),
    React.createElement(Text, null, ' '),
    React.createElement(Text, { bold: true, color: 'red' }, 'UNDER DEVELOPMENT - DO NOT USE'),
    React.createElement(Text, null, ' '),
    React.createElement(Text, { dimColor: true }, 'Type / to see commands'),
    React.createElement(Text, null, ' ')
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

// Questionnaire questions definition
const questionnaireQuestions = [
  {
    key: 'MISSION_STATEMENT',
    title: 'Mission Statement',
    guidance: 'Describe the core purpose and value proposition of your application',
    example: 'A platform to streamline team collaboration through real-time messaging and task management'
  },
  {
    key: 'TARGET_USERS',
    title: 'Target Users',
    guidance: 'Who will use this application? List user types and their roles',
    example: 'Small business owners, Team managers, Remote workers'
  },
  {
    key: 'INITIAL_SCOPE',
    title: 'Initial Scope',
    guidance: 'What are the main features and functional areas? Focus on MVP',
    example: 'User authentication, Real-time chat, Task boards, File sharing'
  },
  {
    key: 'TECHNICAL_CONSIDERATIONS',
    title: 'Technical Considerations',
    guidance: 'Tech stack, infrastructure, performance requirements, scalability needs',
    example: 'React frontend, Node.js backend, PostgreSQL database, AWS hosting'
  },
  {
    key: 'SECURITY_AND_COMPLIANCE_REQUIREMENTS',
    title: 'Security & Compliance',
    guidance: 'Security measures, data privacy, regulatory compliance (GDPR, HIPAA, etc.)',
    example: 'End-to-end encryption, GDPR compliance, SOC 2 Type II certification'
  }
];

// Question display component
const QuestionDisplay = ({ question, index, total, editMode }) => {
  const helpText = `\n   Enter your response (Enter twice=done, Enter=skip, Esc=cancel):\n`;

  return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
    React.createElement(Text, { bold: true, color: 'white' },
      `\n📝 Question ${index + 1} of ${total}: ${question.title}${editMode ? ' [EDIT MODE]' : ''}`
    ),
    React.createElement(Text, { dimColor: true },
      `   ${question.guidance}`
    ),
    React.createElement(Text, { italic: true, dimColor: true },
      `   Example: "${question.example}"`
    ),
    React.createElement(Text, { dimColor: true }, helpText)
  );
};

// Multi-line input component with line numbers and character count
const MultiLineInput = ({ lines, showLineNumbers = true, showCharCount = true }) => {
  if (lines.length === 0) {
    return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
      React.createElement(Text, { dimColor: true },
        '   > ',
        React.createElement(Text, { inverse: true }, ' ')
      )
    );
  }

  const totalChars = lines.join('\n').length;
  // Fixed width for line numbers to prevent layout shift (supports up to 999 lines)
  const lineNumberWidth = 3;

  return React.createElement(Box, { flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
    ...lines.map((line, idx) => {
      const lineNum = showLineNumbers ? `${String(idx + 1).padStart(lineNumberWidth, ' ')} │ ` : '';
      const prefix = idx === lines.length - 1 ? '   > ' : '     ';
      const isLastLine = idx === lines.length - 1;

      return React.createElement(Text, { key: idx },
        isLastLine ? prefix + lineNum + line : '     ' + lineNum + line,
        isLastLine && React.createElement(Text, { inverse: true }, ' ')
      );
    }),
    showCharCount && React.createElement(Box, { flexShrink: 0 },
      React.createElement(Text, { dimColor: true },
        `\n   ${totalChars} characters`
      )
    )
  );
};

// Questionnaire progress component
const QuestionnaireProgress = ({ current, total, answers, lastSave }) => {
  const answered = Object.keys(answers).length;
  const saveTime = lastSave ? lastSave.toLocaleTimeString() : 'Never';

  return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
    React.createElement(Text, { dimColor: true },
      `\n   Progress: ${answered}/${total} questions answered | Current: ${current + 1}/${total}`
    ),
    React.createElement(Text, { dimColor: true },
      `   Last saved: ${saveTime}`
    )
  );
};

// Answers preview component
const AnswersPreview = ({ answers, questions }) => {
  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' },
      '\n📋 Review Your Answers\n'
    ),
    ...questions.map((question, idx) => {
      const answer = answers[question.key] || '(Skipped - will use AI suggestion)';
      const lines = answer.split('\n');

      return React.createElement(Box, { key: idx, flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text, { bold: true },
          `${idx + 1}. ${question.title}`
        ),
        ...lines.map((line, lineIdx) =>
          React.createElement(Text, { key: lineIdx, dimColor: !answers[question.key] },
            `   ${line}`
          )
        )
      );
    }),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\n   Type 1-5 to edit a question | Enter to submit | Escape to cancel\n'
      )
    )
  );
};

// Remove confirmation component
const RemoveConfirmation = ({ contents, confirmInput }) => {
  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { bold: true, color: 'red' },
      '\n🗑️  Remove AVC Project Structure\n'
    ),
    React.createElement(Text, { color: 'yellow' },
      '⚠️  WARNING: This is a DESTRUCTIVE operation!\n'
    ),
    React.createElement(Text, null,
      'The following will be PERMANENTLY DELETED:\n'
    ),
    contents.length > 0 && React.createElement(Box, { flexDirection: 'column', marginY: 1 },
      React.createElement(Text, { bold: true }, '📁 .avc/ folder contents:'),
      ...contents.map((item, idx) =>
        React.createElement(Text, { key: idx, dimColor: true },
          `   • ${item}`
        )
      )
    ),
    React.createElement(Text, { color: 'red' },
      '\n❌ All project definitions, epics, stories, tasks, and documentation will be lost.'
    ),
    React.createElement(Text, { color: 'red' },
      '❌ All VitePress documentation will be deleted.'
    ),
    React.createElement(Text, { color: 'red' },
      '❌ This action CANNOT be undone.\n'
    ),
    React.createElement(Text, { dimColor: true },
      'ℹ️  Note: The .env file will NOT be deleted.\n'
    ),
    React.createElement(Box, { borderStyle: 'round', borderColor: 'yellow', paddingX: 1, marginY: 1 },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'yellow' },
          'To confirm deletion, type exactly: delete all'
        ),
        React.createElement(Text, { dimColor: true },
          'To cancel, press Escape or type anything else'
        )
      )
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, null, 'Confirmation: '),
      React.createElement(Text, null, confirmInput),
      React.createElement(Text, { inverse: true }, ' ')
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\nPress Enter to confirm | Escape to cancel\n'
      )
    )
  );
};

// Kill external process confirmation component
const KillProcessConfirmation = ({ processInfo, confirmInput }) => {
  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { bold: true, color: 'yellow' },
      '\n⚠️  External Process Using Port\n'
    ),
    React.createElement(Text, null,
      `Port ${processInfo.port} is currently in use by an external process:\n`
    ),
    React.createElement(Box, { flexDirection: 'column', marginY: 1, paddingX: 2 },
      React.createElement(Text, { bold: true },
        `Process: ${processInfo.command}`
      ),
      React.createElement(Text, { dimColor: true },
        `PID: ${processInfo.pid}`
      )
    ),
    React.createElement(Text, { color: 'red' },
      '⚠️  This is NOT an AVC documentation server.\n'
    ),
    React.createElement(Text, null,
      'Killing this process may cause unexpected behavior if it\'s part of\n'
    ),
    React.createElement(Text, null,
      'another application or service you\'re running.\n'
    ),
    React.createElement(Box, { borderStyle: 'round', borderColor: 'yellow', paddingX: 1, marginY: 1 },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'yellow' },
          'Do you want to kill this process anyway?'
        ),
        React.createElement(Text, { dimColor: true },
          'Type "kill" to confirm | Type "no" or press Escape to cancel'
        )
      )
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, null, 'Response: '),
      React.createElement(Text, null, confirmInput),
      React.createElement(Text, { inverse: true }, ' ')
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\nPress Enter to submit | Escape to cancel\n'
      )
    )
  );
};

// Command selector component with number shortcuts and groups
const CommandSelector = ({ onSelect, onCancel, filter }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Organized commands by group (with aliases for filtering)
  const commandGroups = [
    {
      name: 'Project Setup',
      commands: [
        { label: '/init           Initialize an AVC project', value: '/init', aliases: ['/i'] },
        { label: '/documentation  Build and serve documentation', value: '/documentation', aliases: ['/d'] },
        { label: '/remove         Remove AVC project structure', value: '/remove', aliases: ['/rm'] }
      ]
    },
    {
      name: 'Ceremonies',
      commands: [
        { label: '/sponsor-call      Create project foundation', value: '/sponsor-call', aliases: ['/sc'] },
        { label: '/project-expansion  Create Epics and Stories', value: '/project-expansion', aliases: ['/pe'] },
        { label: '/seed <story-id>    Create Tasks and Subtasks', value: '/seed', aliases: [] }
      ]
    },
    {
      name: 'Monitoring',
      commands: [
        { label: '/processes  View background processes', value: '/processes', aliases: ['/p'] },
        { label: '/status     Show current project status', value: '/status', aliases: ['/s'] },
        { label: '/tokens     Show token usage statistics', value: '/tokens', aliases: ['/tk'] }
      ]
    },
    {
      name: 'Information',
      commands: [
        { label: '/help          Show this help message', value: '/help', aliases: ['/h'] },
        { label: '/version       Show version information', value: '/version', aliases: ['/v'] }
      ]
    },
    {
      name: 'System',
      commands: [
        { label: '/restart       Restart AVC', value: '/restart', aliases: [] },
        { label: '/exit          Exit AVC interactive mode', value: '/exit', aliases: ['/q', '/quit'] }
      ]
    }
  ];

  // Flatten all commands
  const allCommands = commandGroups.flatMap(g => g.commands);

  // Filter commands if filter is provided and not just "/"
  // Match by command value OR any of its aliases
  const shouldShowGroups = !filter || filter === '/';
  const filteredCommands = shouldShowGroups
    ? null
    : allCommands.filter(c => {
        const lowerFilter = filter.toLowerCase();
        return c.value.startsWith(lowerFilter) ||
               c.aliases.some(alias => alias.startsWith(lowerFilter));
      });

  const commands = filteredCommands || allCommands;

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(commands.length - 1, selectedIndex + 1));
    } else if (key.return) {
      // Only call onSelect if there are commands and selected item exists
      if (commands.length > 0 && commands[selectedIndex]) {
        onSelect(commands[selectedIndex]);
      } else if (filter && filter.startsWith('/')) {
        // No commands available, but user typed a command - execute it to show unknown command error
        onSelect({ value: filter });
      } else {
        // No filter or non-command input, just cancel
        onCancel();
      }
    } else {
      // Number shortcuts
      const num = parseInt(input);
      if (num >= 1 && num <= commands.length) {
        onSelect(commands[num - 1]);
      }
    }
  }, { isActive: true });

  if (commands.length === 0) {
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, { color: 'yellow' }, 'No matching commands'),
      React.createElement(Text, { dimColor: true }, '(Press Esc to cancel)')
    );
  }

  // Render grouped or filtered view
  if (filteredCommands) {
    // Filtered view - flat list
    return React.createElement(Box, { flexDirection: 'column' },
      ...filteredCommands.map((cmd, idx) =>
        React.createElement(Text, {
          key: cmd.value,
          color: idx === selectedIndex ? 'green' : 'white'
        }, `${idx === selectedIndex ? '› ' : '  '}[${idx + 1}] ${cmd.label}`)
      ),
      React.createElement(Text, { dimColor: true }, '\n(Use arrows, number keys, or Esc to cancel)')
    );
  }

  // Grouped view
  let commandIndex = 0;
  const groupElements = [];

  commandGroups.forEach((group, groupIdx) => {
    // Group header
    groupElements.push(
      React.createElement(Text, {
        key: `header-${groupIdx}`,
        bold: true,
        color: 'cyan',
        dimColor: true
      }, groupIdx === 0 ? `── ${group.name.toUpperCase()} ──` : `\n── ${group.name.toUpperCase()} ──`)
    );

    // Group commands
    group.commands.forEach((cmd) => {
      const isSelected = commandIndex === selectedIndex;
      groupElements.push(
        React.createElement(Text, {
          key: cmd.value,
          color: isSelected ? 'green' : 'white'
        }, `${isSelected ? '› ' : '  '}[${commandIndex + 1}] ${cmd.label}`)
      );
      commandIndex++;
    });
  });

  return React.createElement(Box, { flexDirection: 'column' },
    ...groupElements,
    React.createElement(Text, { dimColor: true }, '\n(Use arrows, number keys, or Esc to cancel)')
  );
};

// Command history display
const HistoryHint = ({ hasHistory }) => {
  if (!hasHistory) return null;

  return React.createElement(Text, { dimColor: true, italic: true },
    '(↑/↓ for history)'
  );
};

// Process viewer component
const ProcessViewer = ({ processes, onSelect, onCancel }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const processList = Array.from(processes.values()).sort(
    (a, b) => new Date(b.startTime) - new Date(a.startTime)
  );

  useInput((input, key) => {
    // Arrow up
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
      return;
    }

    // Arrow down
    if (key.downArrow) {
      setSelectedIndex(Math.min(processList.length - 1, selectedIndex + 1));
      return;
    }

    // Enter - select process
    if (key.return && processList.length > 0) {
      onSelect(processList[selectedIndex]);
      return;
    }

    // Escape - cancel
    if (key.escape) {
      onCancel();
      return;
    }
  }, { isActive: true });

  if (processList.length === 0) {
    return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      React.createElement(Text, null, '\n📦 Background Processes\n'),
      React.createElement(Text, { dimColor: true }, '   No background processes running\n'),
      React.createElement(Text, { dimColor: true }, '   Press Esc to return\n')
    );
  }

  const manager = getProcessManager();

  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, null, '\n📦 Background Processes\n'),
    React.createElement(Text, { dimColor: true },
      `   Select a process to view details (${processList.length} total)\n`
    ),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...processList.map((process, idx) => {
        const isSelected = idx === selectedIndex;
        const statusIcon = process.status === 'running' ? '▶' :
                          process.status === 'stopped' ? '⏸' :
                          process.status === 'exited' ? '✓' : '✗';
        const uptime = manager.formatUptime(manager.getUptime(process.id));

        return React.createElement(Box, { key: process.id },
          React.createElement(Text, {
            bold: isSelected,
            color: isSelected ? 'cyan' : undefined,
            inverse: isSelected
          },
            `   ${isSelected ? '>' : ' '} ${statusIcon} ${process.name} - ${uptime}`
          )
        );
      })
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\n   ↑/↓: Navigate | Enter: View details | Esc: Cancel\n'
      )
    )
  );
};

// Process details viewer component
const ProcessDetailsViewer = ({ process, onBack, onStop }) => {
  const [autoScroll, setAutoScroll] = useState(true);

  useInput((input, key) => {
    // Escape or Backspace - go back
    if (key.escape || key.backspace) {
      onBack();
      return;
    }

    // S - stop process
    if (input === 's' && process.status === 'running') {
      onStop(process.id);
      return;
    }

    // Space - toggle auto-scroll
    if (input === ' ') {
      setAutoScroll(!autoScroll);
      return;
    }
  }, { isActive: true });

  const manager = getProcessManager();
  const uptime = manager.formatUptime(manager.getUptime(process.id));

  // Get recent output (last 50 lines)
  const recentOutput = process.output.slice(-50);

  const statusColor = process.status === 'running' ? 'green' :
                     process.status === 'stopped' ? 'yellow' :
                     process.status === 'exited' ? 'blue' : 'red';

  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    // Header
    React.createElement(Text, { bold: true },
      `\n📦 ${process.name}\n`
    ),

    // Process info
    React.createElement(Box, { flexDirection: 'column', marginBottom: 1 },
      React.createElement(Text, null,
        `   Status: `
      ),
      React.createElement(Text, { color: statusColor, bold: true },
        process.status.toUpperCase()
      ),
      React.createElement(Text, null,
        `\n   PID: ${process.pid || 'N/A'}`
      ),
      React.createElement(Text, null,
        `\n   Uptime: ${uptime}`
      ),
      React.createElement(Text, null,
        `\n   Command: ${process.command}`
      ),
      React.createElement(Text, { dimColor: true },
        `\n   Working dir: ${process.cwd}`
      ),
      process.exitCode !== null && React.createElement(Text, null,
        `\n   Exit code: ${process.exitCode}`
      )
    ),

    // Output section
    React.createElement(Text, { bold: true },
      '\n📄 Recent Output (last 50 lines):\n'
    ),

    recentOutput.length === 0
      ? React.createElement(Text, { dimColor: true }, '   No output yet\n')
      : React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', paddingX: 1 },
          ...recentOutput.map((line, idx) =>
            React.createElement(Text, {
              key: idx,
              color: line.type === 'stderr' ? 'red' : undefined,
              dimColor: line.type === 'stderr'
            },
              line.text
            )
          )
        ),

    // Actions
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\n   '
      ),
      process.status === 'running' && React.createElement(Text, null,
        'S: Stop process | '
      ),
      React.createElement(Text, null,
        'Esc: Back to list'
      )
    )
  );
};

// Input display with cursor
const InputWithCursor = ({ input }) => {
  return React.createElement(Box, { flexShrink: 0 },
    React.createElement(Text, null, '> '),
    React.createElement(Text, null, input),
    React.createElement(Text, { inverse: true }, ' ')
  );
};

// Process status indicator
const ProcessStatusIndicator = ({ processes }) => {
  const runningProcesses = Array.from(processes.values()).filter(
    p => p.status === 'running'
  );

  if (runningProcesses.length === 0) return null;

  if (runningProcesses.length === 1) {
    const process = runningProcesses[0];
    return React.createElement(Text, { dimColor: true },
      `📦 ${process.name} running`
    );
  }

  return React.createElement(Text, { dimColor: true },
    `📦 ${runningProcesses.length} processes running`
  );
};

// Bottom-right status display (version + update info + processes)
const BottomRightStatus = ({ backgroundProcesses }) => {
  const version = getVersion();

  // Option B: Pre-initialize updateState synchronously to prevent post-mount re-render
  const [updateState, setUpdateState] = useState(() => {
    try {
      const checker = new UpdateChecker();
      return checker.readState();
    } catch (error) {
      return null;
    }
  });

  const [width, setWidth] = useState(process.stdout.columns || 80);

  useEffect(() => {
    const handleResize = () => {
      setWidth(process.stdout.columns || 80);
    };

    process.stdout.on('resize', handleResize);
    return () => process.stdout.off('resize', handleResize);
  }, []);

  // Option F: Defer polling to prevent initial layout shifts
  // Start polling after 500ms delay to allow initial render to stabilize
  useEffect(() => {
    const checker = new UpdateChecker();

    const updateStatus = () => {
      const state = checker.readState();
      setUpdateState(state);
    };

    // Defer initial update check to prevent cursor positioning issues
    const initialTimeout = setTimeout(updateStatus, 500);
    const interval = setInterval(updateStatus, 2000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
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

  // Check for running processes (priority: processes > updates > version)
  const runningCount = Array.from(backgroundProcesses.values()).filter(
    p => p.status === 'running'
  ).length;

  if (runningCount > 0) {
    const processIndicator = React.createElement(ProcessStatusIndicator, { processes: backgroundProcesses });
    // Get the text content to calculate padding
    const runningProcesses = Array.from(backgroundProcesses.values()).filter(p => p.status === 'running');
    const processText = runningCount === 1
      ? `📦 ${runningProcesses[0].name} running`
      : `📦 ${runningCount} processes running`;
    const processPadding = Math.max(0, width - processText.length - 2);

    return React.createElement(Box, { justifyContent: 'flex-end' },
      React.createElement(Text, { dimColor: true },
        ' '.repeat(processPadding),
        processText
      )
    );
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

  // Questionnaire state
  const [questionnaireActive, setQuestionnaireActive] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState({});
  const [currentAnswer, setCurrentAnswer] = useState([]);
  const [emptyLineCount, setEmptyLineCount] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState(null);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState(-1);
  const [isEditingFromPreview, setIsEditingFromPreview] = useState(false);

  // Remove confirmation state
  const [removeConfirmActive, setRemoveConfirmActive] = useState(false);
  const [removeConfirmInput, setRemoveConfirmInput] = useState('');
  const [avcContents, setAvcContents] = useState([]);

  // Kill external process confirmation state
  const [killConfirmActive, setKillConfirmActive] = useState(false);
  const [killConfirmInput, setKillConfirmInput] = useState('');
  const [processToKill, setProcessToKill] = useState(null); // { pid, command, port }

  // Background process state
  const [backgroundProcesses, setBackgroundProcesses] = useState(new Map());
  const [processViewerActive, setProcessViewerActive] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState(null);

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

  // Auto-save questionnaire progress every 30 seconds
  useEffect(() => {
    if (!questionnaireActive) return;

    const interval = setInterval(() => {
      autoSaveProgress();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [questionnaireActive, questionnaireAnswers, currentQuestionIndex, currentAnswer]);

  // Sync background processes state
  useEffect(() => {
    const manager = getProcessManager();

    const updateProcesses = () => {
      const processes = new Map();
      for (const p of manager.getAllProcesses()) {
        processes.set(p.id, p);
      }
      setBackgroundProcesses(processes);
    };

    // Initial sync
    updateProcesses();

    // Listen for process events
    manager.on('process-started', updateProcesses);
    manager.on('process-stopped', updateProcesses);
    manager.on('process-exited', updateProcesses);
    manager.on('process-error', updateProcesses);

    return () => {
      manager.removeListener('process-started', updateProcesses);
      manager.removeListener('process-stopped', updateProcesses);
      manager.removeListener('process-exited', updateProcesses);
      manager.removeListener('process-error', updateProcesses);
    };
  }, []);

  // Cleanup background processes on unmount/exit
  useEffect(() => {
    return () => {
      const manager = getProcessManager();
      const running = manager.getRunningProcesses();

      if (running.length > 0) {
        console.log('\n🛑 Stopping background processes...\n');
        manager.stopAll();
      }
    };
  }, []);

  // Available commands for Tab completion (including aliases)
  const allCommands = [
    '/init', '/i',
    '/sponsor-call', '/sc',
    '/project-expansion', '/pe',
    '/seed',
    '/status', '/s',
    '/tokens', '/tk',
    '/remove', '/rm',
    '/documentation', '/d',
    '/processes', '/p',
    '/help', '/h',
    '/version', '/v',
    '/restart',
    '/exit', '/q', '/quit'
  ];

  // Handle Tab key autocomplete
  const handleTabComplete = () => {
    // Only autocomplete if input starts with "/"
    if (!input.startsWith('/')) return;

    // Filter commands that match the current input
    // Exclude exact matches to prefer longer forms (e.g., /init over /i)
    const matches = allCommands.filter(cmd =>
      cmd.toLowerCase().startsWith(input.toLowerCase()) &&
      cmd.toLowerCase() !== input.toLowerCase()
    );

    // If no matches (meaning current input is exact match), try without exclusion
    if (matches.length === 0) {
      const exactMatches = allCommands.filter(cmd =>
        cmd.toLowerCase().startsWith(input.toLowerCase())
      );
      // If there are other commands besides the exact match, use them
      if (exactMatches.length > 1) {
        matches.push(...exactMatches.filter(cmd => cmd.toLowerCase() !== input.toLowerCase()));
      }
    }

    // If exactly one match, complete to that command
    if (matches.length === 1) {
      setInput(matches[0]);
      // Show selector if not already shown
      if (mode !== 'selector') {
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
      '/s': '/status',
      '/sc': '/sponsor-call',
      '/rm': '/remove',
      '/d': '/documentation',
      '/p': '/processes'
    };
    return aliases[cmd.toLowerCase()] || cmd;
  };

  // Handle command execution
  const executeCommand = async (cmd) => {
    try {
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

      // Add command to output history (don't clear previous output)
      setOutput(output + `\n> ${command}\n`);

      // Create command logger
      const commandName = command.replace('/', '').toLowerCase();
      let logger = null;

      // Check if .avc folder exists
      const avcPath = path.join(process.cwd(), '.avc');
      const avcExists = existsSync(avcPath);

      // Only create logger for commands that do actual work
      // For /init, always create logger (it creates .avc)
      // For other commands, only create logger if .avc already exists
      if (['/init', '/sponsor-call', '/status', '/remove'].includes(command.toLowerCase())) {
        if (command.toLowerCase() === '/init' || avcExists) {
          logger = new CommandLogger(commandName);
          logger.start();
        }
      }

      try {
        switch (command.toLowerCase()) {
          case '/help':
            setExecutingMessage('Loading help...');
            setOutput(prev => prev + showHelp());
            break;

          case '/version':
            setExecutingMessage('Loading version info...');
            setOutput(prev => prev + showVersion());
            break;

          case '/exit':
            setIsExecuting(false);
            const manager = getProcessManager();
            const running = manager.getRunningProcesses();

            if (running.length > 0) {
              setOutput(prev => prev + '\n🛑 Stopping background processes...\n');
              const stopped = manager.stopAll();
              setOutput(prev => prev + `   Stopped ${stopped} process(es)\n\n`);
            }

            setOutput(prev => prev + '\n👋 Thanks for using AVC!\n');
            setTimeout(() => {
              exit();
              process.exit(0);
            }, 500);
            return;

          case '/init':
          case '/i':
            setExecutingMessage('Initializing project structure...');
            await runInit();
            break;

          case '/sponsor-call':
          case '/sc':
            setExecutingMessage('Running Sponsor Call ceremony...');
            await runSponsorCall();
            break;

          case '/project-expansion':
          case '/pe':
            setExecutingMessage('Expanding project structure...');
            await runProjectExpansion();
            break;

          case '/seed':
            // Parse story ID from command
            const storyIdMatch = input.match(/^\/seed\s+(\S+)/);
            if (!storyIdMatch) {
              setOutput(prev => prev + '\n❌ Story ID required\n');
              setOutput(prev => prev + '   Usage: /seed <story-id>\n');
              setOutput(prev => prev + '   Example: /seed context-0001-0001\n\n');
              break;
            }
            const storyId = storyIdMatch[1];
            setExecutingMessage(`Seeding story ${storyId}...`);
            await runSeed(storyId);
            break;

          case '/status':
          case '/s':
            setExecutingMessage('Checking project status...');
            await runStatus();
            break;

          case '/tokens':
          case '/tk':
            setExecutingMessage('Analyzing token usage...');
            await runTokens();
            break;

          case '/remove':
          case '/rm':
            setExecutingMessage('Preparing to remove AVC structure...');
            await runRemove();
            break;

          case '/documentation':
          case '/d':
            setExecutingMessage('Building documentation...');
            await runBuildDocumentation();
            break;

          case '/processes':
          case '/p':
            setProcessViewerActive(true);
            setMode('process-viewer');
            break;

          case '/restart':
            setIsExecuting(false);
            const restartManager = getProcessManager();
            const runningOnRestart = restartManager.getRunningProcesses();

            if (runningOnRestart.length > 0) {
              setOutput(prev => prev + '\n🛑 Stopping background processes...\n');
              const stopped = restartManager.stopAll();
              setOutput(prev => prev + `   Stopped ${stopped} process(es)\n\n`);
            }

            setOutput(prev => prev + '🔄 Restarting AVC...\n');
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
              setOutput(prev => prev + `\n❌ Unknown command: ${command}\n   Type /help to see available commands\n   Tip: Try /h for help, /v for version, /q to exit\n`);
            } else {
              setOutput(prev => prev + `\n💡 Commands must start with /\n   Example: /init, /status, /help\n   Tip: Type / and press Enter to see all commands\n`);
            }
        }
      } catch (error) {
        setOutput(prev => prev + `\n❌ Error: ${error.message}\n`);
      } finally {
        // Stop logger and show log file location
        if (logger) {
          logger.stop();
          const logPath = logger.getLogPath();
          if (logPath) {
            console.log(`\n📝 Command log saved: ${logPath}`);
          }

          // Cleanup old logs (keep last 10 per command)
          CommandLogger.cleanupOldLogs();
        }
      }

      // Return to prompt mode (unless in special mode like process-viewer or kill-confirm)
      setIsExecuting(false);
      setTimeout(() => {
        // Clear input first to prevent UI corruption
        setInput('');

        // Only return to prompt if not in a special viewer/confirmation mode
        setMode((currentMode) => {
          if (currentMode === 'process-viewer' || currentMode === 'kill-confirm') {
            return currentMode; // Keep special modes
          }
          return 'prompt';
        });
      }, 100);
    } catch (outerError) {
      // Handle any unexpected errors
      console.error('Unexpected error in executeCommand:', outerError);
      setOutput(prev => prev + `\n❌ Unexpected error: ${outerError.message}\n   Please try again or type /help for assistance\n`);
      setIsExecuting(false);
      setMode('prompt');
      setInput('');
    }
  };

  const showHelp = () => {
    return `
📚 Available Commands:

  /init (or /i)            Create AVC project structure and config files
  /documentation (/d)      Build and serve project documentation
  /sponsor-call (/sc)      Run Sponsor Call ceremony
  /status (or /s)          Show current project status
  /processes (/p)          View and manage background processes
  /remove (or /rm)         Remove AVC project structure
  /help (or /h)            Show this help message
  /version (or /v)         Show version information
  /restart                 Restart AVC (Ctrl+R)
  /exit (or /q)            Exit AVC interactive mode

💡 Tips:
  - Type / and press Enter to see interactive command selector
  - Use arrow keys (↑/↓) to navigate command history
  - Use Tab key to auto-complete commands
  - Use number keys to quickly select commands from the menu
  - Press Esc to cancel command selector or dismiss notifications
  - Press Ctrl+R to restart after updates
  - Background processes are shown in bottom-right corner
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

    setOutput(prev => prev + logs.join('\n') + '\n');
  };

  const runProjectExpansion = async () => {
    const initiator = new ProjectInitiator();

    if (!initiator.isAvcProject()) {
      setOutput(prev => prev + '\n❌ Project not initialized\n\n');
      setOutput(prev => prev + '   Please run /init first to create the project structure.\n\n');
      return;
    }

    const originalLog = console.log;
    let logs = [];
    console.log = (...args) => logs.push(args.join(' '));

    try {
      await initiator.projectExpansion();
    } finally {
      console.log = originalLog;
    }

    setOutput(prev => prev + logs.join('\n') + '\n');
  };

  const runSeed = async (storyId) => {
    const initiator = new ProjectInitiator();

    if (!initiator.isAvcProject()) {
      setOutput(prev => prev + '\n❌ Project not initialized\n\n');
      setOutput(prev => prev + '   Please run /init first to create the project structure.\n\n');
      return;
    }

    const originalLog = console.log;
    let logs = [];
    console.log = (...args) => logs.push(args.join(' '));

    try {
      await initiator.seed(storyId);
    } finally {
      console.log = originalLog;
    }

    setOutput(prev => prev + logs.join('\n') + '\n');
  };

  const runSponsorCall = async () => {
    const initiator = new ProjectInitiator();

    // Check if project is initialized
    if (!initiator.isAvcProject()) {
      setOutput(prev => prev + '\n❌ Project not initialized\n\n');
      setOutput(prev => prev + '   Please run /init first to create the project structure.\n\n');
      return;
    }

    const progressPath = initiator.sponsorCallProgressPath;

    // Check for incomplete progress
    if (initiator.hasIncompleteProgress(progressPath)) {
      const savedProgress = initiator.readProgress(progressPath);

      if (savedProgress && savedProgress.stage !== 'completed') {
        // Resume from saved progress
        setQuestionnaireActive(true);
        setCurrentQuestionIndex(savedProgress.currentQuestionIndex || 0);
        setQuestionnaireAnswers(savedProgress.collectedValues || {});
        setCurrentAnswer(savedProgress.currentAnswer ? savedProgress.currentAnswer.split('\n') : []);
        setOutput(prev => prev + '\n🎯 Sponsor Call Ceremony - Resuming from saved progress\n');
        return;
      }
    }

    // Start fresh
    setQuestionnaireActive(true);
    setCurrentQuestionIndex(0);
    setQuestionnaireAnswers({});
    setCurrentAnswer([]);
    setEmptyLineCount(0);
    setEditMode(false);
    setShowPreview(false);
    setOutput(prev => prev + '\n🎯 Sponsor Call Ceremony - Interactive Questionnaire\n');
  };

  const runSponsorCallWithAnswers = async (answers) => {
    const initiator = new ProjectInitiator();

    // Capture console output
    const originalLog = console.log;
    const originalError = console.error;
    let logs = [];
    console.log = (...args) => logs.push(args.join(' '));
    console.error = (...args) => logs.push(args.join(' '));

    try {
      // Pass answers to ceremony
      await initiator.sponsorCallWithAnswers(answers);
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }

    setOutput(prev => prev + logs.join('\n') + '\n');
  };

  const saveQuestionnaireAnswer = (key, value) => {
    setQuestionnaireAnswers({
      ...questionnaireAnswers,
      [key]: value
    });
  };

  const moveToNextQuestion = () => {
    setCurrentAnswer([]);
    setEmptyLineCount(0);

    // If editing from preview, return to preview after submitting the edit
    if (isEditingFromPreview) {
      setIsEditingFromPreview(false);
      setEditingQuestionIndex(-1);
      setShowPreview(true);
      setQuestionnaireActive(false);
      return;
    }

    if (currentQuestionIndex < questionnaireQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // All questions answered - show preview
      submitQuestionnaire();
    }
  };

  const submitQuestionnaire = () => {
    // Show preview instead of immediate submission
    setShowPreview(true);
  };

  const confirmSubmission = async () => {
    setShowPreview(false);
    setQuestionnaireActive(false);
    setMode('executing');
    setIsExecuting(true);
    setExecutingMessage('Generating project document with AI...');

    // Call ceremony with pre-filled answers
    await runSponsorCallWithAnswers(questionnaireAnswers);

    // Return to prompt mode
    setIsExecuting(false);
    setTimeout(() => {
      setMode('prompt');
      setInput('');
    }, 100);
  };

  const autoSaveProgress = () => {
    if (!questionnaireActive) return;

    try {
      const initiator = new ProjectInitiator();
      const progress = {
        stage: 'questionnaire',
        totalQuestions: questionnaireQuestions.length,
        answeredQuestions: Object.keys(questionnaireAnswers).length,
        collectedValues: questionnaireAnswers,
        currentQuestionIndex,
        currentAnswer: currentAnswer.join('\n'),
        lastUpdate: new Date().toISOString()
      };

      initiator.writeProgress(progress, initiator.sponsorCallProgressPath);
      setLastAutoSave(new Date());
    } catch (error) {
      // Silently fail auto-save
    }
  };

  const runStatus = async () => {
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

    setOutput(prev => prev + logs.join('\n') + '\n');
  };

  const runTokens = async () => {
    const initiator = new ProjectInitiator();

    // Check if project is initialized
    if (!initiator.isAvcProject()) {
      setOutput(prev => prev + '\n❌ Project not initialized\n\n');
      setOutput(prev => prev + '   Please run /init first to create the project structure.\n\n');
      return;
    }

    try {
      const { TokenTracker } = await import('./token-tracker.js');
      const tracker = new TokenTracker();

      // Load token data
      const data = tracker.load();

      let output = '\n📊 Token Usage Report\n\n';

      // Display totals
      output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      output += '  TOTALS (All Ceremonies)\n';
      output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

      const totalsToday = tracker.getTotalsToday();
      const totalsWeek = tracker.getTotalsThisWeek();
      const totalsMonth = tracker.getTotalsThisMonth();
      const totalsAllTime = tracker.getTotalsAllTime();

      output += `📅 Today (${totalsToday.date}):\n`;
      output += `   Input:      ${totalsToday.input.toLocaleString()} tokens\n`;
      output += `   Output:     ${totalsToday.output.toLocaleString()} tokens\n`;
      output += `   Total:      ${totalsToday.total.toLocaleString()} tokens\n`;
      output += `   Executions: ${totalsToday.executions}\n\n`;

      output += `📅 This Week (${totalsWeek.week}):\n`;
      output += `   Input:      ${totalsWeek.input.toLocaleString()} tokens\n`;
      output += `   Output:     ${totalsWeek.output.toLocaleString()} tokens\n`;
      output += `   Total:      ${totalsWeek.total.toLocaleString()} tokens\n`;
      output += `   Executions: ${totalsWeek.executions}\n\n`;

      output += `📅 This Month (${totalsMonth.month}):\n`;
      output += `   Input:      ${totalsMonth.input.toLocaleString()} tokens\n`;
      output += `   Output:     ${totalsMonth.output.toLocaleString()} tokens\n`;
      output += `   Total:      ${totalsMonth.total.toLocaleString()} tokens\n`;
      output += `   Executions: ${totalsMonth.executions}\n\n`;

      output += `📅 All Time:\n`;
      output += `   Input:      ${totalsAllTime.input.toLocaleString()} tokens\n`;
      output += `   Output:     ${totalsAllTime.output.toLocaleString()} tokens\n`;
      output += `   Total:      ${totalsAllTime.total.toLocaleString()} tokens\n`;
      output += `   Executions: ${totalsAllTime.executions}\n`;
      if (totalsAllTime.firstExecution) {
        output += `   First:      ${new Date(totalsAllTime.firstExecution).toLocaleString()}\n`;
      }
      if (totalsAllTime.lastExecution) {
        output += `   Last:       ${new Date(totalsAllTime.lastExecution).toLocaleString()}\n`;
      }

      // Display per-ceremony breakdown
      const ceremonyTypes = tracker.getAllCeremonyTypes();
      if (ceremonyTypes.length > 0) {
        output += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        output += '  BY CEREMONY TYPE\n';
        output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

        for (const ceremonyType of ceremonyTypes) {
          const ceremonyAllTime = tracker.getCeremonyAllTime(ceremonyType);
          output += `🎭 ${ceremonyType}:\n`;
          output += `   Input:      ${ceremonyAllTime.input.toLocaleString()} tokens\n`;
          output += `   Output:     ${ceremonyAllTime.output.toLocaleString()} tokens\n`;
          output += `   Total:      ${ceremonyAllTime.total.toLocaleString()} tokens\n`;
          output += `   Executions: ${ceremonyAllTime.executions}\n`;
          if (ceremonyAllTime.firstExecution) {
            output += `   First:      ${new Date(ceremonyAllTime.firstExecution).toLocaleString()}\n`;
          }
          if (ceremonyAllTime.lastExecution) {
            output += `   Last:       ${new Date(ceremonyAllTime.lastExecution).toLocaleString()}\n`;
          }
          output += '\n';
        }
      }

      output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

      setOutput(prev => prev + output);
    } catch (error) {
      setOutput(prev => prev + `\n❌ Error reading token history: ${error.message}\n\n`);
    }
  };

  const runRemove = async () => {
    const initiator = new ProjectInitiator();

    // Check if project is initialized
    if (!initiator.isAvcProject()) {
      setOutput(prev => prev + '\n⚠️  No AVC project found in this directory.\n\nNothing to remove.\n');
      return;
    }

    // Get AVC contents to display
    const contents = initiator.getAvcContents();
    setAvcContents(contents);

    // Activate remove confirmation mode
    setRemoveConfirmActive(true);
    setRemoveConfirmInput('');
  };

  const confirmRemove = async () => {
    setRemoveConfirmActive(false);
    setMode('executing');
    setIsExecuting(true);
    setExecutingMessage('Deleting AVC project structure...');

    const initiator = new ProjectInitiator();

    // Capture console.log output
    const originalLog = console.log;
    let logs = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
    };

    try {
      // Perform the deletion
      const deletedItems = initiator.getAvcContents();

      // Delete .avc folder
      const fs = await import('fs');
      fs.rmSync(initiator.avcDir, { recursive: true, force: true });

      logs.push('✅ Successfully deleted:\n');
      logs.push('   📁 .avc/ folder and all contents:');
      deletedItems.forEach(item => {
        logs.push(`      • ${item}`);
      });
      logs.push('');

      // Check for .env file
      const path = await import('path');
      const envPath = path.join(initiator.projectRoot, '.env');
      if (fs.existsSync(envPath)) {
        logs.push('ℹ️  Manual cleanup reminder:\n');
        logs.push('   The .env file was NOT deleted and still contains:');
        logs.push('   • ANTHROPIC_API_KEY');
        logs.push('   • GEMINI_API_KEY');
        logs.push('   • (and any other API keys you added)\n');
      }

      logs.push('✅ AVC project structure has been completely removed.\n');
      logs.push('You can re-initialize anytime by running /init\n');
    } catch (error) {
      logs.push(`❌ Error during deletion: ${error.message}\n`);
      logs.push('The .avc folder may be partially deleted.');
      logs.push('You may need to manually remove it.\n');
    } finally {
      console.log = originalLog;
    }

    setOutput(prev => prev + logs.join('\n'));

    // Return to prompt mode
    setIsExecuting(false);
    setTimeout(() => {
      setMode('prompt');
      setInput('');
    }, 100);
  };

  const runBuildDocumentation = async () => {
    const builder = new DocumentationBuilder();
    const manager = getProcessManager();

    // Check if project is initialized
    if (!builder.hasDocumentation()) {
      setOutput(prev => prev + '\n❌ Documentation not found\n\n');
      setOutput(prev => prev + '   Please run /init first to create documentation structure.\n\n');
      return;
    }

    const port = builder.getPort();

    // Check if documentation server is already running (managed process)
    const runningProcesses = manager.getRunningProcesses();
    const existingDocServer = runningProcesses.find(p => p.name === 'Documentation Server');

    if (existingDocServer) {
      // We have a managed process - check if it's actually running
      const portInUse = await builder.isPortInUse(port);

      if (portInUse) {
        // Managed process exists and port is in use - restart it
        setOutput(prev => prev + '\n🔄 Documentation server already running, restarting...\n\n');
        manager.stopProcess(existingDocServer.id);

        // Clean up stopped/finished processes
        manager.cleanupFinished();

        // Wait a bit for the port to be released
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // Managed process exists but port is not in use - it died, clean up
        setOutput(prev => prev + '\n⚠️  Previous documentation server died, starting new one...\n\n');
        manager.stopProcess(existingDocServer.id);

        // Clean up stopped/finished processes
        manager.cleanupFinished();
      }
    } else {
      // No managed process - check if port is in use by external process
      const portInUse = await builder.isPortInUse(port);

      if (portInUse) {
        // Port is in use by external process - find and kill it
        const processInfo = await builder.findProcessUsingPort(port);

        if (processInfo) {
          // Found the process using the port - check if it's AVC documentation
          const isOurDocs = await builder.isDocumentationServer(port);

          if (isOurDocs) {
            // It's confirmed to be AVC documentation server - safe to kill
            setOutput(prev => prev + '\n⚠️  AVC documentation server already running (external process)\n');
            setOutput(prev => prev + `   Process: ${processInfo.command} (PID: ${processInfo.pid})\n`);
            setOutput(prev => prev + '   Killing external process and restarting...\n\n');

            // Try to kill the process
            const killed = await builder.killProcess(processInfo.pid);

            if (!killed) {
              // Failed to kill (permission denied, etc.)
              setOutput(prev => prev + `❌ Failed to kill process ${processInfo.pid}\n\n`);
              setOutput(prev => prev + `   Unable to stop the process (permission denied or process protected).\n`);
              setOutput(prev => prev + `   Please manually stop the process or change the port.\n\n`);
              setOutput(prev => prev + `   To change the port, edit .avc/avc.json:\n`);
              setOutput(prev => prev + `   {\n`);
              setOutput(prev => prev + `     "settings": {\n`);
              setOutput(prev => prev + `       "documentation": {\n`);
              setOutput(prev => prev + `         "port": 5173\n`);
              setOutput(prev => prev + `       }\n`);
              setOutput(prev => prev + `     }\n`);
              setOutput(prev => prev + `   }\n\n`);
              return;
            }

            setOutput(prev => prev + '✓ Process killed successfully\n\n');

            // Remove from process manager if it was a managed process
            manager.removeProcessByPid(processInfo.pid);

            // Wait for port to be released
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            // It's NOT AVC documentation - ask user if they want to kill it anyway
            setProcessToKill({
              pid: processInfo.pid,
              command: processInfo.command,
              port: port
            });
            setKillConfirmActive(true);
            setMode('kill-confirm');
            return;
          }
        } else {
          // Port is in use but couldn't find the process (rare case)
          setOutput(prev => prev + `\n❌ Port ${port} is in use but process could not be identified\n\n`);
          setOutput(prev => prev + `   To change the port, edit .avc/avc.json:\n`);
          setOutput(prev => prev + `   {\n`);
          setOutput(prev => prev + `     "settings": {\n`);
          setOutput(prev => prev + `       "documentation": {\n`);
          setOutput(prev => prev + `         "port": 5173\n`);
          setOutput(prev => prev + `       }\n`);
          setOutput(prev => prev + `     }\n`);
          setOutput(prev => prev + `   }\n\n`);
          return;
        }
      }
    }

    // Build documentation first
    setOutput(prev => prev + '\n📚 Building documentation...\n');

    try {
      await builder.build();
      setOutput(prev => prev + '✓ Documentation built successfully\n\n');
    } catch (error) {
      setOutput(prev => prev + `\n❌ Error: ${error.message}\n\n`);
      return;
    }

    // Start preview server in background
    const processId = manager.startProcess({
      name: 'Documentation Server',
      command: 'npx',
      args: ['vitepress', 'preview', '--port', String(port)],
      cwd: builder.docsDir
    });

    setOutput(prev => prev + '📦 Starting documentation server in background...\n');
    setOutput(prev => prev + `   URL: http://localhost:${port}\n`);
    setOutput(prev => prev + `   View process output: /processes\n\n`);
  };

  // Handle keyboard input in prompt mode
  useInput((inputChar, key) => {
    if (mode !== 'prompt') return;

    // Handle Ctrl+R for restart (re-exec current process)
    if (key.ctrl && inputChar === 'r') {
      const ctrlRManager = getProcessManager();
      const runningOnCtrlR = ctrlRManager.getRunningProcesses();

      if (runningOnCtrlR.length > 0) {
        setOutput(prev => prev + '\n🛑 Stopping background processes...\n');
        const stopped = ctrlRManager.stopAll();
        setOutput(prev => prev + `   Stopped ${stopped} process(es)\n\n`);
      }

      setOutput(prev => prev + '🔄 Restarting AVC...\n');
      setTimeout(() => {
        exit();
        try {
          execSync(process.argv.join(' '), { stdio: 'inherit' });
        } catch { }
        process.exit(0);
      }, 500);
      return;
    }

    // Handle Esc to clear input or dismiss update notification
    if (key.escape) {
      // If there's input, clear it
      if (input.length > 0) {
        setInput('');
        setHistoryIndex(-1);
        return;
      }

      // If no input, dismiss update notification (if any)
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
        setMode('selector');
      }
    }
  }, { isActive: mode === 'prompt' && !questionnaireActive });

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

  // Questionnaire mode input handler
  useInput((inputChar, key) => {
    if (!questionnaireActive || showPreview) return;

    const currentQuestion = questionnaireQuestions[currentQuestionIndex];

    // Edit mode disabled (Ctrl+ shortcuts not available in all environments)
    // Users must provide complete answers in first pass

    // Handle Enter key
    if (key.return) {
      const currentLineText = currentAnswer[currentAnswer.length - 1] || '';

      // Empty line on first input = skip question
      if (currentAnswer.length === 0 && currentLineText === '') {
        console.log('   Skipping - will use AI suggestion...');
        saveQuestionnaireAnswer(currentQuestion.key, null);
        moveToNextQuestion();
        return;
      }

      // Empty line after text = increment empty line counter
      if (currentLineText === '') {
        const newEmptyCount = emptyLineCount + 1;
        setEmptyLineCount(newEmptyCount);

        // Two consecutive empty lines = done with this answer
        if (newEmptyCount >= 1) {
          const answerText = currentAnswer.slice(0, -1).join('\n').trim();
          saveQuestionnaireAnswer(currentQuestion.key, answerText);
          moveToNextQuestion();
          return;
        }
      } else {
        // Non-empty line, add new line for next input
        setCurrentAnswer([...currentAnswer, '']);
        setEmptyLineCount(0);
      }

      return;
    }

    // Handle Backspace
    if (key.backspace || key.delete) {
      const lastLineIndex = currentAnswer.length - 1;
      const lastLine = currentAnswer[lastLineIndex] || '';

      if (lastLine.length > 0) {
        // Remove last character from current line
        const newLines = [...currentAnswer];
        newLines[lastLineIndex] = lastLine.slice(0, -1);
        setCurrentAnswer(newLines);
      } else if (lastLineIndex > 0) {
        // Remove empty line, go back to previous line
        setCurrentAnswer(currentAnswer.slice(0, -1));
      }
      return;
    }

    // Handle Escape (cancel edit or questionnaire)
    if (key.escape) {
      // If editing from preview, return to preview instead of canceling
      if (isEditingFromPreview) {
        setIsEditingFromPreview(false);
        setEditingQuestionIndex(-1);
        setShowPreview(true);
        setQuestionnaireActive(false);
        setCurrentAnswer([]);
        return;
      }

      // Otherwise, cancel entire questionnaire
      setQuestionnaireActive(false);
      setCurrentQuestionIndex(0);
      setQuestionnaireAnswers({});
      setCurrentAnswer([]);
      setMode('prompt');
      setOutput(prev => prev + '\n❌ Questionnaire cancelled\n');
      return;
    }

    // Regular character input
    if (inputChar && !key.ctrl && !key.meta) {
      const lastLineIndex = currentAnswer.length - 1;
      const lastLine = currentAnswer[lastLineIndex] || '';

      const newLines = [...currentAnswer];
      if (newLines.length === 0) {
        newLines.push(inputChar);
      } else {
        newLines[lastLineIndex] = lastLine + inputChar;
      }

      setCurrentAnswer(newLines);
      setEmptyLineCount(0); // Reset on any character input
    }
  }, { isActive: questionnaireActive && !showPreview });

  // Preview mode input handler
  useInput((inputChar, key) => {
    if (!showPreview) return;

    // Enter to confirm submission
    if (key.return) {
      confirmSubmission();
      return;
    }

    // Number keys (1-5) to edit specific question
    if (inputChar >= '1' && inputChar <= '5') {
      const questionNumber = parseInt(inputChar, 10);
      const questionIndex = questionNumber - 1;

      if (questionIndex < questionnaireQuestions.length) {
        // Enter edit mode for this question
        setShowPreview(false);
        setQuestionnaireActive(true);
        setCurrentQuestionIndex(questionIndex);
        setIsEditingFromPreview(true);
        setEditingQuestionIndex(questionIndex);

        // Load existing answer if any
        const question = questionnaireQuestions[questionIndex];
        const existingAnswer = questionnaireAnswers[question.key] || '';
        setCurrentAnswer(existingAnswer.split('\n'));
        setEmptyLineCount(0);
      }
      return;
    }

    // Escape to cancel
    if (key.escape) {
      setShowPreview(false);
      setQuestionnaireActive(false);
      setCurrentQuestionIndex(0);
      setQuestionnaireAnswers({});
      setCurrentAnswer([]);
      setMode('prompt');
      setOutput(prev => prev + '\n❌ Questionnaire cancelled\n');
      return;
    }
  }, { isActive: showPreview });

  // Remove confirmation input handler
  useInput((inputChar, key) => {
    if (!removeConfirmActive) return;

    // Handle Enter key
    if (key.return) {
      if (removeConfirmInput.trim() === 'delete all') {
        // Confirmation matched - proceed with deletion
        confirmRemove();
      } else {
        // Confirmation didn't match - cancel
        setRemoveConfirmActive(false);
        setRemoveConfirmInput('');
        setMode('prompt');
        setOutput(prev => prev + '\n❌ Operation cancelled.\n\nNo files were deleted.\n');
      }
      return;
    }

    // Handle Backspace
    if (key.backspace || key.delete) {
      setRemoveConfirmInput(removeConfirmInput.slice(0, -1));
      return;
    }

    // Handle Escape (cancel)
    if (key.escape) {
      setRemoveConfirmActive(false);
      setRemoveConfirmInput('');
      setMode('prompt');
      setOutput('\n❌ Operation cancelled.\n\nNo files were deleted.\n');
      return;
    }

    // Regular character input
    if (inputChar && !key.ctrl && !key.meta) {
      setRemoveConfirmInput(removeConfirmInput + inputChar);
    }
  }, { isActive: removeConfirmActive });

  // Kill external process confirmation input handler
  useInput(async (inputChar, key) => {
    if (!killConfirmActive) return;

    // Handle Enter key
    if (key.return) {
      const input = killConfirmInput.trim().toLowerCase();

      if (input === 'kill') {
        // User confirmed - kill the process
        setKillConfirmActive(false);
        setKillConfirmInput('');
        setMode('executing');
        setIsExecuting(true);
        setExecutingMessage('Killing external process...');

        const builder = new DocumentationBuilder(process.cwd());
        const killed = await builder.killProcess(processToKill.pid);

        if (!killed) {
          // Failed to kill - reset mode and show error
          setIsExecuting(false);
          setMode('prompt');
          setOutput(prev => prev + `\n❌ Failed to kill process ${processToKill.pid}\n\n`);
          setOutput(prev => prev + `   Unable to stop the process (permission denied or process protected).\n`);
          setOutput(prev => prev + `   Please manually stop the process or change the port.\n\n`);
          setOutput(prev => prev + `   To change the port, edit .avc/avc.json:\n`);
          setOutput(prev => prev + `   {\n`);
          setOutput(prev => prev + `     "settings": {\n`);
          setOutput(prev => prev + `       "documentation": {\n`);
          setOutput(prev => prev + `         "port": 5173\n`);
          setOutput(prev => prev + `       }\n`);
          setOutput(prev => prev + `     }\n`);
          setOutput(prev => prev + `   }\n\n`);
          return;
        }

        setOutput(prev => prev + `\n✓ Process ${processToKill.pid} killed successfully\n\n`);

        // Remove from process manager if it was managed
        const manager = getProcessManager();
        manager.removeProcessByPid(processToKill.pid);

        // Wait for port to be released
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Now proceed with building and starting documentation
        setOutput(prev => prev + '📚 Building documentation...\n');
        setExecutingMessage('Building documentation...');

        try {
          await builder.build();
          setOutput(prev => prev + '✓ Documentation built successfully\n\n');

          setExecutingMessage('Starting documentation server...');

          const port = builder.getPort();
          const manager = getProcessManager();

          const processId = manager.startProcess({
            name: 'Documentation Server',
            command: 'npx',
            args: ['vitepress', 'preview', '--port', String(port)],
            cwd: builder.docsDir
          });

          setOutput(prev => prev + '📦 Starting documentation server in background...\n');
          setOutput(prev => prev + `   URL: http://localhost:${port}\n`);
          setOutput(prev => prev + `   View process output: /processes\n\n`);
        } catch (error) {
          setOutput(prev => prev + `\n❌ Error: ${error.message}\n\n`);
        } finally {
          setIsExecuting(false);
          setMode('prompt');
        }

      } else if (input === 'no' || input === 'n' || input === '') {
        // User cancelled
        setKillConfirmActive(false);
        setKillConfirmInput('');
        setMode('prompt');
        setOutput(prev => prev + '\n❌ Operation cancelled.\n\n');
        setOutput(prev => prev + `   To change the port, edit .avc/avc.json:\n`);
        setOutput(prev => prev + `   {\n`);
        setOutput(prev => prev + `     "settings": {\n`);
        setOutput(prev => prev + `       "documentation": {\n`);
        setOutput(prev => prev + `         "port": 5173\n`);
        setOutput(prev => prev + `       }\n`);
        setOutput(prev => prev + `     }\n`);
        setOutput(prev => prev + `   }\n\n`);
      } else {
        // Invalid input
        setKillConfirmActive(false);
        setKillConfirmInput('');
        setMode('prompt');
        setOutput(prev => prev + '\n❌ Invalid response. Operation cancelled.\n\n');
      }
      return;
    }

    // Handle Backspace
    if (key.backspace || key.delete) {
      setKillConfirmInput(killConfirmInput.slice(0, -1));
      return;
    }

    // Handle Escape (cancel)
    if (key.escape) {
      setKillConfirmActive(false);
      setKillConfirmInput('');
      setMode('prompt');
      setOutput(prev => prev + '\n❌ Operation cancelled.\n\n');
      return;
    }

    // Regular character input
    if (inputChar && !key.ctrl && !key.meta) {
      setKillConfirmInput(killConfirmInput + inputChar);
    }
  }, { isActive: killConfirmActive });

  // Process viewer handlers
  const handleProcessSelect = (process) => {
    setSelectedProcessId(process.id);
  };

  const handleProcessViewerCancel = () => {
    setProcessViewerActive(false);
    setSelectedProcessId(null);
    setMode('prompt');
    setInput('');
  };

  const handleProcessDetailsBack = () => {
    setSelectedProcessId(null);
  };

  const handleProcessStop = (processId) => {
    const manager = getProcessManager();
    manager.stopProcess(processId);
    setOutput(prev => prev + `\n✓ Process stopped\n`);
    // Stay on details view to see final output
  };

  // Render process viewer
  const renderProcessViewer = () => {
    if (!processViewerActive) return null;

    if (selectedProcessId) {
      const process = backgroundProcesses.get(selectedProcessId);
      if (!process) {
        // Process no longer exists
        setSelectedProcessId(null);
        return null;
      }

      return React.createElement(ProcessDetailsViewer, {
        process,
        onBack: handleProcessDetailsBack,
        onStop: handleProcessStop
      });
    }

    return React.createElement(ProcessViewer, {
      processes: backgroundProcesses,
      onSelect: handleProcessSelect,
      onCancel: handleProcessViewerCancel
    });
  };

  // Render output - show questionnaire, preview, remove confirmation, spinner, or output
  const renderOutput = () => {
    // Show kill confirmation if active
    if (killConfirmActive) {
      return React.createElement(Box, { marginY: 1 },
        React.createElement(KillProcessConfirmation, {
          processInfo: processToKill,
          confirmInput: killConfirmInput
        })
      );
    }

    // Show remove confirmation if active
    if (removeConfirmActive) {
      return React.createElement(Box, { marginY: 1 },
        React.createElement(RemoveConfirmation, {
          contents: avcContents,
          confirmInput: removeConfirmInput
        })
      );
    }

    // Show preview if active
    if (showPreview) {
      return React.createElement(Box, { marginY: 1 },
        React.createElement(Text, null, output),
        React.createElement(AnswersPreview, {
          answers: questionnaireAnswers,
          questions: questionnaireQuestions
        })
      );
    }

    // Show questionnaire if active
    if (questionnaireActive) {
      const currentQuestion = questionnaireQuestions[currentQuestionIndex];

      return React.createElement(Box, { flexDirection: 'column', flexShrink: 0, overflow: 'hidden' },
        React.createElement(Text, null, output),
        React.createElement(QuestionDisplay, {
          question: currentQuestion,
          index: currentQuestionIndex,
          total: questionnaireQuestions.length,
          editMode: editingQuestionIndex !== -1
        }),
        React.createElement(MultiLineInput, {
          lines: currentAnswer,
          showLineNumbers: true,
          showCharCount: true
        }),
        React.createElement(QuestionnaireProgress, {
          current: currentQuestionIndex,
          total: questionnaireQuestions.length,
          answers: questionnaireAnswers,
          lastSave: lastAutoSave
        })
      );
    }

    // Show spinner while executing
    if (isExecuting) {
      return React.createElement(Box, { marginY: 1, flexShrink: 0 },
        React.createElement(LoadingSpinner, { message: executingMessage })
      );
    }

    // Show output if available (even after returning to prompt mode)
    if (output) {
      return React.createElement(Box, { marginY: 1, flexShrink: 0 },
        React.createElement(Text, null, output)
      );
    }

    return null;
  };

  // Render selector when in selector mode
  const renderSelector = () => {
    if (mode !== 'selector') return null;

    return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
      React.createElement(InputWithCursor, { input: input }),
      React.createElement(Box, { marginTop: 1, flexShrink: 0 },
        React.createElement(CommandSelector, {
          filter: input,
          onSelect: (item) => {
            if (item && item.value) {
              executeCommand(item.value);
            } else {
              // Invalid item, return to prompt
              setMode('prompt');
              setInput('');
            }
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
    if (mode !== 'prompt' || questionnaireActive || showPreview || removeConfirmActive || killConfirmActive || processViewerActive) return null;

    return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
      React.createElement(InputWithCursor, { input: input }),
      React.createElement(HistoryHint, { hasHistory: commandHistory.length > 0 })
    );
  };

  return React.createElement(Box, { flexDirection: 'column', overflow: 'hidden' },
    React.createElement(Banner),
    renderOutput(),
    renderProcessViewer(),
    renderSelector(),
    renderPrompt(),
    !questionnaireActive && !showPreview && !removeConfirmActive && !killConfirmActive && !processViewerActive && React.createElement(BottomRightStatus, { backgroundProcesses })
  );
};

// Export render function
export function startRepl() {
  // Set environment variable to indicate REPL mode
  process.env.AVC_REPL_MODE = 'true';

  // Set up signal handlers for graceful shutdown
  const cleanupAndExit = (signal) => {
    const manager = getProcessManager();
    const running = manager.getRunningProcesses();

    if (running.length > 0) {
      console.log('\n\n🛑 Stopping background processes...');
      const stopped = manager.stopAll();
      console.log(`   Stopped ${stopped} process(es)\n`);
    }

    console.log('👋 Thanks for using AVC!\n');
    process.exit(0);
  };

  // Handle Ctrl+C (SIGINT)
  process.on('SIGINT', () => {
    cleanupAndExit('SIGINT');
  });

  // Handle kill signal (SIGTERM)
  process.on('SIGTERM', () => {
    cleanupAndExit('SIGTERM');
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('\n\n❌ Uncaught exception:', error.message);
    const manager = getProcessManager();
    const running = manager.getRunningProcesses();

    if (running.length > 0) {
      console.log('\n🛑 Stopping background processes...');
      manager.stopAll();
    }

    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('\n\n❌ Unhandled promise rejection:', reason);
    const manager = getProcessManager();
    const running = manager.getRunningProcesses();

    if (running.length > 0) {
      console.log('\n🛑 Stopping background processes...');
      manager.stopAll();
    }

    process.exit(1);
  });

  console.clear();
  render(React.createElement(App));
}
