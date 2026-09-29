import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = [
  "Invoice",
  "Payment",
  "JournalEntry",
  "AccountsReports",
  "Account",
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      createInvoiceFromSource: build.mutation<
        CreateInvoiceFromSourceApiResponse,
        CreateInvoiceFromSourceApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices`,
          method: "POST",
          body: queryArg.invoiceFromSource,
        }),
        invalidatesTags: ["Invoice"],
      }),
      listInvoices: build.query<ListInvoicesApiResponse, ListInvoicesApiArg>({
        query: (queryArg) => ({
          url: `/api/accounts/invoices`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            dealershipId: queryArg.dealershipId,
            status: queryArg.status,
            kind: queryArg.kind,
            customerId: queryArg.customerId,
            sourceType: queryArg.sourceType,
            sourceId: queryArg.sourceId,
          },
        }),
        providesTags: ["Invoice"],
      }),
      listInvoicePayments: build.query<
        ListInvoicePaymentsApiResponse,
        ListInvoicePaymentsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices/${queryArg.id}/payments`,
        }),
        providesTags: ["Invoice"],
      }),
      createPayment: build.mutation<
        CreatePaymentApiResponse,
        CreatePaymentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/payments`,
          method: "POST",
          body: queryArg.paymentCreate,
        }),
        invalidatesTags: ["Payment"],
      }),
      listPayments: build.query<ListPaymentsApiResponse, ListPaymentsApiArg>({
        query: (queryArg) => ({
          url: `/api/accounts/payments`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            dealershipId: queryArg.dealershipId,
            direction: queryArg.direction,
            method: queryArg.method,
            status: queryArg.status,
            customerId: queryArg.customerId,
            supplierId: queryArg.supplierId,
          },
        }),
        providesTags: ["Payment"],
      }),
      listPaymentAllocations: build.query<
        ListPaymentAllocationsApiResponse,
        ListPaymentAllocationsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/payments/${queryArg.id}/allocations`,
        }),
        providesTags: ["Payment"],
      }),
      allocatePayment: build.mutation<
        AllocatePaymentApiResponse,
        AllocatePaymentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/payments/${queryArg.id}/allocations`,
          method: "POST",
          body: queryArg.allocatePaymentRequest,
        }),
        invalidatesTags: ["Payment"],
      }),
      postManualJournal: build.mutation<
        PostManualJournalApiResponse,
        PostManualJournalApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/journals`,
          method: "POST",
          body: queryArg.manualJournalCreate,
        }),
        invalidatesTags: ["JournalEntry"],
      }),
      listJournalEntries: build.query<
        ListJournalEntriesApiResponse,
        ListJournalEntriesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/journals`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            dealershipId: queryArg.dealershipId,
            source: queryArg.source,
            sourceType: queryArg.sourceType,
            sourceId: queryArg.sourceId,
          },
        }),
        providesTags: ["JournalEntry"],
      }),
      listJournalEntryLines: build.query<
        ListJournalEntryLinesApiResponse,
        ListJournalEntryLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/journals/${queryArg.id}/lines`,
        }),
        providesTags: ["JournalEntry"],
      }),
      reverseJournalEntry: build.mutation<
        ReverseJournalEntryApiResponse,
        ReverseJournalEntryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/journals/${queryArg.id}/reverse`,
          method: "POST",
          body: queryArg.reverseJournalRequest,
        }),
        invalidatesTags: ["JournalEntry"],
      }),
      getTrialBalance: build.query<
        GetTrialBalanceApiResponse,
        GetTrialBalanceApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/reports/trial-balance`,
          params: {
            dealershipId: queryArg.dealershipId,
            asOf: queryArg.asOf,
          },
        }),
        providesTags: ["AccountsReports"],
      }),
      getAccountLedger: build.query<
        GetAccountLedgerApiResponse,
        GetAccountLedgerApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/reports/ledger`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            accountId: queryArg.accountId,
            from: queryArg["from"],
            to: queryArg.to,
          },
        }),
        providesTags: ["AccountsReports"],
      }),
      getReceivablesAging: build.query<
        GetReceivablesAgingApiResponse,
        GetReceivablesAgingApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/reports/receivables`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["AccountsReports"],
      }),
      getPayablesBySupplier: build.query<
        GetPayablesBySupplierApiResponse,
        GetPayablesBySupplierApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/reports/payables`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["AccountsReports"],
      }),
      listAccounts: build.query<ListAccountsApiResponse, ListAccountsApiArg>({
        query: (queryArg) => ({
          url: `/api/accounts/chart`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            dealershipId: queryArg.dealershipId,
            type: queryArg["type"],
            isActive: queryArg.isActive,
          },
        }),
        providesTags: ["Account"],
      }),
      createAccount: build.mutation<
        CreateAccountApiResponse,
        CreateAccountApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/chart`,
          method: "POST",
          body: queryArg.accountCreate,
        }),
        invalidatesTags: ["Account"],
      }),
      getAccount: build.query<GetAccountApiResponse, GetAccountApiArg>({
        query: (queryArg) => ({ url: `/api/accounts/chart/${queryArg.id}` }),
        providesTags: ["Account"],
      }),
      updateAccount: build.mutation<
        UpdateAccountApiResponse,
        UpdateAccountApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/chart/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.accountUpdate,
        }),
        invalidatesTags: ["Account"],
      }),
      getAccountHistory: build.query<
        GetAccountHistoryApiResponse,
        GetAccountHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/chart/${queryArg.id}/history`,
        }),
        providesTags: ["Account"],
      }),
      getJournalEntry: build.query<
        GetJournalEntryApiResponse,
        GetJournalEntryApiArg
      >({
        query: (queryArg) => ({ url: `/api/accounts/journals/${queryArg.id}` }),
        providesTags: ["JournalEntry"],
      }),
      getJournalEntryHistory: build.query<
        GetJournalEntryHistoryApiResponse,
        GetJournalEntryHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/journals/${queryArg.id}/history`,
        }),
        providesTags: ["JournalEntry"],
      }),
      listInvoiceLines: build.query<
        ListInvoiceLinesApiResponse,
        ListInvoiceLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices/${queryArg.id}/lines`,
        }),
        providesTags: ["Invoice"],
      }),
      addInvoiceLine: build.mutation<
        AddInvoiceLineApiResponse,
        AddInvoiceLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices/${queryArg.id}/lines`,
          method: "POST",
          body: queryArg.invoiceLineCreate,
        }),
        invalidatesTags: ["Invoice"],
      }),
      updateInvoiceLine: build.mutation<
        UpdateInvoiceLineApiResponse,
        UpdateInvoiceLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "PATCH",
          body: queryArg.invoiceLineUpdate,
        }),
        invalidatesTags: ["Invoice"],
      }),
      removeInvoiceLine: build.mutation<
        RemoveInvoiceLineApiResponse,
        RemoveInvoiceLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["Invoice"],
      }),
      getInvoiceWorkflow: build.query<
        GetInvoiceWorkflowApiResponse,
        GetInvoiceWorkflowApiArg
      >({
        query: () => ({ url: `/api/accounts/invoices/workflow` }),
        providesTags: ["Invoice"],
      }),
      getInvoice: build.query<GetInvoiceApiResponse, GetInvoiceApiArg>({
        query: (queryArg) => ({ url: `/api/accounts/invoices/${queryArg.id}` }),
        providesTags: ["Invoice"],
      }),
      updateInvoice: build.mutation<
        UpdateInvoiceApiResponse,
        UpdateInvoiceApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.invoiceUpdate,
        }),
        invalidatesTags: ["Invoice"],
      }),
      getInvoiceHistory: build.query<
        GetInvoiceHistoryApiResponse,
        GetInvoiceHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices/${queryArg.id}/history`,
        }),
        providesTags: ["Invoice"],
      }),
      transitionInvoice: build.mutation<
        TransitionInvoiceApiResponse,
        TransitionInvoiceApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/invoices/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["Invoice"],
      }),
      getPaymentWorkflow: build.query<
        GetPaymentWorkflowApiResponse,
        GetPaymentWorkflowApiArg
      >({
        query: () => ({ url: `/api/accounts/payments/workflow` }),
        providesTags: ["Payment"],
      }),
      getPayment: build.query<GetPaymentApiResponse, GetPaymentApiArg>({
        query: (queryArg) => ({ url: `/api/accounts/payments/${queryArg.id}` }),
        providesTags: ["Payment"],
      }),
      getPaymentHistory: build.query<
        GetPaymentHistoryApiResponse,
        GetPaymentHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/payments/${queryArg.id}/history`,
        }),
        providesTags: ["Payment"],
      }),
      transitionPayment: build.mutation<
        TransitionPaymentApiResponse,
        TransitionPaymentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/accounts/payments/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["Payment"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type CreateInvoiceFromSourceApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  invoiceNo: string;
  kind: "vehicle_sale" | "service";
  customerId: number;
  customerName?: string | null;
  sourceType: string;
  sourceId: number;
  sourceNo: string | null;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  notes: string | null;
  journalEntryId: number | null;
  status: "draft" | "issued" | "partially_paid" | "paid" | "void" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type CreateInvoiceFromSourceApiArg = {
  invoiceFromSource: InvoiceFromSource;
};
export type ListInvoicesApiResponse = /** status 200 Success */ InvoicePage;
export type ListInvoicesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId?: number;
  status?:
    "draft" | "issued" | "partially_paid" | "paid" | "void" | "cancelled";
  kind?: "vehicle_sale" | "service";
  customerId?: number;
  sourceType?: string;
  sourceId?: number;
};
export type ListInvoicePaymentsApiResponse =
  /** status 200 Success */ PaymentAllocation[];
