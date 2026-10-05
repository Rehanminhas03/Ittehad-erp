import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = [
  "User",
  "Role",
  "Permission",
  "Audit",
  "Dealership",
  "Branch",
  "LegalEntity",
  "AccountingEntity",
  "Activity",
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      listUsers: build.query<ListUsersApiResponse, ListUsersApiArg>({
        query: (queryArg) => ({
          url: `/api/core/users`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            isActive: queryArg.isActive,
            dealershipId: queryArg.dealershipId,
            roleId: queryArg.roleId,
            inactiveDays: queryArg.inactiveDays,
          },
        }),
        providesTags: ["User"],
      }),
      createUser: build.mutation<CreateUserApiResponse, CreateUserApiArg>({
        query: (queryArg) => ({
          url: `/api/core/users`,
          method: "POST",
          body: queryArg.userCreate,
        }),
        invalidatesTags: ["User"],
      }),
      getUser: build.query<GetUserApiResponse, GetUserApiArg>({
        query: (queryArg) => ({ url: `/api/core/users/${queryArg.id}` }),
        providesTags: ["User"],
      }),
      updateUser: build.mutation<UpdateUserApiResponse, UpdateUserApiArg>({
        query: (queryArg) => ({
          url: `/api/core/users/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.userUpdate,
        }),
        invalidatesTags: ["User"],
      }),
      assignUserRole: build.mutation<
        AssignUserRoleApiResponse,
        AssignUserRoleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/users/${queryArg.id}/roles`,
          method: "POST",
          body: queryArg.roleAssignmentInput,
        }),
        invalidatesTags: ["User"],
      }),
      revokeUserRole: build.mutation<
        RevokeUserRoleApiResponse,
        RevokeUserRoleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/users/${queryArg.id}/roles/${queryArg.assignmentId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["User"],
      }),
      listAssignableRoles: build.query<
        ListAssignableRolesApiResponse,
        ListAssignableRolesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/roles/assignable`,
          params: {
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["Role"],
      }),
      getRolePermissions: build.query<
        GetRolePermissionsApiResponse,
        GetRolePermissionsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/roles/${queryArg.id}/permissions`,
        }),
        providesTags: ["Role"],
      }),
      setRolePermissions: build.mutation<
        SetRolePermissionsApiResponse,
        SetRolePermissionsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/roles/${queryArg.id}/permissions`,
          method: "PUT",
          body: queryArg.rolePermissionsUpdate,
        }),
        invalidatesTags: ["Role"],
      }),
      listPermissions: build.query<
        ListPermissionsApiResponse,
        ListPermissionsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/permissions`,
          params: {
            module: queryArg["module"],
          },
        }),
        providesTags: ["Permission"],
      }),
      listAuditLog: build.query<ListAuditLogApiResponse, ListAuditLogApiArg>({
        query: (queryArg) => ({
          url: `/api/core/audit`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            entityType: queryArg.entityType,
            entityId: queryArg.entityId,
            actorId: queryArg.actorId,
            dealershipId: queryArg.dealershipId,
            action: queryArg.action,
            from: queryArg["from"],
            to: queryArg.to,
          },
        }),
        providesTags: ["Audit"],
      }),
      listDealerships: build.query<
        ListDealershipsApiResponse,
        ListDealershipsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/dealerships`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            isActive: queryArg.isActive,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["Dealership"],
      }),
      createDealership: build.mutation<
        CreateDealershipApiResponse,
        CreateDealershipApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/dealerships`,
          method: "POST",
          body: queryArg.dealershipCreate,
        }),
        invalidatesTags: ["Dealership"],
      }),
      getDealership: build.query<GetDealershipApiResponse, GetDealershipApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/core/dealerships/${queryArg.id}`,
          }),
          providesTags: ["Dealership"],
        },
      ),
      updateDealership: build.mutation<
        UpdateDealershipApiResponse,
        UpdateDealershipApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/dealerships/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.dealershipUpdate,
        }),
        invalidatesTags: ["Dealership"],
      }),
      getDealershipHistory: build.query<
        GetDealershipHistoryApiResponse,
        GetDealershipHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/dealerships/${queryArg.id}/history`,
        }),
        providesTags: ["Dealership"],
      }),
      listBranches: build.query<ListBranchesApiResponse, ListBranchesApiArg>({
        query: (queryArg) => ({
          url: `/api/core/branches`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            dealershipId: queryArg.dealershipId,
            isActive: queryArg.isActive,
          },
        }),
        providesTags: ["Branch"],
      }),
      createBranch: build.mutation<CreateBranchApiResponse, CreateBranchApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/core/branches`,
            method: "POST",
            body: queryArg.branchCreate,
          }),
          invalidatesTags: ["Branch"],
        },
      ),
      getBranch: build.query<GetBranchApiResponse, GetBranchApiArg>({
        query: (queryArg) => ({ url: `/api/core/branches/${queryArg.id}` }),
        providesTags: ["Branch"],
      }),
      updateBranch: build.mutation<UpdateBranchApiResponse, UpdateBranchApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/core/branches/${queryArg.id}`,
            method: "PATCH",
            body: queryArg.branchUpdate,
          }),
          invalidatesTags: ["Branch"],
        },
      ),
      getBranchHistory: build.query<
        GetBranchHistoryApiResponse,
        GetBranchHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/branches/${queryArg.id}/history`,
        }),
        providesTags: ["Branch"],
      }),
      listLegalEntities: build.query<
        ListLegalEntitiesApiResponse,
        ListLegalEntitiesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/legal-entities`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
          },
        }),
        providesTags: ["LegalEntity"],
      }),
      createLegalEntity: build.mutation<
        CreateLegalEntityApiResponse,
        CreateLegalEntityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/legal-entities`,
          method: "POST",
          body: queryArg.legalEntityCreate,
        }),
        invalidatesTags: ["LegalEntity"],
      }),
      getLegalEntity: build.query<
        GetLegalEntityApiResponse,
        GetLegalEntityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/legal-entities/${queryArg.id}`,
        }),
        providesTags: ["LegalEntity"],
      }),
      updateLegalEntity: build.mutation<
        UpdateLegalEntityApiResponse,
        UpdateLegalEntityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/legal-entities/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.legalEntityUpdate,
        }),
        invalidatesTags: ["LegalEntity"],
      }),
      getLegalEntityHistory: build.query<
        GetLegalEntityHistoryApiResponse,
        GetLegalEntityHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/legal-entities/${queryArg.id}/history`,
        }),
        providesTags: ["LegalEntity"],
      }),
      listAccountingEntities: build.query<
        ListAccountingEntitiesApiResponse,
        ListAccountingEntitiesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/accounting-entities`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            legalEntityId: queryArg.legalEntityId,
          },
        }),
        providesTags: ["AccountingEntity"],
      }),
      createAccountingEntity: build.mutation<
        CreateAccountingEntityApiResponse,
        CreateAccountingEntityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/accounting-entities`,
          method: "POST",
          body: queryArg.accountingEntityCreate,
        }),
        invalidatesTags: ["AccountingEntity"],
      }),
      getAccountingEntity: build.query<
        GetAccountingEntityApiResponse,
        GetAccountingEntityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/accounting-entities/${queryArg.id}`,
        }),
        providesTags: ["AccountingEntity"],
      }),
      updateAccountingEntity: build.mutation<
        UpdateAccountingEntityApiResponse,
        UpdateAccountingEntityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/accounting-entities/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.accountingEntityUpdate,
        }),
        invalidatesTags: ["AccountingEntity"],
      }),
      getAccountingEntityHistory: build.query<
        GetAccountingEntityHistoryApiResponse,
        GetAccountingEntityHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/accounting-entities/${queryArg.id}/history`,
        }),
        providesTags: ["AccountingEntity"],
      }),
      listRoles: build.query<ListRolesApiResponse, ListRolesApiArg>({
        query: (queryArg) => ({
          url: `/api/core/roles`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
          },
        }),
        providesTags: ["Role"],
      }),
      createRole: build.mutation<CreateRoleApiResponse, CreateRoleApiArg>({
        query: (queryArg) => ({
          url: `/api/core/roles`,
          method: "POST",
          body: queryArg.roleCreate,
        }),
        invalidatesTags: ["Role"],
      }),
      getRole: build.query<GetRoleApiResponse, GetRoleApiArg>({
        query: (queryArg) => ({ url: `/api/core/roles/${queryArg.id}` }),
        providesTags: ["Role"],
      }),
      updateRole: build.mutation<UpdateRoleApiResponse, UpdateRoleApiArg>({
        query: (queryArg) => ({
          url: `/api/core/roles/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.roleUpdate,
        }),
        invalidatesTags: ["Role"],
      }),
      deleteRole: build.mutation<DeleteRoleApiResponse, DeleteRoleApiArg>({
        query: (queryArg) => ({
          url: `/api/core/roles/${queryArg.id}`,
          method: "DELETE",
        }),
        invalidatesTags: ["Role"],
      }),
      getRoleHistory: build.query<
        GetRoleHistoryApiResponse,
        GetRoleHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/roles/${queryArg.id}/history`,
        }),
        providesTags: ["Role"],
      }),
      listMyActivity: build.query<
        ListMyActivityApiResponse,
        ListMyActivityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/activity/mine`,
          params: {
            category: queryArg.category,
            from: queryArg["from"],
            to: queryArg.to,
            page: queryArg.page,
            pageSize: queryArg.pageSize,
          },
        }),
        providesTags: ["Activity"],
      }),
      listTeamActivity: build.query<
        ListTeamActivityApiResponse,
        ListTeamActivityApiArg
      >({
        query: (queryArg) => ({
          url: `/api/core/activity/team`,
          params: {
            category: queryArg.category,
            from: queryArg["from"],
            to: queryArg.to,
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            actorId: queryArg.actorId,
            q: queryArg.q,
          },
        }),
        providesTags: ["Activity"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type ListUsersApiResponse = /** status 200 Success */ UserPage;
export type ListUsersApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  isActive?: "true" | "false";
  dealershipId?: number;
  roleId?: number;
  inactiveDays?: number;
};
export type CreateUserApiResponse = /** status 201 Success */ User;
export type CreateUserApiArg = {
  userCreate: UserCreate;
};
export type GetUserApiResponse = /** status 200 Success */ User;
export type GetUserApiArg = {
  id: number;
};
export type UpdateUserApiResponse = /** status 200 Success */ User;
export type UpdateUserApiArg = {
  id: number;
  userUpdate: UserUpdate;
};
export type AssignUserRoleApiResponse = /** status 201 Success */ User;
export type AssignUserRoleApiArg = {
  id: number;
  roleAssignmentInput: RoleAssignmentInput;
};
export type RevokeUserRoleApiResponse = /** status 200 Success */ User;
export type RevokeUserRoleApiArg = {
  id: number;
  assignmentId: number;
};
export type ListAssignableRolesApiResponse =
  /** status 200 Success */ AssignableRole[];
export type ListAssignableRolesApiArg = {
  dealershipId?: number;
};
export type GetRolePermissionsApiResponse =
  /** status 200 Success */ RolePermissions;
export type GetRolePermissionsApiArg = {
  id: number;
};
export type SetRolePermissionsApiResponse =
  /** status 200 Success */ RolePermissions;
export type SetRolePermissionsApiArg = {
  id: number;
  rolePermissionsUpdate: RolePermissionsUpdate;
};
export type ListPermissionsApiResponse = /** status 200 Success */ Permission[];
export type ListPermissionsApiArg = {
  module?: string;
};
export type ListAuditLogApiResponse = /** status 200 Success */ AuditEntryPage;
export type ListAuditLogApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  entityType?: string;
  entityId?: string;
  actorId?: number;
  dealershipId?: number;
  action?: string;
  from?: string;
  to?: string;
};
export type ListDealershipsApiResponse =
  /** status 200 Success */ DealershipPage;
export type ListDealershipsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  isActive?: "true" | "false";
  dealershipId?: number;
};
export type CreateDealershipApiResponse = /** status 201 Success */ Dealership;
export type CreateDealershipApiArg = {
  dealershipCreate: DealershipCreate;
};
export type GetDealershipApiResponse = /** status 200 Success */ Dealership;
export type GetDealershipApiArg = {
  id: number;
};
export type UpdateDealershipApiResponse = /** status 200 Success */ Dealership;
export type UpdateDealershipApiArg = {
  id: number;
  dealershipUpdate: DealershipUpdate;
};
export type GetDealershipHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetDealershipHistoryApiArg = {
  id: number;
};
export type ListBranchesApiResponse = /** status 200 Success */ BranchPage;
export type ListBranchesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId?: number;
  isActive?: "true" | "false";
};
export type CreateBranchApiResponse = /** status 201 Success */ Branch;
export type CreateBranchApiArg = {
  branchCreate: BranchCreate;
};
export type GetBranchApiResponse = /** status 200 Success */ Branch;
export type GetBranchApiArg = {
  id: number;
};
export type UpdateBranchApiResponse = /** status 200 Success */ Branch;
export type UpdateBranchApiArg = {
  id: number;
  branchUpdate: BranchUpdate;
};
export type GetBranchHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetBranchHistoryApiArg = {
  id: number;
};
export type ListLegalEntitiesApiResponse =
  /** status 200 Success */ LegalEntityPage;
