import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = [
  "Visit",
  "VehicleSchedule",
  "JobCard",
  "ScheduleItem",
  "InspectionTemplateItem",
  "Estimate",
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      previewCheckIn: build.query<
        PreviewCheckInApiResponse,
        PreviewCheckInApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/visits/check-in-preview`,
          params: {
            vehicleId: queryArg.vehicleId,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["Visit"],
      }),
      openJobCard: build.mutation<OpenJobCardApiResponse, OpenJobCardApiArg>({
        query: (queryArg) => ({
          url: `/api/service/visits/${queryArg.id}/job-card`,
          method: "POST",
        }),
        invalidatesTags: ["Visit"],
      }),
      getVehicleServiceSchedule: build.query<
        GetVehicleServiceScheduleApiResponse,
        GetVehicleServiceScheduleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/vehicles/${queryArg.id}/schedule`,
        }),
        providesTags: ["VehicleSchedule"],
      }),
      listJobCardTechnicians: build.query<
        ListJobCardTechniciansApiResponse,
        ListJobCardTechniciansApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/technicians`,
        }),
        providesTags: ["JobCard"],
      }),
      setJobCardLineDone: build.mutation<
        SetJobCardLineDoneApiResponse,
        SetJobCardLineDoneApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/lines/${queryArg.lineId}/done`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["JobCard"],
      }),
      getJobCardInspection: build.query<
        GetJobCardInspectionApiResponse,
        GetJobCardInspectionApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/inspection`,
        }),
        providesTags: ["JobCard"],
      }),
      startInspection: build.mutation<
        StartInspectionApiResponse,
        StartInspectionApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/inspection`,
          method: "POST",
        }),
        invalidatesTags: ["JobCard"],
      }),
      recordInspection: build.mutation<
        RecordInspectionApiResponse,
        RecordInspectionApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/inspection/items`,
          method: "PUT",
          body: queryArg.inspectionItemsUpdate,
        }),
        invalidatesTags: ["JobCard"],
      }),
      completeInspection: build.mutation<
        CompleteInspectionApiResponse,
        CompleteInspectionApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/inspection/complete`,
          method: "POST",
        }),
        invalidatesTags: ["JobCard"],
      }),
      createEstimate: build.mutation<
        CreateEstimateApiResponse,
        CreateEstimateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/estimates`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["JobCard"],
      }),
      listScheduleItems: build.query<
        ListScheduleItemsApiResponse,
        ListScheduleItemsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/schedule-items`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            modelId: queryArg.modelId,
            isActive: queryArg.isActive,
          },
        }),
        providesTags: ["ScheduleItem"],
      }),
      createScheduleItem: build.mutation<
        CreateScheduleItemApiResponse,
        CreateScheduleItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/schedule-items`,
          method: "POST",
          body: queryArg.scheduleItemCreate,
        }),
        invalidatesTags: ["ScheduleItem"],
      }),
      getScheduleItem: build.query<
        GetScheduleItemApiResponse,
        GetScheduleItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/schedule-items/${queryArg.id}`,
        }),
        providesTags: ["ScheduleItem"],
      }),
      updateScheduleItem: build.mutation<
        UpdateScheduleItemApiResponse,
        UpdateScheduleItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/schedule-items/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.scheduleItemUpdate,
        }),
        invalidatesTags: ["ScheduleItem"],
      }),
      deleteScheduleItem: build.mutation<
        DeleteScheduleItemApiResponse,
        DeleteScheduleItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/schedule-items/${queryArg.id}`,
          method: "DELETE",
        }),
        invalidatesTags: ["ScheduleItem"],
      }),
      getScheduleItemHistory: build.query<
        GetScheduleItemHistoryApiResponse,
        GetScheduleItemHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/schedule-items/${queryArg.id}/history`,
        }),
        providesTags: ["ScheduleItem"],
      }),
      listInspectionTemplateItems: build.query<
        ListInspectionTemplateItemsApiResponse,
        ListInspectionTemplateItemsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/inspection-template`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            isActive: queryArg.isActive,
          },
        }),
        providesTags: ["InspectionTemplateItem"],
      }),
      createInspectionTemplateItem: build.mutation<
        CreateInspectionTemplateItemApiResponse,
        CreateInspectionTemplateItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/inspection-template`,
          method: "POST",
          body: queryArg.inspectionTemplateItemCreate,
        }),
        invalidatesTags: ["InspectionTemplateItem"],
      }),
      getInspectionTemplateItem: build.query<
        GetInspectionTemplateItemApiResponse,
        GetInspectionTemplateItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/inspection-template/${queryArg.id}`,
        }),
        providesTags: ["InspectionTemplateItem"],
      }),
      updateInspectionTemplateItem: build.mutation<
        UpdateInspectionTemplateItemApiResponse,
        UpdateInspectionTemplateItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/inspection-template/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.inspectionTemplateItemUpdate,
        }),
        invalidatesTags: ["InspectionTemplateItem"],
      }),
      deleteInspectionTemplateItem: build.mutation<
        DeleteInspectionTemplateItemApiResponse,
        DeleteInspectionTemplateItemApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/inspection-template/${queryArg.id}`,
          method: "DELETE",
        }),
        invalidatesTags: ["InspectionTemplateItem"],
      }),
      getInspectionTemplateItemHistory: build.query<
        GetInspectionTemplateItemHistoryApiResponse,
        GetInspectionTemplateItemHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/inspection-template/${queryArg.id}/history`,
        }),
        providesTags: ["InspectionTemplateItem"],
      }),
      listVisits: build.query<ListVisitsApiResponse, ListVisitsApiArg>({
        query: (queryArg) => ({
          url: `/api/service/visits`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            visitType: queryArg.visitType,
            vehicleId: queryArg.vehicleId,
            customerId: queryArg.customerId,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["Visit"],
      }),
      createVisit: build.mutation<CreateVisitApiResponse, CreateVisitApiArg>({
        query: (queryArg) => ({
          url: `/api/service/visits`,
          method: "POST",
          body: queryArg.visitCreate,
        }),
        invalidatesTags: ["Visit"],
      }),
      getVisitWorkflow: build.query<
        GetVisitWorkflowApiResponse,
        GetVisitWorkflowApiArg
      >({
        query: () => ({ url: `/api/service/visits/workflow` }),
        providesTags: ["Visit"],
      }),
      getVisit: build.query<GetVisitApiResponse, GetVisitApiArg>({
        query: (queryArg) => ({ url: `/api/service/visits/${queryArg.id}` }),
        providesTags: ["Visit"],
      }),
      updateVisit: build.mutation<UpdateVisitApiResponse, UpdateVisitApiArg>({
        query: (queryArg) => ({
          url: `/api/service/visits/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.visitUpdate,
        }),
        invalidatesTags: ["Visit"],
      }),
      getVisitHistory: build.query<
        GetVisitHistoryApiResponse,
        GetVisitHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/visits/${queryArg.id}/history`,
        }),
        providesTags: ["Visit"],
      }),
      transitionVisit: build.mutation<
        TransitionVisitApiResponse,
        TransitionVisitApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/visits/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["Visit"],
      }),
      listJobCardLines: build.query<
        ListJobCardLinesApiResponse,
        ListJobCardLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/lines`,
        }),
        providesTags: ["JobCard"],
      }),
      addJobCardLine: build.mutation<
        AddJobCardLineApiResponse,
        AddJobCardLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/lines`,
          method: "POST",
          body: queryArg.jobCardLineCreate,
        }),
        invalidatesTags: ["JobCard"],
      }),
      updateJobCardLine: build.mutation<
        UpdateJobCardLineApiResponse,
        UpdateJobCardLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "PATCH",
          body: queryArg.jobCardLineUpdate,
        }),
        invalidatesTags: ["JobCard"],
      }),
      removeJobCardLine: build.mutation<
        RemoveJobCardLineApiResponse,
        RemoveJobCardLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["JobCard"],
      }),
      listJobCards: build.query<ListJobCardsApiResponse, ListJobCardsApiArg>({
        query: (queryArg) => ({
          url: `/api/service/job-cards`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            technicianId: queryArg.technicianId,
            vehicleId: queryArg.vehicleId,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["JobCard"],
      }),
      getJobCardWorkflow: build.query<
        GetJobCardWorkflowApiResponse,
        GetJobCardWorkflowApiArg
      >({
        query: () => ({ url: `/api/service/job-cards/workflow` }),
        providesTags: ["JobCard"],
      }),
      getJobCard: build.query<GetJobCardApiResponse, GetJobCardApiArg>({
        query: (queryArg) => ({ url: `/api/service/job-cards/${queryArg.id}` }),
        providesTags: ["JobCard"],
      }),
      updateJobCard: build.mutation<
        UpdateJobCardApiResponse,
        UpdateJobCardApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.jobCardUpdate,
        }),
        invalidatesTags: ["JobCard"],
      }),
      getJobCardHistory: build.query<
        GetJobCardHistoryApiResponse,
        GetJobCardHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/history`,
        }),
        providesTags: ["JobCard"],
      }),
      transitionJobCard: build.mutation<
        TransitionJobCardApiResponse,
        TransitionJobCardApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/job-cards/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["JobCard"],
      }),
      listEstimateLines: build.query<
        ListEstimateLinesApiResponse,
        ListEstimateLinesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/estimates/${queryArg.id}/lines`,
        }),
        providesTags: ["Estimate"],
      }),
      addEstimateLine: build.mutation<
        AddEstimateLineApiResponse,
        AddEstimateLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/estimates/${queryArg.id}/lines`,
          method: "POST",
          body: queryArg.estimateLineCreate,
        }),
        invalidatesTags: ["Estimate"],
      }),
      updateEstimateLine: build.mutation<
        UpdateEstimateLineApiResponse,
        UpdateEstimateLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/estimates/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "PATCH",
          body: queryArg.estimateLineUpdate,
        }),
        invalidatesTags: ["Estimate"],
      }),
      removeEstimateLine: build.mutation<
        RemoveEstimateLineApiResponse,
        RemoveEstimateLineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/estimates/${queryArg.id}/lines/${queryArg.lineId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["Estimate"],
      }),
      listEstimates: build.query<ListEstimatesApiResponse, ListEstimatesApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/service/estimates`,
            params: {
              page: queryArg.page,
              pageSize: queryArg.pageSize,
              sort: queryArg.sort,
              q: queryArg.q,
              status: queryArg.status,
              jobCardId: queryArg.jobCardId,
              dealershipId: queryArg.dealershipId,
            },
          }),
          providesTags: ["Estimate"],
        },
      ),
      getEstimateWorkflow: build.query<
        GetEstimateWorkflowApiResponse,
        GetEstimateWorkflowApiArg
      >({
        query: () => ({ url: `/api/service/estimates/workflow` }),
        providesTags: ["Estimate"],
      }),
      getEstimate: build.query<GetEstimateApiResponse, GetEstimateApiArg>({
        query: (queryArg) => ({ url: `/api/service/estimates/${queryArg.id}` }),
        providesTags: ["Estimate"],
      }),
      updateEstimate: build.mutation<
        UpdateEstimateApiResponse,
        UpdateEstimateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/estimates/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.estimateUpdate,
        }),
        invalidatesTags: ["Estimate"],
      }),
      getEstimateHistory: build.query<
        GetEstimateHistoryApiResponse,
        GetEstimateHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/estimates/${queryArg.id}/history`,
        }),
        providesTags: ["Estimate"],
      }),
      transitionEstimate: build.mutation<
        TransitionEstimateApiResponse,
        TransitionEstimateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/service/estimates/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["Estimate"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type PreviewCheckInApiResponse = /** status 200 Success */ VisitPreview;
export type PreviewCheckInApiArg = {
  vehicleId: number;
  dealershipId: number;
};
export type OpenJobCardApiResponse = /** status 201 Success */ {
  id: number;
  jobCardNo: string;
  dealershipId: number;
  branchId: number | null;
  visitId: number;
  visitNo?: string | null;
  vehicleId: number;
  vehicleLabel?: string | null;
  advisorId: number;
  advisorName?: string | null;
  technicianId: number | null;
  technicianName?: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: "open" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type OpenJobCardApiArg = {
  id: number;
};
export type GetVehicleServiceScheduleApiResponse =
  /** status 200 Success */ VehicleScheduleEntry[];
export type GetVehicleServiceScheduleApiArg = {
  id: number;
};
export type ListJobCardTechniciansApiResponse = /** status 200 Success */ {
  id: number;
  fullName: string;
}[];
export type ListJobCardTechniciansApiArg = {
  id: number;
};
export type SetJobCardLineDoneApiResponse = /** status 200 Success */ {
  id: number;
  jobCardId: number;
  kind: "labour" | "part";
  description: string;
  partNo: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  billable: boolean;
  source: "schedule" | "estimate" | "manual" | "parts";
  status: "pending" | "done";
  doneAt: string | null;
};
export type SetJobCardLineDoneApiArg = {
  id: number;
  lineId: number;
  body: {
    done: boolean;
  };
};
export type GetJobCardInspectionApiResponse =
  | /** status 200 Success */ {
      id: number;
      dealershipId: number;
      branchId: number | null;
      jobCardId: number;
      inspectorId: number;
      inspectorName?: string | null;
      notes: string | null;
      completedAt: string | null;
      status: "in_progress" | "completed";
      items: InspectionItem[];
    }
  | null;
export type GetJobCardInspectionApiArg = {
  id: number;
};
export type StartInspectionApiResponse = /** status 201 Success */ Inspection;
export type StartInspectionApiArg = {
  id: number;
};
export type RecordInspectionApiResponse = /** status 200 Success */ Inspection;
export type RecordInspectionApiArg = {
  id: number;
  inspectionItemsUpdate: InspectionItemsUpdate;
};
export type CompleteInspectionApiResponse =
  /** status 200 Success */ Inspection;
export type CompleteInspectionApiArg = {
  id: number;
};
export type CreateEstimateApiResponse = /** status 201 Success */ {
  id: number;
  estimateNo: string;
  dealershipId: number;
  branchId: number | null;
  jobCardId: number;
  jobCardNo?: string | null;
  customerId: number;
  customerName?: string | null;
  advisorId: number;
  totalAmount: string;
  validUntil: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type CreateEstimateApiArg = {
  id: number;
  body: {
    validUntil?: string | null;
    notes?: string | null;
    fromInspection?: boolean;
  };
};
export type ListScheduleItemsApiResponse =
  /** status 200 Success */ ScheduleItemPage;
export type ListScheduleItemsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  modelId?: number;
  isActive?: "true" | "false";
};
export type CreateScheduleItemApiResponse =
  /** status 201 Success */ ScheduleItem;
export type CreateScheduleItemApiArg = {
  scheduleItemCreate: ScheduleItemCreate;
};
export type GetScheduleItemApiResponse = /** status 200 Success */ ScheduleItem;
export type GetScheduleItemApiArg = {
  id: number;
};
export type UpdateScheduleItemApiResponse =
  /** status 200 Success */ ScheduleItem;
export type UpdateScheduleItemApiArg = {
  id: number;
  scheduleItemUpdate: ScheduleItemUpdate;
};
export type DeleteScheduleItemApiResponse = unknown;
export type DeleteScheduleItemApiArg = {
  id: number;
};
export type GetScheduleItemHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetScheduleItemHistoryApiArg = {
  id: number;
};
export type ListInspectionTemplateItemsApiResponse =
  /** status 200 Success */ InspectionTemplateItemPage;
export type ListInspectionTemplateItemsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  isActive?: "true" | "false";
};
export type CreateInspectionTemplateItemApiResponse =
  /** status 201 Success */ InspectionTemplateItem;
export type CreateInspectionTemplateItemApiArg = {
  inspectionTemplateItemCreate: InspectionTemplateItemCreate;
};
export type GetInspectionTemplateItemApiResponse =
  /** status 200 Success */ InspectionTemplateItem;
export type GetInspectionTemplateItemApiArg = {
  id: number;
};
export type UpdateInspectionTemplateItemApiResponse =
  /** status 200 Success */ InspectionTemplateItem;
export type UpdateInspectionTemplateItemApiArg = {
  id: number;
  inspectionTemplateItemUpdate: InspectionTemplateItemUpdate;
};
export type DeleteInspectionTemplateItemApiResponse = unknown;
export type DeleteInspectionTemplateItemApiArg = {
  id: number;
};
export type GetInspectionTemplateItemHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetInspectionTemplateItemHistoryApiArg = {
  id: number;
};
export type ListVisitsApiResponse = /** status 200 Success */ VisitPage;
export type ListVisitsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?: "open" | "in_progress" | "ready" | "delivered" | "cancelled";
  visitType?: string;
  vehicleId?: number;
  customerId?: number;
  dealershipId?: number;
};
export type CreateVisitApiResponse = /** status 201 Success */ Visit;
export type CreateVisitApiArg = {
  visitCreate: VisitCreate;
};
export type GetVisitWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetVisitWorkflowApiArg = void;
export type GetVisitApiResponse = /** status 200 Success */ Visit;
export type GetVisitApiArg = {
  id: number;
};
export type UpdateVisitApiResponse = /** status 200 Success */ Visit;
export type UpdateVisitApiArg = {
  id: number;
  visitUpdate: VisitUpdate;
};
export type GetVisitHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetVisitHistoryApiArg = {
  id: number;
};
export type TransitionVisitApiResponse = /** status 200 Success */ Visit;
export type TransitionVisitApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type ListJobCardLinesApiResponse =
  /** status 200 Success */ JobCardLine[];
