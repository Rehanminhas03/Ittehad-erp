import { Link, useSearchParams } from 'react-router';
import { Button, EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { apiErrorMessage, cn, formatDateTime } from '@/shared/lib';
import { CheckIcon, TrashIcon } from './icons';
import { useDeleteNotificationMutation, useListNotificationsQuery, useMarkAllNotificationsReadMutation, useMarkNotificationReadMutation } from './notificationsApi';
import { timeAgo } from './time';

const PAGE_SIZE = 10;

/**
 * All your notifications (sidebar → Notifications), newest first, 10 per page: what happened, who
 * did it and when; mark as read, delete, or open the record. Updates live as new ones arrive.
 */
export default function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const unreadOnly = params.get('show') === 'unread';
  const toast = useToast();
  const { data, isLoading, isError, error, refetch } = useListNotificationsQuery({ page, pageSize: PAGE_SIZE, unread: unreadOnly ? 'true' : undefined });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, { isLoading: markingAll }] = useMarkAllNotificationsReadMutation();
  const [remove] = useDeleteNotificationMutation();

  const go = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      if (done) toast.success(done);
    } catch (e) {
      toast.error(e);
    }
  };

  const unread = data?.unread ?? 0;
  const tab = (active: boolean) =>
    cn('rounded-lg px-3 py-1.5 text-sm font-medium transition', active ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900');

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle="Everything that happens at your dealership: new leads, quotations, PPF vouchers, cars, approvals, deliveries and more."
        actions={
          unread > 0 && (
            <Button variant="secondary" loading={markingAll} onClick={() => run(() => markAll().unwrap(), 'All notifications marked as read')}>
              <CheckIcon className="size-4" />
              Mark all as read
            </Button>
          )
        }
      />
      <div className="mb-4 flex items-center gap-1 rounded-xl bg-white/50 p-1 ring-1 ring-white" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={!unreadOnly} className={tab(!unreadOnly)} onClick={() => go({ show: null, page: null })}>
          All
        </button>
        <button type="button" role="tab" aria-selected={unreadOnly} className={tab(unreadOnly)} onClick={() => go({ show: 'unread', page: null })}>
          Unread{unread ? ` (${unread})` : ''}
        </button>
      </div>

      <div className="surface overflow-hidden">
        {isError ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
        ) : isLoading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Spinner />
          </div>
        ) : !data?.items.length ? (
          <EmptyState title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="New activity at your dealership will appear here as it happens." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.items.map((n) => (
              <li key={n.id} className={cn('flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:px-5', !n.readAt && 'bg-brand-50/40')}>
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand-600')} aria-label={n.readAt ? undefined : 'Unread'} />
                  <div className="min-w-0">
                    <p className={cn('text-sm', n.readAt ? 'text-slate-700' : 'font-semibold text-slate-900')}>{n.title}</p>
                    {n.detail && <p className="mt-0.5 text-sm text-slate-600">{n.detail}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      {n.actorName ? `by ${n.actorName}` : 'System'} · <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>{formatDateTime(n.createdAt)}</time>{' '}
                      <span className="text-slate-400">({timeAgo(n.createdAt)})</span>
                      {n.readAt && <span className="text-slate-400"> · read {timeAgo(n.readAt)}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1 pl-5 sm:pl-0">
                  {n.href && (
                    <Link
                      to={n.href}
                      onClick={() => !n.readAt && void markRead({ id: n.id })}
                      className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
                    >
                      Open
                    </Link>
                  )}
                  {!n.readAt && (
                    <button
                      type="button"
                      onClick={() => run(() => markRead({ id: n.id }).unwrap())}
                      className="rounded-lg p-2 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"
                      aria-label="Mark as read"
                      title="Mark as read"
                    >
                      <CheckIcon className="size-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => run(() => remove({ id: n.id }).unwrap(), 'Notification deleted')}
                    className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-700"
                    aria-label="Delete"
                    title="Delete"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > PAGE_SIZE && (
          <div className="border-t border-slate-100 px-4">
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(p) => go({ page: p > 1 ? String(p) : null })} />
          </div>
        )}
      </div>
    </div>
  );
}
