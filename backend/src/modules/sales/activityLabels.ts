/** Readable names of sales records in the activity log (see core/activity.ts). */
import { inArray } from 'drizzle-orm';
import { registerActivityLabels } from '../core/activity';
import { vehicle } from '../master/models';
import { delivery, documentTemplate, lead, ppfForm, quotation, salesOrder, vehicleVariant } from './models';

const numeric = (ids: string[]) => ids.map(Number).filter(Boolean);

registerActivityLabels('sales.lead', async (ex, ids) => {
  const rows = await ex.select({ id: lead.id, name: lead.prospectName }).from(lead).where(inArray(lead.id, numeric(ids)));
  return new Map(rows.map((r) => [String(r.id), r.name]));
});
registerActivityLabels('sales.order', async (ex, ids) => {
  const rows = await ex.select({ id: salesOrder.id, no: salesOrder.orderNo }).from(salesOrder).where(inArray(salesOrder.id, numeric(ids)));
  return new Map(rows.map((r) => [String(r.id), r.no]));
});
registerActivityLabels('sales.delivery', async (ex, ids) => {
  const rows = await ex.select({ id: delivery.id, no: delivery.deliveryNo }).from(delivery).where(inArray(delivery.id, numeric(ids)));
  return new Map(rows.map((r) => [String(r.id), r.no]));
});
const vehicleLabel: Parameters<typeof registerActivityLabels>[1] = async (ex, ids) => {
  const rows = await ex.select({ id: vehicle.id, vin: vehicle.vin, engineNo: vehicle.engineNo }).from(vehicle).where(inArray(vehicle.id, numeric(ids)));
  return new Map(rows.map((r) => [String(r.id), r.vin ?? r.engineNo ?? `Vehicle #${r.id}`]));
};
registerActivityLabels('sales.stock_vehicle', vehicleLabel);
registerActivityLabels('master.vehicle', vehicleLabel);
registerActivityLabels('sales.quotation', async (ex, ids) => {
  const rows = await ex.select({ id: quotation.id, no: quotation.quotationNo }).from(quotation).where(inArray(quotation.id, numeric(ids)));
  return new Map(rows.map((r) => [String(r.id), r.no]));
});
registerActivityLabels('sales.ppf_form', async (ex, ids) => {
  const rows = await ex.select({ id: ppfForm.id, no: ppfForm.formNo }).from(ppfForm).where(inArray(ppfForm.id, numeric(ids)));
  return new Map(rows.map((r) => [String(r.id), r.no]));
});
registerActivityLabels('sales.document_template', async (ex, ids) => {
  const rows = await ex.select({ id: documentTemplate.id, kind: documentTemplate.kind }).from(documentTemplate).where(inArray(documentTemplate.id, numeric(ids)));
  return new Map(rows.map((r) => [String(r.id), r.kind === 'ppf' ? 'PPF voucher format' : 'Quotation format']));
});
registerActivityLabels('sales.vehicle_variant', async (ex, ids) => {
  const rows = await ex.select({ id: vehicleVariant.id, code: vehicleVariant.code }).from(vehicleVariant).where(inArray(vehicleVariant.id, numeric(ids)));
  return new Map(rows.map((r) => [String(r.id), r.code]));
});
