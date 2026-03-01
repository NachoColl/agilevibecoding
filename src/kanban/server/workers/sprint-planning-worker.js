/**
 * Sprint Planning Worker
 * Forked by CeremonyService.runSprintPlanningInProcess().
 * Communicates with the parent via IPC (process.send / process.on('message')).
 *
 * Parent → Worker:
 *   { type: 'init' }
 *   { type: 'pause' }
 *   { type: 'resume' }
 *   { type: 'cancel' }
 *
 * Worker → Parent:
 *   { type: 'progress', message }
 *   { type: 'substep', substep, meta }
 *   { type: 'detail', detail }
 *   { type: 'paused' }
 *   { type: 'resumed' }
 *   { type: 'complete', result }
 *   { type: 'cancelled' }
 *   { type: 'error', error }
 */

import { ProjectInitiator } from '../../../cli/init.js';

let _paused = false;
let _cancelled = false;
let _costThreshold = null;

// Parent server stopped — exit rather than running as an orphan.
process.on('disconnect', () => {
  _cancelled = true;
  // Give the current LLM call up to 5s to finish, then hard-exit.
  setTimeout(() => process.exit(1), 5000).unref();
});

process.on('message', async (msg) => {
  if (msg.type === 'init') {
    _costThreshold = msg.costThreshold ?? null;
    run();
  } else if (msg.type === 'pause') {
    _paused = true;
    process.send({ type: 'paused' });
  } else if (msg.type === 'resume') {
    _paused = false;
    process.send({ type: 'resumed' });
  } else if (msg.type === 'cancel') {
    _cancelled = true;
  }
});

async function run() {
  try {
    const initiator = new ProjectInitiator();

    const progressCallback = async (msg, substep, meta) => {
      if (_cancelled) throw new Error('CEREMONY_CANCELLED');
      while (_paused) {
        await new Promise(r => setTimeout(r, 200));
        if (_cancelled) throw new Error('CEREMONY_CANCELLED');
      }
      if (msg)          process.send({ type: 'progress', message: msg });
      if (substep)      process.send({ type: 'substep',  substep, meta: meta || {} });
      if (meta?.detail) process.send({ type: 'detail',   detail: meta.detail });
    };

    const result = await initiator.sprintPlanningWithCallback(progressCallback, { costThreshold: _costThreshold });
    process.send({ type: 'complete', result });
    process.exit(0);
  } catch (err) {
    if (err.message === 'CEREMONY_CANCELLED') {
      process.send({ type: 'cancelled' });
    } else if (err.message?.startsWith('COST_LIMIT_EXCEEDED:')) {
      const cost = parseFloat(err.message.split(':')[1]) || 0;
      process.send({ type: 'cost-limit', cost, threshold: _costThreshold });
    } else {
      process.send({ type: 'error', error: err.message });
    }
    process.exit(0);
  }
}
