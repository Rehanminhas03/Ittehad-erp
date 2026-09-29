export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center" role="alert">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-red-50 text-red-500">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path d="M12 8v5m0 3h.01M10.3 3.9 2.7 17a2 2 0 0 0 1.73 3h15.14a2 2 0 0 0 1.73-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-sm text-slate-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700">
          Try again
        </button>
      )}
    </div>
  );
}
