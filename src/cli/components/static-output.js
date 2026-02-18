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
        return React.createElement(Box, { key: item.id, flexDirection: 'row', gap: 1 },
          React.createElement(Text, { backgroundColor: badge.bg, color: badge.fg }, badge.label),
          React.createElement(Text, null, displayContent)
        );
      }

      return React.createElement(Text, { key: item.id }, item.content);
    }
  );
};
