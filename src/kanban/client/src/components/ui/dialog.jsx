import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Dialog Component (shadcn/ui style)
 * Modal dialog with backdrop and animations
 */
export function Dialog({ open, onOpenChange, children }) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onOpenChange]);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 bg-black/50 z-50"
          />

          {/* Dialog Container */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {children}
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Dialog Content
 */
export function DialogContent({ className, children, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ duration: 0.2 }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden',
        'flex flex-col',
        className
      )}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 transition-opacity z-10"
      >
        <X className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </button>

      {children}
    </motion.div>
  );
}

/**
 * Dialog Header
 */
export function DialogHeader({ className, children }) {
  return (
    <div className={cn('flex flex-col space-y-1.5 px-6 pt-6 pb-4', className)}>
      {children}
    </div>
  );
}

/**
 * Dialog Title
 */
export function DialogTitle({ className, children }) {
  return (
    <h2 className={cn('text-2xl font-semibold leading-none tracking-tight', className)}>
      {children}
    </h2>
  );
}

/**
 * Dialog Description
 */
export function DialogDescription({ className, children }) {
  return (
    <p className={cn('text-sm text-slate-600', className)}>
      {children}
    </p>
  );
}