export type ListJobCardLinesApiArg = {
  id: number;
};
export type AddJobCardLineApiResponse = /** status 201 Success */ JobCardLine;
export type AddJobCardLineApiArg = {
  id: number;
  jobCardLineCreate: JobCardLineCreate;
};
export type UpdateJobCardLineApiResponse =
  /** status 200 Success */ JobCardLine;
export type UpdateJobCardLineApiArg = {
  id: number;
  lineId: number;
  jobCardLineUpdate: JobCardLineUpdate;
};
export type RemoveJobCardLineApiResponse = unknown;
export type RemoveJobCardLineApiArg = {
  id: number;
  lineId: number;
};
export type ListJobCardsApiResponse = /** status 200 Success */ JobCardPage;
export type ListJobCardsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?: "open" | "in_progress" | "completed" | "cancelled";
  technicianId?: number;
  vehicleId?: number;
  dealershipId?: number;
};
export type GetJobCardWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetJobCardWorkflowApiArg = void;
export type GetJobCardApiResponse = /** status 200 Success */ JobCard;
export type GetJobCardApiArg = {
  id: number;
};
export type UpdateJobCardApiResponse = /** status 200 Success */ JobCard;
export type UpdateJobCardApiArg = {
  id: number;
  jobCardUpdate: JobCardUpdate;
};
export type GetJobCardHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetJobCardHistoryApiArg = {
  id: number;
};
export type TransitionJobCardApiResponse = /** status 200 Success */ JobCard;
export type TransitionJobCardApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type ListEstimateLinesApiResponse =
  /** status 200 Success */ EstimateLine[];
