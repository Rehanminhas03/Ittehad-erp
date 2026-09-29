/**
 * Business policies: behaviour that management may want to change, kept out of the code paths
 * that apply it. Values here are the group defaults.
 */
export const POLICIES = {
  sales: {
    /** Segregation of duties: the person who approves a sales order cannot be its salesperson or creator. */
    approverMustDifferFromSalesperson: true,
    /** Maximum discount a salesperson may enter, as a percentage of the list price. */
    maxDiscountPercent: 10,
  },
  service: {
    /** A free scheduled service is still free this many km past its due km... */
    freeServiceGraceKm: 500,
    /** ...or this many days past its due date. */
    freeServiceGraceDays: 30,
    /** Default labour rate offered on new labour lines (PKR per hour); lines can override it. */
    defaultLabourRatePerHour: '3000.00',
  },
  parts: {
    /** Purchase orders and stock adjustments must be approved by someone other than their creator. */
    approverMustDifferFromCreator: true,
  },
  vehicle: {
    /** Warranty length from activation (delivery), in months. */
    warrantyMonths: 36,
  },
} as const;
