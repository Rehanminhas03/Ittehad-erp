/** Readable names of sales records in the activity log (see core/activity.ts). */
import { registerActivityLabels } from '../core/activity';

const numeric = (ids: string[]) => ids.map(Number).filter(Boolean);

registerActivityLabels('sales.lead', async (ex, ids) => {
  const rows = await ex.lead.findMany({ where: { id: { in: numeric(ids) } }, select: { id: true, prospectName: true } });
  return new Map(rows.map((r) => [String(r.id), r.prospectName]));
});
registerActivityLabels('sales.order', async (ex, ids) => {
  const rows = await ex.salesOrder.findMany({ where: { id: { in: numeric(ids) } }, select: { id: true, orderNo: true } });
  return new Map(rows.map((r) => [String(r.id), r.orderNo]));
});
registerActivityLabels('sales.delivery', async (ex, ids) => {
  const rows = await ex.delivery.findMany({ where: { id: { in: numeric(ids) } }, select: { id: true, deliveryNo: true } });
  return new Map(rows.map((r) => [String(r.id), r.deliveryNo]));
});
const vehicleLabel: Parameters<typeof registerActivityLabels>[1] = async (ex, ids) => {
  const rows = await ex.vehicle.findMany({ where: { id: { in: numeric(ids) } }, select: { id: true, vin: true, engineNo: true } });
  return new Map(rows.map((r) => [String(r.id), r.vin ?? r.engineNo ?? `Vehicle #${r.id}`]));
};
registerActivityLabels('sales.stock_vehicle', vehicleLabel);
registerActivityLabels('master.vehicle', vehicleLabel);
registerActivityLabels('sales.quotation', async (ex, ids) => {
  const rows = await ex.quotation.findMany({ where: { id: { in: numeric(ids) } }, select: { id: true, quotationNo: true } });
  return new Map(rows.map((r) => [String(r.id), r.quotationNo]));
});
registerActivityLabels('sales.ppf_form', async (ex, ids) => {
  const rows = await ex.ppfForm.findMany({ where: { id: { in: numeric(ids) } }, select: { id: true, formNo: true } });
  return new Map(rows.map((r) => [String(r.id), r.formNo]));
});
registerActivityLabels('sales.document_template', async (ex, ids) => {
  const rows = await ex.documentTemplate.findMany({ where: { id: { in: numeric(ids) } }, select: { id: true, kind: true } });
  return new Map(rows.map((r) => [String(r.id), r.kind === 'ppf' ? 'PPF voucher format' : 'Quotation format']));
});
registerActivityLabels('sales.vehicle_variant', async (ex, ids) => {
  const rows = await ex.vehicleVariant.findMany({ where: { id: { in: numeric(ids) } }, select: { id: true, code: true } });
  return new Map(rows.map((r) => [String(r.id), r.code]));
});
