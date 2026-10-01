import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = [
  "PurchaseOrder",
  "GoodsReceipt",
  "StockMovement",
  "PartsRequest",
  "Part",
  "Supplier",
  "StockItem",
  "StockTransfer",
  "StockAdjustment",
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      receiveGoods: build.mutation<ReceiveGoodsApiResponse, ReceiveGoodsApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/parts/purchase-orders/${queryArg.id}/receipts`,
            method: "POST",
            body: queryArg.receiveGoodsRequest,
          }),
          invalidatesTags: ["PurchaseOrder"],
        },
      ),
      listGoodsReceiptLines: build.query<
        ListGoodsReceiptLinesApiResponse,
        ListGoodsReceiptLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/goods-receipts/${queryArg.id}/lines`,
        }),
        providesTags: ["GoodsReceipt"],
      }),
      listStockMovements: build.query<
        ListStockMovementsApiResponse,
        ListStockMovementsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/movements`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            branchId: queryArg.branchId,
            partId: queryArg.partId,
            type: queryArg["type"],
            referenceType: queryArg.referenceType,
            referenceId: queryArg.referenceId,
            from: queryArg["from"],
            to: queryArg.to,
          },
        }),
        providesTags: ["StockMovement"],
      }),
      createPartsRequest: build.mutation<
        CreatePartsRequestApiResponse,
        CreatePartsRequestApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/requests`,
          method: "POST",
          body: queryArg.partsRequestCreate,
        }),
        invalidatesTags: ["PartsRequest"],
      }),
      listPartsRequests: build.query<
        ListPartsRequestsApiResponse,
        ListPartsRequestsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/requests`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            jobCardId: queryArg.jobCardId,
            branchId: queryArg.branchId,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["PartsRequest"],
      }),
      listPartsRequestLines: build.query<
        ListPartsRequestLinesApiResponse,
        ListPartsRequestLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/requests/${queryArg.id}/lines`,
        }),
        providesTags: ["PartsRequest"],
      }),
      issueParts: build.mutation<IssuePartsApiResponse, IssuePartsApiArg>({
        query: (queryArg) => ({
          url: `/api/parts/requests/${queryArg.id}/issue`,
          method: "POST",
          body: queryArg.issuePartsRequest,
        }),
        invalidatesTags: ["PartsRequest"],
      }),
      returnParts: build.mutation<ReturnPartsApiResponse, ReturnPartsApiArg>({
        query: (queryArg) => ({
          url: `/api/parts/requests/${queryArg.id}/return`,
          method: "POST",
          body: queryArg.issuePartsRequest,
        }),
        invalidatesTags: ["PartsRequest"],
      }),
      listParts: build.query<ListPartsApiResponse, ListPartsApiArg>({
        query: (queryArg) => ({
          url: `/api/parts/catalog`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            brand: queryArg.brand,
            category: queryArg.category,
            isActive: queryArg.isActive,
          },
        }),
        providesTags: ["Part"],
      }),
      createPart: build.mutation<CreatePartApiResponse, CreatePartApiArg>({
        query: (queryArg) => ({
          url: `/api/parts/catalog`,
          method: "POST",
          body: queryArg.partCreate,
        }),
        invalidatesTags: ["Part"],
      }),
      getPart: build.query<GetPartApiResponse, GetPartApiArg>({
        query: (queryArg) => ({ url: `/api/parts/catalog/${queryArg.id}` }),
        providesTags: ["Part"],
      }),
      updatePart: build.mutation<UpdatePartApiResponse, UpdatePartApiArg>({
        query: (queryArg) => ({
          url: `/api/parts/catalog/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.partUpdate,
        }),
        invalidatesTags: ["Part"],
      }),
      getPartHistory: build.query<
        GetPartHistoryApiResponse,
        GetPartHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/catalog/${queryArg.id}/history`,
        }),
        providesTags: ["Part"],
      }),
      listSuppliers: build.query<ListSuppliersApiResponse, ListSuppliersApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/parts/suppliers`,
            params: {
              page: queryArg.page,
              pageSize: queryArg.pageSize,
              sort: queryArg.sort,
              q: queryArg.q,
              dealershipId: queryArg.dealershipId,
              isActive: queryArg.isActive,
            },
          }),
          providesTags: ["Supplier"],
        },
      ),
      createSupplier: build.mutation<
        CreateSupplierApiResponse,
        CreateSupplierApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/suppliers`,
          method: "POST",
          body: queryArg.supplierCreate,
        }),
        invalidatesTags: ["Supplier"],
      }),
      getSupplier: build.query<GetSupplierApiResponse, GetSupplierApiArg>({
        query: (queryArg) => ({ url: `/api/parts/suppliers/${queryArg.id}` }),
        providesTags: ["Supplier"],
      }),
      updateSupplier: build.mutation<
        UpdateSupplierApiResponse,
        UpdateSupplierApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/suppliers/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.supplierUpdate,
        }),
        invalidatesTags: ["Supplier"],
      }),
      getSupplierHistory: build.query<
        GetSupplierHistoryApiResponse,
        GetSupplierHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/suppliers/${queryArg.id}/history`,
        }),
        providesTags: ["Supplier"],
      }),
      listPurchaseOrderLines: build.query<
        ListPurchaseOrderLinesApiResponse,
        ListPurchaseOrderLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders/${queryArg.id}/lines`,
        }),
        providesTags: ["PurchaseOrder"],
      }),
      addPurchaseOrderLine: build.mutation<
        AddPurchaseOrderLineApiResponse,
        AddPurchaseOrderLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders/${queryArg.id}/lines`,
          method: "POST",
          body: queryArg.purchaseOrderLineCreate,
        }),
        invalidatesTags: ["PurchaseOrder"],
      }),
      updatePurchaseOrderLine: build.mutation<
        UpdatePurchaseOrderLineApiResponse,
        UpdatePurchaseOrderLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "PATCH",
          body: queryArg.purchaseOrderLineUpdate,
        }),
        invalidatesTags: ["PurchaseOrder"],
      }),
      removePurchaseOrderLine: build.mutation<
        RemovePurchaseOrderLineApiResponse,
        RemovePurchaseOrderLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["PurchaseOrder"],
      }),
      listPurchaseOrders: build.query<
        ListPurchaseOrdersApiResponse,
        ListPurchaseOrdersApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            supplierId: queryArg.supplierId,
            branchId: queryArg.branchId,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["PurchaseOrder"],
      }),
      createPurchaseOrder: build.mutation<
        CreatePurchaseOrderApiResponse,
        CreatePurchaseOrderApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders`,
          method: "POST",
          body: queryArg.purchaseOrderCreate,
        }),
        invalidatesTags: ["PurchaseOrder"],
      }),
      getPurchaseOrderWorkflow: build.query<
        GetPurchaseOrderWorkflowApiResponse,
        GetPurchaseOrderWorkflowApiArg
      >({
        query: () => ({ url: `/api/parts/purchase-orders/workflow` }),
        providesTags: ["PurchaseOrder"],
      }),
      getPurchaseOrder: build.query<
        GetPurchaseOrderApiResponse,
        GetPurchaseOrderApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders/${queryArg.id}`,
        }),
        providesTags: ["PurchaseOrder"],
      }),
      updatePurchaseOrder: build.mutation<
        UpdatePurchaseOrderApiResponse,
        UpdatePurchaseOrderApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.purchaseOrderUpdate,
        }),
        invalidatesTags: ["PurchaseOrder"],
      }),
      getPurchaseOrderHistory: build.query<
        GetPurchaseOrderHistoryApiResponse,
        GetPurchaseOrderHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders/${queryArg.id}/history`,
        }),
        providesTags: ["PurchaseOrder"],
      }),
      transitionPurchaseOrder: build.mutation<
        TransitionPurchaseOrderApiResponse,
        TransitionPurchaseOrderApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/purchase-orders/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["PurchaseOrder"],
      }),
      listGoodsReceipts: build.query<
        ListGoodsReceiptsApiResponse,
        ListGoodsReceiptsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/goods-receipts`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            purchaseOrderId: queryArg.purchaseOrderId,
            supplierId: queryArg.supplierId,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["GoodsReceipt"],
      }),
      getGoodsReceipt: build.query<
        GetGoodsReceiptApiResponse,
        GetGoodsReceiptApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/goods-receipts/${queryArg.id}`,
        }),
        providesTags: ["GoodsReceipt"],
      }),
      getGoodsReceiptHistory: build.query<
        GetGoodsReceiptHistoryApiResponse,
        GetGoodsReceiptHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/goods-receipts/${queryArg.id}/history`,
        }),
        providesTags: ["GoodsReceipt"],
      }),
      listStockItems: build.query<
        ListStockItemsApiResponse,
        ListStockItemsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/stock`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            branchId: queryArg.branchId,
            partId: queryArg.partId,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["StockItem"],
      }),
      getStockItem: build.query<GetStockItemApiResponse, GetStockItemApiArg>({
        query: (queryArg) => ({ url: `/api/parts/stock/${queryArg.id}` }),
        providesTags: ["StockItem"],
      }),
      updateStockItem: build.mutation<
        UpdateStockItemApiResponse,
        UpdateStockItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/stock/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.stockItemUpdate,
        }),
        invalidatesTags: ["StockItem"],
      }),
      getStockItemHistory: build.query<
        GetStockItemHistoryApiResponse,
        GetStockItemHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/stock/${queryArg.id}/history`,
        }),
        providesTags: ["StockItem"],
      }),
      getPartsRequestWorkflow: build.query<
        GetPartsRequestWorkflowApiResponse,
        GetPartsRequestWorkflowApiArg
      >({
        query: () => ({ url: `/api/parts/requests/workflow` }),
        providesTags: ["PartsRequest"],
      }),
      getPartsRequest: build.query<
        GetPartsRequestApiResponse,
        GetPartsRequestApiArg
      >({
        query: (queryArg) => ({ url: `/api/parts/requests/${queryArg.id}` }),
        providesTags: ["PartsRequest"],
      }),
      getPartsRequestHistory: build.query<
        GetPartsRequestHistoryApiResponse,
        GetPartsRequestHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/requests/${queryArg.id}/history`,
        }),
        providesTags: ["PartsRequest"],
      }),
      transitionPartsRequest: build.mutation<
        TransitionPartsRequestApiResponse,
        TransitionPartsRequestApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/requests/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["PartsRequest"],
      }),
      listStockTransferLines: build.query<
        ListStockTransferLinesApiResponse,
        ListStockTransferLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers/${queryArg.id}/lines`,
        }),
        providesTags: ["StockTransfer"],
      }),
      addStockTransferLine: build.mutation<
        AddStockTransferLineApiResponse,
        AddStockTransferLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers/${queryArg.id}/lines`,
          method: "POST",
          body: queryArg.transferLineCreate,
        }),
        invalidatesTags: ["StockTransfer"],
      }),
      updateStockTransferLine: build.mutation<
        UpdateStockTransferLineApiResponse,
        UpdateStockTransferLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "PATCH",
          body: queryArg.transferLineUpdate,
        }),
        invalidatesTags: ["StockTransfer"],
      }),
      removeStockTransferLine: build.mutation<
        RemoveStockTransferLineApiResponse,
        RemoveStockTransferLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["StockTransfer"],
      }),
      listStockTransfers: build.query<
        ListStockTransfersApiResponse,
        ListStockTransfersApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            toBranchId: queryArg.toBranchId,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["StockTransfer"],
      }),
      createStockTransfer: build.mutation<
        CreateStockTransferApiResponse,
        CreateStockTransferApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers`,
          method: "POST",
          body: queryArg.stockTransferCreate,
        }),
        invalidatesTags: ["StockTransfer"],
      }),
      getStockTransferWorkflow: build.query<
        GetStockTransferWorkflowApiResponse,
        GetStockTransferWorkflowApiArg
      >({
        query: () => ({ url: `/api/parts/transfers/workflow` }),
        providesTags: ["StockTransfer"],
      }),
      getStockTransfer: build.query<
        GetStockTransferApiResponse,
        GetStockTransferApiArg
      >({
        query: (queryArg) => ({ url: `/api/parts/transfers/${queryArg.id}` }),
        providesTags: ["StockTransfer"],
      }),
      updateStockTransfer: build.mutation<
        UpdateStockTransferApiResponse,
        UpdateStockTransferApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.stockTransferUpdate,
        }),
        invalidatesTags: ["StockTransfer"],
      }),
      getStockTransferHistory: build.query<
        GetStockTransferHistoryApiResponse,
        GetStockTransferHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers/${queryArg.id}/history`,
        }),
        providesTags: ["StockTransfer"],
      }),
      transitionStockTransfer: build.mutation<
        TransitionStockTransferApiResponse,
        TransitionStockTransferApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/transfers/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["StockTransfer"],
      }),
      listStockAdjustmentLines: build.query<
        ListStockAdjustmentLinesApiResponse,
        ListStockAdjustmentLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments/${queryArg.id}/lines`,
        }),
        providesTags: ["StockAdjustment"],
      }),
      addStockAdjustmentLine: build.mutation<
        AddStockAdjustmentLineApiResponse,
        AddStockAdjustmentLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments/${queryArg.id}/lines`,
          method: "POST",
          body: queryArg.adjustmentLineCreate,
        }),
        invalidatesTags: ["StockAdjustment"],
      }),
      updateStockAdjustmentLine: build.mutation<
        UpdateStockAdjustmentLineApiResponse,
        UpdateStockAdjustmentLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "PATCH",
          body: queryArg.adjustmentLineUpdate,
        }),
        invalidatesTags: ["StockAdjustment"],
      }),
      removeStockAdjustmentLine: build.mutation<
        RemoveStockAdjustmentLineApiResponse,
        RemoveStockAdjustmentLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["StockAdjustment"],
      }),
      listStockAdjustments: build.query<
        ListStockAdjustmentsApiResponse,
        ListStockAdjustmentsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            reason: queryArg.reason,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["StockAdjustment"],
      }),
      createStockAdjustment: build.mutation<
        CreateStockAdjustmentApiResponse,
        CreateStockAdjustmentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments`,
          method: "POST",
          body: queryArg.stockAdjustmentCreate,
        }),
        invalidatesTags: ["StockAdjustment"],
      }),
      getStockAdjustmentWorkflow: build.query<
        GetStockAdjustmentWorkflowApiResponse,
        GetStockAdjustmentWorkflowApiArg
      >({
        query: () => ({ url: `/api/parts/adjustments/workflow` }),
        providesTags: ["StockAdjustment"],
      }),
      getStockAdjustment: build.query<
        GetStockAdjustmentApiResponse,
        GetStockAdjustmentApiArg
      >({
        query: (queryArg) => ({ url: `/api/parts/adjustments/${queryArg.id}` }),
        providesTags: ["StockAdjustment"],
      }),
      updateStockAdjustment: build.mutation<
        UpdateStockAdjustmentApiResponse,
        UpdateStockAdjustmentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.stockAdjustmentUpdate,
        }),
        invalidatesTags: ["StockAdjustment"],
      }),
      getStockAdjustmentHistory: build.query<
        GetStockAdjustmentHistoryApiResponse,
        GetStockAdjustmentHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments/${queryArg.id}/history`,
        }),
        providesTags: ["StockAdjustment"],
      }),
      transitionStockAdjustment: build.mutation<
        TransitionStockAdjustmentApiResponse,
        TransitionStockAdjustmentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/parts/adjustments/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["StockAdjustment"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type ReceiveGoodsApiResponse = /** status 201 Success */ {
  id: number;
  grnNo: string;
  dealershipId: number;
  branchId: number;
  purchaseOrderId: number;
  poNo?: string | null;
  supplierId: number;
  supplierName?: string | null;
  supplierInvoiceNo: string | null;
  receivedDate: string;
  totalCost: string;
  notes: string | null;
  receivedById: number;
  receivedByName?: string | null;
  createdAt: string;
};
export type ReceiveGoodsApiArg = {
  id: number;
  receiveGoodsRequest: ReceiveGoodsRequest;
};
export type ListGoodsReceiptLinesApiResponse =
  /** status 200 Success */ GoodsReceiptLine[];
export type ListGoodsReceiptLinesApiArg = {
  id: number;
};
export type ListStockMovementsApiResponse =
  /** status 200 Success */ StockMovementPage;
export type ListStockMovementsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  branchId?: number;
  partId?: number;
  type?:
    | "receipt"
    | "issue"
    | "return"
    | "transfer_out"
    | "transfer_in"
    | "adjustment";
  referenceType?: string;
  referenceId?: number;
  from?: string;
  to?: string;
};
export type CreatePartsRequestApiResponse = /** status 201 Success */ {
  id: number;
  requestNo: string;
  dealershipId: number;
  branchId: number;
  branchName?: string | null;
  jobCardId: number;
  jobCardNo?: string | null;
  requestedById: number;
  requestedByName?: string | null;
  notes: string | null;
  status: "open" | "partially_issued" | "issued" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type CreatePartsRequestApiArg = {
  partsRequestCreate: PartsRequestCreate;
};
export type ListPartsRequestsApiResponse =
  /** status 200 Success */ PartsRequestPage;
export type ListPartsRequestsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?: "open" | "partially_issued" | "issued" | "cancelled";
  jobCardId?: number;
  branchId?: number;
  dealershipId?: number;
};
export type ListPartsRequestLinesApiResponse =
  /** status 200 Success */ PartsRequestLine[];
