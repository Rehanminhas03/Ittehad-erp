import { z } from 'zod';
import { Badge, Section, StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, idField, mono, muted, optionalText, statusFilter, strong } from '@/shared/entity';
import { formatDateTime, formatMoney } from '@/shared/lib';
import { PartsRequestDesk } from '../components/PartsRequestDesk';
import { AdjustmentLines, TransferLines } from '../components/StockDocumentLines';
import { StockMovementsTable } from '../components/StockMovementsTable';
import {
  type PartsRequest,
  type StockAdjustment,
  type StockItem,
  type StockTransfer,
  useCreateStockAdjustmentMutation,
  useCreateStockTransferMutation,
  useGetPartsRequestHistoryQuery,
  useGetPartsRequestQuery,
  useGetPartsRequestWorkflowQuery,
  useGetStockAdjustmentHistoryQuery,
  useGetStockAdjustmentQuery,
  useGetStockAdjustmentWorkflowQuery,
  useGetStockItemHistoryQuery,
  useGetStockItemQuery,
  useGetStockTransferHistoryQuery,
  useGetStockTransferQuery,
  useGetStockTransferWorkflowQuery,
  useListPartsRequestsQuery,
  useListStockAdjustmentsQuery,
  useListStockItemsQuery,
  useListStockTransfersQuery,
  useTransitionPartsRequestMutation,
  useTransitionStockAdjustmentMutation,
  useTransitionStockTransferMutation,
  useUpdateStockAdjustmentMutation,
  useUpdateStockItemMutation,
  useUpdateStockTransferMutation,
} from '../partsApi';
import { ADJUSTMENT_REASONS, ADJUSTMENT_STATES, P, REQUEST_STATES, TRANSFER_STATES } from '../permissions';

const value = (s: StockItem) => (Number(s.quantityOnHand) * Number(s.averageCost)).toFixed(2);
const low = (s: StockItem) => Number(s.reorderLevel) > 0 && Number(s.quantityOnHand) <= Number(s.reorderLevel);

/** On-hand stock per branch; the ledger below each item is the full, append-only history. */
export const stockItemView: EntityViewConfig<StockItem> = {
  singular: 'Stock item',
  plural: 'Stock',
  basePath: '/parts/stock',
  entityType: 'parts.stock_item',
  permissions: { view: [P.stockView], update: [P.stockManage] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  list: {
    defaultSort: '-updatedAt',
    searchPlaceholder: 'Search bin location',
    columns: [
      { key: 'partNo', header: 'Part no.', render: (s) => mono(s.partNo) },
      { key: 'partDescription', header: 'Description', render: (s) => strong(s.partDescription) },
      { key: 'branchName', header: 'Branch', render: (s) => muted(s.branchName) },
      {
        key: 'quantityOnHand',
        header: 'On hand',
        sortKey: 'quantityOnHand',
        className: 'text-right tabular-nums',
        render: (s) => (
          <>
            {Number(s.quantityOnHand)} {low(s) && <Badge tone="amber">Low</Badge>}
          </>
        ),
      },
      { key: 'averageCost', header: 'Avg cost', sortKey: 'averageCost', className: 'text-right tabular-nums', render: (s) => formatMoney(s.averageCost) },
      { key: 'value', header: 'Value', className: 'text-right tabular-nums', render: (s) => formatMoney(value(s)) },
      { key: 'binLocation', header: 'Bin', render: (s) => muted(s.binLocation) },
    ],
  },
  detail: {
    title: (s) => `${s.partNo ?? ''} at ${s.branchName ?? ''}`,
    subtitle: (s) => s.partDescription,
    fields: [
      { label: 'On hand', value: (s) => Number(s.quantityOnHand) },
      { label: 'Average cost', value: (s) => formatMoney(s.averageCost) },
      { label: 'Stock value', value: (s) => formatMoney(value(s)) },
      { label: 'Bin location', value: (s) => s.binLocation },
      { label: 'Reorder level', value: (s) => Number(s.reorderLevel) },
      { label: 'Last movement', value: (s) => formatDateTime(s.updatedAt) },
    ],
    sections: (s) => (
      <Section title="Movements">
        <StockMovementsTable filter={{ partId: s.partId, branchId: s.branchId }} />
      </Section>
    ),
  },
  form: {
    fields: [
      { name: 'binLocation', label: 'Bin location', type: 'text' },
      { name: 'reorderLevel', label: 'Reorder level', type: 'text', hint: 'Flagged as low when on hand falls to this level' },
    ],
    createSchema: z.object({}),
    updateSchema: z.object({
      binLocation: optionalText(30),
      reorderLevel: z.string().trim().refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'A number, e.g. 5'),
    }),
  },
  api: {
    useList: useListStockItemsQuery,
    useGet: useGetStockItemQuery,
    useHistory: useGetStockItemHistoryQuery,
    update: { useMutation: useUpdateStockItemMutation, toArg: (id, v) => ({ id, stockItemUpdate: v }) },
  },
};

