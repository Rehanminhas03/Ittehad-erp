import { z } from 'zod';
import { type EntityViewConfig, optionalId, requiredText, strong } from '@/shared/entity';
import {
  type AccountingEntity,
  useCreateAccountingEntityMutation,
  useGetAccountingEntityHistoryQuery,
  useGetAccountingEntityQuery,
  useListAccountingEntitiesQuery,
  useListLegalEntitiesQuery,
  useUpdateAccountingEntityMutation,
} from '../adminApi';
import { P } from '../permissions';

const useLegalEntityOptions = () =>
  (useListLegalEntitiesQuery({ pageSize: 100 }).data?.items ?? []).map((e) => ({ value: String(e.id), label: e.name }));

export const accountingEntityView: EntityViewConfig<AccountingEntity> = {
  singular: 'Accounting entity',
  plural: 'Accounting entities',
  basePath: '/admin/accounting-entities',
  entityType: 'core.accounting_entity',
  permissions: { view: [P.entitiesView], create: P.entitiesManage, update: [P.entitiesManage] },
  list: {
    defaultSort: 'name',
    columns: [
      { key: 'name', header: 'Name', sortKey: 'name', render: (e) => strong(e.name) },
      { key: 'baseCurrency', header: 'Currency' },
    ],
  },
  detail: {
    title: (e) => e.name,
    fields: [
      { label: 'Base currency', value: (e) => e.baseCurrency },
      { label: 'Legal entity', value: (e) => (e.legalEntityId ? `#${e.legalEntityId}` : '—') },
    ],
  },
  form: {
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true },
      { name: 'baseCurrency', label: 'Base currency', type: 'text', required: true },
      { name: 'legalEntityId', label: 'Legal entity', type: 'select', useOptions: useLegalEntityOptions },
    ],
    defaults: { baseCurrency: 'PKR' },
    createSchema: z.object({ name: requiredText(), baseCurrency: z.string().trim().length(3).toUpperCase(), legalEntityId: optionalId() }),
  },
  api: {
    useList: useListAccountingEntitiesQuery,
    useGet: useGetAccountingEntityQuery,
    useHistory: useGetAccountingEntityHistoryQuery,
    create: { useMutation: useCreateAccountingEntityMutation, toArg: (v) => ({ accountingEntityCreate: v }) },
    update: { useMutation: useUpdateAccountingEntityMutation, toArg: (id, v) => ({ id, accountingEntityUpdate: v }) },
  },
};