export type ListInvoicePaymentsApiArg = {
  id: number;
};
export type CreatePaymentApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  paymentNo: string;
  direction: "receipt" | "disbursement";
  customerId: number | null;
  customerName?: string | null;
  supplierId: number | null;
  supplierName?: string | null;
  method: "cash" | "bank_transfer" | "cheque" | "card";
  reference: string | null;
  paymentDate: string;
  amount: string;
  notes: string | null;
  journalEntryId: number | null;
  status: "posted" | "void";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type CreatePaymentApiArg = {
  paymentCreate: PaymentCreate;
};
export type ListPaymentsApiResponse = /** status 200 Success */ PaymentPage;
export type ListPaymentsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId?: number;
  direction?: "receipt" | "disbursement";
  method?: "cash" | "bank_transfer" | "cheque" | "card";
  status?: "posted" | "void";
  customerId?: number;
  supplierId?: number;
};
export type ListPaymentAllocationsApiResponse =
  /** status 200 Success */ PaymentAllocation[];
export type ListPaymentAllocationsApiArg = {
  id: number;
};
export type AllocatePaymentApiResponse =
  /** status 200 Success */ PaymentAllocation[];
export type AllocatePaymentApiArg = {
  id: number;
  allocatePaymentRequest: AllocatePaymentRequest;
};
export type PostManualJournalApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  entryNo: string;
  entryDate: string;
  source:
    "manual" | "reversal" | "invoice" | "payment" | "goods_receipt" | "stock";
  sourceType: string | null;
  sourceId: number | null;
  memo: string;
  totalAmount: string;
  reversalOfId: number | null;
  reversedById?: number | null;
  postedById: number;
  postedByName?: string | null;
  postedAt: string;
};
export type PostManualJournalApiArg = {
  manualJournalCreate: ManualJournalCreate;
};
export type ListJournalEntriesApiResponse =
  /** status 200 Success */ JournalEntryPage;
