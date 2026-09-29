import type { ReactNode } from 'react';
import {
  useListAuditLogQuery,
  useListBranchesQuery,
  useListDealershipsQuery,
  useListUsersQuery,
} from '@/features/admin/adminApi';
import { useListCustomersQuery, useListVehiclesQuery } from '@/features/crm/crmApi';
import { useListDeliveriesQuery, useListLeadsQuery, useListSalesOrdersQuery, useListStockVehiclesQuery } from '@/features/sales/salesApi';
import { useListEstimatesQuery, useListVisitsQuery } from '@/features/service/serviceApi';
import { useListPartsRequestsQuery, useListPurchaseOrdersQuery } from '@/features/parts/partsApi';
import { useListInvoicesQuery } from '@/features/accounts/accountsApi';
import { DashboardWidget } from '@/shared/components';
import type { ModuleKey } from '@/shared/config';
import { apiErrorMessage, formatDateTime, humanize } from '@/shared/lib';

/**
 * Widget registry. A dashboard is the subset of widgets the user holds permissions for, so
 * every role automatically gets a different arrangement of the same building blocks.
 * Business modules append their widgets here as they ship.
 */
export interface WidgetDef {
  id: string;
  any: readonly string[];
  /** Hidden while its module is switched off (shared/config/modules.ts). */
  module?: ModuleKey;
  /** Grid width (of 3). */
  span?: 1 | 2 | 3;
  render: () => ReactNode;
}

function DealershipsKpi() {
  const { data, isLoading, error } = useListDealershipsQuery({ pageSize: 1 });
  return <DashboardWidget kind="kpi" title="Dealerships" value={data?.total} loading={isLoading} error={error && apiErrorMessage(error)} to="/admin/dealerships" />;
}

function BranchesKpi() {
  const { data, isLoading, error } = useListBranchesQuery({ pageSize: 1 });
  return <DashboardWidget kind="kpi" title="Branches" value={data?.total} loading={isLoading} error={error && apiErrorMessage(error)} to="/admin/branches" />;
}

function ActiveUsersKpi() {
  const { data, isLoading, error } = useListUsersQuery({ pageSize: 1, isActive: 'true' });
  return <DashboardWidget kind="kpi" title="Active users" value={data?.total} loading={isLoading} error={error && apiErrorMessage(error)} to="/admin/users" />;
}

function CustomersKpi() {
  const { data, isLoading, error } = useListCustomersQuery({ pageSize: 1, isActive: 'true' });
  return <DashboardWidget kind="kpi" title="Customers" value={data?.total} loading={isLoading} error={error && apiErrorMessage(error)} to="/crm/customers" />;
}

function VehiclesKpi() {
  const { data, isLoading, error } = useListVehiclesQuery({ pageSize: 1 });
  return <DashboardWidget kind="kpi" title="Vehicles" value={data?.total} loading={isLoading} error={error && apiErrorMessage(error)} to="/crm/vehicles" />;
}

/** Open leads (new / follow-up / visited): the salesperson's own, or the dealership's for managers. */
function OpenLeadsKpi() {
  const n = useListLeadsQuery({ pageSize: 1, status: 'new' });
  const f = useListLeadsQuery({ pageSize: 1, status: 'follow_up' });
  const v = useListLeadsQuery({ pageSize: 1, status: 'visited' });
  const loading = n.isLoading || f.isLoading || v.isLoading;
  const total = (n.data?.total ?? 0) + (f.data?.total ?? 0) + (v.data?.total ?? 0);
  return (
    <DashboardWidget kind="kpi" title="Open leads" value={loading ? undefined : total} loading={loading} hint={`${n.data?.total ?? 0} not yet followed up`} to="/sales/leads?range=all" />
  );
}

