import { useState } from 'react';
import { Button, Dialog } from '@/shared/components/ui';
import PurchaseReportPage from '../../pages/PurchaseReportPage';

/** "Purchase report" on the Purchase orders page: the report opens over the list, to view, then print or download. */
export function PurchaseReportButton({ label = 'Purchase report', variant = 'secondary' }: { label?: string; variant?: 'primary' | 'secondary' } = {}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <Dialog open onClose={() => setOpen(false)} size="xl" title="Purchase report" footer={<Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>}>
          <PurchaseReportPage embedded />
        </Dialog>
      )}
    </>
  );
}