export type ListJournalEntriesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId?: number;
  source?:
    "manual" | "reversal" | "invoice" | "payment" | "goods_receipt" | "stock";
  sourceType?: string;
  sourceId?: number;
};
export type ListJournalEntryLinesApiResponse =
  /** status 200 Success */ JournalLine[];
export type ListJournalEntryLinesApiArg = {
  id: number;
};
export type ReverseJournalEntryApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  entryNo: string;
  entryDate: string;
  source:
    "manual" | "reversal" | "invoice" | "payment" | "goods_receipt" | "stock";
  sourceType: string | null;
  sourceId: number | null;
  memo: string;
  totalAmount: string;
  reversalOfId: number | null;
  reversedById?: number | null;
  postedById: number;
  postedByName?: string | null;
  postedAt: string;
};
export type ReverseJournalEntryApiArg = {
  id: number;
  reverseJournalRequest: ReverseJournalRequest;
};
export type GetTrialBalanceApiResponse = /** status 200 Success */ TrialBalance;
export type GetTrialBalanceApiArg = {
  dealershipId: number;
  asOf?: string;
};
export type GetAccountLedgerApiResponse = /** status 200 Success */ LedgerPage;
export type GetAccountLedgerApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  accountId: number;
  from?: string;
  to?: string;
};
export type GetReceivablesAgingApiResponse =
  /** status 200 Success */ ReceivableAgingPage;
