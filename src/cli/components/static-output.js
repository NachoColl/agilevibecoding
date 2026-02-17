import React from 'react';
import { Box, Text } from 'ink';

/**
 * StaticOutput - Renders accumulated output buffer
 *
 * Uses React.memo to prevent re-rendering when lines haven't changed,
 * reducing visual noise during interactive selections.
 *
 * @param {Object} props
 * @param {string[]} props.lines - Array of output lines to render
 * @returns {React.Element|null} Output component or null if no lines
 */
const StaticOutputComponent = ({ lines }) => {
  if (!lines || lines.length === 0) return null;

  return React.createElement(Box, {
    flexDirection: 'column',
    flexShrink: 0,
    marginBottom: 1
  },
    lines.map((line, index) =>
      React.createElement(Text, { key: index }, line)
    )
  );
};

// Wrap with React.memo to prevent re-renders when lines haven't changed
export const StaticOutput = React.memo(StaticOutputComponent, (prevProps, nextProps) => {
  // Only re-render if lines array content actually changed
  if (prevProps.lines.length !== nextProps.lines.length) return false;
  return prevProps.lines.every((line, i) => line === nextProps.lines[i]);
});
