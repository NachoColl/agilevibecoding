import { useCeremonyStore } from '../../../store/ceremonyStore';

function FileTag({ path }) {
  const short = path?.split('/').slice(-2).join('/') || path;
  return (
    <span className="inline-flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-xs px-2 py-1 rounded-md font-mono">
      <span>📄</span>
      {short}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

export function CompleteStep({ onClose }) {
  const { ceremonyResult } = useCeremonyStore();
  const r = ceremonyResult || {};

  const tokenInput = r.tokenUsage?.input || r.tokenUsage?.inputTokens || 0;
  const tokenOutput = r.tokenUsage?.output || r.tokenUsage?.outputTokens || 0;
  const tokenTotal = r.tokenUsage?.total || r.tokenUsage?.totalTokens || tokenInput + tokenOutput;
  const costTotal =
    r.cost?.total != null
      ? `$${r.cost.total.toFixed(4)}`
      : r.cost
        ? `$${Object.values(r.cost).reduce((a, v) => a + (typeof v === 'number' ? v : 0), 0).toFixed(4)}`
        : '—';

  const files = r.outputPath && r.contextPath
    ? [r.outputPath, r.contextPath]
    : r.filesGenerated || [];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-slate-900">Documentation Generated!</h2>
        <p className="text-sm text-slate-500 mt-1">
          Your project documentation is ready. The kanban board will refresh automatically.
        </p>
      </div>

      {files.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">Files created</p>
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <FileTag key={i} path={f} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Input tokens" value={tokenInput.toLocaleString()} />
        <Stat label="Output tokens" value={tokenOutput.toLocaleString()} />
        <Stat label="Estimated cost" value={costTotal} />
      </div>

      {r.model && (
        <p className="text-xs text-center text-slate-400">
          Model: <span className="font-mono">{r.model}</span>
        </p>
      )}

      {r.validationIssues?.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Quality fixes applied</p>
          <div className="space-y-1.5">
            {r.validationIssues.map((issue, i) => (
              <div key={i} className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                  issue.severity === 'critical' ? 'bg-red-100 text-red-700' :
                  issue.severity === 'major'    ? 'bg-amber-100 text-amber-700' :
                                                  'bg-slate-100 text-slate-500'
                }`}>{issue.severity}</span>
                <span className="text-slate-400 flex-shrink-0">{issue.stage}</span>
                <span className="text-slate-600">{issue.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-center pt-2">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-700 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
