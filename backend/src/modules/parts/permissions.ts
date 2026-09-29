import { definePermissions } from '../../auth/permissions';

export const PartsPerm = definePermissions('parts', {
  catalogView: ['parts.catalog.view', 'View the parts catalogue'],
  catalogManage: ['parts.catalog.manage', 'Maintain the parts catalogue and selling prices (global grant required)'],

  suppliersView: ['parts.suppliers.view', 'View suppliers'],
  suppliersCreate: ['parts.suppliers.create', 'Create suppliers'],
  suppliersUpdate: ['parts.suppliers.update', 'Edit suppliers'],

  purchaseOrdersView: ['parts.purchase_orders.view', 'View purchase orders'],
  purchaseOrdersCreate: ['parts.purchase_orders.create', 'Create purchase orders'],
  purchaseOrdersUpdate: ['parts.purchase_orders.update', 'Edit draft purchase orders'],
  purchaseOrdersSubmit: ['parts.purchase_orders.submit', 'Submit purchase orders for approval'],
  purchaseOrdersApprove: ['parts.purchase_orders.approve', 'Approve or return purchase orders'],
  purchaseOrdersCancel: ['parts.purchase_orders.cancel', 'Cancel purchase orders'],

  receiptsView: ['parts.receipts.view', 'View goods receipts'],
  receiptsCreate: ['parts.receipts.create', 'Receive goods against purchase orders (posts stock)'],

  stockView: ['parts.stock.view', 'View stock levels and movements'],
  stockManage: ['parts.stock.manage', 'Set bin locations and reorder levels'],

  adjustmentsView: ['parts.adjustments.view', 'View stock adjustments'],
  adjustmentsCreate: ['parts.adjustments.create', 'Prepare stock adjustments'],
  adjustmentsApprove: ['parts.adjustments.approve', 'Approve (post) or reject stock adjustments'],

  transfersView: ['parts.transfers.view', 'View stock transfers'],
  transfersCreate: ['parts.transfers.create', 'Prepare stock transfers'],
  transfersDispatch: ['parts.transfers.dispatch', 'Dispatch transfers (stock leaves the source branch)'],
  transfersReceive: ['parts.transfers.receive', 'Receive transfers (stock arrives at the destination branch)'],

  requestsView: ['parts.requests.view', 'View parts requests'],
  requestsCreate: ['parts.requests.create', 'Request parts for a job card'],
  requestsCancel: ['parts.requests.cancel', 'Cancel parts requests'],
  issuesCreate: ['parts.issues.create', 'Issue parts to job cards and take returns'],
});
