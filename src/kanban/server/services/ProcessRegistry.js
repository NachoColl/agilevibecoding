import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

/**
 * ProcessRegistry
 * Tracks forked ceremony/CLI processes: status, lightweight log ring-buffer, IPC control.
 */
export class ProcessRegistry extends EventEmitter {
  constructor() {
    super();
    this._processes = new Map(); // processId → ProcessRecord
    this.LOG_CAP = 500;
  }

  /**
   * Allocate a new ProcessRecord (before the child is forked).
   * @returns {object} The new record
   */
  create(type, label) {
    const id = `${type}-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const record = {
      id,
      type,
      label,
      status: 'running',
      startedAt: Date.now(),
      endedAt: null,
      childProcess: null,
      logs: [],
      result: null,
      error: null,
    };
    this._processes.set(id, record);
    this.emit('created', record);
    return record;
  }

  /** Attach the ChildProcess handle after fork(). */
  attach(processId, child) {
    const r = this._processes.get(processId);
    if (r) r.childProcess = child;
  }

  /** Append a log entry (capped at LOG_CAP). */
  appendLog(processId, entry) {
    const r = this._processes.get(processId);
    if (!r) return;
    r.logs.push(entry);
    if (r.logs.length > this.LOG_CAP) r.logs = r.logs.slice(-this.LOG_CAP);
    this.emit('log', processId, entry);
  }

  /** Update status and optional extra fields (result/error). */
  setStatus(processId, status, extra = {}) {
    const r = this._processes.get(processId);
    if (!r) return;
    r.status = status;
    if (['complete', 'error', 'cancelled'].includes(status)) {
      r.endedAt = Date.now();
      r.childProcess = null;
    }
    Object.assign(r, extra);
    this.emit('status', processId, status, r);
  }

  get(id) { return this._processes.get(id) ?? null; }

  /** Alias for get() — processId is used as the map key. */
  getByProcessId(processId) { return this.get(processId); }

  /** All records as plain DTOs (no ChildProcess reference). */
  list() { return [...this._processes.values()].map(r => this._dto(r)); }

  getDTO(id) {
    const r = this._processes.get(id);
    return r ? this._dto(r) : null;
  }

  /** Send cancel IPC; force-kill after 5 s if still alive. */
  kill(id) {
    const r = this._processes.get(id);
    if (!r?.childProcess) return false;
    try { r.childProcess.send({ type: 'cancel' }); } catch (_) {}
    setTimeout(() => { try { r.childProcess?.kill('SIGTERM'); } catch (_) {} }, 5000);
    return true;
  }

  pause(id) {
    const r = this._processes.get(id);
    if (r?.childProcess) { try { r.childProcess.send({ type: 'pause' }); } catch (_) {} return true; }
    return false;
  }

  resume(id) {
    const r = this._processes.get(id);
    if (r?.childProcess) { try { r.childProcess.send({ type: 'resume' }); } catch (_) {} return true; }
    return false;
  }

  /** Remove all finished records (complete/error/cancelled). */
  clearCompleted() {
    for (const [id, r] of this._processes) {
      if (['complete', 'error', 'cancelled'].includes(r.status)) {
        this._processes.delete(id);
      }
    }
  }

  _dto(r) {
    return {
      id: r.id,
      type: r.type,
      label: r.label,
      status: r.status,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      result: r.result,
      error: r.error,
      // logs are NOT included — ceremony stores accumulate via WS events
    };
  }
}
