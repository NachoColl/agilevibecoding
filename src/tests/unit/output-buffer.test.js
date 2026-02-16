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

    it('merges continuation lines', () => {
      buffer.append('Start');
      buffer.append(' continuation');
      expect(buffer.getLines()).toEqual(['Start continuation']);
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
    it('clears all lines', () => {
      buffer.append('Line 1\nLine 2');
      expect(buffer.getLineCount()).toBe(2);

      buffer.clear();
      expect(buffer.getLines()).toEqual([]);
      expect(buffer.getLineCount()).toBe(0);
    });

    it('allows appending after clear', () => {
      buffer.append('Line 1');
      buffer.clear();
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

  describe('subscribe()', () => {
    it('notifies listeners on append', () => {
      let notified = false;
      let receivedLines = null;

      buffer.subscribe((lines) => {
        notified = true;
        receivedLines = lines;
      });

      buffer.append('Test');

      expect(notified).toBe(true);
      expect(receivedLines).toEqual(['Test']);
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
      buffer.append('🎯 Sponsor Call Ceremony\n');
      buffer.append('📖 https://agilevibecoding.org/ceremonies/sponsor-call\n');
      buffer.append('\n');
      buffer.append('✓ Deployment Strategy: Local MVP First\n');

      // Note: Trailing \n creates empty last line, which merges with next append
      // append('\n') creates two empty lines: one from merge, one from split
      expect(buffer.getLines()).toEqual([
        '🎯 Sponsor Call Ceremony',
        '📖 https://agilevibecoding.org/ceremonies/sponsor-call',
        '',
        '',
        '✓ Deployment Strategy: Local MVP First',
        ''
      ]);
    });

    it('handles incremental message building', () => {
      buffer.append('Processing...');
      buffer.append(' 25%');
      buffer.append('\n');
      buffer.append('Processing...');
      buffer.append(' 50%');
      buffer.append('\n');
      buffer.append('Processing...');
      buffer.append(' 100%');
      buffer.append('\n');
      buffer.append('✓ Complete\n');

      expect(buffer.getLines()).toEqual([
        'Processing... 25%',
        '',
        'Processing... 50%',
        '',
        'Processing... 100%',
        '',
        '✓ Complete',
        ''
      ]);
    });
  });
});
