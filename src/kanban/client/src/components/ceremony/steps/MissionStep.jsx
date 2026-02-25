import { useState } from 'react';
import { useCeremonyStore } from '../../../store/ceremonyStore';
import { AskModelPopup } from '../AskModelPopup';

export function MissionStep({ onNext, onBack, analyzing, onOpenSettings }) {
  const { mission, setMission, initialScope, setInitialScope } = useCeremonyStore();
  const [showPopup, setShowPopup] = useState(false);

  const canContinue = mission.trim().length > 0 && initialScope.trim().length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Mission & Scope</h2>
        <p className="text-sm text-slate-500 mt-1">
          Describe what your project does and what it will deliver in the first version.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-slate-700">
              Mission Statement <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={() => setShowPopup(true)}
              className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
            >
              ✨ Ask a Model
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-2">
            A concise statement describing the core purpose and value proposition.
            Example: "Enable small businesses to manage inventory through an intuitive mobile-first platform."
          </p>
          <textarea
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            rows={3}
            placeholder="Enter your mission statement..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {!mission.trim() && (
            <p className="text-xs text-red-500 mt-1">Mission statement is required.</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Initial Scope <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-slate-400 mb-2">
            Describe key features, main workflows, and core functionality for the first version.
            Example: "Users can create tasks, assign them to team members, track progress, and set deadlines."
          </p>
          <textarea
            value={initialScope}
            onChange={(e) => setInitialScope(e.target.value)}
            rows={4}
            placeholder="Describe the initial scope and features..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={analyzing}
          className="text-sm text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={!canContinue || analyzing}
          className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          {analyzing ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analysing…
            </>
          ) : (
            'Continue'
          )}
        </button>
      </div>

      {showPopup && (
        <AskModelPopup
          onUse={(generatedMission, generatedScope) => {
            setMission(generatedMission);
            setInitialScope(generatedScope);
            setShowPopup(false);
          }}
          onClose={() => setShowPopup(false)}
          onOpenSettings={onOpenSettings}
        />
      )}
    </div>
  );
}
