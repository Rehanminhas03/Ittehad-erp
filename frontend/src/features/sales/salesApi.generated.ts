import { baseApi as api } from "../../shared/api/baseApi";
export const addTagTypes = [
  "Lead",
  "Quotation",
  "PPF form",
  "DocumentTemplate",
  "Variant code",
  "SalesDashboard",
  "SalesTeam",
  "SalesOrder",
  "StockVehicle",
  "Delivery",
  "DeliveryPipeline",
  "DeliveryReport",
  "LeaveApplication",
] as const;
const injectedRtkApi = api
  .enhanceEndpoints({
    addTagTypes,
  })
  .injectEndpoints({
    endpoints: (build) => ({
      getLeadSummary: build.query<
        GetLeadSummaryApiResponse,
        GetLeadSummaryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/summary`,
          params: {
            activityFrom: queryArg.activityFrom,
            activityTo: queryArg.activityTo,
            ownerId: queryArg.ownerId,
            source: queryArg.source,
            escalated: queryArg.escalated,
          },
        }),
        providesTags: ["Lead"],
      }),
      escalateDuplicateLead: build.mutation<
        EscalateDuplicateLeadApiResponse,
        EscalateDuplicateLeadApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/escalations`,
          method: "POST",
          body: queryArg.escalateDuplicateRequest,
        }),
        invalidatesTags: ["Lead"],
      }),
      listLeadFollowUps: build.query<
        ListLeadFollowUpsApiResponse,
        ListLeadFollowUpsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/follow-ups`,
        }),
        providesTags: ["Lead"],
      }),
      recordLeadFollowUp: build.mutation<
        RecordLeadFollowUpApiResponse,
        RecordLeadFollowUpApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/follow-ups`,
          method: "POST",
          body: queryArg.leadFollowUpCreate,
        }),
        invalidatesTags: ["Lead"],
      }),
      commentOnFollowUp: build.mutation<
        CommentOnFollowUpApiResponse,
        CommentOnFollowUpApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/follow-ups/${queryArg.followUpId}/comments`,
          method: "POST",
          body: queryArg.followUpCommentRequest,
        }),
        invalidatesTags: ["Lead"],
      }),
      correctLeadDetails: build.mutation<
        CorrectLeadDetailsApiResponse,
        CorrectLeadDetailsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/details`,
          method: "PATCH",
          body: queryArg.leadDetailsRequest,
        }),
        invalidatesTags: ["Lead"],
      }),
      createLeadQuotation: build.mutation<
        CreateLeadQuotationApiResponse,
        CreateLeadQuotationApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/quotations`,
          method: "POST",
          body: queryArg.quotationCreate,
        }),
        invalidatesTags: ["Lead"],
      }),
      getLeadOrderVehicle: build.query<
        GetLeadOrderVehicleApiResponse,
        GetLeadOrderVehicleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/order-vehicle`,
        }),
        providesTags: ["Lead"],
      }),
      createLeadPpfForm: build.mutation<
        CreateLeadPpfFormApiResponse,
        CreateLeadPpfFormApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/ppf-forms`,
          method: "POST",
          body: queryArg.ppfFormCreate,
        }),
        invalidatesTags: ["Lead"],
      }),
      setLeadAppointment: build.mutation<
        SetLeadAppointmentApiResponse,
        SetLeadAppointmentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/appointment`,
          method: "PUT",
          body: queryArg.leadAppointmentRequest,
        }),
        invalidatesTags: ["Lead"],
      }),
      reassignLead: build.mutation<ReassignLeadApiResponse, ReassignLeadApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/sales/leads/${queryArg.id}/reassign`,
            method: "POST",
            body: queryArg.reassignLeadRequest,
          }),
          invalidatesTags: ["Lead"],
        },
      ),
      convertLead: build.mutation<ConvertLeadApiResponse, ConvertLeadApiArg>({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/convert`,
          method: "POST",
          body: queryArg.convertLeadRequest,
        }),
        invalidatesTags: ["Lead"],
      }),
      raiseSalesOrder: build.mutation<
        RaiseSalesOrderApiResponse,
        RaiseSalesOrderApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/order`,
          method: "POST",
          body: queryArg.raiseOrderRequest,
        }),
        invalidatesTags: ["Lead"],
      }),
      createStandaloneQuotation: build.mutation<
        CreateStandaloneQuotationApiResponse,
        CreateStandaloneQuotationApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/quotations/standalone`,
          method: "POST",
          body: queryArg.standaloneQuotationCreate,
        }),
        invalidatesTags: ["Quotation"],
      }),
      getQuotationDocument: build.query<
        GetQuotationDocumentApiResponse,
        GetQuotationDocumentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/quotations/${queryArg.id}/document`,
        }),
        providesTags: ["Quotation"],
      }),
      createStandalonePpfForm: build.mutation<
        CreateStandalonePpfFormApiResponse,
        CreateStandalonePpfFormApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/ppf-forms/standalone`,
          method: "POST",
          body: queryArg.standalonePpfCreate,
        }),
        invalidatesTags: ["PPF form"],
      }),
      getPpfDocument: build.query<
        GetPpfDocumentApiResponse,
        GetPpfDocumentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/ppf-forms/${queryArg.id}/document`,
        }),
        providesTags: ["PPF form"],
      }),
      getDocumentTemplate: build.query<
        GetDocumentTemplateApiResponse,
        GetDocumentTemplateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/document-templates/${queryArg.kind}`,
          params: {
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["DocumentTemplate"],
      }),
      saveDocumentTemplate: build.mutation<
        SaveDocumentTemplateApiResponse,
        SaveDocumentTemplateApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/document-templates/${queryArg.kind}`,
          method: "PUT",
          body: queryArg.documentTemplateUpdate,
        }),
        invalidatesTags: ["DocumentTemplate"],
      }),
      importVariantCodes: build.mutation<
        ImportVariantCodesApiResponse,
        ImportVariantCodesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/variants/import`,
          method: "POST",
          body: queryArg.variantImport,
        }),
        invalidatesTags: ["Variant code"],
      }),
      getSalesDashboard: build.query<
        GetSalesDashboardApiResponse,
        GetSalesDashboardApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/dashboard`,
          params: {
            days: queryArg.days,
            from: queryArg["from"],
            to: queryArg.to,
            ownerId: queryArg.ownerId,
          },
        }),
        providesTags: ["SalesDashboard"],
      }),
      getSalesActionItems: build.query<
        GetSalesActionItemsApiResponse,
        GetSalesActionItemsApiArg
      >({
        query: () => ({ url: `/api/sales/dashboard/actions` }),
        providesTags: ["SalesDashboard"],
      }),
      getSalesToday: build.query<GetSalesTodayApiResponse, GetSalesTodayApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/sales/dashboard/today`,
            params: {
              dealershipId: queryArg.dealershipId,
            },
          }),
          providesTags: ["SalesDashboard"],
        },
      ),
      listSalesTeamMembers: build.query<
        ListSalesTeamMembersApiResponse,
        ListSalesTeamMembersApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/team/members`,
          params: {
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["SalesTeam"],
      }),
      getSalesTeamReport: build.query<
        GetSalesTeamReportApiResponse,
        GetSalesTeamReportApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/team/report`,
          params: {
            dealershipId: queryArg.dealershipId,
            from: queryArg["from"],
            to: queryArg.to,
          },
        }),
        providesTags: ["SalesTeam"],
      }),
      getSalesTrackRecord: build.query<
        GetSalesTrackRecordApiResponse,
        GetSalesTrackRecordApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/team/track-record`,
          params: {
            dealershipId: queryArg.dealershipId,
            year: queryArg.year,
            month: queryArg.month,
            from: queryArg["from"],
            to: queryArg.to,
            userId: queryArg.userId,
            group: queryArg.group,
            details: queryArg.details,
          },
        }),
        providesTags: ["SalesTeam"],
      }),
      getLeadsToHandOver: build.query<
        GetLeadsToHandOverApiResponse,
        GetLeadsToHandOverApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/team/hand-over`,
          params: {
            dealershipId: queryArg.dealershipId,
            userId: queryArg.userId,
          },
        }),
        providesTags: ["SalesTeam"],
      }),
      handOverLeads: build.mutation<
        HandOverLeadsApiResponse,
        HandOverLeadsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/team/hand-over`,
          method: "POST",
          body: queryArg.handOverLeadsRequest,
        }),
        invalidatesTags: ["SalesTeam"],
      }),
      listOrderPayments: build.query<
        ListOrderPaymentsApiResponse,
        ListOrderPaymentsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/payments`,
        }),
        providesTags: ["SalesOrder"],
      }),
      addOrderPayment: build.mutation<
        AddOrderPaymentApiResponse,
        AddOrderPaymentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/payments`,
          method: "POST",
          body: queryArg.orderPaymentCreate,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      removeOrderPayment: build.mutation<
        RemoveOrderPaymentApiResponse,
        RemoveOrderPaymentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/payments/${queryArg.paymentId}`,
          method: "DELETE",
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      requestDeliveryClearance: build.mutation<
        RequestDeliveryClearanceApiResponse,
        RequestDeliveryClearanceApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/clearance-request`,
          method: "POST",
          body: queryArg.clearanceRequest,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      decideDeliveryClearance: build.mutation<
        DecideDeliveryClearanceApiResponse,
        DecideDeliveryClearanceApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/clearance-decision`,
          method: "POST",
          body: queryArg.clearanceDecision,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      setOrderVehicle: build.mutation<
        SetOrderVehicleApiResponse,
        SetOrderVehicleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/vehicle`,
          method: "PUT",
          body: queryArg.orderVehicleRequest,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      listAllocatableVehicles: build.query<
        ListAllocatableVehiclesApiResponse,
        ListAllocatableVehiclesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/allocatable-vehicles`,
        }),
        providesTags: ["SalesOrder"],
      }),
      allocateVehicle: build.mutation<
        AllocateVehicleApiResponse,
        AllocateVehicleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/allocation`,
          method: "PUT",
          body: queryArg.allocationRequest,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      releaseVehicle: build.mutation<
        ReleaseVehicleApiResponse,
        ReleaseVehicleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/allocation`,
          method: "DELETE",
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      advanceVehicleStatus: build.mutation<
        AdvanceVehicleStatusApiResponse,
        AdvanceVehicleStatusApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/vehicle-status`,
          method: "PATCH",
          body: queryArg.advanceVehicleStatusRequest,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      listOrderDeliveries: build.query<
        ListOrderDeliveriesApiResponse,
        ListOrderDeliveriesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/deliveries`,
        }),
        providesTags: ["SalesOrder"],
      }),
      scheduleDelivery: build.mutation<
        ScheduleDeliveryApiResponse,
        ScheduleDeliveryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/deliveries`,
          method: "POST",
          body: queryArg.scheduleDeliveryRequest,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      deliverOrder: build.mutation<DeliverOrderApiResponse, DeliverOrderApiArg>(
        {
          query: (queryArg) => ({
            url: `/api/sales/orders/${queryArg.id}/deliver`,
            method: "POST",
            body: queryArg.completeDeliveryRequest,
          }),
          invalidatesTags: ["SalesOrder"],
        },
      ),
      receiveStockVehicle: build.mutation<
        ReceiveStockVehicleApiResponse,
        ReceiveStockVehicleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/stock`,
          method: "POST",
          body: queryArg.stockVehicleCreate,
        }),
        invalidatesTags: ["StockVehicle"],
      }),
      listStockVehicles: build.query<
        ListStockVehiclesApiResponse,
        ListStockVehiclesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/stock`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            modelId: queryArg.modelId,
            dealershipId: queryArg.dealershipId,
            allocated: queryArg.allocated,
          },
        }),
        providesTags: ["StockVehicle"],
      }),
      getDeliveryNote: build.query<
        GetDeliveryNoteApiResponse,
        GetDeliveryNoteApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/deliveries/${queryArg.id}/note`,
        }),
        providesTags: ["Delivery"],
      }),
      completeDelivery: build.mutation<
        CompleteDeliveryApiResponse,
        CompleteDeliveryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/deliveries/${queryArg.id}/complete`,
          method: "POST",
          body: queryArg.completeDeliveryRequest,
        }),
        invalidatesTags: ["Delivery"],
      }),
      getDeliveryPipeline: build.query<
        GetDeliveryPipelineApiResponse,
        GetDeliveryPipelineApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/delivery-pipeline`,
          params: {
            stage: queryArg.stage,
            dealershipId: queryArg.dealershipId,
            q: queryArg.q,
            overdue: queryArg.overdue,
            from: queryArg["from"],
            to: queryArg.to,
            page: queryArg.page,
            pageSize: queryArg.pageSize,
          },
        }),
        providesTags: ["DeliveryPipeline"],
      }),
      getDeliveryReport: build.query<
        GetDeliveryReportApiResponse,
        GetDeliveryReportApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/delivery-report`,
          params: {
            dealershipId: queryArg.dealershipId,
            from: queryArg["from"],
            to: queryArg.to,
          },
        }),
        providesTags: ["DeliveryReport"],
      }),
      listLeaveApplications: build.query<
        ListLeaveApplicationsApiResponse,
        ListLeaveApplicationsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leave`,
          params: {
            dealershipId: queryArg.dealershipId,
            status: queryArg.status,
            mine: queryArg.mine,
            page: queryArg.page,
            pageSize: queryArg.pageSize,
          },
        }),
        providesTags: ["LeaveApplication"],
      }),
      applyForLeave: build.mutation<
        ApplyForLeaveApiResponse,
        ApplyForLeaveApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leave`,
          method: "POST",
          body: queryArg.leaveApplicationCreate,
        }),
        invalidatesTags: ["LeaveApplication"],
      }),
      getLeaveApplication: build.query<
        GetLeaveApplicationApiResponse,
        GetLeaveApplicationApiArg
      >({
        query: (queryArg) => ({ url: `/api/sales/leave/${queryArg.id}` }),
        providesTags: ["LeaveApplication"],
      }),
      decideLeaveApplication: build.mutation<
        DecideLeaveApplicationApiResponse,
        DecideLeaveApplicationApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leave/${queryArg.id}/decision`,
          method: "POST",
          body: queryArg.leaveDecision,
        }),
        invalidatesTags: ["LeaveApplication"],
      }),
      getLeaveDocument: build.query<
        GetLeaveDocumentApiResponse,
        GetLeaveDocumentApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leave/${queryArg.id}/document`,
        }),
        providesTags: ["LeaveApplication"],
      }),
      listLeads: build.query<ListLeadsApiResponse, ListLeadsApiArg>({
        query: (queryArg) => ({
          url: `/api/sales/leads`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            ownerId: queryArg.ownerId,
            source: queryArg.source,
            escalated: queryArg.escalated,
            open: queryArg.open,
            convertedFrom: queryArg.convertedFrom,
            convertedTo: queryArg.convertedTo,
            createdBefore: queryArg.createdBefore,
            vehicleStage: queryArg.vehicleStage,
            createdOn: queryArg.createdOn,
            activityFrom: queryArg.activityFrom,
            activityTo: queryArg.activityTo,
            lost: queryArg.lost,
            appointmentOn: queryArg.appointmentOn,
            upcomingAppointment: queryArg.upcomingAppointment,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["Lead"],
      }),
      createLead: build.mutation<CreateLeadApiResponse, CreateLeadApiArg>({
        query: (queryArg) => ({
          url: `/api/sales/leads`,
          method: "POST",
          body: queryArg.leadCreate,
        }),
        invalidatesTags: ["Lead"],
      }),
      getLeadWorkflow: build.query<
        GetLeadWorkflowApiResponse,
        GetLeadWorkflowApiArg
      >({
        query: () => ({ url: `/api/sales/leads/workflow` }),
        providesTags: ["Lead"],
      }),
      getLead: build.query<GetLeadApiResponse, GetLeadApiArg>({
        query: (queryArg) => ({ url: `/api/sales/leads/${queryArg.id}` }),
        providesTags: ["Lead"],
      }),
      updateLead: build.mutation<UpdateLeadApiResponse, UpdateLeadApiArg>({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.leadUpdate,
        }),
        invalidatesTags: ["Lead"],
      }),
      getLeadHistory: build.query<
        GetLeadHistoryApiResponse,
        GetLeadHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/history`,
        }),
        providesTags: ["Lead"],
      }),
      transitionLead: build.mutation<
        TransitionLeadApiResponse,
        TransitionLeadApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/leads/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["Lead"],
      }),
      listSalesOrders: build.query<
        ListSalesOrdersApiResponse,
        ListSalesOrdersApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            orderType: queryArg.orderType,
            customerId: queryArg.customerId,
            salespersonId: queryArg.salespersonId,
            modelId: queryArg.modelId,
            leadId: queryArg.leadId,
            live: queryArg.live,
            awaitingApproval: queryArg.awaitingApproval,
            vehicleStage: queryArg.vehicleStage,
            hasVehicle: queryArg.hasVehicle,
            clearanceStatus: queryArg.clearanceStatus,
            bookedFrom: queryArg.bookedFrom,
            bookedTo: queryArg.bookedTo,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["SalesOrder"],
      }),
      createSalesOrder: build.mutation<
        CreateSalesOrderApiResponse,
        CreateSalesOrderApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders`,
          method: "POST",
          body: queryArg.salesOrderCreate,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      getSalesOrderWorkflow: build.query<
        GetSalesOrderWorkflowApiResponse,
        GetSalesOrderWorkflowApiArg
      >({
        query: () => ({ url: `/api/sales/orders/workflow` }),
        providesTags: ["SalesOrder"],
      }),
      getSalesOrder: build.query<GetSalesOrderApiResponse, GetSalesOrderApiArg>(
        {
          query: (queryArg) => ({ url: `/api/sales/orders/${queryArg.id}` }),
          providesTags: ["SalesOrder"],
        },
      ),
      updateSalesOrder: build.mutation<
        UpdateSalesOrderApiResponse,
        UpdateSalesOrderApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.salesOrderUpdate,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      getSalesOrderHistory: build.query<
        GetSalesOrderHistoryApiResponse,
        GetSalesOrderHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/history`,
        }),
        providesTags: ["SalesOrder"],
      }),
      transitionSalesOrder: build.mutation<
        TransitionSalesOrderApiResponse,
        TransitionSalesOrderApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/orders/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["SalesOrder"],
      }),
      listDeliveries: build.query<
        ListDeliveriesApiResponse,
        ListDeliveriesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/deliveries`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            status: queryArg.status,
            salesOrderId: queryArg.salesOrderId,
            due: queryArg.due,
            deliveredFrom: queryArg.deliveredFrom,
            deliveredTo: queryArg.deliveredTo,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["Delivery"],
      }),
      getDeliveryWorkflow: build.query<
        GetDeliveryWorkflowApiResponse,
        GetDeliveryWorkflowApiArg
      >({
        query: () => ({ url: `/api/sales/deliveries/workflow` }),
        providesTags: ["Delivery"],
      }),
      getDelivery: build.query<GetDeliveryApiResponse, GetDeliveryApiArg>({
        query: (queryArg) => ({ url: `/api/sales/deliveries/${queryArg.id}` }),
        providesTags: ["Delivery"],
      }),
      getDeliveryHistory: build.query<
        GetDeliveryHistoryApiResponse,
        GetDeliveryHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/deliveries/${queryArg.id}/history`,
        }),
        providesTags: ["Delivery"],
      }),
      transitionDelivery: build.mutation<
        TransitionDeliveryApiResponse,
        TransitionDeliveryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/deliveries/${queryArg.id}/transitions`,
          method: "POST",
          body: queryArg.body,
        }),
        invalidatesTags: ["Delivery"],
      }),
      getStockVehicle: build.query<
        GetStockVehicleApiResponse,
        GetStockVehicleApiArg
      >({
        query: (queryArg) => ({ url: `/api/sales/stock/${queryArg.id}` }),
        providesTags: ["StockVehicle"],
      }),
      updateStockVehicle: build.mutation<
        UpdateStockVehicleApiResponse,
        UpdateStockVehicleApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/stock/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.stockVehicleUpdate,
        }),
        invalidatesTags: ["StockVehicle"],
      }),
      getStockVehicleHistory: build.query<
        GetStockVehicleHistoryApiResponse,
        GetStockVehicleHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/stock/${queryArg.id}/history`,
        }),
        providesTags: ["StockVehicle"],
      }),
      listQuotations: build.query<
        ListQuotationsApiResponse,
        ListQuotationsApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/quotations`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            leadId: queryArg.leadId,
            ownerId: queryArg.ownerId,
            createdFrom: queryArg.createdFrom,
            createdTo: queryArg.createdTo,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["Quotation"],
      }),
      getQuotation: build.query<GetQuotationApiResponse, GetQuotationApiArg>({
        query: (queryArg) => ({ url: `/api/sales/quotations/${queryArg.id}` }),
        providesTags: ["Quotation"],
      }),
      updateQuotation: build.mutation<
        UpdateQuotationApiResponse,
        UpdateQuotationApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/quotations/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.quotationUpdate,
        }),
        invalidatesTags: ["Quotation"],
      }),
      getQuotationHistory: build.query<
        GetQuotationHistoryApiResponse,
        GetQuotationHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/quotations/${queryArg.id}/history`,
        }),
        providesTags: ["Quotation"],
      }),
      listPpfForms: build.query<ListPpfFormsApiResponse, ListPpfFormsApiArg>({
        query: (queryArg) => ({
          url: `/api/sales/ppf-forms`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            leadId: queryArg.leadId,
            ownerId: queryArg.ownerId,
            createdFrom: queryArg.createdFrom,
            createdTo: queryArg.createdTo,
            dealershipId: queryArg.dealershipId,
          },
        }),
        providesTags: ["PPF form"],
      }),
      getPpfForm: build.query<GetPpfFormApiResponse, GetPpfFormApiArg>({
        query: (queryArg) => ({ url: `/api/sales/ppf-forms/${queryArg.id}` }),
        providesTags: ["PPF form"],
      }),
      updatePpfForm: build.mutation<
        UpdatePpfFormApiResponse,
        UpdatePpfFormApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/ppf-forms/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.ppfFormUpdate,
        }),
        invalidatesTags: ["PPF form"],
      }),
      getPpfFormHistory: build.query<
        GetPpfFormHistoryApiResponse,
        GetPpfFormHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/ppf-forms/${queryArg.id}/history`,
        }),
        providesTags: ["PPF form"],
      }),
      listVariantCodes: build.query<
        ListVariantCodesApiResponse,
        ListVariantCodesApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/variants`,
          params: {
            page: queryArg.page,
            pageSize: queryArg.pageSize,
            sort: queryArg.sort,
            q: queryArg.q,
            dealershipId: queryArg.dealershipId,
            modelId: queryArg.modelId,
            isActive: queryArg.isActive,
          },
        }),
        providesTags: ["Variant code"],
      }),
      createVariantCode: build.mutation<
        CreateVariantCodeApiResponse,
        CreateVariantCodeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/variants`,
          method: "POST",
          body: queryArg.vehicleVariantCreate,
        }),
        invalidatesTags: ["Variant code"],
      }),
      getVariantCode: build.query<
        GetVariantCodeApiResponse,
        GetVariantCodeApiArg
      >({
        query: (queryArg) => ({ url: `/api/sales/variants/${queryArg.id}` }),
        providesTags: ["Variant code"],
      }),
      updateVariantCode: build.mutation<
        UpdateVariantCodeApiResponse,
        UpdateVariantCodeApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/variants/${queryArg.id}`,
          method: "PATCH",
          body: queryArg.vehicleVariantUpdate,
        }),
        invalidatesTags: ["Variant code"],
      }),
      getVariantCodeHistory: build.query<
        GetVariantCodeHistoryApiResponse,
        GetVariantCodeHistoryApiArg
      >({
        query: (queryArg) => ({
          url: `/api/sales/variants/${queryArg.id}/history`,
        }),
        providesTags: ["Variant code"],
      }),
    }),
    overrideExisting: false,
  });
