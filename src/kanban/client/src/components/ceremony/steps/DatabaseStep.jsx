import { useCeremonyStore } from '../../../store/ceremonyStore';

/** Convert a monetary string like "$150-280/month" into a relative $ tier. */
function costTier(monthly) {
  if (!monthly) return null;
  const str = String(monthly).toLowerCase();
  const nums = (str.match(/\d+/g) || []).map(Number).filter((n) => n > 0);
  const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  if (avg === 0) return { symbols: 'Free', color: 'text-green-600' };
  if (avg <= 50)  return { symbols: '$',    color: 'text-green-600' };
  if (avg <= 150) return { symbols: '$$',   color: 'text-amber-500' };
  if (avg <= 350) return { symbols: '$$$',  color: 'text-orange-500' };
  return           { symbols: '$$$$', color: 'text-red-500' };
}

function DbOptionCard({ option, type, selected, onSelect }) {
  const label = type === 'sql' ? 'SQL' : 'NoSQL';
  const color = type === 'sql' ? 'blue' : 'emerald';

  const colorMap = {
    blue: {
      badge: 'bg-blue-100 text-blue-700',
      border: 'border-blue-500',
      bg: 'bg-blue-50',
      btn: 'ring-blue-500',
    },
    emerald: {
      badge: 'bg-emerald-100 text-emerald-700',
      border: 'border-emerald-500',
      bg: 'bg-emerald-50',
      btn: 'ring-emerald-500',
    },
  };
  const c = colorMap[color];

  return (
    <button
      onClick={() => onSelect(type)}
      className={`text-left rounded-xl border-2 p-5 w-full transition-all ${
        selected ? `${c.border} ${c.bg}` : 'border-slate-200 hover:border-slate-300 bg-white'
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.badge}`}>{label}</span>
        <span className="font-semibold text-slate-900">{option.database}</span>
      </div>

      {option.specificVersion && (
        <p className="text-xs text-slate-500 mb-2">Version: {option.specificVersion}</p>
      )}

      {option.estimatedCosts && (() => {
        const tier = costTier(option.estimatedCosts.monthly);
        return tier ? (
          <p className={`text-sm font-semibold mb-2 ${tier.color}`}>{tier.symbols}</p>
        ) : null;
      })()}

      {option.keyStrengths && option.keyStrengths.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-slate-500 mb-1">Strengths</p>
          <ul className="space-y-0.5">
            {option.keyStrengths.slice(0, 3).map((s, i) => (
              <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                <span className="mt-1 w-1 h-1 rounded-full bg-slate-400 flex-shrink-0" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {option.tradeoffs && (
        <p className="text-xs text-slate-400 mt-2 italic">{option.tradeoffs}</p>
      )}
    </button>
  );
}

export function DatabaseStep({ onNext, onBack, analyzing }) {
  const { dbResult, dbChoice, setDbChoice } = useCeremonyStore();

  if (!dbResult) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center text-slate-400">
          <p>Loading database analysis...</p>
        </div>
      </div>
    );
  }

  const { comparison, rationale } = dbResult;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Database Choice</h2>
        <p className="text-sm text-slate-500 mt-1">
          Choose between SQL and NoSQL based on your project's data needs.
        </p>
        {rationale && (
          <p className="text-sm text-slate-600 mt-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            {rationale}
          </p>
        )}
      </div>

      {comparison && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DbOptionCard
            option={comparison.sqlOption}
            type="sql"
            selected={dbChoice === 'sql'}
            onSelect={setDbChoice}
          />
          <DbOptionCard
            option={comparison.nosqlOption}
            type="nosql"
            selected={dbChoice === 'nosql'}
            onSelect={setDbChoice}
          />
        </div>
      )}

      {dbResult.keyMetrics && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 px-4 py-3">
          <p className="text-xs font-medium text-slate-500 mb-1">Project metrics considered</p>
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 items-start">
            {dbResult.keyMetrics.estimatedReadWriteRatio && (
              <div><span className="font-medium text-slate-500">R/W </span>{dbResult.keyMetrics.estimatedReadWriteRatio}</div>
            )}
            {dbResult.keyMetrics.expectedThroughput && (
              <div><span className="font-medium text-slate-500">Throughput </span>{dbResult.keyMetrics.expectedThroughput}</div>
            )}
            {dbResult.keyMetrics.dataComplexity && (
              <div><span className="font-medium text-slate-500">Complexity </span>{dbResult.keyMetrics.dataComplexity}</div>
            )}
          </div>
        </div>
      )}

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
          disabled={!dbChoice || analyzing}
          className="px-5 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-slate-700 transition-colors flex items-center gap-2"
        >
          {analyzing ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Analyzing...
            </>
          ) : (
            'Continue'
          )}
        </button>
      </div>
    </div>
  );
}
