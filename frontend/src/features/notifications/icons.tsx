/** Small icons for the notification UI (inherit the text colour). */
export function BellIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <path
        d="M10 2.5a5 5 0 0 0-5 5v2.8l-1.3 2.4a.8.8 0 0 0 .7 1.2h11.2a.8.8 0 0 0 .7-1.2L15 10.3V7.5a5 5 0 0 0-5-5ZM8 15.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "Mark as read": a check mark. */
export function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <path d="M4 6h12M8 6V4.5h4V6m-6.5 0 .7 9.3a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L14.5 6M8.5 9v4.5M11.5 9v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
