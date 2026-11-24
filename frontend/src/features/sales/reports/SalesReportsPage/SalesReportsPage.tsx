import { type CSSProperties, type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { DateRangePicker, type DateRange, LIST_RANGES, rangeLabel } from '@/shared/components';
import { PageHeader, Select } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { BookingsReportButton, DeliveredReportButton, InvoiceReportButton, type ReportTrigger, StockSheetButton } from '../../exports/BookingsReport';
import { P } from '../../permissions';

type Tone = 'blue' | 'green' | 'violet' | 'amber' | 'sky' | 'rose' | 'slate';

/** Colours per card: the icon tile, the icon, the top accent and the hover glow. Inline styles, so the look never depends on generated classes. */
const TONES: Record<Tone, { soft: string; ink: string; from: string; to: string }> = {
  blue: { soft: '#e0ecff', ink: '#1d4ed8', from: '#60a5fa', to: '#2563eb' },
  green: { soft: '#d9f7e8', ink: '#047857', from: '#34d399', to: '#059669' },
  violet: { soft: '#ece5ff', ink: '#6d28d9', from: '#a78bfa', to: '#7c3aed' },
  amber: { soft: '#fdf0d0', ink: '#b45309', from: '#fbbf24', to: '#d97706' },
  sky: { soft: '#dcf3fd', ink: '#0369a1', from: '#38bdf8', to: '#0284c7' },
  rose: { soft: '#fde3e8', ink: '#be123c', from: '#fb7185', to: '#e11d48' },
  slate: { soft: '#e5e9f0', ink: '#334155', from: '#94a3b8', to: '#475569' },
};

const ICONS: Record<string, string> = {
  bookings: 'M7 3h10a2 2 0 0 1 2 2v16l-7-3-7 3V5a2 2 0 0 1 2-2Zm2 5h6M9 12h6',
  delivered: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  invoice: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  stock: 'M3 9l9-5 9 5v10H3zM3 9l9 5 9-5M12 14v5',
  stockall: 'M4 7h16v4H4zM4 13h16v4H4zM8 9h.01M8 15h.01',
  delivery: 'M4 19V9m5 10V5m5 14v-7m5 7V8',
  leads: 'M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM6 20a6 6 0 0 1 12 0M20 8v4m2-2h-4',
  track: 'M3 17l6-6 4 4 8-8M21 7h-5m5 0v5',
  team: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a2.5 2.5 0 1 0 0-5M3 19a6 6 0 0 1 12 0M16 14a5 5 0 0 1 5 5',
};

const Icon = ({ name, size = 24 }: { name: string; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
    <path d={ICONS[name]} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** One report: its name, what it shows and what you can do with it, on a card that lifts when hovered. */
function ReportCard({ icon, tone, title, text, tags, onOpen, loading, to }: { icon: string; tone: Tone; title: string; text: string; tags: string[]; onOpen?: () => void; loading?: boolean; to?: string }) {
  const t = TONES[tone];
  const [hover, setHover] = useState(false);
  const style: CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    minHeight: 208,
    padding: '24px 22px 20px',
    overflow: 'hidden',
    textAlign: 'left',
    cursor: loading ? 'wait' : 'pointer',
    background: 'rgba(255,255,255,0.92)',
    border: `1px solid ${hover ? t.from : 'rgba(255,255,255,0.9)'}`,
    borderRadius: 18,
    boxShadow: hover ? `0 18px 36px -16px ${t.to}66, 0 2px 6px rgba(15,23,42,0.06)` : '0 6px 18px -12px rgba(30,58,138,0.35), 0 1px 3px rgba(15,23,42,0.05)',
    transform: hover ? 'translateY(-3px)' : 'none',
    transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
    textDecoration: 'none',
    color: 'inherit',
  };
  const body = (
    <>
      <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, background: `linear-gradient(90deg, ${t.from}, ${t.to})` }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 48, height: 48, flex: 'none', borderRadius: 14, background: t.soft, color: t.ink }}>
          <Icon name={icon} />
        </span>
        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 650, lineHeight: 1.25, color: '#0f172a' }}>{title}</h3>
      </div>
      <p style={{ margin: '14px 0 0', flex: 1, fontSize: 13.5, lineHeight: 1.55, color: '#475569' }}>{text}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18, paddingTop: 14, borderTop: '1px solid #e8edf5' }}>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tags.map((x) => (
            <span key={x} style={{ padding: '3px 9px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: 0.2 }}>
              {x}
            </span>
          ))}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 10,
            background: hover ? t.to : t.ink,
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            flex: 'none',
            transition: 'background .18s ease',
          }}
        >
          {loading ? 'Opening…' : 'Open'}
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden>
            <path d="M5 10h10m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </>
  );
  const handlers = { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false), onFocus: () => setHover(true), onBlur: () => setHover(false) };
  return to ? (
    <Link to={to} style={style} {...handlers}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} disabled={loading} style={style} {...handlers}>
      {body}
    </button>
  );
}

/** A group of cards under a heading with a thin rule. */
function Group({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: '#334155', whiteSpace: 'nowrap' }}>{title}</h2>
        <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #cbd5e1, transparent)' }} aria-hidden />
        <span style={{ fontSize: 12.5, color: '#64748b', whiteSpace: 'nowrap' }}>{hint}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>{children}</div>
    </section>
  );
}

/**
 * Our reports: every report of the sales portal in one place, as cards. Each one opens a preview first, from where it is
 * printed or downloaded (PDF, Excel). The period and dealership above apply to the order, delivery and invoice reports.
 */
