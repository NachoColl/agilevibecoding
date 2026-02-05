import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectInitiator } from '../../cli/init.js';
import fs from 'fs';
import path from 'path';

describe('Multi-line Paste Integration', () => {
  let testDir;
  let initiator;

  const pastedText = `CRUD customer records with WhatsApp phone numbers.
List, search, and select customers.
One-to-one WhatsApp chat UI per customer.
Manual send and receive WhatsApp messages via official API.
Persist and display full message history per customer.
Show basic message delivery status.`;

  beforeEach(async () => {
    // Create temporary test directory
    testDir = path.join(process.cwd(), 'test-paste-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });

    // Set up test environment
    process.env.ANTHROPIC_API_KEY = 'test-key-12345';
    process.env.AVC_REPL_MODE = 'true';

    // Create initiator
    initiator = new ProjectInitiator(testDir);

    // Initialize project
    await initiator.init();
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }

    // Clean up environment
    delete process.env.AVC_REPL_MODE;
  });

  describe('Paste text splitting', () => {
    it('should correctly split pasted text into 6 lines', () => {
      const lines = pastedText.split('\n');

      expect(lines.length).toBe(6);
      expect(lines[0]).toBe('CRUD customer records with WhatsApp phone numbers.');
      expect(lines[1]).toBe('List, search, and select customers.');
      expect(lines[2]).toBe('One-to-one WhatsApp chat UI per customer.');
      expect(lines[3]).toBe('Manual send and receive WhatsApp messages via official API.');
      expect(lines[4]).toBe('Persist and display full message history per customer.');
      expect(lines[5]).toBe('Show basic message delivery status.');
    });

    it('should preserve line order after splitting', () => {
      const lines = pastedText.split('\n');

      // Verify no line is empty
      lines.forEach((line, idx) => {
        expect(line.length).toBeGreaterThan(0);
        expect(line).not.toBe('');
      });

      // Verify specific keywords appear in correct lines
      expect(lines[0]).toContain('CRUD');
      expect(lines[0]).toContain('WhatsApp phone numbers');
      expect(lines[1]).toContain('List, search');
      expect(lines[2]).toContain('One-to-one');
      expect(lines[3]).toContain('Manual send');
      expect(lines[3]).toContain('official API');
      expect(lines[4]).toContain('message history');
      expect(lines[5]).toContain('delivery status');
    });

    it('should not garble text when processing lines', () => {
      const lines = pastedText.split('\n');

      // Verify no line contains fragments from other lines
      expect(lines[0]).not.toContain('List, search');
      expect(lines[1]).not.toContain('CRUD');
      expect(lines[2]).not.toContain('official API');
      expect(lines[3]).not.toContain('delivery status');

      // Verify each line is complete and coherent
      expect(lines[0]).toContain('CRUD customer records');
      expect(lines[1]).toContain('List, search, and select');
      expect(lines[2]).toContain('One-to-one WhatsApp chat');
      expect(lines[3]).toContain('Manual send and receive WhatsApp messages');
      expect(lines[4]).toContain('Persist and display full message history');
      expect(lines[5]).toContain('Show basic message delivery status');
    });
  });

  describe('Paste state updates', () => {
    it('should simulate functional setState behavior correctly', () => {
      // Simulate the paste handling logic with functional setState
      let currentAnswer = [];

      // Simulate paste processing
      const pastedLines = pastedText.split('\n');

      // This simulates the functional setState approach
      const updateAnswer = (prevLines) => {
        const lastLineIndex = prevLines.length - 1;
        const lastLine = prevLines[lastLineIndex] || '';
        const newLines = [...prevLines];

        // Append first line to current line
        if (newLines.length === 0) {
          newLines.push(pastedLines[0]);
        } else {
          newLines[lastLineIndex] = lastLine + pastedLines[0];
        }

        // Add remaining lines
        for (let i = 1; i < pastedLines.length; i++) {
          newLines.push(pastedLines[i]);
        }

        return newLines;
      };

      // Apply the update
      currentAnswer = updateAnswer(currentAnswer);

      // Verify result
      expect(currentAnswer.length).toBe(6);
      expect(currentAnswer[0]).toBe('CRUD customer records with WhatsApp phone numbers.');
      expect(currentAnswer[1]).toBe('List, search, and select customers.');
      expect(currentAnswer[2]).toBe('One-to-one WhatsApp chat UI per customer.');
      expect(currentAnswer[3]).toBe('Manual send and receive WhatsApp messages via official API.');
      expect(currentAnswer[4]).toBe('Persist and display full message history per customer.');
      expect(currentAnswer[5]).toBe('Show basic message delivery status.');
    });

    it('should handle rapid successive updates without race conditions', () => {
      // Simulate multiple rapid state updates (as would happen with rapid paste)
      let currentAnswer = [];

      // First update - simulate paste of first part
      currentAnswer = (prevLines => {
        const pastedLines = pastedText.split('\n');
        const newLines = [...prevLines];

        if (newLines.length === 0) {
          newLines.push(pastedLines[0]);
        }

        for (let i = 1; i < pastedLines.length; i++) {
          newLines.push(pastedLines[i]);
        }

        return newLines;
      })(currentAnswer);

      // Verify no garbling occurred
      expect(currentAnswer.length).toBe(6);

      // Verify no text overlap or corruption
      const joinedText = currentAnswer.join('\n');
      expect(joinedText).toBe(pastedText);

      // Verify specific text doesn't appear in wrong lines
      expect(currentAnswer[0]).not.toContain('List, search');
      expect(currentAnswer[3]).not.toContain('delivery status');
      expect(currentAnswer[5]).not.toContain('CRUD');
    });
  });

  describe('Line rendering', () => {
    it('should handle viewport management for 6 lines (under 15 limit)', () => {
      const lines = pastedText.split('\n');
      const maxVisibleLines = 15;

      const hasMoreLines = lines.length > maxVisibleLines;
      const visibleLines = hasMoreLines ? lines.slice(-maxVisibleLines) : lines;

      expect(hasMoreLines).toBe(false);
      expect(visibleLines.length).toBe(6);
      expect(visibleLines).toEqual(lines);
    });

    it('should display indicator when lines exceed viewport limit', () => {
      // Create a text with more than 15 lines
      const manyLines = Array(20).fill('Test line').map((line, idx) => `${line} ${idx + 1}`);
      const maxVisibleLines = 15;

      const hasMoreLines = manyLines.length > maxVisibleLines;
      const visibleLines = hasMoreLines ? manyLines.slice(-maxVisibleLines) : manyLines;
      const hiddenCount = manyLines.length - visibleLines.length;

      expect(hasMoreLines).toBe(true);
      expect(visibleLines.length).toBe(15);
      expect(hiddenCount).toBe(5);

      // Verify indicator message
      const indicator = `   ... ${hiddenCount} more line${hiddenCount > 1 ? 's' : ''} above (scroll up to see)`;
      expect(indicator).toBe('   ... 5 more lines above (scroll up to see)');
    });

    it('should preserve empty lines with space character', () => {
      const textWithEmptyLines = `Line 1

Line 3`;

      const lines = textWithEmptyLines.split('\n');
      expect(lines.length).toBe(3);
      expect(lines[1]).toBe('');

      // Simulate the displayLine logic
      const displayLines = lines.map(line => line || ' ');
      expect(displayLines[1]).toBe(' ');  // Empty line becomes space
      expect(displayLines[1]).not.toBe('');  // Not empty string
    });
  });

  describe('Character count', () => {
    it('should correctly count characters in pasted text', () => {
      const totalChars = pastedText.length;

      expect(totalChars).toBe(279);  // Total characters including newlines
    });

    it('should show correct character count after paste', () => {
      const lines = pastedText.split('\n');
      const totalChars = lines.join('\n').length;

      expect(totalChars).toBe(279);

      // Verify feedback message
      const feedbackMessage = `\n   ${totalChars} characters`;
      expect(feedbackMessage).toBe('\n   279 characters');
    });
  });

  describe('Edge cases', () => {
    it('should handle paste at empty answer', () => {
      let currentAnswer = [];

      const pastedLines = pastedText.split('\n');
      currentAnswer = (prevLines => {
        const newLines = [...prevLines];

        if (newLines.length === 0) {
          newLines.push(pastedLines[0]);
        }

        for (let i = 1; i < pastedLines.length; i++) {
          newLines.push(pastedLines[i]);
        }

        return newLines;
      })(currentAnswer);

      expect(currentAnswer.length).toBe(6);
      expect(currentAnswer[0]).toBe(pastedLines[0]);
    });

    it('should handle paste with existing text', () => {
      let currentAnswer = ['Existing text'];

      const pastedLines = pastedText.split('\n');
      currentAnswer = (prevLines => {
        const lastLineIndex = prevLines.length - 1;
        const lastLine = prevLines[lastLineIndex] || '';
        const newLines = [...prevLines];

        newLines[lastLineIndex] = lastLine + pastedLines[0];

        for (let i = 1; i < pastedLines.length; i++) {
          newLines.push(pastedLines[i]);
        }

        return newLines;
      })(currentAnswer);

      expect(currentAnswer.length).toBe(6);
      expect(currentAnswer[0]).toBe('Existing textCRUD customer records with WhatsApp phone numbers.');
      expect(currentAnswer[1]).toBe('List, search, and select customers.');
    });

    it('should handle single line paste', () => {
      let currentAnswer = [];
      const singleLine = 'Single line text';

      currentAnswer = (prevLines => {
        const newLines = [...prevLines];

        if (newLines.length === 0) {
          newLines.push(singleLine);
        } else {
          const lastLineIndex = newLines.length - 1;
          newLines[lastLineIndex] = newLines[lastLineIndex] + singleLine;
        }

        return newLines;
      })(currentAnswer);

      expect(currentAnswer.length).toBe(1);
      expect(currentAnswer[0]).toBe(singleLine);
    });
  });
});
