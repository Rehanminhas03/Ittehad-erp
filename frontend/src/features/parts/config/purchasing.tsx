import { z } from 'zod';
import { StatusBadge } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, idField, mono, muted, optionalDate, optionalText, statusFilter, strong } from '@/shared/entity';
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib';
import { GoodsReceiptLines } from '../components/GoodsReceiptLines';
import { PurchaseOrderLines } from '../components/PurchaseOrderLines';
import { PurchaseOrderReceipts } from '../components/PurchaseOrderReceipts';
import { ReceiveGoods } from '../components/ReceiveGoods';
import {
  type GoodsReceipt,
  type PurchaseOrder,
  useCreatePurchaseOrderMutation,
  useGetGoodsReceiptHistoryQuery,
  useGetGoodsReceiptQuery,
  useGetPurchaseOrderHistoryQuery,
  useGetPurchaseOrderQuery,
  useGetPurchaseOrderWorkflowQuery,
  useListGoodsReceiptsQuery,
  useListPurchaseOrdersQuery,
  useTransitionPurchaseOrderMutation,
  useUpdatePurchaseOrderMutation,
} from '../partsApi';
import { useSupplierOptions } from '../hooks';
import { P, PO_STATES } from '../permissions';

export const purchaseOrderView: EntityViewConfig<PurchaseOrder> = {
  singular: 'Purchase order',
  plural: 'Purchase orders',
  basePath: '/parts/purchase-orders',
  entityType: 'parts.purchase_order',
  permissions: { view: [P.purchaseOrdersView], create: P.purchaseOrdersCreate, update: [P.purchaseOrdersUpdate] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search PO number',
    filters: [statusFilter(PO_STATES), dealershipFilter, { param: 'supplierId', label: 'Supplier', type: 'select', useOptions: useSupplierOptions }],
    columns: [
      { key: 'poNo', header: 'PO', sortKey: 'poNo', render: (p) => mono(p.poNo) },
      { key: 'supplierName', header: 'Supplier', render: (p) => strong(p.supplierName) },
      { key: 'branchName', header: 'Receive at', render: (p) => muted(p.branchName) },
      { key: 'orderDate', header: 'Ordered', sortKey: 'orderDate', render: (p) => formatDate(p.orderDate) },
      { key: 'totalAmount', header: 'Total', sortKey: 'totalAmount', className: 'text-right tabular-nums', render: (p) => formatMoney(p.totalAmount) },
      { key: 'status', header: 'Status', sortKey: 'status', render: (p) => <StatusBadge status={p.status} /> },
    ],
  },
  detail: {
    title: (p) => p.poNo,
    subtitle: (p) => `${p.supplierName ?? ''} · ${p.branchName ?? ''}`,
    fields: [
      { label: 'Supplier', value: (p) => p.supplierName },
      { label: 'Receive at', value: (p) => p.branchName },
      { label: 'Order date', value: (p) => formatDate(p.orderDate) },
      { label: 'Expected', value: (p) => formatDate(p.expectedDate) },
      { label: 'Total', value: (p) => <span className="font-semibold">{formatMoney(p.totalAmount)}</span> },
      { label: 'Notes', value: (p) => p.notes },
    ],
    sections: (p) => (
      <>
        <PurchaseOrderLines po={p} />
        <ReceiveGoods po={p} />
        <PurchaseOrderReceipts po={p} />
      </>
    ),
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.purchaseOrdersCreate },
      { name: 'branchId', label: 'Receive at branch', type: 'branch', required: true, mode: 'create', dealershipField: 'dealershipId', scopePermission: P.purchaseOrdersCreate },
      { name: 'supplierId', label: 'Supplier', type: 'select', required: true, useOptions: useSupplierOptions },
      { name: 'expectedDate', label: 'Expected delivery', type: 'date' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
    ],
    createSchema: z.object({
      dealershipId: idField('Dealership'),
      branchId: idField('Branch'),
      supplierId: idField('Supplier'),
      expectedDate: optionalDate(),
      notes: optionalText(2000),
    }),
    updateSchema: z.object({ supplierId: idField('Supplier'), expectedDate: optionalDate(), notes: optionalText(2000) }),
  },
  api: {
    useList: useListPurchaseOrdersQuery,
    useGet: useGetPurchaseOrderQuery,
    useHistory: useGetPurchaseOrderHistoryQuery,
    create: { useMutation: useCreatePurchaseOrderMutation, toArg: (v) => ({ purchaseOrderCreate: v }) },
    update: { useMutation: useUpdatePurchaseOrderMutation, toArg: (id, v) => ({ id, purchaseOrderUpdate: v }) },
  },
  workflow: {
    useDefinition: useGetPurchaseOrderWorkflowQuery,
    transition: { useMutation: useTransitionPurchaseOrderMutation, toArg: (id, action, comment) => ({ id, body: { action, comment } }) },
  },
};

/** Goods receipts are posted from a purchase order and never change afterwards. */
export const goodsReceiptView: EntityViewConfig<GoodsReceipt> = {
  singular: 'Goods receipt',
  plural: 'Goods receipts',
  basePath: '/parts/goods-receipts',
  entityType: 'parts.goods_receipt',
  permissions: { view: [P.receiptsView] },
  scope: { dealershipKey: 'dealershipId', branchKey: 'branchId' },
  list: {
    defaultSort: '-createdAt',
    searchPlaceholder: 'Search GRN or supplier invoice number',
    filters: [dealershipFilter],
    columns: [
      { key: 'grnNo', header: 'GRN', sortKey: 'grnNo', render: (g) => mono(g.grnNo) },
      { key: 'poNo', header: 'PO', render: (g) => mono(g.poNo) },
      { key: 'supplierName', header: 'Supplier', render: (g) => strong(g.supplierName) },
      { key: 'supplierInvoiceNo', header: 'Supplier invoice', render: (g) => muted(g.supplierInvoiceNo) },
      { key: 'receivedDate', header: 'Received', sortKey: 'receivedDate', render: (g) => formatDate(g.receivedDate) },
      { key: 'totalCost', header: 'Value', sortKey: 'totalCost', className: 'text-right tabular-nums', render: (g) => formatMoney(g.totalCost) },
    ],
  },
  detail: {
    title: (g) => g.grnNo,
    subtitle: (g) => `${g.supplierName ?? ''} · ${g.poNo ?? ''}`,
    fields: [
      { label: 'Purchase order', value: (g) => g.poNo },
      { label: 'Supplier', value: (g) => g.supplierName },
      { label: 'Supplier invoice', value: (g) => g.supplierInvoiceNo },
      { label: 'Received', value: (g) => formatDate(g.receivedDate) },
      { label: 'Value', value: (g) => formatMoney(g.totalCost) },
      { label: 'Received by', value: (g) => g.receivedByName },
      { label: 'Posted', value: (g) => formatDateTime(g.createdAt) },
    ],
    sections: (g) => <GoodsReceiptLines grn={g} />,
  },
  api: { useList: useListGoodsReceiptsQuery, useGet: useGetGoodsReceiptQuery, useHistory: useGetGoodsReceiptHistoryQuery },
};