export type ListLegalEntitiesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
};
export type CreateLegalEntityApiResponse =
  /** status 201 Success */ LegalEntity;
export type CreateLegalEntityApiArg = {
  legalEntityCreate: LegalEntityCreate;
};
export type GetLegalEntityApiResponse = /** status 200 Success */ LegalEntity;
export type GetLegalEntityApiArg = {
  id: number;
};
export type UpdateLegalEntityApiResponse =
  /** status 200 Success */ LegalEntity;
export type UpdateLegalEntityApiArg = {
  id: number;
  legalEntityUpdate: LegalEntityUpdate;
};
export type GetLegalEntityHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetLegalEntityHistoryApiArg = {
  id: number;
};
export type ListAccountingEntitiesApiResponse =
  /** status 200 Success */ AccountingEntityPage;
export type ListAccountingEntitiesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  legalEntityId?: number;
};
export type CreateAccountingEntityApiResponse =
  /** status 201 Success */ AccountingEntity;
export type CreateAccountingEntityApiArg = {
  accountingEntityCreate: AccountingEntityCreate;
};
export type GetAccountingEntityApiResponse =
  /** status 200 Success */ AccountingEntity;
export type GetAccountingEntityApiArg = {
  id: number;
};
export type UpdateAccountingEntityApiResponse =
  /** status 200 Success */ AccountingEntity;
