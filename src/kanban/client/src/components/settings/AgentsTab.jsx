import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getAgentList } from '../../lib/api';
import { AgentEditorPopup } from './AgentEditorPopup';

const CEREMONY_STRUCTURE = [
  {
    ceremony: 'Sponsor Call',
    color: 'blue',
    phases: [
      { phase: 'Mission & Scope', agents: [
          { slug: 'mission-scope-generator',   label: 'Mission Scope Generator',    note: 'Generates mission & initial scope' },
          { slug: 'mission-scope-validator',   label: 'Mission Scope Validator',    note: 'Validates mission quality' },
      ]},
      { phase: 'Questionnaire', agents: [
          { slug: 'suggestion-product-manager',      label: 'Product Manager',           note: 'Fills Initial Scope' },
          { slug: 'suggestion-ux-researcher',        label: 'UX Researcher',             note: 'Fills Target Users' },
          { slug: 'suggestion-deployment-architect', label: 'Deployment Architect',      note: 'Fills Deployment Target' },
          { slug: 'suggestion-technical-architect',  label: 'Technical Architect',       note: 'Fills Technical Considerations' },
          { slug: 'suggestion-security-specialist',  label: 'Security Specialist',       note: 'Fills Security & Compliance' },
          { slug: 'architecture-recommender',        label: 'Architecture Recommender',  note: 'Recommends deployment architectures' },
          { slug: 'database-recommender',            label: 'Database Recommender',      note: 'Recommends database type' },
          { slug: 'database-deep-dive',              label: 'Database Deep Dive',        note: 'Detailed database analysis' },
          { slug: 'question-prefiller',              label: 'Question Prefiller',        note: 'Pre-fills answers from architecture' },
      ]},
      { phase: 'Documentation', agents: [
          { slug: 'project-documentation-creator', label: 'Documentation Creator',  note: 'Creates project documentation' },
          { slug: 'validator-documentation',       label: 'Documentation Validator', note: 'Validates documentation quality' },
      ]},
      { phase: 'Context', agents: [
          { slug: 'project-context-generator',      label: 'Context Generator',         note: 'Generates context.md' },
          { slug: 'validator-context',              label: 'Context Validator',         note: 'Validates context quality' },
          { slug: 'cross-validator-doc-to-context', label: 'Doc → Context Validator',  note: 'Cross-validates doc → context' },
          { slug: 'cross-validator-context-to-doc', label: 'Context → Doc Validator',  note: 'Cross-validates context → doc' },
          { slug: 'migration-guide-generator',      label: 'Migration Guide Generator', note: 'Generates cloud migration guide' },
      ]},
    ],
  },
  {
    ceremony: 'Sprint Planning',
    color: 'purple',
    phases: [
      { phase: 'Decomposition', agents: [
          { slug: 'epic-story-decomposer',     label: 'Epic Story Decomposer',     note: 'Breaks scope into epics & stories' },
          { slug: 'feature-context-generator', label: 'Feature Context Generator', note: 'Generates context files for epics & stories' },
      ]},
      { phase: 'Validation — Epic', agents: [
          { slug: 'validator-selector',                label: 'Validator Selector',  note: 'Selects appropriate domain validators' },
          { slug: 'validator-epic-solution-architect', label: 'Solution Architect' },
          { slug: 'validator-epic-developer',          label: 'Developer' },
          { slug: 'validator-epic-security',           label: 'Security' },
          { slug: 'validator-epic-devops',             label: 'DevOps' },
          { slug: 'validator-epic-cloud',              label: 'Cloud' },
          { slug: 'validator-epic-backend',            label: 'Backend' },
          { slug: 'validator-epic-database',           label: 'Database' },
          { slug: 'validator-epic-api',                label: 'API' },
          { slug: 'validator-epic-frontend',           label: 'Frontend' },
          { slug: 'validator-epic-ui',                 label: 'UI' },
          { slug: 'validator-epic-ux',                 label: 'UX' },
          { slug: 'validator-epic-mobile',             label: 'Mobile' },
          { slug: 'validator-epic-data',               label: 'Data' },
          { slug: 'validator-epic-qa',                 label: 'QA' },
          { slug: 'validator-epic-test-architect',     label: 'Test Architect' },
      ]},
      { phase: 'Solving — Epic', agents: [
          { slug: 'solver-epic-solution-architect', label: 'Solution Architect' },
          { slug: 'solver-epic-developer',          label: 'Developer' },
          { slug: 'solver-epic-security',           label: 'Security' },
          { slug: 'solver-epic-devops',             label: 'DevOps' },
          { slug: 'solver-epic-cloud',              label: 'Cloud' },
          { slug: 'solver-epic-backend',            label: 'Backend' },
          { slug: 'solver-epic-database',           label: 'Database' },
          { slug: 'solver-epic-api',                label: 'API' },
          { slug: 'solver-epic-frontend',           label: 'Frontend' },
          { slug: 'solver-epic-ui',                 label: 'UI' },
          { slug: 'solver-epic-ux',                 label: 'UX' },
          { slug: 'solver-epic-mobile',             label: 'Mobile' },
          { slug: 'solver-epic-data',               label: 'Data' },
          { slug: 'solver-epic-qa',                 label: 'QA' },
          { slug: 'solver-epic-test-architect',     label: 'Test Architect' },
      ]},
      { phase: 'Validation — Story', agents: [
          { slug: 'validator-story-solution-architect', label: 'Solution Architect' },
          { slug: 'validator-story-developer',          label: 'Developer' },
          { slug: 'validator-story-security',           label: 'Security' },
          { slug: 'validator-story-devops',             label: 'DevOps' },
          { slug: 'validator-story-cloud',              label: 'Cloud' },
          { slug: 'validator-story-backend',            label: 'Backend' },
          { slug: 'validator-story-database',           label: 'Database' },
          { slug: 'validator-story-api',                label: 'API' },
          { slug: 'validator-story-frontend',           label: 'Frontend' },
          { slug: 'validator-story-ui',                 label: 'UI' },
          { slug: 'validator-story-ux',                 label: 'UX' },
          { slug: 'validator-story-mobile',             label: 'Mobile' },
          { slug: 'validator-story-data',               label: 'Data' },
          { slug: 'validator-story-qa',                 label: 'QA' },
          { slug: 'validator-story-test-architect',     label: 'Test Architect' },
      ]},
      { phase: 'Solving — Story', agents: [
          { slug: 'solver-story-solution-architect', label: 'Solution Architect' },
          { slug: 'solver-story-developer',          label: 'Developer' },
          { slug: 'solver-story-security',           label: 'Security' },
          { slug: 'solver-story-devops',             label: 'DevOps' },
          { slug: 'solver-story-cloud',              label: 'Cloud' },
          { slug: 'solver-story-backend',            label: 'Backend' },
          { slug: 'solver-story-database',           label: 'Database' },
          { slug: 'solver-story-api',                label: 'API' },
          { slug: 'solver-story-frontend',           label: 'Frontend' },
          { slug: 'solver-story-ui',                 label: 'UI' },
          { slug: 'solver-story-ux',                 label: 'UX' },
          { slug: 'solver-story-mobile',             label: 'Mobile' },
          { slug: 'solver-story-data',               label: 'Data' },
          { slug: 'solver-story-qa',                 label: 'QA' },
          { slug: 'solver-story-test-architect',     label: 'Test Architect' },
      ]},
    ],
  },
  {
    ceremony: 'Seed',
    color: 'amber',
    phases: [
      { phase: 'Decomposition', agents: [
          { slug: 'task-subtask-decomposer',   label: 'Task Decomposer',           note: 'Breaks stories into tasks & subtasks' },
          { slug: 'feature-context-generator', label: 'Feature Context Generator', note: 'Generates context files' },
      ]},
    ],
  },
  {
    ceremony: 'Context Retrospective',
    color: 'green',
    phases: [
      { phase: 'Refinement', agents: [
          { slug: 'documentation-updater', label: 'Documentation Updater', note: 'Updates and refines documentation' },
          { slug: 'context-refiner',       label: 'Context Refiner',       note: 'Enriches context with insights' },
      ]},
    ],
  },
];