export { injectedRtkApi as enhancedApi };
export type GetLeadSummaryApiResponse = /** status 200 Success */ LeadSummary;
export type GetLeadSummaryApiArg = {
  activityFrom?: string;
  activityTo?: string;
  ownerId?: number;
  source?:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  escalated?: "true" | "false";
};
export type EscalateDuplicateLeadApiResponse =
  /** status 200 Success */ EscalationResult;
export type EscalateDuplicateLeadApiArg = {
  escalateDuplicateRequest: EscalateDuplicateRequest;
};
export type ListLeadFollowUpsApiResponse =
  /** status 200 Success */ LeadFollowUp[];
export type ListLeadFollowUpsApiArg = {
  id: number;
};
export type RecordLeadFollowUpApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  ownerId: number;
  ownerName?: string | null;
  customerId: number | null;
  prospectName: string;
  prospectMobile: string;
  email: string | null;
  source:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  interestedModelId: number | null;
  modelName?: string | null;
  variant: string | null;
  preferredColor: string | null;
  expectedCloseDate: string | null;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  notes: string | null;
  paymentInstrument:
    | (
        | "pay_order"
        | "bank_draft"
        | "cheque"
        | "online_transfer"
        | "cash"
        | null
      )
    | null;
  paymentInstrumentRef: string | null;
  paymentInstrumentBank: string | null;
  paymentAmount: string | null;
  followUpCount: number;
  lastFollowUpAt: string | null;
  escalatedAt: string | null;
  escalatedById: number | null;
  escalatedByName?: string | null;
  escalationNote: string | null;
  appointmentAt?: string | null;
  appointmentNote?: string | null;
  appointmentSetById?: number | null;
  appointmentSetByName?: string | null;
  lostAt?: string | null;
  lostById?: number | null;
  lostByName?: string | null;
  lostReason?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  previousPurchases?: number;
  convertedAt: string | null;
  convertedById: number | null;
  convertedByName?: string | null;
  status:
    | "new"
    | "follow_up"
    | "visited"
    | "converted"
    | "processing"
    | "completed"
    | "exhausted"
    | "lost";
  salesOrderId: number | null;
  orderNo?: string | null;
  vehicleStage?: string | null;
  createdById: number | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type RecordLeadFollowUpApiArg = {
  id: number;
  leadFollowUpCreate: LeadFollowUpCreate;
};
export type CommentOnFollowUpApiResponse =
  /** status 201 Success */ LeadFollowUp[];
