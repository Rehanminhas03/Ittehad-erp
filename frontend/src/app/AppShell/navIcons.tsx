/** One small inline icon per navigation section — no icon library, kept lightweight and inline. */
const paths: Record<string, string> = {
  Overview: 'M3 10.5 12 3l9 7.5M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5',
  Sales: 'M3 17 9 11l4 4 8-8M21 7h-5m5 0v5',
  Service: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L21 6l-3-3-3.3 3.3Z',
  Parts: 'M21 8 12 3 3 8m18 0-9 5m9-5v9l-9 5m0-9L3 8m9 5v9M3 8v9l9 5',
  Accounts: 'M4 5h16v14H4zM4 10h16M9 15h6',
  'Customers & vehicles': 'M5 17h14M6 17v-4l1.5-4.5A2 2 0 0 1 9.4 7h5.2a2 2 0 0 1 1.9 1.5L18 13v4M7.5 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm12 0a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
  Administration: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z',
};

export function NavIcon({ title, className }: { title: string; className?: string }) {
  const d = paths[title];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