/** Parts requested by the workshop; the parts desk issues and takes returns here. */
export const partsRequestView: EntityViewConfig<PartsRequest> = {
  singular: 'Parts request',
  plural: 'Parts requests',
  basePath: '/parts/requests',
  entityType: 'parts.parts_request',
  permissions: { view: [P.requestsView] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search request number',
    filters: [statusFilter(REQUEST_STATES), dealershipFilter],
    columns: [
      { key: 'requestNo', header: 'Request', sortKey: 'requestNo', render: (r) => mono(r.requestNo) },
      { key: 'jobCardNo', header: 'Job card', render: (r) => mono(r.jobCardNo) },
      { key: 'branchName', header: 'Store', render: (r) => r.branchName },
      { key: 'requestedByName', header: 'Requested by', render: (r) => muted(r.requestedByName) },
      { key: 'createdAt', header: 'Requested', sortKey: 'createdAt', render: (r) => formatDateTime(r.createdAt) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (r) => <StatusBadge status={r.status} /> },
    ],
  },
  detail: {
    title: (r) => r.requestNo,
    subtitle: (r) => `${r.jobCardNo ?? ''} · ${r.branchName ?? ''}`,
    fields: [
      { label: 'Job card', value: (r) => r.jobCardNo },
      { label: 'Store', value: (r) => r.branchName },
      { label: 'Requested by', value: (r) => r.requestedByName },
      { label: 'Requested', value: (r) => formatDateTime(r.createdAt) },
      { label: 'Notes', value: (r) => r.notes },
    ],
    sections: (r) => <PartsRequestDesk request={r} />,
  },
  api: { useList: useListPartsRequestsQuery, useGet: useGetPartsRequestQuery, useHistory: useGetPartsRequestHistoryQuery },
  workflow: {
    useDefinition: useGetPartsRequestWorkflowQuery,
    transition: { useMutation: useTransitionPartsRequestMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};

export const transferView: EntityViewConfig<StockTransfer> = {
  singular: 'Stock transfer',
  plural: 'Stock transfers',
  basePath: '/parts/transfers',
  entityType: 'parts.stock_transfer',
  permissions: { view: [P.transfersView], create: P.transfersCreate, update: [P.transfersCreate] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search transfer number',
    filters: [statusFilter(TRANSFER_STATES), dealershipFilter],
    columns: [
      { key: 'transferNo', header: 'Transfer', sortKey: 'transferNo', render: (t) => mono(t.transferNo) },
      { key: 'branchName', header: 'From', render: (t) => strong(t.branchName) },
      { key: 'toBranchName', header: 'To', render: (t) => strong(t.toBranchName) },
      { key: 'dispatchedAt', header: 'Dispatched', render: (t) => formatDateTime(t.dispatchedAt) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (t) => <StatusBadge status={t.status} /> },
    ],
  },
  detail: {
    title: (t) => t.transferNo,
    subtitle: (t) => `${t.branchName ?? ''} → ${t.toBranchName ?? ''}`,
    fields: [
      { label: 'From', value: (t) => t.branchName },
      { label: 'To', value: (t) => t.toBranchName },
      { label: 'Dispatched', value: (t) => formatDateTime(t.dispatchedAt) },
      { label: 'Received', value: (t) => formatDateTime(t.receivedAt) },
      { label: 'Notes', value: (t) => t.notes },
    ],
    sections: (t) => <TransferLines transfer={t} />,
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.transfersCreate },
      { name: 'branchId', label: 'From branch', type: 'branch', required: true, mode: 'create', dealershipField: 'dealershipId', scopePermission: P.transfersCreate },
      { name: 'toBranchId', label: 'To branch', type: 'branch', required: true, mode: 'create', dealershipField: 'dealershipId', scopePermission: P.transfersView },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({ dealershipId: idField('Dealership'), branchId: idField('From branch'), toBranchId: idField('To branch'), notes: optionalText(2000) }),
    updateSchema: z.object({ notes: optionalText(2000) }),
  },
  api: {
    useList: useListStockTransfersQuery,
    useGet: useGetStockTransferQuery,
    useHistory: useGetStockTransferHistoryQuery,
    create: { useMutation: useCreateStockTransferMutation, toArg: (v) => ({ stockTransferCreate: v }) },
    update: { useMutation: useUpdateStockTransferMutation, toArg: (id, v) => ({ id, stockTransferUpdate: v }) },
  },
  workflow: {
    useDefinition: useGetStockTransferWorkflowQuery,
    transition: { useMutation: useTransitionStockTransferMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};

export const adjustmentView: EntityViewConfig<StockAdjustment> = {
  singular: 'Stock adjustment',
  plural: 'Stock adjustments',
  basePath: '/parts/adjustments',
  entityType: 'parts.stock_adjustment',
  permissions: { view: [P.adjustmentsView], create: P.adjustmentsCreate, update: [P.adjustmentsCreate] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search adjustment number',
    filters: [statusFilter(ADJUSTMENT_STATES), dealershipFilter, { param: 'reason', label: 'Reason', type: 'select', options: ADJUSTMENT_REASONS }],
    columns: [
      { key: 'adjustmentNo', header: 'Adjustment', sortKey: 'adjustmentNo', render: (a) => mono(a.adjustmentNo) },
      { key: 'branchName', header: 'Branch', render: (a) => strong(a.branchName) },
      { key: 'reason', header: 'Reason', render: (a) => ADJUSTMENT_REASONS.find((r) => r.value === a.reason)?.label ?? a.reason },
      { key: 'createdAt', header: 'Created', sortKey: 'createdAt', render: (a) => formatDateTime(a.createdAt) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (a) => <StatusBadge status={a.status} /> },
    ],
  },
  detail: {
    title: (a) => a.adjustmentNo,
    subtitle: (a) => `${a.branchName ?? ''} · ${ADJUSTMENT_REASONS.find((r) => r.value === a.reason)?.label ?? a.reason}`,
    fields: [
      { label: 'Branch', value: (a) => a.branchName },
      { label: 'Reason', value: (a) => ADJUSTMENT_REASONS.find((r) => r.value === a.reason)?.label },
      { label: 'Posted', value: (a) => formatDateTime(a.postedAt) },
      { label: 'Notes', value: (a) => a.notes },
    ],
    sections: (a) => <AdjustmentLines adjustment={a} />,
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.adjustmentsCreate },
      { name: 'branchId', label: 'Branch', type: 'branch', required: true, mode: 'create', dealershipField: 'dealershipId', scopePermission: P.adjustmentsCreate },
      { name: 'reason', label: 'Reason', type: 'select', required: true, options: ADJUSTMENT_REASONS },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    defaults: { reason: 'count' },
    createSchema: z.object({ dealershipId: idField('Dealership'), branchId: idField('Branch'), reason: z.string(), notes: optionalText(2000) }),
    updateSchema: z.object({ reason: z.string(), notes: optionalText(2000) }),
  },
  api: {
    useList: useListStockAdjustmentsQuery,
    useGet: useGetStockAdjustmentQuery,
    useHistory: useGetStockAdjustmentHistoryQuery,
    create: { useMutation: useCreateStockAdjustmentMutation, toArg: (v) => ({ stockAdjustmentCreate: v }) },
    update: { useMutation: useUpdateStockAdjustmentMutation, toArg: (id, v) => ({ id, stockAdjustmentUpdate: v }) },
  },
  workflow: {
    useDefinition: useGetStockAdjustmentWorkflowQuery,
    transition: { useMutation: useTransitionStockAdjustmentMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};
