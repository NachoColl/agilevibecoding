import { useState } from 'react';
import { X, Pencil } from 'lucide-react';
import { AgentEditorPopup } from '../settings/AgentEditorPopup';

// Human-readable labels for agent slugs
const AGENT_LABELS = {
  // Sponsor Call
  'mission-scope-generator':         'Mission Scope Generator',
  'mission-scope-validator':         'Mission Scope Validator',
  'suggestion-ux-researcher':        'UX Researcher',
  'suggestion-product-manager':      'Product Manager',
  'suggestion-deployment-architect': 'Deployment Architect',
  'suggestion-technical-architect':  'Technical Architect',
  'suggestion-security-specialist':  'Security Specialist',
  'architecture-recommender':        'Architecture Recommender',
  'question-prefiller':              'Question Prefiller',
  'project-documentation-creator':   'Documentation Creator',
  'validator-documentation':         'Documentation Validator',
  // Sprint Planning
  'epic-story-decomposer':                'Epic/Story Decomposer',
  'validator-selector':                   'Validator Selector',
  'validator-epic-solution-architect':    'Solution Architect (Epic)',
  'validator-epic-developer':             'Developer (Epic)',
  'validator-epic-security':              'Security (Epic)',
  'validator-epic-backend':               'Backend (Epic)',
  'validator-epic-frontend':              'Frontend (Epic)',
  'validator-epic-ux':                    'UX (Epic)',
  'validator-story-developer':            'Developer (Story)',
  'validator-story-qa':                   'QA (Story)',
  'validator-story-test-architect':       'Test Architect (Story)',
  'validator-story-solution-architect':   'Solution Architect (Story)',
  'validator-story-security':             'Security (Story)',
  'validator-story-backend':              'Backend (Story)',
  'validator-story-frontend':             'Frontend (Story)',
  'validator-story-ux':                   'UX (Story)',
  // Sprint Planning — Epic Solvers
  'solver-epic-solution-architect':   'Solver: Solution Architect (Epic)',
  'solver-epic-developer':            'Solver: Developer (Epic)',
  'solver-epic-security':             'Solver: Security (Epic)',
  'solver-epic-devops':               'Solver: DevOps (Epic)',
  'solver-epic-cloud':                'Solver: Cloud (Epic)',
  'solver-epic-backend':              'Solver: Backend (Epic)',
  'solver-epic-database':             'Solver: Database (Epic)',
  'solver-epic-api':                  'Solver: API (Epic)',
  'solver-epic-frontend':             'Solver: Frontend (Epic)',
  'solver-epic-ui':                   'Solver: UI (Epic)',
  'solver-epic-ux':                   'Solver: UX (Epic)',
  'solver-epic-mobile':               'Solver: Mobile (Epic)',
  'solver-epic-data':                 'Solver: Data (Epic)',
  'solver-epic-qa':                   'Solver: QA (Epic)',
  'solver-epic-test-architect':       'Solver: Test Architect (Epic)',
  // Sprint Planning — Story Solvers
  'solver-story-solution-architect':  'Solver: Solution Architect (Story)',
  'solver-story-developer':           'Solver: Developer (Story)',
  'solver-story-security':            'Solver: Security (Story)',
  'solver-story-devops':              'Solver: DevOps (Story)',
  'solver-story-cloud':               'Solver: Cloud (Story)',
  'solver-story-backend':             'Solver: Backend (Story)',
  'solver-story-database':            'Solver: Database (Story)',
  'solver-story-api':                 'Solver: API (Story)',
  'solver-story-frontend':            'Solver: Frontend (Story)',
  'solver-story-ui':                  'Solver: UI (Story)',
  'solver-story-ux':                  'Solver: UX (Story)',
  'solver-story-mobile':              'Solver: Mobile (Story)',
  'solver-story-data':                'Solver: Data (Story)',
  'solver-story-qa':                  'Solver: QA (Story)',
  'solver-story-test-architect':      'Solver: Test Architect (Story)',
};

// ── Step type config ──────────────────────────────────────────────────────────

