import path from 'path';
import fs from 'fs';
import { LLMProvider } from '../../../cli/llm-provider.js';
import { EpicStoryValidator } from '../../../cli/epic-story-validator.js';
import { loadAgent } from '../../../cli/agent-loader.js';
import { KanbanLogger } from '../utils/kanban-logger.js';

/**
 * WorkItemRefineService
 * Orchestrates AI-powered refinement of epics and stories:
 *   - Principal model generates improved item (description, features/acceptance, dependencies)
 *   - EpicStoryValidator runs domain validators + solvers on the result
 *   - For epics: impact-check on all child stories + gap analysis for missing stories
 * Results are proposed changes — applyChanges() writes them to disk after user approval.
 */
export class WorkItemRefineService {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.avcPath = path.join(projectRoot, '.avc');
    this.websocket = null; // set after WebSocket is initialised
  }

  /**
   * Start an async refinement job.
   * Returns jobId immediately; broadcasts refine:progress / refine:complete / refine:error.
   * @param {string} itemId
   * @param {object} item - cleaned work item (from API, includes context field)
   * @param {object} options - { refinementRequest, selectedIssues, modelId, provider, validatorModelId, validatorProvider }
   * @returns {string} jobId
   */
  async startRefine(itemId, item, options) {
    const jobId = `refine-${Date.now()}`;

    // Load .env for API keys
    const { default: dotenv } = await import('dotenv');
    dotenv.config({ path: path.join(this.projectRoot, '.env') });

    // Fire-and-forget — WS events carry progress and results
    this._runRefine(jobId, itemId, item, options).catch((err) => {
      console.error(`[RefineService] _runRefine failed for ${itemId}:`, err.message);
      this.websocket?.broadcastRefineError(itemId, jobId, err.message);
    });

    return jobId;
  }

  // ── Private: main refinement pipeline ──────────────────────────────────────

  async _runRefine(jobId, itemId, item, options) {
    const {
      refinementRequest = '',
      selectedIssues = [],
      modelId,
      provider,
      validatorModelId,
      validatorProvider,
    } = options;

    const log = new KanbanLogger('refine', this.projectRoot);
    const emit = (message) => this.websocket?.broadcastRefineProgress(itemId, jobId, message);

    log.info('_runRefine() started', { jobId, itemId, type: item.type, provider, modelId });

    const isEpic = item.type === 'epic';

    // Load principal model agent
    const principalAgent = loadAgent(
      isEpic ? 'refiner-epic.md' : 'refiner-story.md',
      this.projectRoot
    );

    // Create LLM providers
    const principalLLM = await LLMProvider.create(provider, modelId);
    const validatorLLM = await LLMProvider.create(validatorProvider, validatorModelId);

    // Build issues context string
    const issuesText =
      selectedIssues.length > 0
        ? selectedIssues
            .map(
              (iss, i) =>
                `${i + 1}. [${(iss.severity || 'unknown').toUpperCase()}] ${iss.description || ''}` +
                (iss.suggestion ? `\n   Suggestion: ${iss.suggestion}` : '')
            )
            .join('\n')
        : 'No specific issues selected — improve overall quality based on your expertise.';

    // ── Step 1: Principal model generates refined item ────────────────────────
    emit('Calling principal model to generate refinement…');
    const principalPrompt = buildPrincipalPrompt(item, issuesText, refinementRequest);
    let refined = await principalLLM.generateJSON(principalPrompt, principalAgent);
    log.info('Principal model responded', { refinedId: refined?.id });

    if (!refined || refined.id !== item.id) {
      throw new Error(
        `Principal model returned invalid item — expected id "${item.id}", got "${refined?.id}"`
      );
    }

    // ── Step 2: Validate the refined item (validator + solver loop) ───────────
    emit('Running validators on refined item…');
    const validator = new EpicStoryValidator(validatorLLM, null, null, false, null);
    let validationResult = null;

    if (isEpic) {
      const context = item.context || '';
      // validateEpic mutates refined in place (description, features, dependencies, metadata.validationResult)
      validationResult = await validator.validateEpic(refined, context);
    } else {
      const parentEpic = await this._loadParentEpic(item);
      const context = item.context || '';
      validationResult = await validator.validateStory(refined, context, parentEpic || { name: '', domain: '', features: [] });
    }

    const score = validationResult?.averageScore ?? 0;
    emit(
      `Validation score: ${score}/100 — ${validationResult?.readyToPublish ? 'passed' : 'needs improvement'}`
    );
    log.info('Validation complete', { score, readyToPublish: validationResult?.readyToPublish });

    // ── Step 3 (epic only): Child story impact + gap analysis ─────────────────
    let storyImpacts = [];

    if (isEpic) {
      const epicDir = this._findItemDir(itemId);
      const existingStories = epicDir ? await this._loadChildStories(epicDir) : [];

      emit(`Checking impact on ${existingStories.length} existing stories…`);
      const updateImpacts = await this._checkChildImpacts(
        item, refined, existingStories, principalLLM, emit, log
      );

      emit('Checking for capability gaps in epic scope…');
      const newStories = await this._identifyMissingStories(
        refined, existingStories, principalLLM, emit, log
      );

      storyImpacts = [
        ...updateImpacts.map((r) => ({ type: 'update', ...r })),
        ...newStories.map((s) => ({ type: 'new', storyId: null, ...s })),
      ];

      const impactedCount = updateImpacts.filter((r) => r.impacted).length;
      emit(
        `Impact analysis complete: ${impactedCount} stories need updates, ${newStories.length} new stories proposed`
      );
    }

    // ── Broadcast complete ────────────────────────────────────────────────────
    const result = { jobId, itemId, originalItem: item, proposedItem: refined, validationResult, storyImpacts };
    this.websocket?.broadcastRefineComplete(itemId, jobId, result);
    log.info('_runRefine() completed', { jobId, itemId, storyImpactCount: storyImpacts.length });
  }

  // ── Private: child impact check ────────────────────────────────────────────

  async _checkChildImpacts(originalEpic, refinedEpic, stories, principalLLM, emit, log) {
    const impactAgent = loadAgent('impact-checker-story.md', this.projectRoot);
    const impacts = [];

    for (const story of stories) {
      const prompt = buildImpactCheckPrompt(originalEpic, refinedEpic, story);
      try {
        const result = await principalLLM.generateJSON(prompt, impactAgent);
        if (result?.impacted) {
          emit(`  Story "${story.name}" — impact detected`);
          impacts.push({
            storyId: story.id,
            storyName: story.name,
            impacted: true,
            changesNeeded: result.changesNeeded || [],
            proposedStory: result.proposedStory || null,
          });
        } else {
          impacts.push({ storyId: story.id, storyName: story.name, impacted: false });
        }
        log.info('Impact check', { storyId: story.id, impacted: !!result?.impacted });
      } catch (err) {
        log.error('Impact check failed', { storyId: story.id, error: err.message });
        impacts.push({ storyId: story.id, storyName: story.name, impacted: false });
      }
    }

    return impacts;
  }

  // ── Private: gap analysis ──────────────────────────────────────────────────

  async _identifyMissingStories(refinedEpic, existingStories, principalLLM, emit, log) {
    try {
      const gapAgent = loadAgent('gap-checker-epic.md', this.projectRoot);
      const prompt = buildGapCheckPrompt(refinedEpic, existingStories);
      const result = await principalLLM.generateJSON(prompt, gapAgent);

      const gaps = result?.gaps || [];
      for (const gap of gaps) {
        if (gap.proposedStory) {
          emit(`  Gap: "${gap.missingFeature}" — proposing new story`);
        }
      }
      log.info('Gap analysis complete', { gapCount: gaps.length });

      return gaps.map((g) => ({
        storyName: g.proposedStory?.name || g.missingFeature,
        missingFeature: g.missingFeature,
        proposedStory: g.proposedStory,
      }));
    } catch (err) {
      log.error('Gap analysis failed', { error: err.message });
      return [];
    }
  }

  // ── Public: apply accepted changes to disk ─────────────────────────────────

  /**
   * Write accepted refinement changes to the filesystem.
   * storyChanges: [{ type: 'update'|'new', storyId?, proposedStory }] — only accepted ones
   */
  async applyChanges(itemId, proposedItem, storyChanges = []) {
    const isEpic = proposedItem.type === 'epic';
    const itemDir = this._findItemDir(itemId);
    if (!itemDir) throw new Error(`Item directory not found for "${itemId}"`);

    const workJsonPath = path.join(itemDir, 'work.json');
    const existing = JSON.parse(fs.readFileSync(workJsonPath, 'utf8'));

    // Build updated item (safe fields only)
    const updated = {
      ...existing,
      description:  proposedItem.description  ?? existing.description,
      features:     proposedItem.features     ?? existing.features,
      acceptance:   proposedItem.acceptance   ?? existing.acceptance,
      dependencies: proposedItem.dependencies ?? existing.dependencies,
      metadata: {
        ...existing.metadata,
        validationResult:
          proposedItem.metadata?.validationResult ?? existing.metadata?.validationResult,
        refinedAt: new Date().toISOString(),
      },
    };

    if (isEpic) {
      // Apply story updates (existing stories)
      for (const change of storyChanges.filter((c) => c.type === 'update' && c.proposedStory)) {
        const storyDir = this._findItemDir(change.storyId);
        if (!storyDir) {
          console.warn(`[RefineService] Story dir not found for ${change.storyId} — skipping`);
          continue;
        }
        const storyWorkJsonPath = path.join(storyDir, 'work.json');
        const existingStory = JSON.parse(fs.readFileSync(storyWorkJsonPath, 'utf8'));
        const updatedStory = {
          ...existingStory,
          description:  change.proposedStory.description  ?? existingStory.description,
          acceptance:   change.proposedStory.acceptance   ?? existingStory.acceptance,
          dependencies: change.proposedStory.dependencies ?? existingStory.dependencies,
          metadata: { ...existingStory.metadata, refinedAt: new Date().toISOString() },
        };
        fs.writeFileSync(storyWorkJsonPath, JSON.stringify(updatedStory, null, 2), 'utf8');
      }

      // Create new stories (gap analysis results)
      const newStoryIds = [];
      for (const change of storyChanges.filter((c) => c.type === 'new' && c.proposedStory)) {
        const newId = this._nextStoryId(itemId, itemDir);
        const newStoryDir = path.join(itemDir, newId);
        fs.mkdirSync(newStoryDir, { recursive: true });

        const newStoryWorkJson = {
          id: newId,
          name: change.proposedStory.name,
          type: 'story',
          userType: change.proposedStory.userType || 'user',
          description: change.proposedStory.description || '',
          acceptance: change.proposedStory.acceptance || [],
          status: 'planned',
          dependencies: change.proposedStory.dependencies || [],
          children: [],
          metadata: {
            created: new Date().toISOString(),
            ceremony: 'refinement',
          },
        };
        fs.writeFileSync(
          path.join(newStoryDir, 'work.json'),
          JSON.stringify(newStoryWorkJson, null, 2),
          'utf8'
        );
        fs.writeFileSync(
          path.join(newStoryDir, 'doc.md'),
          `# ${change.proposedStory.name}\n\n${change.proposedStory.description || ''}\n`,
          'utf8'
        );
        newStoryIds.push(newId);
      }

      // Add new story ids to epic's children[]
      if (newStoryIds.length > 0) {
        updated.children = [...(updated.children || []), ...newStoryIds];
      }
    }

    // Write epic/story work.json last (after all children are created)
    fs.writeFileSync(workJsonPath, JSON.stringify(updated, null, 2), 'utf8');
  }

  // ── Private: filesystem helpers ────────────────────────────────────────────

  _nextStoryId(epicId, epicDir) {
    let maxNum = 0;
    try {
      const entries = fs.readdirSync(epicDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const parts = entry.name.split('-');
        const num = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    } catch (_) {}
    return `${epicId}-${String(maxNum + 1).padStart(4, '0')}`;
  }

  _findItemDir(id) {
    const projectPath = path.join(this.avcPath, 'project');
    return this._findDirById(projectPath, id);
  }

  _findDirById(dir, id) {
    try {
      const workJsonPath = path.join(dir, 'work.json');
      if (fs.existsSync(workJsonPath)) {
        const data = JSON.parse(fs.readFileSync(workJsonPath, 'utf8'));
        if (data.id === id) return dir;
      }
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const found = this._findDirById(path.join(dir, entry.name), id);
          if (found) return found;
        }
      }
    } catch (_) {}
    return null;
  }

  async _loadParentEpic(storyItem) {
    const parentId = storyItem.id.split('-').slice(0, -1).join('-');
    const parentDir = this._findItemDir(parentId);
    if (!parentDir) return null;
    try {
      return JSON.parse(fs.readFileSync(path.join(parentDir, 'work.json'), 'utf8'));
    } catch (_) {
      return null;
    }
  }

  async _loadChildStories(epicDir) {
    const stories = [];
    try {
      const entries = fs.readdirSync(epicDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const workJsonPath = path.join(epicDir, entry.name, 'work.json');
        if (!fs.existsSync(workJsonPath)) continue;
        try {
          const data = JSON.parse(fs.readFileSync(workJsonPath, 'utf8'));
          if (data.type === 'story') {
            try {
              const ctxPath = path.join(epicDir, entry.name, 'context.md');
              data.context = fs.existsSync(ctxPath)
                ? fs.readFileSync(ctxPath, 'utf8')
                : '';
            } catch (_) {
              data.context = '';
            }
            stories.push(data);
          }
        } catch (_) {}
      }
    } catch (_) {}
    return stories;
  }
}

