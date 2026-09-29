import { enhancedApi } from './serviceApi.generated';

/**
 * Service endpoints: generated from OpenAPI, plus the cross-entity effects of workshop actions
 * (a job card moves its visit; an approved estimate adds job card lines; hand-back advances the
 * vehicle's schedule).
 */
export const serviceApi = enhancedApi
  .enhanceEndpoints({ addTagTypes: ['Vehicle', 'Search'] })
  .enhanceEndpoints({
    endpoints: {
      createVisit: { invalidatesTags: ['Visit', 'Vehicle', 'VehicleSchedule'] },
      transitionVisit: { invalidatesTags: ['Visit', 'JobCard', 'Vehicle', 'VehicleSchedule'] },
      openJobCard: { invalidatesTags: ['JobCard', 'Visit'] },
      transitionJobCard: { invalidatesTags: ['JobCard', 'Visit'] },
      transitionEstimate: { invalidatesTags: ['Estimate', 'JobCard'] },
      createEstimate: { invalidatesTags: ['Estimate', 'JobCard'] },
      previewCheckIn: { keepUnusedDataFor: 0 },
    },
  });

export * from './serviceApi.generated';
