import React, { useState, useEffect, useMemo, useRef } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { execSync } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';
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
    React.createElement(Text, { dimColor: true }, 'Type / to see commands (check https://agilevibecoding.org to learn how to use AVC framework)'),
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

// Loading spinner component with two-line status
const LoadingSpinner = ({ message, substep }) => {
  return React.createElement(Box, { flexDirection: 'column' },
    // Line 1: Main status (green)
    React.createElement(Box, null,
      React.createElement(Text, { color: 'green' },
        React.createElement(Spinner, { type: 'dots' }),
        ' ',
        message
      )
    ),
    // Line 2: Substep (yellow, indented, only if exists)
    substep ? React.createElement(Box, { marginLeft: 2 },
      React.createElement(Text, { color: 'yellow' }, `└─ ${substep}`)
    ) : null
  );
};

// Questionnaire questions definition
const questionnaireQuestions = [
  {
    key: 'MISSION_STATEMENT',
    title: 'Mission Statement',
    guidance: 'What is the core purpose and value proposition of your application?',
    example: 'Enable small businesses to manage inventory and sales through an intuitive mobile-first platform that syncs across devices and provides real-time analytics.'
  },
  {
    key: 'TARGET_USERS',
    title: 'Target Users',
    guidance: 'Who will use this application? Describe the user types and their roles.',
    example: 'Small business owners managing daily operations, inventory managers tracking stock levels, sales staff processing orders, and administrators overseeing system configuration.'
  },
  {
    key: 'INITIAL_SCOPE',
    title: 'Initial Scope & Key Features',
    guidance: 'Describe the initial scope: key features, main workflows, and core functionality. What will users be able to do?',
    example: 'Users can create and manage tasks, assign them to team members with due dates, track progress through kanban boards, receive notifications for updates, and generate reports on team productivity.'
  },
  {
    key: 'DEPLOYMENT_TARGET',
    title: 'Deployment Target & Hosting Platform',
    guidance: 'Where will this application run? Describe the deployment environment and hosting platform. This helps determine infrastructure requirements and technical constraints.',
    example: 'AWS cloud using serverless stack (Lambda, API Gateway, S3). Frontend hosted on CloudFront CDN. No local desktop components - fully web-based SaaS application accessible from any browser.'
  },
  {
    key: 'TECHNICAL_CONSIDERATIONS',
    title: 'Technical Considerations',
    guidance: 'Technical requirements, constraints, or preferences for your application.',
    example: 'Mobile-first responsive design, must work offline with data sync when online, real-time updates using WebSockets, PostgreSQL database, deployed on AWS with auto-scaling.'
  },
  {
    key: 'SECURITY_AND_COMPLIANCE_REQUIREMENTS',
    title: 'Security & Compliance',
    guidance: 'Security, privacy, or regulatory requirements your application must meet.',
    example: 'GDPR compliance for EU users, PCI DSS for payment processing, two-factor authentication, data encryption at rest and in transit, regular security audits, SOC 2 Type II certification.'
  }
];

// Question display component
const QuestionDisplay = ({ question, index, total, editMode }) => {
  const helpText = `\n💡 Tip: You can paste multi-line text from other apps\n↵↵ Press Enter twice when done, or Enter once to skip\n^U Press Ctrl+U to clear all text\n`;

  return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
    React.createElement(Text, { bold: true, color: 'white' },
      `\n📝 Question ${index + 1} of ${total}: ${question.title}${editMode ? ' [EDIT MODE]' : ''}\n`
    ),
    React.createElement(Text, { color: 'white' },
      question.guidance
    ),
    React.createElement(Text, { italic: true, dimColor: true },
      `Example: "${question.example}"`
    ),
    React.createElement(Text, { dimColor: true }, helpText)
  );
};

// Multi-line input component with line numbers and character count
// Memoized to prevent unnecessary re-renders when props haven't changed
const MultiLineInput = React.memo(({ lines, showCharCount = true, cursorLine = null, cursorChar = null }) => {
  // Early return for empty lines (no memoization needed)
  if (lines.length === 0) {
    return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
      React.createElement(Text, { dimColor: true },
        React.createElement(Text, { inverse: true }, ' ')
      )
    );
  }

  // Memoize character count calculation (only recalculate when lines change)
  const totalChars = useMemo(() =>
    lines.join('\n').length,
    [lines]
  );

  // Memoize visible lines calculation (only recalculate when lines change)
  const { visibleLines, hasMoreLines, hiddenCount } = useMemo(() => {
    const maxVisibleLines = 15; // Show up to 15 lines
    const hasMore = lines.length > maxVisibleLines;
    const visible = hasMore ? lines.slice(-maxVisibleLines) : lines;
    const hidden = lines.length - visible.length;

    return {
      visibleLines: visible,
      hasMoreLines: hasMore,
      hiddenCount: hidden
    };
  }, [lines]);

  return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
    hasMoreLines && React.createElement(Text, { dimColor: true },
      `... ${hiddenCount} more line${hiddenCount > 1 ? 's' : ''} above (scroll up to see)`
    ),
    // Render each line as separate Text (Box handles line breaks automatically)
    ...visibleLines.map((line, idx) => {
      const actualIdx = hasMoreLines ? idx + hiddenCount : idx;
      const isCurrentLine = cursorLine !== null && actualIdx === cursorLine;
      const isLastLine = actualIdx === lines.length - 1;

      // If this is the cursor line, split at cursor position and show inverted character
      if (isCurrentLine && cursorChar !== null) {
        const beforeCursor = line.slice(0, cursorChar);
        const atCursor = line[cursorChar] || ' '; // character at cursor, or space if at end
        const afterCursor = line.slice(cursorChar + 1);

        return React.createElement(Text, { key: actualIdx },
          beforeCursor,
          React.createElement(Text, { inverse: true }, atCursor),
          afterCursor
        );
      }

      // Regular line (no cursor) - fallback to old behavior
      return React.createElement(Text, { key: actualIdx },
        line,
        (isLastLine && cursorLine === null) && React.createElement(Text, { inverse: true }, ' ')
      );
    }),
    showCharCount && React.createElement(Box, { flexShrink: 0 },
      React.createElement(Text, { dimColor: true },
        `\n${totalChars} characters`
      )
    )
  );
});

// Questionnaire progress component
const QuestionnaireProgress = ({ current, total, answers, lastSave }) => {
  const answered = Object.keys(answers).length;
  const saveTime = lastSave ? lastSave.toLocaleTimeString() : 'Never';

  return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
    React.createElement(Text, { dimColor: true },
      `\nProgress: ${answered}/${total} questions answered | Current: ${current + 1}/${total}`
    ),
    React.createElement(Text, { dimColor: true },
      `Last saved: ${saveTime}`
    )
  );
};

// Answers preview component
const AnswersPreview = ({ answers, questions, defaultSuggested }) => {
  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' },
      '\n📋 Review Your Answers\n'
    ),
    ...questions.map((question, idx) => {
      const answer = answers[question.key] || '(Skipped - will use AI suggestion)';
      const lines = answer.split('\n');
      const isDefault = defaultSuggested && defaultSuggested.has(question.key);

      // Color red for defaults
      const textColor = isDefault ? 'red' : undefined;
      const labelText = isDefault
        ? '   (default from settings)\n'
        : null;

      return React.createElement(Box, { key: idx, flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text, { bold: true },
          `${idx + 1}. ${question.title}\n`
        ),
        labelText ? React.createElement(Text, {
          color: textColor,
          italic: true,
          dimColor: true
        }, labelText) : null,
        ...lines.map((line, lineIdx) =>
          React.createElement(Text, {
            key: lineIdx,
            color: textColor,
            dimColor: !answers[question.key]
          }, line)
        )
      );
    }),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\nType 1-5 to edit a question | Enter to submit | Escape to cancel\n'
      )
    )
  );
};

