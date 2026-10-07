import { enhancedApi } from './salesApi.generated';

/**
 * Sales endpoints: generated from OpenAPI, plus the cross-entity effects of sales actions
 * (converting a lead creates the customer; raising an order moves the lead; delivering changes the vehicle and owner).
 */
export const salesApi = enhancedApi
  .enhanceEndpoints({ addTagTypes: ['Customer', 'Vehicle', 'Search', 'StockVehicle'] })
  .enhanceEndpoints({
    endpoints: {
      // "Action needed" follows every change to leads, orders, deliveries and stock.
      getSalesActionItems: { providesTags: ['Lead', 'SalesOrder', 'Delivery', 'StockVehicle'] },
      // Registering a car for a waiting order links it: the order (and its lead's car stage) change too.
      receiveStockVehicle: { invalidatesTags: ['StockVehicle', 'SalesOrder', 'Vehicle', 'Lead'] },
      convertLead: { invalidatesTags: ['Lead', 'Customer', 'Search'] },
      recordLeadFollowUp: { invalidatesTags: ['Lead'] },
      commentOnFollowUp: { invalidatesTags: ['Lead'] },
      // Documents feed the monthly track record (SalesTeam).
      createLeadQuotation: { invalidatesTags: ['Quotation', 'SalesTeam'] },
      createLeadPpfForm: { invalidatesTags: ['PPF form', 'SalesTeam'] },
      updateQuotation: { invalidatesTags: ['Quotation', 'SalesTeam'] },
      updatePpfForm: { invalidatesTags: ['PPF form', 'SalesTeam'] },
      // A new format changes how every quotation prints.
      saveDocumentTemplate: { invalidatesTags: ['DocumentTemplate', 'Quotation', 'PPF form'] },
      importVariantCodes: { invalidatesTags: ['Variant code'] },
      correctLeadDetails: { invalidatesTags: ['Lead', 'SalesOrder', 'Customer'] },
      escalateDuplicateLead: { invalidatesTags: ['Lead'] },
      setLeadAppointment: { invalidatesTags: ['Lead'] },
      // The lead's quotations and PPF vouchers move with it (and the track record of both people).
      reassignLead: { invalidatesTags: ['Lead', 'Quotation', 'PPF form', 'SalesTeam'] },
      getLeadsToHandOver: { providesTags: ['Lead'] },
      // A leaver's leads (with their quotations and PPF vouchers) go to someone else.
      handOverLeads: { invalidatesTags: ['Lead', 'Quotation', 'PPF form', 'SalesTeam'] },
      raiseSalesOrder: { invalidatesTags: ['Lead', 'SalesOrder'] },
      // Payments change the order's received / balance; clearance gates the hand-over.
      listOrderPayments: { providesTags: ['SalesOrder'] },
      addOrderPayment: { invalidatesTags: ['SalesOrder', 'DeliveryPipeline'] },
      removeOrderPayment: { invalidatesTags: ['SalesOrder', 'DeliveryPipeline'] },
      requestDeliveryClearance: { invalidatesTags: ['SalesOrder', 'DeliveryPipeline', 'Delivery'] },
      decideDeliveryClearance: { invalidatesTags: ['SalesOrder', 'DeliveryPipeline', 'Delivery'] },
      applyForLeave: { invalidatesTags: ['LeaveApplication'] },
      decideLeaveApplication: { invalidatesTags: ['LeaveApplication'] },
      getSalesToday: { providesTags: ['Lead', 'SalesOrder', 'Delivery'] },
      setOrderVehicle: { invalidatesTags: ['SalesOrder', 'Vehicle', 'StockVehicle'] },
      transitionSalesOrder: { invalidatesTags: ['SalesOrder', 'Delivery', 'Lead', 'StockVehicle'] },
      allocateVehicle: { invalidatesTags: ['SalesOrder', 'Vehicle', 'StockVehicle'] },
      releaseVehicle: { invalidatesTags: ['SalesOrder', 'Vehicle', 'StockVehicle'] },
      advanceVehicleStatus: { invalidatesTags: ['SalesOrder', 'Vehicle', 'StockVehicle'] },
      scheduleDelivery: { invalidatesTags: ['Delivery', 'SalesOrder'] },
      transitionDelivery: { invalidatesTags: ['Delivery', 'SalesOrder'] },
      completeDelivery: { invalidatesTags: ['Delivery', 'SalesOrder', 'Lead', 'Vehicle', 'StockVehicle', 'Customer', 'Search'] },
      deliverOrder: { invalidatesTags: ['Delivery', 'SalesOrder', 'Lead', 'Vehicle', 'StockVehicle', 'Customer', 'Search'] },
    },
  });

export * from './salesApi.generated';
