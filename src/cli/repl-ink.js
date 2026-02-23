import React, { useState, useEffect, useMemo, useRef, useTransition } from 'react';
import { render, Box, Text, Static, useInput, useApp, useStdout, useIsScreenReaderEnabled } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import { execSync } from 'child_process';
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProjectInitiator } from './init.js';
import { TemplateProcessor } from './template-processor.js';
import { DocumentationBuilder } from './build-docs.js';
import { KanbanServerManager } from './kanban-server-manager.js';
import { UpdateChecker } from './update-checker.js';
import { UpdateInstaller } from './update-installer.js';
import { CommandLogger } from './command-logger.js';
import { BackgroundProcessManager } from './process-manager.js';
import { registerCallbacks, startCommand, endCommand, cancelCommand, sendCeremonyHeader, sendProgress, sendSubstep, sendOutput, sendIndented, sendError, sendWarning, sendSuccess, sendInfo, sendDebug, clearProgress } from './messaging-api.js';
import { bold, gray, cyan, green, yellow, boldCyan } from './ansi-colors.js';
import { outputBuffer } from './output-buffer.js';
import { StaticOutput } from './components/static-output.js';
import { getProjectNotInitializedMessage, getCeremonyHeader } from './message-constants.js';

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
      return React.createElement(Text, { key: `logo-${i}` },
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
  const { stdout } = useStdout();
  const width = stdout.columns || 80;
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
    // Line 2: Substep (yellow, fully left-aligned)
    substep ? React.createElement(Box, null,
      React.createElement(Text, { color: 'yellow' }, substep)
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
    key: 'INITIAL_SCOPE',
    title: 'Initial Scope & Key Features',
    guidance: 'Describe the initial scope: key features, main workflows, and core functionality. What will users be able to do?',
    example: 'Users can create and manage tasks, assign them to team members with due dates, track progress through kanban boards, receive notifications for updates, and generate reports on team productivity.'
  },
  // Questions below are AI-prefilled after architecture selection
  {
    key: 'TARGET_USERS',
    title: 'Target Users',
    guidance: 'Who will use this application? Describe the user types and their roles.',
    example: 'Small business owners managing daily operations, inventory managers tracking stock levels, sales staff processing orders, and administrators overseeing system configuration.'
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
    key: 'TECHNICAL_EXCLUSIONS',
    title: 'Technology Exclusions (Optional)',
    guidance: 'List any technologies, tools, or architectural patterns that should explicitly NOT be used. Leave blank to skip.',
    example: 'No Docker or containers (use local processes instead). No TypeScript (plain JavaScript only). No microservices (monolithic architecture only). No ORM (raw SQL queries only). No cloud services.'
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
  const isScreenReader = useIsScreenReaderEnabled();

  if (isScreenReader) {
    // Plain-text mode for screen readers — no ANSI art, arrows, or inverse text
    return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
      React.createElement(Text, null,
        `Question ${index + 1} of ${total}: ${question.title}${editMode ? ' (edit mode)' : ''}. ${question.guidance}. Press Enter twice to submit, Enter once on empty line to skip.`
      )
    );
  }

  const helpText = `\nTip: You can paste multi-line text from other apps\n↵↵ Press Enter twice when done, or Enter once to skip\n^U Press Ctrl+U to clear all text\n`;

  return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
    React.createElement(Text, { bold: true, color: 'white' },
      `\nQuestion ${index + 1} of ${total}: ${question.title}${editMode ? ' [EDIT MODE]' : ''}\n`
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
  // All hooks must be called unconditionally (Rules of Hooks) — before any early return

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

  // Early return for empty lines — all hooks already called above
  if (lines.length === 0) {
    return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
      React.createElement(Text, { dimColor: true },
        React.createElement(Text, { inverse: true }, ' ')
      )
    );
  }

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

        return React.createElement(Text, { key: `ml-${actualIdx}` },
          beforeCursor,
          React.createElement(Text, { inverse: true }, atCursor),
          afterCursor
        );
      }

      // Regular line (no cursor) - fallback to old behavior
      return React.createElement(Text, { key: `ml-${actualIdx}` },
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
const AnswersPreview = ({ answers, questions, defaultSuggested, aiPrefilled }) => {
  // Check if any AI-prefilled answers exist
  const hasAiPrefilled = aiPrefilled && aiPrefilled.size > 0;

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'cyan' },
      'Review Your Answers\n'
    ),
    hasAiPrefilled ? React.createElement(Text, { dimColor: true },
      'AI = AI-suggested (you can edit these) | User = User-entered\n'
    ) : null,
    ...questions.map((question, idx) => {
      const answer = answers[question.key] || '(Skipped - will use AI suggestion)';
      const lines = answer.split('\n');
      const isDefault = defaultSuggested && defaultSuggested.has(question.key);
      const isAiPrefilled = aiPrefilled && aiPrefilled.has(question.key);

      // Determine icon and color
      let icon = '';
      let textColor = undefined;
      let labelText = null;

      if (isDefault) {
        textColor = 'red';
        labelText = '   (default from settings)\n';
      } else if (isAiPrefilled) {
        icon = 'AI: ';
        textColor = 'yellow';
      } else if (answers[question.key]) {
        icon = 'User: ';
      }

      return React.createElement(Box, { key: question.key, flexDirection: 'column', marginBottom: 1 },
        React.createElement(Text, { bold: true },
          `${icon}${idx + 1}. ${question.title}\n`
        ),
        labelText ? React.createElement(Text, {
          color: textColor,
          italic: true,
          dimColor: true
        }, labelText) : null,
        ...lines.map((line, lineIdx) =>
          React.createElement(Text, {
            key: `line-${lineIdx}`,
            color: textColor,
            dimColor: !answers[question.key]
          }, line)
        )
      );
    }),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true },
        '\nType 1-6 to edit a question | Enter to submit | Escape to cancel\n'
      )
    )
  );
};

// Compact action hint shown in dynamic area when preview is displayed in static output
const AnswersPreviewActions = () => {
  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { dimColor: true }, 'Type 1-6 to edit | Enter to submit | Esc to cancel')
  );
};

// Cancel questionnaire confirmation component
const CancelQuestionnaireConfirmation = () => {
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'yellow' },
      'Cancel Questionnaire\n'
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

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'yellow' },
      'Cancel Operation\n'
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
        React.createElement(Text, { key: `file-${idx}`, dimColor: true },
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
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'red' },
      'Remove AVC Project Structure\n'
    ),
    React.createElement(Text, { color: 'yellow' },
      'WARNING: This is a DESTRUCTIVE operation!\n'
    ),
    React.createElement(Text, null,
      'The following will be PERMANENTLY DELETED:\n'
    ),
    contents.length > 0 && React.createElement(Box, { flexDirection: 'column', marginY: 1 },
      React.createElement(Text, { bold: true }, '.avc/ folder contents:'),
      ...contents.map((item, idx) =>
        React.createElement(Text, { key: `content-${idx}`, dimColor: true },
          `   • ${item}`
        )
      )
    ),
    React.createElement(Text, { color: 'red' },
      '\nAll project definitions, epics, stories, tasks, and documentation will be lost.'
    ),
    React.createElement(Text, { color: 'red' },
      'All VitePress documentation will be deleted.'
    ),
    React.createElement(Text, { color: 'red' },
      'This action CANNOT be undone.\n'
    ),
    React.createElement(Text, { dimColor: true },
      'Note: The .env file will NOT be deleted.\n'
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
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'yellow' },
      'External Process Using Port\n'
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
      'This is NOT an AVC documentation server.\n'
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

const KanbanPortConflictPrompt = ({ conflictInfo, confirmInput }) => {
  const hasPid = conflictInfo && conflictInfo.pid != null;
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'yellow' }, 'Port Conflict — Kanban Board\n'),
    hasPid
      ? React.createElement(Box, { flexDirection: 'column', marginY: 1 },
          React.createElement(Text, null, `Port ${conflictInfo.port} is in use by an external process:`),
          React.createElement(Text, { bold: true }, `  Process: ${conflictInfo.command}`),
          React.createElement(Text, { dimColor: true }, `  PID: ${conflictInfo.pid}`),
          React.createElement(Text, { color: 'red' }, '\nThis is NOT an AVC kanban server.\n')
        )
      : React.createElement(Text, { marginY: 1 },
          `Port ${conflictInfo.port} is in use but the process could not be identified.\n`
        ),
    React.createElement(Box, { borderStyle: 'round', borderColor: 'yellow', marginY: 1 },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'yellow' }, 'Choose an action:'),
        hasPid && React.createElement(Text, null,
          `  • Type "kill" to kill PID ${conflictInfo.pid} and use port ${conflictInfo.port}`
        ),
        React.createElement(Text, null,
          `  • Type "port XXXX" to use a different port (suggested: ${conflictInfo.suggestedPort})`
        ),
        React.createElement(Text, null, '  • Type "no" or press Escape to cancel')
      )
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, null, 'Response: '),
      React.createElement(Text, null, confirmInput),
      React.createElement(Text, { inverse: true }, ' ')
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true }, 'Press Enter to submit | Escape to cancel\n')
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
        { label: '/kanban         Launch kanban board server', value: '/kanban', aliases: ['/k'] },
        { label: '/remove         Remove AVC project structure', value: '/remove', aliases: ['/rm'] }
      ]
    },
    {
      name: 'Ceremonies',
      commands: [
        { label: '/sprint-planning    Create Epics and Stories', value: '/sprint-planning', aliases: ['/sp'] },
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
      React.createElement(Box, { marginTop: 1 },
        React.createElement(Text, { dimColor: true }, '(Use arrows, number keys, or Esc to cancel)')
      )
    );
  }

  // Grouped view
  let commandIndex = 0;
  const groupElements = [];

  commandGroups.forEach((group, groupIdx) => {
    // Group header (add margin above groups after the first)
    groupElements.push(
      React.createElement(Box, {
        key: `header-${groupIdx}`,
        marginTop: groupIdx === 0 ? 0 : 1
      },
        React.createElement(Text, {
          bold: true,
          color: 'cyan',
          dimColor: true
        }, `── ${group.name.toUpperCase()} ──`)
      )
    );

    // Group commands
    group.commands.forEach((cmd) => {
      const isSelected = commandIndex === selectedIndex;
      groupElements.push(
        React.createElement(Box, {
          key: cmd.value,
          'aria-role': 'listitem',
          'aria-state': { selected: isSelected }
        },
          React.createElement(Text, {
            color: isSelected ? 'green' : 'white',
            inverse: isSelected
          }, `${isSelected ? '› ' : '  '}[${commandIndex + 1}] ${cmd.label}`)
        )
      );
      commandIndex++;
    });
  });

  return React.createElement(Box, { flexDirection: 'column', 'aria-role': 'list' },
    ...groupElements,
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { dimColor: true }, '(Use arrows, number keys, or Esc to cancel)')
    )
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
    return React.createElement(Box, { flexDirection: 'column' },
      React.createElement(Text, null, 'Background Processes\n'),
      React.createElement(Text, { dimColor: true }, '   No background processes running\n'),
      React.createElement(Text, { dimColor: true }, '   Press Esc to return\n')
    );
  }

  const manager = getProcessManager();

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, null, 'Background Processes\n'),
    React.createElement(Text, { dimColor: true },
      `   Select a process to view details (${processList.length} total)\n`
    ),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...processList.map((process, idx) => {
        const isSelected = idx === selectedIndex;
        const statusColor = process.status === 'running' ? 'green' :
          process.status === 'stopped' ? 'yellow' :
            process.status === 'exited' ? 'blue' : 'red';
        const statusDot = '●';
        const uptime = manager.formatUptime(manager.getUptime(process.id));

        return React.createElement(Box, { key: process.id, gap: 1 },
          React.createElement(Text, {
            bold: isSelected,
            color: isSelected ? 'cyan' : undefined,
            inverse: isSelected
          },
            `  ${isSelected ? '›' : ' '} ${process.name}`
          ),
          React.createElement(Text, { color: statusColor }, statusDot),
          React.createElement(Text, { dimColor: true }, uptime)
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

  // Get recent output (last 10 lines to keep dynamic area small)
  const recentOutput = process.output.slice(-10);

  const statusColor = process.status === 'running' ? 'green' :
    process.status === 'stopped' ? 'yellow' :
      process.status === 'exited' ? 'blue' : 'red';

  return React.createElement(Box, { flexDirection: 'column' },
    // Header
    React.createElement(Text, { bold: true },
      `${process.name}\n`
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
      '\nRecent Output (last 50 lines):\n'
    ),

    recentOutput.length === 0
      ? React.createElement(Text, { dimColor: true }, 'No output yet\n')
      : React.createElement(Box, { flexDirection: 'column', borderStyle: 'single' },
        ...recentOutput.map((line, idx) =>
          React.createElement(Text, {
            key: `output-${idx}`,
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
    React.createElement(Text, { color: 'green' }, '> '),
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
      `${process.name} running`
    );
  }

  return React.createElement(Text, { dimColor: true },
    `${runningProcesses.length} processes running`
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

  const { stdout } = useStdout();
  const width = stdout.columns || 80;

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
      ? `${runningProcesses[0].name} running`
      : `${runningCount} processes running`;
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
    React.createElement(Text, { bold: true, color: 'cyan' }, 'Configure models now? (y/n) ')
  );
};

/**
 * Ceremony Selector Component
 */
/**
 * Architecture Selector Component
 */
const ArchitectureSelector = ({ architectures, selectedIndex }) => {
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'cyan' }, 'Select architecture:'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1, 'aria-role': 'list' },
      ...architectures.map((arch, idx) => {
        const tag = arch.requiresCloudProvider ? '[Cloud]' : '[Local]';
        const isSelected = idx === selectedIndex;
        return React.createElement(Box, { key: arch.name, flexDirection: 'column', marginBottom: 1 },
          React.createElement(Text, {
            color: isSelected ? 'green' : 'white',
            bold: isSelected,
            inverse: isSelected,
            'aria-role': 'listitem',
            'aria-state': { selected: isSelected }
          }, (isSelected ? '> ' : '> ') + (idx + 1) + '. ' + tag + ' ' + arch.name),
          arch.description && React.createElement(Text, { dimColor: true }, arch.description),
          arch.bestFor && React.createElement(Text, { color: 'yellow' }, 'Best for: ' + arch.bestFor)
        );
      })
    ),
    React.createElement(Text, { dimColor: true }, '↑/↓: Navigate | 1-N: Quick select | Enter: Confirm | Esc: Skip')
  );
};

/**
 * Deployment Strategy Selector Component
 * Explicit choice: Local MVP First or Cloud Deployment
 */
const DeploymentStrategySelector = ({ selectedIndex }) => {
  const strategies = [
    {
      label: 'Local MVP First',
      description: 'Build and validate your MVP on your local machine',
      bullets: ['Zero cloud costs during development phase', 'Run on localhost or Docker Compose', 'Migrate to cloud when ready for production'],
      bestFor: 'Best for: Validating ideas, learning, budget-conscious projects'
    },
    {
      label: 'Cloud Deployment',
      description: 'Deploy to production cloud infrastructure from day one',
      bullets: ['AWS, Azure, or Google Cloud Platform', 'Scalable managed services, production-ready', 'Immediate global availability'],
      bestFor: 'Best for: Enterprise projects, immediate scale requirements'
    }
  ];
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'cyan' }, 'Select deployment strategy:'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1, 'aria-role': 'list' },
      ...strategies.map(({ label, description, bullets, bestFor }, i) => {
        const isSelected = i === selectedIndex;
        return React.createElement(Box, { key: label, flexDirection: 'column', marginBottom: 1 },
          React.createElement(Text, {
            color: isSelected ? 'green' : 'white',
            bold: isSelected,
            inverse: isSelected,
            'aria-role': 'listitem',
            'aria-state': { selected: isSelected }
          }, '> ' + (i + 1) + '. ' + label),
          React.createElement(Text, { dimColor: true }, description),
          ...bullets.map(b => React.createElement(Text, { key: b, dimColor: true }, '  • ' + b)),
          React.createElement(Text, { color: 'yellow' }, bestFor)
        );
      })
    ),
    React.createElement(Text, { dimColor: true }, '↑/↓: Navigate | 1-2: Quick select | Enter: Confirm | Esc: Skip')
  );
};

/**
 * Cloud Provider Selector Component
 */
