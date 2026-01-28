import React from 'react';
import { Box, Text } from 'ink';
import { UpdateChecker } from './update-checker.js';

/**
 * Update notification components for Ink
 */

// Update notification banner (full notification)
export const UpdateNotification = ({ onDismiss }) => {
  const checker = new UpdateChecker();
  const state = checker.readState();

  // Don't show if no update available
  if (!state.updateAvailable) return null;

  // Don't show if user dismissed
  if (state.userDismissed) return null;

  // Update downloading
  if (state.updateStatus === 'downloading') {
    return React.createElement(Box, {
      borderStyle: 'round',
      borderColor: 'blue',
      paddingX: 2,
      paddingY: 1,
      marginBottom: 1
    },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'blue' },
          `⬇️  Downloading update v${state.latestVersion}...`
        ),
        React.createElement(Text, { dimColor: true },
          'This happens in the background. Continue working!'
        )
      )
    );
  }

  // Update ready to use
  if (state.updateReady) {
    return React.createElement(Box, {
      borderStyle: 'round',
      borderColor: 'green',
      paddingX: 2,
      paddingY: 1,
      marginBottom: 1
    },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'green' },
          `✅ Update v${state.downloadedVersion} ready!`
        ),
        React.createElement(Text, null,
          'Restart to use the new version'
        ),
        React.createElement(Box, { marginTop: 1, flexDirection: 'row' },
          React.createElement(Text, { dimColor: true },
            'Type '
          ),
          React.createElement(Text, { color: 'cyan', bold: true },
            '/restart'
          ),
          React.createElement(Text, { dimColor: true },
            ' or press '
          ),
          React.createElement(Text, { color: 'cyan', bold: true },
            'Ctrl+R'
          )
        ),
        React.createElement(Box, { marginTop: 1, flexDirection: 'row' },
          React.createElement(Text, { dimColor: true, italic: true },
            'Press '
          ),
          React.createElement(Text, { color: 'yellow' },
            'Esc'
          ),
          React.createElement(Text, { dimColor: true, italic: true },
            ' to dismiss'
          )
        )
      )
    );
  }

  // Update failed
  if (state.updateStatus === 'failed') {
    const needsSudo = state.errorMessage && state.errorMessage.includes('sudo');

    return React.createElement(Box, {
      borderStyle: 'round',
      borderColor: 'red',
      paddingX: 2,
      paddingY: 1,
      marginBottom: 1
    },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'red' },
          '❌ Update failed'
        ),
        React.createElement(Text, null,
          state.errorMessage || 'Unknown error'
        ),
        needsSudo && React.createElement(Box, { marginTop: 1 },
          React.createElement(Text, { dimColor: true },
            'Manual install: '
          ),
          React.createElement(Text, { color: 'cyan' },
            state.errorMessage.split('Try: ')[1]
          )
        ),
        React.createElement(Text, { dimColor: true, marginTop: 1 },
          'Will retry on next check'
        )
      )
    );
  }

  // Update pending (just discovered)
  if (state.updateStatus === 'pending' || state.updateStatus === 'idle') {
    return React.createElement(Box, {
      borderStyle: 'round',
      borderColor: 'yellow',
      paddingX: 2,
      paddingY: 1,
      marginBottom: 1
    },
      React.createElement(Box, { flexDirection: 'column' },
        React.createElement(Text, { bold: true, color: 'yellow' },
          `📦 Update available: v${state.latestVersion}`
        ),
        React.createElement(Text, null,
          'Installing in background...'
        ),
        React.createElement(Text, { dimColor: true, italic: true },
          'You will be notified when ready'
        )
      )
    );
  }

  return null;
};

// Update status badge (compact, for banner)
export const UpdateStatusBadge = () => {
  const checker = new UpdateChecker();
  const state = checker.readState();

  if (!state.updateAvailable || state.userDismissed) return null;

  if (state.updateReady) {
    return React.createElement(Text, { color: 'green', bold: true },
      ' [Update Ready!]'
    );
  }

  if (state.updateStatus === 'downloading') {
    return React.createElement(Text, { color: 'blue', bold: true },
      ' [Updating...]'
    );
  }

  if (state.updateStatus === 'pending' || state.updateStatus === 'idle') {
    return React.createElement(Text, { color: 'yellow', bold: true },
      ' [Update Available]'
    );
  }

  return null;
};
