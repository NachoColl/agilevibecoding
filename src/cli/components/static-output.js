import React from 'react';
import { Box, Text, Static } from 'ink';

/**
 * StaticOutput - Renders accumulated output buffer using Ink's Static component
 *
 * Ensures output is rendered once and never updates, preventing
 * text mixing with interactive UI components.
 *
 * Uses Ink's <Static> component which:
 * - Renders permanent/historical output
 * - Never re-renders when state changes
 * - Maintains physical separation from interactive UI
 * - Optimized for virtual scrolling
 *
 * @param {Object} props
 * @param {string[]} props.lines - Array of output lines to render
 * @returns {React.Element|null} Static output component or null if no lines
 */
export const StaticOutput = ({ lines }) => {
  if (!lines || lines.length === 0) return null;

  return React.createElement(Box, {
    flexDirection: 'column',
    flexShrink: 0,
    marginBottom: 1
  },
    React.createElement(Static, { items: lines },
      (line, index) => React.createElement(Text, { key: index }, line)
    )
  );
};