export type UpdateAccountingEntityApiArg = {
  id: number;
  accountingEntityUpdate: AccountingEntityUpdate;
};
export type GetAccountingEntityHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetAccountingEntityHistoryApiArg = {
  id: number;
};
export type ListRolesApiResponse = /** status 200 Success */ RolePage;
export type ListRolesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
};
export type CreateRoleApiResponse = /** status 201 Success */ Role;
export type CreateRoleApiArg = {
  roleCreate: RoleCreate;
};
export type GetRoleApiResponse = /** status 200 Success */ Role;
export type GetRoleApiArg = {
  id: number;
};
export type UpdateRoleApiResponse = /** status 200 Success */ Role;
export type UpdateRoleApiArg = {
  id: number;
  roleUpdate: RoleUpdate;
};
export type DeleteRoleApiResponse = unknown;
export type DeleteRoleApiArg = {
  id: number;
};
export type GetRoleHistoryApiResponse = /** status 200 Success */ EntityHistory;
export type GetRoleHistoryApiArg = {
  id: number;
};
export type ListMyActivityApiResponse = /** status 200 Success */ ActivityPage;
export type ListMyActivityApiArg = {
  category?:
    | "sign_in"
    | "leads"
    | "documents"
    | "orders"
    | "deliveries"
    | "stock"
    | "users";
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};
export type ListTeamActivityApiResponse =
  /** status 200 Success */ ActivityPage;
