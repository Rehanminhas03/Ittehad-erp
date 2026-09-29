import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { entityRoutes } from '@/shared/routing';
import { accountView, invoiceView, journalView, paymentView } from './config';
import NewJournalPage from './pages/NewJournalPage';
import PayablesPage from './pages/PayablesPage';
import ReceivablesPage from './pages/ReceivablesPage';
import RecordPaymentPage from './pages/RecordPaymentPage';
import TrialBalancePage from './pages/TrialBalancePage';
import { P } from './permissions';

const guard = (codes: string[], el: ReactNode) => <RequirePermission any={codes}>{el}</RequirePermission>;

/** Accounts module routes (lazy-loaded as one chunk from the app router). */
export default function AccountsRoutes() {
  return (
    <Routes>
      <Route index element={<Navigate to="invoices" replace />} />
      {entityRoutes('invoices', invoiceView)}
      <Route path="payments/new" element={guard([P.paymentsCreate], <RecordPaymentPage />)} />
      {entityRoutes('payments', paymentView)}
      <Route path="journals/new" element={guard([P.journalsPost], <NewJournalPage />)} />
      {entityRoutes('journals', journalView)}
      {entityRoutes('chart', accountView)}
      <Route path="reports/trial-balance" element={guard([P.reportsView], <TrialBalancePage />)} />
      <Route path="reports/receivables" element={guard([P.reportsView], <ReceivablesPage />)} />
      <Route path="reports/payables" element={guard([P.reportsView], <PayablesPage />)} />
    </Routes>
  );
}
