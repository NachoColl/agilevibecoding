/**
 * Sponsor Call Worker
 * Forked by CeremonyService.runSponsorCallInProcess().
 * Same IPC protocol as sprint-planning-worker.js.
 * Receives `requirements` in the init message.
 */

import { ProjectInitiator } from '../../../cli/init.js';
import { CommandLogger } from '../../../cli/command-logger.js';

let _paused = false;
let _cancelled = false;
let _requirements = null;
let _costThreshold = null;
let _waitingCostLimit = false;

// Parent server stopped — exit rather than running as an orphan.
process.on('disconnect', () => {
  _cancelled = true;
  // Give the current LLM call up to 5s to finish, then hard-exit.
  setTimeout(() => process.exit(1), 5000).unref();
});

process.on('message', async (msg) => {
  if (msg.type === 'init') {
    _requirements = msg.requirements;
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
  } else if (msg.type === 'cost-limit-continue') {
    _waitingCostLimit = false;
  }
});

async function run() {
  const logger = new CommandLogger('sponsor-call', process.cwd());
  logger.start();
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

    const costLimitReachedCallback = async (cost) => {
      _waitingCostLimit = true;
      process.send({ type: 'cost-limit', cost, threshold: _costThreshold });
      while (_waitingCostLimit) {
        await new Promise(r => setTimeout(r, 200));
        if (_cancelled) throw new Error('CEREMONY_CANCELLED');
      }
    };

    const result = await initiator.sponsorCallWithAnswers(_requirements, progressCallback, {
      costThreshold: _costThreshold,
      costLimitReachedCallback,
    });
    logger.stop();
    // sponsorCallWithAnswers returns { error: true, message } on validation failure instead of throwing
    if (result?.error === true) {
      process.send({ type: 'error', error: result.message || 'Ceremony failed' });
    } else {
      process.send({ type: 'complete', result });
    }
    process.exit(0);
  } catch (err) {
    logger.stop();
    if (err.message === 'CEREMONY_CANCELLED') {
      process.send({ type: 'cancelled' });
    } else {
      process.send({ type: 'error', error: err.message });
    }
    process.exit(0);
  }
}
