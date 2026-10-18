import { enhancedApi } from './partsApi.generated';

/**
 * Parts endpoints: generated from OpenAPI, plus the stock effects of each action. Anything that
 * moves stock refreshes stock levels and the ledger; issues/returns also change the job card.
 */
const STOCK = ['StockItem', 'StockMovement'] as const;

export const partsApi = enhancedApi
  .enhanceEndpoints({ addTagTypes: ['JobCard'] })
  .enhanceEndpoints({
    endpoints: {
      receiveStock: { invalidatesTags: ['GoodsReceipt', 'Store', ...STOCK] },
      issueStock: { invalidatesTags: ['Store', ...STOCK] },
      importParts: { invalidatesTags: ['Part'] },
      addPart: { invalidatesTags: ['Part', 'Store'] },
      changePart: { invalidatesTags: ['Part', 'Store'] },
      changePrices: { invalidatesTags: ['Part', 'Store'] },
      receiveGoods: { invalidatesTags: ['PurchaseOrder', 'GoodsReceipt', ...STOCK] },
      transitionPurchaseOrder: { invalidatesTags: ['PurchaseOrder'] },
      createPartsRequest: { invalidatesTags: ['PartsRequest'] },
      issueParts: { invalidatesTags: ['PartsRequest', 'JobCard', ...STOCK] },
      returnParts: { invalidatesTags: ['PartsRequest', 'JobCard', ...STOCK] },
      transitionStockTransfer: { invalidatesTags: ['StockTransfer', ...STOCK] },
      transitionStockAdjustment: { invalidatesTags: ['StockAdjustment', ...STOCK] },
      listStockMovements: { keepUnusedDataFor: 30 },
    },
  });

export * from './partsApi.generated';