/** Leads logged today (Pakistan time). */
function LeadsTodayKpi() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const all = useListLeadsQuery({ pageSize: 1, createdOn: today });
  const walkIns = useListLeadsQuery({ pageSize: 1, createdOn: today, source: 'walk_in' });
  return (
    <DashboardWidget
      kind="kpi"
      title="Leads today"
      value={all.data?.total}
      loading={all.isLoading}
      hint={`${walkIns.data?.total ?? 0} walk-ins`}
      to={`/sales/leads?createdOn=${today}&range=all`}
    />
  );
}

/** Assistant Manager: leads escalated after a duplicate-phone block. */
function EscalatedLeadsKpi() {
  const { data, isLoading, error } = useListLeadsQuery({ pageSize: 1, escalated: 'true' });
  return (
    <DashboardWidget kind="kpi" title="Duplicate customers" value={data?.total} loading={isLoading} error={error && apiErrorMessage(error)} hint="Sent to you by salespeople" to="/sales/leads?escalated=true&range=all" />
  );
}

/** Admin: converted leads waiting for their sales order. */
function LeadsToOrderKpi() {
  const { data, isLoading, error } = useListLeadsQuery({ pageSize: 1, status: 'converted' });
  return (
    <DashboardWidget kind="kpi" title="Leads to raise orders for" value={data?.total} loading={isLoading} error={error && apiErrorMessage(error)} to="/sales/leads?status=converted&range=all" />
  );
}

/** Delivery Team: approved orders still waiting for a vehicle. */
function OrdersAwaitingVehicleKpi() {
  const { data, isLoading, error } = useListSalesOrdersQuery({ pageSize: 1, status: 'approved', hasVehicle: 'false' });
  return (
    <DashboardWidget kind="kpi" title="Orders waiting for a vehicle" value={data?.total} loading={isLoading} error={error && apiErrorMessage(error)} to="/sales/orders?status=approved&hasVehicle=false" />
  );
}

/** Open stock by stage (free stock is "Available"). */
const STOCK_STAGES = [['available', 'Available'], ['booked', 'Booked'], ['in_transit', 'In transit'], ['received', 'Received'], ['ready_for_delivery', 'Ready for delivery'], ['hold', 'On hold']] as const;
function OpenStock() {
  // Fixed list => fixed hook order.
  const results = STOCK_STAGES.map(([status, label]) => [label, useListStockVehiclesQuery({ pageSize: 1, status })] as const);
  return (
    <DashboardWidget
      kind="chart"
      title="Open stock by stage"
      loading={results.some(([, r]) => r.isLoading)}
      to="/sales/stock"
      data={results.map(([label, r]) => ({ label, value: r.data?.total ?? 0 }))}
    />
  );
}

/** Where the leads are, by status. */
const LEAD_FUNNEL = [['new', 'New'], ['follow_up', 'Follow-up'], ['visited', 'Visited'], ['converted', 'Converted'], ['processing', 'Processing'], ['completed', 'Completed']] as const;
function LeadFunnel() {
  // Fixed list => fixed hook order.
  const results = LEAD_FUNNEL.map(([status, label]) => [label, useListLeadsQuery({ pageSize: 1, status })] as const);
  return (
    <DashboardWidget
      kind="chart"
      title="Leads by status"
      loading={results.some(([, r]) => r.isLoading)}
      to="/sales/leads"
      data={results.map(([label, r]) => ({ label, value: r.data?.total ?? 0 }))}
    />
  );
}

function AwaitingApprovalKpi() {
  const { data, isLoading, error } = useListSalesOrdersQuery({ pageSize: 1, status: 'submitted' });
  return (
    <DashboardWidget
      kind="kpi"
      title="Orders awaiting approval"
      value={data?.total}
      loading={isLoading}
      error={error && apiErrorMessage(error)}
      to="/sales/orders?status=submitted"
    />
  );
}

function ScheduledDeliveriesKpi() {
  const { data, isLoading, error } = useListDeliveriesQuery({ pageSize: 1, status: 'scheduled' });
  return (
    <DashboardWidget
      kind="kpi"
      title="Deliveries scheduled"
      value={data?.total}
      loading={isLoading}
      error={error && apiErrorMessage(error)}
      to="/sales/deliveries?status=scheduled"
    />
  );
}

