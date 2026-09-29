import { cn } from '@/shared/lib';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin text-current', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function PageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-slate-400" role="status" aria-label="Loading">
      <Spinner className="size-6" />
    </div>
  );
}
