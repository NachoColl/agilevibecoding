import React from 'react';
import { Static, Text, Box } from 'ink';

/**
 * Badge config for message types (inspired by jest example's backgroundColor badges)
 */
const BADGE = {
  ERROR:   { bg: 'red',    fg: 'white', label: ' ERR ' },
  WARNING: { bg: 'yellow', fg: 'black', label: ' WRN ' },
  SUCCESS: { bg: 'green',  fg: 'black', label: ' OK  ' },
  INFO:    { bg: 'blue',   fg: 'white', label: ' INF ' },
};

/**
 * StaticOutput - Renders output items using Ink's built-in Static component.
 *
 * Ink's <Static> commits each item to the terminal once and never touches
 * it again. Items are NOT part of Ink's height-tracking calculation, so
 * they never cause ghost renders when the interactive section changes height.
 *
 * Items with a `type` field get a colored background badge prefix
 * (ERR/WRN/OK/INF) inspired by the jest example's test status chips.
 *
 * @param {Object} props
 * @param {{id: number, content: string, type?: string}[]} props.items
 * @returns {React.Element|null}
 */
export const StaticOutput = ({ items }) => {
  if (!items || items.length === 0) return null;

  return React.createElement(Static, { items },
    (item) => {
      const badge = item.type ? BADGE[item.type] : null;

      if (badge) {
        // Strip the "TYPE: " prefix from content — badge already shows the type visually
        const displayContent = item.content.replace(/^(ERROR|WARNING|SUCCESS|INFO): /, '');
        const lines = displayContent.split('\n');

        if (lines.length === 1) {
          // Single-line: badge + text side by side
          return React.createElement(Box, { key: item.id, flexDirection: 'row', gap: 1 },
            React.createElement(Text, { backgroundColor: badge.bg, color: badge.fg }, badge.label),
            React.createElement(Text, null, displayContent)
          );
        }

        // Multi-line: badge on first line only, subsequent lines fully left-aligned
        return React.createElement(Box, { key: item.id, flexDirection: 'column' },
          React.createElement(Box, { flexDirection: 'row', gap: 1 },
            React.createElement(Text, { backgroundColor: badge.bg, color: badge.fg }, badge.label),
            React.createElement(Text, null, lines[0])
          ),
          ...lines.slice(1).map((line, i) =>
            React.createElement(Text, { key: i }, line)
          )
        );
      }

      return React.createElement(Text, { key: item.id }, item.content);
    }
  );
};
