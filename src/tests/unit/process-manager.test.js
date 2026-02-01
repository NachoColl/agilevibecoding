import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackgroundProcessManager } from '../../cli/process-manager.js';
import { EventEmitter } from 'events';

describe('BackgroundProcessManager', () => {
  let manager;

  beforeEach(() => {
    manager = new BackgroundProcessManager();
  });

  afterEach(() => {
    // Clean up any running processes
    manager.stopAll();
  });

  describe('constructor', () => {
    it('initializes with empty process map', () => {
      expect(manager.processes.size).toBe(0);
    });

    it('sets default maxOutputLines to 500', () => {
      expect(manager.maxOutputLines).toBe(500);
    });

    it('extends EventEmitter', () => {
      expect(manager).toBeInstanceOf(EventEmitter);
    });
  });

  describe('startProcess()', () => {
    it('creates and tracks a new process', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'echo',
        args: ['hello'],
        cwd: process.cwd()
      });

      expect(processId).toBeTruthy();
      expect(manager.processes.has(processId)).toBe(true);
    });

    it('generates unique IDs with timestamp', () => {
      const id1 = manager.startProcess({
        name: 'Test Process',
        command: 'echo',
        args: ['1'],
        cwd: process.cwd()
      });

      const id2 = manager.startProcess({
        name: 'Test Process',
        command: 'echo',
        args: ['2'],
        cwd: process.cwd()
      });

      expect(id1).not.toBe(id2);
    });

    it('sets initial status to running', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'echo',
        args: ['hello'],
        cwd: process.cwd()
      });

      const proc = manager.getProcess(processId);
      expect(proc.status).toBe('running');
    });

    it('stores process metadata', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'echo',
        args: ['hello', 'world'],
        cwd: process.cwd()
      });

      const proc = manager.getProcess(processId);
      expect(proc.name).toBe('Test Process');
      expect(proc.command).toBe('echo hello world');
      expect(proc.cwd).toBe(process.cwd());
      expect(proc.pid).toBeTruthy();
      expect(proc.startTime).toBeTruthy();
    });

    it('emits process-started event', () => {
      return new Promise((resolve) => {
        manager.once('process-started', ({ id, name }) => {
          expect(id).toBeTruthy();
          expect(name).toBe('Test Process');
          resolve();
        });

        manager.startProcess({
          name: 'Test Process',
          command: 'echo',
          args: ['hello'],
          cwd: process.cwd()
        });
      });
    });
  });

  describe('stopProcess()', () => {
    it('stops a running process', () => {
      return new Promise((resolve) => {
        const processId = manager.startProcess({
          name: 'Test Process',
          command: 'sleep',
          args: ['10'],
          cwd: process.cwd()
        });

        setTimeout(() => {
          const stopped = manager.stopProcess(processId);
          expect(stopped).toBe(true);

          const proc = manager.getProcess(processId);
          expect(proc.status).toBe('stopped');
          resolve();
        }, 100);
      });
    });

    it('returns false for non-existent process', () => {
      const stopped = manager.stopProcess('non-existent-id');
      expect(stopped).toBe(false);
    });

    it('emits process-stopped event', () => {
      return new Promise((resolve) => {
        const processId = manager.startProcess({
          name: 'Test Process',
          command: 'sleep',
          args: ['10'],
          cwd: process.cwd()
        });

        manager.once('process-stopped', ({ id, name }) => {
          expect(id).toBe(processId);
          expect(name).toBe('Test Process');
          resolve();
        });

        setTimeout(() => {
          manager.stopProcess(processId);
        }, 100);
      });
    });
  });

  describe('getProcess()', () => {
    it('retrieves process by ID', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'echo',
        args: ['hello'],
        cwd: process.cwd()
      });

      const proc = manager.getProcess(processId);
      expect(proc).toBeTruthy();
      expect(proc.id).toBe(processId);
    });

    it('returns undefined for non-existent ID', () => {
      const proc = manager.getProcess('non-existent');
      expect(proc).toBeUndefined();
    });
  });

  describe('getAllProcesses()', () => {
    it('returns empty array when no processes', () => {
      const processes = manager.getAllProcesses();
      expect(processes).toEqual([]);
    });

    it('returns all processes', () => {
      manager.startProcess({
        name: 'Process 1',
        command: 'echo',
        args: ['1'],
        cwd: process.cwd()
      });

      manager.startProcess({
        name: 'Process 2',
        command: 'echo',
        args: ['2'],
        cwd: process.cwd()
      });

      const processes = manager.getAllProcesses();
      expect(processes.length).toBe(2);
    });
  });

  describe('getRunningProcesses()', () => {
    it('filters only running processes', () => {
      return new Promise((resolve) => {
        const id1 = manager.startProcess({
          name: 'Running Process',
          command: 'sleep',
          args: ['10'],
          cwd: process.cwd()
        });

        const id2 = manager.startProcess({
          name: 'Quick Process',
          command: 'echo',
          args: ['done'],
          cwd: process.cwd()
        });

        setTimeout(() => {
          manager.stopProcess(id1);

          setTimeout(() => {
            const running = manager.getRunningProcesses();
            // Quick process should have exited by now
            expect(running.length).toBeLessThanOrEqual(1);
            resolve();
          }, 100);
        }, 100);
      });
    });
  });

  describe('appendOutput()', () => {
    it('adds output lines to process', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'echo',
        args: ['hello'],
        cwd: process.cwd()
      });

      manager.appendOutput(processId, 'stdout', 'Line 1\nLine 2\n');

      const proc = manager.getProcess(processId);
      expect(proc.output.length).toBeGreaterThan(0);
    });

    it('trims to maxOutputLines', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'echo',
        args: ['hello'],
        cwd: process.cwd()
      });

      // Add more than maxOutputLines
      for (let i = 0; i < 600; i++) {
        manager.appendOutput(processId, 'stdout', `Line ${i}\n`);
      }

      const proc = manager.getProcess(processId);
      expect(proc.output.length).toBeLessThanOrEqual(manager.maxOutputLines);
    });

    it('emits output event', () => {
      return new Promise((resolve) => {
        const processId = manager.startProcess({
          name: 'Test Process',
          command: 'echo',
          args: ['hello'],
          cwd: process.cwd()
        });

        manager.once('output', ({ id, type, text }) => {
          expect(id).toBe(processId);
          expect(type).toBe('stdout');
          resolve();
        });

        manager.appendOutput(processId, 'stdout', 'Test output\n');
      });
    });
  });

  describe('handleProcessExit()', () => {
    it('updates status to exited for code 0', () => {
      return new Promise((resolve) => {
        const processId = manager.startProcess({
          name: 'Test Process',
          command: 'echo',
          args: ['hello'],
          cwd: process.cwd()
        });

        manager.once('process-exited', ({ status }) => {
          const proc = manager.getProcess(processId);
          expect(proc.status).toBe('exited');
          expect(proc.exitCode).toBe(0);
          resolve();
        });
      });
    });

    it('updates status to crashed for non-zero code', () => {
      return new Promise((resolve) => {
        const processId = manager.startProcess({
          name: 'Test Process',
          command: 'node',
          args: ['-e', 'process.exit(1)'],
          cwd: process.cwd()
        });

        manager.once('process-exited', ({ status }) => {
          expect(status).toBe('crashed');
          resolve();
        });
      });
    });
  });

  describe('cleanupFinished()', () => {
    it('removes exited and crashed processes', () => {
      return new Promise((resolve) => {
        const id1 = manager.startProcess({
          name: 'Quick Process',
          command: 'echo',
          args: ['done'],
          cwd: process.cwd()
        });

        const id2 = manager.startProcess({
          name: 'Long Process',
          command: 'sleep',
          args: ['10'],
          cwd: process.cwd()
        });

        setTimeout(() => {
          const cleaned = manager.cleanupFinished();
          expect(cleaned).toBeGreaterThanOrEqual(0);

          // Long process should still exist
          expect(manager.getProcess(id2)).toBeTruthy();
          resolve();
        }, 500);
      });
    });
  });

  describe('stopAll()', () => {
    it('stops all running processes', () => {
      return new Promise((resolve) => {
        manager.startProcess({
          name: 'Process 1',
          command: 'sleep',
          args: ['10'],
          cwd: process.cwd()
        });

        manager.startProcess({
          name: 'Process 2',
          command: 'sleep',
          args: ['10'],
          cwd: process.cwd()
        });

        setTimeout(() => {
          const stopped = manager.stopAll();
          expect(stopped).toBe(2);

          const running = manager.getRunningProcesses();
          expect(running.length).toBe(0);
          resolve();
        }, 100);
      });
    });
  });

  describe('getUptime()', () => {
    it('returns uptime in seconds', () => {
      return new Promise((resolve) => {
        const processId = manager.startProcess({
          name: 'Test Process',
          command: 'sleep',
          args: ['10'],
          cwd: process.cwd()
        });

        setTimeout(() => {
          const uptime = manager.getUptime(processId);
          expect(uptime).toBeGreaterThanOrEqual(0);
          expect(uptime).toBeLessThan(2);
          manager.stopProcess(processId);
          resolve();
        }, 500);
      });
    });

    it('returns 0 for non-existent process', () => {
      const uptime = manager.getUptime('non-existent');
      expect(uptime).toBe(0);
    });
  });

  describe('formatUptime()', () => {
    it('formats seconds correctly', () => {
      expect(manager.formatUptime(30)).toBe('30s');
      expect(manager.formatUptime(90)).toBe('1m 30s');
      expect(manager.formatUptime(3665)).toBe('1h 1m');
    });
  });

  describe('sanitizeName()', () => {
    it('converts to lowercase and replaces special characters', () => {
      expect(manager.sanitizeName('Test Process')).toBe('test-process');
      expect(manager.sanitizeName('My@Cool#Server!')).toBe('my-cool-server');
    });
  });

  describe('findProcessByPid()', () => {
    it('finds process by PID', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'sleep',
        args: ['10'],
        cwd: process.cwd()
      });

      const processMetadata = manager.getProcess(processId);
      const foundProcess = manager.findProcessByPid(processMetadata.pid);

      expect(foundProcess).toBeTruthy();
      expect(foundProcess.id).toBe(processId);
      expect(foundProcess.pid).toBe(processMetadata.pid);

      manager.stopProcess(processId);
    });

    it('returns null for non-existent PID', () => {
      const foundProcess = manager.findProcessByPid(999999);
      expect(foundProcess).toBeNull();
    });
  });

  describe('removeProcessByPid()', () => {
    it('removes process by PID', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'sleep',
        args: ['10'],
        cwd: process.cwd()
      });

      const processMetadata = manager.getProcess(processId);
      const pid = processMetadata.pid;

      expect(manager.processes.has(processId)).toBe(true);

      const removed = manager.removeProcessByPid(pid);

      expect(removed).toBe(true);
      expect(manager.processes.has(processId)).toBe(false);
    });

    it('returns false for non-existent PID', () => {
      const removed = manager.removeProcessByPid(999999);
      expect(removed).toBe(false);
    });

    it('emits process-removed event', () => {
      return new Promise((resolve) => {
        const processId = manager.startProcess({
          name: 'Test Process',
          command: 'sleep',
          args: ['10'],
          cwd: process.cwd()
        });

        const processMetadata = manager.getProcess(processId);
        const pid = processMetadata.pid;

        manager.on('process-removed', (data) => {
          expect(data.id).toBe(processId);
          expect(data.pid).toBe(pid);
          resolve();
        });

        manager.removeProcessByPid(pid);
      });
    });
  });

  describe('cleanupFinished() - stopped processes', () => {
    it('removes stopped processes', () => {
      const processId = manager.startProcess({
        name: 'Test Process',
        command: 'sleep',
        args: ['10'],
        cwd: process.cwd()
      });

      expect(manager.processes.has(processId)).toBe(true);

      manager.stopProcess(processId);
      expect(manager.processes.has(processId)).toBe(true);
      expect(manager.getProcess(processId).status).toBe('stopped');

      const cleaned = manager.cleanupFinished();

      expect(cleaned).toBe(1);
      expect(manager.processes.has(processId)).toBe(false);
    });
  });
});