const CEREMONY_COLORS = {
  blue:   { border: 'border-blue-200',   header: 'bg-blue-50',   accent: 'border-l-blue-400',   text: 'text-blue-800'   },
  purple: { border: 'border-purple-200', header: 'bg-purple-50', accent: 'border-l-purple-400', text: 'text-purple-800' },
  amber:  { border: 'border-amber-200',  header: 'bg-amber-50',  accent: 'border-l-amber-400',  text: 'text-amber-800'  },
  green:  { border: 'border-green-200',  header: 'bg-green-50',  accent: 'border-l-green-400',  text: 'text-green-800'  },
  slate:  { border: 'border-slate-200',  header: 'bg-slate-50',  accent: 'border-l-slate-400',  text: 'text-slate-800'  },
};

// Flat set of all known slugs for computing "Other" group
const KNOWN_SLUGS = new Set(
  CEREMONY_STRUCTURE.flatMap(c => c.phases.flatMap(p => p.agents.map(a => a.slug)))
);

export function AgentsTab() {
  const [agentStatus, setAgentStatus] = useState({});  // { slug: isCustomized }
  const [openAgent, setOpenAgent] = useState(null);    // slug | null
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  // collapsed state: absence = collapsed (default), true = open
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    getAgentList()
      .then(r => {
        const status = {};
        r.agents.forEach(a => {
          const slug = a.name.replace(/\.md$/, '');
          status[slug] = a.isCustomized;
        });
        setAgentStatus(status);
      })
      .catch(err => setError(err.message));
  }, []);

  const toggle = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  const isOpen = (key) => collapsed[key] === true; // default collapsed when key absent

  // Build "Other" group from agents returned by the API that aren't in any ceremony structure
  const otherAgents = Object.keys(agentStatus)
    .filter(slug => !KNOWN_SLUGS.has(slug))
    .map(slug => ({ slug, label: slug, note: null }));

  const allCeremonies = [
    ...CEREMONY_STRUCTURE,
    ...(otherAgents.length > 0
      ? [{ ceremony: 'Other', color: 'slate', phases: [{ phase: 'Other', agents: otherAgents }] }]
      : []),
  ];

  // Filter by search query — when searching, force everything open
  const q = search.toLowerCase();
  const filteredCeremonies = q
    ? allCeremonies
        .map(c => ({
          ...c,
          phases: c.phases
            .map(p => ({
              ...p,
              agents: p.agents.filter(a =>
                a.label.toLowerCase().includes(q) ||
                a.slug.toLowerCase().includes(q) ||
                c.ceremony.toLowerCase().includes(q) ||
                p.phase.toLowerCase().includes(q)
              ),
            }))
            .filter(p => p.agents.length > 0),
        }))
        .filter(c => c.phases.length > 0)
    : allCeremonies;

  const hasAgentsLoaded = Object.keys(agentStatus).length > 0;
  const forceOpen = q.length > 0;

  // Count customized agents per ceremony for the badge
  const countCustomized = (ceremony) =>
    ceremony.phases
      .flatMap(p => p.agents)
      .filter(a => agentStatus[a.slug])
      .length;

  return (
    <div>
      {/* Sticky search bar */}
      <div className="sticky top-0 bg-white z-10 px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Search agents…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-48 rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-xs text-slate-400 italic flex-shrink-0">Click any agent to edit its prompt</span>
      </div>

      {/* Agent hierarchy list */}
      <div className="px-4 py-4 flex flex-col gap-3">
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
        {filteredCeremonies.length === 0 && (
          <p className="text-sm text-slate-400 py-4">No agents match your search.</p>
        )}

        {filteredCeremonies.map(ceremony => {
          const colors = CEREMONY_COLORS[ceremony.color] || CEREMONY_COLORS.slate;
          const ceremonyOpen = forceOpen || isOpen(ceremony.ceremony);
          const customCount = countCustomized(ceremony);

          return (
            <div
              key={ceremony.ceremony}
              className={`rounded-xl border ${colors.border} overflow-hidden`}
            >
              {/* Ceremony header — clickable to collapse/expand */}
              <button
                type="button"
                onClick={() => !forceOpen && toggle(ceremony.ceremony)}
                className={`w-full flex items-center gap-2 px-4 py-2.5 border-l-4 ${colors.header} ${colors.accent} text-left`}
              >
                {ceremonyOpen
                  ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                }
                <span className={`text-sm font-semibold flex-1 ${colors.text}`}>
                  {ceremony.ceremony}
                </span>
                {customCount > 0 && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                    {customCount} custom
                  </span>
                )}
              </button>

              {/* Ceremony body — collapsible */}
              {ceremonyOpen && (
                <div className="divide-y divide-slate-100">
                  {ceremony.phases.map(phase => {
                    const phaseKey = `${ceremony.ceremony}::${phase.phase}`;
                    const phaseOpen = forceOpen || isOpen(phaseKey);
                    const visibleAgents = phase.agents.filter(
                      a => !hasAgentsLoaded || a.slug in agentStatus
                    );
                    if (visibleAgents.length === 0) return null;

                    return (
                      <div key={phase.phase}>
                        {/* Phase sub-header — indented, highlighted as non-leaf node */}
                        <button
                          type="button"
                          onClick={() => !forceOpen && toggle(phaseKey)}
                          className="w-full flex items-center gap-2 pl-6 pr-4 py-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                        >
                          {phaseOpen
                            ? <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          }
                          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                            {phase.phase}
                          </span>
                          <span className="text-xs text-slate-400 ml-1">
                            {visibleAgents.length}
                          </span>
                        </button>

                        {/* Agent rows — further indented */}
                        {phaseOpen && (
                          <div className="pb-1">
                            {visibleAgents.map(agent => {
                              const isCustomized = agentStatus[agent.slug] ?? false;
                              return (
                                <button
                                  key={`${ceremony.ceremony}-${agent.slug}`}
                                  type="button"
                                  onClick={() => setOpenAgent(agent.slug)}
                                  className="w-full text-left pl-10 pr-4 py-1.5 hover:bg-slate-50 transition-colors flex items-center gap-3 group"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="text-sm text-slate-700 group-hover:text-slate-900">
                                      {agent.label}
                                    </span>
                                    {agent.note && (
                                      <span className="text-xs text-slate-400 italic ml-2">
                                        {agent.note}
                                      </span>
                                    )}
                                  </div>
                                  {isCustomized && (
                                    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                      Custom
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Agent editor popup */}
      {openAgent && (
        <AgentEditorPopup
          agentName={`${openAgent}.md`}
          onClose={() => setOpenAgent(null)}
          onSaved={() => setAgentStatus(prev => ({ ...prev, [openAgent]: true }))}
          onReset={() => setAgentStatus(prev => ({ ...prev, [openAgent]: false }))}
        />
      )}
    </div>
  );
}
