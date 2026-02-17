import React from 'react';
import { Static, Text } from 'ink';

/**
 * StaticOutput - Renders output items using Ink's built-in Static component.
 *
 * Ink's <Static> commits each item to the terminal once and never touches
 * it again. Items are NOT part of Ink's height-tracking calculation, so
 * they never cause ghost renders when the interactive section changes height.
 *
 * This is the key architectural difference from the previous Box/Text approach:
 * - Before: all output lines participated in Ink's render/erase cycle (200+ lines)
 * - After:  only the interactive section (1-20 lines) is tracked by Ink
 *
 * @param {Object} props
 * @param {{id: number, content: string}[]} props.items - Items to render
 * @returns {React.Element|null} Static output or null if no items
 */
export const StaticOutput = ({ items }) => {
  if (!items || items.length === 0) return null;

  return React.createElement(Static, { items },
    (item) => React.createElement(Text, { key: item.id }, item.content)
  );
};
