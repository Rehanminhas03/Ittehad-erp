import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/shared/components/ui';
import { InOutReportButton } from '../../components/InOutReport';
import { PurchaseReportButton } from '../../components/PurchaseReportButton';
import { StockReportButton } from '../../components/StockReport';

const Card = ({ title, text, action }: { title: string; text: string; action: ReactNode }) => (
  <div className="surface flex flex-col justify-between gap-3 p-4">
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-600">{text}</p>
    </div>
    <div>{action}</div>
  </div>
);

const Open = ({ to, label = 'Open' }: { to: string; label?: string }) => (
  <Link to={to} className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
    {label}
  </Link>
);

/**
 * Every report of the store in one place. Each opens to view first; from there it is printed or downloaded (PDF or Excel).
 */
export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Every store report in one place. Open one to view it, then print it or download it as PDF or Excel." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Stock report" text="Every part in the store with what is in stock, its cost value and its price." action={<StockReportButton label="Open stock report" variant="primary" />} />
        <Card title="Parts in report" text="Every part that came into the store in the dates you choose: received, transferred in, taken back from the workshop, with date and time." action={<InOutReportButton only="in" label="Open parts in report" variant="primary" />} />
        <Card title="Parts out report" text="Every part that went out in the dates you choose: issued, counter sales, transferred out, with the cost and the price charged." action={<InOutReportButton only="out" label="Open parts out report" variant="primary" />} />
        <Card title="Parts in and out" text="Both together: what came in and what went out in the dates you choose." action={<InOutReportButton label="Open parts in and out" variant="primary" />} />
        <Card title="Purchase report" text="What was ordered and received in a period, what it cost, the average cost and how each part's price moved." action={<PurchaseReportButton label="Open purchase report" variant="primary" />} />
        <Card title="Store report and sale report" text="The monthly figures (parts in and out, revenue, margin), the sale report line by line and the stock sheet." action={<Open to="/parts/report" />} />
        <Card title="Price list" text="The price of every part: search it, or print and download the whole list." action={<Open to="/parts/prices" />} />
        <Card title="Goods receipts" text="Every receipt of parts from the suppliers; open one (or its print icon) to print the goods receipt." action={<Open to="/parts/goods-receipts" />} />
        <Card title="Purchase orders" text="The orders sent to the suppliers; each has a print icon." action={<Open to="/parts/purchase-orders" />} />
        <Card title="Stock movements" text="Every movement of stock, with who made it and when." action={<Open to="/parts/movements" />} />
      </div>
    </div>
  );
}