export type ListPartsRequestLinesApiArg = {
  id: number;
};
export type IssuePartsApiResponse =
  /** status 200 Success */ PartsRequestLine[];
export type IssuePartsApiArg = {
  id: number;
  issuePartsRequest: IssuePartsRequest;
};
export type ReturnPartsApiResponse =
  /** status 200 Success */ PartsRequestLine[];
export type ReturnPartsApiArg = {
  id: number;
  issuePartsRequest: IssuePartsRequest;
};
export type ListPartsApiResponse = /** status 200 Success */ PartPage;
export type ListPartsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  brand?: string;
  category?: string;
  isActive?: "true" | "false";
};
export type CreatePartApiResponse = /** status 201 Success */ Part;
export type CreatePartApiArg = {
  partCreate: PartCreate;
};
export type GetPartApiResponse = /** status 200 Success */ Part;
export type GetPartApiArg = {
  id: number;
};
export type UpdatePartApiResponse = /** status 200 Success */ Part;
export type UpdatePartApiArg = {
  id: number;
  partUpdate: PartUpdate;
};
export type GetPartHistoryApiResponse = /** status 200 Success */ EntityHistory;
export type GetPartHistoryApiArg = {
  id: number;
};
export type ListSuppliersApiResponse = /** status 200 Success */ SupplierPage;
export type ListSuppliersApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId?: number;
  isActive?: "true" | "false";
};
export type CreateSupplierApiResponse = /** status 201 Success */ Supplier;
export type CreateSupplierApiArg = {
  supplierCreate: SupplierCreate;
};
export type GetSupplierApiResponse = /** status 200 Success */ Supplier;
export type GetSupplierApiArg = {
  id: number;
};
export type UpdateSupplierApiResponse = /** status 200 Success */ Supplier;
export type UpdateSupplierApiArg = {
  id: number;
  supplierUpdate: SupplierUpdate;
};
export type GetSupplierHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetSupplierHistoryApiArg = {
  id: number;
};
export type ListPurchaseOrderLinesApiResponse =
  /** status 200 Success */ PurchaseOrderLine[];