export type CommentOnFollowUpApiArg = {
  id: number;
  followUpId: number;
  followUpCommentRequest: FollowUpCommentRequest;
};
export type CorrectLeadDetailsApiResponse = /** status 200 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  ownerId: number;
  ownerName?: string | null;
  customerId: number | null;
  prospectName: string;
  prospectMobile: string;
  email: string | null;
  source:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  interestedModelId: number | null;
  modelName?: string | null;
  variant: string | null;
  preferredColor: string | null;
  expectedCloseDate: string | null;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  notes: string | null;
  paymentInstrument:
    | (
        | "pay_order"
        | "bank_draft"
        | "cheque"
        | "online_transfer"
        | "cash"
        | null
      )
    | null;
  paymentInstrumentRef: string | null;
  paymentInstrumentBank: string | null;
  paymentAmount: string | null;
  followUpCount: number;
  lastFollowUpAt: string | null;
  escalatedAt: string | null;
  escalatedById: number | null;
  escalatedByName?: string | null;
  escalationNote: string | null;
  appointmentAt?: string | null;
  appointmentNote?: string | null;
  appointmentSetById?: number | null;
  appointmentSetByName?: string | null;
  lostAt?: string | null;
  lostById?: number | null;
  lostByName?: string | null;
  lostReason?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  previousPurchases?: number;
  convertedAt: string | null;
  convertedById: number | null;
  convertedByName?: string | null;
  status:
    | "new"
    | "follow_up"
    | "visited"
    | "converted"
    | "processing"
    | "completed"
    | "exhausted"
    | "lost";
  salesOrderId: number | null;
  orderNo?: string | null;
  vehicleStage?: string | null;
  createdById: number | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type CorrectLeadDetailsApiArg = {
  id: number;
  leadDetailsRequest: LeadDetailsRequest;
};
export type CreateLeadQuotationApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  quotationNo: string;
  leadId: number | null;
  customerName?: string | null;
  customerMobile?: string | null;
  customerEmail?: string | null;
  ownerId: number;
  ownerName?: string | null;
  modelId: number;
  modelName?: string | null;
  variantCode: string | null;
  billTo: string | null;
  variant: string | null;
  color: string | null;
  quantity: number;
  unitPrice: string;
  discount: string;
  freightInsurance: string;
  withholdingTax: string;
  withholdingTaxNonFiler: string | null;
  totalAmount: string;
  bookingAmount: string | null;
  validUntil: string;
  deliveryDays: number | null;
  deliveryPeriod: string | null;
  paymentMode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  createdByName?: string | null;
  updatedById: number | null;
  updatedByName?: string | null;
};
export type CreateLeadQuotationApiArg = {
  id: number;
  quotationCreate: QuotationCreate;
};
export type GetLeadOrderVehicleApiResponse =
  /** status 200 Success */ LeadOrderVehicle;
export type GetLeadOrderVehicleApiArg = {
  id: number;
};
export type CreateLeadPpfFormApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  formNo: string;
  leadId: number | null;
  customerName?: string | null;
  customerMobile?: string | null;
  modelId?: number | null;
  modelName?: string | null;
  variant?: string | null;
  color?: string | null;
  ownerId: number;
  ownerName?: string | null;
  pboNo: string | null;
  chassisNo: string | null;
  engineNo: string | null;
  coverage: "full_body" | "front_package" | "partial" | "custom";
  coverageDetails: string | null;
  protectionPackage: ("nenotek_prime" | "proskin_platinum" | null) | null;
  customerEmail: string | null;
  customerAddress: string | null;
  filmBrand: string | null;
  finish: "gloss" | "matte";
  warrantyYears: number | null;
  amount: string;
  discount: string;
  totalAmount: string;
  advancePaid: string;
  installationDate: string | null;
  notes: string | null;
  extraFields: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  createdByName?: string | null;
  updatedById: number | null;
  updatedByName?: string | null;
};
export type CreateLeadPpfFormApiArg = {
  id: number;
  ppfFormCreate: PpfFormCreate;
};
export type SetLeadAppointmentApiResponse = /** status 200 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  ownerId: number;
  ownerName?: string | null;
  customerId: number | null;
  prospectName: string;
  prospectMobile: string;
  email: string | null;
  source:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  interestedModelId: number | null;
  modelName?: string | null;
  variant: string | null;
  preferredColor: string | null;
  expectedCloseDate: string | null;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  notes: string | null;
  paymentInstrument:
    | (
        | "pay_order"
        | "bank_draft"
        | "cheque"
        | "online_transfer"
        | "cash"
        | null
      )
    | null;
  paymentInstrumentRef: string | null;
  paymentInstrumentBank: string | null;
  paymentAmount: string | null;
  followUpCount: number;
  lastFollowUpAt: string | null;
  escalatedAt: string | null;
  escalatedById: number | null;
  escalatedByName?: string | null;
  escalationNote: string | null;
  appointmentAt?: string | null;
  appointmentNote?: string | null;
  appointmentSetById?: number | null;
  appointmentSetByName?: string | null;
  lostAt?: string | null;
  lostById?: number | null;
  lostByName?: string | null;
  lostReason?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  previousPurchases?: number;
  convertedAt: string | null;
  convertedById: number | null;
  convertedByName?: string | null;
  status:
    | "new"
    | "follow_up"
    | "visited"
    | "converted"
    | "processing"
    | "completed"
    | "exhausted"
    | "lost";
  salesOrderId: number | null;
  orderNo?: string | null;
  vehicleStage?: string | null;
  createdById: number | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type SetLeadAppointmentApiArg = {
  id: number;
  leadAppointmentRequest: LeadAppointmentRequest;
};
export type ReassignLeadApiResponse = /** status 200 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  ownerId: number;
  ownerName?: string | null;
  customerId: number | null;
  prospectName: string;
  prospectMobile: string;
  email: string | null;
  source:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  interestedModelId: number | null;
  modelName?: string | null;
  variant: string | null;
  preferredColor: string | null;
  expectedCloseDate: string | null;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  notes: string | null;
  paymentInstrument:
    | (
        | "pay_order"
        | "bank_draft"
        | "cheque"
        | "online_transfer"
        | "cash"
        | null
      )
    | null;
  paymentInstrumentRef: string | null;
  paymentInstrumentBank: string | null;
  paymentAmount: string | null;
  followUpCount: number;
  lastFollowUpAt: string | null;
  escalatedAt: string | null;
  escalatedById: number | null;
  escalatedByName?: string | null;
  escalationNote: string | null;
  appointmentAt?: string | null;
  appointmentNote?: string | null;
  appointmentSetById?: number | null;
  appointmentSetByName?: string | null;
  lostAt?: string | null;
  lostById?: number | null;
  lostByName?: string | null;
  lostReason?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  previousPurchases?: number;
  convertedAt: string | null;
  convertedById: number | null;
  convertedByName?: string | null;
  status:
    | "new"
    | "follow_up"
    | "visited"
    | "converted"
    | "processing"
    | "completed"
    | "exhausted"
    | "lost";
  salesOrderId: number | null;
  orderNo?: string | null;
  vehicleStage?: string | null;
  createdById: number | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type ReassignLeadApiArg = {
  id: number;
  reassignLeadRequest: ReassignLeadRequest;
};
export type ConvertLeadApiResponse = /** status 200 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  ownerId: number;
  ownerName?: string | null;
  customerId: number | null;
  prospectName: string;
  prospectMobile: string;
  email: string | null;
  source:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  interestedModelId: number | null;
  modelName?: string | null;
  variant: string | null;
  preferredColor: string | null;
  expectedCloseDate: string | null;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  notes: string | null;
  paymentInstrument:
    | (
        | "pay_order"
        | "bank_draft"
        | "cheque"
        | "online_transfer"
        | "cash"
        | null
      )
    | null;
  paymentInstrumentRef: string | null;
  paymentInstrumentBank: string | null;
  paymentAmount: string | null;
  followUpCount: number;
  lastFollowUpAt: string | null;
  escalatedAt: string | null;
  escalatedById: number | null;
  escalatedByName?: string | null;
  escalationNote: string | null;
  appointmentAt?: string | null;
  appointmentNote?: string | null;
  appointmentSetById?: number | null;
  appointmentSetByName?: string | null;
  lostAt?: string | null;
  lostById?: number | null;
  lostByName?: string | null;
  lostReason?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  previousPurchases?: number;
  convertedAt: string | null;
  convertedById: number | null;
  convertedByName?: string | null;
  status:
    | "new"
    | "follow_up"
    | "visited"
    | "converted"
    | "processing"
    | "completed"
    | "exhausted"
    | "lost";
  salesOrderId: number | null;
  orderNo?: string | null;
  vehicleStage?: string | null;
  createdById: number | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type ConvertLeadApiArg = {
  id: number;
  convertLeadRequest: ConvertLeadRequest;
};
export type RaiseSalesOrderApiResponse = /** status 201 Success */ {
  id: number;
  orderNo: string;
  pboNo: string | null;
  orderType: "pbo" | "cbo";
  dealershipId: number;
  branchId: number | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  leadId: number | null;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  bookingAmount: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  vehicleId: number | null;
  vehicleLabel?: string | null;
  vehicleStatus?:
    | (
        | "available"
        | "reserved"
        | "booked"
        | "in_transit"
        | "received"
        | "ready_for_delivery"
        | "delivered"
        | "transferred"
        | "hold"
        | null
      )
    | null;
  financingRef: string | null;
  paymentReference: string | null;
  vehicleVin?: string | null;
  vehicleEngineNo?: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  amountReceived?: string;
  balanceDue?: string;
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  clearanceRequestedAt?: string | null;
  clearanceRequestedByName?: string | null;
  clearanceRequestNote?: string | null;
  clearanceDecidedAt?: string | null;
  clearanceDecidedByName?: string | null;
  clearanceDecisionNote?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type RaiseSalesOrderApiArg = {
  id: number;
  raiseOrderRequest: RaiseOrderRequest;
};
export type CreateStandaloneQuotationApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  quotationNo: string;
  leadId: number | null;
  customerName?: string | null;
  customerMobile?: string | null;
  customerEmail?: string | null;
  ownerId: number;
  ownerName?: string | null;
  modelId: number;
  modelName?: string | null;
  variantCode: string | null;
  billTo: string | null;
  variant: string | null;
  color: string | null;
  quantity: number;
  unitPrice: string;
  discount: string;
  freightInsurance: string;
  withholdingTax: string;
  withholdingTaxNonFiler: string | null;
  totalAmount: string;
  bookingAmount: string | null;
  validUntil: string;
  deliveryDays: number | null;
  deliveryPeriod: string | null;
  paymentMode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  createdByName?: string | null;
  updatedById: number | null;
  updatedByName?: string | null;
};
export type CreateStandaloneQuotationApiArg = {
  standaloneQuotationCreate: StandaloneQuotationCreate;
};
export type GetQuotationDocumentApiResponse =
  /** status 200 Success */ QuotationDocument;
