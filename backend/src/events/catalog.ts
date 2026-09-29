/**
 * Every domain event, with its payload. Modules publish and subscribe through src/events/bus.ts.
 */
export interface VehicleActivatedPayload {
  vehicleId: number;
  modelId: number;
  customerId: number;
  /** Delivery date: start of warranty and of the service schedule. */
  activatedOn: string;
  odometerKm: number;
  salesOrderId: number;
  deliveryId: number;
}

export interface GoodsReceivedPayload {
  goodsReceiptId: number;
  purchaseOrderId: number;
  supplierId: number;
  branchId: number;
  /** Stock value received (quantity x cost), for payables and inventory postings. */
  totalCost: string;
}

export interface StockMovedPayload {
  /** 'issue' (to a job card), 'return', 'adjustment' (posted). */
  kind: 'issue' | 'return' | 'adjustment';
  referenceType: string;
  referenceId: number;
  branchId: number;
  /** Signed stock value moved (negative = out of stock). */
  value: string;
}

export interface DomainEventMap {
  /** A new vehicle was delivered to its first owner (fired by Sales; Service builds its schedule from it). */
  'vehicle.activated': VehicleActivatedPayload;
  /** Goods received against a purchase order (Parts; Accounts posts inventory / payables). */
  'goods.received': GoodsReceivedPayload;
  /** Stock consumed, returned or adjusted (Parts; Accounts posts cost of sales / write-offs). */
  'stock.moved': StockMovedPayload;
}

export type DomainEventType = keyof DomainEventMap;
