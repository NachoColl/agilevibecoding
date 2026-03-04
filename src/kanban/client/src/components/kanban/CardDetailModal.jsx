import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Badge } from '../ui/badge';
import {
  FileText,
  BookOpen,
  Users,
  Link2,
  Calendar,
  Package,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
  Save,
  ChevronUp,
  Wand2,
} from 'lucide-react';
import {
  getWorkItem,
  getWorkItemDoc,
  getWorkItemDocRaw,
  updateWorkItemDoc,
  getProjectDoc,
} from '../../lib/api';
import { getStatusMetadata } from '../../lib/status-grouping';
import { cn } from '../../lib/utils';
import { RefineWorkItemPopup } from './RefineWorkItemPopup';

/**
 * Clickable item box — same visual style as the children list.
 */
function ItemBox({ item, fallbackName, fallbackId, onItemClick }) {
  const typeMeta = item ? TYPE_METADATA[item.type] : null;
  const statusMeta = item ? getStatusMetadata(item.status) : null;

  return (
    <button
      onClick={() => item && onItemClick?.(item)}
      disabled={!item}
      className="w-full text-left p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-default"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 mb-1 truncate">{item?.name ?? fallbackName}</p>
          {item?.description && (
            <p className="text-xs text-slate-500 mb-1 line-clamp-2">{item.description}</p>
          )}
          {(statusMeta || typeMeta) && (
            <div className="flex items-center gap-2 mt-1">
              {statusMeta && (
                <Badge variant="secondary" className={cn(
                  'text-xs',
                  statusMeta.color === 'green' && 'bg-green-100 text-green-700',
                  statusMeta.color === 'blue' && 'bg-blue-100 text-blue-700',
                  statusMeta.color === 'yellow' && 'bg-yellow-100 text-yellow-700',
                  statusMeta.color === 'purple' && 'bg-purple-100 text-purple-700',
                  statusMeta.color === 'red' && 'bg-red-100 text-red-700',
                )}>
                  {statusMeta.icon} {statusMeta.label}
                </Badge>
              )}
              {typeMeta && (
                <Badge variant="outline" className="text-xs">
                  {typeMeta.icon} {typeMeta.label}
                </Badge>
              )}
            </div>
          )}
        </div>
        {item && <ChevronRight className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0 ml-2" />}
      </div>
    </button>
  );
}

/**
 * Inline viewer for a parent's (or project root's) doc or context file.
 * item = { id, name } for work items, or { id: 'project', name: 'Project' } for root.
 */
function ParentFileLink({ item }) {
  const [expanded, setExpanded] = useState(false);
  const [html, setHtml] = useState(null);

  const load = async () => {
    if (html !== null) { setExpanded(!expanded); return; }
    const content = item.id === 'project'
      ? await getProjectDoc()
      : await getWorkItemDoc(item.id).catch(() => '');
    setHtml(content || '<p class="text-slate-400 italic">No content</p>');
    setExpanded(true);
  };

  const isProject = item.id === 'project';

  return (
    <div className="w-full">
      <button
        onClick={load}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium ${
          isProject
            ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
        }`}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {item.name} — doc.md
      </button>
      {expanded && html && (
        <div className="mt-2 ml-4 p-3 border-l-2 border-slate-200 prose prose-sm prose-slate max-w-none">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}

/**
 * Work item type metadata
 */
const TYPE_METADATA = {
  epic: { color: 'indigo', icon: '🏛️', label: 'Epic' },
  story: { color: 'blue', icon: '📖', label: 'Story' },
  task: { color: 'emerald', icon: '⚙️', label: 'Task' },
  subtask: { color: 'gray', icon: '📝', label: 'Subtask' },
};

/**
 * Card Detail Modal Component
 * Displays full work item details with tabbed sections
 */
export function CardDetailModal({ workItem, open, onOpenChange, onNavigate, onItemClick, allItems, refineProgress, refineResult, refineError, onClearRefine }) {
  const [activeTab, setActiveTab] = useState('documentation');
  const [fullDetails, setFullDetails] = useState(null);
  const [documentation, setDocumentation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Edit mode state
  const [editingDoc, setEditingDoc] = useState(false);
  const [docDraft, setDocDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // Parent chain for navigation
  const [parentChain, setParentChain] = useState([]);

  // Refine popup state
  const [refineOpen, setRefineOpen] = useState(false);

  // Reload full details after a successful refine apply
  const handleRefineAccepted = () => {
    setRefineOpen(false);
    onClearRefine?.();
    loadFullDetails();
  };

  // Load full details when modal opens
  useEffect(() => {
    if (open && workItem) {
      loadFullDetails();
    }
  }, [open, workItem?.id]);

  // Fall back to 'details' tab if no doc.md available
  useEffect(() => {
    if (!loading && documentation === null) setActiveTab('details');
  }, [loading, documentation]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyPress = (e) => {
      if (e.key === 'ArrowLeft') {
        onNavigate?.('prev');
      } else if (e.key === 'ArrowRight') {
        onNavigate?.('next');
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [open, onNavigate]);

  const loadFullDetails = async () => {
    if (!workItem) return;

    setLoading(true);
    setError(null);
    setEditingDoc(false);

    try {
      const details = await getWorkItem(workItem.id);
      setFullDetails(details);

      // Build parent chain: project root → … → grandparent → parent
      const chain = [{ id: 'project', name: 'Project' }];
      if (allItems) {
        const ancestors = [];
        let parentId = details.parentId;
        while (parentId) {
          const parent = allItems.find((i) => i.id === parentId);
          if (!parent) break;
          ancestors.unshift(parent);
          parentId = parent.parentId;
        }
        chain.push(...ancestors);
      }
      setParentChain(chain);

      const doc = await getWorkItemDoc(workItem.id).catch(() => null);
      setDocumentation(doc || null);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load work item details:', err);
    } finally {
      setLoading(false);
    }
  };

  const startEditDoc = async () => {
    const raw = await getWorkItemDocRaw(workItem.id);
    setDocDraft(raw);
    setEditingDoc(true);
  };

  const saveDoc = async () => {
    setSaving(true);
    try {
      await updateWorkItemDoc(workItem.id, docDraft);
      const html = await getWorkItemDoc(workItem.id);
      setDocumentation(html);
      setEditingDoc(false);
    } finally {
      setSaving(false);
    }
  };

  if (!workItem) return null;

  const statusMeta = getStatusMetadata(workItem.status);
  const typeMeta = TYPE_METADATA[workItem.type] || TYPE_METADATA.task;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        {/* Header */}
        <DialogHeader>
          <div className="flex items-start justify-between pr-8">
            <div className="flex-1">
              <DialogTitle className="mb-2">{workItem.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 flex-wrap">
                {/* Status Badge */}
                <Badge
                  variant="secondary"
                  className={cn(
                    statusMeta?.color === 'blue' && 'bg-blue-100 text-blue-700',
                    statusMeta?.color === 'yellow' && 'bg-yellow-100 text-yellow-700',
                    statusMeta?.color === 'green' && 'bg-green-100 text-green-700',
                    statusMeta?.color === 'purple' && 'bg-purple-100 text-purple-700',
                    statusMeta?.color === 'red' && 'bg-red-100 text-red-700'
                  )}
                >
                  {statusMeta?.icon} {statusMeta?.label}
                </Badge>

                {/* Type Badge */}
                <Badge variant="outline">{typeMeta.icon} {typeMeta.label}</Badge>

                {/* ID */}
                <span className="text-slate-400 text-xs">{workItem.id}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-6 pb-2 border-b border-slate-100 flex items-center justify-between gap-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                {documentation && (
                  <TabsTrigger value="documentation">
                    <BookOpen className="w-4 h-4 mr-2" />
                    Documentation
                  </TabsTrigger>
                )}
                <TabsTrigger value="details">
                  <FileText className="w-4 h-4 mr-2" />
                  Details
                </TabsTrigger>
                {fullDetails?.children && fullDetails.children.length > 0 && (
                  <TabsTrigger value="children">
                    <Users className="w-4 h-4 mr-2" />
                    Children ({fullDetails.children.length})
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>

            {/* Validation score + Refine button — right side, same row as tabs */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {(() => {
                const vr = fullDetails?.metadata?.validationResult;
                if (!vr) return null;
                const score = vr.averageScore ?? null;
                const critCount = (vr.criticalIssues || []).length;
                const majCount  = (vr.majorIssues  || []).length;
                const minCount  = (vr.minorIssues  || []).length;
                const totalIssues = critCount + majCount + minCount;
                return (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`font-bold px-2 py-0.5 rounded-full ${
                      score >= 95 ? 'bg-green-100 text-green-700'
                        : score >= 80 ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                    }`}>{score}/100</span>
                    {totalIssues > 0 && (
                      <span>
                        {critCount > 0 && <span className="text-red-600 font-medium">{critCount} critical</span>}
                        {critCount > 0 && majCount > 0 && <span className="mx-0.5">·</span>}
                        {majCount > 0 && <span className="text-orange-600 font-medium">{majCount} major</span>}
                        {(critCount > 0 || majCount > 0) && minCount > 0 && <span className="mx-0.5">·</span>}
                        {minCount > 0 && <span className="text-amber-600">{minCount} minor</span>}
                      </span>
                    )}
                  </div>
                );
              })()}
              {fullDetails && (
                <button
                  onClick={() => setRefineOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Refine with AI
                </button>
              )}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-600">Failed to load details: {error}</p>
              </div>
            ) : (
              <Tabs value={activeTab}>
                {/* Documentation Tab */}
                {documentation && (
                  <TabsContent value="documentation">
                    {/* Parent chain links */}
                    {parentChain.length > 0 && (
                      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {parentChain.map((ancestor) => (
                          <ParentFileLink key={ancestor.id} item={ancestor} fileType="doc" />
                        ))}
                      </div>
                    )}
                    {/* Edit toolbar */}
                    <div className="flex justify-end mb-2">
                      {editingDoc ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setEditingDoc(false)}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded"
                          >
                            <X className="w-3 h-3" /> Cancel
                          </button>
                          <button
                            onClick={saveDoc}
                            disabled={saving}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50"
                          >
                            <Save className="w-3 h-3" /> {saving ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={startEditDoc}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </div>
                    {editingDoc ? (
                      <textarea
                        className="w-full h-96 p-3 text-sm font-mono border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
                        value={docDraft}
                        onChange={(e) => setDocDraft(e.target.value)}
                      />
                    ) : (
                      <div className="prose prose-slate max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: documentation }} />
                      </div>
                    )}
                  </TabsContent>
                )}

                {/* Details Tab */}
                <TabsContent value="details">
                  <div className="space-y-6">
                    {/* Created */}
                    {fullDetails?.created && (
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <Calendar className="w-4 h-4" />
                        <span>Created {new Date(fullDetails.created).toLocaleDateString()}</span>
                      </div>
                    )}

                    {/* Parent */}
                    {fullDetails?.parentName && (() => {
                      const parent = allItems?.find((i) => i.id === fullDetails.parentId);
                      return (
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                            <Package className="w-4 h-4" />
                            <span>Parent</span>
                          </div>
                          <ItemBox item={parent} fallbackName={fullDetails.parentName} fallbackId={fullDetails.parentId} onItemClick={onItemClick} />
                        </div>
                      );
                    })()}

                    {/* Epic */}
                    {fullDetails?.epicName && workItem.type !== 'epic' && (() => {
                      const epic = allItems?.find((i) => i.id === fullDetails.epicId);
                      return (
                        <div>
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                            <Package className="w-4 h-4" />
                            <span>Epic</span>
                          </div>
                          <ItemBox item={epic} fallbackName={fullDetails.epicName} fallbackId={fullDetails.epicId} onItemClick={onItemClick} />
                        </div>
                      );
                    })()}

                    {/* Dependencies */}
                    {fullDetails?.dependencies && fullDetails.dependencies.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                          <Link2 className="w-4 h-4" />
                          <span>Dependencies ({fullDetails.dependencies.length})</span>
                        </div>
                        <div className="space-y-2">
                          {fullDetails.dependencies.map((depId) => {
                            const depItem = allItems?.find((i) => i.id === depId);
                            return <ItemBox key={depId} item={depItem} fallbackName={depId} fallbackId={depId} onItemClick={onItemClick} />;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Children Tab */}
                {fullDetails?.children && fullDetails.children.length > 0 && (
                  <TabsContent value="children">
                    <div className="space-y-2">
                      {fullDetails.children.map((child) => {
                        const childStatusMeta = getStatusMetadata(child.status);
                        const childTypeMeta = TYPE_METADATA[child.type];

                        const fullChild = allItems?.find((i) => i.id === child.id);

                        return (
                          <button
                            key={child.id}
                            onClick={() => fullChild && onItemClick?.(fullChild)}
                            className="w-full text-left p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium text-slate-900 mb-1">
                                  {child.name}
                                </h4>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      'text-xs',
                                      childStatusMeta?.color === 'green' &&
                                        'bg-green-100 text-green-700',
                                      childStatusMeta?.color === 'blue' &&
                                        'bg-blue-100 text-blue-700',
                                      childStatusMeta?.color === 'yellow' &&
                                        'bg-yellow-100 text-yellow-700'
                                    )}
                                  >
                                    {childStatusMeta?.icon} {childStatusMeta?.label}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {childTypeMeta?.icon} {childTypeMeta?.label}
                                  </Badge>
                                </div>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400 mt-1 flex-shrink-0" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </TabsContent>
                )}
              </Tabs>
            )}
          </div>
        </div>

        {/* Footer with Navigation */}
        {onNavigate && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={() => onNavigate('prev')}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <span className="text-xs text-slate-400">Use ← → to navigate</span>
            <button
              onClick={() => onNavigate('next')}
              className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </DialogContent>

      {/* Refine popup — rendered outside DialogContent so it stacks above the modal */}
      {refineOpen && fullDetails && (
        <RefineWorkItemPopup
          item={fullDetails}
          refineProgress={refineProgress?.itemId === fullDetails.id ? refineProgress : null}
          refineResult={refineResult?.itemId === fullDetails.id ? refineResult : null}
          refineError={refineError?.itemId === fullDetails.id ? refineError : null}
          onClose={() => { setRefineOpen(false); onClearRefine?.(); }}
          onAccepted={handleRefineAccepted}
        />
      )}
    </Dialog>
  );
}
