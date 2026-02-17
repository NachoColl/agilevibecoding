import { describe, it, expect, beforeEach } from 'vitest';
import { OutputBuffer } from '../../cli/output-buffer.js';

describe('OutputBuffer', () => {
  let buffer;

  beforeEach(() => {
    buffer = new OutputBuffer();
  });

  describe('append()', () => {
    it('appends single line', () => {
      buffer.append('Line 1');
      expect(buffer.getLines()).toEqual(['Line 1']);
    });

    it('splits multi-line content', () => {
      buffer.append('Line 1\nLine 2\nLine 3');
      expect(buffer.getLines()).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('each append is a separate item (no merging)', () => {
      buffer.append('Start');
      buffer.append(' continuation');
      // Each append creates a separate item — no line merging
      expect(buffer.getLines()).toEqual(['Start', ' continuation']);
    });

    it('handles newline at start', () => {
      buffer.append('First');
      buffer.append('\nSecond');
      expect(buffer.getLines()).toEqual(['First', '', 'Second']);
    });

    it('handles empty string', () => {
      buffer.append('Line 1');
      buffer.append('');
      expect(buffer.getLines()).toEqual(['Line 1']);
    });

    it('handles null/undefined gracefully', () => {
      buffer.append('Line 1');
      buffer.append(null);
      buffer.append(undefined);
      expect(buffer.getLines()).toEqual(['Line 1']);
    });

    it('handles multiple newlines', () => {
      buffer.append('Line 1\n\n\nLine 2');
      expect(buffer.getLines()).toEqual(['Line 1', '', '', 'Line 2']);
    });
  });

  describe('clear()', () => {
    it('adds a blank separator item (Static content cannot be erased)', () => {
      buffer.append('Line 1\nLine 2');
      expect(buffer.getItemCount()).toBe(1);

      buffer.clear();
      // clear() adds a separator, not erases
      expect(buffer.getItemCount()).toBe(2);
      expect(buffer.getLines()).toEqual(['Line 1', 'Line 2', '']);
    });

    it('does nothing when buffer is already empty', () => {
      expect(buffer.getItemCount()).toBe(0);
      buffer.clear();
      expect(buffer.getItemCount()).toBe(0);
    });

    it('preserves previous content after clear + append', () => {
      buffer.append('Line 1');
      buffer.clear();
      buffer.append('Line 2');
      // All content is preserved (with separator between)
      expect(buffer.getLines()).toEqual(['Line 1', '', 'Line 2']);
    });
  });

  describe('reset()', () => {
    it('removes all items', () => {
      buffer.append('Line 1\nLine 2');
      expect(buffer.getItemCount()).toBeGreaterThan(0);

      buffer.reset();
      expect(buffer.getItems()).toEqual([]);
      expect(buffer.getItemCount()).toBe(0);
      expect(buffer.getLines()).toEqual([]);
    });

    it('allows clean appending after reset', () => {
      buffer.append('Line 1');
      buffer.reset();
      buffer.append('Line 2');
      expect(buffer.getLines()).toEqual(['Line 2']);
    });
  });

  describe('getLines()', () => {
    it('returns copy of lines array', () => {
      buffer.append('Line 1\nLine 2');
      const lines1 = buffer.getLines();
      const lines2 = buffer.getLines();

      // Different array instances
      expect(lines1).not.toBe(lines2);
      // Same content
      expect(lines1).toEqual(lines2);
    });

    it('mutations dont affect buffer', () => {
      buffer.append('Line 1\nLine 2');
      const lines = buffer.getLines();
      lines.push('Line 3');

      // Buffer unchanged
      expect(buffer.getLines()).toEqual(['Line 1', 'Line 2']);
    });
  });

  describe('getLineCount()', () => {
    it('returns correct count', () => {
      expect(buffer.getLineCount()).toBe(0);

      buffer.append('Line 1');
      expect(buffer.getLineCount()).toBe(1);

      buffer.append('\nLine 2\nLine 3');
      expect(buffer.getLineCount()).toBe(4); // 'Line 1', '', 'Line 2', 'Line 3'
    });
  });

  describe('getItems()', () => {
    it('returns items with stable ids', () => {
      buffer.append('Hello');
      buffer.append('World');
      const items = buffer.getItems();
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ id: 1, content: 'Hello' });
      expect(items[1]).toEqual({ id: 2, content: 'World' });
    });

    it('returns copy (mutations dont affect buffer)', () => {
      buffer.append('Hello');
      const items = buffer.getItems();
      items.push({ id: 99, content: 'injected' });
      expect(buffer.getItemCount()).toBe(1);
    });
  });

  describe('subscribe()', () => {
    it('notifies listeners on append with items array', () => {
      let notified = false;
      let receivedItems = null;

      buffer.subscribe((items) => {
        notified = true;
        receivedItems = items;
      });

      buffer.append('Test');

      expect(notified).toBe(true);
      expect(receivedItems).toHaveLength(1);
      expect(receivedItems[0].content).toBe('Test');
    });

    it('notifies listeners on clear', () => {
      let notifications = 0;

      buffer.subscribe(() => {
        notifications++;
      });

      buffer.append('Line 1');
      expect(notifications).toBe(1);

      buffer.clear();
      expect(notifications).toBe(2);
    });

    it('notifies multiple listeners', () => {
      let count1 = 0;
      let count2 = 0;

      buffer.subscribe(() => count1++);
      buffer.subscribe(() => count2++);

      buffer.append('Test');

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });

    it('returns unsubscribe function', () => {
      let count = 0;

      const unsubscribe = buffer.subscribe(() => count++);

      buffer.append('Test 1');
      expect(count).toBe(1);

      unsubscribe();

      buffer.append('Test 2');
      expect(count).toBe(1); // Not incremented after unsubscribe
    });

    it('allows multiple subscribe/unsubscribe', () => {
      let count1 = 0;
      let count2 = 0;

      const unsub1 = buffer.subscribe(() => count1++);
      const unsub2 = buffer.subscribe(() => count2++);

      buffer.append('Test 1');
      expect(count1).toBe(1);
      expect(count2).toBe(1);

      unsub1();

      buffer.append('Test 2');
      expect(count1).toBe(1); // Stopped after unsub1
      expect(count2).toBe(2); // Still counting

      unsub2();

      buffer.append('Test 3');
      expect(count1).toBe(1);
      expect(count2).toBe(2); // Stopped after unsub2
    });
  });

  describe('complex scenarios', () => {
    it('handles realistic console output', () => {
      buffer.append('Sponsor Call Ceremony\n');
      buffer.append('Documentation: https://agilevibecoding.org/ceremonies/sponsor-call\n');
      buffer.append('\n');
      buffer.append('Deployment Strategy: Local MVP First\n');

      // Each append() is one item; getLines() flatMaps all content split by \n
      // A trailing \n produces an extra empty string at the end of each item's lines
      expect(buffer.getLines()).toEqual([
        'Sponsor Call Ceremony',
        '',
        'Documentation: https://agilevibecoding.org/ceremonies/sponsor-call',
        '',
        '',
        '',
        'Deployment Strategy: Local MVP First',
        ''
      ]);
    });

    it('handles multi-part progress output as separate items', () => {
      // In the new architecture, incremental appends do NOT merge into one line
      // Each append becomes its own item
      buffer.append('Processing...');
      buffer.append(' 25%');
      buffer.append('\n');
      buffer.append('Processing...');
      buffer.append(' 50%');

      expect(buffer.getItems()).toHaveLength(5);
      expect(buffer.getLines()).toEqual([
        'Processing...',
        ' 25%',
        '',
        '',
        'Processing...',
        ' 50%'
      ]);
    });
  });
});