export type ListPurchaseOrderLinesApiArg = {
  id: number;
};
export type AddPurchaseOrderLineApiResponse =
  /** status 201 Success */ PurchaseOrderLine;
export type AddPurchaseOrderLineApiArg = {
  id: number;
  purchaseOrderLineCreate: PurchaseOrderLineCreate;
};
export type UpdatePurchaseOrderLineApiResponse =
  /** status 200 Success */ PurchaseOrderLine;
export type UpdatePurchaseOrderLineApiArg = {
  id: number;
  lineId: number;
  purchaseOrderLineUpdate: PurchaseOrderLineUpdate;
};
export type RemovePurchaseOrderLineApiResponse = unknown;
export type RemovePurchaseOrderLineApiArg = {
  id: number;
  lineId: number;
};
export type ListPurchaseOrdersApiResponse =
  /** status 200 Success */ PurchaseOrderPage;
export type ListPurchaseOrdersApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?:
    | "draft"
    | "submitted"
    | "approved"
    | "partially_received"
    | "received"
    | "cancelled";
  supplierId?: number;
  branchId?: number;
  dealershipId?: number;
};
export type CreatePurchaseOrderApiResponse =
  /** status 201 Success */ PurchaseOrder;
export type CreatePurchaseOrderApiArg = {
  purchaseOrderCreate: PurchaseOrderCreate;
};
export type GetPurchaseOrderWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetPurchaseOrderWorkflowApiArg = void;
export type GetPurchaseOrderApiResponse =
  /** status 200 Success */ PurchaseOrder;
