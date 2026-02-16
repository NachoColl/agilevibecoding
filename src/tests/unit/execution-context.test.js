/**
 * Unit tests for execution-context.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ExecutionState, isValidExecutionState } from '../../cli/execution-context.js';

describe('ExecutionState', () => {
  it('should export all execution states', () => {
    expect(ExecutionState.ACTIVE).toBe('active');
    expect(ExecutionState.CANCELLED).toBe('cancelled');
    expect(ExecutionState.COMPLETED).toBe('completed');
  });

  it('should have exactly 3 execution states', () => {
    const states = Object.keys(ExecutionState);
    expect(states.length).toBe(3);
  });
});

describe('isValidExecutionState', () => {
  it('should return true for valid execution states', () => {
    expect(isValidExecutionState('active')).toBe(true);
    expect(isValidExecutionState('cancelled')).toBe(true);
    expect(isValidExecutionState('completed')).toBe(true);
  });

  it('should return false for invalid execution states', () => {
    expect(isValidExecutionState('invalid')).toBe(false);
    expect(isValidExecutionState('')).toBe(false);
    expect(isValidExecutionState(null)).toBe(false);
    expect(isValidExecutionState(undefined)).toBe(false);
  });
});

describe('ExecutionContext', () => {
  let context;

  beforeEach(() => {
    context = new ExecutionContext('test-command');
  });

  describe('constructor', () => {
    it('should create context with unique ID', () => {
      const context1 = new ExecutionContext('test');
      const context2 = new ExecutionContext('test');
      expect(context1.id).not.toBe(context2.id);
      expect(context1.id).toMatch(/^\d+-[a-f0-9]{8}$/);
    });

    it('should initialize with command name', () => {
      expect(context.commandName).toBe('test-command');
    });

    it('should start in ACTIVE state', () => {
      expect(context.state).toBe(ExecutionState.ACTIVE);
      expect(context.isActive()).toBe(true);
      expect(context.isCancelled()).toBe(false);
      expect(context.isCompleted()).toBe(false);
    });

    it('should initialize with start time', () => {
      const now = Date.now();
      expect(context.startTime).toBeGreaterThanOrEqual(now - 100);
      expect(context.startTime).toBeLessThanOrEqual(now + 100);
    });

    it('should initialize with null end time', () => {
      expect(context.endTime).toBeNull();
    });

    it('should initialize with empty message buffer', () => {
      expect(context.messageBuffer).toEqual([]);
    });

    it('should initialize with null progress messages', () => {
      expect(context.executingMessage).toBeNull();
      expect(context.executingSubstep).toBeNull();
    });
  });

  describe('state management', () => {
    it('should transition from active to cancelled', () => {
      expect(context.isActive()).toBe(true);
      context.cancel();
      expect(context.isActive()).toBe(false);
      expect(context.isCancelled()).toBe(true);
      expect(context.isCompleted()).toBe(false);
    });

    it('should transition from active to completed', () => {
      expect(context.isActive()).toBe(true);
      context.complete();
      expect(context.isActive()).toBe(false);
      expect(context.isCancelled()).toBe(false);
      expect(context.isCompleted()).toBe(true);
    });

    it('should not transition from cancelled to completed', () => {
      context.cancel();
      context.complete();
      expect(context.isCancelled()).toBe(true);
      expect(context.isCompleted()).toBe(false);
    });

    it('should not transition from completed to cancelled', () => {
      context.complete();
      context.cancel();
      expect(context.isCompleted()).toBe(true);
      expect(context.isCancelled()).toBe(false);
    });

    it('should set end time when cancelled', () => {
      const before = Date.now();
      context.cancel();
      const after = Date.now();
      expect(context.endTime).toBeGreaterThanOrEqual(before);
      expect(context.endTime).toBeLessThanOrEqual(after);
    });

    it('should set end time when completed', () => {
      const before = Date.now();
      context.complete();
      const after = Date.now();
      expect(context.endTime).toBeGreaterThanOrEqual(before);
      expect(context.endTime).toBeLessThanOrEqual(after);
    });
  });

  describe('message management', () => {
    it('should add message when active', () => {
      const message = { type: 'USER_OUTPUT', content: 'test' };
      context.addMessage(message);
      const messages = context.getMessages();
      expect(messages.length).toBe(1);
      expect(messages[0].type).toBe('USER_OUTPUT');
      expect(messages[0].content).toBe('test');
      expect(messages[0].timestamp).toBeDefined();
      expect(messages[0].contextId).toBe(context.id);
    });

    it('should not add message when cancelled', () => {
      context.cancel();
      context.addMessage({ type: 'USER_OUTPUT', content: 'test' });
      expect(context.getMessages().length).toBe(0);
    });

    it('should not add message when completed', () => {
      context.complete();
      context.addMessage({ type: 'USER_OUTPUT', content: 'test' });
      expect(context.getMessages().length).toBe(0);
    });

    it('should clear messages', () => {
      context.addMessage({ type: 'USER_OUTPUT', content: 'test1' });
      context.addMessage({ type: 'USER_OUTPUT', content: 'test2' });
      expect(context.getMessages().length).toBe(2);
      context.clearMessages();
      expect(context.getMessages().length).toBe(0);
    });

    it('should clear messages when cancelled', () => {
      context.addMessage({ type: 'USER_OUTPUT', content: 'test' });
      expect(context.messageBuffer.length).toBe(1);
      context.cancel();
      expect(context.messageBuffer.length).toBe(0);
    });
  });

  describe('progress indicators', () => {
    it('should set executing message when active', () => {
      context.setExecutingMessage('Processing...');
      expect(context.executingMessage).toBe('Processing...');
    });

    it('should set executing substep when active', () => {
      context.setExecutingSubstep('Step 1/3');
      expect(context.executingSubstep).toBe('Step 1/3');
    });

    it('should not set executing message when cancelled', () => {
      context.cancel();
      context.setExecutingMessage('Processing...');
      expect(context.executingMessage).toBeNull();
    });

    it('should not set executing substep when cancelled', () => {
      context.cancel();
      context.setExecutingSubstep('Step 1/3');
      expect(context.executingSubstep).toBeNull();
    });

    it('should clear executing message', () => {
      context.setExecutingMessage('Processing...');
      expect(context.executingMessage).toBe('Processing...');
      context.clearExecutingMessage();
      expect(context.executingMessage).toBeNull();
    });

    it('should clear executing substep', () => {
      context.setExecutingSubstep('Step 1/3');
      expect(context.executingSubstep).toBe('Step 1/3');
      context.clearExecutingSubstep();
      expect(context.executingSubstep).toBeNull();
    });

    it('should clear progress indicators when cancelled', () => {
      context.setExecutingMessage('Processing...');
      context.setExecutingSubstep('Step 1/3');
      context.cancel();
      expect(context.executingMessage).toBeNull();
      expect(context.executingSubstep).toBeNull();
    });
  });

  describe('duration calculation', () => {
    it('should calculate duration for active context', () => {
      vi.useFakeTimers();
      const context = new ExecutionContext('test');
      vi.advanceTimersByTime(1000);
      const duration = context.getDuration();
      expect(duration).toBeGreaterThanOrEqual(1000);
      vi.useRealTimers();
    });

    it('should calculate duration for completed context', () => {
      vi.useFakeTimers();
      const context = new ExecutionContext('test');
      vi.advanceTimersByTime(1000);
      context.complete();
      const duration = context.getDuration();
      expect(duration).toBeGreaterThanOrEqual(1000);
      vi.useRealTimers();
    });

    it('should calculate duration for cancelled context', () => {
      vi.useFakeTimers();
      const context = new ExecutionContext('test');
      vi.advanceTimersByTime(1000);
      context.cancel();
      const duration = context.getDuration();
      expect(duration).toBeGreaterThanOrEqual(1000);
      vi.useRealTimers();
    });
  });

  describe('toJSON', () => {
    it('should return complete context summary', () => {
      context.setExecutingMessage('Processing...');
      context.setExecutingSubstep('Step 1/3');
      context.addMessage({ type: 'USER_OUTPUT', content: 'test' });

      const json = context.toJSON();
      expect(json.id).toBe(context.id);
      expect(json.commandName).toBe('test-command');
      expect(json.state).toBe('active');
      expect(json.startTime).toBe(context.startTime);
      expect(json.endTime).toBeNull();
      expect(json.duration).toBeGreaterThanOrEqual(0);
      expect(json.messageCount).toBe(1);
      expect(json.executingMessage).toBe('Processing...');
      expect(json.executingSubstep).toBe('Step 1/3');
    });

    it('should show correct state when cancelled', () => {
      context.cancel();
      const json = context.toJSON();
      expect(json.state).toBe('cancelled');
      expect(json.endTime).not.toBeNull();
    });

    it('should show correct state when completed', () => {
      context.complete();
      const json = context.toJSON();
      expect(json.state).toBe('completed');
      expect(json.endTime).not.toBeNull();
    });
  });
});
