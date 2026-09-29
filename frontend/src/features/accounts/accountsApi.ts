import { enhancedApi } from './accountsApi.generated';

/**
 * Accounts endpoints: generated from OpenAPI, plus the ledger effects of each action. Anything that
 * posts to the journal refreshes journals and reports. Reports and journals are also posted to by
 * other modules (goods receipts, stock issues), so they are never served stale from the cache.
 */
const BOOKS = ['JournalEntry', 'AccountsReports'] as const;

export const accountsApi = enhancedApi.enhanceEndpoints({
  endpoints: {
    createInvoiceFromSource: { invalidatesTags: ['Invoice'] },
    transitionInvoice: { invalidatesTags: ['Invoice', 'Payment', ...BOOKS] },
    createPayment: { invalidatesTags: ['Payment', 'Invoice', ...BOOKS] },
    allocatePayment: { invalidatesTags: ['Payment', 'Invoice', 'AccountsReports'] },
    transitionPayment: { invalidatesTags: ['Payment', 'Invoice', ...BOOKS] },
    postManualJournal: { invalidatesTags: [...BOOKS] },
    reverseJournalEntry: { invalidatesTags: [...BOOKS] },
    listJournalEntries: { keepUnusedDataFor: 0 },
    getTrialBalance: { keepUnusedDataFor: 0 },
    getAccountLedger: { keepUnusedDataFor: 0 },
    getReceivablesAging: { keepUnusedDataFor: 0 },
    getPayablesBySupplier: { keepUnusedDataFor: 0 },
  },
});

export * from './accountsApi.generated';