// ── Prompt builders ───────────────────────────────────────────────────────────

function buildPrincipalPrompt(item, issuesText, refinementRequest) {
  const isEpic = item.type === 'epic';
  if (isEpic) {
    return `# Epic to Refine

**Epic ID:** ${item.id}
**Epic Name:** ${item.name}
**Domain:** ${item.domain || 'general'}
**Current Description:** ${item.description || '(none)'}

**Current Features:**
${(item.features || []).map((f) => `- ${f}`).join('\n') || '(none)'}

**Current Dependencies:**
${(item.dependencies || []).length > 0 ? item.dependencies.join(', ') : 'None'}

## Validation Issues to Address:

${issuesText}

## User Refinement Request:

${refinementRequest?.trim() || 'No specific request — improve based on validation issues above.'}

Refine this Epic to address all issues and the user request. Return complete improved Epic JSON.`;
  } else {
    return `# Story to Refine

**Story ID:** ${item.id}
**Story Name:** ${item.name}
**User Type:** ${item.userType || 'user'}
**Current Description:** ${item.description || '(none)'}

**Current Acceptance Criteria:**
${(item.acceptance || []).map((ac, i) => `${i + 1}. ${ac}`).join('\n') || '(none)'}

**Current Dependencies:**
${(item.dependencies || []).length > 0 ? item.dependencies.join(', ') : 'None'}

## Validation Issues to Address:

${issuesText}

## User Refinement Request:

${refinementRequest?.trim() || 'No specific request — improve based on validation issues above.'}

Refine this Story to address all issues and the user request. Return complete improved Story JSON.`;
  }
}