export type GetPurchaseOrderApiArg = {
  id: number;
};
export type UpdatePurchaseOrderApiResponse =
  /** status 200 Success */ PurchaseOrder;
export type UpdatePurchaseOrderApiArg = {
  id: number;
  purchaseOrderUpdate: PurchaseOrderUpdate;
};
export type GetPurchaseOrderHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetPurchaseOrderHistoryApiArg = {
  id: number;
};
export type TransitionPurchaseOrderApiResponse =
  /** status 200 Success */ PurchaseOrder;
export type TransitionPurchaseOrderApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type ListGoodsReceiptsApiResponse =
  /** status 200 Success */ GoodsReceiptPage;
export type ListGoodsReceiptsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  purchaseOrderId?: number;
  supplierId?: number;
  dealershipId?: number;
};
export type GetGoodsReceiptApiResponse = /** status 200 Success */ GoodsReceipt;
export type GetGoodsReceiptApiArg = {
  id: number;
};
export type GetGoodsReceiptHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetGoodsReceiptHistoryApiArg = {
  id: number;
};
export type ListStockItemsApiResponse = /** status 200 Success */ StockItemPage;
export type ListStockItemsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  branchId?: number;
  partId?: number;
  dealershipId?: number;
};
export type GetStockItemApiResponse = /** status 200 Success */ StockItem;
export type GetStockItemApiArg = {
  id: number;
};
export type UpdateStockItemApiResponse = /** status 200 Success */ StockItem;
export type UpdateStockItemApiArg = {
  id: number;
  stockItemUpdate: StockItemUpdate;
};
export type GetStockItemHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetStockItemHistoryApiArg = {
  id: number;
};
export type GetPartsRequestWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetPartsRequestWorkflowApiArg = void;
export type GetPartsRequestApiResponse = /** status 200 Success */ PartsRequest;
export type GetPartsRequestApiArg = {
  id: number;
};
export type GetPartsRequestHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetPartsRequestHistoryApiArg = {
  id: number;
};
export type TransitionPartsRequestApiResponse =
  /** status 200 Success */ PartsRequest;
