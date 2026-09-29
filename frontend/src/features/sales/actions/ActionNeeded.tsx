import { useEffect, useState } from 'react';
import { Button, Dialog } from '@/shared/components/ui';
import { useAuth } from '@/shared/hooks';
import { ActionList } from './ActionList';
import { useActionItems } from './useActionItems';

const seenKey = (userId: number) => `dms.actions.seen.${userId}`;
const read = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: the pop-up may simply show again.
  }
};

/**
 * Dashboard: the "Action needed" panel at the top, and a pop-up when something new is waiting
 * (shown once per new situation in this browser session, e.g. a car just became ready to approve).
 */
export function ActionNeeded() {
  const { user } = useAuth();
  const { items } = useActionItems();
  const [popup, setPopup] = useState(false);
  // What is waiting, e.g. "approve:2|approve-ready:1": a change means something new.
  const signature = items.map((i) => `${i.key}:${i.count}`).join('|');

  useEffect(() => {
    if (!user || !items.length) return;
    if (read(seenKey(user.id)) !== signature) setPopup(true);
  }, [user, signature, items.length]);

  const dismiss = () => {
    if (user) write(seenKey(user.id), signature);
    setPopup(false);
  };

  if (!items.length) return null;
  const urgent = items.some((i) => i.urgent);
  return (
    <>
      <section
        className={`glass-soft mb-5 rounded-2xl p-4 ring-1 ${urgent ? 'ring-red-200' : 'ring-amber-200'}`}
        aria-label="Action needed"
      >
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className={`size-2 rounded-full ${urgent ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden />
          Action needed
        </h2>
        <ActionList items={items} />
      </section>
      {popup && (
        <Dialog
          open
          onClose={dismiss}
          title="Action needed"
          footer={
            <Button variant="secondary" onClick={dismiss}>
              Later
            </Button>
          }
        >
          <p className="mb-2 text-sm text-slate-600">These are waiting for you:</p>
          <ActionList items={items} onOpen={dismiss} />
        </Dialog>
      )}
    </>
  );
}