export default function SalesReportsPage() {
  const perm = usePermission();
  const [rangeKey, setRangeKey] = useState('all');
  const [custom, setCustom] = useState<DateRange>({});
  const [dealerId, setDealerId] = useState('');
  const dealerships = [P.ordersViewAll, P.stockView, P.deliveriesViewAll].flatMap((c) => perm.dealershipsFor(c)).filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i);
  const dealershipId = dealerId ? Number(dealerId) : undefined;
  const period: DateRange = rangeKey === 'custom' ? custom : (LIST_RANGES.find((r) => r.key === rangeKey) ?? LIST_RANGES[LIST_RANGES.length - 1]!).range();
  const periodText = rangeKey === 'custom' ? rangeLabel(period) || 'the chosen dates' : rangeKey === 'all' ? 'all time' : (LIST_RANGES.find((r) => r.key === rangeKey)?.label.toLowerCase() ?? '');

  const card =
    (props: Omit<Parameters<typeof ReportCard>[0], 'onOpen' | 'loading'>): ReportTrigger =>
    (open, loading) => <ReportCard {...props} onOpen={open} loading={loading} />;
  const orders = perm.can([P.ordersViewAll]);
  const stock = perm.can([P.stockView]);
  const delivery = perm.can([P.deliveriesViewAll]);

  return (
    <div>
      <PageHeader title="Our reports" subtitle="Every report in one place. Open one to look it over, then print it or download it as PDF or Excel." />

      {(orders || stock) && (
        <div className="surface" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '14px 18px', marginBottom: 32 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#334155' }}>Period for the booking, delivery and invoice reports</span>
          <DateRangePicker
            presets={LIST_RANGES}
            value={rangeKey}
            custom={rangeKey === 'custom' ? custom : undefined}
            onChange={(key, r) => {
              setRangeKey(key);
              if (key === 'custom') setCustom(r);
            }}
          />
          {dealerships.length > 1 && (
            <Select value={dealerId} onChange={(e) => setDealerId(e.target.value)} className="w-auto" aria-label="Dealership">
              <option value="">All my dealerships</option>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {orders && (
        <Group title="Orders, deliveries and invoices" hint={`Showing ${periodText}`}>
          <BookingsReportButton
            query={{ from: period.from, to: period.to, dealershipId }}
            periodLabel={periodText}
            trigger={card({ icon: 'bookings', tone: 'blue', title: 'Bookings report', text: 'Every booked order: customer, car, payment, balance, salesperson, reference, invoice, engine and chassis, delivery date.', tags: ['Preview', 'Print', 'PDF', 'Excel'] })}
          />
          <DeliveredReportButton
            period={period}
            periodLabel={periodText}
            dealershipId={dealershipId}
            trigger={card({ icon: 'delivered', tone: 'green', title: 'Delivered cars report', text: 'Only the cars handed over to customers, with the day each was received and the day it was delivered.', tags: ['Preview', 'Print', 'PDF', 'Excel'] })}
          />
          <InvoiceReportButton
            period={period}
            periodLabel={periodText}
            dealershipId={dealershipId}
            trigger={card({ icon: 'invoice', tone: 'violet', title: 'Invoices received report', text: 'The vehicle invoices received: number, invoice date, day received and whether it was handed to the customer.', tags: ['Preview', 'Print', 'PDF', 'Excel'] })}
          />
          {delivery && <ReportCard icon="delivery" tone="amber" title="Delivery report" text="Cars delivered this month, this year or in a period, by model and by dealership, with the average days to deliver." tags={['Charts', 'CSV', 'Print']} to="/sales/delivery-report" />}
        </Group>
      )}

      {stock && (
        <Group title="Stock" hint="As on today">
          <StockSheetButton
            which="open"
            dealershipId={dealershipId}
            trigger={card({ icon: 'stock', tone: 'sky', title: 'Open stock sheet', text: 'The cars in open stock, grouped under their model, with colour, engine and chassis number and the receiving date.', tags: ['Preview', 'Print', 'PDF', 'Excel'] })}
          />
          <StockSheetButton
            which="all"
            dealershipId={dealershipId}
            trigger={card({ icon: 'stockall', tone: 'rose', title: 'Stock sheet', text: 'Every car received and not yet delivered: the open stock plus the cars already held for a customer, with the customer and PBO.', tags: ['Preview', 'Print', 'PDF', 'Excel'] })}
          />
        </Group>
      )}

      {(perm.can([P.leadsViewAll, P.leadsViewSocial, P.leadsViewTeam]) || perm.can([P.reportsView, P.ppfViewAll, P.ppfViewOwn])) && (
        <Group title="Sales team" hint="Leads and people">
          {perm.can([P.leadsViewAll, P.leadsViewSocial, P.leadsViewTeam]) && <ReportCard icon="leads" tone="blue" title="Leads report" text="Social media, salesperson or all leads for a period, with every follow-up remark." tags={['Excel', 'PDF']} to="/sales/leads-report" />}
          {perm.can([P.reportsView, P.ppfViewAll, P.ppfViewOwn]) && <ReportCard icon="track" tone="green" title="Track record" text="Month by month and per salesperson: leads, conversions, cars booked and delivered, PPF and quotations." tags={['Charts', 'PDF']} to="/sales/track-record" />}
          {perm.can([P.reportsView]) && <ReportCard icon="team" tone="slate" title="Team report" text="Each salesperson's work in a chosen period: leads, follow-ups, conversions and orders." tags={['Table', 'Print']} to="/sales/team" />}
        </Group>
      )}
    </div>
  );
}