export type ListEstimateLinesApiArg = {
  id: number;
};
export type AddEstimateLineApiResponse = /** status 201 Success */ EstimateLine;
export type AddEstimateLineApiArg = {
  id: number;
  estimateLineCreate: EstimateLineCreate;
};
export type UpdateEstimateLineApiResponse =
  /** status 200 Success */ EstimateLine;
export type UpdateEstimateLineApiArg = {
  id: number;
  lineId: number;
  estimateLineUpdate: EstimateLineUpdate;
};
export type RemoveEstimateLineApiResponse = unknown;
export type RemoveEstimateLineApiArg = {
  id: number;
  lineId: number;
};
export type ListEstimatesApiResponse = /** status 200 Success */ EstimatePage;
export type ListEstimatesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?: "draft" | "submitted" | "approved" | "rejected";
  jobCardId?: number;
  dealershipId?: number;
};
export type GetEstimateWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetEstimateWorkflowApiArg = void;
export type GetEstimateApiResponse = /** status 200 Success */ Estimate;
export type GetEstimateApiArg = {
  id: number;
};
export type UpdateEstimateApiResponse = /** status 200 Success */ Estimate;
export type UpdateEstimateApiArg = {
  id: number;
  estimateUpdate: EstimateUpdate;
};
export type GetEstimateHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetEstimateHistoryApiArg = {
  id: number;
};
export type TransitionEstimateApiResponse = /** status 200 Success */ Estimate;
export type TransitionEstimateApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type VisitPreview = {
  visitSequence: number;
  nextScheduled: {
    id: number;
    sequence: number;
    name: string;
    dueKm: number;
    dueDate: string;
    isFree: boolean;
    status: "due" | "done";
    visitId: number | null;
    completedOn: string | null;
  } | null;
  warrantyValid: boolean;
  freeServiceIfScheduled: boolean;
  lastOdometerKm: number | null;
  currentOwner: {
    customerId: number;
    fullName: string;
  } | null;
  openVisitId: number | null;
};
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: any | null;
  };
};
export type VehicleScheduleEntry = {
  id: number;
  sequence: number;
  name: string;
  dueKm: number;
  dueDate: string;
  isFree: boolean;
  status: "due" | "done";
  visitId: number | null;
  completedOn: string | null;
};
export type InspectionItem = {
  id: number;
  area: string;
  item: string;
  condition: "not_checked" | "ok" | "attention" | "urgent";
  notes: string | null;
  sortOrder: number;
};
export type Inspection = {
  id: number;
  dealershipId: number;
  branchId: number | null;
  jobCardId: number;
  inspectorId: number;
  inspectorName?: string | null;
  notes: string | null;
  completedAt: string | null;
  status: "in_progress" | "completed";
  items: InspectionItem[];
};
export type InspectionItemsUpdate = {
  items: {
    id: number;
    condition: "not_checked" | "ok" | "attention" | "urgent";
    notes?: string | null;
  }[];
  notes?: string | null;
};
export type ScheduleItem = {
  id: number;
  modelId: number;
  modelName?: string;
  sequence: number;
  name: string;
  dueKm: number;
  dueMonths: number;
  isFree: boolean;
  labourHours: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ScheduleItemPage = {
  items: ScheduleItem[];
  total: number;
  page: number;
  pageSize: number;
};
export type ScheduleItemCreate = {
  modelId: number;
  sequence: number;
  name: string;
  dueKm: number;
  dueMonths: number;
  isFree?: boolean;
  labourHours?: string;
  isActive?: boolean;
};
export type ScheduleItemUpdate = {
  sequence?: number;
  name?: string;
  dueKm?: number;
  dueMonths?: number;
  isFree?: boolean;
  labourHours?: string;
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
export type InspectionTemplateItem = {
  id: number;
  area: string;
  item: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type InspectionTemplateItemPage = {
  items: InspectionTemplateItem[];
  total: number;
  page: number;
  pageSize: number;
};
export type InspectionTemplateItemCreate = {
  area: string;
  item: string;
  sortOrder?: number;
  isActive?: boolean;
};
export type InspectionTemplateItemUpdate = {
  area?: string;
  item?: string;
  sortOrder?: number;
  isActive?: boolean;
};
export type Visit = {
  id: number;
  visitNo: string;
  dealershipId: number;
  branchId: number | null;
  vehicleId: number;
  vehicleLabel?: string | null;
  customerId: number;
  customerName?: string | null;
  advisorId: number;
  advisorName?: string | null;
  visitType:
    | "scheduled"
    | "paid_service"
    | "repair"
    | "warranty"
    | "accident"
    | "inspection";
  serviceNumber: number | null;
  scheduleEntryId: number | null;
  visitSequence: number;
  odometerKm: number;
  arrivedAt: string;
  promisedAt: string | null;
  complaints: string | null;
  warrantyValid: boolean;
  freeService: boolean;
  deliveredAt: string | null;
  jobCardId?: number | null;
  status: "open" | "in_progress" | "ready" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type VisitPage = {
  items: Visit[];
  total: number;
  page: number;
  pageSize: number;
};
export type VisitCreate = {
  dealershipId: number;
  branchId?: number | null;
  vehicleId: number;
  customerId?: number | null;
  visitType:
    | "scheduled"
    | "paid_service"
    | "repair"
    | "warranty"
    | "accident"
    | "inspection";
  odometerKm: number;
  promisedAt?: string | null;
  complaints?: string | null;
};
export type WorkflowDefinition = {
  stateKey: string;
  initial: string;
  states: {
    key: string;
    label: string;
    terminal?: boolean;
  }[];
  transitions: {
    action: string;
    label: string;
    from: string[];
    to: string;
    requiresComment: boolean;
    system: boolean;
  }[];
};
export type VisitUpdate = {
  promisedAt?: string | null;
  complaints?: string | null;
};
export type JobCardLine = {
  id: number;
  jobCardId: number;
  kind: "labour" | "part";
  description: string;
  partNo: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  billable: boolean;
  source: "schedule" | "estimate" | "manual" | "parts";
  status: "pending" | "done";
  doneAt: string | null;
};
export type JobCardLineCreate = {
  kind: "labour" | "part";
  description: string;
  partNo?: string | null;
  quantity: string;
  unitPrice: string;
  billable?: boolean;
};
export type JobCardLineUpdate = {
  kind?: "labour" | "part";
  description?: string;
  partNo?: string | null;
  quantity?: string;
  unitPrice?: string;
  billable?: boolean;
};
export type JobCard = {
  id: number;
  jobCardNo: string;
  dealershipId: number;
  branchId: number | null;
  visitId: number;
  visitNo?: string | null;
  vehicleId: number;
  vehicleLabel?: string | null;
  advisorId: number;
  advisorName?: string | null;
  technicianId: number | null;
  technicianName?: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: "open" | "in_progress" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type JobCardPage = {
  items: JobCard[];
  total: number;
  page: number;
  pageSize: number;
};
export type JobCardUpdate = {
  technicianId?: number | null;
  notes?: string | null;
};
export type EstimateLine = {
  id: number;
  estimateId: number;
  kind: "labour" | "part";
  description: string;
  partNo: string | null;
  quantity: string;
  unitPrice: string;
  amount: string;
  inspectionItemId: number | null;
  sortOrder: number;
};
export type EstimateLineCreate = {
  kind: "labour" | "part";
  description: string;
  partNo?: string | null;
  quantity: string;
  unitPrice: string;
  inspectionItemId?: number | null;
  sortOrder?: number;
};
export type EstimateLineUpdate = {
  kind?: "labour" | "part";
  description?: string;
  partNo?: string | null;
  quantity?: string;
  unitPrice?: string;
  sortOrder?: number;
};
export type Estimate = {
  id: number;
  estimateNo: string;
  dealershipId: number;
  branchId: number | null;
  jobCardId: number;
  jobCardNo?: string | null;
  customerId: number;
  customerName?: string | null;
  advisorId: number;
  totalAmount: string;
  validUntil: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type EstimatePage = {
  items: Estimate[];
  total: number;
  page: number;
  pageSize: number;
};
export type EstimateUpdate = {
  validUntil?: string | null;
  notes?: string | null;
};
export const {
  usePreviewCheckInQuery,
  useLazyPreviewCheckInQuery,
  useOpenJobCardMutation,
  useGetVehicleServiceScheduleQuery,
  useLazyGetVehicleServiceScheduleQuery,
  useListJobCardTechniciansQuery,
  useLazyListJobCardTechniciansQuery,
  useSetJobCardLineDoneMutation,
  useGetJobCardInspectionQuery,
  useLazyGetJobCardInspectionQuery,
  useStartInspectionMutation,
  useRecordInspectionMutation,
  useCompleteInspectionMutation,
  useCreateEstimateMutation,
  useListScheduleItemsQuery,
  useLazyListScheduleItemsQuery,
  useCreateScheduleItemMutation,
  useGetScheduleItemQuery,
  useLazyGetScheduleItemQuery,
  useUpdateScheduleItemMutation,
  useDeleteScheduleItemMutation,
  useGetScheduleItemHistoryQuery,
  useLazyGetScheduleItemHistoryQuery,
  useListInspectionTemplateItemsQuery,
  useLazyListInspectionTemplateItemsQuery,
  useCreateInspectionTemplateItemMutation,
  useGetInspectionTemplateItemQuery,
  useLazyGetInspectionTemplateItemQuery,
  useUpdateInspectionTemplateItemMutation,
  useDeleteInspectionTemplateItemMutation,
  useGetInspectionTemplateItemHistoryQuery,
  useLazyGetInspectionTemplateItemHistoryQuery,
  useListVisitsQuery,
  useLazyListVisitsQuery,
  useCreateVisitMutation,
  useGetVisitWorkflowQuery,
  useLazyGetVisitWorkflowQuery,
  useGetVisitQuery,
  useLazyGetVisitQuery,
  useUpdateVisitMutation,
  useGetVisitHistoryQuery,
  useLazyGetVisitHistoryQuery,
  useTransitionVisitMutation,
  useListJobCardLinesQuery,
  useLazyListJobCardLinesQuery,
  useAddJobCardLineMutation,
  useUpdateJobCardLineMutation,
  useRemoveJobCardLineMutation,
  useListJobCardsQuery,
  useLazyListJobCardsQuery,
  useGetJobCardWorkflowQuery,
  useLazyGetJobCardWorkflowQuery,
  useGetJobCardQuery,
  useLazyGetJobCardQuery,
  useUpdateJobCardMutation,
  useGetJobCardHistoryQuery,
  useLazyGetJobCardHistoryQuery,
  useTransitionJobCardMutation,
  useListEstimateLinesQuery,
  useLazyListEstimateLinesQuery,
  useAddEstimateLineMutation,
  useUpdateEstimateLineMutation,
  useRemoveEstimateLineMutation,
  useListEstimatesQuery,
  useLazyListEstimatesQuery,
  useGetEstimateWorkflowQuery,
  useLazyGetEstimateWorkflowQuery,
  useGetEstimateQuery,
  useLazyGetEstimateQuery,
  useUpdateEstimateMutation,
  useGetEstimateHistoryQuery,
  useLazyGetEstimateHistoryQuery,
  useTransitionEstimateMutation,
} = injectedRtkApi;