export type GetQuotationDocumentApiArg = {
  id: number;
};
export type CreateStandalonePpfFormApiResponse = /** status 201 Success */ {
  id: number;
  dealershipId: number;
  branchId: number | null;
  formNo: string;
  leadId: number | null;
  customerName?: string | null;
  customerMobile?: string | null;
  modelId?: number | null;
  modelName?: string | null;
  variant?: string | null;
  color?: string | null;
  ownerId: number;
  ownerName?: string | null;
  pboNo: string | null;
  chassisNo: string | null;
  engineNo: string | null;
  coverage: "full_body" | "front_package" | "partial" | "custom";
  coverageDetails: string | null;
  protectionPackage: ("nenotek_prime" | "proskin_platinum" | null) | null;
  customerEmail: string | null;
  customerAddress: string | null;
  filmBrand: string | null;
  finish: "gloss" | "matte";
  warrantyYears: number | null;
  amount: string;
  discount: string;
  totalAmount: string;
  advancePaid: string;
  installationDate: string | null;
  notes: string | null;
  extraFields: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  createdByName?: string | null;
  updatedById: number | null;
  updatedByName?: string | null;
};
export type CreateStandalonePpfFormApiArg = {
  standalonePpfCreate: StandalonePpfCreate;
};
export type GetPpfDocumentApiResponse = /** status 200 Success */ PpfDocument;
export type GetPpfDocumentApiArg = {
  id: number;
};
export type GetDocumentTemplateApiResponse =
  /** status 200 Success */ DocumentTemplate;
export type GetDocumentTemplateApiArg = {
  kind: "quotation" | "ppf" | "leave";
  dealershipId: number;
};
export type SaveDocumentTemplateApiResponse =
  /** status 200 Success */ DocumentTemplate;
export type SaveDocumentTemplateApiArg = {
  kind: "quotation" | "ppf" | "leave";
  documentTemplateUpdate: DocumentTemplateUpdate;
};
export type ImportVariantCodesApiResponse =
  /** status 200 Success */ VariantImportResult;
export type ImportVariantCodesApiArg = {
  variantImport: VariantImport;
};
export type GetSalesDashboardApiResponse =
  /** status 200 Success */ SalesDashboard;
export type GetSalesDashboardApiArg = {
  days?: number;
  from?: string;
  to?: string;
  ownerId?: number;
};
export type GetSalesActionItemsApiResponse =
  /** status 200 Success */ ActionItem[];
export type GetSalesActionItemsApiArg = void;
export type GetSalesTodayApiResponse = /** status 200 Success */ SalesToday;
export type GetSalesTodayApiArg = {
  dealershipId?: number;
};
export type ListSalesTeamMembersApiResponse =
  /** status 200 Success */ SalesTeamMember[];
export type ListSalesTeamMembersApiArg = {
  dealershipId: number;
};
export type GetSalesTeamReportApiResponse =
  /** status 200 Success */ SalesTeamReport;
export type GetSalesTeamReportApiArg = {
  dealershipId: number;
  from?: string;
  to?: string;
};
export type GetSalesTrackRecordApiResponse =
  /** status 200 Success */ TrackRecord;
export type GetSalesTrackRecordApiArg = {
  dealershipId: number;
  year: number;
  month?: number;
  from?: string;
  to?: string;
  userId?: number;
  group?: "salespeople" | "cros";
  details?: "true" | "false";
};
export type GetLeadsToHandOverApiResponse =
  /** status 200 Success */ LeadsToHandOver;
export type GetLeadsToHandOverApiArg = {
  dealershipId: number;
  userId: number;
};
export type HandOverLeadsApiResponse = /** status 200 Success */ HandOverResult;
export type HandOverLeadsApiArg = {
  handOverLeadsRequest: HandOverLeadsRequest;
};
export type ListOrderPaymentsApiResponse =
  /** status 200 Success */ OrderPayments;
export type ListOrderPaymentsApiArg = {
  id: number;
};
export type AddOrderPaymentApiResponse =
  /** status 201 Success */ OrderPayments;
export type AddOrderPaymentApiArg = {
  id: number;
  orderPaymentCreate: OrderPaymentCreate;
};
export type RemoveOrderPaymentApiResponse =
  /** status 200 Success */ OrderPayments;