const PIPELINE = ['draft', 'submitted', 'approved', 'delivered'] as const;

function OrderPipeline() {
  // Fixed list => fixed hook order.
  const results = PIPELINE.map((status) => [status, useListSalesOrdersQuery({ pageSize: 1, status })] as const);
  const loading = results.some(([, r]) => r.isLoading);
  return (
    <DashboardWidget
      kind="chart"
      title="Sales orders by status"
      loading={loading}
      to="/sales/orders"
      data={results.map(([status, r]) => ({ label: humanize(status), value: r.data?.total ?? 0 }))}
    />
  );
}

function WorkshopKpis() {
  const open = useListVisitsQuery({ pageSize: 1, status: 'open' });
  const working = useListVisitsQuery({ pageSize: 1, status: 'in_progress' });
  const ready = useListVisitsQuery({ pageSize: 1, status: 'ready' });
  const loading = open.isLoading || working.isLoading || ready.isLoading;
  return (
    <DashboardWidget
      kind="chart"
      title="Workshop now"
      loading={loading}
      to="/service/visits"
      data={[
        { label: 'Checked in', value: open.data?.total ?? 0 },
        { label: 'In progress', value: working.data?.total ?? 0 },
        { label: 'Ready for hand-back', value: ready.data?.total ?? 0 },
      ]}
    />
  );
}

function EstimatesAwaitingKpi() {
  const { data, isLoading, error } = useListEstimatesQuery({ pageSize: 1, status: 'submitted' });
  return (
    <DashboardWidget
      kind="kpi"
      title="Estimates awaiting approval"
      value={data?.total}
      loading={isLoading}
      error={error && apiErrorMessage(error)}
      to="/service/estimates?status=submitted"
    />
  );
}

function PosAwaitingKpi() {
  const { data, isLoading, error } = useListPurchaseOrdersQuery({ pageSize: 1, status: 'submitted' });
  return (
    <DashboardWidget
      kind="kpi"
      title="Purchase orders awaiting approval"
      value={data?.total}
      loading={isLoading}
      error={error && apiErrorMessage(error)}
      to="/parts/purchase-orders?status=submitted"
    />
  );
}

function OpenPartsRequestsKpi() {
  const open = useListPartsRequestsQuery({ pageSize: 1, status: 'open' });
  const partial = useListPartsRequestsQuery({ pageSize: 1, status: 'partially_issued' });
  const loading = open.isLoading || partial.isLoading;
  return (
    <DashboardWidget
      kind="kpi"
      title="Parts requests to issue"
      value={loading ? undefined : (open.data?.total ?? 0) + (partial.data?.total ?? 0)}
      loading={loading}
      to="/parts/requests?status=open"
    />
  );
}

function DraftInvoicesKpi() {
  const { data, isLoading, error } = useListInvoicesQuery({ pageSize: 1, status: 'draft' });
  return (
    <DashboardWidget
      kind="kpi"
      title="Invoices to issue"
      value={data?.total}
      loading={isLoading}
      error={error && apiErrorMessage(error)}
      to="/accounts/invoices?status=draft"
    />
  );
}

function UnpaidInvoicesKpi() {
  const issued = useListInvoicesQuery({ pageSize: 1, status: 'issued' });
  const partial = useListInvoicesQuery({ pageSize: 1, status: 'partially_paid' });
  const loading = issued.isLoading || partial.isLoading;
  return (
    <DashboardWidget
      kind="kpi"
      title="Unpaid invoices"
      value={loading ? undefined : (issued.data?.total ?? 0) + (partial.data?.total ?? 0)}
      loading={loading}
      hint={`${partial.data?.total ?? 0} partly paid`}
      to="/accounts/reports/receivables"
    />
  );
}