const STEP_TYPE_CONFIG = {
  generate: { label: 'Generate',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  validate: { label: 'Validate',       cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  refine:   { label: 'Refine',         cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  input:    { label: 'User Input',     cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  cross:    { label: 'Cross-validate', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  output:   { label: 'Write',          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  read:     { label: 'Read',           cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  process:  { label: 'Process',        cls: 'bg-slate-50 text-slate-600 border-slate-200' },
};

const PHASE_COLOR_CONFIG = {
  blue:    { dot: 'bg-blue-500',    label: 'text-blue-600' },
  purple:  { dot: 'bg-purple-500',  label: 'text-purple-600' },
  amber:   { dot: 'bg-amber-500',   label: 'text-amber-600' },
  green:   { dot: 'bg-green-500',   label: 'text-green-600' },
  emerald: { dot: 'bg-emerald-500', label: 'text-emerald-600' },
};

// Loop group color palettes
const LOOP_C = {
  amber: {
    border:    'border-amber-400',
    bg:        'bg-amber-50',
    hdr:       'bg-amber-100',
    hdrBorder: 'border-amber-300',
    text:      'text-amber-800',
    subtext:   'text-amber-600',
    line:      'bg-amber-400',
    chip:      'bg-amber-200 text-amber-900',
    arrow:     'text-amber-500',
    condLine:  'bg-amber-300',
  },
  indigo: {
    border:    'border-indigo-400',
    bg:        'bg-indigo-50',
    hdr:       'bg-indigo-100',
    hdrBorder: 'border-indigo-300',
    text:      'text-indigo-800',
    subtext:   'text-indigo-600',
    line:      'bg-indigo-400',
    chip:      'bg-indigo-200 text-indigo-900',
    arrow:     'text-indigo-500',
    condLine:  'bg-indigo-300',
  },
};

// ── Phase builders ────────────────────────────────────────────────────────────
//
// Step metadata fields (in addition to type / label / agent / agents):
//   stageKey        — key in ceremony.stages to read/write the model
//   validationKey   — 'top' (ceremony.validation.model) or area name ('documentation', 'context')
//   sharedWith      — string shown instead of a select; marks a secondary reference to the same key
//   loopParamType   — 'missionGen' | 'docContext' | 'crossValidation'
//   loopParamReadOnly — true: show values read-only (params already editable in a sibling loop)

function buildSponsorCallPhases(ceremony, missionGenValidation) {
  return [
    {
      id: 'mission',
      label: 'Mission & Scope',
      color: 'blue',
      steps: [
        {
          type:     'generate',
          label:    'Generate mission statement & initial scope',
          model:    ceremony.stages?.suggestions?.model,
          stageKey: 'suggestions',
          agent:    'mission-scope-generator',
        },
        {
          type:          'loop-group',
          loopParamType: 'missionGen',
          loop: {
            max:       missionGenValidation?.maxIterations ?? 3,
            threshold: missionGenValidation?.acceptanceThreshold ?? 90,
          },
          steps: [
            {
              type:          'validate',
              label:         'Validate quality against acceptance threshold',
              model:         ceremony.validation?.model,
              validationKey: 'top',
              agent:         'mission-scope-validator',
            },
            {
              type:       'refine',
              label:      'Refine based on validation issues',
              model:      ceremony.stages?.suggestions?.model,
              stageKey:   'suggestions',
              sharedWith: 'Mission generator',
              agent:      'mission-scope-generator',
            },
          ],
        },
      ],
    },
    {
      id: 'questionnaire',
      label: 'Questionnaire',
      color: 'purple',
      steps: [
        {
          type:  'input',
          label: '5 project definition questions (user-provided or skipped)',
        },
        {
          type:       'generate',
          label:      'Auto-fill any skipped questions',
          model:      ceremony.stages?.suggestions?.model,
          stageKey:   'suggestions',
          sharedWith: 'Mission generator',
          agents: [
            { slug: 'suggestion-product-manager',      note: 'fills Initial Scope' },
            { slug: 'suggestion-ux-researcher',        note: 'fills Target Users' },
            { slug: 'suggestion-deployment-architect', note: 'fills Deployment Target' },
            { slug: 'suggestion-technical-architect',  note: 'fills Technical Considerations' },
            { slug: 'suggestion-security-specialist',  note: 'fills Security & Compliance' },
          ],
        },
        {
          type:     'generate',
          label:    'Architecture recommendation',
          model:    ceremony.stages?.['architecture-recommendation']?.model,
          stageKey: 'architecture-recommendation',
          agent:    'architecture-recommender',
        },
        {
          type:     'generate',
          label:    'Pre-fill answers from architecture analysis',
          model:    ceremony.stages?.['question-prefilling']?.model,
          stageKey: 'question-prefilling',
          agent:    'question-prefiller',
        },
      ],
    },
    {
      id: 'documentation',
      label: 'Documentation',
      color: 'amber',
      steps: [
        {
          type:     'generate',
          label:    'Generate project documentation (doc.md)',
          model:    ceremony.stages?.documentation?.model,
          stageKey: 'documentation',
          agent:    'project-documentation-creator',
        },
        {
          type:          'loop-group',
          loopParamType: 'docContext',
          loop: {
            max:       ceremony.validation?.maxIterations ?? 100,
            threshold: ceremony.validation?.acceptanceThreshold ?? 90,
          },
          steps: [
            {
              type:          'validate',
              label:         'Validate documentation quality',
              model:         ceremony.validation?.documentation?.model ?? ceremony.validation?.model,
              validationKey: 'documentation',
              agent:         'validator-documentation',
            },
            {
              type:       'refine',
              label:      'Improve documentation based on issues',
              model:      ceremony.stages?.documentation?.model,
              stageKey:   'documentation',
              sharedWith: 'Documentation generator',
              agent:      'project-documentation-creator',
            },
          ],
        },
      ],
    },
    {
      id: 'output',
      label: 'Output',
      color: 'emerald',
      steps: [
        { type: 'output', label: '.avc/project/doc.md written', files: [{ name: 'project/doc.md', direction: 'out' }] },
      ],
    },
  ];
}

function buildSprintPlanningPhases(ceremony) {
  // Stages that aren't explicitly configured fall back to ceremony.defaultModel
  const fallbackModel = ceremony.defaultModel;
  const solverMaxIter  = ceremony.stages?.solver?.maxIterations   ?? 3;
  const solverThreshold = ceremony.stages?.solver?.acceptanceThreshold ?? 90;

  return [
    {
      id: 'scope',
      label: 'Scope Collection',
      color: 'blue',
      steps: [
        {
          type:  'read',
          label: 'Read project scope',
          files: [{ name: 'project/doc.md', direction: 'in', note: '.avc/project/doc.md — scope section extracted and sent to decomposer' }],
        },
        { type: 'read', label: 'Analyse existing Epics & Stories (deduplication baseline)' },
      ],
    },
    {
      id: 'decomposition',
      label: 'Decomposition',
      color: 'purple',
      steps: [
        {
          type:     'generate',
          label:    'Decompose scope into Epics and Stories',
          model:    ceremony.stages?.decomposition?.model ?? fallbackModel,
          stageKey: 'decomposition',
          agent:    'epic-story-decomposer',
          files:    [
            { name: 'project/doc.md', direction: 'in', note: 'scope text extracted from doc.md' },
          ],
        },
      ],
    },
    {
      id: 'validation',
      label: 'Multi-Agent Validation (Iterative)',
      color: 'amber',
      // Per-validator iteration loop: each validator runs, if issues found a paired
      // solver improves the epic/story, then the same validator re-validates.
      // Validators run sequentially so each one sees improvements from previous pairs.
      steps: [
        {
          type:          'loop-group',
          loopParamType: 'sprintSolver',
          loop: {
            max:       solverMaxIter,
            threshold: solverThreshold,
          },
          steps: [
            {
              type:     'validate',
              label:    'Validate each Epic with domain expert validators (sequential)',
              model:    ceremony.stages?.validation?.model ?? fallbackModel,
              stageKey: 'validation',
              agents: [
                { slug: 'validator-epic-solution-architect', note: 'always runs' },
                { slug: 'validator-epic-developer',          note: 'always runs' },
                { slug: 'validator-epic-security',           note: 'always runs' },
                { slug: 'validator-epic-backend',            note: '+ domain validators selected per project' },
              ],
            },
            {
              type:     'refine',
              label:    'Solve issues — improve Epic description, features, dependencies',
              model:    ceremony.stages?.solver?.model ?? fallbackModel,
              stageKey: 'solver',
              agents: [
                { slug: 'solver-epic-solution-architect', note: 'paired with validator-epic-solution-architect' },
                { slug: 'solver-epic-developer',          note: 'paired with validator-epic-developer' },
                { slug: 'solver-epic-security',           note: 'paired with validator-epic-security' },
                { slug: 'solver-epic-backend',            note: 'paired with each domain validator' },
              ],
            },
          ],
        },
        {
          type:          'loop-group',
          loopParamType: 'sprintSolver',
          loopParamReadOnly: true,
          loop: {
            max:       solverMaxIter,
            threshold: solverThreshold,
          },
          steps: [
            {
              type:     'validate',
              label:    'Validate each Story with domain expert validators (sequential)',
              model:    ceremony.stages?.validation?.model ?? fallbackModel,
              stageKey: 'validation',
              agents: [
                { slug: 'validator-story-developer',      note: 'always runs' },
                { slug: 'validator-story-qa',             note: 'always runs' },
                { slug: 'validator-story-test-architect', note: 'always runs' },
                { slug: 'validator-story-backend',        note: '+ domain validators selected per project' },
              ],
            },
            {
              type:     'refine',
              label:    'Solve issues — improve Story description, acceptance criteria, dependencies',
              model:    ceremony.stages?.solver?.model ?? fallbackModel,
              stageKey: 'solver',
              agents: [
                { slug: 'solver-story-developer',      note: 'paired with validator-story-developer' },
                { slug: 'solver-story-qa',             note: 'paired with validator-story-qa' },
                { slug: 'solver-story-test-architect', note: 'paired with validator-story-test-architect' },
                { slug: 'solver-story-backend',        note: 'paired with each domain validator' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'output',
      label: 'Output',
      color: 'emerald',
      steps: [
        { type: 'process', label: 'Renumber hierarchy IDs' },
        {
          type:  'output',
          label: 'Write Epic files',
          files: [
            { name: '{epic}/work.json', direction: 'out' },
            { name: '{epic}/doc.md',    direction: 'out', note: 'stub — filled in by agent work' },
          ],
        },
        {
          type:  'output',
          label: 'Write Story files',
          files: [
            { name: '{story}/work.json', direction: 'out' },
          ],
        },
      ],
    },
  ];
}
function buildSeedPhases(_c)           { return null; }

const CEREMONY_WORKFLOWS = {
  'sponsor-call':    buildSponsorCallPhases,
  'sprint-planning': (c) => buildSprintPlanningPhases(c),
  'seed':            (_c) => buildSeedPhases(_c),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveModelName(modelId, models) {
  if (!modelId) return '—';
  return models.find((m) => m.modelId === modelId)?.displayName || modelId;
}

// ── Inline model select ───────────────────────────────────────────────────────

function ModelSelectInline({ value, models, onChange }) {
  const providers = [...new Set(models.map((m) => m.provider))];
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      className="text-xs border border-slate-300 rounded px-1.5 py-0.5 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[200px]"
    >
      {!value && <option value="">— select —</option>}
      {providers.map((p) => (
        <optgroup key={p} label={p.charAt(0).toUpperCase() + p.slice(1)}>
          {models.filter((m) => m.provider === p).map((m) => (
            <option key={m.modelId} value={m.modelId}>{m.displayName || m.modelId}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ── Agent link ────────────────────────────────────────────────────────────────

function AgentLink({ slug, onOpen }) {
  const label = AGENT_LABELS[slug] || slug;
  return (
    <button
      type="button"
      onClick={() => onOpen(slug)}
      className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
      title={`Edit ${label} agent instructions`}
    >
      {label}
      <Pencil className="w-2.5 h-2.5 flex-shrink-0" />
    </button>
  );
}

function AgentLinks({ step, onOpenAgent }) {
  const items = step.agents
    ? step.agents.map((a) => (typeof a === 'string' ? { slug: a, note: null } : a))
    : step.agent
      ? [{ slug: step.agent, note: null }]
      : [];

  if (items.length === 0) return null;

  return (
    <div className="mt-1.5">
      <span className="text-[10px] text-slate-400 font-medium">Agent(s)</span>
      <div className="mt-1 flex flex-col gap-1">
        {items.map(({ slug, note }) => (
          <div key={slug} className="flex items-center gap-2 flex-wrap">
            <AgentLink slug={slug} onOpen={onOpenAgent} />
            {note && <span className="text-[10px] text-slate-400 italic">{note}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── File tags ─────────────────────────────────────────────────────────────────
// Renders small ← filename (input) / → filename (output) badges on step cards.
// Steps can carry a `files` array: [{ name, direction: 'in'|'out', note? }]

function FileTags({ files, className = '' }) {
  if (!files || files.length === 0) return null;
  return (
    <div className={`flex items-center gap-1 flex-wrap ${className}`}>
      {files.map((f, i) => {
        const isIn = f.direction === 'in';
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${
              isIn
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
            title={f.note}
          >
            <span className="font-sans mr-0.5">{isIn ? '←' : '→'}</span>
            {f.name}
          </span>
        );
      })}
    </div>
  );
}

// ── Step badge ────────────────────────────────────────────────────────────────

function StepBadge({ type }) {
  const cfg = STEP_TYPE_CONFIG[type] || { label: type, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded border whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Plain step card ───────────────────────────────────────────────────────────

function StepCard({ step, models, editable, onStageModelChange, onValidationModelChange, onOpenAgent }) {
  const showModel = !['input', 'output', 'read', 'process'].includes(step.type);
  const canEdit   = editable && !step.sharedWith && (step.stageKey || step.validationKey);

  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-sm">

      {/* Row 1: badge + file tags (flex-1) + model — all vertically centred */}
      <div className="flex items-center gap-2">
        <div className="flex-shrink-0">
          <StepBadge type={step.type} />
        </div>
        <FileTags files={step.files} className="flex-1 min-w-0" />
        {showModel && (
          step.sharedWith ? (
            <p className="text-[10px] text-slate-400 italic flex-shrink-0">↑ {step.sharedWith}</p>
          ) : canEdit ? (
            <ModelSelectInline
              value={step.model}
              models={models}
              onChange={(modelId) => {
                if (step.stageKey) onStageModelChange(step.stageKey, modelId);
                else onValidationModelChange(step.validationKey, modelId);
              }}
            />
          ) : (
            <p className="text-[10px] text-slate-400 flex-shrink-0">
              {step.note ? step.note : resolveModelName(step.model, models)}
            </p>
          )
        )}
      </div>

      {/* Row 2: description + agents — tiny left indent */}
      <p className="text-xs text-slate-700 leading-snug text-left mt-2 pl-1">{step.label}</p>

      <div className="pl-1">
        <AgentLinks step={step} onOpenAgent={onOpenAgent} />
      </div>
    </div>
  );
}

// ── Loop group card ───────────────────────────────────────────────────────────

function LoopGroupCard({ group, models, editable, onStageModelChange, onValidationModelChange, onLoopParamChange, onOpenAgent }) {
  const { loop, steps }   = group;
  const isIndigo          = steps.some((s) => s.type === 'cross');
  const c                 = isIndigo ? LOOP_C.indigo : LOOP_C.amber;
  const hasMulti          = steps.length > 1;

  const canEditLoop = editable && group.loopParamType && !group.loopParamReadOnly;

  return (
    <div className={`rounded-xl border-2 border-dashed ${c.border} overflow-hidden`}>

      {/* ── Header ── */}
      <div className={`${c.hdr} border-b-2 border-dashed ${c.hdrBorder} px-3 py-2 flex items-center gap-2 flex-wrap`}>
        <span className={`text-xl font-black leading-none ${c.text}`}>↺</span>
        <span className={`text-xs font-bold ${c.text} tracking-wide`}>Iteration Loop</span>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {loop.max != null && (
            canEditLoop ? (
              <label className={`text-xs font-semibold ${c.chip} px-2 py-0.5 rounded-full flex items-center gap-1`}>
                up to
                <input
                  type="number" min="1" max="200" value={loop.max}
                  onChange={(e) => onLoopParamChange(group.loopParamType, 'maxIterations', Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="w-10 bg-transparent border-b border-current text-center focus:outline-none"
                />
                iter
              </label>
            ) : (
              <span className={`text-xs font-semibold ${c.chip} px-2 py-0.5 rounded-full`}>
                {group.loopParamReadOnly ? `↑ ${loop.max} iter` : `up to ${loop.max} iter`}
              </span>
            )
          )}
          {loop.threshold != null && (
            canEditLoop ? (
              <label className={`text-xs font-semibold ${c.chip} px-2 py-0.5 rounded-full flex items-center gap-1`}>
                ≥
                <input
                  type="number" min="0" max="100" value={loop.threshold}
                  onChange={(e) => onLoopParamChange(group.loopParamType, 'acceptanceThreshold', Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="w-10 bg-transparent border-b border-current text-center focus:outline-none"
                />
                /100
              </label>
            ) : (
              <span className={`text-xs font-semibold ${c.chip} px-2 py-0.5 rounded-full`}>
                {group.loopParamReadOnly ? `↑ ≥${loop.threshold}/100` : `≥${loop.threshold}/100`}
              </span>
            )
          )}
        </div>
      </div>

      {/* ── Steps + right-side loop arrow ── */}
      <div className={`${c.bg} p-3 flex gap-2 items-stretch`}>
        <div className="flex-1 flex flex-col">
          {steps.map((step, i) => (
            <div key={i}>
              <StepCard
                step={step}
                models={models}
                editable={editable}
                onStageModelChange={onStageModelChange}
                onValidationModelChange={onValidationModelChange}
                onOpenAgent={onOpenAgent}
              />
              {i < steps.length - 1 && (
                <div className="flex items-center gap-2 my-1.5 ml-3">
                  <div className={`w-px h-4 ${c.condLine}`} />
                  <span className={`text-xs ${c.subtext} italic`}>score &lt; threshold → retry</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right-side loop-back arrow */}
        {hasMulti && (
          <div className={`flex flex-col items-center flex-shrink-0 ${c.arrow}`} style={{ width: 22 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7 L7 1 L12 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className={`w-0.5 flex-1 ${c.line} my-1 rounded-full`} style={{ minHeight: 36 }} />
            <span
              className={`text-[9px] font-bold tracking-widest uppercase ${c.text} opacity-70`}
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              retry
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Phase header ──────────────────────────────────────────────────────────────

function PhaseHeader({ label, color }) {
  const cfg = PHASE_COLOR_CONFIG[color] || { dot: 'bg-slate-400', label: 'text-slate-600' };
  return (
    <div className="flex items-center gap-2 mt-5 mb-2">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.label}`}>{label}</span>
    </div>
  );
}

function Connector() {
  return <div className="w-px h-4 bg-slate-200 ml-4" />;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function CeremonyWorkflowModal({
  ceremony,
  models = [],
  missionGenValidation = null,
  onClose,
  onSave,
  readOnly = false,
}) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(ceremony || {})));
  const [missionGenDraft, setMissionGenDraft] = useState(() =>
    JSON.parse(JSON.stringify(missionGenValidation || { maxIterations: 3, acceptanceThreshold: 90 }))
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [openAgentSlug, setOpenAgentSlug] = useState(null);

  // Phases rebuild from draft every render — always reflect current edits
  const buildPhases = ceremony?.name ? CEREMONY_WORKFLOWS[ceremony.name] : null;
  const phases      = buildPhases ? buildPhases(draft, missionGenDraft) : null;

  const isEditable = !readOnly && !!onSave;

  // ── Update helpers ──────────────────────────────────────────────────────────

  const updateStageModel = (stageKey, modelId) => {
    const found = models.find((m) => m.modelId === modelId);
    setDraft((prev) => ({
      ...prev,
      stages: {
        ...prev.stages,
        [stageKey]: {
          ...prev.stages?.[stageKey],
          model:    modelId,
          provider: found?.provider || prev.stages?.[stageKey]?.provider || '',
        },
      },
    }));
  };

  const updateValidationModel = (area, modelId) => {
    const found = models.find((m) => m.modelId === modelId);
    if (area === 'top') {
      setDraft((prev) => ({
        ...prev,
        validation: {
          ...prev.validation,
          model:    modelId,
          provider: found?.provider || prev.validation?.provider || '',
        },
      }));
    } else {
      setDraft((prev) => ({
        ...prev,
        validation: {
          ...prev.validation,
          [area]: {
            ...prev.validation?.[area],
            model:    modelId,
            provider: found?.provider || prev.validation?.[area]?.provider || '',
          },
        },
      }));
    }
  };

  const updateLoopParam = (loopParamType, field, value) => {
    if (loopParamType === 'missionGen') {
      setMissionGenDraft((prev) => ({ ...prev, [field]: value }));
    } else if (loopParamType === 'docContext') {
      setDraft((prev) => ({ ...prev, validation: { ...prev.validation, [field]: value } }));
    } else if (loopParamType === 'sprintSolver') {
      setDraft((prev) => ({
        ...prev,
        stages: {
          ...prev.stages,
          solver: { ...(prev.stages?.solver || {}), [field]: value },
        },
      }));
    }
  };

  // ── Save / cancel ───────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft, missionGenDraft);
      onClose();
    } catch {
      setSaveError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(JSON.parse(JSON.stringify(ceremony || {})));
    setMissionGenDraft(JSON.parse(JSON.stringify(missionGenValidation || { maxIterations: 3, acceptanceThreshold: 90 })));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      {/* Backdrop: in edit mode clicking outside does nothing to prevent accidental data loss */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={isEditable ? undefined : onClose}
      />

      <div
        className="relative bg-slate-50 rounded-2xl shadow-2xl w-full max-w-xl mx-4 flex flex-col"
        style={{ height: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-200 flex-shrink-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {isEditable ? 'Configure Models' : 'Ceremony Workflow'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {ceremony?.displayName || ceremony?.name || 'Unknown ceremony'}
            </p>
          </div>
          <button
            type="button"
            onClick={isEditable ? handleCancel : onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {phases === null ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-slate-400">Workflow diagram coming soon for this ceremony.</p>
            </div>
          ) : (
            phases.map((phase, pi) => (
              <div key={phase.id}>
                <PhaseHeader label={phase.label} color={phase.color} />
                {phase.steps.map((step, si) => (
                  <div key={si}>
                    {step.type === 'loop-group' ? (
                      <LoopGroupCard
                        group={step}
                        models={models}
                        editable={isEditable}
                        onStageModelChange={updateStageModel}
                        onValidationModelChange={updateValidationModel}
                        onLoopParamChange={updateLoopParam}
                        onOpenAgent={setOpenAgentSlug}
                      />
                    ) : (
                      <StepCard
                        step={step}
                        models={models}
                        editable={isEditable}
                        onStageModelChange={updateStageModel}
                        onValidationModelChange={updateValidationModel}
                        onOpenAgent={setOpenAgentSlug}
                      />
                    )}
                    {si < phase.steps.length - 1 && <Connector />}
                  </div>
                ))}
                {pi < phases.length - 1 && (
                  <div className="mt-3 border-t border-dashed border-slate-200" />
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer — edit mode only */}
        {isEditable && (
          <div className="flex-shrink-0 border-t border-slate-200 bg-white rounded-b-2xl px-5 py-3 flex items-center justify-between">
            <div>
              {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border border-white/40 border-t-white rounded-full animate-spin" />
                    Saving…
                  </>
                ) : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {openAgentSlug && (
        <AgentEditorPopup
          agentName={`${openAgentSlug}.md`}
          onClose={() => setOpenAgentSlug(null)}
        />
      )}
    </div>
  );
}
