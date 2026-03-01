import { useState, useEffect } from 'react';
import { X, BarChart2, DollarSign, ChevronDown, ChevronRight } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getCostHistory } from '../../lib/api';

const RANGE_TABS = [
  { label: 'Today', value: 'today' },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
];

function formatCostLabel(cost) {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return '< $0.01';
  return `$${cost.toFixed(2)}`;
}

function formatCostDetail(cost) {
  if (cost === 0) return '$0.0000';
  return `$${cost.toFixed(4)}`;
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCeremonyName(name) {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Strip parent prefix from stage name, e.g. "sponsor-call-validation" → "Validation" */
function formatStageName(name, parentName) {
  if (name === parentName) return 'Documentation';
  const prefix = `${parentName}-`;
  if (name.startsWith(prefix)) return formatCeremonyName(name.slice(prefix.length));
  return formatCeremonyName(name);
}

export function CostModal({ onClose }) {
  const [rangeMode, setRangeMode] = useState('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  // Fetch data when range changes
  useEffect(() => {
    setLoading(true);
    setData(null);

    let rangeArg;
    if (rangeMode === 'today') {
      const today = new Date().toISOString().split('T')[0];
      rangeArg = { from: today, to: today };
    } else if (rangeMode === 'custom') {
      if (!customFrom || !customTo) {
        setLoading(false);
        return;
      }
      rangeArg = { from: customFrom, to: customTo };
    } else {
      rangeArg = parseInt(rangeMode, 10);
    }

    getCostHistory(rangeArg)
      .then((d) => {
        setData(d);
        setLoading(false);
        // Auto-expand parents that have stages
        const init = {};
        (d.ceremonies || []).forEach((c) => {
          if (c.stages && c.stages.length > 0) init[c.name] = true;
        });
        setExpanded(init);
      })
      .catch(() => { setData({ daily: [], ceremonies: [] }); setLoading(false); });
  }, [rangeMode, customFrom, customTo]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleExpanded = (name) => setExpanded((prev) => ({ ...prev, [name]: !prev[name] }));

  // Totals come from parent nodes only — stages are already rolled up into them
  const totalCost   = data?.ceremonies.reduce((s, c) => s + c.cost,   0) ?? 0;
  const totalTokens = data?.ceremonies.reduce((s, c) => s + c.tokens, 0) ?? 0;
  const totalCalls  = data?.ceremonies.reduce((s, c) => s + c.calls,  0) ?? 0;
  const hasData = data && (data.daily.length > 0 || data.ceremonies.length > 0);

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{ height: '90vh', maxHeight: '900px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">LLM Cost Tracker</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-4 flex flex-col gap-5">
          {/* Time range tabs — always 2 rows */}
          <div className="flex flex-col gap-1.5">
            {/* Row 1: preset buttons + Custom */}
            <div className="flex items-center gap-2">
              {RANGE_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setRangeMode(String(tab.value))}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    rangeMode === String(tab.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                onClick={() => setRangeMode('custom')}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  rangeMode === 'custom'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Custom
              </button>
            </div>

            {/* Row 2: date inputs — always rendered to keep height constant */}
            <div className={`flex items-center gap-2 ${rangeMode !== 'custom' ? 'invisible' : ''}`}>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-sm border border-slate-300 rounded px-2 py-0.5 text-slate-700"
              />
              <span className="text-slate-400 text-sm">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-sm border border-slate-300 rounded px-2 py-0.5 text-slate-700"
              />
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          )}

          {/* No data */}
          {!loading && !hasData && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
              <BarChart2 className="w-10 h-10" />
              <p className="text-sm">No usage data for this period.</p>
              <p className="text-xs text-slate-300">Run a ceremony to start tracking costs.</p>
            </div>
          )}

          {/* Content */}
          {!loading && hasData && (
            <>
              {/* Stat chips */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Total Cost</p>
                  <p className="text-xl font-bold text-slate-900">{formatCostLabel(totalCost)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">this period</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Total Tokens</p>
                  <p className="text-xl font-bold text-slate-900">{formatTokens(totalTokens)}</p>
                  <p className="text-xs text-slate-400 mt-0.5">this period</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">API Calls</p>
                  <p className="text-xl font-bold text-slate-900">{totalCalls.toLocaleString()}</p>
                  <p className="text-xs text-slate-400 mt-0.5">this period</p>
                </div>
              </div>

              {/* Bar chart */}
              {data.daily.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Daily Cost</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data.daily} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDateLabel}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => `$${v.toFixed(2)}`}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        width={56}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v) => [`$${v.toFixed(4)}`, 'Cost']}
                        labelFormatter={(label) => formatDateLabel(label)}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <Bar dataKey="cost" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Ceremony breakdown — hierarchical */}
              {data.ceremonies.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">By Ceremony</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                          <th className="pb-2 font-medium">Ceremony / Stage</th>
                          <th className="pb-2 font-medium text-right">Calls</th>
                          <th className="pb-2 font-medium text-right">Tokens</th>
                          <th className="pb-2 font-medium text-right">Cost</th>
                          <th className="pb-2 font-medium pl-4">Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.ceremonies.map((c) => {
                          const pct = totalCost > 0 ? (c.cost / totalCost) * 100 : 0;
                          const hasStages = c.stages && c.stages.length > 0;
                          const isOpen = expanded[c.name];

                          return [
                            /* Parent row */
                            <tr
                              key={c.name}
                              className={`border-b border-slate-100 ${hasStages ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                              onClick={hasStages ? () => toggleExpanded(c.name) : undefined}
                            >
                              <td className="py-2 text-slate-800 font-semibold">
                                <div className="flex items-center gap-1.5">
                                  {hasStages
                                    ? (isOpen
                                        ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                        : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />)
                                    : <span className="w-3.5 flex-shrink-0" />
                                  }
                                  {formatCeremonyName(c.name)}
                                </div>
                              </td>
                              <td className="py-2 text-right text-slate-500">{c.calls}</td>
                              <td className="py-2 text-right text-slate-500">{formatTokens(c.tokens)}</td>
                              <td className="py-2 text-right text-slate-800 font-semibold">{formatCostDetail(c.cost)}</td>
                              <td className="py-2 pl-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-20 bg-slate-100 rounded-full h-1.5 flex-shrink-0">
                                    <div
                                      className="bg-blue-500 h-1.5 rounded-full"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-400">{Math.round(pct)}%</span>
                                </div>
                              </td>
                            </tr>,

                            /* Stage rows — shown when expanded */
                            ...(isOpen && hasStages ? c.stages.map((s) => {
                              const stagePct = c.cost > 0 ? (s.cost / c.cost) * 100 : 0;
                              return (
                                <tr key={`${c.name}/${s.name}`} className="border-b border-slate-50 bg-slate-50/50">
                                  <td className="py-1.5 text-slate-500 pl-7">
                                    {formatStageName(s.name, c.name)}
                                  </td>
                                  <td className="py-1.5 text-right text-slate-400 text-xs">{s.calls}</td>
                                  <td className="py-1.5 text-right text-slate-400 text-xs">{formatTokens(s.tokens)}</td>
                                  <td className="py-1.5 text-right text-slate-500 text-xs">{formatCostDetail(s.cost)}</td>
                                  <td className="py-1.5 pl-4">
                                    <div className="flex items-center gap-2">
                                      <div className="w-20 bg-slate-100 rounded-full h-1 flex-shrink-0">
                                        <div
                                          className="bg-blue-300 h-1 rounded-full"
                                          style={{ width: `${stagePct}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] text-slate-300">{Math.round(stagePct)}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }) : []),
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