function RecentActivity() {
  const { data, isLoading, error } = useListAuditLogQuery({ pageSize: 8 });
  return (
    <DashboardWidget
      kind="table"
      title="Recent activity"
      loading={isLoading}
      error={error && apiErrorMessage(error)}
      to="/admin/audit"
      columns={[
        { key: 'occurredAt', header: 'When', render: (r) => formatDateTime(r.occurredAt as string) },
        { key: 'actorName', header: 'Who', render: (r) => (r.actorName as string | null) ?? 'system' },
        { key: 'action', header: 'What', render: (r) => `${humanize(r.action as string)} ${humanize(String(r.entityType).split('.')[1] ?? '')} #${r.entityId}` },
      ]}
      rows={(data?.items ?? []) as unknown as Record<string, unknown>[]}
      empty="No activity yet."
    />
  );
}


export const WIDGETS: WidgetDef[] = [
  { id: 'invoices-draft', module: 'accounts', any: ['accounts.invoices.issue'], render: () => <DraftInvoicesKpi /> },
  { id: 'invoices-unpaid', module: 'accounts', any: ['accounts.invoices.view'], render: () => <UnpaidInvoicesKpi /> },
  { id: 'parts-requests', module: 'parts', any: ['parts.issues.create'], render: () => <OpenPartsRequestsKpi /> },
  { id: 'pos-awaiting', module: 'parts', any: ['parts.purchase_orders.approve'], render: () => <PosAwaitingKpi /> },
  { id: 'workshop', module: 'service', any: ['service.visits.view', 'service.visits.view_own'], span: 2, render: () => <WorkshopKpis /> },
  { id: 'estimates-awaiting', module: 'service', any: ['service.estimates.approve'], render: () => <EstimatesAwaitingKpi /> },
  { id: 'open-leads', module: 'sales', any: ['sales.leads.view_all', 'sales.leads.view_own'], render: () => <OpenLeadsKpi /> },
  { id: 'leads-today', module: 'sales', any: ['sales.leads.view_all', 'sales.leads.view_own'], render: () => <LeadsTodayKpi /> },
  { id: 'escalated', module: 'sales', any: ['sales.leads.convert_escalated'], render: () => <EscalatedLeadsKpi /> },
  { id: 'to-order', module: 'sales', any: ['sales.orders.create'], render: () => <LeadsToOrderKpi /> },
  { id: 'lead-funnel', module: 'sales', any: ['sales.leads.view_all', 'sales.leads.view_own'], span: 3, render: () => <LeadFunnel /> },
  { id: 'awaiting-vehicle', module: 'sales', any: ['sales.orders.allocate'], render: () => <OrdersAwaitingVehicleKpi /> },
  { id: 'open-stock', module: 'sales', any: ['sales.stock.view'], span: 2, render: () => <OpenStock /> },
  { id: 'awaiting-approval', module: 'sales', any: ['sales.orders.approve'], render: () => <AwaitingApprovalKpi /> },
  { id: 'deliveries', module: 'sales', any: ['sales.deliveries.view_all', 'sales.deliveries.view_own'], render: () => <ScheduledDeliveriesKpi /> },
  { id: 'pipeline', module: 'sales', any: ['sales.orders.view_all', 'sales.orders.view_own'], span: 3, render: () => <OrderPipeline /> },
  { id: 'customers', module: 'crm', any: ['master.customers.view'], render: () => <CustomersKpi /> },
  { id: 'vehicles', module: 'crm', any: ['master.vehicles.view'], render: () => <VehiclesKpi /> },
  { id: 'dealerships', any: ['core.users.view'], render: () => <DealershipsKpi /> },
  { id: 'branches', any: ['core.users.view'], render: () => <BranchesKpi /> },
  { id: 'users', any: ['core.users.view'], render: () => <ActiveUsersKpi /> },
  { id: 'activity', any: ['core.audit.view'], span: 3, render: () => <RecentActivity /> },
];