export type ListTeamActivityApiArg = {
  category?:
    | "sign_in"
    | "leads"
    | "documents"
    | "orders"
    | "deliveries"
    | "stock"
    | "users";
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  actorId?: number;
  q?: string;
};
export type UserRoleAssignment = {
  id: number;
  roleId: number;
  roleName: string;
  dealershipId: number | null;
  dealershipName: string | null;
  branchId: number | null;
  branchName: string | null;
};
export type User = {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  employeeCode: string | null;
  cnic: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: UserRoleAssignment[];
};
export type UserPage = {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
};
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: any | null;
  };
};
export type RoleAssignmentInput = {
  roleId: number;
  dealershipId?: number | null;
  branchId?: number | null;
};
export type UserCreate = {
  email: string;
  fullName: string;
  phone: string;
  employeeCode?: string | null;
  cnic?: string | null;
  password: string;
  roles?: RoleAssignmentInput[];
};
export type UserUpdate = {
  email?: string;
  fullName?: string;
  phone?: string;
  employeeCode?: string | null;
  cnic?: string | null;
  isActive?: boolean;
  password?: string;
};
export type AssignableRole = {
  id: number;
  name: string;
  description: string | null;
};
export type RolePermissions = {
  roleId: number;
  permissionCodes: string[];
};
export type RolePermissionsUpdate = {
  permissionCodes: string[];
};
export type Permission = {
  id: number;
  code: string;
  module: string;
  description: string;
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
export type AuditEntryPage = {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
};
export type Dealership = {
  id: number;
  code: string;
  name: string;
  brand: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type DealershipPage = {
  items: Dealership[];
  total: number;
  page: number;
  pageSize: number;
};
export type DealershipCreate = {
  code: string;
  name: string;
  brand: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  legalEntityId?: number | null;
  accountingEntityId?: number | null;
  isActive?: boolean;
};
export type DealershipUpdate = {
  name?: string;
  brand?: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  legalEntityId?: number | null;
  accountingEntityId?: number | null;
  isActive?: boolean;
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
export type Branch = {
  id: number;
  dealershipId: number;
  dealershipName?: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type BranchPage = {
  items: Branch[];
  total: number;
  page: number;
  pageSize: number;
};
export type BranchCreate = {
  dealershipId: number;
  code: string;
  name: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  isActive?: boolean;
};
export type BranchUpdate = {
  name?: string;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  isActive?: boolean;
};
export type LegalEntity = {
  id: number;
  name: string;
  registrationNo: string | null;
  taxNo: string | null;
  createdAt: string;
  updatedAt: string;
};
export type LegalEntityPage = {
  items: LegalEntity[];
  total: number;
  page: number;
  pageSize: number;
};
export type LegalEntityCreate = {
  name: string;
  registrationNo?: string | null;
  taxNo?: string | null;
};
export type LegalEntityUpdate = {
  name?: string;
  registrationNo?: string | null;
  taxNo?: string | null;
};
export type AccountingEntity = {
  id: number;
  name: string;
  legalEntityId: number | null;
  baseCurrency: string;
  createdAt: string;
  updatedAt: string;
};
export type AccountingEntityPage = {
  items: AccountingEntity[];
  total: number;
  page: number;
  pageSize: number;
};
export type AccountingEntityCreate = {
  name: string;
  legalEntityId?: number | null;
  baseCurrency?: string;
};
export type AccountingEntityUpdate = {
  name?: string;
  legalEntityId?: number | null;
  baseCurrency?: string;
};
export type Role = {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};
export type RolePage = {
  items: Role[];
  total: number;
  page: number;
  pageSize: number;
};
export type RoleCreate = {
  name: string;
  description?: string | null;
};
export type RoleUpdate = {
  name?: string;
  description?: string | null;
};
export type ActivityEntry = {
  id: number;
  occurredAt: string;
  actorId: number | null;
  actorName: string | null;
  dealershipId: number | null;
  dealershipName: string | null;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: string;
  changes?: any | null;
  ip: string | null;
};
export type ActivityPage = {
  items: ActivityEntry[];
  total: number;
  page: number;
  pageSize: number;
};
export const {
  useListUsersQuery,
  useLazyListUsersQuery,
  useCreateUserMutation,
  useGetUserQuery,
  useLazyGetUserQuery,
  useUpdateUserMutation,
  useAssignUserRoleMutation,
  useRevokeUserRoleMutation,
  useListAssignableRolesQuery,
  useLazyListAssignableRolesQuery,
  useGetRolePermissionsQuery,
  useLazyGetRolePermissionsQuery,
  useSetRolePermissionsMutation,
  useListPermissionsQuery,
  useLazyListPermissionsQuery,
  useListAuditLogQuery,
  useLazyListAuditLogQuery,
  useListDealershipsQuery,
  useLazyListDealershipsQuery,
  useCreateDealershipMutation,
  useGetDealershipQuery,
  useLazyGetDealershipQuery,
  useUpdateDealershipMutation,
  useGetDealershipHistoryQuery,
  useLazyGetDealershipHistoryQuery,
  useListBranchesQuery,
  useLazyListBranchesQuery,
  useCreateBranchMutation,
  useGetBranchQuery,
  useLazyGetBranchQuery,
  useUpdateBranchMutation,
  useGetBranchHistoryQuery,
  useLazyGetBranchHistoryQuery,
  useListLegalEntitiesQuery,
  useLazyListLegalEntitiesQuery,
  useCreateLegalEntityMutation,
  useGetLegalEntityQuery,
  useLazyGetLegalEntityQuery,
  useUpdateLegalEntityMutation,
  useGetLegalEntityHistoryQuery,
  useLazyGetLegalEntityHistoryQuery,
  useListAccountingEntitiesQuery,
  useLazyListAccountingEntitiesQuery,
  useCreateAccountingEntityMutation,
  useGetAccountingEntityQuery,
  useLazyGetAccountingEntityQuery,
  useUpdateAccountingEntityMutation,
  useGetAccountingEntityHistoryQuery,
  useLazyGetAccountingEntityHistoryQuery,
  useListRolesQuery,
  useLazyListRolesQuery,
  useCreateRoleMutation,
  useGetRoleQuery,
  useLazyGetRoleQuery,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useGetRoleHistoryQuery,
  useLazyGetRoleHistoryQuery,
  useListMyActivityQuery,
  useLazyListMyActivityQuery,
  useListTeamActivityQuery,
  useLazyListTeamActivityQuery,
} = injectedRtkApi;