export type RemoveOrderPaymentApiArg = {
  id: number;
  paymentId: number;
};
export type RequestDeliveryClearanceApiResponse = /** status 200 Success */ {
  id: number;
  orderNo: string;
  pboNo: string | null;
  orderType: "pbo" | "cbo";
  dealershipId: number;
  branchId: number | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  leadId: number | null;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  bookingAmount: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  vehicleId: number | null;
  vehicleLabel?: string | null;
  vehicleStatus?:
    | (
        | "available"
        | "reserved"
        | "booked"
        | "in_transit"
        | "received"
        | "ready_for_delivery"
        | "delivered"
        | "transferred"
        | "hold"
        | null
      )
    | null;
  financingRef: string | null;
  paymentReference: string | null;
  vehicleVin?: string | null;
  vehicleEngineNo?: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  amountReceived?: string;
  balanceDue?: string;
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  clearanceRequestedAt?: string | null;
  clearanceRequestedByName?: string | null;
  clearanceRequestNote?: string | null;
  clearanceDecidedAt?: string | null;
  clearanceDecidedByName?: string | null;
  clearanceDecisionNote?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type RequestDeliveryClearanceApiArg = {
  id: number;
  clearanceRequest: ClearanceRequest;
};
export type DecideDeliveryClearanceApiResponse = /** status 200 Success */ {
  id: number;
  orderNo: string;
  pboNo: string | null;
  orderType: "pbo" | "cbo";
  dealershipId: number;
  branchId: number | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  leadId: number | null;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  bookingAmount: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  vehicleId: number | null;
  vehicleLabel?: string | null;
  vehicleStatus?:
    | (
        | "available"
        | "reserved"
        | "booked"
        | "in_transit"
        | "received"
        | "ready_for_delivery"
        | "delivered"
        | "transferred"
        | "hold"
        | null
      )
    | null;
  financingRef: string | null;
  paymentReference: string | null;
  vehicleVin?: string | null;
  vehicleEngineNo?: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  amountReceived?: string;
  balanceDue?: string;
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  clearanceRequestedAt?: string | null;
  clearanceRequestedByName?: string | null;
  clearanceRequestNote?: string | null;
  clearanceDecidedAt?: string | null;
  clearanceDecidedByName?: string | null;
  clearanceDecisionNote?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type DecideDeliveryClearanceApiArg = {
  id: number;
  clearanceDecision: ClearanceDecision;
};
export type SetOrderVehicleApiResponse = /** status 200 Success */ {
  id: number;
  orderNo: string;
  pboNo: string | null;
  orderType: "pbo" | "cbo";
  dealershipId: number;
  branchId: number | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  leadId: number | null;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  bookingAmount: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  vehicleId: number | null;
  vehicleLabel?: string | null;
  vehicleStatus?:
    | (
        | "available"
        | "reserved"
        | "booked"
        | "in_transit"
        | "received"
        | "ready_for_delivery"
        | "delivered"
        | "transferred"
        | "hold"
        | null
      )
    | null;
  financingRef: string | null;
  paymentReference: string | null;
  vehicleVin?: string | null;
  vehicleEngineNo?: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  amountReceived?: string;
  balanceDue?: string;
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  clearanceRequestedAt?: string | null;
  clearanceRequestedByName?: string | null;
  clearanceRequestNote?: string | null;
  clearanceDecidedAt?: string | null;
  clearanceDecidedByName?: string | null;
  clearanceDecisionNote?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type SetOrderVehicleApiArg = {
  id: number;
  orderVehicleRequest: OrderVehicleRequest;
};
export type ListAllocatableVehiclesApiResponse =
  /** status 200 Success */ AllocatableVehicle[];
export type ListAllocatableVehiclesApiArg = {
  id: number;
};
export type AllocateVehicleApiResponse = /** status 200 Success */ {
  id: number;
  orderNo: string;
  pboNo: string | null;
  orderType: "pbo" | "cbo";
  dealershipId: number;
  branchId: number | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  leadId: number | null;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  bookingAmount: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  vehicleId: number | null;
  vehicleLabel?: string | null;
  vehicleStatus?:
    | (
        | "available"
        | "reserved"
        | "booked"
        | "in_transit"
        | "received"
        | "ready_for_delivery"
        | "delivered"
        | "transferred"
        | "hold"
        | null
      )
    | null;
  financingRef: string | null;
  paymentReference: string | null;
  vehicleVin?: string | null;
  vehicleEngineNo?: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  amountReceived?: string;
  balanceDue?: string;
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  clearanceRequestedAt?: string | null;
  clearanceRequestedByName?: string | null;
  clearanceRequestNote?: string | null;
  clearanceDecidedAt?: string | null;
  clearanceDecidedByName?: string | null;
  clearanceDecisionNote?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type AllocateVehicleApiArg = {
  id: number;
  allocationRequest: AllocationRequest;
};
export type ReleaseVehicleApiResponse = /** status 200 Success */ {
  id: number;
  orderNo: string;
  pboNo: string | null;
  orderType: "pbo" | "cbo";
  dealershipId: number;
  branchId: number | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  leadId: number | null;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  bookingAmount: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  vehicleId: number | null;
  vehicleLabel?: string | null;
  vehicleStatus?:
    | (
        | "available"
        | "reserved"
        | "booked"
        | "in_transit"
        | "received"
        | "ready_for_delivery"
        | "delivered"
        | "transferred"
        | "hold"
        | null
      )
    | null;
  financingRef: string | null;
  paymentReference: string | null;
  vehicleVin?: string | null;
  vehicleEngineNo?: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  amountReceived?: string;
  balanceDue?: string;
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  clearanceRequestedAt?: string | null;
  clearanceRequestedByName?: string | null;
  clearanceRequestNote?: string | null;
  clearanceDecidedAt?: string | null;
  clearanceDecidedByName?: string | null;
  clearanceDecisionNote?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type ReleaseVehicleApiArg = {
  id: number;
};
export type AdvanceVehicleStatusApiResponse = /** status 200 Success */ {
  id: number;
  orderNo: string;
  pboNo: string | null;
  orderType: "pbo" | "cbo";
  dealershipId: number;
  branchId: number | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  leadId: number | null;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  bookingAmount: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  vehicleId: number | null;
  vehicleLabel?: string | null;
  vehicleStatus?:
    | (
        | "available"
        | "reserved"
        | "booked"
        | "in_transit"
        | "received"
        | "ready_for_delivery"
        | "delivered"
        | "transferred"
        | "hold"
        | null
      )
    | null;
  financingRef: string | null;
  paymentReference: string | null;
  vehicleVin?: string | null;
  vehicleEngineNo?: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  amountReceived?: string;
  balanceDue?: string;
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  clearanceRequestedAt?: string | null;
  clearanceRequestedByName?: string | null;
  clearanceRequestNote?: string | null;
  clearanceDecidedAt?: string | null;
  clearanceDecidedByName?: string | null;
  clearanceDecisionNote?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type AdvanceVehicleStatusApiArg = {
  id: number;
  advanceVehicleStatusRequest: AdvanceVehicleStatusRequest;
};
export type ListOrderDeliveriesApiResponse = /** status 200 Success */ {
  id: number;
  deliveryNo: string;
  dealershipId: number;
  branchId: number | null;
  salesOrderId: number;
  orderNo?: string;
  vehicleId: number;
  vehicleLabel?: string;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  scheduledDate: string;
  deliveredOn: string | null;
  deliveredAt: string | null;
  odometerKm: number | null;
  documentsHandedOver: (
    | "invoice"
    | "registration_book"
    | "warranty_card"
    | "owners_manual"
    | "insurance_cover_note"
  )[];
  accessoriesHandedOver: string[];
  checklist: ("pdi_done" | "documents_ready" | "accessories_fitted")[];
  customerAcknowledged: boolean;
  customerAcknowledgedAt: string | null;
  notes: string | null;
  status: "scheduled" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
}[];
export type ListOrderDeliveriesApiArg = {
  id: number;
};
export type ScheduleDeliveryApiResponse = /** status 201 Success */ {
  id: number;
  deliveryNo: string;
  dealershipId: number;
  branchId: number | null;
  salesOrderId: number;
  orderNo?: string;
  vehicleId: number;
  vehicleLabel?: string;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  scheduledDate: string;
  deliveredOn: string | null;
  deliveredAt: string | null;
  odometerKm: number | null;
  documentsHandedOver: (
    | "invoice"
    | "registration_book"
    | "warranty_card"
    | "owners_manual"
    | "insurance_cover_note"
  )[];
  accessoriesHandedOver: string[];
  checklist: ("pdi_done" | "documents_ready" | "accessories_fitted")[];
  customerAcknowledged: boolean;
  customerAcknowledgedAt: string | null;
  notes: string | null;
  status: "scheduled" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type ScheduleDeliveryApiArg = {
  id: number;
  scheduleDeliveryRequest: ScheduleDeliveryRequest;
};
export type DeliverOrderApiResponse = /** status 200 Success */ {
  id: number;
  deliveryNo: string;
  dealershipId: number;
  branchId: number | null;
  salesOrderId: number;
  orderNo?: string;
  vehicleId: number;
  vehicleLabel?: string;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  scheduledDate: string;
  deliveredOn: string | null;
  deliveredAt: string | null;
  odometerKm: number | null;
  documentsHandedOver: (
    | "invoice"
    | "registration_book"
    | "warranty_card"
    | "owners_manual"
    | "insurance_cover_note"
  )[];
  accessoriesHandedOver: string[];
  checklist: ("pdi_done" | "documents_ready" | "accessories_fitted")[];
  customerAcknowledged: boolean;
  customerAcknowledgedAt: string | null;
  notes: string | null;
  status: "scheduled" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type DeliverOrderApiArg = {
  id: number;
  completeDeliveryRequest: CompleteDeliveryRequest;
};
export type ReceiveStockVehicleApiResponse =
  /** status 201 Success */ StockVehicle;
export type ReceiveStockVehicleApiArg = {
  stockVehicleCreate: StockVehicleCreate;
};
export type ListStockVehiclesApiResponse =
  /** status 200 Success */ StockVehiclePage;
export type ListStockVehiclesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
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
  modelId?: number;
  dealershipId?: number;
  allocated?: "true" | "false";
};
export type GetDeliveryNoteApiResponse = /** status 200 Success */ DeliveryNote;
export type GetDeliveryNoteApiArg = {
  id: number;
};
export type CompleteDeliveryApiResponse = /** status 200 Success */ {
  id: number;
  deliveryNo: string;
  dealershipId: number;
  branchId: number | null;
  salesOrderId: number;
  orderNo?: string;
  vehicleId: number;
  vehicleLabel?: string;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  scheduledDate: string;
  deliveredOn: string | null;
  deliveredAt: string | null;
  odometerKm: number | null;
  documentsHandedOver: (
    | "invoice"
    | "registration_book"
    | "warranty_card"
    | "owners_manual"
    | "insurance_cover_note"
  )[];
  accessoriesHandedOver: string[];
  checklist: ("pdi_done" | "documents_ready" | "accessories_fitted")[];
  customerAcknowledged: boolean;
  customerAcknowledgedAt: string | null;
  notes: string | null;
  status: "scheduled" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type CompleteDeliveryApiArg = {
  id: number;
  completeDeliveryRequest: CompleteDeliveryRequest;
};
export type GetDeliveryPipelineApiResponse =
  /** status 200 Success */ DeliveryPipeline;
export type GetDeliveryPipelineApiArg = {
  stage?: "waiting" | "in_transit" | "received" | "scheduled" | "delivered";
  dealershipId?: number;
  q?: string;
  overdue?: "true" | "false";
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};
export type GetDeliveryReportApiResponse =
  /** status 200 Success */ DeliveryReport;
export type GetDeliveryReportApiArg = {
  dealershipId?: number;
  from?: string;
  to?: string;
};
export type ListLeaveApplicationsApiResponse =
  /** status 200 Success */ LeaveApplicationPage;
export type ListLeaveApplicationsApiArg = {
  dealershipId?: number;
  status?: "submitted" | "approved" | "rejected";
  mine?: "true" | "false";
  page?: number;
  pageSize?: number;
};
export type ApplyForLeaveApiResponse =
  /** status 201 Success */ LeaveApplication;
export type ApplyForLeaveApiArg = {
  leaveApplicationCreate: LeaveApplicationCreate;
};
export type GetLeaveApplicationApiResponse =
  /** status 200 Success */ LeaveApplication;
export type GetLeaveApplicationApiArg = {
  id: number;
};
export type DecideLeaveApplicationApiResponse =
  /** status 200 Success */ LeaveApplication;
export type DecideLeaveApplicationApiArg = {
  id: number;
  leaveDecision: LeaveDecision;
};
export type GetLeaveDocumentApiResponse =
  /** status 200 Success */ LeaveDocument;
export type GetLeaveDocumentApiArg = {
  id: number;
};
export type ListLeadsApiResponse = /** status 200 Success */ LeadPage;
export type ListLeadsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?:
    | "new"
    | "follow_up"
    | "visited"
    | "converted"
    | "processing"
    | "completed"
    | "exhausted"
    | "lost";
  ownerId?: number;
  source?: string;
  escalated?: "true" | "false";
  open?: "true" | "false";
  convertedFrom?: string;
  convertedTo?: string;
  createdBefore?: string;
  vehicleStage?:
    | "available"
    | "reserved"
    | "booked"
    | "in_transit"
    | "received"
    | "ready_for_delivery"
    | "delivered"
    | "transferred"
    | "hold";
  createdOn?: string;
  activityFrom?: string;
  activityTo?: string;
  lost?: "true" | "false";
  appointmentOn?: string;
  upcomingAppointment?: "true" | "false";
  dealershipId?: number;
};
export type CreateLeadApiResponse = /** status 201 Success */ Lead;
export type CreateLeadApiArg = {
  leadCreate: LeadCreate;
};
export type GetLeadWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetLeadWorkflowApiArg = void;
export type GetLeadApiResponse = /** status 200 Success */ Lead;
export type GetLeadApiArg = {
  id: number;
};
export type UpdateLeadApiResponse = /** status 200 Success */ Lead;
export type UpdateLeadApiArg = {
  id: number;
  leadUpdate: LeadUpdate;
};
export type GetLeadHistoryApiResponse = /** status 200 Success */ EntityHistory;
export type GetLeadHistoryApiArg = {
  id: number;
};
export type TransitionLeadApiResponse = /** status 200 Success */ Lead;
export type TransitionLeadApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type ListSalesOrdersApiResponse =
  /** status 200 Success */ SalesOrderPage;
export type ListSalesOrdersApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  orderType?: "pbo" | "cbo";
  customerId?: number;
  salespersonId?: number;
  modelId?: number;
  leadId?: number;
  live?: "true" | "false";
  awaitingApproval?: "true" | "false";
  vehicleStage?:
    | "available"
    | "reserved"
    | "booked"
    | "in_transit"
    | "received"
    | "ready_for_delivery"
    | "delivered"
    | "transferred"
    | "hold";
  hasVehicle?: "true" | "false";
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  bookedFrom?: string;
  bookedTo?: string;
  dealershipId?: number;
};
export type CreateSalesOrderApiResponse = /** status 201 Success */ SalesOrder;
export type CreateSalesOrderApiArg = {
  salesOrderCreate: SalesOrderCreate;
};
export type GetSalesOrderWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetSalesOrderWorkflowApiArg = void;
export type GetSalesOrderApiResponse = /** status 200 Success */ SalesOrder;
export type GetSalesOrderApiArg = {
  id: number;
};
export type UpdateSalesOrderApiResponse = /** status 200 Success */ SalesOrder;
export type UpdateSalesOrderApiArg = {
  id: number;
  salesOrderUpdate: SalesOrderUpdate;
};
export type GetSalesOrderHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetSalesOrderHistoryApiArg = {
  id: number;
};
export type TransitionSalesOrderApiResponse =
  /** status 200 Success */ SalesOrder;
export type TransitionSalesOrderApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type ListDeliveriesApiResponse = /** status 200 Success */ DeliveryPage;
export type ListDeliveriesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  status?: "scheduled" | "delivered" | "cancelled";
  salesOrderId?: number;
  due?: "true" | "false";
  deliveredFrom?: string;
  deliveredTo?: string;
  dealershipId?: number;
};
export type GetDeliveryWorkflowApiResponse =
  /** status 200 Success */ WorkflowDefinition;
export type GetDeliveryWorkflowApiArg = void;
export type GetDeliveryApiResponse = /** status 200 Success */ Delivery;
export type GetDeliveryApiArg = {
  id: number;
};
export type GetDeliveryHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetDeliveryHistoryApiArg = {
  id: number;
};
export type TransitionDeliveryApiResponse = /** status 200 Success */ Delivery;
export type TransitionDeliveryApiArg = {
  id: number;
  body: {
    action: string;
    comment?: string;
  };
};
export type GetStockVehicleApiResponse = /** status 200 Success */ StockVehicle;
export type GetStockVehicleApiArg = {
  id: number;
};
export type UpdateStockVehicleApiResponse =
  /** status 200 Success */ StockVehicle;
export type UpdateStockVehicleApiArg = {
  id: number;
  stockVehicleUpdate: StockVehicleUpdate;
};
export type GetStockVehicleHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetStockVehicleHistoryApiArg = {
  id: number;
};
export type ListQuotationsApiResponse = /** status 200 Success */ QuotationPage;
export type ListQuotationsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  leadId?: number;
  ownerId?: number;
  createdFrom?: string;
  createdTo?: string;
  dealershipId?: number;
};
export type GetQuotationApiResponse = /** status 200 Success */ Quotation;
export type GetQuotationApiArg = {
  id: number;
};
export type UpdateQuotationApiResponse = /** status 200 Success */ Quotation;
export type UpdateQuotationApiArg = {
  id: number;
  quotationUpdate: QuotationUpdate;
};
export type GetQuotationHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetQuotationHistoryApiArg = {
  id: number;
};
export type ListPpfFormsApiResponse = /** status 200 Success */ Ppf20FormPage;
export type ListPpfFormsApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  leadId?: number;
  ownerId?: number;
  createdFrom?: string;
  createdTo?: string;
  dealershipId?: number;
};
export type GetPpfFormApiResponse = /** status 200 Success */ PpfForm;
export type GetPpfFormApiArg = {
  id: number;
};
export type UpdatePpfFormApiResponse = /** status 200 Success */ PpfForm;
export type UpdatePpfFormApiArg = {
  id: number;
  ppfFormUpdate: PpfFormUpdate;
};
export type GetPpfFormHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetPpfFormHistoryApiArg = {
  id: number;
};
export type ListVariantCodesApiResponse =
  /** status 200 Success */ Variant20CodePage;
export type ListVariantCodesApiArg = {
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  dealershipId?: number;
  modelId?: number;
  isActive?: "true" | "false";
};
export type CreateVariantCodeApiResponse =
  /** status 201 Success */ VariantCode;
export type CreateVariantCodeApiArg = {
  vehicleVariantCreate: VehicleVariantCreate;
};
export type GetVariantCodeApiResponse = /** status 200 Success */ VariantCode;
export type GetVariantCodeApiArg = {
  id: number;
};
export type UpdateVariantCodeApiResponse =
  /** status 200 Success */ VariantCode;
export type UpdateVariantCodeApiArg = {
  id: number;
  vehicleVariantUpdate: VehicleVariantUpdate;
};
export type GetVariantCodeHistoryApiResponse =
  /** status 200 Success */ EntityHistory;
export type GetVariantCodeHistoryApiArg = {
  id: number;
};
export type LeadSummary = {
  total: number;
  byStatus: {
    [key: string]: number;
  };
};
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: any | null;
  };
};
export type EscalationResult = {
  leadId: number;
  escalatedAt: string;
};
export type EscalateDuplicateRequest = {
  dealershipId: number;
  prospectMobile: string;
  note?: string | null;
};
export type LeadFollowUp = {
  id: number;
  leadId: number;
  outcome: "interested" | "not_interested" | "visited";
  remarks: string | null;
  createdById: number;
  createdByName: string | null;
  createdAt: string;
  comments?: {
    id: number;
    body: string;
    createdById: number;
    createdByName: string | null;
    createdAt: string;
  }[];
};
export type LeadFollowUpCreate = {
  outcome: "interested" | "not_interested" | "visited";
  remarks?: string | null;
  markLost?: boolean;
};
export type FollowUpCommentRequest = {
  body: string;
};
export type LeadDetailsRequest = {
  prospectName?: string;
  prospectMobile?: string;
  email?: (string | null) | "" | (any | null);
  preferredColor?: string | null;
  variant?: string;
  notes?: string | null;
};
export type QuotationCreate = {
  unitPrice?: string;
  discount?: string;
  bookingAmount?: string;
  modelId?: number;
  variant?: string | null;
  color?: string | null;
  validDays?: number;
  notes?: string | null;
  variantCode?: string | null;
  billTo?: string | null;
  quantity?: number;
  freightInsurance?: string;
  withholdingTax?: string;
  withholdingTaxNonFiler?: string;
  deliveryDays?: number | null;
  deliveryPeriod?: string | null;
  paymentMode?: string | null;
};
export type LeadOrderVehicle = {
  orderNo: string | null;
  pboNo: string | null;
  chassisNo: string | null;
  engineNo: string | null;
};
export type PpfFormCreate = {
  pboNo?: string | null;
  chassisNo?: string | null;
  engineNo?: string | null;
  coverage: "full_body" | "front_package" | "partial" | "custom";
  coverageDetails?: string | null;
  protectionPackage: "nenotek_prime" | "proskin_platinum";
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  filmBrand?: string | null;
  finish?: "gloss" | "matte";
  warrantyYears?: number | null;
  amount: string;
  discount?: string;
  advancePaid?: string;
  installationDate?: string | null;
  notes?: string | null;
  extraFields?: {
    [key: string]: string;
  };
};
export type LeadAppointmentRequest = {
  appointmentAt: string | null;
  note?: string | null;
};
export type ReassignLeadRequest = {
  ownerId: number;
  note?: string | null;
};
export type ConvertLeadRequest = {
  prospectName?: string;
  prospectMobile?: string;
  interestedModelId: number;
  preferredColor: string;
  variant: string;
  email: string;
  paymentInstrument:
    "pay_order" | "bank_draft" | "cheque" | "online_transfer" | "cash";
  paymentInstrumentRef: string;
  paymentInstrumentBank?: string | null;
  paymentAmount?: string;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  customerCnic: string;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  notes?: string | null;
};
export type RaiseOrderRequest = {
  orderType?: "pbo" | "cbo";
  pboNo: string;
  branchId?: number | null;
  unitPrice: string;
  discount?: string;
  bookingAmount?: string;
  paymentReference?: string | null;
  customerCnic?: string;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  notes?: string | null;
};
export type StandaloneQuotationCreate = QuotationCreate & {
  dealershipId: number;
  customerName: string;
  customerMobile: string;
  customerEmail?: string | null;
};
export type DocumentTemplate = {
  dealershipId: number;
  kind: "quotation" | "ppf" | "leave";
  companyName: string;
  refPrefix?: string | null;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  deliveryNotes: string[];
  deliveryStation?: string | null;
  defaultPaymentMode?: string | null;
  defaultValidityDays: number;
  defaultDeliveryDays?: number | null;
  highlightLine?: string | null;
  standardEquipment?: string | null;
  terms: string[];
  closingLines: string[];
  signOff: string[];
  title?: string | null;
  fieldLabels?: {
    [key: string]: string;
  };
  hiddenFields?: (
    | "email"
    | "phone"
    | "vehicle"
    | "salesExecutive"
    | "promiseDate"
    | "ppf"
    | "notes"
  )[];
  customFields?: string[];
  isDefault: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
};
export type QuotationDocument = {
  quotationNo: string;
  validUntil: string;
  variantCode: string | null;
  billTo: string | null;
  deliveryDays: number | null;
  deliveryPeriod: string | null;
  paymentMode: string | null;
  template: DocumentTemplate;
  issuedAt: string;
  dealership: {
    name: string;
    code: string;
    brand: string;
    address: string | null;
    city: string | null;
    phone: string | null;
  };
  customer: {
    name: string;
    mobile: string;
    email: string | null;
    address?: string | null;
  };
  salesperson: {
    name: string;
    phone: string | null;
    email: string;
  };
  vehicle: {
    model: string;
    variant: string | null;
    color: string | null;
    vin: string | null;
    engineNo: string | null;
  };
  orderNo: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  updatedAt: string;
  notes: string | null;
  pricing: {
    quantity: number;
    unitPrice: string;
    discount: string;
    freightInsurance: string;
    withholdingTax: string;
    withholdingTaxNonFiler: string | null;
    total: string;
    bookingAmount: string | null;
  };
};
export type StandalonePpfCreate = PpfFormCreate & {
  dealershipId: number;
  customerMobile: string;
  modelId: number;
  variant?: string | null;
  color?: string | null;
};
export type PpfDocument = {
  formNo: string;
  pboNo: string | null;
  template: DocumentTemplate;
  ppfTemplate: DocumentTemplate;
  extraFields: {
    [key: string]: string;
  };
  issuedAt: string;
  dealership: {
    name: string;
    code: string;
    brand: string;
    address: string | null;
    city: string | null;
    phone: string | null;
  };
  customer: {
    name: string;
    mobile: string;
    email: string | null;
    address?: string | null;
  };
  salesperson: {
    name: string;
    phone: string | null;
    email: string;
  };
  vehicle: {
    model: string;
    variant: string | null;
    color: string | null;
    vin: string | null;
    engineNo: string | null;
  };
  orderNo: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  updatedAt: string;
  notes: string | null;
  coverage: "full_body" | "front_package" | "partial" | "custom";
  coverageDetails: string | null;
  protectionPackage: ("nenotek_prime" | "proskin_platinum" | null) | null;
  filmBrand: string | null;
  finish: "gloss" | "matte";
  warrantyYears: number | null;
  installationDate: string | null;
  pricing: {
    amount: string;
    discount: string;
    total: string;
    advancePaid: string;
    balance: string;
  };
};
export type DocumentTemplateUpdate = {
  dealershipId: number;
  companyName: string;
  refPrefix?: string | null;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  deliveryNotes: string[];
  deliveryStation?: string | null;
  defaultPaymentMode?: string | null;
  defaultValidityDays: number;
  defaultDeliveryDays?: number | null;
  highlightLine?: string | null;
  standardEquipment?: string | null;
  terms: string[];
  closingLines: string[];
  signOff: string[];
  title?: string | null;
  fieldLabels?: {
    [key: string]: string;
  };
  hiddenFields?: (
    | "email"
    | "phone"
    | "vehicle"
    | "salesExecutive"
    | "promiseDate"
    | "ppf"
    | "notes"
  )[];
  customFields?: string[];
};
export type VariantImportResult = {
  added: number;
  updated: number;
  unchanged: number;
};
export type VariantImport = {
  dealershipId: number;
  rows: {
    code: string;
    description: string;
  }[];
};
export type SalesDashboard = {
  period: {
    from: string;
    to: string;
    days: number;
  };
  leads?: {
    byStatus: {
      [key: string]: number;
    };
    total: number;
    loggedInPeriod: number;
    open: number;
    loggedToday: number;
    escalatedOpen: number;
    myFollowUpsToday: number;
    daily: {
      date: string;
      logged: number;
      converted: number;
    }[];
  };
  orders?: {
    byStatus: {
      [key: string]: number;
    };
    awaitingVehicle: number;
  };
  stock?: {
    byStatus: {
      [key: string]: number;
    };
    free: number;
  };
  deliveries?: {
    scheduled: number;
    deliveredInPeriod: number;
  };
};
export type ActionItem = {
  key: string;
  title: string;
  count: number;
  to: string;
  urgent: boolean;
};
export type SalesToday = {
  today: string;
  tomorrow: string;
  appointmentsToday: {
    leadId: number;
    customerName: string;
    mobile: string;
    at: string;
    note: string | null;
    salespersonName: string | null;
    status: string;
  }[];
  appointmentsTomorrow: {
    leadId: number;
    customerName: string;
    mobile: string;
    at: string;
    note: string | null;
    salespersonName: string | null;
    status: string;
  }[];
  deliveriesToday: {
    orderId: number;
    orderNo: string;
    leadId: number | null;
    customerName: string | null;
    model: string | null;
    scheduledDate: string;
    deliveryId: number;
    clearanceStatus: "none" | "requested" | "approved" | "rejected";
    salespersonName: string | null;
  }[];
  deliveriesTomorrow: {
    orderId: number;
    orderNo: string;
    leadId: number | null;
    customerName: string | null;
    model: string | null;
    scheduledDate: string;
    deliveryId: number;
    clearanceStatus: "none" | "requested" | "approved" | "rejected";
    salespersonName: string | null;
  }[];
};
export type SalesTeamMember = {
  id: number;
  fullName: string;
  sellsCars: boolean;
  takesLeads: boolean;
};
export type SalesTeamReport = {
  dealershipId: number;
  period: {
    from: string;
    to: string;
  };
  totals: {
    leads: number;
    walkIns: number;
    converted: number;
    ordersRaised: number;
    ordersCompleted: number;
    salespeopleWithOrders: number;
  };
  members: {
    userId: number;
    fullName: string;
    roles: string;
    leads: number;
    walkIns: number;
    followUps: number;
    converted: number;
    escalationsConverted: number;
    ordersRaised: number;
    ordersCompleted: number;
  }[];
  daily: {
    date: string;
    walkIns: number;
    leads: number;
    converted: number;
  }[];
};
export type TrackRecord = {
  dealershipId: number;
  year: number;
  month: number | null;
  from: string | null;
  to: string | null;
  scope: "team" | "salespeople" | "own";
  people: {
    userId: number;
    fullName: string;
    kind: "salesperson" | "cro" | "leader";
  }[];
  userId: number | null;
  group: ("salespeople" | "cros" | null) | null;
  totals: {
    leadsLogged: number;
    converted: number;
    carsBooked: number;
    carsDelivered: number;
    ppfSold: number;
    ppfAmount: string;
    ppfAdvance: string;
    quotations: number;
  };
  members: {
    userId: number;
    fullName: string;
    isActive: boolean;
    leadsLogged: number;
    converted: number;
    carsBooked: number;
    carsDelivered: number;
    ppfSold: number;
    ppfAmount: string;
    ppfAdvance: string;
    quotations: number;
  }[];
  months: {
    month: string;
    leadsLogged: number;
    converted: number;
    carsBooked: number;
    carsDelivered: number;
    ppfSold: number;
    ppfAmount: string;
    ppfAdvance: string;
    quotations: number;
  }[];
  details?: {
    leads: {
      userId: number;
      customer: string;
      phone: string;
      vehicle: string | null;
      source: string;
      status: string;
      loggedOn: string;
      convertedOn: string | null;
      enteredBy: string | null;
      convertedBy: string | null;
    }[];
    converted: {
      userId: number;
      customer: string;
      phone: string;
      vehicle: string | null;
      source: string;
      status: string;
      loggedOn: string;
      convertedOn: string | null;
      enteredBy: string | null;
      convertedBy: string | null;
    }[];
    ppf: {
      userId: number;
      formNo: string;
      customer: string;
      phone: string;
      soldOn: string;
      coverage: string;
      price: string;
      paid: string;
      unpaid: string;
    }[];
  };
};
export type LeadsToHandOver = {
  open: number;
  inProgress: number;
};
export type HandOverResult = {
  moved: number;
  toName: string;
};
export type HandOverLeadsRequest = {
  dealershipId: number;
  fromUserId: number;
  toUserId: number;
  includeInProgress?: boolean;
};
export type OrderPayments = {
  total: string;
  received: string;
  balance: string;
  items: {
    id: number;
    kind: "booking" | "partial" | "final";
    amount: string;
    instrument:
      "pay_order" | "bank_draft" | "cheque" | "online_transfer" | "cash";
    reference: string | null;
    bank: string | null;
    receivedOn: string;
    note: string | null;
    createdAt: string;
    createdByName: string | null;
  }[];
};
export type OrderPaymentCreate = {
  kind: "booking" | "partial" | "final";
  amount: string;
  instrument:
    "pay_order" | "bank_draft" | "cheque" | "online_transfer" | "cash";
  reference?: string | null;
  bank?: string | null;
  receivedOn: string;
  note?: string | null;
};
export type ClearanceRequest = {
  note?: string | null;
};
export type ClearanceDecision = {
  approve: boolean;
  note?: string | null;
};
export type OrderVehicleRequest = {
  vin?: string | null;
  engineNo?: string | null;
  registrationNo?: string | null;
  color?: string | null;
  modelYear?: number | null;
};
export type AllocatableVehicle = {
  id: number;
  vin: string | null;
  engineNo: string | null;
  registrationNo: string | null;
  variant: string | null;
  color: string | null;
  modelYear: number | null;
};
export type AllocationRequest = {
  vehicleId: number;
};
export type AdvanceVehicleStatusRequest = {
  status: "booked" | "in_transit" | "received" | "ready_for_delivery" | "hold";
};
export type ScheduleDeliveryRequest = {
  scheduledDate: string;
  branchId?: number | null;
  notes?: string | null;
};
export type CompleteDeliveryRequest = {
  deliveredOn?: string;
  odometerKm: number;
  registrationNo?: string | null;
  documentsHandedOver?: (
    | "invoice"
    | "registration_book"
    | "warranty_card"
    | "owners_manual"
    | "insurance_cover_note"
  )[];
  accessoriesHandedOver?: string[];
  checklist: ("pdi_done" | "documents_ready" | "accessories_fitted")[];
  customerAcknowledged: boolean;
  notes?: string | null;
};
export type StockVehicle = {
  id: number;
  vin: string | null;
  engineNo: string | null;
  registrationNo: string | null;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  modelYear: number | null;
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
  notes: string | null;
  dealershipId?: number | null;
  dealershipName?: string | null;
  orderId?: number | null;
  orderNo?: string | null;
  orderStatus?:
    | ("draft" | "submitted" | "approved" | "delivered" | "cancelled" | null)
    | null;
  customerName?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type StockVehicleCreate = {
  dealershipId: number;
  vin: string;
  engineNo: string;
  modelId: number;
  variant?: string | null;
  color?: string | null;
  modelYear?: number | null;
  notes?: string | null;
  orderId?: number | null;
};
export type StockVehiclePage = {
  items: StockVehicle[];
  total: number;
  page: number;
  pageSize: number;
};
export type DeliveryNote = {
  deliveryNo: string;
  status: string;
  scheduledDate: string;
  deliveredAt: string | null;
  dealership: {
    name: string;
    code: string;
    brand: string;
  };
  customer: {
    name: string | null;
    cnic: string | null;
  };
  onBehalfOf?: string | null;
  pboNo: string | null;
  orderNo: string | null;
  vehicle: {
    brand: string | null;
    model: string | null;
    variant: string | null;
    color: string | null;
    chassisNo: string | null;
    engineNo: string | null;
  };
  accessories: string[];
};
export type DeliveryPipeline = {
  stage: "waiting" | "in_transit" | "received" | "scheduled" | "delivered";
  counts: {
    waiting: number;
    in_transit: number;
    received: number;
    scheduled: number;
    delivered: number;
  };
  items: {
    orderId: number;
    orderNo: string;
    pboNo: string | null;
    orderStatus: string;
    leadId: number | null;
    dealershipId: number;
    dealershipName: string;
    customerName: string | null;
    salespersonName: string | null;
    model: string | null;
    variant: string | null;
    color: string | null;
    vehicleId: number | null;
    chassisNo: string | null;
    engineNo: string | null;
    vehicleStatus: string | null;
    deliveryId: number | null;
    deliveryNo: string | null;
    scheduledDate: string | null;
    deliveredOn: string | null;
    approvedAt: string | null;
    expectedDeliveryDate: string | null;
    expectedDeliveryByMonth: boolean;
    bookedAt: string;
    clearanceStatus: "none" | "requested" | "approved" | "rejected";
    balanceDue: string;
    stage: "waiting" | "in_transit" | "received" | "scheduled" | "delivered";
  }[];
  total: number;
  page: number;
  pageSize: number;
};
export type DeliveryReport = {
  asOf: string;
  period: {
    from: string;
    to: string;
  };
  dealerships: {
    id: number;
    code: string;
    name: string;
    brand: string;
    thisMonth: number;
    thisYear: number;
    last30Days: number;
    allTime: number;
    inPeriod: number;
    scheduled: number;
    avgDaysToDeliver: number | null;
  }[];
  total: {
    thisMonth: number;
    thisYear: number;
    last30Days: number;
    allTime: number;
    inPeriod: number;
    scheduled: number;
    avgDaysToDeliver: number | null;
  };
  byModel: {
    brand: string;
    model: string;
    delivered: number;
    avgDaysToDeliver: number | null;
  }[];
  byMonth: {
    month: string;
    booked: number;
    delivered: number;
  }[];
};
export type LeaveApplication = {
  id: number;
  dealershipId: number;
  dealershipName: string;
  applicationNo: string;
  employeeId: number;
  employeeName: string;
  employeeNo: string | null;
  department: string;
  leaveType: "sick" | "emergency";
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: "submitted" | "approved" | "rejected";
  decidedAt: string | null;
  decidedByName: string | null;
  decisionNote: string | null;
  createdAt: string;
};
export type LeaveApplicationPage = {
  items: LeaveApplication[];
  total: number;
  page: number;
  pageSize: number;
};
export type LeaveApplicationCreate = {
  dealershipId: number;
  leaveType: "sick" | "emergency";
  fromDate: string;
  toDate: string;
  department: string;
  employeeNo?: string | null;
  reason?: string | null;
};
export type LeaveDecision = {
  approve: boolean;
  note?: string | null;
};
export type LeaveDocument = LeaveApplication & {
  template: DocumentTemplate;
};
export type Lead = {
  id: number;
  dealershipId: number;
  branchId: number | null;
  ownerId: number;
  ownerName?: string | null;
  customerId: number | null;
  prospectName: string;
  prospectMobile: string;
  email: string | null;
  source:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  interestedModelId: number | null;
  modelName?: string | null;
  variant: string | null;
  preferredColor: string | null;
  expectedCloseDate: string | null;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  notes: string | null;
  paymentInstrument:
    | (
        | "pay_order"
        | "bank_draft"
        | "cheque"
        | "online_transfer"
        | "cash"
        | null
      )
    | null;
  paymentInstrumentRef: string | null;
  paymentInstrumentBank: string | null;
  paymentAmount: string | null;
  followUpCount: number;
  lastFollowUpAt: string | null;
  escalatedAt: string | null;
  escalatedById: number | null;
  escalatedByName?: string | null;
  escalationNote: string | null;
  appointmentAt?: string | null;
  appointmentNote?: string | null;
  appointmentSetById?: number | null;
  appointmentSetByName?: string | null;
  lostAt?: string | null;
  lostById?: number | null;
  lostByName?: string | null;
  lostReason?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  previousPurchases?: number;
  convertedAt: string | null;
  convertedById: number | null;
  convertedByName?: string | null;
  status:
    | "new"
    | "follow_up"
    | "visited"
    | "converted"
    | "processing"
    | "completed"
    | "exhausted"
    | "lost";
  salesOrderId: number | null;
  orderNo?: string | null;
  vehicleStage?: string | null;
  createdById: number | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type LeadPage = {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
};
export type LeadCreate = {
  dealershipId: number;
  branchId?: number | null;
  prospectName: string;
  prospectMobile: string;
  email?: (string | null) | "" | (any | null);
  source?:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  interestedModelId: number;
  variant?: string | null;
  preferredColor?: string | null;
  expectedCloseDate?: string | null;
  notes?: string | null;
  ownerId?: number;
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
export type LeadUpdate = {
  prospectName?: string;
  prospectMobile?: string;
  email?: (string | null) | "" | (any | null);
  source?:
    "walk_in" | "phone" | "website" | "social" | "referral" | "event" | "other";
  interestedModelId?: number;
  variant?: string | null;
  preferredColor?: string | null;
  expectedCloseDate?: string | null;
  notes?: string | null;
  branchId?: number | null;
  ownerId?: number;
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
export type SalesOrder = {
  id: number;
  orderNo: string;
  pboNo: string | null;
  orderType: "pbo" | "cbo";
  dealershipId: number;
  branchId: number | null;
  legalEntityId: number | null;
  accountingEntityId: number | null;
  leadId: number | null;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  modelId: number;
  modelName?: string;
  variant: string | null;
  color: string | null;
  unitPrice: string;
  discount: string;
  totalAmount: string;
  bookingAmount: string;
  expectedDeliveryDate: string | null;
  expectedDeliveryByMonth: boolean;
  vehicleId: number | null;
  vehicleLabel?: string | null;
  vehicleStatus?:
    | (
        | "available"
        | "reserved"
        | "booked"
        | "in_transit"
        | "received"
        | "ready_for_delivery"
        | "delivered"
        | "transferred"
        | "hold"
        | null
      )
    | null;
  financingRef: string | null;
  paymentReference: string | null;
  vehicleVin?: string | null;
  vehicleEngineNo?: string | null;
  notes: string | null;
  status: "draft" | "submitted" | "approved" | "delivered" | "cancelled";
  amountReceived?: string;
  balanceDue?: string;
  clearanceStatus?: "none" | "requested" | "approved" | "rejected";
  clearanceRequestedAt?: string | null;
  clearanceRequestedByName?: string | null;
  clearanceRequestNote?: string | null;
  clearanceDecidedAt?: string | null;
  clearanceDecidedByName?: string | null;
  clearanceDecisionNote?: string | null;
  customerType?: "individual" | "corporate";
  companyName?: string | null;
  contactDesignation?: string | null;
  purchaseOrderNo?: string | null;
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type SalesOrderPage = {
  items: SalesOrder[];
  total: number;
  page: number;
  pageSize: number;
};
export type SalesOrderCreate = {
  dealershipId: number;
  branchId?: number | null;
  pboNo?: string | null;
  customerId: number;
  modelId: number;
  variant?: string | null;
  color?: string | null;
  unitPrice: string;
  discount?: string;
  bookingAmount?: string;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  salespersonId?: number;
  financingRef?: string | null;
  paymentReference?: string | null;
  orderType?: "pbo" | "cbo";
  notes?: string | null;
};
export type SalesOrderUpdate = {
  pboNo?: string | null;
  customerId?: number;
  modelId?: number;
  variant?: string | null;
  color?: string | null;
  unitPrice?: string;
  discount?: string;
  bookingAmount?: string;
  expectedDeliveryDate?: string | null;
  expectedDeliveryByMonth?: boolean;
  salespersonId?: number;
  financingRef?: string | null;
  paymentReference?: string | null;
  orderType?: "pbo" | "cbo";
  notes?: string | null;
  branchId?: number | null;
};
export type Delivery = {
  id: number;
  deliveryNo: string;
  dealershipId: number;
  branchId: number | null;
  salesOrderId: number;
  orderNo?: string;
  vehicleId: number;
  vehicleLabel?: string;
  customerId: number;
  customerName?: string;
  salespersonId: number;
  salespersonName?: string;
  scheduledDate: string;
  deliveredOn: string | null;
  deliveredAt: string | null;
  odometerKm: number | null;
  documentsHandedOver: (
    | "invoice"
    | "registration_book"
    | "warranty_card"
    | "owners_manual"
    | "insurance_cover_note"
  )[];
  accessoriesHandedOver: string[];
  checklist: ("pdi_done" | "documents_ready" | "accessories_fitted")[];
  customerAcknowledged: boolean;
  customerAcknowledgedAt: string | null;
  notes: string | null;
  status: "scheduled" | "delivered" | "cancelled";
  createdAt: string;
  updatedAt: string;
  availableActions: string[];
};
export type DeliveryPage = {
  items: Delivery[];
  total: number;
  page: number;
  pageSize: number;
};
export type StockVehicleUpdate = {
  vin?: string;
  engineNo?: string;
  modelId?: number;
  variant?: string | null;
  color?: string | null;
  modelYear?: number | null;
  notes?: string | null;
};
export type Quotation = {
  id: number;
  dealershipId: number;
  branchId: number | null;
  quotationNo: string;
  leadId: number | null;
  customerName?: string | null;
  customerMobile?: string | null;
  customerEmail?: string | null;
  ownerId: number;
  ownerName?: string | null;
  modelId: number;
  modelName?: string | null;
  variantCode: string | null;
  billTo: string | null;
  variant: string | null;
  color: string | null;
  quantity: number;
  unitPrice: string;
  discount: string;
  freightInsurance: string;
  withholdingTax: string;
  withholdingTaxNonFiler: string | null;
  totalAmount: string;
  bookingAmount: string | null;
  validUntil: string;
  deliveryDays: number | null;
  deliveryPeriod: string | null;
  paymentMode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  createdByName?: string | null;
  updatedById: number | null;
  updatedByName?: string | null;
};
export type QuotationPage = {
  items: Quotation[];
  total: number;
  page: number;
  pageSize: number;
};
export type QuotationUpdate = {
  unitPrice?: string;
  discount?: string;
  bookingAmount?: string;
  variant?: string | null;
  color?: string | null;
  validUntil?: string;
  notes?: string | null;
  variantCode?: string | null;
  billTo?: string | null;
  quantity?: number;
  freightInsurance?: string;
  withholdingTax?: string;
  withholdingTaxNonFiler?: string;
  deliveryDays?: number | null;
  deliveryPeriod?: string | null;
  paymentMode?: string | null;
};
export type PpfForm = {
  id: number;
  dealershipId: number;
  branchId: number | null;
  formNo: string;
  leadId: number | null;
  customerName?: string | null;
  customerMobile?: string | null;
  modelId?: number | null;
  modelName?: string | null;
  variant?: string | null;
  color?: string | null;
  ownerId: number;
  ownerName?: string | null;
  pboNo: string | null;
  chassisNo: string | null;
  engineNo: string | null;
  coverage: "full_body" | "front_package" | "partial" | "custom";
  coverageDetails: string | null;
  protectionPackage: ("nenotek_prime" | "proskin_platinum" | null) | null;
  customerEmail: string | null;
  customerAddress: string | null;
  filmBrand: string | null;
  finish: "gloss" | "matte";
  warrantyYears: number | null;
  amount: string;
  discount: string;
  totalAmount: string;
  advancePaid: string;
  installationDate: string | null;
  notes: string | null;
  extraFields: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  createdById: number | null;
  createdByName?: string | null;
  updatedById: number | null;
  updatedByName?: string | null;
};
export type Ppf20FormPage = {
  items: PpfForm[];
  total: number;
  page: number;
  pageSize: number;
};
export type PpfFormUpdate = {
  pboNo?: string | null;
  chassisNo?: string | null;
  engineNo?: string | null;
  coverage?: "full_body" | "front_package" | "partial" | "custom";
  coverageDetails?: string | null;
  protectionPackage?: "nenotek_prime" | "proskin_platinum";
  customerName?: string;
  customerEmail?: string;
  customerAddress?: string;
  filmBrand?: string | null;
  finish?: "gloss" | "matte";
  warrantyYears?: number | null;
  amount?: string;
  discount?: string;
  advancePaid?: string;
  installationDate?: string | null;
  notes?: string | null;
  extraFields?: {
    [key: string]: string;
  };
};
export type VariantCode = {
  id: number;
  dealershipId: number;
  modelId: number | null;
  modelName?: string | null;
  code: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
export type Variant20CodePage = {
  items: VariantCode[];
  total: number;
  page: number;
  pageSize: number;
};
export type VehicleVariantCreate = {
  dealershipId: number;
  code: string;
  description: string;
  modelId?: number | null;
  isActive?: boolean;
};
export type VehicleVariantUpdate = {
  code?: string;
  description?: string;
  modelId?: number | null;
  isActive?: boolean;
};
export const {
  useGetLeadSummaryQuery,
  useLazyGetLeadSummaryQuery,
  useEscalateDuplicateLeadMutation,
  useListLeadFollowUpsQuery,
  useLazyListLeadFollowUpsQuery,
  useRecordLeadFollowUpMutation,
  useCommentOnFollowUpMutation,
  useCorrectLeadDetailsMutation,
  useCreateLeadQuotationMutation,
  useGetLeadOrderVehicleQuery,
  useLazyGetLeadOrderVehicleQuery,
  useCreateLeadPpfFormMutation,
  useSetLeadAppointmentMutation,
  useReassignLeadMutation,
  useConvertLeadMutation,
  useRaiseSalesOrderMutation,
  useCreateStandaloneQuotationMutation,
  useGetQuotationDocumentQuery,
  useLazyGetQuotationDocumentQuery,
  useCreateStandalonePpfFormMutation,
  useGetPpfDocumentQuery,
  useLazyGetPpfDocumentQuery,
  useGetDocumentTemplateQuery,
  useLazyGetDocumentTemplateQuery,
  useSaveDocumentTemplateMutation,
  useImportVariantCodesMutation,
  useGetSalesDashboardQuery,
  useLazyGetSalesDashboardQuery,
  useGetSalesActionItemsQuery,
  useLazyGetSalesActionItemsQuery,
  useGetSalesTodayQuery,
  useLazyGetSalesTodayQuery,
  useListSalesTeamMembersQuery,
  useLazyListSalesTeamMembersQuery,
  useGetSalesTeamReportQuery,
  useLazyGetSalesTeamReportQuery,
  useGetSalesTrackRecordQuery,
  useLazyGetSalesTrackRecordQuery,
  useGetLeadsToHandOverQuery,
  useLazyGetLeadsToHandOverQuery,
  useHandOverLeadsMutation,
  useListOrderPaymentsQuery,
  useLazyListOrderPaymentsQuery,
  useAddOrderPaymentMutation,
  useRemoveOrderPaymentMutation,
  useRequestDeliveryClearanceMutation,
  useDecideDeliveryClearanceMutation,
  useSetOrderVehicleMutation,
  useListAllocatableVehiclesQuery,
  useLazyListAllocatableVehiclesQuery,
  useAllocateVehicleMutation,
  useReleaseVehicleMutation,
  useAdvanceVehicleStatusMutation,
  useListOrderDeliveriesQuery,
  useLazyListOrderDeliveriesQuery,
  useScheduleDeliveryMutation,
  useDeliverOrderMutation,
  useReceiveStockVehicleMutation,
  useListStockVehiclesQuery,
  useLazyListStockVehiclesQuery,
  useGetDeliveryNoteQuery,
  useLazyGetDeliveryNoteQuery,
  useCompleteDeliveryMutation,
  useGetDeliveryPipelineQuery,
  useLazyGetDeliveryPipelineQuery,
  useGetDeliveryReportQuery,
  useLazyGetDeliveryReportQuery,
  useListLeaveApplicationsQuery,
  useLazyListLeaveApplicationsQuery,
  useApplyForLeaveMutation,
  useGetLeaveApplicationQuery,
  useLazyGetLeaveApplicationQuery,
  useDecideLeaveApplicationMutation,
  useGetLeaveDocumentQuery,
  useLazyGetLeaveDocumentQuery,
  useListLeadsQuery,
  useLazyListLeadsQuery,
  useCreateLeadMutation,
  useGetLeadWorkflowQuery,
  useLazyGetLeadWorkflowQuery,
  useGetLeadQuery,
  useLazyGetLeadQuery,
  useUpdateLeadMutation,
  useGetLeadHistoryQuery,
  useLazyGetLeadHistoryQuery,
  useTransitionLeadMutation,
  useListSalesOrdersQuery,
  useLazyListSalesOrdersQuery,
  useCreateSalesOrderMutation,
  useGetSalesOrderWorkflowQuery,
  useLazyGetSalesOrderWorkflowQuery,
  useGetSalesOrderQuery,
  useLazyGetSalesOrderQuery,
  useUpdateSalesOrderMutation,
  useGetSalesOrderHistoryQuery,
  useLazyGetSalesOrderHistoryQuery,
  useTransitionSalesOrderMutation,
  useListDeliveriesQuery,
  useLazyListDeliveriesQuery,
  useGetDeliveryWorkflowQuery,
  useLazyGetDeliveryWorkflowQuery,
  useGetDeliveryQuery,
  useLazyGetDeliveryQuery,
  useGetDeliveryHistoryQuery,
  useLazyGetDeliveryHistoryQuery,
  useTransitionDeliveryMutation,
  useGetStockVehicleQuery,
  useLazyGetStockVehicleQuery,
  useUpdateStockVehicleMutation,
  useGetStockVehicleHistoryQuery,
  useLazyGetStockVehicleHistoryQuery,
  useListQuotationsQuery,
  useLazyListQuotationsQuery,
  useGetQuotationQuery,
  useLazyGetQuotationQuery,
  useUpdateQuotationMutation,
  useGetQuotationHistoryQuery,
  useLazyGetQuotationHistoryQuery,
  useListPpfFormsQuery,
  useLazyListPpfFormsQuery,
  useGetPpfFormQuery,
  useLazyGetPpfFormQuery,
  useUpdatePpfFormMutation,
  useGetPpfFormHistoryQuery,
  useLazyGetPpfFormHistoryQuery,
  useListVariantCodesQuery,
  useLazyListVariantCodesQuery,
  useCreateVariantCodeMutation,
  useGetVariantCodeQuery,
  useLazyGetVariantCodeQuery,
  useUpdateVariantCodeMutation,
  useGetVariantCodeHistoryQuery,
  useLazyGetVariantCodeHistoryQuery,
} = injectedRtkApi;
