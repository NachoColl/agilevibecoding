/**
 * Unit tests for message-manager.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { messageManager } from '../../cli/message-manager.js';
import { MessageType } from '../../cli/message-types.js';
import { outputBuffer } from '../../cli/output-buffer.js';

describe('MessageManager', () => {
  let executingMessageCallback;
  let executingSubstepCallback;

  beforeEach(() => {
    // Reset manager state
    messageManager.reset();

    // Clear output buffer
    outputBuffer.clear();

    // Create mock callbacks
    executingMessageCallback = vi.fn();
    executingSubstepCallback = vi.fn();

    // Register callbacks (output now goes to outputBuffer)
    messageManager.setExecutingMessageCallback(executingMessageCallback);
    messageManager.setExecutingSubstepCallback(executingSubstepCallback);
  });

  describe('singleton pattern', () => {
    it('should always return same instance', () => {
      // Since we import messageManager at the top, we can verify it's a singleton
      // by checking that the instance is the same across multiple uses
      const manager1 = messageManager;
      const manager2 = messageManager;
      expect(manager1).toBe(manager2);
      expect(manager1.constructor.instance).toBe(manager2);
    });
  });

  describe('execution context management', () => {
    it('should start new execution context', () => {
      const context = messageManager.startExecution('test-command');
      expect(context).toBeDefined();
      expect(context.commandName).toBe('test-command');
      expect(context.isActive()).toBe(true);
      expect(messageManager.getCurrentContext()).toBe(context);
    });

    it('should clear output when starting new execution', () => {
      // Add some content first
      outputBuffer.append('some old content');
      expect(outputBuffer.getLineCount()).toBeGreaterThan(0);

      // Starting new execution should clear output buffer
      messageManager.startExecution('test');
      expect(outputBuffer.getLineCount()).toBe(0);
      expect(outputBuffer.getLines()).toEqual([]);
    });

    it('should cancel previous context when starting new one', () => {
      const context1 = messageManager.startExecution('command1');
      expect(context1.isActive()).toBe(true);

      const context2 = messageManager.startExecution('command2');
      expect(context1.isCancelled()).toBe(true);
      expect(context2.isActive()).toBe(true);
      expect(messageManager.getCurrentContext()).toBe(context2);
    });

    it('should end execution context', () => {
      const context = messageManager.startExecution('test');
      messageManager.endExecution();
      expect(context.isCompleted()).toBe(true);
      expect(messageManager.getCurrentContext()).toBeNull();
    });

    it('should clear progress indicators when ending execution', () => {
      messageManager.startExecution('test');
      messageManager.endExecution();
      expect(executingMessageCallback).toHaveBeenCalledWith('');
      expect(executingSubstepCallback).toHaveBeenCalledWith('');
    });

    it('should cancel execution context', () => {
      const context = messageManager.startExecution('test');
      messageManager.cancelExecution();
      expect(context.isCancelled()).toBe(true);
      expect(messageManager.getCurrentContext()).toBeNull();
    });

    it('should clear progress indicators when cancelling execution', () => {
      messageManager.startExecution('test');
      messageManager.cancelExecution();
      expect(executingMessageCallback).toHaveBeenCalledWith('');
      expect(executingSubstepCallback).toHaveBeenCalledWith('');
    });

    it('should maintain context history', () => {
      messageManager.startExecution('command1');
      messageManager.endExecution();
      messageManager.startExecution('command2');
      messageManager.endExecution();

      const history = messageManager.getHistory();
      expect(history.length).toBe(2);
      expect(history[0].commandName).toBe('command1');
      expect(history[1].commandName).toBe('command2');
    });

    it('should limit history size', () => {
      // Start 15 commands (max is 10)
      for (let i = 0; i < 15; i++) {
        messageManager.startExecution(`command${i}`);
      }

      const history = messageManager.getHistory();
      expect(history.length).toBe(10);
      expect(history[0].commandName).toBe('command5'); // Oldest should be command5
      expect(history[9].commandName).toBe('command14'); // Newest should be command14
    });
  });

  describe('message sending - USER_OUTPUT', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should send user output', () => {
      messageManager.send(MessageType.USER_OUTPUT, 'Hello World');

      const lines = outputBuffer.getLines();
      expect(lines).toEqual(['Hello World']);
    });

    it('should not send message when no active context', () => {
      messageManager.endExecution();

      // Clear buffer after ending execution
      outputBuffer.clear();

      messageManager.send(MessageType.USER_OUTPUT, 'Should not appear');

      // Buffer should still be empty
      expect(outputBuffer.getLineCount()).toBe(0);
    });

    it('should not send message after context cancelled', () => {
      messageManager.cancelExecution();

      // Clear buffer after cancellation
      outputBuffer.clear();

      messageManager.send(MessageType.USER_OUTPUT, 'Should not appear');
      expect(outputBuffer.getLineCount()).toBe(0);
    });
  });

  describe('message sending - ERROR', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should send error with ERROR: prefix', () => {
      messageManager.send(MessageType.ERROR, 'Something failed');

      const lines = outputBuffer.getLines();
      expect(lines).toEqual(['ERROR: Something failed', '']);
    });
  });

  describe('message sending - WARNING', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should send warning with WARNING: prefix', () => {
      messageManager.send(MessageType.WARNING, 'Be careful');

      const lines = outputBuffer.getLines();
      expect(lines).toEqual(['WARNING: Be careful', '']);
    });
  });

  describe('message sending - SUCCESS', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should send success with SUCCESS: prefix', () => {
      messageManager.send(MessageType.SUCCESS, 'Operation completed');

      const lines = outputBuffer.getLines();
      expect(lines).toEqual(['SUCCESS: Operation completed', '']);
    });
  });

  describe('message sending - INFO', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should send info with INFO: prefix', () => {
      messageManager.send(MessageType.INFO, 'Using Claude provider');

      const lines = outputBuffer.getLines();
      expect(lines).toEqual(['INFO: Using Claude provider', '']);
    });
  });

  describe('message sending - CEREMONY_HEADER', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should send ceremony header with double newline', () => {
      messageManager.send(MessageType.CEREMONY_HEADER, '🎯 Test\n📖 https://example.com');

      const lines = outputBuffer.getLines();
      expect(lines).toEqual(['🎯 Test', '📖 https://example.com', '', '']);
    });
  });

  describe('message sending - PROGRESS', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should send progress to executing message', () => {
      messageManager.send(MessageType.PROGRESS, 'Processing...');
      expect(executingMessageCallback).toHaveBeenCalledWith('Processing...');

      const context = messageManager.getCurrentContext();
      expect(context.executingMessage).toBe('Processing...');
    });
  });

  describe('message sending - SUBSTEP', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should send substep to executing substep', () => {
      messageManager.send(MessageType.SUBSTEP, 'Step 1/3');
      expect(executingSubstepCallback).toHaveBeenCalledWith('Step 1/3');

      const context = messageManager.getCurrentContext();
      expect(context.executingSubstep).toBe('Step 1/3');
    });
  });

  describe('message sending - DEBUG', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
      vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    it('should send debug to console.log only', () => {
      messageManager.send(MessageType.DEBUG, 'Debug info');
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[DEBUG\]\[.*\] Debug info/)
      );
      // Should not add to output buffer
      expect(outputBuffer.getLineCount()).toBe(0);
    });

    it('should send debug with data', () => {
      messageManager.send(MessageType.DEBUG, 'Debug info', { data: { foo: 'bar' } });
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/\[DEBUG\]\[.*\] Debug info/),
        expect.stringContaining('"foo": "bar"')
      );
    });
  });

  describe('message sending - invalid type', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log error for invalid message type', () => {
      messageManager.send('INVALID_TYPE', 'content');
      expect(console.error).toHaveBeenCalledWith('Invalid message type: INVALID_TYPE');
    });
  });

  describe('clearProgress', () => {
    beforeEach(() => {
      messageManager.startExecution('test');
    });

    it('should clear progress indicators', () => {
      messageManager.send(MessageType.PROGRESS, 'Processing...');
      messageManager.send(MessageType.SUBSTEP, 'Step 1/3');

      messageManager.clearProgress();

      expect(executingMessageCallback).toHaveBeenLastCalledWith('');
      expect(executingSubstepCallback).toHaveBeenLastCalledWith('');

      const context = messageManager.getCurrentContext();
      expect(context.executingMessage).toBeNull();
      expect(context.executingSubstep).toBeNull();
    });
  });

  describe('toJSON', () => {
    it('should return manager state without active context', () => {
      const json = messageManager.toJSON();
      expect(json.hasCurrentContext).toBe(false);
      expect(json.currentContext).toBeNull();
      expect(json.historySize).toBe(0);
      expect(json.hasCallbacks.executingMessage).toBe(true);
      expect(json.hasCallbacks.executingSubstep).toBe(true);
    });

    it('should return manager state with active context', () => {
      messageManager.startExecution('test');
      const json = messageManager.toJSON();
      expect(json.hasCurrentContext).toBe(true);
      expect(json.currentContext).toBeDefined();
      expect(json.currentContext.commandName).toBe('test');
      expect(json.currentContext.state).toBe('active');
    });
  });

  describe('reset', () => {
    it('should reset manager state', () => {
      messageManager.startExecution('command1');
      messageManager.endExecution();
      messageManager.startExecution('command2');

      expect(messageManager.getCurrentContext()).not.toBeNull();
      expect(messageManager.getHistory().length).toBeGreaterThan(0);

      messageManager.reset();

      expect(messageManager.getCurrentContext()).toBeNull();
      expect(messageManager.getHistory().length).toBe(0);
    });

    it('should cancel active context when resetting', () => {
      const context = messageManager.startExecution('test');
      messageManager.reset();
      expect(context.isCancelled()).toBe(true);
    });
  });
});
