import { useState } from 'react';
import { Button, ConfirmDialog } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { type PartsRequest, useTransitionPartsRequestMutation } from '../../partsApi';
import { P } from '../../permissions';

/** On a return from the workshop waiting for the store: accept it straight from the list (the parts go back into stock). */
export function AcceptReturnButton({ request }: { request: PartsRequest }) {
  const perm = usePermission();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [transition, { isLoading }] = useTransitionPartsRequestMutation();
  if (request.kind !== 'return' || request.status !== 'open' || !perm.canIn(P.issuesCreate, request.dealershipId, request.branchId)) return null;
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <Button size="sm" onClick={() => setOpen(true)}>
        Accept return
      </Button>
      <ConfirmDialog
        open={open}
        title="Accept the return?"
        message={`The parts of ${request.requestNo} go back into stock and come off the job card.`}
        confirmLabel="Accept the return"
        loading={isLoading}
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          try {
            await transition({ id: request.id, body: { action: 'accept_return' } }).unwrap();
            toast.success(`${request.requestNo} accepted: the parts are back in stock`);
            setOpen(false);
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </span>
  );
}