export type TransitionPartsRequestApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type ListStockTransferLinesApiResponse =
  /** status 200 Success */ StockTransferLine[];
export type ListStockTransferLinesApiArg = {
  id: number;
};
export type AddStockTransferLineApiResponse =
  /** status 201 Success */ StockTransferLine;
export type AddStockTransferLineApiArg = {
  id: number;
  transferLineCreate: TransferLineCreate;
};
export type UpdateStockTransferLineApiResponse =
  /** status 200 Success */ StockTransferLine;
export type UpdateStockTransferLineApiArg = {
  id: number;
  lineId: number;
  transferLineUpdate: TransferLineUpdate;
};
export type RemoveStockTransferLineApiResponse = unknown;
export type RemoveStockTransferLineApiArg = {
  id: number;
  lineId: number;
};
export type ListStockTransfersApiResponse =
  /** status 200 Success */ StockTransferPage;
export type ListStockTransfersApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?: "draft" | "dispatched" | "received" | "cancelled";
  toBranchId?: number;
  dealershipId?: number;
};
export type CreateStockTransferApiResponse =
  /** status 201 Success */ StockTransfer;
export type CreateStockTransferApiArg = {
  stockTransferCreate: StockTransferCreate;
};
export type GetStockTransferWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetStockTransferWorkflowApiArg = void;
export type GetStockTransferApiResponse =
  /** status 200 Success */ StockTransfer;
export type GetStockTransferApiArg = {
  id: number;
};
export type UpdateStockTransferApiResponse =
  /** status 200 Success */ StockTransfer;
export type UpdateStockTransferApiArg = {
  id: number;
  stockTransferUpdate: StockTransferUpdate;
};
export type GetStockTransferHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetStockTransferHistoryApiArg = {
  id: number;
};
export type TransitionStockTransferApiResponse =
  /** status 200 Success */ StockTransfer;
