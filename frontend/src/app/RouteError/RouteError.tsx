import { isRouteErrorResponse, useRouteError } from 'react-router';

/**
 * Shown instead of a page that failed to render (for example after the app was updated while a tab
 * was open): a plain message and a Reload button instead of the developer error screen. Inside the
 * app layout the menu stays usable.
 */
export function RouteError() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : error instanceof Error ? error.message : null;
  // The app was updated since this tab loaded its code: a reload fetches the new version.
  const outdated = error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);

  return (
    <div className="surface mx-auto my-10 max-w-lg p-8 text-center" role="alert">
      <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-red-50 text-red-500">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden>
          <path d="M12 8v5m0 3h.01M10.3 3.9 2.7 17a2 2 0 0 0 1.73 3h15.14a2 2 0 0 0 1.73-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="text-base font-semibold text-slate-900">{outdated ? 'The app was updated' : 'Something went wrong on this page'}</h1>
      <p className="mt-1 text-sm text-slate-600">Reload the page to continue. Your saved work is not affected.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      >
        Reload
      </button>
      {detail && <p className="mt-4 text-xs break-words text-slate-400">{detail}</p>}
    </div>
  );
}
