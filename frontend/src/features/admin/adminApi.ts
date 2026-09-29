import { enhancedApi as adminApiGenerated } from './adminApi.generated';

/**
 * Admin (core module) endpoints: generated from OpenAPI, plus cache relationships the schema
 * cannot express. Each entity's queries provide its tag; its mutations invalidate it.
 */
export const adminApi = adminApiGenerated.enhanceEndpoints({
  endpoints: {
    // Branch rows show their dealership's name.
    updateDealership: { invalidatesTags: ['Dealership', 'Branch'] },
    // Assignments show role names.
    updateRole: { invalidatesTags: ['Role', 'User'] },
    deleteRole: { invalidatesTags: ['Role', 'User'] },
  },
});

export * from './adminApi.generated';
