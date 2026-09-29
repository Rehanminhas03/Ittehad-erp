export function Forbidden() {
  return (
    <div className="py-20 text-center">
      <p className="text-lg font-semibold text-slate-900">Not available</p>
      <p className="mt-1 text-sm text-slate-500">Your roles do not include access to this page.</p>
    </div>
  );
}
