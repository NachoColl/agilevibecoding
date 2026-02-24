import { X, ExternalLink } from 'lucide-react';

const AGENT_BASE_URL = 'https://agilevibecoding.org/agents';

// Human-readable labels for agent slugs
const AGENT_LABELS = {
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
  'project-context-generator':       'Context Generator',
  'validator-context':               'Context Validator',
  'cross-validator-doc-to-context':  'Doc → Context Validator',
  'cross-validator-context-to-doc':  'Context → Doc Validator',
};

// ── Step type config ──────────────────────────────────────────────────────────

const STEP_TYPE_CONFIG = {
  generate: { label: 'Generate',       cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  validate: { label: 'Validate',       cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  refine:   { label: 'Refine',         cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  input:    { label: 'User Input',     cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  cross:    { label: 'Cross-validate', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  output:   { label: 'Output',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
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

// ── Workflow builders ─────────────────────────────────────────────────────────
//
// Step item shapes:
//   normal step  → { type, label, model?, note?, agent?, agents? }
//   loop group   → { type: 'loop-group', loop: {max, threshold}, steps: [...] }
//
// agent  : single slug string — links to one agent doc page
// agents : array of { slug, note? } — multiple agents; note is a one-line
//          description of what this agent specifically does in this step

function buildSponsorCallPhases(ceremony) {
  return [
    {
      id: 'mission',
      label: 'Mission & Scope',
      color: 'blue',
      steps: [
        {
          type:  'generate',
          label: 'Generate mission statement & initial scope',
          model: ceremony.stages?.suggestions?.model,
          agent: 'mission-scope-generator',
        },
        {
          type: 'loop-group',
          loop: {
            max:       ceremony.validation?.maxIterations ?? 3,
            threshold: ceremony.validation?.acceptanceThreshold ?? 75,
          },
          steps: [
            {
              type:  'validate',
              label: 'Validate quality against acceptance threshold',
              model: ceremony.validation?.model,
              agent: 'mission-scope-validator',
            },
            {
              type:  'refine',
              label: 'Refine based on validation issues',
              model: ceremony.stages?.suggestions?.model,
              agent: 'mission-scope-generator',
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
          type:  'generate',
          label: 'Auto-fill any skipped questions',
          model: ceremony.stages?.suggestions?.model,
          // One suggestion agent fires per skipped question
          agents: [
            { slug: 'suggestion-product-manager',      note: 'fills Initial Scope' },
            { slug: 'suggestion-ux-researcher',        note: 'fills Target Users' },
            { slug: 'suggestion-deployment-architect', note: 'fills Deployment Target' },
            { slug: 'suggestion-technical-architect',  note: 'fills Technical Considerations' },
            { slug: 'suggestion-security-specialist',  note: 'fills Security & Compliance' },
          ],
        },
        {
          type:  'generate',
          label: 'Architecture recommendation',
          model: ceremony.stages?.['architecture-recommendation']?.model,
          agent: 'architecture-recommender',
        },
        {
          type:  'generate',
          label: 'Pre-fill answers from architecture analysis',
          model: ceremony.stages?.['question-prefilling']?.model,
          agent: 'question-prefiller',
        },
      ],
    },
    {
      id: 'documentation',
      label: 'Documentation',
      color: 'amber',
      steps: [
        {
          type:  'generate',
          label: 'Generate project documentation (doc.md)',
          model: ceremony.stages?.documentation?.model,
          agent: 'project-documentation-creator',
        },
        {
          type: 'loop-group',
          loop: {
            max:       ceremony.validation?.maxIterations ?? 100,
            threshold: ceremony.validation?.acceptanceThreshold ?? 75,
          },
          steps: [
            {
              type:  'validate',
              label: 'Validate documentation quality',
              model: ceremony.validation?.documentation?.model ?? ceremony.validation?.model,
              agent: 'validator-documentation',
            },
            {
              type:  'refine',
              label: 'Improve documentation based on issues',
              model: ceremony.stages?.documentation?.model,
              agent: 'project-documentation-creator',
            },
          ],
        },
      ],
    },
    {
      id: 'context',
      label: 'Context',
      color: 'green',
      steps: [
        {
          type:  'generate',
          label: 'Generate project context (context.md)',
          model: ceremony.stages?.context?.model,
          agent: 'project-context-generator',
        },
        {
          type: 'loop-group',
          loop: {
            max:       ceremony.validation?.maxIterations ?? 100,
            threshold: ceremony.validation?.acceptanceThreshold ?? 75,
          },
          steps: [
            {
              type:  'validate',
              label: 'Validate context quality',
              model: ceremony.validation?.context?.model ?? ceremony.validation?.model,
              agent: 'validator-context',
            },
            {
              type:  'refine',
              label: 'Improve context based on issues',
              model: ceremony.stages?.context?.model,
              agent: 'project-context-generator',
            },
          ],
        },
        {
          type: 'loop-group',
          loop: { max: 3, threshold: null },
          steps: [
            {
              type:   'cross',
              label:  'Cross-validate doc ↔ context consistency',
              agents: [
                { slug: 'cross-validator-doc-to-context', note: 'checks every doc.md reference exists in context.md' },
                { slug: 'cross-validator-context-to-doc', note: 'checks every context.md reference exists in doc.md' },
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
        { type: 'output', label: '.avc/project/doc.md written' },
        { type: 'output', label: '.avc/project/context.md written' },
      ],
    },
  ];
}

function buildSprintPlanningPhases(_c) { return null; }
function buildContextRetroPhases(_c)   { return null; }
function buildSeedPhases(_c)           { return null; }

const CEREMONY_WORKFLOWS = {
  'sponsor-call':          buildSponsorCallPhases,
  'sprint-planning':       buildSprintPlanningPhases,
  'context-retrospective': buildContextRetroPhases,
  'seed':                  buildSeedPhases,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveModelName(modelId, models) {
  if (!modelId) return '—';
  return models.find((m) => m.modelId === modelId)?.displayName || modelId;
}

// ── Agent link ────────────────────────────────────────────────────────────────

function AgentLink({ slug }) {
  const label = AGENT_LABELS[slug] || slug;
  return (
    <a
      href={`${AGENT_BASE_URL}/${slug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-300 px-1.5 py-0.5 rounded transition-colors whitespace-nowrap"
      title={`View ${label} agent documentation`}
    >
      {label}
      <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
    </a>
  );
}

function AgentLinks({ step }) {
  // Normalise to [{ slug, note }] regardless of input shape
  const items = step.agents
    ? step.agents.map((a) => (typeof a === 'string' ? { slug: a, note: null } : a))
    : step.agent
      ? [{ slug: step.agent, note: null }]
      : [];

  if (items.length === 0) return null;

  const hasNotes = items.some((a) => a.note);

  if (!hasNotes) {
    // Single agent or multi without notes — compact inline row
    return (
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        <span className="text-[10px] text-slate-400 font-medium mr-0.5">Agent</span>
        {items.map(({ slug }) => <AgentLink key={slug} slug={slug} />)}
      </div>
    );
  }

  // Multi-agent with per-agent notes — vertical list
  return (
    <div className="mt-1.5">
      <span className="text-[10px] text-slate-400 font-medium">Agent</span>
      <div className="mt-1 flex flex-col gap-1">
        {items.map(({ slug, note }) => (
          <div key={slug} className="flex items-center gap-2 flex-wrap">
            <AgentLink slug={slug} />
            {note && (
              <span className="text-[10px] text-slate-400 italic">{note}</span>
            )}
          </div>
        ))}
      </div>
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

function StepCard({ step, models }) {
  const showModel = step.type !== 'input' && step.type !== 'output';
  return (
    <div className="flex gap-3 items-start bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-sm">
      <div className="pt-0.5 flex-shrink-0">
        <StepBadge type={step.type} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-800 leading-snug">{step.label}</p>
        {showModel && (
          <p className="text-xs text-slate-400 mt-0.5">
            <span className="mr-1">⬡</span>
            {step.note ? step.note : resolveModelName(step.model, models)}
          </p>
        )}
        <AgentLinks step={step} />
      </div>
    </div>
  );
}

// ── Loop group card ───────────────────────────────────────────────────────────

function LoopGroupCard({ group, models }) {
  const { loop, steps } = group;
  const isIndigo    = steps.some((s) => s.type === 'cross');
  const c           = isIndigo ? LOOP_C.indigo : LOOP_C.amber;
  const hasMulti    = steps.length > 1;

  const validateStep   = steps.find((s) => s.type === 'validate' || s.type === 'cross');
  const refineStep     = steps.find((s) => s.type === 'refine');
  const validatorModel = validateStep?.model;
  const refinerModel   = refineStep?.model;
  const sameModel      = validatorModel && refinerModel && validatorModel === refinerModel;

  return (
    <div className={`rounded-xl border-2 border-dashed ${c.border} overflow-hidden`}>

      {/* ── Header ── */}
      <div className={`${c.hdr} border-b-2 border-dashed ${c.hdrBorder} px-3 py-2 flex items-center gap-2`}>
        <span className={`text-xl font-black leading-none ${c.text}`}>↺</span>
        <span className={`text-xs font-bold ${c.text} tracking-wide`}>Iteration Loop</span>
        <div className="ml-auto flex items-center gap-1.5">
          {loop.max != null && (
            <span className={`text-xs font-semibold ${c.chip} px-2 py-0.5 rounded-full`}>
              up to {loop.max} iter
            </span>
          )}
          {loop.threshold != null && (
            <span className={`text-xs font-semibold ${c.chip} px-2 py-0.5 rounded-full`}>
              ≥{loop.threshold}/100
            </span>
          )}
        </div>
      </div>

      {/* ── Model strip ── */}
      {(validatorModel || refinerModel) && (
        <div className={`${c.hdr} border-b border-dashed ${c.hdrBorder} px-3 py-2 flex items-center gap-2 flex-wrap`}>
          <span className={`text-xs font-semibold ${c.subtext} mr-1`}>Models in loop:</span>
          {validatorModel && (
            <span className={`flex items-center gap-1.5 text-xs font-medium ${c.chip} px-2.5 py-1 rounded-lg`}>
              <span className="text-sm">⚖</span>
              <span className="opacity-60">Validator</span>
              <span className="font-semibold">{resolveModelName(validatorModel, models)}</span>
            </span>
          )}
          {hasMulti && refinerModel && !sameModel && (
            <>
              <span className={`text-lg font-bold ${c.arrow}`}>⇄</span>
              <span className={`flex items-center gap-1.5 text-xs font-medium ${c.chip} px-2.5 py-1 rounded-lg`}>
                <span className="text-sm">✎</span>
                <span className="opacity-60">Refiner</span>
                <span className="font-semibold">{resolveModelName(refinerModel, models)}</span>
              </span>
            </>
          )}
          {hasMulti && sameModel && (
            <span className={`text-xs ${c.subtext} italic`}>same model for both roles</span>
          )}
        </div>
      )}

      {/* ── Steps + right-side loop arrow ── */}
      <div className={`${c.bg} p-3 flex gap-2 items-stretch`}>
        <div className="flex-1 flex flex-col">
          {steps.map((step, i) => (
            <div key={i}>
              <StepCard step={step} models={models} />
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

export function CeremonyWorkflowModal({ ceremony, models = [], onClose }) {
  const buildPhases = ceremony?.name ? CEREMONY_WORKFLOWS[ceremony.name] : null;
  const phases      = buildPhases ? buildPhases(ceremony) : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="relative bg-slate-50 rounded-2xl shadow-2xl w-full max-w-xl mx-4 flex flex-col"
        style={{ height: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-200 flex-shrink-0 bg-white rounded-t-2xl">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Ceremony Workflow</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {ceremony?.displayName || ceremony?.name || 'Unknown ceremony'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
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
                    {step.type === 'loop-group'
                      ? <LoopGroupCard group={step} models={models} />
                      : <StepCard step={step} models={models} />
                    }
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
      </div>
    </div>
  );
}