export type TransitionStockTransferApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type ListStockAdjustmentLinesApiResponse =
  /** status 200 Success */ StockAdjustmentLine[];
export type ListStockAdjustmentLinesApiArg = {
  id: number;
};
export type AddStockAdjustmentLineApiResponse =
  /** status 201 Success */ StockAdjustmentLine;
export type AddStockAdjustmentLineApiArg = {
  id: number;
  adjustmentLineCreate: AdjustmentLineCreate;
};
export type UpdateStockAdjustmentLineApiResponse =
  /** status 200 Success */ StockAdjustmentLine;
export type UpdateStockAdjustmentLineApiArg = {
  id: number;
  lineId: number;
  adjustmentLineUpdate: AdjustmentLineUpdate;
};
export type RemoveStockAdjustmentLineApiResponse = unknown;
export type RemoveStockAdjustmentLineApiArg = {
  id: number;
  lineId: number;
};
export type ListStockAdjustmentsApiResponse =
  /** status 200 Success */ StockAdjustmentPage;
export type ListStockAdjustmentsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?: "draft" | "submitted" | "posted" | "rejected";
  reason?: string;
  dealershipId?: number;
};
export type CreateStockAdjustmentApiResponse =
  /** status 201 Success */ StockAdjustment;
export type CreateStockAdjustmentApiArg = {
  stockAdjustmentCreate: StockAdjustmentCreate;
};
export type GetStockAdjustmentWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetStockAdjustmentWorkflowApiArg = void;
export type GetStockAdjustmentApiResponse =
  /** status 200 Success */ StockAdjustment;
export type GetStockAdjustmentApiArg = {
  id: number;
};
export type UpdateStockAdjustmentApiResponse =
  /** status 200 Success */ StockAdjustment;
export type UpdateStockAdjustmentApiArg = {
  id: number;
  stockAdjustmentUpdate: StockAdjustmentUpdate;
};
export type GetStockAdjustmentHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetStockAdjustmentHistoryApiArg = {
  id: number;
};
export type TransitionStockAdjustmentApiResponse =
  /** status 200 Success */ StockAdjustment;
export type TransitionStockAdjustmentApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: any | null;
  };
};
export type ReceiveGoodsRequest = {
  receivedDate?: string;
  supplierInvoiceNo?: string | null;
  notes?: string | null;
  lines: {
    lineId: number;
    quantity: string;
  }[];
};
export type GoodsReceiptLine = {
  id: number;
  purchaseOrderLineId: number;
  partId: number;
  partNo: string;
  description: string;
  quantity: string;
  unitCost: string;
  amount: string;
};
export type StockMovement = {
  id: number;
  occurredAt: string;
  branchId: number;
  partId: number;
  partNo: string;
  type:
    | "receipt"
    | "issue"
    | "return"
    | "transfer_out"
    | "transfer_in"
    | "adjustment";
  quantity: string;
  unitCost: string;
  value: string;
  balanceAfter: string;
  averageCostAfter: string;
  referenceType: string;
  referenceId: number;
  referenceNo: string | null;
  notes: string | null;
  actorName: string | null;
};
export type StockMovementPage = {
  items: StockMovement[];
  total: number;
  page: number;
  pageSize: number;
};
export type PartsRequestCreate = {
  jobCardId: number;
  branchId: number;
  notes?: string | null;
  lines: {
    partNo: string;
    quantity: string;
  }[];
};
export type PartsRequest = {
  id: number;
  requestNo: string;
  dealershipId: number;
  branchId: number;
  branchName?: string | null;
  jobCardId: number;
  jobCardNo?: string | null;
  requestedById: number;
  requestedByName?: string | null;
  notes: string | null;
  status: "open" | "partially_issued" | "issued" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type PartsRequestPage = {
  items: PartsRequest[];
  total: number;
  page: number;
  pageSize: number;
};
export type PartsRequestLine = {
  id: number;
  partId: number;
  partNo: string;
  description: string;
  quantity: string;
  issuedQty: string;
  returnedQty: string;
  onHand?: string | null;
};
export type IssuePartsRequest = {
  lines: {
    lineId: number;
    quantity: string;
  }[];
};
export type Part = {
  id: number;
  partNo: string;
  description: string;
  brand: string | null;
  category: string | null;
  uom: "each" | "set" | "litre" | "kg" | "metre";
  sellingPrice: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type PartPage = {
  items: Part[];
  total: number;
  page: number;
  pageSize: number;
};
export type PartCreate = {
  partNo: string;
  description: string;
  brand?: string | null;
  category?: string | null;
  uom?: "each" | "set" | "litre" | "kg" | "metre";
  sellingPrice: string;
  isActive?: boolean;
};
export type PartUpdate = {
  description?: string;
  brand?: string | null;
  category?: string | null;
  uom?: "each" | "set" | "litre" | "kg" | "metre";
  sellingPrice?: string;
  isActive?: boolean;
};
export type AuditEntry = {
  id: number;
  occurredAt: string;
  actorId: number | null;
  actorName: string | null;
  entityType: string;
  entityId: string;
  action: string;
  dealershipId: number | null;
  branchId: number | null;
  changes?: any | null;
};
export type WorkflowTransition = {
  id: number;
  action: string;
  fromState: string;
  toState: string;
  comment: string | null;
  actorId: number;
  actorName: string | null;
  occurredAt: string;
};
export type EntityHistory = {
  audit: AuditEntry[];
  transitions: WorkflowTransition[];
};
export type Supplier = {
  id: number;
  dealershipId: number;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  ntn: string | null;
  address: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type SupplierPage = {
  items: Supplier[];
  total: number;
  page: number;
  pageSize: number;
};
export type SupplierCreate = {
  dealershipId: number;
  code: string;
  name: string;
  phone?: string | null;
  email?: (string | null) | "" | (any | null);
  ntn?: string | null;
  address?: string | null;
  paymentTermsDays?: number;
  isActive?: boolean;
};
export type SupplierUpdate = {
  name?: string;
  phone?: string | null;
  email?: (string | null) | "" | (any | null);
  ntn?: string | null;
  address?: string | null;
  paymentTermsDays?: number;
  isActive?: boolean;
};
export type PurchaseOrderLine = {
  id: number;
  purchaseOrderId: number;
  partId: number;
  partNo: string;
  description: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  receivedQty: string;
};
export type PurchaseOrderLineCreate = {
  partNo: string;
  quantity: string;
  unitPrice: string;
  description?: string;
};
export type PurchaseOrderLineUpdate = {
  quantity?: string;
  unitPrice?: string;
  partNo?: string;
  description?: string;
};
export type PurchaseOrder = {
  id: number;
  poNo: string;
  dealershipId: number;
  branchId: number;
  branchName?: string | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  supplierId: number;
  supplierName?: string | null;
  orderDate: string;
  expectedDate: string | null;
  totalAmount: string;
  notes: string | null;
  status:
    | "draft"
    | "submitted"
    | "approved"
    | "partially_received"
    | "received"
    | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type PurchaseOrderPage = {
  items: PurchaseOrder[];
  total: number;
  page: number;
  pageSize: number;
};
export type PurchaseOrderCreate = {
  dealershipId: number;
  branchId: number;
  supplierId: number;
  orderDate?: string;
  expectedDate?: string | null;
  notes?: string | null;
};
export type WorkflowDefinition = {
  stateKey: string;
  initial: string;
  states: {
    key: string;
    label: string;
    terminal?: boolean;
  }[];
  transitions: {
    action: string;
    label: string;
    from: string[];
    to: string;
    requiresComment: boolean;
    system: boolean;
  }[];
};
export type PurchaseOrderUpdate = {
  supplierId?: number;
  expectedDate?: string | null;
  notes?: string | null;
};
export type GoodsReceipt = {
  id: number;
  grnNo: string;
  dealershipId: number;
  branchId: number;
  purchaseOrderId: number;
  poNo?: string | null;
  supplierId: number;
  supplierName?: string | null;
  supplierInvoiceNo: string | null;
  receivedDate: string;
  totalCost: string;
  notes: string | null;
  receivedById: number;
  receivedByName?: string | null;
  createdAt: string;
};
export type GoodsReceiptPage = {
  items: GoodsReceipt[];
  total: number;
  page: number;
  pageSize: number;
};
export type StockItem = {
  id: number;
  dealershipId: number;
  branchId: number;
  branchName?: string | null;
  partId: number;
  partNo?: string | null;
  partDescription?: string | null;
  quantityOnHand: string;
  averageCost: string;
  binLocation: string | null;
  reorderLevel: string;
  updatedAt: string;
};
export type StockItemPage = {
  items: StockItem[];
  total: number;
  page: number;
  pageSize: number;
};
export type StockItemUpdate = {
  binLocation?: string | null;
  reorderLevel?: string | number;
};
export type StockTransferLine = {
  id: number;
  partId: number;
  partNo: string;
  description: string;
  quantity: string;
  unitCost: string | null;
};
export type TransferLineCreate = {
  partNo: string;
  quantity: string;
};
export type TransferLineUpdate = {
  quantity?: string;
};
export type StockTransfer = {
  id: number;
  transferNo: string;
  dealershipId: number;
  branchId: number;
  branchName?: string | null;
  toBranchId: number;
  toBranchName?: string | null;
  notes: string | null;
  dispatchedAt: string | null;
  receivedAt: string | null;
  status: "draft" | "dispatched" | "received" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type StockTransferPage = {
  items: StockTransfer[];
  total: number;
  page: number;
  pageSize: number;
};
export type StockTransferCreate = {
  dealershipId: number;
  branchId: number;
  toBranchId: number;
  notes?: string | null;
};
export type StockTransferUpdate = {
  notes?: string | null;
};
export type StockAdjustmentLine = {
  id: number;
  partId: number;
  partNo: string;
  description: string;
  quantity: string;
  unitCost: string | null;
};
export type AdjustmentLineCreate = {
  partNo: string;
  quantity: string;
  unitCost?: string;
};
export type AdjustmentLineUpdate = {
  quantity?: string;
  unitCost?: string;
};
export type StockAdjustment = {
  id: number;
  adjustmentNo: string;
  dealershipId: number;
  branchId: number;
  branchName?: string | null;
  reason: "count" | "damage" | "expiry" | "opening" | "other";
  notes: string | null;
  postedAt: string | null;
  status: "draft" | "submitted" | "posted" | "rejected";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type StockAdjustmentPage = {
  items: StockAdjustment[];
  total: number;
  page: number;
  pageSize: number;
};
export type StockAdjustmentCreate = {
  dealershipId: number;
  branchId: number;
  reason: "count" | "damage" | "expiry" | "opening" | "other";
  notes?: string | null;
};
export type StockAdjustmentUpdate = {
  reason?: "count" | "damage" | "expiry" | "opening" | "other";
  notes?: string | null;
};
export const {
  useReceiveGoodsMutation,
  useListGoodsReceiptLinesQuery,
  useLazyListGoodsReceiptLinesQuery,
  useListStockMovementsQuery,
  useLazyListStockMovementsQuery,
  useCreatePartsRequestMutation,
  useListPartsRequestsQuery,
  useLazyListPartsRequestsQuery,
  useListPartsRequestLinesQuery,
  useLazyListPartsRequestLinesQuery,
  useIssuePartsMutation,
  useReturnPartsMutation,
  useListPartsQuery,
  useLazyListPartsQuery,
  useCreatePartMutation,
  useGetPartQuery,
  useLazyGetPartQuery,
  useUpdatePartMutation,
  useGetPartHistoryQuery,
  useLazyGetPartHistoryQuery,
  useListSuppliersQuery,
  useLazyListSuppliersQuery,
  useCreateSupplierMutation,
  useGetSupplierQuery,
  useLazyGetSupplierQuery,
  useUpdateSupplierMutation,
  useGetSupplierHistoryQuery,
  useLazyGetSupplierHistoryQuery,
  useListPurchaseOrderLinesQuery,
  useLazyListPurchaseOrderLinesQuery,
  useAddPurchaseOrderLineMutation,
  useUpdatePurchaseOrderLineMutation,
  useRemovePurchaseOrderLineMutation,
  useListPurchaseOrdersQuery,
  useLazyListPurchaseOrdersQuery,
  useCreatePurchaseOrderMutation,
  useGetPurchaseOrderWorkflowQuery,
  useLazyGetPurchaseOrderWorkflowQuery,
  useGetPurchaseOrderQuery,
  useLazyGetPurchaseOrderQuery,
  useUpdatePurchaseOrderMutation,
  useGetPurchaseOrderHistoryQuery,
  useLazyGetPurchaseOrderHistoryQuery,
  useTransitionPurchaseOrderMutation,
  useListGoodsReceiptsQuery,
  useLazyListGoodsReceiptsQuery,
  useGetGoodsReceiptQuery,
  useLazyGetGoodsReceiptQuery,
  useGetGoodsReceiptHistoryQuery,
  useLazyGetGoodsReceiptHistoryQuery,
  useListStockItemsQuery,
  useLazyListStockItemsQuery,
  useGetStockItemQuery,
  useLazyGetStockItemQuery,
  useUpdateStockItemMutation,
  useGetStockItemHistoryQuery,
  useLazyGetStockItemHistoryQuery,
  useGetPartsRequestWorkflowQuery,
  useLazyGetPartsRequestWorkflowQuery,
  useGetPartsRequestQuery,
  useLazyGetPartsRequestQuery,
  useGetPartsRequestHistoryQuery,
  useLazyGetPartsRequestHistoryQuery,
  useTransitionPartsRequestMutation,
  useListStockTransferLinesQuery,
  useLazyListStockTransferLinesQuery,
  useAddStockTransferLineMutation,
  useUpdateStockTransferLineMutation,
  useRemoveStockTransferLineMutation,
  useListStockTransfersQuery,
  useLazyListStockTransfersQuery,
  useCreateStockTransferMutation,
  useGetStockTransferWorkflowQuery,
  useLazyGetStockTransferWorkflowQuery,
  useGetStockTransferQuery,
  useLazyGetStockTransferQuery,
  useUpdateStockTransferMutation,
  useGetStockTransferHistoryQuery,
  useLazyGetStockTransferHistoryQuery,
  useTransitionStockTransferMutation,
  useListStockAdjustmentLinesQuery,
  useLazyListStockAdjustmentLinesQuery,
  useAddStockAdjustmentLineMutation,
  useUpdateStockAdjustmentLineMutation,
  useRemoveStockAdjustmentLineMutation,
  useListStockAdjustmentsQuery,
  useLazyListStockAdjustmentsQuery,
  useCreateStockAdjustmentMutation,
  useGetStockAdjustmentWorkflowQuery,
  useLazyGetStockAdjustmentWorkflowQuery,
  useGetStockAdjustmentQuery,
  useLazyGetStockAdjustmentQuery,
  useUpdateStockAdjustmentMutation,
  useGetStockAdjustmentHistoryQuery,
  useLazyGetStockAdjustmentHistoryQuery,
  useTransitionStockAdjustmentMutation,
} = injectedRtkApi;