export type GetReceivablesAgingApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId: number;
};
export type GetPayablesBySupplierApiResponse =
  /** status 200 Success */ SupplierBalancePage;
export type GetPayablesBySupplierApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId: number;
};
export type ListAccountsApiResponse = /** status 200 Success */ AccountPage;
export type ListAccountsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId?: number;
  type?: "asset" | "liability" | "equity" | "income" | "expense";
  isActive?: "true" | "false";
};
export type CreateAccountApiResponse = /** status 201 Success */ Account;
export type CreateAccountApiArg = {
  accountCreate: AccountCreate;
};
export type GetAccountApiResponse = /** status 200 Success */ Account;
export type GetAccountApiArg = {
  id: number;
};
export type UpdateAccountApiResponse = /** status 200 Success */ Account;
export type UpdateAccountApiArg = {
  id: number;
  accountUpdate: AccountUpdate;
};
export type GetAccountHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetAccountHistoryApiArg = {
  id: number;
};
export type GetJournalEntryApiResponse = /** status 200 Success */ JournalEntry;
export type GetJournalEntryApiArg = {
  id: number;
};
export type GetJournalEntryHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetJournalEntryHistoryApiArg = {
  id: number;
};
export type ListInvoiceLinesApiResponse =
  /** status 200 Success */ InvoiceLine[];
export type ListInvoiceLinesApiArg = {
  id: number;
};
export type AddInvoiceLineApiResponse = /** status 201 Success */ InvoiceLine;
export type AddInvoiceLineApiArg = {
  id: number;
  invoiceLineCreate: InvoiceLineCreate;
};
export type UpdateInvoiceLineApiResponse =
  /** status 200 Success */ InvoiceLine;