// Cancel questionnaire confirmation component
const CancelQuestionnaireConfirmation = () => {
  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { bold: true, color: 'yellow' },
      '\n⚠️  Cancel Questionnaire\n'
    ),
    React.createElement(Text, null,
      'You have answered some questions. What would you like to do with your progress?\n'
    ),
    React.createElement(Box, { flexDirection: 'column', marginY: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' },
        'K - Keep answers (resume later)'
      ),
      React.createElement(Text, { dimColor: true },
        'Your progress will be saved and you can continue later'
      ),
      React.createElement(Text, null, '\n'),
      React.createElement(Text, { bold: true, color: 'red' },
        'D - Delete answers (start fresh)'
      ),
      React.createElement(Text, { dimColor: true },
        'All progress will be deleted and you\'ll start from scratch'
      )
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\nPress K to keep | D to delete | Escape to go back\n'
      )
    )
  );
};

// Cancel execution confirmation component
const CancelExecutionConfirmation = ({ executionState }) => {
  const { stage, substep, tokensUsed, filesCreated } = executionState;
  const currentOperation = substep || stage || 'Processing...';
  const hasFiles = filesCreated.length > 0;

  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { bold: true, color: 'yellow' },
      '\n⚠️  Cancel Operation\n'
    ),
    React.createElement(Text, null,
      'Do you want to cancel the current operation?\n'
    ),
    React.createElement(Box, { flexDirection: 'column', marginY: 1, paddingLeft: 2 },
      React.createElement(Text, { bold: true },
        'Current operation:'
      ),
      React.createElement(Text, { dimColor: true },
        `  ${currentOperation}`
      ),
      React.createElement(Text, null, '\n'),
      React.createElement(Text, { bold: true },
        'Tokens consumed:'
      ),
      React.createElement(Text, { dimColor: true },
        `  ${tokensUsed.input.toLocaleString()} input, ${tokensUsed.output.toLocaleString()} output (${tokensUsed.total.toLocaleString()} total)`
      ),
      React.createElement(Text, null, '\n'),
      React.createElement(Text, { bold: true },
        'Files created:'
      ),
      hasFiles ? filesCreated.map((file, idx) =>
        React.createElement(Text, { key: idx, dimColor: true },
          `  • ${file}`
        )
      ) : React.createElement(Text, { dimColor: true },
        '  None'
      )
    ),
    React.createElement(Box, { marginTop: 1, borderStyle: 'round', borderColor: 'red', paddingX: 1 },
      React.createElement(Text, { bold: true, color: 'red' },
        'Warning: Partial work will be deleted and cannot be recovered'
      )
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\nPress Y to cancel operation | N or Escape to continue\n'
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
          `• ${item}`
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
    React.createElement(Box, { borderStyle: 'round', borderColor: 'yellow', marginY: 1 },
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
    React.createElement(Box, { flexDirection: 'column', marginY: 1 },
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
    React.createElement(Box, { borderStyle: 'round', borderColor: 'yellow', marginY: 1 },
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
        { label: '/models     Configure LLM models', value: '/models', aliases: ['/m'] },
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
      ? React.createElement(Text, { dimColor: true }, 'No output yet\n')
      : React.createElement(Box, { flexDirection: 'column', borderStyle: 'single' },
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
const BottomRightStatus = React.memo(({ backgroundProcesses }) => {
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
      // Only update if state actually changed (prevent unnecessary re-renders)
      setUpdateState(prevState => {
        if (JSON.stringify(prevState) === JSON.stringify(state)) {
          return prevState; // No change, return same reference
        }
        return state;
      });
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

  // Memoize running processes to avoid recalculating on every render
  const runningProcesses = useMemo(() =>
    Array.from(backgroundProcesses.values()).filter(p => p.status === 'running'),
    [backgroundProcesses]
  );

  const runningCount = runningProcesses.length;

  if (runningCount > 0) {
    const processIndicator = React.createElement(ProcessStatusIndicator, { processes: backgroundProcesses });
    // Get the text content to calculate padding
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
});

// Model Configuration Components

/**
 * Model Configuration Prompt Component
 * Shows after /init completes, asks user if they want to configure models
 */
const ModelConfigPrompt = () => {
  return React.createElement(Box, { flexDirection: 'column', marginY: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' }, '\nConfigure models now? (y/n) ')
  );
};

/**
 * Ceremony Selector Component
 */
const CeremonySelector = ({ ceremonies, selectedIndex, onIndexChange }) => {
  return React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
    React.createElement(Text, { bold: true }, 'Select Ceremony to Configure'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...ceremonies.map((ceremony, idx) =>
        React.createElement(Box, { key: ceremony.name, flexDirection: 'column' },
          React.createElement(Text, { color: idx === selectedIndex ? 'green' : 'white' },
            (idx === selectedIndex ? '› ' : '  ') + (idx + 1) + '. ' + ceremony.name
          ),
          React.createElement(Text, { dimColor: true },
            'Main: ' + ceremony.mainModel + ' | Validation: ' + (ceremony.validationModel || 'none')
          )
        )
      )
    ),
    React.createElement(Text, { dimColor: true, marginTop: 1 }, '(Press Enter to select, Esc to finish)')
  );
};

/**
 * Stage Selector Component
 */
const StageSelector = ({ ceremonyName, stages, selectedIndex, availableProviders }) => {
  return React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
    React.createElement(Text, { bold: true }, ceremonyName),
    React.createElement(Text, {}, ''),
    React.createElement(Text, { dimColor: true }, 'Select Stage to Configure:'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...stages.map((stage, idx) => {
        const hasApiKey = availableProviders.includes(stage.provider);
        return React.createElement(Box, { key: stage.id, flexDirection: 'column' },
          React.createElement(Text, { color: idx === selectedIndex ? 'green' : 'white' },
            (idx === selectedIndex ? '› ' : '  ') + (idx + 1) + '. ' + stage.name
          ),
          React.createElement(Text, { dimColor: true },
            'Current: ' + stage.model + ' (' + stage.provider + ')' + (!hasApiKey ? ' ⚠️  No API key' : '')
          )
        );
      })
    ),
    React.createElement(Text, { dimColor: true, marginTop: 1 }, '(Press Enter to select, Esc to go back)')
  );
};

/**
 * Model Selector Component
 */
const ModelSelector = ({ stageName, currentModel, models, selectedIndex }) => {
  return React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
    React.createElement(Text, { bold: true }, 'Stage: ' + stageName),
    React.createElement(Text, { dimColor: true }, 'Current: ' + currentModel),
    React.createElement(Text, {}, ''),
    React.createElement(Text, { dimColor: true }, 'Available Models:'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...models.map((model, idx) => {
        const isCurrent = model.id === currentModel;
        const apiKeyIndicator = model.hasApiKey ? ' ✓' : ' ⚠️';
        const prefix = (idx === selectedIndex ? '› ' : '  ') + (idx + 1) + '. ';
        const name = model.displayName + (isCurrent ? ' (current)' : '') + apiKeyIndicator;
        const pricing = ' $' + model.pricing.input.toFixed(2) + '/$' + model.pricing.output.toFixed(2);

        return React.createElement(Text, {
          key: model.id,
          color: idx === selectedIndex ? 'green' : 'white',
          dimColor: idx !== selectedIndex
        },
          prefix + name + ' - ' + model.id + ' -' + pricing
        );
      })
    ),
    React.createElement(Text, { dimColor: true, marginTop: 1 }, '(Press Enter to select, Esc to cancel)'),
    React.createElement(Text, { dimColor: true }, 'Note: Models without API keys can be selected;'),
    React.createElement(Text, { dimColor: true }, 'add the key to .env before running ceremonies')
  );
};

// Global ceremony execution tracking (for signal handler cleanup)
let activeExecutionId = null;
let activeCeremony = null;

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
  const [executingSubstep, setExecutingSubstep] = useState('');

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
  const [questionnaireDefaults, setQuestionnaireDefaults] = useState({});
  const [defaultSuggestedAnswers, setDefaultSuggestedAnswers] = useState(new Set());

  // Paste placeholder state
  const [pastedContent, setPastedContent] = useState({}); // { questionKey: fullContent }
  const [isPasted, setIsPasted] = useState({}); // { questionKey: boolean }

  // Paste buffer for accumulating chunks (useRef to avoid re-renders)
  const pasteBuffer = useRef([]);
  const pasteTimer = useRef(null);

  // Cursor position for multi-line editing
  const [cursorLine, setCursorLine] = useState(0);
  const [cursorChar, setCursorChar] = useState(0);

  // Sponsor call execution tracking
  const [sponsorCallExecutionId, setSponsorCallExecutionId] = useState(null);

  // Cancel questionnaire confirmation state
  const [cancelConfirmActive, setCancelConfirmActive] = useState(false);

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

  // Stable initial render state - prevents first-keypress layout glitch
  const [isStableRender, setIsStableRender] = useState(false);

  // Active logger for long-running commands (e.g., /sponsor-call with questionnaire)
  const [activeLogger, setActiveLogger] = useState(null);

  // Cancel execution confirmation state
  const [cancelExecutionActive, setCancelExecutionActive] = useState(false);
  const [executionState, setExecutionState] = useState({
    stage: '',
    substep: '',
    tokensUsed: { input: 0, output: 0, total: 0 },
    filesCreated: []
  });

  // Track if user has interacted (to hide Banner permanently after first interaction)
  const [hasInteracted, setHasInteracted] = useState(false);

  // Model configuration state
  const [modelConfigActive, setModelConfigActive] = useState(false);
  const [modelConfigMode, setModelConfigMode] = useState('prompt'); // 'prompt' | 'ceremony' | 'stage' | 'model'
  const [modelConfigurator, setModelConfigurator] = useState(null);
  const [selectedCeremony, setSelectedCeremony] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [ceremonySelectIndex, setCeremonySelectIndex] = useState(0);
  const [stageSelectIndex, setStageSelectIndex] = useState(0);
  const [modelSelectIndex, setModelSelectIndex] = useState(0);
  const [configurationChanges, setConfigurationChanges] = useState([]);
  const [modelConfigPromptInput, setModelConfigPromptInput] = useState('');

  // Force stable initial render to prevent React Ink layout race condition
  // On first mount, React Ink hasn't fully measured terminal dimensions
  // The first state update (keypress) triggers layout recalculation causing
  // visual glitch (character appears in wrong position or banner duplicates)
  // Solution: Force re-render after mount to stabilize layout before user input
  useEffect(() => {
    // Delay to ensure React Ink has completed initial layout pass
    // Also gives time for logo to render and update checker to start
    const timer = setTimeout(() => {
      setIsStableRender(true);
    }, 200); // 200ms ensures React Ink is fully stable and logo has rendered

    return () => clearTimeout(timer);
  }, []);

  // Start update checker on mount
  useEffect(() => {
    const checker = new UpdateChecker();
    const installer = new UpdateInstaller();

    // Delay update check to avoid interfering with React Ink's initial render
    // Running it immediately can cause console output that corrupts the layout
    setTimeout(() => {
      // Perform first update check
      checker.checkForUpdates().catch(() => {
        // Silently fail
      });

      // Start background checker (checks every hour after first check)
      checker.startBackgroundChecker();
    }, 1000); // Wait 1 second for React Ink to fully stabilize

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
      const newProcesses = new Map();
      for (const p of manager.getAllProcesses()) {
        newProcesses.set(p.id, p);
      }

      // Only update if data actually changed (prevents unnecessary re-renders)
      setBackgroundProcesses(prevProcesses => {
        // Check if size changed
        if (prevProcesses.size !== newProcesses.size) {
          return newProcesses;
        }

        // Check if any process data changed
        for (const [id, process] of newProcesses) {
          const prev = prevProcesses.get(id);
          if (!prev || prev.status !== process.status || prev.pid !== process.pid) {
            return newProcesses;
          }
        }

        // No changes detected, return same reference to prevent re-render
        return prevProcesses;
      });
    };

    // Initial sync
    updateProcesses();

    // Listen for process events
    manager.on('process-started', updateProcesses);
    manager.on('process-stopped', updateProcesses);
    manager.on('process-exited', updateProcesses);
    manager.on('process-error', updateProcesses);
    manager.on('process-removed', updateProcesses);

    return () => {
      manager.removeListener('process-started', updateProcesses);
      manager.removeListener('process-stopped', updateProcesses);
      manager.removeListener('process-exited', updateProcesses);
      manager.removeListener('process-error', updateProcesses);
      manager.removeListener('process-removed', updateProcesses);
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

  // Track active ceremony execution for signal handler cleanup
  useEffect(() => {
    if (sponsorCallExecutionId) {
      activeExecutionId = sponsorCallExecutionId;
      activeCeremony = 'sponsor-call';
    }

    return () => {
      activeExecutionId = null;
      activeCeremony = null;
    };
  }, [sponsorCallExecutionId]);

  // Available commands for Tab completion (including aliases)
  const allCommands = [
    '/init', '/i',
    '/sponsor-call', '/sc',
    '/project-expansion', '/pe',
    '/seed',
    '/status', '/s',
    '/models', '/m',
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
      '/m': '/models',
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
      // Mark that user has interacted (hide Banner permanently)
      setHasInteracted(true);

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
      setOutput(prev => prev + `\n> ${command}\n`);

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
              setOutput(prev => prev + `Stopped ${stopped} process(es)\n\n`);
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
              setOutput(prev => prev +
                '\n❌ Story ID required\n' +
                'Usage: /seed <story-id>\n' +
                'Example: /seed context-0001-0001\n\n'
              );
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

          case '/models':
          case '/m':
            setExecutingMessage('Loading model configuration...');
            await runModels();
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
              setOutput(prev => prev + `Stopped ${stopped} process(es)\n\n`);
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
              setOutput(prev => prev + `\n❌ Unknown command: ${command}\nType /help to see available commands\nTip: Try /h for help, /v for version, /q to exit\n`);
            } else {
              setOutput(prev => prev + `\n💡 Commands must start with /\nExample: /init, /status, /help\nTip: Type / and press Enter to see all commands\n`);
            }
        }
      } catch (error) {
        setOutput(prev => prev + `\n❌ Error: ${error.message}\n`);
      } finally {
        // For /sponsor-call, keep logger active during questionnaire
        // For other commands, stop logger immediately
        if (logger) {
          if (command.toLowerCase() === '/sponsor-call' || command.toLowerCase() === '/sc') {
            // Store logger to keep it active during questionnaire
            setActiveLogger(logger);
          } else {
            // Stop logger for all other commands
            logger.stop();

            // Cleanup old logs (keep last 10 per command)
            CommandLogger.cleanupOldLogs();
          }
        }
      }

      // Return to prompt mode (unless in special mode like process-viewer or kill-confirm)
      setIsExecuting(false);
      setTimeout(() => {
        // Clear input first to prevent UI corruption
        setInput('');
        setExecutingMessage('');
        setExecutingSubstep('');

        // Only return to prompt if not in a special viewer/confirmation mode
        setMode((currentMode) => {
          if (currentMode === 'process-viewer' || currentMode === 'kill-confirm' || currentMode === 'cancel-confirm') {
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
      setExecutingMessage('');
      setExecutingSubstep('');
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
/models (or /m)          Configure LLM models for ceremonies
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

    let result;
    try {
      result = await initiator.init();
    } finally {
      console.log = originalLog;
    }

    setOutput(prev => prev +
      logs.join('\n') + '\n'
    );

    // Check if init returned configuration data
    if (result && result.shouldConfigure) {
      setModelConfigurator(result.configurator);
      setModelConfigActive(true);
      setModelConfigMode('prompt');
    }
  };

  const runProjectExpansion = async () => {
    const initiator = new ProjectInitiator();

    if (!initiator.isAvcProject()) {
      setOutput(prev => prev +
        '\n❌ Project not initialized\n\n' +
        'Please run /init first to create the project structure.\n\n'
      );
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

    setOutput(prev => prev +
      logs.join('\n') + '\n' +
      '📖 https://agilevibecoding.org/ceremonies/project-expansion\n'
    );
  };

  const runSeed = async (storyId) => {
    const initiator = new ProjectInitiator();

    if (!initiator.isAvcProject()) {
      setOutput(prev => prev +
        '\n❌ Project not initialized\n\n' +
        'Please run /init first to create the project structure.\n\n'
      );
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

    setOutput(prev => prev +
      logs.join('\n') + '\n' +
      '📖 https://agilevibecoding.org/ceremonies/seed\n'
    );
  };

  const runSponsorCall = async () => {
    const initiator = new ProjectInitiator();

    // Check if project is initialized
    if (!initiator.isAvcProject()) {
      setOutput(prev => prev +
        '\n❌ Project not initialized\n\n' +
        'Please run /init first to create the project structure.\n\n'
      );
      return;
    }

    // Validate API keys BEFORE starting questionnaire
    setExecutingMessage('Validating API keys...');
    setIsExecuting(true);

    const validationResult = await initiator.validateProviderApiKey();

    setIsExecuting(false);

    if (!validationResult.valid) {
      setOutput(prev => prev +
        '\n❌ API Key Validation Failed\n\n' +
        `   ${validationResult.message}\n\n`
      );
      setMode('prompt');
      return; // Exit early - don't show questionnaire
    }

    const progressPath = initiator.sponsorCallProgressPath;

    // Initialize ceremony history
    const { CeremonyHistory } = await import('./ceremony-history.js');
    const history = new CeremonyHistory(path.join(process.cwd(), '.avc'));
    history.init();

    // Detect abrupt termination from previous run
    const abruptTermination = history.detectAbruptTermination('sponsor-call');

    if (abruptTermination) {
      // Previous run was interrupted during LLM generation
      history.cleanupAbruptTermination('sponsor-call');

      setOutput(prev => prev +
        '\n⚠️  Previous sponsor call was interrupted during document generation.\n' +
        'Starting fresh...\n\n'
      );

      // Delete stale progress file
      if (fs.existsSync(progressPath)) {
        fs.unlinkSync(progressPath);
      }
    }

    // Check for incomplete progress (questionnaire only)
    if (initiator.hasIncompleteProgress(progressPath)) {
      const savedProgress = initiator.readProgress(progressPath);

      if (savedProgress && savedProgress.stage === 'questionnaire') {
        // Resume from saved progress - show preview to allow editing any question
        setQuestionnaireAnswers(savedProgress.collectedValues || {});
        setShowPreview(true);
        setOutput(prev => prev +
          '\n🎯 Sponsor Call Ceremony - Resuming from saved progress\n' +
          '📖 https://agilevibecoding.org/ceremonies/sponsor-call\n'
        );
        return;
      }
    }

    // Start fresh - create execution record
    const executionId = history.startExecution('sponsor-call', 'questionnaire');
    setSponsorCallExecutionId(executionId);

    // Load questionnaire config (defaults) from settings
    const config = loadQuestionnaireConfig();
    setQuestionnaireDefaults(config.defaults);
    setDefaultSuggestedAnswers(new Set()); // Reset tracking

    setQuestionnaireActive(true);
    setCurrentQuestionIndex(0);
    setQuestionnaireAnswers({});
    setCurrentAnswer([]);
    setEmptyLineCount(0);
    setEditMode(false);
    setShowPreview(false);
    setOutput(prev => prev +
      '\n🎯 Sponsor Call Ceremony - Interactive Questionnaire\n' +
      '📖 https://agilevibecoding.org/ceremonies/sponsor-call\n'
    );
  };

  const runSponsorCallWithAnswers = async (answers) => {
    const initiator = new ProjectInitiator();

    // Reset execution state at start
    setExecutionState({
      stage: '',
      substep: '',
      tokensUsed: { input: 0, output: 0, total: 0 },
      filesCreated: []
    });

    // Suppress console.log during execution (will show summary after)
    const originalLog = console.log;
    const originalError = console.error;
    let capturedLogs = [];
    console.log = (...args) => {
      capturedLogs.push(args.join(' '));
    };
    console.error = (...args) => {
      capturedLogs.push(args.join(' '));
    };

    // Progress callback to update spinner message, substep, and execution state
    const progressCallback = (message, substep = null, metadata = {}) => {
      if (substep !== null) {
        // Update substep only
        setExecutingSubstep(substep);

        // Update execution state substep
        setExecutionState(prev => ({
          ...prev,
          substep: substep
        }));
      } else {
        // Update main message and clear substep
        setExecutingMessage(message);
        setExecutingSubstep('');

        // Update execution state stage
        setExecutionState(prev => ({
          ...prev,
          stage: message,
          substep: ''
        }));
      }

      // Update token usage if provided
      if (metadata.tokensUsed) {
        setExecutionState(prev => ({
          ...prev,
          tokensUsed: {
            input: metadata.tokensUsed.input || 0,
            output: metadata.tokensUsed.output || 0,
            total: (metadata.tokensUsed.input || 0) + (metadata.tokensUsed.output || 0)
          }
        }));
      }

      // Update files created if provided
      if (metadata.filesCreated) {
        setExecutionState(prev => ({
          ...prev,
          filesCreated: metadata.filesCreated
        }));
      }
    };

    try {
      // Pass answers and progress callback to ceremony
      const result = await initiator.sponsorCallWithAnswers(answers, progressCallback);

      // Check for error result
      if (result && result.error) {
        setOutput(prev => prev + `\n❌ ${result.message}\n\n`);
        return;
      }

      // Build complete summary message
      let summary = '\n✅ Sponsor Call Completed\n\n';

      // Activities performed
      if (result && result.activities && result.activities.length > 0) {
        summary += 'Activities performed:\n';
        result.activities.forEach(activity => {
          summary += `• ${activity}\n`;
        });
        summary += '\n';
      }

      // Files created
      summary += 'Files created:\n';
      if (result && result.outputPath) {
        summary += `• ${result.outputPath}\n`;
      }
      if (result && result.contextPath) {
        summary += `• ${result.contextPath}\n`;
      }

      // Token usage
      if (result && result.tokenUsage) {
        summary += '\n📊 Token Usage:\n';
        summary += `Input: ${result.tokenUsage.input.toLocaleString()} tokens | `;
        summary += `Output: ${result.tokenUsage.output.toLocaleString()} tokens | `;
        summary += `Total: ${result.tokenUsage.total.toLocaleString()} tokens\n`;

        if (result.cost && result.cost.total > 0) {
          summary += `Estimated cost: $${result.cost.total.toFixed(4)}\n`;
        }
      }

      // Next steps
      summary += '\nNext steps:\n';
      summary += '1. Review project documentation\n';
      summary += '2. Run /project-expansion to create Epics and Stories\n';

      // Single output update with complete summary
      setOutput(prev => prev + summary);

    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
  };

  const loadQuestionnaireConfig = () => {
    try {
      const avcConfigPath = path.join(process.cwd(), '.avc', 'avc.json');
      if (!existsSync(avcConfigPath)) {
        return { defaults: {} };
      }

      const config = JSON.parse(readFileSync(avcConfigPath, 'utf8'));
      return {
        defaults: config.settings?.questionnaire?.defaults || {}
      };
    } catch (error) {
      console.log('⚠️  Could not load questionnaire config:', error.message);
      return { defaults: {} };
    }
  };

  const markAnswerAsDefaultSuggested = (key) => {
    setDefaultSuggestedAnswers(prev => new Set([...prev, key]));
  };

  const getDefaultAnswer = (key) => {
    return questionnaireDefaults[key] || null;
  };

  const saveQuestionnaireAnswer = (key, value) => {
    setQuestionnaireAnswers(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const moveToNextQuestion = () => {
    setCurrentAnswer([]);
    setEmptyLineCount(0);
    setCursorLine(0);
    setCursorChar(0);

    // Clear paste buffer to prevent cross-question contamination
    pasteBuffer.current = [];
    if (pasteTimer.current) {
      clearTimeout(pasteTimer.current);
      pasteTimer.current = null;
    }

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
    setQuestionnaireActive(false);
    setShowPreview(true);
  };

  const confirmSubmission = async () => {
    setShowPreview(false);
    setQuestionnaireActive(false);
    setMode('executing');
    setIsExecuting(true);
    setExecutingMessage('Generating initial project documentation with AI...');

    try {
      // Archive answers to history BEFORE calling LLM
      if (sponsorCallExecutionId) {
        const { CeremonyHistory } = await import('./ceremony-history.js');
        const history = new CeremonyHistory(path.join(process.cwd(), '.avc'));

        history.archiveAnswers('sponsor-call', sponsorCallExecutionId, questionnaireAnswers);
        history.updateExecution('sponsor-call', sponsorCallExecutionId, {
          stage: 'llm-generation',
          answers: questionnaireAnswers
        });
      }

      // Call ceremony with pre-filled answers
      await runSponsorCallWithAnswers(questionnaireAnswers);

      // Reset execution ID after completion
      setSponsorCallExecutionId(null);
    } catch (error) {
      // Show error but don't reset mode prematurely
      setOutput(prev => prev + `\n❌ Error: ${error.message}\n`);
    } finally {
      // Stop active logger after questionnaire completes
      if (activeLogger) {
        activeLogger.stop();
        CommandLogger.cleanupOldLogs();
        setActiveLogger(null);
      }

      // Return to prompt mode only after everything completes
      setIsExecuting(false);
      setTimeout(() => {
        setMode('prompt');
        setInput('');
      }, 100);
    }
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

  const runModels = async () => {
    const initiator = new ProjectInitiator();

    // Capture console.log output
    const originalLog = console.log;
    let logs = [];
    console.log = (...args) => {
      logs.push(args.join(' '));
    };

    let result;
    try {
      result = await initiator.models();
    } finally {
      console.log = originalLog;
    }

    setOutput(prev => prev + logs.join('\n') + '\n');

    // Check if models() returned configuration data
    if (result && result.shouldConfigure) {
      setModelConfigurator(result.configurator);
      setModelConfigActive(true);
      setModelConfigMode('prompt');
    }
  };

  const runTokens = async () => {
    const initiator = new ProjectInitiator();

    // Check if project is initialized
    if (!initiator.isAvcProject()) {
      setOutput(prev => prev +
        '\n❌ Project not initialized\n\n' +
        'Please run /init first to create the project structure.\n\n'
      );
      return;
    }

    // Stream console output in real-time
    const originalLog = console.log;
    console.log = (...args) => {
      const message = args.join(' ');
      setOutput(prev => prev + message + '\n');
    };

    try {
      await initiator.showTokenStats();
    } finally {
      console.log = originalLog;
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

      // Check for preserved files
      const path = await import('path');
      const envPath = path.join(initiator.projectRoot, '.env');
      const hasEnvFile = fs.existsSync(envPath);
      const hasSrcFolder = initiator.hasSrcFolder();
      const hasWorktreesFolder = initiator.hasWorktreesFolder();

      if (hasEnvFile || hasSrcFolder || hasWorktreesFolder) {
        logs.push('ℹ️  Preserved files:\n');

        if (hasEnvFile) {
          logs.push('   The .env file was NOT deleted and still contains:');
          logs.push('   • ANTHROPIC_API_KEY');
          logs.push('   • GEMINI_API_KEY');
          logs.push('   • (and any other API keys you added)\n');
        }

        if (hasSrcFolder) {
          logs.push('✅ The src/ folder was NOT deleted.');
          logs.push('   All your AVC-managed code has been preserved.\n');
        }

        if (hasWorktreesFolder) {
          logs.push('✅ The worktrees/ folder was NOT deleted.');
          logs.push('   All your git worktrees have been preserved.\n');
        }
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
      setOutput(prev => prev + 'Please run /init first to create documentation structure.\n\n');
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
            setOutput(prev => prev + `Process: ${processInfo.command} (PID: ${processInfo.pid})\n`);
            setOutput(prev => prev + 'Killing external process and restarting...\n\n');

            // Try to kill the process
            const killed = await builder.killProcess(processInfo.pid);

            if (!killed) {
              // Failed to kill (permission denied, etc.)
              setOutput(prev => prev +
                `❌ Failed to kill process ${processInfo.pid}\n\n` +
                `   Unable to stop the process (permission denied or process protected).\n` +
                `   Please manually stop the process or change the port.\n\n` +
                `   To change the port, edit .avc/avc.json:\n` +
                `   {\n` +
                `     "settings": {\n` +
                `       "documentation": {\n` +
                `         "port": 5173\n` +
                `       }\n` +
                `     }\n` +
                `   }\n\n`
              );
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

    setOutput(prev => prev +
      '📦 Starting documentation server in background...\n' +
      `   URL: http://localhost:${port}\n` +
      `   View process output: /processes\n\n`
    );
  };

  // Handle keyboard input in prompt mode
  useInput((inputChar, key) => {
    if (mode !== 'prompt') return;

    // Block input during initialization
    if (!isStableRender) return;

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
        setHasInteracted(true); // Hide Banner permanently
        setMode('selector');
      }
    }
  }, { isActive: mode === 'prompt' && !questionnaireActive && !modelConfigActive && isStableRender });

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
  }, { isActive: mode === 'selector' && isStableRender });

  // Questionnaire mode input handler
  useInput((inputChar, key) => {
    if (!questionnaireActive || showPreview) return;

    const currentQuestion = questionnaireQuestions[currentQuestionIndex];

    // Edit mode disabled (Ctrl+ shortcuts not available in all environments)
    // Users must provide complete answers in first pass

    // Handle Arrow Keys for cursor movement
    if (key.leftArrow) {
      setCursorChar(prev => Math.max(0, prev - 1));
      return;
    }

    if (key.rightArrow) {
      const currentLineLength = currentAnswer[cursorLine]?.length || 0;
      setCursorChar(prev => Math.min(currentLineLength, prev + 1));
      return;
    }

    if (key.upArrow) {
      setCursorLine(prev => {
        const newLine = Math.max(0, prev - 1);
        // Adjust cursor char to not exceed new line length
        const newLineLength = currentAnswer[newLine]?.length || 0;
        setCursorChar(c => Math.min(c, newLineLength));
        return newLine;
      });
      return;
    }

    if (key.downArrow) {
      setCursorLine(prev => {
        const newLine = Math.min(currentAnswer.length - 1, prev + 1);
        // Adjust cursor char to not exceed new line length
        const newLineLength = currentAnswer[newLine]?.length || 0;
        setCursorChar(c => Math.min(c, newLineLength));
        return newLine;
      });
      return;
    }

    // Handle Enter key
    if (key.return) {
      const currentLineText = currentAnswer[cursorLine] || '';

      // Empty line on first input = skip question
      if (currentAnswer.length === 0 && currentLineText === '') {
        const questionKey = currentQuestion.key;

        // Priority cascade: defaults > AI

        // 1. Check for default in settings (highest priority)
        const defaultAnswer = getDefaultAnswer(questionKey);
        if (defaultAnswer) {
          console.log('Using default from settings...');
          saveQuestionnaireAnswer(questionKey, defaultAnswer);
          markAnswerAsDefaultSuggested(questionKey);
          moveToNextQuestion();
          return;
        }

        // 2. Fall back to AI suggestion
        console.log('Skipping - will use AI suggestion...');
        saveQuestionnaireAnswer(questionKey, null);
        moveToNextQuestion();
        return;
      }

      // Check if last line is empty (for double-enter submission)
      const lastLine = currentAnswer[currentAnswer.length - 1] || '';
      if (lastLine === '' && cursorLine === currentAnswer.length - 1) {
        const newEmptyCount = emptyLineCount + 1;
        setEmptyLineCount(newEmptyCount);

        // Two consecutive empty lines = done with this answer
        if (newEmptyCount >= 1) {
          // Combine pasted content with typed content
          const questionKey = currentQuestion.key;
          const hasPastedContent = isPasted[questionKey];
          const typedLines = currentAnswer.slice(0, -1); // Remove last empty line

          // Filter out placeholder lines (they start with "[pasted text")
          const nonPlaceholderLines = typedLines.filter(line => !line.startsWith('[pasted text'));
          const typedContent = nonPlaceholderLines.join('\n').trim();

          let finalAnswer = '';

          if (hasPastedContent) {
            const pastedContentStr = pastedContent[questionKey] || '';
            if (typedContent) {
              // Combine pasted and typed content
              finalAnswer = pastedContentStr + '\n\n' + typedContent;
            } else {
              // Only pasted content
              finalAnswer = pastedContentStr;
            }

            // Clear paste state
            setPastedContent(prev => {
              const newState = { ...prev };
              delete newState[questionKey];
              return newState;
            });
            setIsPasted(prev => ({
              ...prev,
              [questionKey]: false
            }));
          } else {
            // Only typed content (no paste)
            finalAnswer = typedContent;
          }

          saveQuestionnaireAnswer(currentQuestion.key, finalAnswer);
          moveToNextQuestion();
          return;
        }
      } else {
        // Split current line at cursor position
        const newLines = [...currentAnswer];
        const beforeCursor = currentLineText.slice(0, cursorChar);
        const afterCursor = currentLineText.slice(cursorChar);

        newLines[cursorLine] = beforeCursor;
        newLines.splice(cursorLine + 1, 0, afterCursor);

        setCurrentAnswer(newLines);
        setCursorLine(prev => prev + 1);
        setCursorChar(0);
        setEmptyLineCount(0);
      }

      return;
    }

    // Handle Backspace
    if (key.backspace || key.delete) {
      const questionKey = questionnaireQuestions[currentQuestionIndex].key;

      // If current answer is a pasted placeholder, clear it entirely
      if (isPasted[questionKey]) {
        React.startTransition(() => {
          setPastedContent(prev => {
            const newState = { ...prev };
            delete newState[questionKey];
            return newState;
          });
          setIsPasted(prev => ({
            ...prev,
            [questionKey]: false
          }));
          setCurrentAnswer([]);
          setCursorLine(0);
          setCursorChar(0);
        });
        return;
      }

      if (cursorChar > 0) {
        // Delete character before cursor on current line
        const newLines = [...currentAnswer];
        const line = newLines[cursorLine] || '';
        newLines[cursorLine] = line.slice(0, cursorChar - 1) + line.slice(cursorChar);
        setCurrentAnswer(newLines);
        setCursorChar(prev => prev - 1);
      } else if (cursorLine > 0) {
        // At beginning of line, merge with previous line
        const newLines = [...currentAnswer];
        const prevLine = newLines[cursorLine - 1] || '';
        const currentLine = newLines[cursorLine] || '';
        newLines[cursorLine - 1] = prevLine + currentLine;
        newLines.splice(cursorLine, 1);
        setCurrentAnswer(newLines);
        setCursorLine(prev => prev - 1);
        setCursorChar(prevLine.length);
      }
      return;
    }

    // Handle Ctrl+U (clear all text - Unix standard "kill line" binding)
    if (key.ctrl && inputChar === 'u') {
      const questionKey = questionnaireQuestions[currentQuestionIndex].key;

      // Clear pasted content if any
      if (isPasted[questionKey]) {
        setPastedContent(prev => {
          const newState = { ...prev };
          delete newState[questionKey];
          return newState;
        });
        setIsPasted(prev => ({
          ...prev,
          [questionKey]: false
        }));
      }

      // Clear paste buffer to prevent corruption
      pasteBuffer.current = [];

      // Cancel pending paste timer
      if (pasteTimer.current) {
        clearTimeout(pasteTimer.current);
        pasteTimer.current = null;
      }

      // Clear all text
      setCurrentAnswer([]);
      setCursorLine(0);
      setCursorChar(0);
      setEmptyLineCount(0);
      return;
    }

    // Handle Escape (cancel edit or questionnaire)
    if (key.escape) {
      // If editing from preview, save changes and return to preview
      if (isEditingFromPreview) {
        // Save the edited answer before returning to preview
        const currentQuestion = questionnaireQuestions[currentQuestionIndex];
        const questionKey = currentQuestion.key;

        // Check if this question has pasted content
        let finalAnswer;
        if (isPasted[questionKey]) {
          // Use full pasted content (not the placeholder)
          finalAnswer = pastedContent[questionKey];
        } else {
          // Use typed content
          finalAnswer = currentAnswer.join('\n').trim();
        }

        saveQuestionnaireAnswer(questionKey, finalAnswer || null);

        setIsEditingFromPreview(false);
        setEditingQuestionIndex(-1);
        setShowPreview(true);
        setQuestionnaireActive(false);
        setCurrentAnswer([]);
        setMode('prompt');
        return;
      }

      // Otherwise, show cancel confirmation
      setCancelConfirmActive(true);
      setQuestionnaireActive(false);
      setMode('cancel-confirm');
      return;
    }

    // Regular character input (handles both typing and paste)
    if (inputChar && !key.ctrl && !key.meta) {
      const questionKey = questionnaireQuestions[currentQuestionIndex].key;

      // PASTE CHUNK ACCUMULATION STRATEGY:
      // Paste often arrives in multiple chunks. Buffer ALL input and use
      // adaptive timeouts to detect when paste is complete.

      // Add to buffer (always, even single chars)
      pasteBuffer.current.push(inputChar);

      // Clear existing timer
      if (pasteTimer.current) {
        clearTimeout(pasteTimer.current);
      }

      // Adaptive timeout:
      // - Multi-char input (> 5): likely paste chunk, wait 100ms for more
      // - Small input (1-5 chars): might be fast typing, wait 20ms
      const isPotentialPaste = inputChar.length > 5 || inputChar.includes('\n') || inputChar.includes('\r');
      const timeout = isPotentialPaste ? 100 : 20;

      // Set timer to process buffer after timeout
      pasteTimer.current = setTimeout(() => {
        // Combine all buffered chunks
        const combinedContent = pasteBuffer.current.join('');
        pasteBuffer.current = []; // Clear buffer

        // Check if combined content is a paste
        const isPasteEvent = combinedContent.length > 50 || combinedContent.includes('\n') || combinedContent.includes('\r');

        if (isPasteEvent) {
          // PASTE DETECTED - Use placeholder strategy
          // Normalize line endings: convert \r\n and \r to \n
          const fullContent = combinedContent.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

          // Extract first line for preview
          const allLines = fullContent.split(/\r\n|\r|\n/);
          const firstLine = allLines[0] || '';
          const preview = firstLine.length > 40
            ? firstLine.substring(0, 40) + '...'
            : firstLine;

          // Create placeholder text
          const placeholder = `[pasted text "${preview}"]`;

          // Check if there's already pasted content for this question
          const existingContent = pastedContent[questionKey];
          const isMultiplePaste = existingContent && isPasted[questionKey];

          // Batch all state updates
          React.startTransition(() => {
            // Store full pasted content (append if multiple paste)
            setPastedContent(prev => ({
              ...prev,
              [questionKey]: isMultiplePaste
                ? prev[questionKey] + '\n\n' + fullContent  // Append with separator
                : fullContent  // First paste
            }));

            // Mark this question as pasted
            setIsPasted(prev => ({
              ...prev,
              [questionKey]: true
            }));

            // Display placeholder (append if multiple paste)
            if (isMultiplePaste) {
              // Append new placeholder to existing answer
              setCurrentAnswer(prev => [...prev, placeholder]);
              setCursorLine(prev => prev + 1);
              setCursorChar(placeholder.length);
            } else {
              // First paste - replace answer with placeholder
              setCurrentAnswer([placeholder]);
              setCursorLine(0);
              setCursorChar(placeholder.length);
            }

            setEmptyLineCount(0);
          });
        } else {
          // Not a paste, treat as typing

          // Check if we're typing after a paste - if so, clear the paste and start fresh
          if (isPasted[questionKey]) {
            React.startTransition(() => {
              setPastedContent(prev => {
                const newState = { ...prev };
                delete newState[questionKey];
                return newState;
              });
              setIsPasted(prev => ({
                ...prev,
                [questionKey]: false
              }));
              setCurrentAnswer([combinedContent]);
              setCursorLine(0);
              setCursorChar(combinedContent.length);
              setEmptyLineCount(0);
            });
          } else {
            // Normal typing - insert at cursor position
            const newLines = [...currentAnswer];
            if (newLines.length === 0) {
              newLines.push(combinedContent);
              setCursorChar(combinedContent.length);
            } else {
              const line = newLines[cursorLine] || '';
              newLines[cursorLine] = line.slice(0, cursorChar) + combinedContent + line.slice(cursorChar);
              setCursorChar(prev => prev + combinedContent.length);
            }
            setCurrentAnswer(newLines);
            setEmptyLineCount(0);
          }
        }
      }, timeout); // Use adaptive timeout

      return; // Exit handler - timer will process the buffered input
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
        const lines = existingAnswer.split('\n');
        setCurrentAnswer(lines);
        setEmptyLineCount(0);

        // Set cursor to end of answer
        setCursorLine(lines.length - 1);
        setCursorChar(lines[lines.length - 1]?.length || 0);
      }
      return;
    }

    // Escape to show cancel confirmation
    if (key.escape) {
      setShowPreview(false);
      setCancelConfirmActive(true);
      setMode('cancel-confirm');
      return;
    }
  }, { isActive: showPreview });

  // Cancel questionnaire confirmation input handler
  useInput((inputChar, key) => {
    if (!cancelConfirmActive) return;

    // Handle K (keep answers)
    if (inputChar && inputChar.toLowerCase() === 'k') {
      // Actually save progress to file
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
      } catch (error) {
        // Show error if save fails
        setOutput(prev => prev + `\n❌ Failed to save progress: ${error.message}\n`);
        return;
      }

      // Stop active logger before exiting
      if (activeLogger) {
        activeLogger.stop();
        CommandLogger.cleanupOldLogs();
        setActiveLogger(null);
      }

      setCancelConfirmActive(false);
      setMode('prompt');
      setInput('');
      setOutput(prev => prev + '\n✅ Progress saved. Run /sponsor-call again to resume.\n');
      return;
    }

    // Handle D (delete answers)
    if (inputChar && inputChar.toLowerCase() === 'd') {
      // Mark execution as cancelled in history
      if (sponsorCallExecutionId) {
        (async () => {
          try {
            const { CeremonyHistory } = await import('./ceremony-history.js');
            const history = new CeremonyHistory(path.join(process.cwd(), '.avc'));
            history.completeExecution('sponsor-call', sponsorCallExecutionId, 'user-cancelled', {
              answers: questionnaireAnswers,
              stage: 'questionnaire'
            });
          } catch (error) {
            // Silently fail
          }
        })();
        setSponsorCallExecutionId(null);
      }

      // Delete progress file
      try {
        const initiator = new ProjectInitiator();
        const progressPath = initiator.sponsorCallProgressPath;
        if (existsSync(progressPath)) {
          unlinkSync(progressPath);
        }
      } catch (error) {
        // Silently fail
      }

      // Stop active logger before exiting
      if (activeLogger) {
        activeLogger.stop();
        CommandLogger.cleanupOldLogs();
        setActiveLogger(null);
      }

      // Reset all state
      setCancelConfirmActive(false);
      setCurrentQuestionIndex(0);
      setQuestionnaireAnswers({});
      setCurrentAnswer([]);
      setMode('prompt');
      setInput('');
      setOutput(prev => prev + '\n❌ Questionnaire cancelled. All progress deleted.\n');
      return;
    }

    // Handle Escape (go back to questionnaire)
    if (key.escape) {
      setCancelConfirmActive(false);
      setQuestionnaireActive(true);
      setMode('prompt');
      return;
    }
  }, { isActive: cancelConfirmActive });

  // Executing mode input handler (capture Escape to cancel)
  useInput((inputChar, key) => {
    if (mode !== 'executing') return;

    // Handle Escape (show cancel confirmation)
    if (key.escape) {
      setCancelExecutionActive(true);
      setMode('cancel-execution');
      return;
    }
  }, { isActive: mode === 'executing' });

  // Cancel execution confirmation input handler
  useInput((inputChar, key) => {
    if (!cancelExecutionActive) return;

    // Handle Y (confirm cancellation)
    if (inputChar && inputChar.toLowerCase() === 'y') {
      // Mark execution as cancelled
      if (sponsorCallExecutionId) {
        (async () => {
          try {
            const { CeremonyHistory } = await import('./ceremony-history.js');
            const history = new CeremonyHistory(path.join(process.cwd(), '.avc'));
            history.completeExecution('sponsor-call', sponsorCallExecutionId, 'user-cancelled', {
              stage: executionState.stage,
              substep: executionState.substep,
              tokensUsed: executionState.tokensUsed
            });
          } catch (error) {
            // Silently fail
          }
        })();
        setSponsorCallExecutionId(null);
      }

      // Delete created files
      const filesDeleted = [];
      for (const file of executionState.filesCreated) {
        try {
          const fullPath = path.join(process.cwd(), file);
          if (existsSync(fullPath)) {
            unlinkSync(fullPath);
            filesDeleted.push(file);
          }
        } catch (error) {
          // Silently fail
        }
      }

      // Delete progress file
      try {
        const initiator = new ProjectInitiator();
        const progressPath = initiator.sponsorCallProgressPath;
        if (existsSync(progressPath)) {
          unlinkSync(progressPath);
        }
      } catch (error) {
        // Silently fail
      }

      // Stop active logger
      if (activeLogger) {
        activeLogger.stop();
        CommandLogger.cleanupOldLogs();
        setActiveLogger(null);
      }

      // Reset state
      setCancelExecutionActive(false);
      setMode('prompt');
      setInput('');
      setIsExecuting(false);
      setExecutingMessage('');
      setExecutingSubstep('');
      setExecutionState({
        stage: '',
        substep: '',
        tokensUsed: { input: 0, output: 0, total: 0 },
        filesCreated: []
      });

      let message = '\n❌ Operation cancelled.\n';
      if (filesDeleted.length > 0) {
        message += '\nDeleted files:\n';
        filesDeleted.forEach(f => {
          message += `  • ${f}\n`;
        });
      }
      message += `\nTokens consumed: ${executionState.tokensUsed.input.toLocaleString()} input, ${executionState.tokensUsed.output.toLocaleString()} output (${executionState.tokensUsed.total.toLocaleString()} total)\n`;

      setOutput(prev => prev + message);
      return;
    }

    // Handle N (continue execution)
    if (inputChar && inputChar.toLowerCase() === 'n') {
      setCancelExecutionActive(false);
      setMode('executing');
      return;
    }

    // Handle Escape (continue execution)
    if (key.escape) {
      setCancelExecutionActive(false);
      setMode('executing');
      return;
    }
  }, { isActive: cancelExecutionActive });

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
          setOutput(prev => prev +
            `\n❌ Failed to kill process ${processToKill.pid}\n\n` +
            `   Unable to stop the process (permission denied or process protected).\n` +
            `   Please manually stop the process or change the port.\n\n` +
            `   To change the port, edit .avc/avc.json:\n` +
            `   {\n` +
            `     "settings": {\n` +
            `       "documentation": {\n` +
            `         "port": 5173\n` +
            `       }\n` +
            `     }\n` +
            `   }\n\n`
          );
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

          setOutput(prev => prev +
            '📦 Starting documentation server in background...\n' +
            `   URL: http://localhost:${port}\n` +
            `   View process output: /processes\n\n`
          );
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
        setOutput(prev => prev +
          '\n❌ Operation cancelled.\n\n' +
          `   To change the port, edit .avc/avc.json:\n` +
          `   {\n` +
          `     "settings": {\n` +
          `       "documentation": {\n` +
          `         "port": 5173\n` +
          `       }\n` +
          `     }\n` +
          `   }\n\n`
        );
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

  // Model Configuration Prompt Handler
  useInput((input, key) => {
    if (!modelConfigActive || modelConfigMode !== 'prompt') return;

    // Handle Escape (cancel)
    if (key.escape) {
      setOutput(prev => prev + '\n✅ You can configure models later by editing .avc/avc.json\n');
      setModelConfigActive(false);
      setInput(''); // Clear input buffer
      setMode('prompt');
      return;
    }

    // Handle y/n input immediately (no Enter required)
    if (input && !key.ctrl && !key.meta) {
      const char = input.toLowerCase();
      if (char === 'y') {
        setModelConfigMode('ceremony');
        setCeremonySelectIndex(0);
        setOutput(prev => prev + '\n');
      } else if (char === 'n') {
        setOutput(prev => prev + '\n✅ You can configure models later by editing .avc/avc.json\n');
        setModelConfigActive(false);
        setInput(''); // Clear input buffer
        setMode('prompt');
      }
      // Ignore other characters
    }
  }, { isActive: modelConfigActive && modelConfigMode === 'prompt' });

  // Model Configuration Ceremony Selection Handler
  useInput((input, key) => {
    if (!modelConfigActive || modelConfigMode !== 'ceremony') return;

    if (key.upArrow) {
      const ceremonies = modelConfigurator.getCeremonies();
      setCeremonySelectIndex(Math.max(0, ceremonySelectIndex - 1));
      return;
    }

    if (key.downArrow) {
      const ceremonies = modelConfigurator.getCeremonies();
      setCeremonySelectIndex(Math.min(ceremonies.length - 1, ceremonySelectIndex + 1));
      return;
    }

    if (key.return) {
      const ceremonies = modelConfigurator.getCeremonies();
      setSelectedCeremony(ceremonies[ceremonySelectIndex]);
      setModelConfigMode('stage');
      setStageSelectIndex(0);
      return;
    }

    if (key.escape) {
      // Save configuration and exit
      if (configurationChanges.length > 0) {
        modelConfigurator.saveConfig();
        setOutput(prev => prev + '\n💾 Configuration saved successfully!\n');
      }
      setModelConfigActive(false);
      setInput(''); // Clear input buffer
      setMode('prompt');
      return;
    }
  }, { isActive: modelConfigActive && modelConfigMode === 'ceremony' });

  // Model Configuration Stage Selection Handler
  useInput((input, key) => {
    if (!modelConfigActive || modelConfigMode !== 'stage') return;

    if (key.upArrow) {
      const stages = modelConfigurator.getStagesForCeremony(selectedCeremony.name);
      setStageSelectIndex(Math.max(0, stageSelectIndex - 1));
      return;
    }

    if (key.downArrow) {
      const stages = modelConfigurator.getStagesForCeremony(selectedCeremony.name);
      setStageSelectIndex(Math.min(stages.length - 1, stageSelectIndex + 1));
      return;
    }

    if (key.return) {
      const stages = modelConfigurator.getStagesForCeremony(selectedCeremony.name);
      setSelectedStage(stages[stageSelectIndex]);
      setModelConfigMode('model');
      setModelSelectIndex(0);
      return;
    }

    if (key.escape) {
      setModelConfigMode('ceremony');
      setCeremonySelectIndex(0);
      return;
    }
  }, { isActive: modelConfigActive && modelConfigMode === 'stage' });

  // Model Configuration Model Selection Handler
  useInput((input, key) => {
    if (!modelConfigActive || modelConfigMode !== 'model') return;

    if (key.upArrow) {
      const models = modelConfigurator.getAvailableModels();
      setModelSelectIndex(Math.max(0, modelSelectIndex - 1));
      return;
    }

    if (key.downArrow) {
      const models = modelConfigurator.getAvailableModels();
      setModelSelectIndex(Math.min(models.length - 1, modelSelectIndex + 1));
      return;
    }

    if (key.return) {
      const models = modelConfigurator.getAvailableModels();
      const selectedModel = models[modelSelectIndex];

      // Update configuration
      modelConfigurator.updateStage(selectedCeremony.name, selectedStage.id, selectedModel.id);

      // Track change
      setConfigurationChanges(prev => [...prev, {
        ceremony: selectedCeremony.name,
        stage: selectedStage.name,
        oldModel: selectedStage.model,
        newModel: selectedModel.id
      }]);

      setOutput(prev => prev + `\n✅ Updated ${selectedStage.name}: ${selectedStage.model} → ${selectedModel.id}\n`);

      // Go back to stage selection
      setModelConfigMode('stage');
      setStageSelectIndex(0);
      return;
    }

    if (key.escape) {
      setModelConfigMode('stage');
      return;
    }
  }, { isActive: modelConfigActive && modelConfigMode === 'model' });

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

    // Show cancel questionnaire confirmation if active
    if (cancelConfirmActive) {
      return React.createElement(Box, { flexDirection: 'column', marginY: 1 },
        React.createElement(Text, null, output),
        React.createElement(CancelQuestionnaireConfirmation)
      );
    }

    // Show cancel execution confirmation if active
    if (cancelExecutionActive) {
      return React.createElement(Box, { flexDirection: 'column', marginY: 1 },
        React.createElement(Text, null, output),
        React.createElement(CancelExecutionConfirmation, {
          executionState: executionState
        })
      );
    }

    // Show preview if active
    if (showPreview) {
      return React.createElement(Box, { flexDirection: 'column', marginY: 1 },
        React.createElement(Text, null, output),
        React.createElement(AnswersPreview, {
          answers: questionnaireAnswers,
          questions: questionnaireQuestions,
          defaultSuggested: defaultSuggestedAnswers
        })
      );
    }

    // Show questionnaire if active
    if (questionnaireActive) {
      const currentQuestion = questionnaireQuestions[currentQuestionIndex];

      return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
        React.createElement(Text, null, output),
        React.createElement(QuestionDisplay, {
          question: currentQuestion,
          index: currentQuestionIndex,
          total: questionnaireQuestions.length,
          editMode: editingQuestionIndex !== -1
        }),
        React.createElement(MultiLineInput, {
          lines: currentAnswer,
          showCharCount: true,
          cursorLine: cursorLine,
          cursorChar: cursorChar
        }),
        React.createElement(QuestionnaireProgress, {
          current: currentQuestionIndex,
          total: questionnaireQuestions.length,
          answers: questionnaireAnswers,
          lastSave: lastAutoSave
        })
      );
    }

    // Show spinner while executing - WITH real-time output above
    if (isExecuting) {
      return React.createElement(Box, { flexDirection: 'column', marginY: 1, flexShrink: 0 },
        // Show output first (includes command echo)
        output ? React.createElement(Box, { marginBottom: 1 },
          React.createElement(Text, null, output)
        ) : null,
        // Show spinner below output
        React.createElement(LoadingSpinner, {
          message: executingMessage,
          substep: executingSubstep
        })
      );
    }

    // Show output if available (but not when in selector mode to avoid overlap)
    if (output && mode !== 'selector') {
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
  const renderModelConfig = () => {
    if (!modelConfigActive || !modelConfigurator) return null;

    if (modelConfigMode === 'prompt') {
      return React.createElement(ModelConfigPrompt);
    }

    if (modelConfigMode === 'ceremony') {
      return React.createElement(CeremonySelector, {
        ceremonies: modelConfigurator.getCeremonies(),
        selectedIndex: ceremonySelectIndex,
        onIndexChange: setCeremonySelectIndex
      });
    }

    if (modelConfigMode === 'stage' && selectedCeremony) {
      return React.createElement(StageSelector, {
        ceremonyName: selectedCeremony.name,
        stages: modelConfigurator.getStagesForCeremony(selectedCeremony.name),
        selectedIndex: stageSelectIndex,
        availableProviders: modelConfigurator.availableProviders
      });
    }

    if (modelConfigMode === 'model' && selectedStage) {
      return React.createElement(ModelSelector, {
        stageName: selectedStage.name,
        currentModel: selectedStage.model,
        models: modelConfigurator.getAvailableModels(),
        selectedIndex: modelSelectIndex
      });
    }

    return null;
  };

  const renderPrompt = () => {
    if (mode !== 'prompt' || questionnaireActive || showPreview || removeConfirmActive || killConfirmActive || processViewerActive || cancelConfirmActive || isExecuting || modelConfigActive) return null;

    // Show loading indicator while app is initializing
    if (!isStableRender) {
      return React.createElement(Box, { flexDirection: 'row', flexShrink: 0 },
        React.createElement(Text, { color: 'cyan' },
          React.createElement(Spinner, { type: 'dots' }),
          ' ',
          'Initializing...'
        )
      );
    }

    return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
      React.createElement(InputWithCursor, { input: input }),
      React.createElement(HistoryHint, { hasHistory: commandHistory.length > 0 })
    );
  };

  return React.createElement(Box, { flexDirection: 'column', overflow: 'hidden' },
    !hasInteracted && mode !== 'selector' && React.createElement(Banner),
    renderOutput(),
    renderProcessViewer(),
    renderSelector(),
    renderModelConfig(),
    renderPrompt(),
    !questionnaireActive && !showPreview && !removeConfirmActive && !killConfirmActive && !processViewerActive && !cancelConfirmActive && !modelConfigActive && mode !== 'executing' && React.createElement(BottomRightStatus, { backgroundProcesses })
  );
};

// Export render function
export function startRepl() {
  // Set environment variable to indicate REPL mode
  process.env.AVC_REPL_MODE = 'true';

  // Set up signal handlers for graceful shutdown
  const cleanupAndExit = (signal) => {
    // Mark any in-progress ceremony as aborted
    if (activeExecutionId && activeCeremony) {
      try {
        const { CeremonyHistory } = require('./ceremony-history.js');
        const history = new CeremonyHistory(path.join(process.cwd(), '.avc'));
        history.load();

        history.completeExecution(activeCeremony, activeExecutionId, 'abrupt-termination', {
          note: `Process terminated by signal: ${signal}`
        });
      } catch (error) {
        // Silent fail - we're exiting anyway
      }
    }

    // Stop background processes
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
