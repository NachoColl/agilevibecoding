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
 *   { type: 'selection-confirmed', selectedEpicIds, selectedStoryIds }
 *
 * Worker → Parent:
 *   { type: 'progress', message }
 *   { type: 'substep', substep, meta }
 *   { type: 'detail', detail }
 *   { type: 'paused' }
 *   { type: 'resumed' }
 *   { type: 'decomposition-complete', hierarchy }
 *   { type: 'hierarchy-written', epicCount, storyCount }
 *   { type: 'complete', result }
 *   { type: 'cancelled' }
 *   { type: 'error', error }
 */

import { ProjectInitiator } from '../../../cli/init.js';
import { CommandLogger } from '../../../cli/command-logger.js';
import { readFileSync } from 'fs';
import { join } from 'path';

function _isQuotaOrRateLimit(msg) {
  const m = (msg || '').toLowerCase();
  return m.includes('429') || m.includes('quota') || m.includes('rate limit') ||
    m.includes('resource exhausted') || m.includes('resource_exhausted') ||
    m.includes('too many requests') ||
    // Anthropic credit-balance exhausted (400 invalid_request_error)
    m.includes('credit balance is too low') || m.includes('credit balance') ||
    m.includes('billing') || m.includes('insufficient_quota') ||
    // Transient connection errors — surface as resumable to allow provider switch
    m.includes('connection error') || m.includes('econnreset') ||
    m.includes('econnrefused') || m.includes('network error') || m.includes('fetch failed');
}

function _getCurrentStageInfo(stageName) {
  try {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), '.avc', 'avc.json'), 'utf8'));
    const ceremony = cfg.settings?.ceremonies?.find(c => c.name === 'sprint-planning');
    const stage = ceremony?.stages?.[stageName];
    return {
      provider: stage?.provider || ceremony?.provider || 'unknown',
      model: stage?.model || ceremony?.defaultModel || 'unknown',
    };
  } catch { return { provider: 'unknown', model: 'unknown' }; }
}

let _paused = false;
let _cancelled = false;
let _costThreshold = null;
let _waitingCostLimit = false;
let _waitingSelection = false;
let _selectionResult = null;
let _waitingQuota = false;
let _quotaResolution = null;

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
  } else if (msg.type === 'cost-limit-continue') {
    _waitingCostLimit = false;
  } else if (msg.type === 'quota-continue') {
    _quotaResolution = msg.newProvider
      ? { newProvider: msg.newProvider, newModel: msg.newModel }
      : null;
    _waitingQuota = false;
  } else if (msg.type === 'selection-confirmed') {
    _selectionResult = { selectedEpicIds: msg.selectedEpicIds, selectedStoryIds: msg.selectedStoryIds };
    _waitingSelection = false;
  }
});

async function run() {
  const logger = new CommandLogger('sprint-planning', process.cwd());
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

    const selectionCallback = async (hierarchy) => {
      _waitingSelection = true;
      _selectionResult = null;
      process.send({ type: 'decomposition-complete', hierarchy });
      while (_waitingSelection) {
        await new Promise(r => setTimeout(r, 200));
        if (_cancelled) throw new Error('CEREMONY_CANCELLED');
      }
      return _selectionResult;
    };

    const hierarchyWrittenCallback = async ({ epicCount, storyCount }) => {
      process.send({ type: 'hierarchy-written', epicCount, storyCount });
    };

    const quotaExceededCallback = async ({ validatorName, errMsg, provider, model }) => {
      _waitingQuota = true;
      _quotaResolution = null;
      process.send({ type: 'quota-limit', validatorName, errMsg, provider, model });
      while (_waitingQuota) {
        await new Promise(r => setTimeout(r, 200));
        if (_cancelled) throw new Error('CEREMONY_CANCELLED');
      }
      return _quotaResolution; // null = retry same; { newProvider, newModel } = switch
    };

    // Outer retry loop: catches quota errors from pre-validator stages (decomposition, etc.)
    // The processor is reconstructed on each retry so it picks up any avc.json model changes.
    let result;
    while (true) {
      try {
        result = await initiator.sprintPlanningWithCallback(progressCallback, {
          costThreshold: _costThreshold,
          costLimitReachedCallback,
          selectionCallback,
          hierarchyWrittenCallback,
          quotaExceededCallback,
        });
        break; // success — exit retry loop
      } catch (err) {
        if (err.message === 'CEREMONY_CANCELLED') throw err;
        const errMsg = err.message || '';
        if (_isQuotaOrRateLimit(errMsg)) {
          // Quota error from a stage not covered by the validator callback (e.g. decomposition).
          // Pause and wait for user to add credits or switch model via Configure Models.
          const { provider, model } = _getCurrentStageInfo('decomposition');
          await quotaExceededCallback({ validatorName: 'decomposition', errMsg: errMsg.split('\n')[0], provider, model });
          // Retry — processor reconstructs and re-reads avc.json (picks up any model changes).
          continue;
        }
        throw err; // non-quota error: propagate to outer catch
      }
    }
    logger.stop();
    process.send({ type: 'complete', result });

    // Non-fatal docs sync after ceremony completes
    try {
      const { DocsSyncProcessor } = await import('../../../cli/docs-sync.js');
      const syncer = new DocsSyncProcessor(process.cwd());
      const { existsSync } = await import('fs');
      if (existsSync(syncer.docsDir)) {
        await syncer.sync();
        process.send({ type: 'docs-synced' });
      }
    } catch (e) {
      process.send({ type: 'docs-sync-failed', error: e.message });
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