const CloudProviderSelector = ({ selectedIndex }) => {
  const providers = [
    { label: 'Amazon Web Services (AWS)', description: 'Most comprehensive cloud platform with 200+ services and global reach' },
    { label: 'Microsoft Azure', description: 'Strong .NET/Windows integration, excellent hybrid cloud capabilities' },
    { label: 'Google Cloud Platform (GCP)', description: 'Cutting-edge data/ML services, strong Kubernetes support' }
  ];
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'cyan' }, 'Select cloud provider:'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1, 'aria-role': 'list' },
      ...providers.map(({ label, description }, i) => {
        const isSelected = i === selectedIndex;
        return React.createElement(Box, { key: label, flexDirection: 'column' },
          React.createElement(Text, {
            color: isSelected ? 'green' : 'white',
            bold: isSelected,
            inverse: isSelected,
            'aria-role': 'listitem',
            'aria-state': { selected: isSelected }
          },
            '> ' + (i + 1) + '. ' + label
          ),
          React.createElement(Text, { dimColor: true }, '   ' + description)
        );
      })
    ),
    React.createElement(Text, { dimColor: true }, '↑/↓: Navigate | 1-3: Quick select | Enter: Confirm | Esc: Skip')
  );
};

/**
 * Convert a cost string (e.g. "$50/mo", "Free tier", "varies") to a
 * 1-5 "$" scale where $ = cheapest and $$$$$ = most expensive.
 */
const toCostMarks = (costStr) => {
  if (!costStr) return null;
  const s = String(costStr).toLowerCase();
  if (/free|open.?source|\$0\b/.test(s)) return '$';
  const match = s.match(/\$?([\d,]+)/);
  if (match) {
    const val = parseInt(match[1].replace(',', ''), 10);
    if (val === 0) return '$';
    if (val <= 20) return '$$';
    if (val <= 100) return '$$$';
    if (val <= 500) return '$$$$';
    return '$$$$$';
  }
  return '$$$'; // unknown → mid-range
};

/**
 * No-op: DB comparison display moved entirely into DatabaseRecommendationDisplay
 * React component (rendered alongside DatabaseChoiceSelector). Static buffer only
 * receives a post-selection confirmation line — the same pattern as deploy strategy
 * and architecture selectors.
 */
const appendDatabaseComparison = (_comparison) => { };

/**
 * Write answers preview to static output buffer.
 * Called before setShowPreview(true) so the dynamic area only needs
 * the compact action-hint component (3 lines) instead of 20-60 lines.
 */
const appendAnswersPreview = (answers, questions, defaultSuggested, aiPrefilled) => {
  const hasAiPrefilled = aiPrefilled && aiPrefilled.size > 0;
  const parts = [boldCyan('Review Your Answers')];

  if (hasAiPrefilled) {
    parts.push(gray('AI = AI-suggested (you can edit these) | User = User-entered'));
  }

  for (let idx = 0; idx < questions.length; idx++) {
    const question = questions[idx];
    const answer = answers[question.key] || '(Skipped - will use AI suggestion)';
    const isDefault = defaultSuggested && defaultSuggested.has(question.key);
    const isAiPrefilled = aiPrefilled && aiPrefilled.has(question.key);

    let titlePrefix = '';
    if (isAiPrefilled) titlePrefix = 'AI: ';
    else if (answers[question.key]) titlePrefix = 'User: ';

    parts.push('');
    parts.push(bold(`${titlePrefix}${idx + 1}. ${question.title}`));

    if (isDefault) {
      parts.push(gray(answer));
      parts.push(gray('   (default from settings)'));
    } else if (isAiPrefilled) {
      answer.split('\n').forEach(line => parts.push(yellow(line)));
    } else {
      answer.split('\n').forEach(line => parts.push(line));
    }
  }

  parts.push('');
  parts.push(gray('Type 1-6 to edit a question | Enter to submit | Escape to cancel'));

  outputBuffer.append(parts.join('\n'));
};

/**
 * No-op: React DeploymentStrategySelector owns its own header and option display.
 * Static output only ever gets the post-selection confirmation line (written in the
 * Enter handler), keeping prior-step text from persisting on screen during later steps.
 */
const appendDeploymentStrategyOptions = () => { };

/**
 * No-op: React ArchitectureSelector owns its own header and option display.
 * Static output only ever gets the post-selection confirmation line (written in the
 * Enter handler), keeping prior-step text from persisting on screen during later steps.
 */
const appendArchitectureOptions = (architectures) => { };

/**
 * No-op: React CloudProviderSelector owns its own header, option names, and descriptions.
 * Static output only ever gets the post-selection confirmation line (written in the
 * Enter handler), keeping prior-step text from persisting on screen during later steps.
 */
const appendCloudProviderOptions = (architectureName) => { };

/**
 * Write model configuration overview to static output buffer before activating overview nav.
 */
const appendConfigurationOverview = (overview) => {
  if (!overview) return;

  const items = [];
  items.push({ ...overview.main, type: 'main' });
  overview.stages.forEach(stage => {
    items.push({ ...stage, type: 'stage' });
    if (stage.validationTypes) {
      stage.validationTypes.forEach(vtype => {
        items.push({ ...vtype, type: 'validation-type', parentStage: stage.id });
      });
    }
  });

  outputBuffer.append(boldCyan(`Model Configuration - ${overview.ceremony}`));
  outputBuffer.append('');
  items.forEach((item, idx) => {
    const indent = '  '.repeat(item.level || 0);
    outputBuffer.append(`${indent}${bold(item.label || 'Unknown')}`);
    outputBuffer.append(gray(`${indent}  Provider: ${item.provider || 'N/A'} | Model: ${item.model || 'N/A'}`));
    if (item.calls > 0) {
      outputBuffer.append(gray(`${indent}  Calls: ~${item.calls} | Cost: ${item.formattedCost || 'N/A'}`));
    }
    if (item.validators && item.validators.length > 0) {
      outputBuffer.append(gray(`${indent}  Validators: ${item.validators.slice(0, 3).join(', ')}${item.validators.length > 3 ? '...' : ''}`));
    }
    outputBuffer.append('');
  });
};

/**
 * Database Recommendation Display Component
 * Displays SQL vs NoSQL comparison with pros/cons
 */
const DatabaseRecommendationDisplay = ({ comparison, keyMetrics }) => {
  if (!comparison) return null;

  // Build SQL examples list (include AI's recommendation + common alternatives)
  const sqlExamples = [comparison.sqlOption.database, 'PostgreSQL', 'MySQL', 'SQLite']
    .filter((db, idx, arr) => arr.indexOf(db) === idx) // Remove duplicates
    .slice(0, 3)
    .join(', ');

  // Build NoSQL examples list (include AI's recommendation + common alternatives)
  const nosqlExamples = [comparison.nosqlOption.database, 'MongoDB', 'DynamoDB', 'Firestore']
    .filter((db, idx, arr) => arr.indexOf(db) === idx) // Remove duplicates
    .slice(0, 3)
    .join(', ');

  const sqlCostMarks = toCostMarks(comparison.sqlOption.estimatedCosts?.monthly);
  const nosqlCostMarks = toCostMarks(comparison.nosqlOption.estimatedCosts?.monthly);

  // Support both pros/cons (real LLM) and strengths/weaknesses (mock / some providers)
  const sqlPros = comparison.sqlOption.pros || comparison.sqlOption.strengths || [];
  const sqlCons = comparison.sqlOption.cons || comparison.sqlOption.weaknesses || [];
  const nosqlPros = comparison.nosqlOption.pros || comparison.nosqlOption.strengths || [];
  const nosqlCons = comparison.nosqlOption.cons || comparison.nosqlOption.weaknesses || [];

  return React.createElement(Box, { flexDirection: 'column', gap: 1 },
    React.createElement(Text, { bold: true, color: 'cyan' }, 'Database Options Comparison'),

    // Key Metrics row
    ...(keyMetrics && (keyMetrics.estimatedReadWriteRatio || keyMetrics.expectedThroughput || keyMetrics.dataComplexity) ? [
      React.createElement(Box, { key: 'metrics', flexDirection: 'row', gap: 3 },
        keyMetrics.estimatedReadWriteRatio && React.createElement(Text, { key: 'rw', color: 'gray' }, 'R/W: ' + keyMetrics.estimatedReadWriteRatio),
        keyMetrics.expectedThroughput && React.createElement(Text, { key: 'tp', color: 'gray' }, 'Throughput: ' + keyMetrics.expectedThroughput),
        keyMetrics.dataComplexity && React.createElement(Text, { key: 'dc', color: 'gray' }, 'Complexity: ' + keyMetrics.dataComplexity)
      )
    ] : []),

    // Side-by-side SQL vs NoSQL columns
    React.createElement(Box, { flexDirection: 'row', gap: 2 },

      // SQL column — 50% width
      React.createElement(Box, { flexDirection: 'column', width: '50%', gap: 1 },
        React.createElement(Text, { bold: true, color: 'green' }, 'SQL (e.g., ' + sqlExamples + ')'),
        React.createElement(Box, { flexDirection: 'column' },
          React.createElement(Text, { color: 'white' }, 'Pros:'),
          ...sqlPros.slice(0, 3).map((pro, i) =>
            React.createElement(Text, { key: `sql-pro-${i}`, color: 'gray' }, '+ ' + pro)
          )
        ),
        React.createElement(Box, { flexDirection: 'column' },
          React.createElement(Text, { color: 'white' }, 'Cons:'),
          ...sqlCons.slice(0, 3).map((con, i) =>
            React.createElement(Text, { key: `sql-con-${i}`, color: 'gray' }, '- ' + con)
          )
        ),
        sqlCostMarks && React.createElement(Text, { color: 'yellow' }, 'Cost: ' + sqlCostMarks)
      ),

      // NoSQL column — 50% width
      React.createElement(Box, { flexDirection: 'column', width: '50%', gap: 1 },
        React.createElement(Text, { bold: true, color: 'blue' }, 'NoSQL (e.g., ' + nosqlExamples + ')'),
        React.createElement(Box, { flexDirection: 'column' },
          React.createElement(Text, { color: 'white' }, 'Pros:'),
          ...nosqlPros.slice(0, 3).map((pro, i) =>
            React.createElement(Text, { key: `nosql-pro-${i}`, color: 'gray' }, '+ ' + pro)
          )
        ),
        React.createElement(Box, { flexDirection: 'column' },
          React.createElement(Text, { color: 'white' }, 'Cons:'),
          ...nosqlCons.slice(0, 3).map((con, i) =>
            React.createElement(Text, { key: `nosql-con-${i}`, color: 'gray' }, '- ' + con)
          )
        ),
        nosqlCostMarks && React.createElement(Text, { color: 'yellow' }, 'Cost: ' + nosqlCostMarks)
      )
    )
  );
};

/**
 * Database Choice Selector Component
 * 4 options: Let AI choose, Choose SQL, Choose NoSQL, Skip
 */
const DatabaseChoiceSelector = ({ comparison, selectedIndex, recommendedChoice }) => {
  if (!comparison) return null;

  const sqlCostMarks = toCostMarks(comparison.sqlOption.estimatedCosts?.monthly) || '$$$';
  const nosqlCostMarks = toCostMarks(comparison.nosqlOption.estimatedCosts?.monthly) || '$$$';

  // Determine which option AI recommends
  const recommendedDb = recommendedChoice === 'sql' ? comparison.sqlOption.database : comparison.nosqlOption.database;
  const recommendedType = recommendedChoice === 'sql' ? 'SQL' : 'NoSQL';

  const choices = [
    {
      label: 'Let AI choose ' + recommendedType + ' (' + recommendedDb + ' as primary option)',
      description: 'AI recommends this based on your project requirements'
    },
    {
      label: 'Choose SQL (e.g., PostgreSQL, MySQL, SQLite)',
      description: sqlCostMarks + ' - ' + (comparison.sqlOption.bestFor || 'Best for complex relationships').substring(0, 60)
    },
    {
      label: 'Choose NoSQL (e.g., MongoDB, DynamoDB, Firestore)',
      description: nosqlCostMarks + ' - ' + (comparison.nosqlOption.bestFor || 'Best for simple access patterns').substring(0, 60)
    },
    {
      label: 'Skip',
      description: 'No database analysis (proceed with general architecture)'
    }
  ];

  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { bold: true }, 'Choose your database approach:'),
    React.createElement(Box, { marginTop: 1, flexDirection: 'column', gap: 1, 'aria-role': 'list' },
      ...choices.map((choice, i) =>
        React.createElement(Box, { key: `choice-${i}`, marginLeft: 0, flexDirection: 'column', 'aria-role': 'listitem', 'aria-state': { selected: i === selectedIndex } },
          React.createElement(Text, {
            bold: i === selectedIndex,
            inverse: i === selectedIndex,
            color: i === selectedIndex ? 'green' : 'white'
          }, (i === selectedIndex ? '> ' : '> ') + choice.label),
          React.createElement(Text, { color: 'gray' }, '  ' + choice.description)
        )
      )
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { color: 'gray' }, '↑/↓: Navigate | 1-4: Quick select | Enter: Confirm | Esc: Go back')
    )
  );
};

/**
 * Database Deep-Dive Questions Component
 */
const DatabaseQuestionSelector = ({ questionIndex, answers, currentInput }) => {
  const questions = [
    {
      key: 'readWriteRatio',
      label: 'Read vs Write Ratio',
      hint: 'e.g., "70/30" for read-heavy, "30/70" for write-heavy',
      example: '50/50'
    },
    {
      key: 'dailyRequests',
      label: 'Expected Daily Requests',
      hint: 'Approximate number (e.g., "5000", "100K", "1M+")',
      example: '10000'
    },
    {
      key: 'costSensitivity',
      label: 'Cost Sensitivity',
      hint: 'Low (optimize for performance) | Medium (balanced) | High (minimize cost)',
      example: 'Medium'
    },
    {
      key: 'dataRelationships',
      label: 'Data Relationship Complexity',
      hint: 'Simple (flat data) | Moderate (some joins) | Complex (many relationships)',
      example: 'Moderate'
    }
  ];

  const current = questions[questionIndex];
  const currentAnswer = currentInput || answers[current.key] || '';

  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { color: 'cyan' }, 'Question ' + (questionIndex + 1) + ' of ' + questions.length)
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { bold: true }, current.label)
    ),
    React.createElement(Box, { marginLeft: 2, marginTop: 1 },
      React.createElement(Text, { color: 'gray' }, current.hint)
    ),
    React.createElement(Box, { marginTop: 1, marginLeft: 2 },
      React.createElement(Text, { color: 'green' }, '> '),
      React.createElement(Text, null, currentAnswer),
      React.createElement(Text, { inverse: true, color: 'white' }, '█')
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { color: 'gray' }, 'Enter: Submit | Esc: Cancel customization')
    )
  );
};

const CeremonySelector = ({ ceremonies, selectedIndex, onIndexChange }) => {
  return React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
    React.createElement(Text, { bold: true }, 'Select Ceremony to Configure'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...ceremonies.map((ceremony, idx) =>
        React.createElement(Box, { key: ceremony.name, flexDirection: 'column' },
          React.createElement(Text, { color: idx === selectedIndex ? 'green' : 'white' },
            (idx === selectedIndex ? '› ' : '  ') + (idx + 1) + '. ' + ceremony.name
          )/* No need to show the ceremony details.
          ,
          React.createElement(Text, { dimColor: true },
            'Main: ' + ceremony.mainModel + ' | Validation: ' + (ceremony.validationModel || 'none')
          )
          */
        )
      )
    ),
    React.createElement(Text, {}, '\n'),
    React.createElement(Text, { dimColor: true, marginTop: 1 }, '(Press Enter to select, Esc to finish)')
  );
};

/**
 * Stage Selector Component
 */
const StageSelector = ({ ceremonyName, stages, selectedIndex, availableProviders }) => {
  return React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
    React.createElement(Text, { bold: true }, ceremonyName),
    React.createElement(Text, {}, '\n'),
    React.createElement(Text, { dimColor: true }, 'Select Stage to Configure:'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...stages.map((stage, idx) => {
        const hasApiKey = availableProviders.includes(stage.provider);
        return React.createElement(Box, { key: stage.id, flexDirection: 'column' },
          React.createElement(Text, { color: idx === selectedIndex ? 'green' : 'white' },
            (idx === selectedIndex ? '› ' : '  ') + (idx + 1) + '. ' + stage.name
          ),
          React.createElement(Text, { dimColor: true },
            'Current: ' + stage.model + ' (' + stage.provider + ')' + (!hasApiKey ? ' (No API key)' : '')
          )
        );
      })
    ),
    React.createElement(Text, { dimColor: true, marginTop: 1 }, '(Press Enter to select, Esc to go back)')
  );
};

