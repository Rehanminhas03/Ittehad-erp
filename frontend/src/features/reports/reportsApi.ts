import { enhancedApi } from './reportsApi.generated';

/**
 * Dashboard endpoints, generated from OpenAPI. Figures are aggregated by other modules' activity,
 * so they are refetched after a short while rather than invalidated by specific mutations.
 */
export const reportsApi = enhancedApi.enhanceEndpoints({
  endpoints: {
    getDashboard: { keepUnusedDataFor: 30 },
  },
});

export * from './reportsApi.generated';