export type UpdateInvoiceLineApiArg = {
  id: number;
  lineId: number;
  invoiceLineUpdate: InvoiceLineUpdate;
};
export type RemoveInvoiceLineApiResponse = unknown;
export type RemoveInvoiceLineApiArg = {
  id: number;
  lineId: number;
};
export type GetInvoiceWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetInvoiceWorkflowApiArg = void;
export type GetInvoiceApiResponse = /** status 200 Success */ Invoice;
export type GetInvoiceApiArg = {
  id: number;
};
export type UpdateInvoiceApiResponse = /** status 200 Success */ Invoice;
export type UpdateInvoiceApiArg = {
  id: number;
  invoiceUpdate: InvoiceUpdate;
};
export type GetInvoiceHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetInvoiceHistoryApiArg = {
  id: number;
};
export type TransitionInvoiceApiResponse = /** status 200 Success */ Invoice;
export type TransitionInvoiceApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type GetPaymentWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetPaymentWorkflowApiArg = void;
export type GetPaymentApiResponse = /** status 200 Success */ Payment;
export type GetPaymentApiArg = {
  id: number;
};
export type GetPaymentHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetPaymentHistoryApiArg = {
  id: number;
};
export type TransitionPaymentApiResponse = /** status 200 Success */ Payment;
export type TransitionPaymentApiArg = {
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
export type InvoiceFromSource = {
  sourceType: "sales_order" | "job_card";
  sourceId: number;
  notes?: string | null;
};
export type Invoice = {
  id: number;
  dealershipId: number;
  branchId: number | null;
  invoiceNo: string;
  kind: "vehicle_sale" | "service";
  customerId: number;
  customerName?: string | null;
  sourceType: string;
  sourceId: number;
  sourceNo: string | null;
  invoiceDate: string;
  dueDate: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  notes: string | null;
  journalEntryId: number | null;
  status: "draft" | "issued" | "partially_paid" | "paid" | "void" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type InvoicePage = {
  items: Invoice[];
  total: number;
  page: number;
  pageSize: number;
};
export type PaymentAllocation = {
  id: number;
  paymentId: number;
  paymentNo: string;
  paymentDate: string;
  paymentStatus: "posted" | "void";
  invoiceId: number;
  invoiceNo: string;
  amount: string;
};
export type PaymentCreate = {
  dealershipId: number;
  branchId?: number | null;
  direction: "receipt" | "disbursement";
  customerId?: number | null;
  supplierId?: number | null;
  method: "cash" | "bank_transfer" | "cheque" | "card";
  reference?: string | null;
  paymentDate?: string;
  amount: string;
  notes?: string | null;
  allocations?: {
    invoiceId: number;
    amount: string;
  }[];
};
export type Payment = {
  id: number;
  dealershipId: number;
  branchId: number | null;
  paymentNo: string;
  direction: "receipt" | "disbursement";
  customerId: number | null;
  customerName?: string | null;
  supplierId: number | null;
  supplierName?: string | null;
  method: "cash" | "bank_transfer" | "cheque" | "card";
  reference: string | null;
  paymentDate: string;
  amount: string;
  notes: string | null;
  journalEntryId: number | null;
  status: "posted" | "void";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type PaymentPage = {
  items: Payment[];
  total: number;
  page: number;
  pageSize: number;
};
export type AllocatePaymentRequest = {
  invoiceId: number;
  amount: string;
};
export type ManualJournalCreate = {
  dealershipId: number;
  branchId?: number | null;
  entryDate?: string;
  memo: string;
  lines: {
    accountId: number;
    debit?: string;
    credit?: string;
    customerId?: number | null;
    supplierId?: number | null;
    description?: string | null;
  }[];
};
export type JournalEntry = {
  id: number;
  dealershipId: number;
  branchId: number | null;
  entryNo: string;
  entryDate: string;
  source:
    "manual" | "reversal" | "invoice" | "payment" | "goods_receipt" | "stock";
  sourceType: string | null;
  sourceId: number | null;
  memo: string;
  totalAmount: string;
  reversalOfId: number | null;
  reversedById?: number | null;
  postedById: number;
  postedByName?: string | null;
  postedAt: string;
};
export type JournalEntryPage = {
  items: JournalEntry[];
  total: number;
  page: number;
  pageSize: number;
};
export type JournalLine = {
  id: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  customerId: number | null;
  customerName: string | null;
  supplierId: number | null;
  supplierName: string | null;
  description: string | null;
};
export type ReverseJournalRequest = {
  memo: string;
};
export type TrialBalance = {
  dealershipId: number;
  asOf: string;
  rows: {
    accountId: number;
    code: string;
    name: string;
    type: "asset" | "liability" | "equity" | "income" | "expense";
    debit: string;
    credit: string;
    balance: string;
  }[];
  totalDebit: string;
  totalCredit: string;
  balanced: boolean;
};
export type LedgerRow = {
  lineId: number;
  journalEntryId: number;
  entryNo: string;
  entryDate: string;
  memo: string;
  description: string | null;
  debit: string;
  credit: string;
  balance: string;
};
export type LedgerPage = {
  items: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
};
export type ReceivableAging = {
  customerId: number;
  customerName: string;
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  over90: string;
  total: string;
};
export type ReceivableAgingPage = {
  items: ReceivableAging[];
  total: number;
  page: number;
  pageSize: number;
};
export type SupplierBalance = {
  supplierId: number;
  supplierName: string;
  billed: string;
  paid: string;
  balance: string;
};
export type SupplierBalancePage = {
  items: SupplierBalance[];
  total: number;
  page: number;
  pageSize: number;
};
export type Account = {
  id: number;
  dealershipId: number;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
  role: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type AccountPage = {
  items: Account[];
  total: number;
  page: number;
  pageSize: number;
};
export type AccountCreate = {
  dealershipId: number;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense";
};
export type AccountUpdate = {
  name?: string;
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
export type InvoiceLine = {
  id: number;
  invoiceId: number;
  kind: "vehicle" | "labour" | "part" | "other";
  description: string;
  partNo: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  taxRate: string;
  taxAmount: string;
};
export type InvoiceLineCreate = {
  kind?: "vehicle" | "labour" | "part" | "other";
  description: string;
  partNo?: string | null;
  quantity: string;
  unitPrice: string;
};
export type InvoiceLineUpdate = {
  description?: string;
  quantity?: string;
  unitPrice?: string;
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
export type InvoiceUpdate = {
  dueDate?: string;
  notes?: string | null;
};
export const {
  useCreateInvoiceFromSourceMutation,
  useListInvoicesQuery,
  useLazyListInvoicesQuery,
  useListInvoicePaymentsQuery,
  useLazyListInvoicePaymentsQuery,
  useCreatePaymentMutation,
  useListPaymentsQuery,
  useLazyListPaymentsQuery,
  useListPaymentAllocationsQuery,
  useLazyListPaymentAllocationsQuery,
  useAllocatePaymentMutation,
  usePostManualJournalMutation,
  useListJournalEntriesQuery,
  useLazyListJournalEntriesQuery,
  useListJournalEntryLinesQuery,
  useLazyListJournalEntryLinesQuery,
  useReverseJournalEntryMutation,
  useGetTrialBalanceQuery,
  useLazyGetTrialBalanceQuery,
  useGetAccountLedgerQuery,
  useLazyGetAccountLedgerQuery,
  useGetReceivablesAgingQuery,
  useLazyGetReceivablesAgingQuery,
  useGetPayablesBySupplierQuery,
  useLazyGetPayablesBySupplierQuery,
  useListAccountsQuery,
  useLazyListAccountsQuery,
  useCreateAccountMutation,
  useGetAccountQuery,
  useLazyGetAccountQuery,
  useUpdateAccountMutation,
  useGetAccountHistoryQuery,
  useLazyGetAccountHistoryQuery,
  useGetJournalEntryQuery,
  useLazyGetJournalEntryQuery,
  useGetJournalEntryHistoryQuery,
  useLazyGetJournalEntryHistoryQuery,
  useListInvoiceLinesQuery,
  useLazyListInvoiceLinesQuery,
  useAddInvoiceLineMutation,
  useUpdateInvoiceLineMutation,
  useRemoveInvoiceLineMutation,
  useGetInvoiceWorkflowQuery,
  useLazyGetInvoiceWorkflowQuery,
  useGetInvoiceQuery,
  useLazyGetInvoiceQuery,
  useUpdateInvoiceMutation,
  useGetInvoiceHistoryQuery,
  useLazyGetInvoiceHistoryQuery,
  useTransitionInvoiceMutation,
  useGetPaymentWorkflowQuery,
  useLazyGetPaymentWorkflowQuery,
  useGetPaymentQuery,
  useLazyGetPaymentQuery,
  useGetPaymentHistoryQuery,
  useLazyGetPaymentHistoryQuery,
  useTransitionPaymentMutation,
} = injectedRtkApi;