/**
 * Configuration Overview Component - Shows all config points with costs
 */
const ConfigurationOverview = ({ overview, selectedIndex }) => {
  if (!overview) return null;

  // Build flat list of all configuration items for navigation
  const items = [];

  // Add main
  items.push({ ...overview.main, type: 'main' });

  // Add stages
  overview.stages.forEach(stage => {
    items.push({ ...stage, type: 'stage' });

    // Add validation types if present
    if (stage.validationTypes) {
      stage.validationTypes.forEach(vtype => {
        items.push({ ...vtype, type: 'validation-type', parentStage: stage.id });
      });
    }
  });

  // Build children array properly
  const children = [
    React.createElement(Text, { bold: true }, `Model Configuration - ${overview.ceremony}`),
    React.createElement(Text, {}, '\n')
  ];

  // Add item elements
  items.forEach((item, idx) => {
    const isSelected = idx === selectedIndex;
    const indent = '  '.repeat(item.level || 0);
    const prefix = isSelected ? '› ' : '  ';

    const itemChildren = [
      React.createElement(Text, {
        color: isSelected ? 'green' : 'white',
        bold: isSelected
      }, `${indent}${prefix}${item.label || 'Unknown'}`),

      React.createElement(Text, { dimColor: true },
        `${indent}  Provider: ${item.provider || 'N/A'} | Model: ${item.model || 'N/A'}`
      )
    ];

    if (item.calls > 0) {
      itemChildren.push(
        React.createElement(Text, { dimColor: true },
          `${indent}  Calls: ~${item.calls} | Cost: ${item.formattedCost || 'N/A'}`
        )
      );
    }

    if (item.validators && item.validators.length > 0) {
      itemChildren.push(
        React.createElement(Text, { dimColor: true, italic: true },
          `${indent}  Validators: ${item.validators.slice(0, 3).join(', ')}${item.validators.length > 3 ? '...' : ''}`
        )
      );
    }

    itemChildren.push(React.createElement(Text, {}, '\n'));

    children.push(React.createElement(Box, { key: `item-${idx}`, flexDirection: 'column' }, ...itemChildren));
  });

  // Add navigation help
  children.push(
    React.createElement(Text, { dimColor: true }, 'Navigation: ↑/↓ Select | Enter Change | Esc Back')
  );

  return React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 }, ...children);
};

// Compact navigation hint shown in dynamic area when overview is in static buffer
const ConfigurationOverviewNav = ({ overview, selectedIndex }) => {
  if (!overview) return null;
  const items = [{ ...overview.main }];
  overview.stages.forEach(stage => {
    items.push({ ...stage });
    if (stage.validationTypes) stage.validationTypes.forEach(vt => items.push({ ...vt }));
  });
  const item = items[selectedIndex];
  return React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { color: 'green', bold: true },
      `> ${item ? item.label : ''}  (${selectedIndex + 1}/${items.length})`
    ),
    React.createElement(Text, { dimColor: true }, '↑/↓: Navigate | Enter: Change model | Esc: Back')
  );
};

/**
 * Validation Type Selector Component
 */
