import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = [
  "Vehicle",
  "Customer",
  "Search",
  "VehicleModel",
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      createVehicle: build.mutation<
        CreateVehicleApiResponse,
        CreateVehicleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicles`,
          method: "POST",
          body: queryArg.vehicleCreate,
        }),
        invalidatesTags: ["Vehicle"],
      }),
      listVehicles: build.query<ListVehiclesApiResponse, ListVehiclesApiArg>({
        query: (queryArg) => ({
          url: `/api/master/vehicles`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            modelId: queryArg.modelId,
            status: queryArg.status,
          },
        }),
        providesTags: ["Vehicle"],
      }),
      linkVehicle: build.mutation<LinkVehicleApiResponse, LinkVehicleApiArg>({
        query: (queryArg) => ({
          url: `/api/master/vehicles/link`,
          method: "POST",
          body: queryArg.vehicleLinkRequest,
        }),
        invalidatesTags: ["Vehicle"],
      }),
      listVehicleOwnerships: build.query<
        ListVehicleOwnershipsApiResponse,
        ListVehicleOwnershipsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicles/${queryArg.id}/ownerships`,
        }),
        providesTags: ["Vehicle"],
      }),
      recordVehicleOwnership: build.mutation<
        RecordVehicleOwnershipApiResponse,
        RecordVehicleOwnershipApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicles/${queryArg.id}/ownerships`,
          method: "POST",
          body: queryArg.ownershipCreate,
        }),
        invalidatesTags: ["Vehicle"],
      }),
      listCustomerVehicles: build.query<
        ListCustomerVehiclesApiResponse,
        ListCustomerVehiclesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/customers/${queryArg.id}/vehicles`,
        }),
        providesTags: ["Customer"],
      }),
      unifiedSearch: build.query<UnifiedSearchApiResponse, UnifiedSearchApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/master/search`,
            params: {
              q: queryArg.q,
            },
          }),
          providesTags: ["Search"],
        },
      ),
      createDealershipModel: build.mutation<
        CreateDealershipModelApiResponse,
        CreateDealershipModelApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicle-models/for-dealership`,
          method: "POST",
          body: queryArg.dealershipModelCreate,
        }),
        invalidatesTags: ["VehicleModel"],
      }),
      updateDealershipModel: build.mutation<
        UpdateDealershipModelApiResponse,
        UpdateDealershipModelApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicle-models/${queryArg.id}/for-dealership`,
          method: "PATCH",
          body: queryArg.dealershipModelUpdate,
        }),
        invalidatesTags: ["VehicleModel"],
      }),
      listVehicleModels: build.query<
        ListVehicleModelsApiResponse,
        ListVehicleModelsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicle-models`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            brand: queryArg.brand,
            isActive: queryArg.isActive,
          },
        }),
        providesTags: ["VehicleModel"],
      }),
      createVehicleModel: build.mutation<
        CreateVehicleModelApiResponse,
        CreateVehicleModelApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicle-models`,
          method: "POST",
          body: queryArg.vehicleModelCreate,
        }),
        invalidatesTags: ["VehicleModel"],
      }),
      getVehicleModel: build.query<
        GetVehicleModelApiResponse,
        GetVehicleModelApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicle-models/${queryArg.id}`,
        }),
        providesTags: ["VehicleModel"],
      }),
      updateVehicleModel: build.mutation<
        UpdateVehicleModelApiResponse,
        UpdateVehicleModelApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicle-models/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.vehicleModelUpdate,
        }),
        invalidatesTags: ["VehicleModel"],
      }),
      getVehicleModelHistory: build.query<
        GetVehicleModelHistoryApiResponse,
        GetVehicleModelHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicle-models/${queryArg.id}/history`,
        }),
        providesTags: ["VehicleModel"],
      }),
      listCustomers: build.query<ListCustomersApiResponse, ListCustomersApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/master/customers`,
            params: {
              page: queryArg.page,
              pageSize: queryArg.pageSize,
              sort: queryArg.sort,
              q: queryArg.q,
              dealershipId: queryArg.dealershipId,
              kind: queryArg.kind,
              isActive: queryArg.isActive,
            },
          }),
          providesTags: ["Customer"],
        },
      ),
      createCustomer: build.mutation<
        CreateCustomerApiResponse,
        CreateCustomerApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/customers`,
          method: "POST",
          body: queryArg.customerCreate,
        }),
        invalidatesTags: ["Customer"],
      }),
      getCustomer: build.query<GetCustomerApiResponse, GetCustomerApiArg>({
        query: (queryArg) => ({ url: `/api/master/customers/${queryArg.id}` }),
        providesTags: ["Customer"],
      }),
      updateCustomer: build.mutation<
        UpdateCustomerApiResponse,
        UpdateCustomerApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/customers/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.customerUpdate,
        }),
        invalidatesTags: ["Customer"],
      }),
      getCustomerHistory: build.query<
        GetCustomerHistoryApiResponse,
        GetCustomerHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/customers/${queryArg.id}/history`,
        }),
        providesTags: ["Customer"],
      }),
      getVehicle: build.query<GetVehicleApiResponse, GetVehicleApiArg>({
        query: (queryArg) => ({ url: `/api/master/vehicles/${queryArg.id}` }),
        providesTags: ["Vehicle"],
      }),
      updateVehicle: build.mutation<
        UpdateVehicleApiResponse,
        UpdateVehicleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicles/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.vehicleUpdate,
        }),
        invalidatesTags: ["Vehicle"],
      }),
      getVehicleHistory: build.query<
        GetVehicleHistoryApiResponse,
        GetVehicleHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/master/vehicles/${queryArg.id}/history`,
        }),
        providesTags: ["Vehicle"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type CreateVehicleApiResponse = /** status 201 Success */ {
  id: number;
  vin: string | null;
  engineNo: string | null;
  registrationNo: string | null;
  modelId: number;
  modelName?: string;
  variant: string | null;
  modelYear: number | null;
  color: string | null;
  notes: string | null;
  status:
    | "available"
    | "reserved"
    | "booked"
    | "in_transit"
    | "received"
    | "ready_for_delivery"
    | "delivered"
    | "transferred"
    | "hold";
  activatedOn: string | null;
  warrantyEndsOn: string | null;
  activationOdometerKm: number | null;
  soldByDealershipId: number | null;
  serviceVisitCount: number;
  lastServiceOn: string | null;
  lastOdometerKm: number | null;
  currentOwner?: {
    customerId: number;
    fullName: string;
    mobile: string;
    dealershipId: number;
    since: string;
  } | null;
  dealerships?: {
    id: number;
    name: string;
  }[];
  createdAt: string;
  updatedAt: string;
};
export type CreateVehicleApiArg = {
  vehicleCreate: VehicleCreate;
};
export type ListVehiclesApiResponse = /** status 200 Success */ VehiclePage;
export type ListVehiclesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  modelId?: number;
  status?:
    | "available"
    | "reserved"
    | "booked"
    | "in_transit"
    | "received"
    | "ready_for_delivery"
    | "delivered"
    | "transferred"
    | "hold";
};
export type LinkVehicleApiResponse = /** status 200 Success */ {
  id: number;
  vin: string | null;
  engineNo: string | null;
  registrationNo: string | null;
  modelId: number;
  modelName?: string;
  variant: string | null;
  modelYear: number | null;
  color: string | null;
  notes: string | null;
  status:
    | "available"
    | "reserved"
    | "booked"
    | "in_transit"
    | "received"
    | "ready_for_delivery"
    | "delivered"
    | "transferred"
    | "hold";
  activatedOn: string | null;
  warrantyEndsOn: string | null;
  activationOdometerKm: number | null;
  soldByDealershipId: number | null;
  serviceVisitCount: number;
  lastServiceOn: string | null;
  lastOdometerKm: number | null;
  currentOwner?: {
    customerId: number;
    fullName: string;
    mobile: string;
    dealershipId: number;
    since: string;
  } | null;
  dealerships?: {
    id: number;
    name: string;
  }[];
  createdAt: string;
  updatedAt: string;
};
export type LinkVehicleApiArg = {
  vehicleLinkRequest: VehicleLinkRequest;
};
export type ListVehicleOwnershipsApiResponse =
  /** status 200 Success */ VehicleOwnership[];
export type ListVehicleOwnershipsApiArg = {
  id: number;
};
export type RecordVehicleOwnershipApiResponse =
  /** status 201 Success */ VehicleOwnership[];
export type RecordVehicleOwnershipApiArg = {
  id: number;
  ownershipCreate: OwnershipCreate;
};
export type ListCustomerVehiclesApiResponse =
  /** status 200 Success */ CustomerVehicle[];
export type ListCustomerVehiclesApiArg = {
  id: number;
};
export type UnifiedSearchApiResponse = /** status 200 Success */ SearchResult;
export type UnifiedSearchApiArg = {
  q: string;
};
export type CreateDealershipModelApiResponse = /** status 201 Success */ {
  id: number;
  brand: string;
  name: string;
  bodyType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type CreateDealershipModelApiArg = {
  dealershipModelCreate: DealershipModelCreate;
};
export type UpdateDealershipModelApiResponse = /** status 200 Success */ {
  id: number;
  brand: string;
  name: string;
  bodyType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type UpdateDealershipModelApiArg = {
  id: number;
  dealershipModelUpdate: DealershipModelUpdate;
};
export type ListVehicleModelsApiResponse =
  /** status 200 Success */ VehicleModelPage;
export type ListVehicleModelsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  brand?: string;
  isActive?: "true" | "false";
};
export type CreateVehicleModelApiResponse =
  /** status 201 Success */ VehicleModel;
export type CreateVehicleModelApiArg = {
  vehicleModelCreate: VehicleModelCreate;
};
export type GetVehicleModelApiResponse = /** status 200 Success */ VehicleModel;
export type GetVehicleModelApiArg = {
  id: number;
};
export type UpdateVehicleModelApiResponse =
  /** status 200 Success */ VehicleModel;
export type UpdateVehicleModelApiArg = {
  id: number;
  vehicleModelUpdate: VehicleModelUpdate;
};
export type GetVehicleModelHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetVehicleModelHistoryApiArg = {
  id: number;
};
export type ListCustomersApiResponse = /** status 200 Success */ CustomerPage;
export type ListCustomersApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId?: number;
  kind?: "individual" | "company";
  isActive?: "true" | "false";
};
export type CreateCustomerApiResponse = /** status 201 Success */ Customer;
export type CreateCustomerApiArg = {
  customerCreate: CustomerCreate;
};
export type GetCustomerApiResponse = /** status 200 Success */ Customer;
export type GetCustomerApiArg = {
  id: number;
};
export type UpdateCustomerApiResponse = /** status 200 Success */ Customer;
export type UpdateCustomerApiArg = {
  id: number;
  customerUpdate: CustomerUpdate;
};
export type GetCustomerHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetCustomerHistoryApiArg = {
  id: number;
};
export type GetVehicleApiResponse = /** status 200 Success */ Vehicle;
export type GetVehicleApiArg = {
  id: number;
};
export type UpdateVehicleApiResponse = /** status 200 Success */ Vehicle;
export type UpdateVehicleApiArg = {
  id: number;
  vehicleUpdate: VehicleUpdate;
};
export type GetVehicleHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetVehicleHistoryApiArg = {
  id: number;
};
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: any | null;
  };
};
export type VehicleCreate = {
  dealershipId: number;
  vin: string;
  engineNo?: string | null;
  registrationNo?: string | null;
  modelId: number;
  variant?: string | null;
  modelYear?: number | null;
  color?: string | null;
  notes?: string | null;
  ownerCustomerId?: number | null;
};
export type Vehicle = {
  id: number;
  vin: string | null;
  engineNo: string | null;
  registrationNo: string | null;
  modelId: number;
  modelName?: string;
  variant: string | null;
  modelYear: number | null;
  color: string | null;
  notes: string | null;
  status:
    | "available"
    | "reserved"
    | "booked"
    | "in_transit"
    | "received"
    | "ready_for_delivery"
    | "delivered"
    | "transferred"
    | "hold";
  activatedOn: string | null;
  warrantyEndsOn: string | null;
  activationOdometerKm: number | null;
  soldByDealershipId: number | null;
  serviceVisitCount: number;
  lastServiceOn: string | null;
  lastOdometerKm: number | null;
  currentOwner?: {
    customerId: number;
    fullName: string;
    mobile: string;
    dealershipId: number;
    since: string;
  } | null;
  dealerships?: {
    id: number;
    name: string;
  }[];
  createdAt: string;
  updatedAt: string;
};
export type VehiclePage = {
  items: Vehicle[];
  total: number;
  page: number;
  pageSize: number;
};
export type VehicleLinkRequest = {
  dealershipId: number;
  identifier: string;
};
export type VehicleOwnership = {
  id: number;
  dealershipId: number;
  vehicleId: number;
  customerId: number;
  customerName: string;
  customerMobile: string;
  startDate: string;
  endDate: string | null;
};
export type OwnershipCreate = {
  customerId: number;
  startDate?: string;
};
export type CustomerVehicle = {
  vehicleId: number;
  vin: string | null;
  registrationNo: string | null;
  modelName: string;
  startDate: string;
  endDate: string | null;
};
export type SearchResult = {
  vehicles: {
    id: number;
    vin: string | null;
    registrationNo: string | null;
    engineNo: string | null;
    modelName: string;
    modelYear: number | null;
    exact: boolean;
    currentOwner: {
      customerId: number;
      fullName: string;
      mobile: string;
      dealershipId: number;
      since: string;
    } | null;
  }[];
  customers: {
    id: number;
    fullName: string;
    mobile: string;
    cnic: string | null;
    dealershipId: number;
    dealershipName: string;
    exact: boolean;
  }[];
  groupMatches: {
    vin: string | null;
    registrationNo: string | null;
    modelName: string;
    matchedOn: "vin" | "engineNo" | "registrationNo";
  }[];
};
export type DealershipModelCreate = {
  dealershipId: number;
  name: string;
};
export type DealershipModelUpdate = {
  dealershipId: number;
  name?: string;
  isActive?: boolean;
};
export type VehicleModel = {
  id: number;
  brand: string;
  name: string;
  bodyType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type VehicleModelPage = {
  items: VehicleModel[];
  total: number;
  page: number;
  pageSize: number;
};
export type VehicleModelCreate = {
  brand: string;
  name: string;
  bodyType?: string | null;
  isActive?: boolean;
};
export type VehicleModelUpdate = {
  brand?: string;
  name?: string;
  bodyType?: string | null;
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
export type Customer = {
  id: number;
  dealershipId: number;
  dealershipName?: string;
  kind: "individual" | "company";
  fullName: string;
  mobile: string;
  mobileNormalized: string;
  altPhone: string | null;
  email: string | null;
  cnic: string | null;
  ntn: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type CustomerPage = {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
};
export type CustomerCreate = {
  dealershipId: number;
  kind?: "individual" | "company";
  fullName: string;
  mobile: string;
  altPhone?: string | null;
  email?: (string | null) | "" | (any | null);
  cnic?: string | null;
  ntn?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
};
export type CustomerUpdate = {
  kind?: "individual" | "company";
  fullName?: string;
  mobile?: string;
  altPhone?: string | null;
  email?: (string | null) | "" | (any | null);
  cnic?: string | null;
  ntn?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  isActive?: boolean;
};
export type VehicleUpdate = {
  vin?: string;
  engineNo?: string | null;
  registrationNo?: string | null;
  modelId?: number;
  variant?: string | null;
  modelYear?: number | null;
  color?: string | null;
  notes?: string | null;
};
export const {
  useCreateVehicleMutation,
  useListVehiclesQuery,
  useLazyListVehiclesQuery,
  useLinkVehicleMutation,
  useListVehicleOwnershipsQuery,
  useLazyListVehicleOwnershipsQuery,
  useRecordVehicleOwnershipMutation,
  useListCustomerVehiclesQuery,
  useLazyListCustomerVehiclesQuery,
  useUnifiedSearchQuery,
  useLazyUnifiedSearchQuery,
  useCreateDealershipModelMutation,
  useUpdateDealershipModelMutation,
  useListVehicleModelsQuery,
  useLazyListVehicleModelsQuery,
  useCreateVehicleModelMutation,
  useGetVehicleModelQuery,
  useLazyGetVehicleModelQuery,
  useUpdateVehicleModelMutation,
  useGetVehicleModelHistoryQuery,
  useLazyGetVehicleModelHistoryQuery,
  useListCustomersQuery,
  useLazyListCustomersQuery,
  useCreateCustomerMutation,
  useGetCustomerQuery,
  useLazyGetCustomerQuery,
  useUpdateCustomerMutation,
  useGetCustomerHistoryQuery,
  useLazyGetCustomerHistoryQuery,
  useGetVehicleQuery,
  useLazyGetVehicleQuery,
  useUpdateVehicleMutation,
  useGetVehicleHistoryQuery,
  useLazyGetVehicleHistoryQuery,
} = injectedRtkApi;
