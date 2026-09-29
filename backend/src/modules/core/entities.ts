import { inArray } from 'drizzle-orm';
import type { EntityConfig, Row } from '../../entity/types';
import { conflict } from '../../lib/errors';
import { BoolQuery, IdQuery } from '../../lib/zod';
import { accountingEntity, branch, dealership, legalEntity, role } from './models';
import { CorePerm } from './permissions';
import {
  AccountingEntityCreate,
  AccountingEntitySchema,
  AccountingEntityUpdate,
  BranchCreate,
  BranchSchema,
  BranchUpdate,
  DealershipCreate,
  DealershipSchema,
  DealershipUpdate,
  LegalEntityCreate,
  LegalEntitySchema,
  LegalEntityUpdate,
  RoleCreate,
  RoleSchema,
  RoleUpdate,
} from './schemas';

export const dealershipEntity: EntityConfig = {
  entityType: 'core.dealership',
  module: 'core',
  path: 'dealerships',
  names: { singular: 'Dealership', plural: 'Dealerships' },
  table: dealership,
  schemas: { read: DealershipSchema, create: DealershipCreate, update: DealershipUpdate },
  permissions: { view: CorePerm.dealershipsView, create: CorePerm.dealershipsCreate, update: CorePerm.dealershipsUpdate },
  tenant: { dealershipKey: 'id', root: true },
  search: ['name', 'code', 'brand', 'city'],
  filters: { isActive: { key: 'isActive', schema: BoolQuery } },
  sort: { default: 'name', keys: ['name', 'code', 'brand', 'createdAt'] },
};

export const branchEntity: EntityConfig = {
  entityType: 'core.branch',
  module: 'core',
  path: 'branches',
  names: { singular: 'Branch', plural: 'Branches' },
  table: branch,
  schemas: { read: BranchSchema, create: BranchCreate, update: BranchUpdate },
  permissions: { view: CorePerm.branchesView, create: CorePerm.branchesCreate, update: CorePerm.branchesUpdate },
  tenant: { dealershipKey: 'dealershipId', branchKey: 'id' },
  search: ['name', 'code', 'city'],
  filters: {
    dealershipId: { key: 'dealershipId', schema: IdQuery },
    isActive: { key: 'isActive', schema: BoolQuery },
  },
  sort: { default: 'name', keys: ['name', 'code', 'city', 'createdAt'] },
  hooks: {
    decorate: async (ctx, rows) => {
      const ids = [...new Set(rows.map((r) => r.dealershipId as number))];
      if (!ids.length) return rows;
      const ds = await ctx.tx.select({ id: dealership.id, name: dealership.name }).from(dealership).where(inArray(dealership.id, ids));
      const names = new Map(ds.map((d) => [d.id, d.name]));
      return rows.map((r) => ({ ...r, dealershipName: names.get(r.dealershipId as number) }));
    },
  },
};

// Note: a new branch has no id, so its create check resolves to branchId null and only a
// dealership-level (or global) grant passes; a branch-level grant cannot create sibling branches.

export const legalEntityEntity: EntityConfig = {
  entityType: 'core.legal_entity',
  module: 'core',
  path: 'legal-entities',
  names: { singular: 'LegalEntity', plural: 'LegalEntities' },
  table: legalEntity,
  schemas: { read: LegalEntitySchema, create: LegalEntityCreate, update: LegalEntityUpdate },
  permissions: { view: CorePerm.entitiesView, create: CorePerm.entitiesManage, update: CorePerm.entitiesManage },
  tenant: null,
  tracked: false,
  search: ['name', 'registrationNo', 'taxNo'],
  sort: { default: 'name', keys: ['name', 'createdAt'] },
};

export const accountingEntityEntity: EntityConfig = {
  entityType: 'core.accounting_entity',
  module: 'core',
  path: 'accounting-entities',
  names: { singular: 'AccountingEntity', plural: 'AccountingEntities' },
  table: accountingEntity,
  schemas: { read: AccountingEntitySchema, create: AccountingEntityCreate, update: AccountingEntityUpdate },
  permissions: { view: CorePerm.entitiesView, create: CorePerm.entitiesManage, update: CorePerm.entitiesManage },
  tenant: null,
  tracked: false,
  search: ['name'],
  filters: { legalEntityId: { key: 'legalEntityId', schema: IdQuery } },
  sort: { default: 'name', keys: ['name', 'createdAt'] },
};

export const roleEntity: EntityConfig = {
  entityType: 'core.role',
  module: 'core',
  path: 'roles',
  names: { singular: 'Role', plural: 'Roles' },
  table: role,
  schemas: { read: RoleSchema, create: RoleCreate, update: RoleUpdate },
  permissions: {
    view: CorePerm.rolesView,
    create: CorePerm.rolesManage,
    update: CorePerm.rolesManage,
    delete: CorePerm.rolesManage,
  },
  tenant: null,
  search: ['name', 'description'],
  sort: { default: 'name', keys: ['name', 'createdAt'] },
  hooks: {
    beforeDelete: async (_ctx, row: Row) => {
      if (row.isSystem) throw conflict('System roles cannot be deleted');
    },
  },
};
