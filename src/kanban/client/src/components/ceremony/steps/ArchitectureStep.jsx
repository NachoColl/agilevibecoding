import { useCeremonyStore } from '../../../store/ceremonyStore';

const COST_TIER_COLOR = {
  'Free': 'text-green-600',
  '$':    'text-green-600',
  '$$':   'text-amber-500',
  '$$$':  'text-orange-500',
  '$$$$': 'text-red-500',
};

function ArchCard({ arch, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(arch)}
      className={`text-left rounded-xl border-2 p-4 w-full transition-all ${
        selected
          ? 'border-indigo-500 bg-indigo-50'
          : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="font-semibold text-slate-900 text-sm">{arch.name}</span>
        {arch.requiresCloudProvider ? (
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full whitespace-nowrap">
            Cloud
          </span>
        ) : (
          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap">
            Local
          </span>
        )}
      </div>

      <p className="text-xs text-slate-600 mb-2 line-clamp-3">{arch.description}</p>

      {arch.bestFor && (
        <p className="text-xs text-slate-500 italic">Best for: {arch.bestFor}</p>
      )}

      {arch.costTier && (
        <p className={`mt-2 text-sm font-semibold ${COST_TIER_COLOR[arch.costTier] ?? 'text-slate-500'}`}>
          {arch.costTier}
        </p>
      )}

      {arch.migrationPath && (
        <div className="mt-2 text-xs text-slate-400">
          Migration to cloud: {arch.migrationPath.estimatedMigrationEffort} (
          {arch.migrationPath.migrationComplexity})
        </div>
      )}
    </button>
  );
}

export function ArchitectureStep({ onNext, onBack, analyzing }) {
  const { archOptions, selectedArch, setSelectedArch } = useCeremonyStore();

  if (!archOptions || archOptions.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center text-slate-400">
          <p>Loading architecture recommendations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Architecture Selection</h2>
        <p className="text-sm text-slate-500 mt-1">
          Choose the deployment architecture that fits your project best.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {archOptions.map((arch, i) => (
          <ArchCard
            key={i}
            arch={arch}
            selected={selectedArch === arch}
            onSelect={setSelectedArch}
          />
        ))}
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNext}
            disabled={analyzing}
            className="text-sm text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors"
          >
            Skip — let the model decide
          </button>
          <button
            onClick={onNext}
            disabled={!selectedArch || analyzing}
            className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors flex items-center gap-2"
          >
            {analyzing ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Preparing requirements…
              </>
            ) : (
              'Continue'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
