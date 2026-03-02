import { useState } from 'react';
import { Workflow } from 'lucide-react';
import { saveCeremonies } from '../../lib/api';
import { CeremonyWorkflowModal } from '../ceremony/CeremonyWorkflowModal';

function humanize(str) {
  return str
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const CEREMONY_DESCRIPTIONS = {
  'sponsor-call':    'Generates mission statement and project documentation through a structured AI-guided interview.',
  'sprint-planning': 'Plans and assigns work items for the upcoming sprint based on team capacity and priorities.',
  'seed':            'Seeds the initial project work item structure from the project documentation.',
};

export function CeremonyModelsTab({ settings, models, onSaved }) {
  const [ceremonies, setCeremonies] = useState(
    () => JSON.parse(JSON.stringify(settings.ceremonies || []))
  );
  const [missionGenValidation, setMissionGenValidation] = useState(
    () => JSON.parse(JSON.stringify(
      settings.missionGenerator?.validation || { maxIterations: 3, acceptanceThreshold: 95 }
    ))
  );
  const [activeWorkflow, setActiveWorkflow] = useState(null);

  const handleCeremonySave = async (updatedCeremony, updatedMG) => {
    const next = ceremonies.map((c) =>
      c.name === updatedCeremony.name ? updatedCeremony : c
    );
    // Always pass missionGen params; use updated value for sponsor-call, current for others
    const missionGenArg = updatedCeremony.name === 'sponsor-call'
      ? { validation: updatedMG || missionGenValidation }
      : { validation: missionGenValidation };
    await saveCeremonies(next, missionGenArg);
    setCeremonies(next);
    if (updatedCeremony.name === 'sponsor-call' && updatedMG) {
      setMissionGenValidation(updatedMG);
    }
    onSaved();
  };

  if (!ceremonies.length) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-slate-500">
          No ceremony configurations found yet. Run your first ceremony from the kanban board
          to populate settings here.
        </p>
      </div>
    );
  }

  const activeWorkflowCeremony = ceremonies.find((c) => c.name === activeWorkflow);

  return (
    <div className="px-5 py-4 flex flex-col gap-3">
      {ceremonies.map((ceremony) => {
        const description = CEREMONY_DESCRIPTIONS[ceremony.name];
        return (
          <div
            key={ceremony.name}
            className="border border-slate-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">
                {ceremony.displayName || humanize(ceremony.name || '')}
              </p>
              {description && (
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActiveWorkflow(ceremony.name)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md px-3 py-1.5 transition-colors flex-shrink-0"
            >
              <Workflow className="w-3.5 h-3.5" />
              Configure Models
            </button>
          </div>
        );
      })}

      {activeWorkflow && activeWorkflowCeremony && (
        <CeremonyWorkflowModal
          ceremony={activeWorkflowCeremony}
          models={models}
          missionGenValidation={activeWorkflow === 'sponsor-call' ? missionGenValidation : null}
          onClose={() => setActiveWorkflow(null)}
          onSave={handleCeremonySave}
        />
      )}
    </div>
  );
}
