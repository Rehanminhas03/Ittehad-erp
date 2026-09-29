import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Spinner } from '@/shared/components/ui';
import { cn } from '@/shared/lib';
import { BellIcon, CheckIcon } from './icons';
import { useGetUnreadNotificationCountQuery, useListNotificationsQuery, useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation } from './notificationsApi';
import { timeAgo } from './time';

/**
 * Top-bar bell: the number of unread notifications (updated live), and a dropdown of the latest 4
 * with "mark as read"; "See more" opens the Notifications page.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: unread } = useGetUnreadNotificationCountQuery(undefined, { refetchOnFocus: true });
  const { data: latest, isLoading } = useListNotificationsQuery({ page: 1, pageSize: 4 }, { skip: !open });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const count = unread?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-full p-1.5 text-slate-600 hover:bg-white/60 hover:text-slate-900"
        aria-label={count ? `${count} unread notifications` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Notifications"
      >
        <BellIcon className="size-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4.5 font-semibold text-white tabular-nums">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div role="menu" className="surface absolute right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Notifications{count ? ` · ${count} unread` : ''}</p>
            {count > 0 && (
              <button type="button" disabled={markingAll} onClick={() => void markAll()} className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50">
                Mark all as read
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-4 text-slate-400" />
            </div>
          ) : !latest?.items.length ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {latest.items.map((n) => (
                <li key={n.id} className={cn('flex items-start gap-2 px-4 py-2.5', !n.readAt && 'bg-brand-50/50')}>
                  {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      setOpen(false);
                      navigate('/notifications');
                    }}
                  >
                    <p className={cn('text-sm', n.readAt ? 'text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {n.actorName ? `by ${n.actorName}` : 'System'} · {timeAgo(n.createdAt)}
                    </p>
                  </button>
                  {!n.readAt && (
                    <button
                      type="button"
                      onClick={() => void markRead({ id: n.id })}
                      className="rounded-lg p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
                      aria-label="Mark as read"
                      title="Mark as read"
                    >
                      <CheckIcon className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-slate-50">
            See more
          </Link>
        </div>
      )}
    </div>
  );
}
