import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useLazyListInvoicesQuery } from '@/features/accounts/accountsApi';
import { Button, Dialog, Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../permissions';
import { type JobCard, useTransitionJobCardMutation } from '../../serviceApi';

/**
 * The advisor's "everything is done": closes the job card without a manager's approval, marks the work still
 * pending as done and goes straight to the draft invoice made for it (the cashier issues it).
 */
export function CloseJobCard({ jobCard }: { jobCard: JobCard }) {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [transition, { isLoading }] = useTransitionJobCardMutation();
  const [findInvoices] = useLazyListInvoicesQuery();
  if (!['open', 'in_progress'].includes(jobCard.status) || !perm.canIn(P.jobCardsClose, jobCard.dealershipId, jobCard.branchId ?? undefined)) return null;

  const close = async () => {
    try {
      await transition({ id: jobCard.id, body: { action: 'close' } }).unwrap();
      setOpen(false);
      const invoice = perm.can('accounts.invoices.view')
        ? (await findInvoices({ sourceType: 'job_card', sourceId: jobCard.id, pageSize: 5, sort: '-createdAt' }).unwrap()).items.find((i) => !['void', 'cancelled'].includes(i.status))
        : undefined;
      if (invoice) {
        toast.success(`Job card closed. Invoice ${invoice.invoiceNo} is ready`);
        navigate(`/accounts/invoices/${invoice.id}`);
      } else toast.success('Job card closed. Nothing is billable on it (free work), so there is no invoice');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Section
      title="Finish the job"
      actions={
        <Button size="sm" onClick={() => setOpen(true)}>
          Everything is done: close job card
        </Button>
      }
    >
      <p className="text-sm text-slate-600">When the work and the parts are all done, close the job card yourself: no manager approval is needed. The invoice is drafted straight away from the billable lines.</p>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Close this job card?"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Not yet
              </Button>
              <Button loading={isLoading} onClick={close}>
                Yes, everything is done
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-700">All the work lines are marked done, the job card is closed (it can no longer be changed) and the invoice is drafted. The car becomes ready to hand back to the customer.</p>
        </Dialog>
      )}
    </Section>
  );
}
