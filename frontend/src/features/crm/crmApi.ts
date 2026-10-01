import { enhancedApi } from './crmApi.generated';

/**
 * Master-data endpoints (customers, vehicles, ownership, search): generated from OpenAPI, plus
 * cache relationships between them. Search results and owner names depend on all of them.
 */
export const crmApi = enhancedApi.enhanceEndpoints({
  endpoints: {
    unifiedSearch: { keepUnusedDataFor: 30 },
    createCustomer: { invalidatesTags: ['Customer', 'Search'] },
    updateCustomer: { invalidatesTags: ['Customer', 'Vehicle', 'Search'] },
    createVehicle: { invalidatesTags: ['Vehicle', 'Customer', 'Search'] },
    updateVehicle: { invalidatesTags: ['Vehicle', 'Customer', 'Search'] },
    linkVehicle: { invalidatesTags: ['Vehicle', 'Search'] },
    recordVehicleOwnership: { invalidatesTags: ['Vehicle', 'Customer', 'Search'] },
    updateVehicleModel: { invalidatesTags: ['VehicleModel', 'Vehicle'] },
    createDealershipModel: { invalidatesTags: ['VehicleModel'] },
    updateDealershipModel: { invalidatesTags: ['VehicleModel', 'Vehicle'] },
  },
});

export * from './crmApi.generated';
