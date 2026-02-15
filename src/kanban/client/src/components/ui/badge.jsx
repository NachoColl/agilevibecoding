import { cn } from '../../lib/utils';

/**
 * Badge Component (shadcn/ui style)
 */
export function Badge({ variant = 'default', className, children }) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        'transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2',
        {
          'border-transparent bg-slate-900 text-slate-50 hover:bg-slate-900/80':
            variant === 'default',
          'border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80':
            variant === 'secondary',
          'border-transparent bg-red-100 text-red-900 hover:bg-red-100/80':
            variant === 'destructive',
          'border-slate-200 text-slate-900': variant === 'outline',
        },
        className
      )}
    >
      {children}
    </div>
  );
}