const ValidationTypeSelector = ({ ceremonyName, stageName, validationTypes, selectedIndex }) => {
  return React.createElement(Box, { flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1 },
    React.createElement(Text, { bold: true }, `${ceremonyName} > ${stageName}`),
    React.createElement(Text, {}, '\n'),
    React.createElement(Text, { dimColor: true }, 'Select Validation Type:'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...validationTypes.map((type, idx) =>
        React.createElement(Box, { key: type.id, flexDirection: 'column' },
          React.createElement(Text, { color: idx === selectedIndex ? 'green' : 'white' },
            (idx === selectedIndex ? '› ' : '  ') + (idx + 1) + '. ' + type.name
          ),
          React.createElement(Text, { dimColor: true },
            type.description
          )
        )
      )
    ),
    React.createElement(Text, {}, '\n'),
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
    React.createElement(Text, {}, '\n'),
    React.createElement(Text, { dimColor: true }, 'Available Models:'),
    React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
      ...models.map((model, idx) => {
        const isCurrent = model.id === currentModel;
        const apiKeyIndicator = model.hasApiKey ? ' (OK)' : ' (No key)';
        const prefix = (idx === selectedIndex ? '> ' : '  ') + (idx + 1) + '. ';
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
    React.createElement(Text, {}, '\n'),
    React.createElement(Text, { dimColor: true }, '(Press Enter to select, Esc to cancel)'),
    React.createElement(Text, { dimColor: true }, 'Models without API keys can be selected; add the key to .env before running ceremonies'),
  );
};

// Global ceremony execution tracking (for signal handler cleanup)
let activeExecutionId = null;
let activeCeremony = null;

// Main App component
const App = () => {
  const { exit } = useApp();
  const isScreenReaderEnabled = useIsScreenReaderEnabled();
  const [, startAnswerTransition] = useTransition(); // for non-urgent answer state merges
  const [mode, setMode] = useState('prompt'); // 'prompt' | 'selector' | 'executing'
  const [input, setInput] = useState('');
  const [outputItems, setOutputItems] = useState([]);
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingMessage, setExecutingMessage] = useState('');
  const [executingSubstep, setExecutingSubstep] = useState('');

  // Questionnaire state
  const [questionnaireActive, setQuestionnaireActive] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState({});
  const answersRef = useRef({});
  const [currentAnswer, setCurrentAnswer] = useState([]);
  const [emptyLineCount, setEmptyLineCount] = useState(0);
  const [questionnaireInlineWarning, setQuestionnaireInlineWarning] = useState('');
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

  // Kanban port conflict state
  const [kanbanPortConflictActive, setKanbanPortConflictActive] = useState(false);
  const [kanbanPortConflictInput, setKanbanPortConflictInput] = useState('');
  const [kanbanPortConflictInfo, setKanbanPortConflictInfo] = useState(null); // { pid, command, port, suggestedPort }

  // Background process state
  const [backgroundProcesses, setBackgroundProcesses] = useState(new Map());
  const [processViewerActive, setProcessViewerActive] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState(null);

  // Stable initial render state - prevents first-keypress layout glitch
  const [isStableRender, setIsStableRender] = useState(false);

  // Architecture selection state
  const [architectureSelectorActive, setArchitectureSelectorActive] = useState(false);
  const [architectureOptions, setArchitectureOptions] = useState([]);
  const [selectedArchitectureIndex, setSelectedArchitectureIndex] = useState(0);
  const [selectedArchitecture, setSelectedArchitecture] = useState(null);

  // Database analysis state
  const [databaseRecommendation, setDatabaseRecommendation] = useState(null); // raw recommendation from AI
  const [databaseComparison, setDatabaseComparison] = useState(null); // { sqlOption, nosqlOption, keyMetrics }
  const [recommendedChoice, setRecommendedChoice] = useState(null); // 'sql' | 'nosql' | null - AI's recommendation
  const [databaseChoiceActive, setDatabaseChoiceActive] = useState(false);
  const [databaseChoiceIndex, setDatabaseChoiceIndex] = useState(0); // 0: Let AI choose, 1: SQL, 2: NoSQL, 3: Skip
  const [selectedDatabaseType, setSelectedDatabaseType] = useState(null); // 'sql' | 'nosql' | null

  // Database deep-dive questionnaire state
  const [databaseQuestionsActive, setDatabaseQuestionsActive] = useState(false);
  const [databaseQuestionIndex, setDatabaseQuestionIndex] = useState(0);
  const [databaseQuestionInput, setDatabaseQuestionInput] = useState('');
  const [databaseAnswers, setDatabaseAnswers] = useState({
    readWriteRatio: '50/50',
    dailyRequests: '',
    costSensitivity: 'Medium',
    dataRelationships: 'Moderate'
  });

  // Cloud provider selection state
  const [cloudProviderSelectorActive, setCloudProviderSelectorActive] = useState(false);
  const [cloudProviderIndex, setCloudProviderIndex] = useState(0);
  const [selectedCloudProvider, setSelectedCloudProvider] = useState(null);

  // Deployment strategy selection state
  const [deploymentStrategy, setDeploymentStrategy] = useState(null); // 'local-mvp' | 'cloud' | null
  const [deploymentStrategySelectorActive, setDeploymentStrategySelectorActive] = useState(false);
  const [deploymentStrategyIndex, setDeploymentStrategyIndex] = useState(0); // 0: Local MVP, 1: Cloud
  const [isProcessingDeploymentStrategy, setIsProcessingDeploymentStrategy] = useState(false); // Prevent duplicate execution

  // Pre-fill tracking
  const [aiPrefilledQuestions, setAiPrefilledQuestions] = useState(new Set());

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
  const [modelConfigMode, setModelConfigMode] = useState('prompt'); // 'prompt' | 'ceremony' | 'overview' | 'stage' | 'validation-type' | 'model'
  const [modelConfigurator, setModelConfigurator] = useState(null);
  const [selectedCeremony, setSelectedCeremony] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedValidationType, setSelectedValidationType] = useState(null);
  const [ceremonySelectIndex, setCeremonySelectIndex] = useState(0);
  const [configOverview, setConfigOverview] = useState(null);
  const [overviewSelectIndex, setOverviewSelectIndex] = useState(0);
  const [stageSelectIndex, setStageSelectIndex] = useState(0);
  const [validationTypeSelectIndex, setValidationTypeSelectIndex] = useState(0);
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

  // Register messaging callbacks for centralized message management
  useEffect(() => {
    registerCallbacks({
      setExecutingMessage,
      setExecutingSubstep
    });
  }, []);

  // Keep answersRef in sync so async callbacks always read the latest answers
  useEffect(() => { answersRef.current = questionnaireAnswers; }, [questionnaireAnswers]);

  // Subscribe to OutputBuffer changes
  useEffect(() => {
    const unsubscribe = outputBuffer.subscribe((items) => {
      setOutputItems(items);
    });
    return unsubscribe;
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

  // Clear inline warning whenever the question changes
  useEffect(() => {
    setQuestionnaireInlineWarning('');
  }, [currentQuestionIndex]);

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
        console.log('\nStopping background processes...\n');
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
    '/sprint-planning', '/sp',
    '/seed',
    '/status', '/s',
    '/models', '/m',
    '/tokens', '/tk',
    '/remove', '/rm',
    '/documentation', '/d',
    '/kanban', '/k',
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
      '/rm': '/remove',
      '/d': '/documentation',
      '/p': '/processes'
    };
    return aliases[cmd.toLowerCase()] || cmd;
  };

  // Guards fileLog: true only while a CommandLogger is active.
  // Without this guard, console.log('[DEBUG]...') would leak to the terminal when
  // no .avc folder exists (and therefore no logger was created).
  let _fileLogActive = false;

  // File-only logger: [DEBUG] prefix routes to CommandLogger file, not terminal
  const fileLog = (level, message, data = null) => {
    if (!_fileLogActive) return;
    const ts = new Date().toISOString();
    if (data !== null) {
      console.log(`[DEBUG] [${level}] [${ts}] ${message}`, JSON.stringify(data, null, 2));
    } else {
      console.log(`[DEBUG] [${level}] [${ts}] ${message}`);
    }
  };

  // Handle command execution
  const executeCommand = async (cmd) => {
    try {
      // Prevent duplicate execution if already executing
      if (isExecuting) {
        return;
      }

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
      outputBuffer.append(`\n> ${command}\n`);

      // Create command logger
      const commandName = command.replace('/', '').toLowerCase();
      let logger = null;

      // Check if .avc folder exists
      const avcPath = path.join(process.cwd(), '.avc');
      const avcExists = existsSync(avcPath);

      // Only create logger for commands that do actual work (API calls, file operations, etc.)
      // Exclude informational commands (/help, /version, /exit, /restart, /processes)
      // For /init, always create logger (it creates .avc)
      // For other commands, only create logger if .avc already exists
      const loggedCommands = [
        '/init',
        '/sprint-planning',
        '/seed',
        '/status',
        '/models',
        '/tokens',
        '/remove',
        '/documentation',
        '/kanban'
      ];

      if (loggedCommands.includes(command.toLowerCase())) {
        if (command.toLowerCase() === '/init' || avcExists) {
          logger = new CommandLogger(commandName, process.cwd(), true); // inkMode = true
          logger.start();
          _fileLogActive = true;
          TemplateProcessor.setDebugLogFile(logger.getLogPath());
        }
      }

      try {
        switch (command.toLowerCase()) {
          case '/help':
            showHelp();
            break;

          case '/version':
            showVersion();
            break;

          case '/exit':
            setIsExecuting(false);
            const manager = getProcessManager();
            const running = manager.getRunningProcesses();

            if (running.length > 0) {
              outputBuffer.append(`${gray('Stopping background processes...')}\n`);
              const stopped = manager.stopAll();
              outputBuffer.append(`${green(`Stopped ${stopped} process(es)`)}\n`);
            }

            outputBuffer.append(`${boldCyan('Thanks for using AVC!')}\n`);
            setTimeout(() => {
              exit();
              process.exit(0);
            }, 500);
            return;

          case '/init':
          case '/i': {
            const t0 = Date.now();
            fileLog('INFO', '/init handler called', { cwd: process.cwd(), avcExists });
            sendProgress('Initializing project structure...');
            await runInit();
            fileLog('INFO', '/init complete', { duration: `${Date.now() - t0}ms` });
            break;
          }

          case '/sprint-planning':
          case '/sp': {
            const t0 = Date.now();
            fileLog('INFO', '/sprint-planning handler called', { cwd: process.cwd(), avcExists });
            sendProgress('Expanding project structure...');
            await runSprintPlanning();
            fileLog('INFO', '/sprint-planning complete', { duration: `${Date.now() - t0}ms` });
            break;
          }

          case '/seed': {
            // Parse story ID from command
            const storyIdMatch = input.match(/^\/seed\s+(\S+)/);
            if (!storyIdMatch) {
              fileLog('ERROR', '/seed called without story ID', { input });
              outputBuffer.append('Story ID required', 'ERROR');
              outputBuffer.append('Usage: /seed <story-id>\nExample: /seed context-0001-0001');
              break;
            }
            const storyId = storyIdMatch[1];
            const t0 = Date.now();
            fileLog('INFO', '/seed handler called', { storyId, cwd: process.cwd() });
            sendProgress(`Seeding story ${storyId}...`);
            await runSeed(storyId);
            fileLog('INFO', '/seed complete', { storyId, duration: `${Date.now() - t0}ms` });
            break;
          }

          case '/status':
          case '/s': {
            const t0 = Date.now();
            fileLog('INFO', '/status handler called', { cwd: process.cwd(), avcExists });
            sendProgress('Checking project status...');
            await runStatus();
            fileLog('INFO', '/status complete', { duration: `${Date.now() - t0}ms` });
            break;
          }

          case '/models':
          case '/m': {
            const t0 = Date.now();
            fileLog('INFO', '/models handler called', { cwd: process.cwd(), avcExists });
            sendProgress('Loading model configuration...');
            await runModels();
            fileLog('INFO', '/models complete', { duration: `${Date.now() - t0}ms` });
            break;
          }

          case '/tokens':
          case '/tk': {
            const t0 = Date.now();
            fileLog('INFO', '/tokens handler called', { cwd: process.cwd(), avcExists });
            sendProgress('Analyzing token usage...');
            await runTokens();
            fileLog('INFO', '/tokens complete', { duration: `${Date.now() - t0}ms` });
            break;
          }

          case '/remove':
          case '/rm': {
            const t0 = Date.now();
            fileLog('INFO', '/remove handler called', { cwd: process.cwd(), avcExists });
            sendProgress('Preparing to remove AVC structure...');
            await runRemove();
            fileLog('INFO', '/remove complete', { duration: `${Date.now() - t0}ms` });
            break;
          }

          case '/documentation':
          case '/d': {
            const t0 = Date.now();
            fileLog('INFO', '/documentation handler called', { cwd: process.cwd(), avcExists });
            sendProgress('Building documentation...');
            await runBuildDocumentation();
            fileLog('INFO', '/documentation complete', { duration: `${Date.now() - t0}ms` });
            break;
          }

          case '/kanban':
          case '/k': {
            const t0 = Date.now();
            fileLog('INFO', '/kanban handler called', { cwd: process.cwd(), avcExists });
            sendProgress('Starting kanban board server...');
            await runKanban();
            fileLog('INFO', '/kanban complete', { duration: `${Date.now() - t0}ms` });
            break;
          }

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
              outputBuffer.append(`${gray('Stopping background processes...')}\n`);
              const stopped = restartManager.stopAll();
              outputBuffer.append(`${green(`Stopped ${stopped} process(es)`)}\n\n`);
            }

            outputBuffer.append(`${boldCyan('Restarting AVC...')}\n`);
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
              outputBuffer.append(`Unknown command: ${command}`, 'ERROR');
              outputBuffer.append(`Type /help to see available commands\nTip: Try /h for help, /v for version, /q to exit`);
              outputBuffer.append('\n');
            } else {
              outputBuffer.append('Commands must start with /', 'INFO');
              outputBuffer.append('Example: /init, /status, /help\nTip: Type / and press Enter to see all commands');
              outputBuffer.append('\n');
            }
        }
      } catch (error) {
        outputBuffer.append(`Error: ${error.message}`, 'ERROR');
      } finally {
        if (logger) {
          {
            // Stop logger after command completes
            logger.stop();
            _fileLogActive = false;
            TemplateProcessor.setDebugLogFile(null);

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
          if (currentMode === 'process-viewer' || currentMode === 'kill-confirm' || currentMode === 'kanban-port-conflict' || currentMode === 'cancel-confirm') {
            return currentMode; // Keep special modes
          }
          return 'prompt';
        });
      }, 100);
    } catch (outerError) {
      // Handle any unexpected errors
      outputBuffer.append(`Unexpected error: ${outerError.message}`, 'ERROR');
      outputBuffer.append('Please try again or type /help for assistance');
      setIsExecuting(false);
      clearProgress();
      setMode('prompt');
      setInput('');
    }
  };

  const showHelp = () => {
    const groups = [
      {
        title: 'Ceremonies',
        cmds: [
          ['/sprint-planning (/sp)', 'Expand project into Epics and Stories'],
          ['/seed <story-id>', 'Generate tasks for a story'],
        ]
      },
      {
        title: 'Project',
        cmds: [
          ['/init (/i)', 'Create AVC project structure and config files'],
          ['/status (/s)', 'Show current project status'],
          ['/remove (/rm)', 'Remove AVC project structure'],
        ]
      },
      {
        title: 'Services',
        cmds: [
          ['/documentation (/d)', 'Build and serve project documentation'],
          ['/kanban (/k)', 'Launch kanban board visualization'],
          ['/processes (/p)', 'View and manage background processes'],
        ]
      },
      {
        title: 'Config',
        cmds: [
          ['/models (/m)', 'Configure LLM models for ceremonies'],
          ['/tokens', 'Show token usage statistics'],
        ]
      },
      {
        title: 'Utilities',
        cmds: [
          ['/help (/h)', 'Show this help message'],
          ['/version (/v)', 'Show version information'],
          ['/restart', 'Restart AVC (Ctrl+R)'],
          ['/exit (/q)', 'Exit AVC interactive mode'],
        ]
      },
    ];

    outputBuffer.append(`${boldCyan('Available Commands')}\n\n`);
    for (const group of groups) {
      outputBuffer.append(`${boldCyan(group.title)}\n`);
      for (const [cmd, desc] of group.cmds) {
        outputBuffer.append(`  ${cmd.padEnd(26)} ${gray(desc)}\n`);
      }
      outputBuffer.append('\n');
    }
    outputBuffer.append(
      `${boldCyan('Tips')}\n` +
      `  ${gray('Type / + Enter to open interactive command selector')}\n` +
      `  ${gray('Use number keys (1-N) to quickly select in menus')}\n` +
      `  ${gray('Use arrow keys to navigate command history')}\n` +
      `  ${gray('Press Tab to auto-complete commands')}\n` +
      `  ${gray('Press Ctrl+R to restart after updates')}\n\n`
    );
  };

  const showVersion = () => {
    const version = getVersion();
    outputBuffer.append(`${boldCyan('AVC')}  ${bold(version)}\n`);
    outputBuffer.append(`${gray('Node')}  ${process.version}\n`);
    outputBuffer.append(`${gray('Docs')}  ${cyan('https://agilevibecoding.org')}\n`);
  };

  const runInit = async () => {
    const initiator = new ProjectInitiator();

    startCommand('init');

    try {
      await initiator.init();

      const manager = getProcessManager();

      // ── Start documentation server ──────────────────────────────────────
      sendProgress('Starting documentation server...');
      const builder = new DocumentationBuilder(process.cwd());
      const docPort = builder.getPort();

      // Stop existing managed documentation server if any
      const existingDocServer = manager.getRunningProcesses().find(p => p.name === 'Documentation Server');
      if (existingDocServer) {
        manager.stopProcess(existingDocServer.id);
        manager.cleanupFinished();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const docProcessId = manager.startProcess({
        name: 'Documentation Server',
        command: 'npx',
        args: ['vitepress', 'dev', '--port', String(docPort)],
        cwd: builder.docsDir,
      });
      fileLog('INFO', 'documentation server started during init', { docProcessId, docPort });

      // ── Start kanban server ─────────────────────────────────────────────
      sendProgress('Starting kanban board...');
      const kanbanManager = new KanbanServerManager();
      const kanbanPort = kanbanManager.getPort();

      // Stop existing managed kanban server if any
      const existingKanbanServer = manager.getRunningProcesses().find(p => p.name === 'Kanban Board Server');
      if (existingKanbanServer) {
        manager.stopProcess(existingKanbanServer.id);
        manager.cleanupFinished();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const kanbanServerPath = path.join(__dirname, '..', 'kanban', 'server', 'start.js');
      const kanbanProcessId = manager.startProcess({
        name: 'Kanban Board Server',
        command: 'node',
        args: [kanbanServerPath, process.cwd(), String(kanbanPort)],
        cwd: process.cwd(),
      });
      fileLog('INFO', 'kanban server started during init', { kanbanProcessId, kanbanPort });

      // ── Show project links ──────────────────────────────────────────────
      sendOutput('');
      sendSuccess('Project ready — set your API key in .env then open the Kanban board to get started');
      sendIndented(`${gray('Kanban Board  ')} http://localhost:${kanbanPort}`, 1);
      sendIndented(`${gray('Documentation ')} http://localhost:${docPort}`, 1);
      sendOutput('');
    } finally {
      endCommand();
    }
  };

  const runSprintPlanning = async () => {
    const initiator = new ProjectInitiator();

    startCommand('sprint-planning');

    try {
      if (!initiator.isAvcProject()) {
        sendError(getProjectNotInitializedMessage());
        sendOutput('');
        return;
      }
      await initiator.sprintPlanning();
    } finally {
      endCommand();
    }
  };

  const runSeed = async (storyId) => {
    const initiator = new ProjectInitiator();

    startCommand('seed');

    try {
      if (!initiator.isAvcProject()) {
        sendError(getProjectNotInitializedMessage());
        sendOutput('');
        return;
      }
      await initiator.seed(storyId);
      sendInfo('Docs: https://agilevibecoding.org/ceremonies/seed');
    } finally {
      endCommand();
    }
  };

  const runSponsorCall = async () => {
    // Start new execution context - cancels previous run and clears output
    startCommand('sponsor-call');

    // Ceremony header removed from console for minimal workflow experience
    // (It will be included in the final generated document)

    const initiator = new ProjectInitiator();

    // Check if project is initialized
    if (!initiator.isAvcProject()) {
      sendError(getProjectNotInitializedMessage());
      sendOutput('');
      return;
    }

    // Validate API keys BEFORE starting questionnaire
    sendProgress('Validating API keys...');
    setIsExecuting(true);

    const validationResult = await initiator.validateProviderApiKey();

    // Guard: stale questionnaireActive=true from a previous run could flash Q1
    // when isExecuting goes false before the new questionnaire state is set
    setQuestionnaireActive(false);
    setIsExecuting(false);

    if (!validationResult.valid) {
      sendError('API Key Validation Failed');
      sendOutput(validationResult.message);
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

      sendWarning('Previous sponsor call was interrupted during document generation.');
      sendOutput('Starting fresh...');

      // Delete stale progress file
      if (fs.existsSync(progressPath)) {
        fs.unlinkSync(progressPath);
      }
    }

    // Check for incomplete progress (questionnaire only)
    if (initiator.hasIncompleteProgress(progressPath)) {
      const savedProgress = initiator.readProgress(progressPath);

      if (savedProgress) {
        // Restore deployment strategy if present (applies to all stages)
        if (savedProgress.deploymentStrategy) {
          setDeploymentStrategy(savedProgress.deploymentStrategy);
        }

        // Resume from deployment strategy selection
        if (savedProgress.stage === 'deployment-strategy') {
          setQuestionnaireAnswers(savedProgress.collectedValues || {});
          appendDeploymentStrategyOptions();
          setDeploymentStrategySelectorActive(true);
          setDeploymentStrategyIndex(savedProgress.deploymentStrategyIndex || 0);
          setMode('prompt');
          sendInfo('Resuming from deployment strategy selection...');
          sendOutput('');
          return;
        }

        // Resume from database choice stage
        if (savedProgress.stage === 'database-choice') {
          setQuestionnaireAnswers(savedProgress.collectedValues || {});
          setDatabaseRecommendation(savedProgress.databaseRecommendation || null);
          if (savedProgress.databaseComparison) {
            setDatabaseComparison(savedProgress.databaseComparison);
            setRecommendedChoice(savedProgress.recommendedChoice || 'sql');
            appendDatabaseComparison(savedProgress.databaseComparison);
          }
          setDatabaseChoiceActive(true);
          setDatabaseChoiceIndex(0);
          setMode('prompt');
          sendOutput('');
          sendInfo('Resuming from database analysis...');
          sendOutput('');
          return;
        }

        // Resume from database questions stage
        if (savedProgress.stage === 'database-questions') {
          setQuestionnaireAnswers(savedProgress.collectedValues || {});
          setDatabaseRecommendation(savedProgress.databaseRecommendation || null);
          setDatabaseAnswers(savedProgress.databaseAnswers || {});
          setDatabaseQuestionIndex(savedProgress.databaseQuestionIndex || 0);
          setDatabaseQuestionsActive(true);
          setMode('prompt');
          sendOutput('');
          sendInfo('Resuming from database deep-dive questions...');
          sendOutput('');
          return;
        }

        // Resume from architecture selection stage
        if (savedProgress.stage === 'architecture-selection') {
          setQuestionnaireAnswers(savedProgress.collectedValues || {});
          setDatabaseRecommendation(savedProgress.databaseRecommendation || null);
          if (savedProgress.databaseComparison) {
            setDatabaseComparison(savedProgress.databaseComparison);
            setRecommendedChoice(savedProgress.recommendedChoice || 'sql');
          }
          if (savedProgress.selectedDatabaseType) {
            setSelectedDatabaseType(savedProgress.selectedDatabaseType);
          }
          const resumeArchOptions = savedProgress.architectureSelection?.options || [];
          setArchitectureOptions(resumeArchOptions);
          appendArchitectureOptions(resumeArchOptions);
          setArchitectureSelectorActive(true);
          sendOutput('');
          sendInfo('Resuming from architecture selection...');
          sendOutput('');
          return;
        }

        // Resume from cloud provider selection stage
        if (savedProgress.stage === 'cloud-provider-selection') {
          setQuestionnaireAnswers(savedProgress.collectedValues || {});
          setDatabaseRecommendation(savedProgress.databaseRecommendation || null);
          if (savedProgress.databaseComparison) {
            setDatabaseComparison(savedProgress.databaseComparison);
            setRecommendedChoice(savedProgress.recommendedChoice || 'sql');
          }
          if (savedProgress.selectedDatabaseType) {
            setSelectedDatabaseType(savedProgress.selectedDatabaseType);
          }
          const resumeCloudArch = savedProgress.architectureSelection?.selected || null;
          setSelectedArchitecture(resumeCloudArch);
          appendCloudProviderOptions(resumeCloudArch?.name || 'Cloud Architecture');
          setCloudProviderSelectorActive(true);
          sendOutput('');
          sendInfo('Resuming from cloud provider selection...');
          sendOutput('');
          return;
        }

        // Resume from questionnaire stage
        if (savedProgress.stage === 'questionnaire') {
          // Restore AI prefill state if present
          if (savedProgress.aiPrefilledQuestions && Array.isArray(savedProgress.aiPrefilledQuestions)) {
            setAiPrefilledQuestions(new Set(savedProgress.aiPrefilledQuestions));
          }

          // Resume from saved progress - show preview to allow editing any question
          const resumeAnswers = savedProgress.collectedValues || {};
          const resumeAiPrefilled = savedProgress.aiPrefilledQuestions && Array.isArray(savedProgress.aiPrefilledQuestions)
            ? new Set(savedProgress.aiPrefilledQuestions) : new Set();
          appendAnswersPreview(resumeAnswers, questionnaireQuestions, defaultSuggestedAnswers, resumeAiPrefilled);
          setQuestionnaireAnswers(resumeAnswers);
          setShowPreview(true);
          sendOutput('');
          sendInfo('Resuming from saved progress...');
          sendOutput('');
          return;
        }
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
    // Ceremony header already sent at start of runSponsorCall
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

    // All output goes through messaging API (sendOutput/sendSuccess/etc.)

    // Progress callback to update spinner message, substep, and execution state
    // Uses batching to reduce re-renders
    const progressCallback = (message, substep = null, metadata = {}) => {
      // Batch all state updates together to prevent flickering
      if (substep !== null) {
        // Update substep only
        setExecutingSubstep(substep);

        // Update execution state with all changes in one call
        setExecutionState(prev => {
          const updates = { ...prev, substep: substep };

          // Include metadata updates in same batch
          if (metadata.tokensUsed) {
            updates.tokensUsed = {
              input: metadata.tokensUsed.input || 0,
              output: metadata.tokensUsed.output || 0,
              total: (metadata.tokensUsed.input || 0) + (metadata.tokensUsed.output || 0)
            };
          }

          if (metadata.filesCreated) {
            updates.filesCreated = metadata.filesCreated;
          }

          return updates;
        });
      } else {
        // Update main message and clear substep
        setExecutingMessage(message);
        setExecutingSubstep('');

        // Update execution state with all changes in one call
        setExecutionState(prev => {
          const updates = {
            ...prev,
            stage: message,
            substep: ''
          };

          // Include metadata updates in same batch
          if (metadata.tokensUsed) {
            updates.tokensUsed = {
              input: metadata.tokensUsed.input || 0,
              output: metadata.tokensUsed.output || 0,
              total: (metadata.tokensUsed.input || 0) + (metadata.tokensUsed.output || 0)
            };
          }

          if (metadata.filesCreated) {
            updates.filesCreated = metadata.filesCreated;
          }

          return updates;
        });
      }
    };

    try {
      // Pass answers and progress callback to ceremony
      const result = await initiator.sponsorCallWithAnswers(answers, progressCallback);

      // Check for error result
      if (result && result.error) {
        sendError(result.message);
        return;
      }

      // Structured completion summary
      sendSuccess('Sponsor Call completed');

      // Activities performed
      if (result && result.activities && result.activities.length > 0) {
        sendOutput('');
        sendOutput('Activities performed');
        result.activities.forEach(activity => {
          sendIndented(`• ${activity}`, 1);
        });
      }

      // Files created
      sendOutput('');
      sendOutput('Files created');
      if (result && result.outputPath) {
        sendIndented(gray(result.outputPath), 1);
      }
      if (result && result.contextPath) {
        sendIndented(gray(result.contextPath), 1);
      }

      // Token usage
      if (result && result.tokenUsage) {
        const w = 8;
        sendOutput('');
        sendOutput('Token usage');
        sendIndented(`${gray('Input'.padEnd(w))}  ${result.tokenUsage.input.toLocaleString()}`, 1);
        sendIndented(`${gray('Output'.padEnd(w))}  ${result.tokenUsage.output.toLocaleString()}`, 1);
        sendIndented(`${gray('Total'.padEnd(w))}  ${result.tokenUsage.total.toLocaleString()}`, 1);
        if (result.cost && result.cost.total > 0) {
          sendIndented(`${gray('Cost'.padEnd(w))}  ~$${result.cost.total.toFixed(4)}`, 1);
        }
      }

      // Next steps
      sendOutput('');
      sendInfo('Next: review docs, then run /sprint-planning to create Epics and Stories');

      // Auto-start documentation server (skipped in mock/test mode)
      if (!process.env.AVC_LLM_MOCK) {
        try {
          const builder = new DocumentationBuilder();
          if (builder.hasDocumentation()) {
            const manager = getProcessManager();
            const port = builder.getPort();
            const runningProcesses = manager.getRunningProcesses();
            const existingDocServer = runningProcesses.find(p => p.name === 'Documentation Server');
            if (!existingDocServer) {
              sendOutput('');
              sendOutput('Documentation Server');
              sendProgress('Starting documentation server...');
              const processId = manager.startProcess({
                name: 'Documentation Server',
                command: 'npx',
                args: ['vitepress', 'dev', '--port', String(port)],
                cwd: builder.docsDir
              });
              sendSuccess('Documentation server started');
              sendIndented(`${gray('URL')}      http://localhost:${port}`, 1);
              sendIndented(`${gray('PID')}      ${processId}`, 1);
              sendInfo('Stop with /processes');
              sendOutput('');
            } else {
              sendInfo(`Documentation server already running — http://localhost:${port}`);
              sendOutput('');
            }
          }
        } catch (docError) {
          sendWarning('Could not start documentation server: ' + docError.message);
          sendInfo('Run /documentation to start the server manually');
          sendOutput('');
        }
      }

    } finally {
      // outputManager.stop(); // Disabled - see line 2422
      // End execution context - clears progress indicators
      endCommand();
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
      fileLog('WARNING', 'Could not load questionnaire config', { error: error.message });
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

  const moveToNextQuestion = async (justAnsweredKey = null, justAnsweredValue = null) => {
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

    // Clear paste state for the question we just answered to prevent contamination
    if (justAnsweredKey) {
      setPastedContent(prev => {
        const newState = { ...prev };
        delete newState[justAnsweredKey];
        return newState;
      });
      setIsPasted(prev => ({
        ...prev,
        [justAnsweredKey]: false
      }));
    }

    // Build current answers including the just-answered value (to avoid React state timing issues)
    const currentAnswers = {
      ...questionnaireAnswers,
      ...(justAnsweredKey && { [justAnsweredKey]: justAnsweredValue })
    };

    // If editing from preview, return to preview after submitting the edit
    if (isEditingFromPreview) {
      appendAnswersPreview(currentAnswers, questionnaireQuestions, defaultSuggestedAnswers, aiPrefilledQuestions);
      setIsEditingFromPreview(false);
      setEditingQuestionIndex(-1);
      setShowPreview(true);
      setQuestionnaireActive(false);
      return;
    }

    // Check if we just answered INITIAL_SCOPE (index 1)
    // If so, show deployment strategy selector before proceeding
    if (currentQuestionIndex === 1 && currentAnswers.MISSION_STATEMENT && currentAnswers.INITIAL_SCOPE) {
      // CRITICAL: Update questionnaireAnswers state with both Q1 & Q2 explicitly
      // This fixes React state timing issue where saveQuestionnaireAnswer's async updates
      // haven't completed yet, causing Q1 & Q2 to be missing from state later
      setQuestionnaireAnswers({
        MISSION_STATEMENT: currentAnswers.MISSION_STATEMENT,
        INITIAL_SCOPE: currentAnswers.INITIAL_SCOPE
      });

      // Auto-save progress before showing strategy selector
      // Pass currentAnswers to handle React state timing issues
      autoSaveProgress(currentAnswers);

      // Show deployment strategy selector
      appendDeploymentStrategyOptions();
      setQuestionnaireActive(false);
      setMode('prompt');
      setDeploymentStrategySelectorActive(true);
      setDeploymentStrategyIndex(0);
      return;
    }

    if (currentQuestionIndex < questionnaireQuestions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // All questions answered - show preview
      await submitQuestionnaire(currentAnswers);
    }
  };

  const submitQuestionnaire = async (currentAnswers = null) => {
    // Set state changes FIRST
    setQuestionnaireActive(false);
    setMode('executing');

    // Delay for React/Ink to flush rendering buffer (longer delay for Ink's double buffering)
    await new Promise(resolve => setTimeout(resolve, 250));

    // Write answers preview to static buffer before activating preview mode
    const answersToShow = currentAnswers || questionnaireAnswers;
    appendAnswersPreview(answersToShow, questionnaireQuestions, defaultSuggestedAnswers, aiPrefilledQuestions);

    // Now show preview
    setShowPreview(true);
    setMode('preview');
  };

  const confirmSubmission = async () => {
    // Set state changes FIRST
    setShowPreview(false);
    setQuestionnaireActive(false);
    setMode('executing');
    setIsExecuting(true);

    // Delay for React/Ink to flush rendering buffer (longer delay for Ink's double buffering)
    await new Promise(resolve => setTimeout(resolve, 250));

    sendProgress('Generating initial project documentation with AI...');

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
      sendError(`Error: ${error.message}`);
    } finally {
      // Stop active logger after questionnaire completes
      if (activeLogger) {
        activeLogger.stop();
        _fileLogActive = false;
        TemplateProcessor.setDebugLogFile(null);
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

  /**
   * Trigger architecture recommendation and selection
   */
  const triggerArchitectureSelection = async () => {
    // Set executing state FIRST to show spinner immediately
    setQuestionnaireActive(false);
    setMode('executing');
    setIsExecuting(true);
    sendProgress('Analyzing database requirements...');
    sendSubstep('Preparing database analysis');

    try {
      const processor = new TemplateProcessor('sponsor-call', null, true);

      // PHASE 1: Database Analysis
      sendSubstep('Calling AI to analyze database needs (10-15 seconds)');

      const dbRec = await processor.getDatabaseRecommendation(
        answersRef.current.MISSION_STATEMENT,
        answersRef.current.INITIAL_SCOPE,
        deploymentStrategy // Pass deployment strategy for context
      );

      // Check if database is needed and has comparison (new format)
      if (dbRec.hasDatabaseNeeds && dbRec.confidence !== 'low' && dbRec.comparison) {
        // Store comparison and AI recommendation in new format
        setDatabaseComparison(dbRec.comparison);
        setRecommendedChoice(dbRec.recommendedChoice || 'sql'); // Default to SQL if not specified

        // Write comparison to static output before activating selector.
        // This prevents Ink height-tracking issues with the large comparison panel.
        appendDatabaseComparison(dbRec.comparison);

        // Activate selector BEFORE clearing isExecuting to prevent Q1 flash:
        // if isExecuting goes false before databaseChoiceActive is true, an intermediate
        // render with questionnaireActive=true (stale state) would briefly show Q1.
        setDatabaseChoiceActive(true);
        setDatabaseChoiceIndex(0);
        setMode('prompt');
        setQuestionnaireActive(false);

        // Clear executing state (selector is already active, so no gap)
        setExecutingMessage('');
        setExecutingSubstep('');
        setIsExecuting(false);

        // Save progress
        autoSaveProgress();
      } else {
        // No database needs or low confidence, skip to architecture
        sendInfo('No database requirements detected, proceeding with architecture analysis...');
        await proceedToArchitectureRecommendation();
      }
    } catch (error) {
      // Graceful degradation - skip database analysis on error
      sendWarning(`Database analysis failed (${error.message})`);
      sendOutput('Proceeding with architecture analysis...\n');

      // Continue with architecture selection
      await proceedToArchitectureRecommendation();
    }
  };

  /**
   * Proceed to architecture recommendation (after database analysis or skip)
   */
  const proceedToArchitectureRecommendation = async () => {
    setQuestionnaireActive(false);
    setMode('executing');
    setIsExecuting(true);
    sendProgress('Analyzing deployment architecture...');
    sendSubstep('Preparing architecture analysis');

    try {
      const processor = new TemplateProcessor('sponsor-call', null, true);

      // Update substep before API call
      sendSubstep('Calling AI to recommend deployment architectures (this may take 10-30 seconds)');

      // Build database context for architecture recommendations (new format)
      const databaseContext = databaseComparison ? {
        comparison: databaseComparison,
        userChoice: selectedDatabaseType,
        keyMetrics: databaseComparison.keyMetrics || {}
      } : (databaseRecommendation?.recommendation || databaseRecommendation || null);

      const architectures = await processor.getArchitectureRecommendations(
        answersRef.current.MISSION_STATEMENT,
        answersRef.current.INITIAL_SCOPE,
        databaseContext,
        deploymentStrategy // Pass deployment strategy for filtering
      );

      // Activate selector BEFORE clearing isExecuting (same race-condition fix as database choice)
      appendArchitectureOptions(architectures);
      setArchitectureOptions(architectures);
      setSelectedArchitectureIndex(0);
      setArchitectureSelectorActive(true);
      setMode('prompt');
      setQuestionnaireActive(false);

      // Clear executing state (selector already active, no gap)
      setExecutingMessage('');
      setExecutingSubstep('');
      setIsExecuting(false);

      // Save progress
      autoSaveProgress();
    } catch (error) {
      // Graceful degradation - skip architecture selection on error
      // Clear executing state
      setExecutingMessage('');
      setExecutingSubstep('');
      setIsExecuting(false);

      sendError(`Failed to generate architecture recommendations: ${error.message}`);
      sendOutput('Continuing with manual questionnaire...\n\n');

      // Wait for error messages to appear before switching to questionnaire
      setTimeout(() => {
        setQuestionnaireActive(true);
        setMode('prompt');
        if (currentQuestionIndex < questionnaireQuestions.length - 1) {
          setCurrentQuestionIndex(currentQuestionIndex + 1);
        }
      }, 150);
    }
  };

  /**
   * Run detailed database analysis with user inputs (DISABLED - removed Customize option)
   */
  // const runDetailedDatabaseAnalysis = async (userAnswers) => {
  //   setMode('executing');
  //   setIsExecuting(true);
  //   setExecutingMessage('🔍 Generating enhanced database comparison...');
  //   setExecutingSubstep('Analyzing your requirements');
  //
  //   try {
  //     const processor = new TemplateProcessor('sponsor-call', null, true);
  //
  //     setExecutingSubstep('Calling AI for detailed database analysis (this may take 15-20 seconds)');
  //
  //     const detailedRec = await processor.getDatabaseDetailedRecommendation(
  //       questionnaireAnswers.MISSION_STATEMENT,
  //       questionnaireAnswers.INITIAL_SCOPE,
  //       userAnswers
  //     );
  //
  //     // Update database comparison with detailed analysis (new format)
  //     setDatabaseComparison(detailedRec.comparison);
  //
  //     // Clear executing state
  //     setIsExecuting(false);
  //     setExecutingSubstep('');
  //
  //     // Show updated comparison
  //     outputBuffer.append( '\n📊 Enhanced Database Comparison:\n\n');
  //     outputBuffer.append( `SQL: ${detailedRec.comparison.sqlOption.specificVersion || detailedRec.comparison.sqlOption.database}\n`);
  //     outputBuffer.append( `  Cost: ~${detailedRec.comparison.sqlOption.estimatedCosts?.monthly || 'varies'}\n\n`);
  //     outputBuffer.append( `NoSQL: ${detailedRec.comparison.nosqlOption.specificVersion || detailedRec.comparison.nosqlOption.database}\n`);
  //     outputBuffer.append( `  Cost: ~${detailedRec.comparison.nosqlOption.estimatedCosts?.monthly || 'varies'}\n\n`);
  //
  //     if (detailedRec.recommendation) {
  //       outputBuffer.append( `Recommendation: ${detailedRec.recommendation}\n\n`);
  //     }
  //
  //     // Save progress
  //     autoSaveProgress();
  //
  //     // Return to choice selector with enhanced data
  //     setDatabaseChoiceActive(true);
  //     setDatabaseChoiceIndex(0);
  //     setMode('selector');
  //   } catch (error) {
  //     console.error('Detailed database analysis failed:', error.message);
  //
  //     // Clear executing state
  //     setIsExecuting(false);
  //     setExecutingSubstep('');
  //
  //     outputBuffer.append( `\n⚠️  Detailed analysis failed: ${error.message}\n`);
  //     outputBuffer.append( 'Using quick comparison instead...\n');
  //
  //     // Fall back to quick comparison and return to selector
  //     setDatabaseChoiceActive(true);
  //     setDatabaseChoiceIndex(0);
  //     setMode('selector');
  //   }
  // };

  /**
   * Proceed to question pre-filling after architecture selection
   */
  const proceedToQuestionPrefilling = async (architecture, cloudProvider = null) => {
    // Set executing state FIRST to show spinner immediately
    setQuestionnaireActive(false);
    setMode('executing');
    setIsExecuting(true);
    sendProgress('Generating intelligent recommendations...');
    sendSubstep('Preparing question pre-filling analysis');

    try {
      const processor = new TemplateProcessor('sponsor-call', null, true);

      // Update substep before API call
      sendSubstep('Calling AI to generate contextual answers (this may take 10-30 seconds)');

      // Build database context for prefillQuestions (supports both old and new format)
      const databaseContext = databaseComparison ? {
        comparison: databaseComparison,
        userChoice: selectedDatabaseType,
        keyMetrics: databaseComparison.keyMetrics || {}
      } : (databaseRecommendation?.recommendation || databaseRecommendation || null);

      const prefilled = await processor.prefillQuestions(
        answersRef.current.MISSION_STATEMENT,
        answersRef.current.INITIAL_SCOPE,
        architecture,
        cloudProvider,
        databaseContext,
        deploymentStrategy // Pass deployment strategy for context
      );

      // Merge pre-filled with existing answers (don't overwrite user answers)
      const latestAnswers = answersRef.current;
      const updatedAnswers = {
        ...latestAnswers,
        TARGET_USERS: latestAnswers.TARGET_USERS || prefilled.TARGET_USERS || '',
        DEPLOYMENT_TARGET: latestAnswers.DEPLOYMENT_TARGET || prefilled.DEPLOYMENT_TARGET || '',
        TECHNICAL_CONSIDERATIONS: latestAnswers.TECHNICAL_CONSIDERATIONS || prefilled.TECHNICAL_CONSIDERATIONS || '',
        SECURITY_AND_COMPLIANCE_REQUIREMENTS: latestAnswers.SECURITY_AND_COMPLIANCE_REQUIREMENTS || prefilled.SECURITY_AND_COMPLIANCE_REQUIREMENTS || ''
      };

      // Compute prefilled set before transition (synchronous)
      const prefilledSet = new Set();
      if (prefilled.TARGET_USERS && !latestAnswers.TARGET_USERS) prefilledSet.add('TARGET_USERS');
      if (prefilled.DEPLOYMENT_TARGET && !latestAnswers.DEPLOYMENT_TARGET) prefilledSet.add('DEPLOYMENT_TARGET');
      if (prefilled.TECHNICAL_CONSIDERATIONS && !latestAnswers.TECHNICAL_CONSIDERATIONS) prefilledSet.add('TECHNICAL_CONSIDERATIONS');
      if (prefilled.SECURITY_AND_COMPLIANCE_REQUIREMENTS && !latestAnswers.SECURITY_AND_COMPLIANCE_REQUIREMENTS) prefilledSet.add('SECURITY_AND_COMPLIANCE_REQUIREMENTS');

      // Defer the heavy answer state merge — non-urgent, won't block UI
      // Use direct (urgent) state update so preview renders with all answers immediately.
      // startTransition would defer the update and the preview could show stale Q1+Q2 only.
      setQuestionnaireAnswers(updatedAnswers);
      setAiPrefilledQuestions(prefilledSet);

      // Save progress
      autoSaveProgress();

      // Ensure questionnaire is hidden before clearing executing state
      setQuestionnaireActive(false);

      // Clear executing state
      setExecutingMessage('');
      setExecutingSubstep('');
      setIsExecuting(false);

      // Wait for output buffer to update before showing preview
      // This prevents visual glitches from React re-rendering before output updates
      setTimeout(() => {
        setShowPreview(true);
        setMode('prompt');
      }, 150);

    } catch (error) {
      // Graceful degradation
      // Clear executing state
      setExecutingMessage('');
      setExecutingSubstep('');
      setIsExecuting(false);

      sendError(`Failed to generate recommendations: ${error.message}`);
      sendOutput('Please answer the remaining questions manually.\n\n');

      // Wait for error messages to appear before switching to questionnaire
      setTimeout(() => {
        setQuestionnaireActive(true);
        setMode('prompt');
        if (currentQuestionIndex < questionnaireQuestions.length - 1) {
          setCurrentQuestionIndex(currentQuestionIndex + 1);
        }
      }, 150);
    }
  };

  const autoSaveProgress = (answersOverride = null) => {
    if (!questionnaireActive && !architectureSelectorActive && !cloudProviderSelectorActive && !databaseChoiceActive && !databaseQuestionsActive && !deploymentStrategySelectorActive) return;

    try {
      const initiator = new ProjectInitiator();

      // Determine current stage
      let stage = 'questionnaire';
      if (databaseChoiceActive) {
        stage = 'database-choice';
      } else if (databaseQuestionsActive) {
        stage = 'database-questions';
      } else if (architectureSelectorActive) {
        stage = 'architecture-selection';
      } else if (cloudProviderSelectorActive) {
        stage = 'cloud-provider-selection';
      } else if (deploymentStrategySelectorActive) {
        stage = 'deployment-strategy';
      }

      // Use override if provided (for React state timing issues)
      const answersToSave = answersOverride || questionnaireAnswers;

      const progress = {
        stage,
        totalQuestions: questionnaireQuestions.length,
        answeredQuestions: Object.keys(answersToSave).length,
        collectedValues: answersToSave,
        currentQuestionIndex,
        currentAnswer: currentAnswer.join('\n'),
        lastUpdate: new Date().toISOString(),
        // Deployment strategy state
        deploymentStrategy,
        deploymentStrategyIndex,
        // Database analysis state
        databaseRecommendation,
        databaseAnswers,
        databaseQuestionIndex,
        selectedDatabaseType,
        databaseComparison,
        recommendedChoice,
        // Architecture selection state
        architectureSelection: selectedArchitecture ? {
          options: architectureOptions,
          selected: selectedArchitecture
        } : null,
        cloudProvider: selectedCloudProvider,
        aiPrefilledQuestions: Array.from(aiPrefilledQuestions)
      };

      initiator.writeProgress(progress, initiator.sponsorCallProgressPath);
      setLastAutoSave(new Date());
    } catch (error) {
      // Silently fail auto-save
    }
  };

  const runStatus = async () => {
    const initiator = new ProjectInitiator();

    startCommand('status');

    try {
      initiator.status();
    } finally {
      endCommand();
    }
  };

  const runModels = async () => {
    const initiator = new ProjectInitiator();

    startCommand('models');

    let result;
    try {
      result = await initiator.models();
    } finally {
      endCommand();
    }

    // Check if models() returned configuration data
    if (result && result.shouldConfigure) {
      setModelConfigurator(result.configurator);
      setModelConfigActive(true);
      setModelConfigMode('prompt');
    }
  };

  const runTokens = async () => {
    const initiator = new ProjectInitiator();

    startCommand('tokens');

    try {
      if (!initiator.isAvcProject()) {
        sendError(getProjectNotInitializedMessage());
        sendOutput('');
        return;
      }

      await initiator.showTokenStats();
    } finally {
      endCommand();
    }
  };

  const runRemove = async () => {
    const initiator = new ProjectInitiator();
    fileLog('INFO', 'runRemove: checking for AVC project', { cwd: process.cwd() });

    // Check if project is initialized
    if (!initiator.isAvcProject()) {
      fileLog('WARNING', 'runRemove: no AVC project found, aborting');
      outputBuffer.append('No AVC project found in this directory.\nNothing to remove.\n');
      return;
    }

    // Get AVC contents to display
    const contents = initiator.getAvcContents();
    fileLog('INFO', 'runRemove: AVC project found, awaiting confirmation', { itemCount: contents.length, items: contents });
    setAvcContents(contents);

    // Activate remove confirmation mode
    setRemoveConfirmActive(true);
    setRemoveConfirmInput('');
  };

  const confirmRemove = async () => {
    // NOTE: confirmRemove runs from a useInput handler, OUTSIDE executeCommand lifecycle.
    // startCommand is called here to enable the messaging API for typed output.
    setRemoveConfirmActive(false);
    setMode('executing');
    setIsExecuting(true);
    setExecutingMessage('Deleting AVC project structure...');

    startCommand('remove');
    const initiator = new ProjectInitiator();

    try {
      const deletedItems = initiator.getAvcContents();

      // Delete .avc folder
      const fs = await import('fs');
      fs.rmSync(initiator.avcDir, { recursive: true, force: true });

      sendSuccess('Deleted .avc/ and all contents');

      /* we don't need to detail
        deletedItems.forEach(item => {
        sendOutput(`  • ${item}`);
      });
      */

      // Check for preserved files
      const pathMod = await import('path');
      const envPath = pathMod.join(initiator.projectRoot, '.env');
      const hasEnvFile = fs.existsSync(envPath);
      const hasSrcFolder = initiator.hasSrcFolder();
      const hasWorktreesFolder = initiator.hasWorktreesFolder();

      if (hasEnvFile) {
        sendWarning('Preserved .env — contains API keys, not deleted');
      }
      if (hasSrcFolder) {
        sendWarning('Preserved src/ — your code, not deleted');
      }
      if (hasWorktreesFolder) {
        sendWarning('Preserved worktrees/ — git worktrees, not deleted');
      }

      sendOutput('');
    } catch (error) {
      sendError(`Deletion failed: ${error.message}`);
      sendOutput('The .avc folder may be partially deleted — check manually.');
    } finally {
      endCommand();
    }

    setIsExecuting(false);
    setTimeout(() => {
      setMode('prompt');
      setInput('');
    }, 100);
  };

  const runBuildDocumentation = async () => {
    startCommand('documentation');
    try {
      const ts0 = Date.now();
      const builder = new DocumentationBuilder();
      const manager = getProcessManager();

      fileLog('INFO', 'runBuildDocumentation started', { cwd: process.cwd() });

      // Check if project is initialized
      const hasDocumentation = builder.hasDocumentation();
      fileLog('INFO', 'documentation check', { hasDocumentation });

      if (!hasDocumentation) {
        fileLog('WARNING', 'documentation not found, aborting');
        sendError('Documentation not found — run /init first to create documentation structure');
        return;
      }

      const port = builder.getPort();
      fileLog('INFO', 'documentation port determined', { port });

      // Check if documentation server is already running (managed process)
      const runningProcesses = manager.getRunningProcesses();
      const existingDocServer = runningProcesses.find(p => p.name === 'Documentation Server');
      fileLog('INFO', 'managed process check', {
        runningProcessCount: runningProcesses.length,
        existingDocServer: existingDocServer ? { id: existingDocServer.id, name: existingDocServer.name } : null
      });

      if (existingDocServer) {
        // We have a managed process - check if it's actually running
        const portInUse = await builder.isPortInUse(port);
        fileLog('INFO', 'managed process port check', { portInUse });

        if (portInUse) {
          // Managed process exists and port is in use - restart it
          fileLog('INFO', 'managed process running, restarting', { processId: existingDocServer.id });
          sendInfo('Documentation server already running — restarting');
          manager.stopProcess(existingDocServer.id);

          // Clean up stopped/finished processes
          manager.cleanupFinished();

          // Wait a bit for the port to be released
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // Managed process exists but port is not in use - it died, clean up
          fileLog('WARNING', 'managed process died (port not in use), cleaning up', { processId: existingDocServer.id });
          sendWarning('Previous documentation server stopped — starting new one');
          manager.stopProcess(existingDocServer.id);

          // Clean up stopped/finished processes
          manager.cleanupFinished();
        }
      } else {
        // No managed process - check if port is in use by external process
        const portInUse = await builder.isPortInUse(port);
        fileLog('INFO', 'no managed process, external port check', { portInUse });

        if (portInUse) {
          // Port is in use by external process - find and kill it
          const processInfo = await builder.findProcessUsingPort(port);
          fileLog('INFO', 'process found on port', { processInfo });

          if (processInfo) {
            // Found the process using the port - check if it's AVC documentation
            const isOurDocs = await builder.isDocumentationServer(port);
            fileLog('INFO', 'is-our-docs check', { isOurDocs, pid: processInfo.pid, command: processInfo.command });

            if (isOurDocs) {
              // It's confirmed to be AVC documentation server - safe to kill
              sendInfo(`AVC documentation server already running (external process — PID ${processInfo.pid})`);
              sendInfo('Killing external process and restarting...');

              // Try to kill the process
              const killed = await builder.killProcess(processInfo.pid);
              fileLog(killed ? 'INFO' : 'ERROR', 'kill external docs process', { pid: processInfo.pid, killed });

              if (!killed) {
                // Failed to kill (permission denied, etc.)
                fileLog('ERROR', 'failed to kill process, aborting', { pid: processInfo.pid });
                sendError(`Failed to kill process ${processInfo.pid} — permission denied or process protected`);
                sendOutput('Please manually stop the process or change the port.');
                sendOutput('To change the port, edit .avc/avc.json:');
                sendOutput('  { "settings": { "documentation": { "port": 5173 } } }');
                return;
              }

              sendSuccess('External process killed');

              // Remove from process manager if it was a managed process
              manager.removeProcessByPid(processInfo.pid);

              // Wait for port to be released
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              // It's NOT AVC documentation - ask user if they want to kill it anyway
              fileLog('WARNING', 'port in use by non-AVC process, prompting user for confirmation', { pid: processInfo.pid, command: processInfo.command, port });
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
            fileLog('ERROR', 'port in use but process unidentifiable', { port });
            sendError(`Port ${port} is in use but process could not be identified`);
            sendOutput('To change the port, edit .avc/avc.json:');
            sendOutput('  { "settings": { "documentation": { "port": 5173 } } }');
            return;
          }
        }
      }

      // Start dev server in background (builds on-demand, hot-reloads on .md changes)
      fileLog('INFO', 'starting documentation dev server', { port, docsDir: builder.docsDir });
      const processId = manager.startProcess({
        name: 'Documentation Server',
        command: 'npx',
        args: ['vitepress', 'dev', '--port', String(port)],
        cwd: builder.docsDir
      });

      fileLog('INFO', 'runBuildDocumentation complete', { processId, port, totalDuration: `${Date.now() - ts0}ms` });
      sendSuccess('Documentation server started');
      sendIndented(`${gray('URL')}      http://localhost:${port}`, 1);
      sendIndented(`${gray('PID')}      ${processId}`, 1);
      sendInfo('Stop with /processes — select Documentation Server — S');
      sendOutput('');
    } finally {
      endCommand();
    }
  };

  const runKanban = async () => {
    startCommand('kanban');
    try {
      const ts0 = Date.now();
      const kanbanManager = new KanbanServerManager();
      const manager = getProcessManager();

      // File-only logger for runKanban (uses same [DEBUG] prefix pattern)
      const kLog = (level, message, data = null) => {
        const ts = new Date().toISOString();
        if (data !== null) {
          console.log(`[DEBUG] [${level}] [${ts}] [kanban] ${message}`, JSON.stringify(data, null, 2));
        } else {
          console.log(`[DEBUG] [${level}] [${ts}] [kanban] ${message}`);
        }
      };

      kLog('INFO', 'runKanban started', { cwd: process.cwd() });

      const port = kanbanManager.getPort();
      kLog('INFO', 'kanban port determined', { port });

      // Check if kanban server is already running (managed process)
      const runningProcesses = manager.getRunningProcesses();
      const existingKanbanServer = runningProcesses.find(p => p.name === 'Kanban Board Server');
      kLog('INFO', 'managed process check', {
        runningProcessCount: runningProcesses.length,
        existingKanbanServer: existingKanbanServer ? { id: existingKanbanServer.id, name: existingKanbanServer.name } : null
      });

      if (existingKanbanServer) {
        // We have a managed process - check if it's actually running
        const portInUse = await kanbanManager.isPortInUse(port);
        kLog('INFO', 'managed process port check', { portInUse });

        if (portInUse) {
          // Managed process exists and port is in use - restart it
          kLog('INFO', 'managed process running, restarting', { processId: existingKanbanServer.id });
          sendInfo('Kanban server already running — restarting');
          manager.stopProcess(existingKanbanServer.id);

          // Clean up stopped/finished processes
          manager.cleanupFinished();

          // Wait a bit for the port to be released
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          // Managed process exists but port is not in use - it died, clean up
          kLog('WARNING', 'managed process died (port not in use), cleaning up', { processId: existingKanbanServer.id });
          sendWarning('Previous kanban server stopped — starting new one');
          manager.stopProcess(existingKanbanServer.id);

          // Clean up stopped/finished processes
          manager.cleanupFinished();
        }
      } else {
        // No managed process - check if port is in use by external process
        const portInUse = await kanbanManager.isPortInUse(port);
        kLog('INFO', 'no managed process, external port check', { portInUse });

        if (portInUse) {
          // Port is in use by external process - find and kill it
          const processInfo = await kanbanManager.findProcessUsingPort(port);
          kLog('INFO', 'process found on port', { processInfo });

          if (processInfo) {
            // Found the process using the port - check if it's AVC kanban server
            const isOurKanban = await kanbanManager.isKanbanServer(port);
            kLog('INFO', 'is-our-kanban check', { isOurKanban, pid: processInfo.pid, command: processInfo.command });

            if (isOurKanban) {
              // It's confirmed to be AVC kanban server - safe to kill
              sendInfo(`AVC kanban server already running (external process — PID ${processInfo.pid})`);
              sendInfo('Killing external process and restarting...');

              // Try to kill the process
              const killed = await kanbanManager.killProcess(processInfo.pid);
              kLog(killed ? 'INFO' : 'ERROR', 'kill external kanban process', { pid: processInfo.pid, killed });

              if (!killed) {
                // Failed to kill (permission denied, etc.)
                kLog('ERROR', 'failed to kill process, aborting', { pid: processInfo.pid });
                sendError(`Failed to kill process ${processInfo.pid} — permission denied or process protected`);
                sendOutput('Please manually stop the process or change the port.');
                sendOutput('To change the port, edit .avc/avc.json:');
                sendOutput('  { "settings": { "kanban": { "port": 4174 } } }');
                return;
              }

              sendSuccess('External process killed');

              // Remove from process manager if it was a managed process
              manager.removeProcessByPid(processInfo.pid);

              // Wait for port to be released
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
              // It's NOT AVC kanban - prompt user to kill or choose new port
              kLog('WARNING', 'port in use by non-AVC process, prompting user', { pid: processInfo.pid, command: processInfo.command, port });

              // Find next available port for suggestion
              let suggestedPort = port + 1;
              while (suggestedPort < 65535) {
                const inUse = await kanbanManager.isPortInUse(suggestedPort);
                if (!inUse) break;
                suggestedPort++;
              }

              setKanbanPortConflictInfo({ pid: processInfo.pid, command: processInfo.command, port, suggestedPort });
              setKanbanPortConflictActive(true);
              setMode('kanban-port-conflict');
              return;
            }
          } else {
            // Port is in use but couldn't find the process - prompt for new port only
            kLog('ERROR', 'port in use but process unidentifiable', { port });

            let suggestedPort = port + 1;
            while (suggestedPort < 65535) {
              const inUse = await kanbanManager.isPortInUse(suggestedPort);
              if (!inUse) break;
              suggestedPort++;
            }

            setKanbanPortConflictInfo({ pid: null, command: null, port, suggestedPort });
            setKanbanPortConflictActive(true);
            setMode('kanban-port-conflict');
            return;
          }
        }
      }

      // Start kanban server in background
      const kanbanServerPath = path.join(__dirname, '..', 'kanban', 'server', 'start.js');
      kLog('INFO', 'starting kanban server process', { kanbanServerPath, port, cwd: process.cwd() });
      sendProgress('Starting AVC Kanban Board server...');

      const processId = manager.startProcess({
        name: 'Kanban Board Server',
        command: 'node',
        args: [kanbanServerPath, process.cwd(), String(port)],
        cwd: process.cwd()
      });

      kLog('INFO', 'kanban server process started', { processId, port, duration: `${Date.now() - ts0}ms` });
      sendSuccess('Kanban board started');
      sendIndented(`${gray('URL'.padEnd(6))} http://localhost:${port}`, 1);
      sendIndented(`${gray('PID'.padEnd(6))} ${processId}`, 1);
      sendInfo('Stop with /processes or /stop-kanban');
      sendOutput('');
    } finally {
      endCommand();
    }
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
        outputBuffer.append(`${gray('Stopping background processes...')}\n`);
        const stopped = ctrlRManager.stopAll();
        outputBuffer.append(`${green(`Stopped ${stopped} process(es)`)}\n\n`);
      }

      outputBuffer.append(`${boldCyan('Restarting AVC...')}\n`);
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
  }, { isActive: mode === 'prompt' && !questionnaireActive && !showPreview && !modelConfigActive && !removeConfirmActive && !deploymentStrategySelectorActive && !architectureSelectorActive && !cloudProviderSelectorActive && !databaseChoiceActive && isStableRender });

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

        // Mission Statement is mandatory - cannot be skipped
        if (currentQuestionIndex === 0) {
          setQuestionnaireInlineWarning('Mission Statement is mandatory - please provide an answer');
          return;
        }

        // Priority cascade: defaults > AI

        // 1. Check for default in settings (highest priority)
        const defaultAnswer = getDefaultAnswer(questionKey);
        if (defaultAnswer) {
          sendInfo('Using default from settings...');
          saveQuestionnaireAnswer(questionKey, defaultAnswer);
          markAnswerAsDefaultSuggested(questionKey);
          moveToNextQuestion(questionKey, defaultAnswer);
          return;
        }

        // 2. Fall back to AI suggestion
        sendInfo('Skipping - will use AI suggestion...');
        saveQuestionnaireAnswer(questionKey, null);
        moveToNextQuestion(questionKey, null);
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
          moveToNextQuestion(currentQuestion.key, finalAnswer);
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

        // Build merged answers (React state hasn't updated yet) for static preview
        const mergedAnswers = { ...questionnaireAnswers, [questionKey]: finalAnswer || null };
        appendAnswersPreview(mergedAnswers, questionnaireQuestions, defaultSuggestedAnswers, aiPrefilledQuestions);

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

  // Architecture selector input handler
  useInput(async (inputChar, key) => {
    if (!architectureSelectorActive) return;

    // Arrow up
    if (key.upArrow) {
      setSelectedArchitectureIndex(prev => Math.max(0, prev - 1));
      return;
    }

    // Arrow down
    if (key.downArrow) {
      setSelectedArchitectureIndex(prev => Math.min(architectureOptions.length - 1, prev + 1));
      return;
    }

    // Enter - select architecture
    if (key.return) {
      const selected = architectureOptions[selectedArchitectureIndex];
      setSelectedArchitecture(selected);
      setArchitectureSelectorActive(false);
      sendSuccess('Architecture: ' + selected.name);

      // Check deployment strategy first
      if (deploymentStrategy === 'local-mvp') {
        // Local MVP strategy: Set executing state first
        setQuestionnaireActive(false);
        setMode('executing');
        setIsExecuting(true);

        // Delay to let React/Ink process state changes
        await new Promise(resolve => setTimeout(resolve, 250));

        await proceedToQuestionPrefilling(selected, null); // No cloud provider
      } else if (selected.requiresCloudProvider) {
        // Cloud deployment with cloud architecture: Show provider selector
        appendCloudProviderOptions(selected.name);
        setCloudProviderSelectorActive(true);
        setCloudProviderIndex(0);
      } else {
        // Cloud deployment with PaaS architecture: Set executing state first
        setQuestionnaireActive(false);
        setMode('executing');
        setIsExecuting(true);

        // Delay to let React/Ink process state changes
        await new Promise(resolve => setTimeout(resolve, 250));

        await proceedToQuestionPrefilling(selected, null);
      }
      return;
    }

    // Numeric shortcuts: 1-N jump to item
    const n = parseInt(inputChar, 10);
    if (!isNaN(n) && n >= 1 && n <= architectureOptions.length) {
      setSelectedArchitectureIndex(n - 1);
      return;
    }

    // Escape - skip architecture selection
    if (key.escape) {
      setArchitectureSelectorActive(false);
      setArchitectureOptions([]);
      setSelectedArchitecture(null);

      // Continue with manual questionnaire
      setQuestionnaireActive(true);
      setMode('prompt');
      if (currentQuestionIndex < questionnaireQuestions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      }
      return;
    }
  }, { isActive: architectureSelectorActive });

  // Deployment strategy selector input handler
  useInput(async (inputChar, key) => {
    if (!deploymentStrategySelectorActive || isProcessingDeploymentStrategy) return;

    // Arrow up
    if (key.upArrow) {
      setDeploymentStrategyIndex(prev => Math.max(0, prev - 1));
      return;
    }

    // Arrow down
    if (key.downArrow) {
      setDeploymentStrategyIndex(prev => Math.min(1, prev + 1));
      return;
    }

    // Enter - select strategy
    if (key.return) {
      setIsProcessingDeploymentStrategy(true);

      try {
        const strategies = ['local-mvp', 'cloud'];
        const selected = strategies[deploymentStrategyIndex];

        // Disable selector and set executing state first
        setDeploymentStrategy(selected);
        setDeploymentStrategySelectorActive(false);
        setQuestionnaireActive(false);
        setMode('executing');
        setIsExecuting(true);

        const strategyNames = { 'local-mvp': 'Local MVP First', 'cloud': 'Cloud Deployment' };
        sendSuccess('Deployment strategy: ' + strategyNames[selected]);

        // Delay to let React/Ink process state changes
        await new Promise(resolve => setTimeout(resolve, 250));

        // Proceed to database analysis and architecture recommendation
        await triggerArchitectureSelection();
      } finally {
        setIsProcessingDeploymentStrategy(false);
      }
      return;
    }

    // Numeric shortcuts: 1=Local MVP, 2=Cloud
    const n = parseInt(inputChar, 10);
    if (!isNaN(n) && n >= 1 && n <= 2) {
      setDeploymentStrategyIndex(n - 1);
      return;
    }

    // Escape - skip strategy selection (show all options)
    if (key.escape) {
      setIsProcessingDeploymentStrategy(true);

      try {
        // Disable selector and set executing state first
        setDeploymentStrategySelectorActive(false);
        setDeploymentStrategy(null);
        setQuestionnaireActive(false);
        setMode('executing');
        setIsExecuting(true);

        // Delay to let React/Ink process state changes
        await new Promise(resolve => setTimeout(resolve, 250));

        // Proceed to database analysis without strategy filter
        await triggerArchitectureSelection();
      } finally {
        setIsProcessingDeploymentStrategy(false);
      }
      return;
    }
  }, { isActive: deploymentStrategySelectorActive });

  // Cloud provider selector input handler
  useInput(async (inputChar, key) => {
    if (!cloudProviderSelectorActive) return;

    const providers = ['AWS', 'Azure', 'GCP'];

    // Arrow up
    if (key.upArrow) {
      setCloudProviderIndex(prev => Math.max(0, prev - 1));
      return;
    }

    // Arrow down
    if (key.downArrow) {
      setCloudProviderIndex(prev => Math.min(2, prev + 1));
      return;
    }

    // Numeric shortcuts: 1=AWS, 2=Azure, 3=GCP
    const n = parseInt(inputChar, 10);
    if (!isNaN(n) && n >= 1 && n <= providers.length) {
      setCloudProviderIndex(n - 1);
      return;
    }

    // Enter - select provider
    if (key.return) {
      const provider = providers[cloudProviderIndex];
      setSelectedCloudProvider(provider);

      // Set state changes FIRST
      setCloudProviderSelectorActive(false);
      setQuestionnaireActive(false);
      setMode('executing');
      setIsExecuting(true);

      // Delay for React/Ink to process state changes
      await new Promise(resolve => setTimeout(resolve, 250));

      // Proceed to question pre-filling
      await proceedToQuestionPrefilling(selectedArchitecture, provider);
      return;
    }

    // Escape - skip provider selection
    if (key.escape) {
      setSelectedCloudProvider(null);

      // Set state changes FIRST
      setCloudProviderSelectorActive(false);
      setQuestionnaireActive(false);
      setMode('executing');
      setIsExecuting(true);

      // Delay for React/Ink to process state changes
      await new Promise(resolve => setTimeout(resolve, 250));

      // Proceed with architecture only (no specific cloud provider)
      await proceedToQuestionPrefilling(selectedArchitecture, null);
      return;
    }
  }, { isActive: cloudProviderSelectorActive });

  // Database choice selector input handler (4 options: Let AI choose, SQL, NoSQL, Skip)
  useInput(async (inputChar, key) => {
    if (!databaseChoiceActive) return;

    // Arrow up
    if (key.upArrow) {
      setDatabaseChoiceIndex(prev => Math.max(0, prev - 1));
      return;
    }

    // Arrow down
    if (key.downArrow) {
      setDatabaseChoiceIndex(prev => Math.min(3, prev + 1)); // 4 options: 0-3
      return;
    }

    // Escape - go back to deployment strategy selector
    if (key.escape) {
      setDatabaseChoiceActive(false);
      setDatabaseComparison(null);
      setRecommendedChoice(null);
      appendDeploymentStrategyOptions();
      setDeploymentStrategySelectorActive(true);
      setDeploymentStrategyIndex(0);
      setMode('prompt');
      return;
    }

    // Numeric shortcuts: 1=AI choose, 2=SQL, 3=NoSQL, 4=Skip
    const n = parseInt(inputChar, 10);
    if (!isNaN(n) && n >= 1 && n <= 4) {
      setDatabaseChoiceIndex(n - 1);
      return;
    }

    // Enter - make choice
    if (key.return) {
      const choices = ['ai-choose', 'sql', 'nosql', 'skip'];
      const choice = choices[databaseChoiceIndex];

      // Append confirmation to static buffer before disabling selector
      const dbChoiceLabels = {
        'ai-choose': 'Let AI choose (' + (recommendedChoice === 'nosql' ? 'NoSQL' : 'SQL') + ')',
        'sql': 'SQL',
        'nosql': 'NoSQL',
        'skip': 'Skip database analysis'
      };
      sendSuccess('Database: ' + dbChoiceLabels[choice]);

      // Disable selector first
      setDatabaseChoiceActive(false);
      setQuestionnaireActive(false);
      setMode('executing');
      setIsExecuting(true);

      // Small delay to let React/Ink process state changes
      await new Promise(resolve => setTimeout(resolve, 250));

      if (choice === 'ai-choose') {
        // Let AI choose based on recommendation
        const aiChoice = recommendedChoice || 'sql'; // Default to SQL if no recommendation
        setSelectedDatabaseType(aiChoice);
        await proceedToArchitectureRecommendation();
      } else if (choice === 'sql') {
        // User manually chose SQL option
        setSelectedDatabaseType('sql');
        await proceedToArchitectureRecommendation();
      } else if (choice === 'nosql') {
        // User manually chose NoSQL option
        setSelectedDatabaseType('nosql');
        await proceedToArchitectureRecommendation();
      } else if (choice === 'skip') {
        // Clear database comparison, proceed without
        setDatabaseComparison(null);
        setRecommendedChoice(null);
        setSelectedDatabaseType(null);
        await proceedToArchitectureRecommendation();
      }
      return;
    }
  }, { isActive: databaseChoiceActive });

  // Database questions input handler (DISABLED - removed Customize option in favor of "Let AI choose")
  // useInput(async (inputChar, key) => {
  //   if (!databaseQuestionsActive) return;
  //
  //   if (key.escape) {
  //     // Cancel customization, revert to quick recommendation
  //     setDatabaseQuestionsActive(false);
  //     setDatabaseChoiceActive(true);
  //     setDatabaseQuestionInput('');
  //     setMode('prompt');
  //     outputBuffer.append( '\n⊘ Cancelled customization\n');
  //     return;
  //   }
  //
  //   if (key.return) {
  //     const questions = ['readWriteRatio', 'dailyRequests', 'costSensitivity', 'dataRelationships'];
  //     const currentKey = questions[databaseQuestionIndex];
  //
  //     // Save answer
  //     const newAnswers = {
  //       ...databaseAnswers,
  //       [currentKey]: databaseQuestionInput
  //     };
  //     setDatabaseAnswers(newAnswers);
  //     setDatabaseQuestionInput('');
  //
  //     // Move to next question or finish
  //     if (databaseQuestionIndex < 3) {
  //       setDatabaseQuestionIndex(prev => prev + 1);
  //     } else {
  //       // All questions answered, call detailed analysis
  //       setDatabaseQuestionsActive(false);
  //       await runDetailedDatabaseAnalysis(newAnswers);
  //     }
  //     return;
  //   }
  //
  //   if (key.backspace || key.delete) {
  //     setDatabaseQuestionInput(prev => prev.slice(0, -1));
  //   } else if (inputChar && !key.ctrl && !key.meta) {
  //     setDatabaseQuestionInput(prev => prev + inputChar);
  //   }
  // }, { isActive: databaseQuestionsActive });

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
        sendError(`Failed to save progress: ${error.message}`);
        return;
      }

      // Stop active logger before exiting
      if (activeLogger) {
        activeLogger.stop();
        TemplateProcessor.setDebugLogFile(null);
        CommandLogger.cleanupOldLogs();
        setActiveLogger(null);
      }

      // Cancel execution context
      cancelCommand();

      setCancelConfirmActive(false);
      setMode('prompt');
      setInput('');
      sendSuccess('Progress saved. Run /sponsor-call again to resume.');
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
        TemplateProcessor.setDebugLogFile(null);
        CommandLogger.cleanupOldLogs();
        setActiveLogger(null);
      }

      // Cancel execution context
      cancelCommand();

      // Reset all state
      setCancelConfirmActive(false);
      setCurrentQuestionIndex(0);
      setQuestionnaireAnswers({});
      setCurrentAnswer([]);
      setMode('prompt');
      setInput('');
      sendError('Questionnaire cancelled. All progress deleted.');
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
        TemplateProcessor.setDebugLogFile(null);
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

      let message = '\nOperation cancelled.\n';
      if (filesDeleted.length > 0) {
        message += '\nDeleted files:\n';
        filesDeleted.forEach(f => {
          message += `  • ${f}\n`;
        });
      }
      message += `\nTokens consumed: ${executionState.tokensUsed.input.toLocaleString()} input, ${executionState.tokensUsed.output.toLocaleString()} output (${executionState.tokensUsed.total.toLocaleString()} total)\n`;

      outputBuffer.append(message);
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
        outputBuffer.append('Operation cancelled.\n\nNo files were deleted.\n');
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
      outputBuffer.append('Operation cancelled.\n\nNo files were deleted.\n');
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
          outputBuffer.append(
            `Failed to kill process ${processToKill.pid}\n\n` +
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

        outputBuffer.append(`Process ${processToKill.pid} killed successfully\n\n`);

        // Remove from process manager if it was managed
        const manager = getProcessManager();
        manager.removeProcessByPid(processToKill.pid);

        // Wait for port to be released
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Now proceed with building and starting documentation
        outputBuffer.append('Building documentation...\n');
        setExecutingMessage('Building documentation...');

        try {
          await builder.build();
          outputBuffer.append('Documentation built successfully\n\n');

          setExecutingMessage('Starting documentation server...');

          const port = builder.getPort();
          const manager = getProcessManager();

          const processId = manager.startProcess({
            name: 'Documentation Server',
            command: 'npx',
            args: ['vitepress', 'preview', '--port', String(port)],
            cwd: builder.docsDir
          });

          outputBuffer.append(
            'Starting documentation server in background...\n' +
            `   URL: http://localhost:${port}\n` +
            `   View process output: /processes\n\n`
          );
        } catch (error) {
          outputBuffer.append(`Error: ${error.message}\n\n`);
        } finally {
          setIsExecuting(false);
          setMode('prompt');
        }

      } else if (input === 'no' || input === 'n' || input === '') {
        // User cancelled
        setKillConfirmActive(false);
        setKillConfirmInput('');
        setMode('prompt');
        outputBuffer.append(
          'Operation cancelled.\n\n' +
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
        outputBuffer.append('Invalid response. Operation cancelled.\n\n');
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
      outputBuffer.append('Operation cancelled.\n\n');
      return;
    }

    // Regular character input
    if (inputChar && !key.ctrl && !key.meta) {
      setKillConfirmInput(killConfirmInput + inputChar);
    }
  }, { isActive: killConfirmActive });

  // Kanban port conflict input handler
  useInput(async (inputChar, key) => {
    if (!kanbanPortConflictActive) return;

    if (key.return) {
      const input = kanbanPortConflictInput.trim().toLowerCase();

      const resetConflict = () => {
        setKanbanPortConflictActive(false);
        setKanbanPortConflictInput('');
      };

      const startKanban = async (targetPort) => {
        setMode('executing');
        setIsExecuting(true);
        setExecutingMessage('Starting AVC Kanban Board server...');

        const manager = getProcessManager();
        const kanbanServerPath = path.join(__dirname, '..', 'kanban', 'server', 'start.js');

        try {
          const processId = manager.startProcess({
            name: 'Kanban Board Server',
            command: 'node',
            args: [kanbanServerPath, process.cwd(), String(targetPort)],
            cwd: process.cwd()
          });

          outputBuffer.append(
            `Kanban board started\n` +
            `   URL: http://localhost:${targetPort}\n` +
            `   PID: ${processId}\n` +
            `   Stop with /processes or /stop-kanban\n\n`
          );
        } catch (err) {
          outputBuffer.append(`Failed to start kanban server: ${err.message}\n\n`);
        } finally {
          setIsExecuting(false);
          setMode('prompt');
        }
      };

      if (input === 'kill' && kanbanPortConflictInfo && kanbanPortConflictInfo.pid != null) {
        resetConflict();
        setMode('executing');
        setIsExecuting(true);
        setExecutingMessage('Killing process...');

        const mgr = new KanbanServerManager();
        const killed = await mgr.killProcess(kanbanPortConflictInfo.pid);

        if (!killed) {
          setIsExecuting(false);
          setMode('prompt');
          outputBuffer.append(
            `Failed to kill process ${kanbanPortConflictInfo.pid}.\n` +
            `   Please stop it manually or choose a different port.\n\n`
          );
          return;
        }

        outputBuffer.append(`Process ${kanbanPortConflictInfo.pid} killed.\n`);
        getProcessManager().removeProcessByPid(kanbanPortConflictInfo.pid);
        await new Promise(resolve => setTimeout(resolve, 1000));
        await startKanban(kanbanPortConflictInfo.port);

      } else if (input.startsWith('port ')) {
        const newPortStr = input.split(' ')[1];
        const newPort = parseInt(newPortStr, 10);

        if (!newPort || newPort < 1024 || newPort > 65535) {
          setKanbanPortConflictInput('');
          // Don't cancel — keep prompt open so user can retry
          return;
        }

        resetConflict();

        // Update avc.json with new port
        try {
          const avcJsonPath = path.join(process.cwd(), '.avc', 'avc.json');
          let config = {};
          try {
            config = JSON.parse(readFileSync(avcJsonPath, 'utf8'));
          } catch (_) {}
          if (!config.settings) config.settings = {};
          if (!config.settings.kanban) config.settings.kanban = {};
          config.settings.kanban.port = newPort;
          writeFileSync(avcJsonPath, JSON.stringify(config, null, 2), 'utf8');
          outputBuffer.append(`Port updated to ${newPort} in .avc/avc.json\n`);
        } catch (err) {
          outputBuffer.append(`Warning: could not update avc.json: ${err.message}\n`);
        }

        await startKanban(newPort);

      } else if (input === 'no' || input === 'n' || input === '') {
        resetConflict();
        setMode('prompt');
        outputBuffer.append('Operation cancelled.\n\n');
      } else {
        // Invalid input — keep prompt open, just clear input
        setKanbanPortConflictInput('');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setKanbanPortConflictInput(kanbanPortConflictInput.slice(0, -1));
      return;
    }

    if (key.escape) {
      setKanbanPortConflictActive(false);
      setKanbanPortConflictInput('');
      setMode('prompt');
      outputBuffer.append('Operation cancelled.\n\n');
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      setKanbanPortConflictInput(kanbanPortConflictInput + inputChar);
    }
  }, { isActive: kanbanPortConflictActive });

  // Model Configuration Prompt Handler
  useInput((input, key) => {
    if (!modelConfigActive || modelConfigMode !== 'prompt') return;

    // Handle Escape (cancel)
    if (key.escape) {
      outputBuffer.append('You can configure models later by editing .avc/avc.json\n');
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
      } else if (char === 'n') {
        outputBuffer.append('You can configure models later by editing .avc/avc.json\n');
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
      const ceremony = ceremonies[ceremonySelectIndex];
      setSelectedCeremony(ceremony);

      // Load configuration overview
      try {
        const overview = modelConfigurator.getConfigurationOverview(ceremony.name);
        appendConfigurationOverview(overview);
        setConfigOverview(overview);
        setModelConfigMode('overview');
        setOverviewSelectIndex(0);
      } catch (error) {
        // Fallback to old stage mode if overview fails
        setModelConfigMode('stage');
        setStageSelectIndex(0);
      }
      return;
    }

    if (key.escape) {
      // Save configuration and exit
      if (configurationChanges.length > 0) {
        modelConfigurator.saveConfig();
        outputBuffer.append('Configuration saved successfully!\n');
      }
      setModelConfigActive(false);
      setInput(''); // Clear input buffer
      setMode('prompt');
      return;
    }
  }, { isActive: modelConfigActive && modelConfigMode === 'ceremony' });

  // Model Configuration Overview Navigation Handler
  useInput((input, key) => {
    if (!modelConfigActive || modelConfigMode !== 'overview') return;

    if (!configOverview) return;

    // Build flat list of items (same as in component)
    const items = [];
    items.push({ ...configOverview.main, type: 'main' });
    configOverview.stages.forEach(stage => {
      items.push({ ...stage, type: 'stage' });
      if (stage.validationTypes) {
        stage.validationTypes.forEach(vtype => {
          items.push({ ...vtype, type: 'validation-type', parentStage: stage.id });
        });
      }
    });

    if (key.upArrow) {
      setOverviewSelectIndex(Math.max(0, overviewSelectIndex - 1));
      return;
    }

    if (key.downArrow) {
      setOverviewSelectIndex(Math.min(items.length - 1, overviewSelectIndex + 1));
      return;
    }

    if (key.return) {
      // Change model for selected item
      const selectedItem = items[overviewSelectIndex];

      // Set up for model selection
      setSelectedStage({
        id: selectedItem.id || 'main',
        name: selectedItem.label,
        provider: selectedItem.provider,
        model: selectedItem.model
      });

      if (selectedItem.type === 'validation-type') {
        setSelectedValidationType({ id: selectedItem.id, name: selectedItem.label });
      } else {
        setSelectedValidationType(null);
      }

      setModelConfigMode('model');
      setModelSelectIndex(0);
      return;
    }

    if (key.escape) {
      // Go back to ceremony selection
      setModelConfigMode('ceremony');
      setConfigOverview(null);
      return;
    }
  }, { isActive: modelConfigActive && modelConfigMode === 'overview' });

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
      const selectedStageObj = stages[stageSelectIndex];
      setSelectedStage(selectedStageObj);

      // Check if this stage has validation types (sprint-planning validation stage)
      if (selectedStageObj.hasValidationTypes) {
        setModelConfigMode('validation-type');
        setValidationTypeSelectIndex(0);
      } else {
        setModelConfigMode('model');
        setModelSelectIndex(0);
      }
      return;
    }

    if (key.escape) {
      setModelConfigMode('ceremony');
      setCeremonySelectIndex(0);
      return;
    }
  }, { isActive: modelConfigActive && modelConfigMode === 'stage' });

  // Model Configuration Validation Type Selection Handler (for sprint-planning validation stage)
  useInput((input, key) => {
    if (!modelConfigActive || modelConfigMode !== 'validation-type') return;

    if (key.upArrow) {
      const validationTypes = modelConfigurator.getValidationTypes();
      setValidationTypeSelectIndex(Math.max(0, validationTypeSelectIndex - 1));
      return;
    }

    if (key.downArrow) {
      const validationTypes = modelConfigurator.getValidationTypes();
      setValidationTypeSelectIndex(Math.min(validationTypes.length - 1, validationTypeSelectIndex + 1));
      return;
    }

    if (key.return) {
      const validationTypes = modelConfigurator.getValidationTypes();
      setSelectedValidationType(validationTypes[validationTypeSelectIndex]);
      setModelConfigMode('model');
      setModelSelectIndex(0);
      return;
    }

    if (key.escape) {
      setModelConfigMode('stage');
      setStageSelectIndex(0);
      return;
    }
  }, { isActive: modelConfigActive && modelConfigMode === 'validation-type' });

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

      // Update configuration (with validation type if applicable)
      const validationType = selectedValidationType ? selectedValidationType.id : null;
      modelConfigurator.updateStage(selectedCeremony.name, selectedStage.id, selectedModel.id, validationType);

      // Track change
      const stageName = selectedValidationType
        ? `${selectedStage.name} (${selectedValidationType.name})`
        : selectedStage.name;

      setConfigurationChanges(prev => [...prev, {
        ceremony: selectedCeremony.name,
        stage: stageName,
        oldModel: selectedStage.model,
        newModel: selectedModel.id
      }]);

      outputBuffer.append(`Updated ${stageName}: ${selectedStage.model} → ${selectedModel.id}\n`);

      // Clear validation type and go back to appropriate selection
      setSelectedValidationType(null);

      // If we have an overview, refresh it and go back to overview mode
      if (configOverview) {
        try {
          const updatedOverview = modelConfigurator.getConfigurationOverview(selectedCeremony.name);
          appendConfigurationOverview(updatedOverview);
          setConfigOverview(updatedOverview);
          setModelConfigMode('overview');
        } catch (error) {
          // Fallback to stage mode
          setModelConfigMode('stage');
          setStageSelectIndex(0);
        }
      } else if (selectedStage.hasValidationTypes) {
        setModelConfigMode('validation-type');
        setValidationTypeSelectIndex(0);
      } else {
        setModelConfigMode('stage');
        setStageSelectIndex(0);
      }
      return;
    }

    if (key.escape) {
      if (selectedValidationType) {
        setModelConfigMode('validation-type');
        setSelectedValidationType(null);
      } else {
        setModelConfigMode('stage');
      }
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
    outputBuffer.append(`Process stopped\n`);
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
      return React.createElement(KillProcessConfirmation, {
        processInfo: processToKill,
        confirmInput: killConfirmInput
      });
    }

    // Show kanban port conflict prompt if active
    if (kanbanPortConflictActive) {
      return React.createElement(KanbanPortConflictPrompt, {
        conflictInfo: kanbanPortConflictInfo,
        confirmInput: kanbanPortConflictInput
      });
    }

    // Show remove confirmation if active
    if (removeConfirmActive) {
      return React.createElement(RemoveConfirmation, {
        contents: avcContents,
        confirmInput: removeConfirmInput
      });
    }

    // Show cancel questionnaire confirmation if active
    if (cancelConfirmActive) {
      return React.createElement(CancelQuestionnaireConfirmation);
    }

    // Show cancel execution confirmation if active
    if (cancelExecutionActive) {
      return React.createElement(CancelExecutionConfirmation, {
        executionState: executionState
      });
    }

    // Show database comparison + choice selector together (both React-owned, nothing in static buffer)
    if (databaseChoiceActive && databaseComparison) {
      return React.createElement(Box, { flexDirection: 'column' },
        React.createElement(DatabaseRecommendationDisplay, {
          comparison: databaseComparison,
          keyMetrics: databaseComparison.keyMetrics
        }),
        React.createElement(DatabaseChoiceSelector, {
          comparison: databaseComparison,
          selectedIndex: databaseChoiceIndex,
          recommendedChoice: recommendedChoice
        })
      );
    }

    // Show database questions if active (DISABLED - removed Customize option)
    // if (databaseQuestionsActive) {
    //   return React.createElement(Box, { flexDirection: 'column', marginY: 1 },
    //     React.createElement(Text, null, output),
    //     React.createElement(DatabaseQuestionSelector, {
    //       questionIndex: databaseQuestionIndex,
    //       answers: databaseAnswers,
    //       currentInput: databaseQuestionInput
    //     })
    //   );
    // }

    // Show architecture selector if active
    if (architectureSelectorActive) {
      return React.createElement(ArchitectureSelector, {
        architectures: architectureOptions,
        selectedIndex: selectedArchitectureIndex
      });
    }

    // Show deployment strategy selector if active
    if (deploymentStrategySelectorActive) {
      return React.createElement(DeploymentStrategySelector, {
        selectedIndex: deploymentStrategyIndex
      });
    }

    // Show cloud provider selector if active
    if (cloudProviderSelectorActive) {
      return React.createElement(CloudProviderSelector, {
        selectedIndex: cloudProviderIndex
      });
    }

    // Show minimal action prompt — answers already written to static buffer by appendAnswersPreview()
    if (showPreview) {
      return React.createElement(AnswersPreviewActions);
    }

    // Show questionnaire if active (guard: never show questionnaire while executing to prevent Q1 flash)
    if (questionnaireActive && !isExecuting) {
      const currentQuestion = questionnaireQuestions[currentQuestionIndex];

      return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
        React.createElement(QuestionDisplay, {
          question: currentQuestion,
          index: currentQuestionIndex,
          total: questionnaireQuestions.length,
          editMode: editingQuestionIndex !== -1
        }),
        questionnaireInlineWarning && React.createElement(Text, { color: 'yellow' }, questionnaireInlineWarning),
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

    // Show spinner while executing
    if (isExecuting) {
      return React.createElement(Box, { flexDirection: 'column', marginY: 1, flexShrink: 0 },
        React.createElement(LoadingSpinner, {
          message: executingMessage,
          substep: executingSubstep
        })
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

    if (modelConfigMode === 'overview' && configOverview) {
      return React.createElement(ConfigurationOverviewNav, {
        overview: configOverview,
        selectedIndex: overviewSelectIndex
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

    if (modelConfigMode === 'validation-type' && selectedCeremony && selectedStage) {
      return React.createElement(ValidationTypeSelector, {
        ceremonyName: selectedCeremony.name,
        stageName: selectedStage.name,
        validationTypes: modelConfigurator.getValidationTypes(),
        selectedIndex: validationTypeSelectIndex
      });
    }

    if (modelConfigMode === 'model' && selectedStage) {
      const stageName = selectedValidationType
        ? `${selectedStage.name} > ${selectedValidationType.name}`
        : selectedStage.name;

      return React.createElement(ModelSelector, {
        stageName: stageName,
        currentModel: selectedStage.model,
        models: modelConfigurator.getAvailableModels(),
        selectedIndex: modelSelectIndex
      });
    }

    return null;
  };

  const renderPrompt = () => {
    if (mode !== 'prompt' || questionnaireActive || showPreview || removeConfirmActive || killConfirmActive || kanbanPortConflictActive || processViewerActive || cancelConfirmActive || isExecuting || modelConfigActive || architectureSelectorActive || cloudProviderSelectorActive || databaseChoiceActive || databaseQuestionsActive || deploymentStrategySelectorActive) return null;

    // Show loading indicator while app is initializing
    if (!isStableRender) {
      return React.createElement(Box, { flexDirection: 'row', gap: 1, flexShrink: 0 },
        React.createElement(Text, { color: 'cyan' },
          React.createElement(Spinner, { type: 'dots' })
        ),
        React.createElement(Text, null, 'Initializing...')
      );
    }

    return React.createElement(Box, { flexDirection: 'column', flexShrink: 0 },
      React.createElement(InputWithCursor, { input: input }),
      React.createElement(HistoryHint, { hasHistory: commandHistory.length > 0 })
    );
  };

  return React.createElement(Box, { flexDirection: 'column', overflow: 'hidden' },
    // Layer 1: committed output — Static commits items once, never tracked by Ink's height counter
    React.createElement(StaticOutput, { items: outputItems }),
    // Layer 2: interactive section — Ink only tracks this small (1-20 line) area
    !hasInteracted && mode !== 'selector' && React.createElement(Banner),
    renderOutput(),
    renderProcessViewer(),
    renderSelector(),
    renderModelConfig(),
    renderPrompt(),
    !questionnaireActive && !showPreview && !removeConfirmActive && !killConfirmActive && !kanbanPortConflictActive && !processViewerActive && !cancelConfirmActive && !modelConfigActive && mode !== 'executing' && React.createElement(BottomRightStatus, { backgroundProcesses })
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
      console.log('\n\nStopping background processes...');
      const stopped = manager.stopAll();
      console.log(`   Stopped ${stopped} process(es)\n`);
    }

    console.log('Thanks for using AVC!\n');
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
    console.error('\n\nUncaught exception:', error.message);
    const manager = getProcessManager();
    const running = manager.getRunningProcesses();

    if (running.length > 0) {
      console.log('\nStopping background processes...');
      manager.stopAll();
    }

    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('\n\nUnhandled promise rejection:', reason);
    const manager = getProcessManager();
    const running = manager.getRunningProcesses();

    if (running.length > 0) {
      console.log('\nStopping background processes...');
      manager.stopAll();
    }

    process.exit(1);
  });

  console.clear();
  render(React.createElement(App), {
    patchConsole: false,       // output is handled by outputBuffer + messaging API
    maxFps: 30,                // cap at 30fps — prevents CPU spikes during fast state changes
  });
}