function buildImpactCheckPrompt(originalEpic, refinedEpic, story) {
  return `# Epic Change Impact Analysis

## Original Epic
**ID:** ${originalEpic.id}
**Description:** ${originalEpic.description || '(none)'}
**Features:**
${(originalEpic.features || []).map((f) => `- ${f}`).join('\n') || '(none)'}

## Refined Epic (proposed changes)
**Description:** ${refinedEpic.description || '(none)'}
**Features:**
${(refinedEpic.features || []).map((f) => `- ${f}`).join('\n') || '(none)'}

## Story to Assess
**Story ID:** ${story.id}
**Story Name:** ${story.name}
**Description:** ${story.description || '(none)'}
**Acceptance Criteria:**
${(story.acceptance || []).map((ac, i) => `${i + 1}. ${ac}`).join('\n') || '(none)'}

Analyze whether the epic changes require any updates to this story. Return JSON following your instructions.`;
}

function buildGapCheckPrompt(refinedEpic, existingStories) {
  return `# Epic Coverage Gap Analysis

## Refined Epic
**ID:** ${refinedEpic.id}
**Name:** ${refinedEpic.name}
**Description:** ${refinedEpic.description || '(none)'}
**Features:**
${(refinedEpic.features || []).map((f) => `- ${f}`).join('\n') || '(none)'}

## Existing Stories (ID + name only)
${existingStories.map((s, i) => `${i + 1}. ${s.id} — ${s.name}`).join('\n') || '(no stories yet)'}

Identify any epic features NOT covered by any existing story. Propose new stories for each gap.`;
}
