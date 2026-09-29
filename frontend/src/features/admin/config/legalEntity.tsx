import { z } from 'zod';
import { type EntityViewConfig, optionalText, requiredText, strong } from '@/shared/entity';
import { formatDateTime } from '@/shared/lib';
import {
  type LegalEntity,
  useCreateLegalEntityMutation,
  useGetLegalEntityHistoryQuery,
  useGetLegalEntityQuery,
  useListLegalEntitiesQuery,
  useUpdateLegalEntityMutation,
} from '../adminApi';
import { P } from '../permissions';

export const legalEntityView: EntityViewConfig<LegalEntity> = {
  singular: 'Legal entity',
  plural: 'Legal entities',
  basePath: '/admin/legal-entities',
  entityType: 'core.legal_entity',
  permissions: { view: [P.entitiesView], create: P.entitiesManage, update: [P.entitiesManage] },
  list: {
    defaultSort: 'name',
    columns: [
      { key: 'name', header: 'Name', sortKey: 'name', render: (e) => strong(e.name) },
      { key: 'registrationNo', header: 'Registration no.', render: (e) => e.registrationNo ?? '—' },
      { key: 'taxNo', header: 'Tax no. (NTN)', render: (e) => e.taxNo ?? '—' },
    ],
  },
  detail: {
    title: (e) => e.name,
    fields: [
      { label: 'Registration no.', value: (e) => e.registrationNo },
      { label: 'Tax no. (NTN)', value: (e) => e.taxNo },
      { label: 'Created', value: (e) => formatDateTime(e.createdAt) },
    ],
  },
  form: {
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, span: 2 },
      { name: 'registrationNo', label: 'Registration no.', type: 'text' },
      { name: 'taxNo', label: 'Tax no. (NTN)', type: 'text' },
    ],
    createSchema: z.object({ name: requiredText(), registrationNo: optionalText(60), taxNo: optionalText(60) }),
  },
  api: {
    useList: useListLegalEntitiesQuery,
    useGet: useGetLegalEntityQuery,
    useHistory: useGetLegalEntityHistoryQuery,
    create: { useMutation: useCreateLegalEntityMutation, toArg: (v) => ({ legalEntityCreate: v }) },
    update: { useMutation: useUpdateLegalEntityMutation, toArg: (id, v) => ({ id, legalEntityUpdate: v }) },
  },
};
