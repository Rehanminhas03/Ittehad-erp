import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { io, type Socket } from 'socket.io-client';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { BellIcon, CheckIcon } from './icons';
import { enhancedApi, type Notification, useMarkNotificationReadMutation } from './notificationsApi';
import { timeAgo } from './time';

const SHOW_FOR_MS = 8000;
const MAX_ON_SCREEN = 3;

/**
 * The live connection (Socket.IO): signed in with the current access token, it receives each new
 * notification the moment someone saves a change. It refreshes the bell and the list, and pops the
 * notification up (bottom right) with the person's name, the time and "mark as read"; clicking it
 * opens the Notifications page. Mounted once in the app shell.
 */
export function LiveNotifications() {
  const token = useAppSelector((s) => (s as { auth: { accessToken: string | null } }).auth.accessToken);
  const userId = useAppSelector((s) => (s as { auth: { me: { user: { id: number } } | null } }).auth.me?.user.id ?? null);
  const tokenRef = useRef(token);
  const socketRef = useRef<Socket | null>(null);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [popups, setPopups] = useState<Notification[]>([]);
  const [markRead] = useMarkNotificationReadMutation();
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = (id: number) => {
    setPopups((p) => p.filter((n) => n.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  };

  // The latest access token, for the next (re)connection. A refreshed token (every 15 minutes) does
  // not tear the open socket down; only a socket the server turned away (expired token) reconnects.
  useEffect(() => {
    tokenRef.current = token;
    const socket = socketRef.current;
    if (token && socket && !socket.connected && !socket.active) socket.connect();
  }, [token]);

  // One connection per signed-in person; none when signed out.
  useEffect(() => {
    if (!userId || !tokenRef.current) return;
    const socket: Socket = io({ path: '/socket.io', auth: (cb) => cb({ token: tokenRef.current }), transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('notification:new', ({ notification }: { notification: Notification }) => {
      dispatch(enhancedApi.util.invalidateTags(['Notification']));
      setPopups((p) => [notification, ...p.filter((n) => n.id !== notification.id)].slice(0, MAX_ON_SCREEN));
      timers.current.set(
        notification.id,
        setTimeout(() => dismiss(notification.id), SHOW_FOR_MS),
      );
    });
    // Back online after a drop: catch up on anything missed.
    socket.on('connect', () => dispatch(enhancedApi.util.invalidateTags(['Notification'])));
    return () => {
      socketRef.current = null;
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one connection per signed-in person
  }, [userId]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!popups.length) return null;
  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-50 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col gap-2 sm:right-5 sm:bottom-5" aria-live="polite">
      {popups.map((n) => (
        <div key={n.id} role="status" className="surface pointer-events-auto flex items-start gap-3 p-3 shadow-lg ring-1 ring-brand-100">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <BellIcon className="size-4" />
          </span>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => {
              dismiss(n.id);
              navigate('/notifications');
            }}
          >
            <p className="text-sm font-semibold text-slate-900">{n.title}</p>
            <p className="mt-0.5 truncate text-xs text-slate-600">
              {n.actorName ? `by ${n.actorName}` : 'System'} · {timeAgo(n.createdAt)}
              {n.detail ? ` · ${n.detail}` : ''}
            </p>
          </button>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              onClick={() => {
                void markRead({ id: n.id });
                dismiss(n.id);
              }}
              className={cn('rounded-lg p-1.5 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700')}
              aria-label="Mark as read"
              title="Mark as read"
            >
              <CheckIcon className="size-4" />
            </button>
            <button type="button" onClick={() => dismiss(n.id)} className="rounded-lg px-1.5 text-xs text-slate-400 hover:text-slate-700" aria-label="Close">
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
