import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
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
} from 'lucide-react';
import { getWorkItem, getWorkItemDoc, getWorkItemContext } from '../../lib/api';
import { getStatusMetadata } from '../../lib/status-grouping';
import { cn } from '../../lib/utils';

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
export function CardDetailModal({ workItem, open, onOpenChange, onNavigate }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [fullDetails, setFullDetails] = useState(null);
  const [documentation, setDocumentation] = useState(null);
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load full details when modal opens
  useEffect(() => {
    if (open && workItem) {
      loadFullDetails();
    }
  }, [open, workItem?.id]);

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

    try {
      // Load full item details
      const details = await getWorkItem(workItem.id);
      setFullDetails(details);

      // Load documentation if available
      try {
        const doc = await getWorkItemDoc(workItem.id);
        setDocumentation(doc);
      } catch (err) {
        setDocumentation(null);
      }

      // Load context if available
      try {
        const ctx = await getWorkItemContext(workItem.id);
        setContext(ctx);
      } catch (err) {
        setContext(null);
      }
    } catch (err) {
      setError(err.message);
      console.error('Failed to load work item details:', err);
    } finally {
      setLoading(false);
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
          <div className="px-6 pb-2 border-b border-slate-100">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview">
                  <FileText className="w-4 h-4 mr-2" />
                  Overview
                </TabsTrigger>
                {context && (
                  <TabsTrigger value="context">
                    <BookOpen className="w-4 h-4 mr-2" />
                    Context
                  </TabsTrigger>
                )}
                {documentation && (
                  <TabsTrigger value="documentation">
                    <FileText className="w-4 h-4 mr-2" />
                    Documentation
                  </TabsTrigger>
                )}
                {fullDetails?.children && fullDetails.children.length > 0 && (
                  <TabsTrigger value="children">
                    <Users className="w-4 h-4 mr-2" />
                    Children ({fullDetails.children.length})
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
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
                {/* Overview Tab */}
                <TabsContent value="overview">
                  <div className="space-y-6">
                    {/* Description */}
                    {fullDetails?.description && (
                      <div>
                        <h3 className="text-sm font-semibold text-slate-700 mb-2">
                          Description
                        </h3>
                        <p className="text-slate-600">{fullDetails.description}</p>
                      </div>
                    )}

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Parent */}
                      {fullDetails?.parentName && (
                        <div>
                          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                            <Package className="w-4 h-4" />
                            <span>Parent</span>
                          </div>
                          <p className="text-slate-900 font-medium">
                            {fullDetails.parentName}
                          </p>
                          <p className="text-xs text-slate-500">{fullDetails.parentId}</p>
                        </div>
                      )}

                      {/* Epic */}
                      {fullDetails?.epicName && workItem.type !== 'epic' && (
                        <div>
                          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                            <Package className="w-4 h-4" />
                            <span>Epic</span>
                          </div>
                          <p className="text-slate-900 font-medium">
                            {fullDetails.epicName}
                          </p>
                          <p className="text-xs text-slate-500">{fullDetails.epicId}</p>
                        </div>
                      )}

                      {/* Created */}
                      {fullDetails?.created && (
                        <div>
                          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                            <Calendar className="w-4 h-4" />
                            <span>Created</span>
                          </div>
                          <p className="text-slate-900">
                            {new Date(fullDetails.created).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Dependencies */}
                    {fullDetails?.dependencies && fullDetails.dependencies.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                          <Link2 className="w-4 h-4" />
                          <span>Dependencies ({fullDetails.dependencies.length})</span>
                        </div>
                        <ul className="space-y-2">
                          {fullDetails.dependencies.map((dep) => (
                            <li
                              key={dep}
                              className="text-sm text-slate-600 pl-6 border-l-2 border-slate-200"
                            >
                              {dep}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Context Tab */}
                {context && (
                  <TabsContent value="context">
                    <div className="prose prose-slate max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: context }} />
                    </div>
                  </TabsContent>
                )}

                {/* Documentation Tab */}
                {documentation && (
                  <TabsContent value="documentation">
                    <div className="prose prose-slate max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: documentation }} />
                    </div>
                  </TabsContent>
                )}

                {/* Children Tab */}
                {fullDetails?.children && fullDetails.children.length > 0 && (
                  <TabsContent value="children">
                    <div className="space-y-2">
                      {fullDetails.children.map((child) => {
                        const childStatusMeta = getStatusMetadata(child.status);
                        const childTypeMeta = TYPE_METADATA[child.type];

                        return (
                          <div
                            key={child.id}
                            className="p-4 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
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
                            </div>
                          </div>
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
    </Dialog>
  );
}
