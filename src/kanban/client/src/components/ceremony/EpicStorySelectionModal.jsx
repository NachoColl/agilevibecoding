import { useState } from 'react';
import { useSprintPlanningStore } from '../../store/sprintPlanningStore';
import { confirmSprintPlanningSelection, cancelCeremony } from '../../lib/api';

// ── Inner component: only mounted when hierarchy is non-null ──────────────────
// Using a wrapper+inner pattern so useState can be lazily initialised from
// a non-null hierarchy prop, avoiding "hooks before conditional return" issues.

function SelectionContent({ hierarchy, onConfirm, onCancel }) {
  const [epicSel, setEpicSel] = useState(() => {
    const m = {};
    for (const e of hierarchy.epics) m[e.id] = true;
    return m;
  });
  const [storySel, setStorySel] = useState(() => {
    const m = {};
    for (const e of hierarchy.epics)
      for (const s of (e.stories || []))
        m[s.id] = true;
    return m;
  });

  const selectedEpicCount  = Object.values(epicSel).filter(Boolean).length;
  const totalEpicCount     = hierarchy.epics.length;
  const selectedStoryCount = Object.values(storySel).filter(Boolean).length;
  const totalStoryCount    = hierarchy.epics.reduce((n, e) => n + (e.stories?.length || 0), 0);
  const canConfirm         = selectedEpicCount > 0;

  const toggleEpic = (epicId, checked) => {
    setEpicSel(prev => ({ ...prev, [epicId]: checked }));
    const epic = hierarchy.epics.find(e => e.id === epicId);
    if (epic) {
      const update = {};
      for (const s of (epic.stories || [])) update[s.id] = checked;
      setStorySel(prev => ({ ...prev, ...update }));
    }
  };

  const toggleStory = (epicId, storyId, checked) => {
    const next = { ...storySel, [storyId]: checked };
    setStorySel(next);
    const epic = hierarchy.epics.find(e => e.id === epicId);
    if (epic) {
      const anyChecked = (epic.stories || []).some(s => next[s.id]);
      setEpicSel(prev => ({ ...prev, [epicId]: anyChecked }));
    }
  };

  const selectAll = () => {
    const em = {}, sm = {};
    for (const e of hierarchy.epics) {
      em[e.id] = true;
      for (const s of (e.stories || [])) sm[s.id] = true;
    }
    setEpicSel(em); setStorySel(sm);
  };

  const deselectAll = () => {
    const em = {}, sm = {};
    for (const e of hierarchy.epics) {
      em[e.id] = false;
      for (const s of (e.stories || [])) sm[s.id] = false;
    }
    setEpicSel(em); setStorySel(sm);
  };

  const handleConfirm = () => {
    const selectedEpicIds  = Object.entries(epicSel).filter(([, v]) => v).map(([k]) => k);
    const selectedStoryIds = Object.entries(storySel).filter(([, v]) => v).map(([k]) => k);
    onConfirm(selectedEpicIds, selectedStoryIds);
  };

  return (
    <>
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-200 flex-shrink-0">
        <h2 className="text-base font-semibold text-slate-900">Review Decomposed Work</h2>
        <p className="text-sm text-slate-500 mt-1">
          The AI has decomposed your scope into epics and stories. Select which items to carry
          forward into validation — deselected items will be skipped entirely.
        </p>
      </div>

      {/* Scrollable checklist */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
        {/* Counts + select-all controls */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{selectedEpicCount}/{totalEpicCount}</span> epics ·{' '}
            <span className="font-medium text-slate-700">{selectedStoryCount}/{totalStoryCount}</span> stories selected
          </p>
          <div className="flex items-center gap-1.5">
            <button onClick={selectAll} className="text-xs px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              Select all
            </button>
            <button onClick={deselectAll} className="text-xs px-2 py-0.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              Deselect all
            </button>
          </div>
        </div>

        {/* Two-level checklist */}
        <div className="space-y-2">
          {hierarchy.epics.map(epic => {
            const epicChecked = epicSel[epic.id] ?? false;
            const stories = epic.stories || [];
            return (
              <div key={epic.id} className="rounded-lg border border-slate-200 overflow-hidden">
                {/* Epic row */}
                <label className="flex items-start gap-3 px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 select-none">
                  <input
                    type="checkbox"
                    checked={epicChecked}
                    onChange={e => toggleEpic(epic.id, e.target.checked)}
                    className="mt-0.5 flex-shrink-0 accent-slate-900"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">{epic.name}</p>
                    {epic.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{epic.description}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {stories.length} {stories.length === 1 ? 'story' : 'stories'}
                      {epic.domain ? <span className="ml-1 text-slate-300">· {epic.domain}</span> : null}
                    </p>
                  </div>
                </label>

                {/* Story rows */}
                {stories.length > 0 && (
                  <div className="divide-y divide-slate-100">
                    {stories.map(story => (
                      <label
                        key={story.id}
                        className="flex items-start gap-3 px-4 py-2 pl-10 cursor-pointer hover:bg-slate-50 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={storySel[story.id] ?? false}
                          onChange={e => toggleStory(epic.id, story.id, e.target.checked)}
                          className="mt-0.5 flex-shrink-0 accent-slate-600"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-800">{story.name}</p>
                          {story.userType && (
                            <p className="text-xs text-slate-400 mt-0.5">{story.userType}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 flex-shrink-0">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
        >
          ✕ Cancel Run
        </button>
        <button
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="px-6 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Confirm Selection →
        </button>
      </div>
    </>
  );
}

// ── Outer wrapper: guards on status + hierarchy ───────────────────────────────

export function EpicStorySelectionModal() {
  const {
    status,
    decomposedHierarchy,
    setStatus,
    setStep,
    setDecomposedHierarchy,
    setError,
  } = useSprintPlanningStore();

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Only render when the worker is waiting for selection
  if (status !== 'awaiting-selection' || !decomposedHierarchy) return null;

  const handleConfirm = async (selectedEpicIds, selectedStoryIds) => {
    setDecomposedHierarchy(null);
    setStatus('running');
    setStep(2);
    try {
      await confirmSprintPlanningSelection(selectedEpicIds, selectedStoryIds);
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  };

  const handleConfirmCancel = async () => {
    setShowCancelConfirm(false);
    try { await cancelCeremony(); } catch (_) {}
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      {/* Non-dismissible backdrop — user must make a selection or cancel */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Cancel confirmation overlay */}
        {showCancelConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 rounded-2xl">
            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-6 max-w-sm mx-4 text-center space-y-4">
              <p className="text-base font-semibold text-slate-900">Cancel sprint planning?</p>
              <p className="text-sm text-slate-500">
                Any epics and stories created in this run will be permanently deleted.
              </p>
              <div className="flex gap-3 justify-center pt-1">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Go Back
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  Cancel Run
                </button>
              </div>
            </div>
          </div>
        )}

        <SelectionContent
          hierarchy={decomposedHierarchy}
          onConfirm={handleConfirm}
          onCancel={() => setShowCancelConfirm(true)}
        />
      </div>
    </div>
  );
}
