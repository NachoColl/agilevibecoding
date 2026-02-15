import { motion } from 'framer-motion';

/**
 * Loading Screen Component
 * Beautiful loading state with animation
 */
export function LoadingScreen({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="text-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="inline-block"
        >
          <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full" />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-4 text-slate-600 font-medium"
        >
          {message}
        </motion.p>
      </div>
    </div>
  );
}

/**
 * Card Skeleton Component
 * Skeleton placeholder for kanban cards
 */
export function CardSkeleton() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-6 bg-slate-200 rounded w-20"></div>
        <div className="h-6 bg-slate-200 rounded w-16"></div>
      </div>
      <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
      <div className="h-4 bg-slate-200 rounded w-3/4"></div>
    </div>
  );
}

/**
 * Column Skeleton Component
 * Skeleton placeholder for kanban columns
 */
export function ColumnSkeleton() {
  return (
    <div className="min-w-[320px] max-w-[380px] bg-slate-100 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="h-6 bg-slate-200 rounded w-24 animate-pulse"></div>
        <div className="h-6 bg-slate-200 rounded-full w-16 animate-pulse"></div>
      </div>
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
  );
}

/**
 * Board Skeleton Component
 * Skeleton placeholder for the entire kanban board
 */
export function BoardSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      <ColumnSkeleton />
      <ColumnSkeleton />
      <ColumnSkeleton />
      <ColumnSkeleton />
      <ColumnSkeleton />
    </div>
  );
}
