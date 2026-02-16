/**
 * Unit tests for message-types.js
 */

import { describe, it, expect } from 'vitest';
import { MessageType, isValidMessageType, getMessageFormat } from '../../cli/message-types.js';

describe('MessageType', () => {
  it('should export all message type constants', () => {
    expect(MessageType.COMMAND_START).toBe('COMMAND_START');
    expect(MessageType.CEREMONY_HEADER).toBe('CEREMONY_HEADER');
    expect(MessageType.PROGRESS).toBe('PROGRESS');
    expect(MessageType.SUBSTEP).toBe('SUBSTEP');
    expect(MessageType.USER_OUTPUT).toBe('USER_OUTPUT');
    expect(MessageType.ERROR).toBe('ERROR');
    expect(MessageType.WARNING).toBe('WARNING');
    expect(MessageType.SUCCESS).toBe('SUCCESS');
    expect(MessageType.DEBUG).toBe('DEBUG');
    expect(MessageType.INFO).toBe('INFO');
  });

  it('should have exactly 10 message types', () => {
    const types = Object.keys(MessageType);
    expect(types.length).toBe(10);
  });

  it('should have unique values for all message types', () => {
    const values = Object.values(MessageType);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });
});

describe('isValidMessageType', () => {
  it('should return true for valid message types', () => {
    expect(isValidMessageType('COMMAND_START')).toBe(true);
    expect(isValidMessageType('CEREMONY_HEADER')).toBe(true);
    expect(isValidMessageType('PROGRESS')).toBe(true);
    expect(isValidMessageType('SUBSTEP')).toBe(true);
    expect(isValidMessageType('USER_OUTPUT')).toBe(true);
    expect(isValidMessageType('ERROR')).toBe(true);
    expect(isValidMessageType('WARNING')).toBe(true);
    expect(isValidMessageType('SUCCESS')).toBe(true);
    expect(isValidMessageType('DEBUG')).toBe(true);
    expect(isValidMessageType('INFO')).toBe(true);
  });

  it('should return false for invalid message types', () => {
    expect(isValidMessageType('INVALID')).toBe(false);
    expect(isValidMessageType('')).toBe(false);
    expect(isValidMessageType(null)).toBe(false);
    expect(isValidMessageType(undefined)).toBe(false);
    expect(isValidMessageType(123)).toBe(false);
  });

  it('should be case sensitive', () => {
    expect(isValidMessageType('error')).toBe(false);
    expect(isValidMessageType('Error')).toBe(false);
    expect(isValidMessageType('ERROR')).toBe(true);
  });
});

describe('getMessageFormat', () => {
  it('should return correct format for ERROR type', () => {
    const format = getMessageFormat(MessageType.ERROR);
    expect(format.prefix).toBe('❌ ');
    expect(format.color).toBe('red');
  });

  it('should return correct format for WARNING type', () => {
    const format = getMessageFormat(MessageType.WARNING);
    expect(format.prefix).toBe('⚠️  ');
    expect(format.color).toBe('yellow');
  });

  it('should return correct format for SUCCESS type', () => {
    const format = getMessageFormat(MessageType.SUCCESS);
    expect(format.prefix).toBe('✓ ');
    expect(format.color).toBe('green');
  });

  it('should return correct format for INFO type', () => {
    const format = getMessageFormat(MessageType.INFO);
    expect(format.prefix).toBe('ℹ️  ');
    expect(format.color).toBe('cyan');
  });

  it('should return correct format for CEREMONY_HEADER type', () => {
    const format = getMessageFormat(MessageType.CEREMONY_HEADER);
    expect(format.prefix).toBe('');
    expect(format.color).toBe('cyan');
  });

  it('should return correct format for USER_OUTPUT type', () => {
    const format = getMessageFormat(MessageType.USER_OUTPUT);
    expect(format.prefix).toBe('');
    expect(format.color).toBe('white');
  });

  it('should return correct format for DEBUG type', () => {
    const format = getMessageFormat(MessageType.DEBUG);
    expect(format.prefix).toBe('[DEBUG] ');
    expect(format.color).toBe('gray');
  });

  it('should return default format for unknown type', () => {
    const format = getMessageFormat('UNKNOWN');
    expect(format.prefix).toBe('');
    expect(format.color).toBe('white');
  });

  it('should return default format for types without explicit format', () => {
    const format = getMessageFormat(MessageType.COMMAND_START);
    expect(format.prefix).toBe('');
    expect(format.color).toBe('white');
  });
});
