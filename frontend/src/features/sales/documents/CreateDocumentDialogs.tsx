import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { apiFieldErrors } from '@/shared/lib';
import { type Lead, useCreateLeadPpfFormMutation, useCreateLeadQuotationMutation, useGetDocumentTemplateQuery, useGetLeadOrderVehicleQuery, useListVariantCodesQuery } from '../salesApi';
import { LeadModelSelect } from '../leads/components/LeadModelSelect';
import { VariantPicker } from '../leads/components/VariantPicker';
import { PPF_COVERAGES, PPF_FINISHES } from './labels';

type Props = { lead: Lead; open: boolean; onClose: () => void; onCreated: (id: number) => void };
const blank = (s: string) => s.trim() || null;

/** Shared submit handling: server field errors next to the fields, anything else as a toast. */
function useSubmit() {
  const toast = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = async (fn: () => Promise<{ id: number }>, done: (id: number) => void) => {
    setErrors({});
    try {
      done((await fn()).id);
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
      else toast.error(e);
    }
  };
  return { errors, setErrors, run };
}

/**
 * Issue a vehicle quotation: the price quoted (prefilled from the sales order once one exists). It is
 * saved and numbered, then opened in the preview to check before it is downloaded or printed.
 */
export function QuotationDialog({ lead, open, onClose, onCreated }: Props) {
  const [create, { isLoading }] = useCreateLeadQuotationMutation();
  const { errors, setErrors, run } = useSubmit();
  const hasOrder = !!lead.salesOrderId;
  const [v, setV] = useState({
    // From the lead; the customer may now want another model or variant.
    modelId: lead.interestedModelId ? String(lead.interestedModelId) : '',
    variantCode: '',
    billTo: '',
    quantity: '1',
    unitPrice: '',
    discount: '',
    freightInsurance: '',
    withholdingTax: '',
    withholdingTaxNonFiler: '',
    bookingAmount: '',
    variant: lead.variant ?? '',
    color: lead.preferredColor ?? '',
    validDays: '7',
    deliveryDays: '',
    paymentMode: '',
    notes: '',
  });
  // Validity, delivery period and payment mode start from the dealership's quotation format.
  const { data: format } = useGetDocumentTemplateQuery({ kind: 'quotation', dealershipId: lead.dealershipId });
  useEffect(() => {
    if (!format) return;
    setV((s) => ({
      ...s,
      validDays: String(format.defaultValidityDays),
      deliveryDays: format.defaultDeliveryDays != null ? String(format.defaultDeliveryDays) : s.deliveryDays,
      paymentMode: s.paymentMode || (format.defaultPaymentMode ?? ''),
    }));
  }, [format]);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  // Hyundai (a Ref prefix): the chosen model's variant codes; the code goes in the Ref (HI/<code>/<date>).
  // A typed variant ("Other") is allowed too; its Ref is then the quotation number.
  const { data: modelCodes } = useListVariantCodesQuery(
    { dealershipId: lead.dealershipId, modelId: Number(v.modelId) || 0, isActive: 'true', pageSize: 1 },
    { skip: !v.modelId },
  );
  const needsVariant = !!format?.refPrefix && (modelCodes?.total ?? 0) > 0;

  const submit = () => {
    if (!v.modelId) return setErrors({ modelId: 'Choose the model' });
    if (needsVariant && !v.variantCode && !v.variant.trim()) return setErrors({ variantCode: 'Choose the variant code (it goes in the Ref), or type it under "Other"' });
    if (!hasOrder && !v.unitPrice.trim()) return setErrors({ unitPrice: 'Enter the price to quote' });
    return run(
      () =>
        create({
          id: lead.id,
          quotationCreate: {
            unitPrice: v.unitPrice.trim() || undefined,
            discount: v.discount.trim() || undefined,
            bookingAmount: v.bookingAmount.trim() || undefined,
            modelId: Number(v.modelId),
            // A picked code sets the printed description on the server; a typed variant is sent as is.
            variant: v.variantCode ? null : blank(v.variant),
            color: blank(v.color),
            validDays: Number(v.validDays) || 7,
            notes: blank(v.notes),
            variantCode: blank(v.variantCode),
            billTo: blank(v.billTo),
            quantity: Number(v.quantity) || 1,
            freightInsurance: v.freightInsurance.trim() || '0',
            withholdingTax: v.withholdingTax.trim() || '0',
            withholdingTaxNonFiler: v.withholdingTaxNonFiler.trim() || undefined,
            deliveryDays: v.deliveryDays.trim() ? Number(v.deliveryDays) : null,
            paymentMode: blank(v.paymentMode),
          },
        }).unwrap(),
      onCreated,
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`New vehicle quotation — ${lead.prospectName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Save &amp; preview
          </Button>
        </>
      }
    >
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          <p className="text-sm text-slate-600 sm:col-span-2">
            The model and variant start from the lead; change them if the customer wants a quotation for another vehicle.
            {hasOrder ? ' Leave the price empty to use the sales order price.' : ' Enter the price you are quoting.'}
          </p>
          <Field label="Model" htmlFor="qt-model" required error={errors.modelId}>
            <LeadModelSelect
              id="qt-model"
              value={v.modelId}
              onChange={(modelId) => setV((s) => ({ ...s, modelId }))}
              invalid={!!errors.modelId}
              dealershipId={lead.dealershipId}
            />
          </Field>
          <Field
            label="Variant"
            htmlFor="qt-variant"
            required={needsVariant}
            error={errors.variantCode ?? errors.variant}
            hint={needsVariant ? 'A code goes in the Ref (e.g. HI/NX4FL16THAW/26-09-26); a typed variant uses the quotation number' : 'Printed with the model'}
          >
            <VariantPicker
              id="qt-variant"
              value={v.variant}
              onChange={(variant) => setV((s) => ({ ...s, variant }))}
              onCode={(code) => setV((s) => ({ ...s, variantCode: code ?? '' }))}
              invalid={!!(errors.variantCode ?? errors.variant)}
              modelId={Number(v.modelId) || null}
              dealershipId={lead.dealershipId}
            />
          </Field>
          <Field label="To" htmlFor="qt-billto" className="sm:col-span-2" error={errors.billTo} hint="Leave empty for the customer's name; e.g. a bank A/C the customer">
            <Input id="qt-billto" value={v.billTo} onChange={set('billTo')} placeholder={lead.prospectName} />
          </Field>
          <Field label="Price (PKR)" htmlFor="qt-price" required={!hasOrder} error={errors.unitPrice}>
            <Input id="qt-price" inputMode="decimal" value={v.unitPrice} onChange={set('unitPrice')} invalid={!!errors.unitPrice} placeholder={hasOrder ? 'From the sales order' : 'e.g. 9500000'} />
          </Field>
          <Field label="Discount (PKR)" htmlFor="qt-discount" error={errors.discount} hint="Limited by the group discount policy">
            <Input id="qt-discount" inputMode="decimal" value={v.discount} onChange={set('discount')} invalid={!!errors.discount} placeholder="0" />
          </Field>
          <Field label="Freight & transit insurance (PKR)" htmlFor="qt-freight" error={errors.freightInsurance}>
            <Input id="qt-freight" inputMode="decimal" value={v.freightInsurance} onChange={set('freightInsurance')} invalid={!!errors.freightInsurance} placeholder="e.g. 68000" />
          </Field>
          <Field label="Quantity" htmlFor="qt-qty" error={errors.quantity}>
            <Input id="qt-qty" type="number" min={1} max={50} value={v.quantity} onChange={set('quantity')} />
          </Field>
          <Field label="Withholding tax — filer (PKR)" htmlFor="qt-wht" error={errors.withholdingTax} hint="Added as a line item">
            <Input id="qt-wht" inputMode="decimal" value={v.withholdingTax} onChange={set('withholdingTax')} invalid={!!errors.withholdingTax} placeholder="e.g. 246160" />
          </Field>
          <Field label="Withholding tax — non-filer (PKR)" htmlFor="qt-wht-nf" error={errors.withholdingTaxNonFiler} hint="Quoted in the terms">
            <Input id="qt-wht-nf" inputMode="decimal" value={v.withholdingTaxNonFiler} onChange={set('withholdingTaxNonFiler')} invalid={!!errors.withholdingTaxNonFiler} placeholder="e.g. 1311450" />
          </Field>
          <Field label="Colour" htmlFor="qt-color">
            <Input id="qt-color" value={v.color} onChange={set('color')} />
          </Field>
          <Field label="Booking amount (PKR)" htmlFor="qt-booking" error={errors.bookingAmount} hint={hasOrder ? 'Empty: from the sales order' : undefined}>
            <Input id="qt-booking" inputMode="decimal" value={v.bookingAmount} onChange={set('bookingAmount')} invalid={!!errors.bookingAmount} />
          </Field>
          <Field label="Valid for (days)" htmlFor="qt-valid" error={errors.validDays}>
            <Input id="qt-valid" type="number" min={1} max={60} value={v.validDays} onChange={set('validDays')} />
          </Field>
          <Field label="Tentative delivery (days)" htmlFor="qt-delivery" error={errors.deliveryDays}>
            <Input id="qt-delivery" type="number" min={0} max={365} value={v.deliveryDays} onChange={set('deliveryDays')} />
          </Field>
          <Field label="Payment mode" htmlFor="qt-payment" error={errors.paymentMode}>
            <Input id="qt-payment" value={v.paymentMode} onChange={set('paymentMode')} />
          </Field>
          <Field label="Notes on the quotation" htmlFor="qt-notes" className="sm:col-span-2">
            <Textarea id="qt-notes" rows={2} value={v.notes} onChange={set('notes')} placeholder="e.g. Includes registration and one-year insurance" />
          </Field>
        </div>
    </Dialog>
  );
}

/** The customer agreed to Paint Protection Film: what is covered and what it costs. */
export function PpfDialog({ lead, open, onClose, onCreated }: Props) {
  const [create, { isLoading }] = useCreateLeadPpfFormMutation();
  const { errors, setErrors, run } = useSubmit();
  const [v, setV] = useState({ pboNo: '', chassisNo: '', engineNo: '', coverage: 'full_body', coverageDetails: '', filmBrand: '', finish: 'gloss', warrantyYears: '', amount: '', discount: '', advancePaid: '', installationDate: '', notes: '' });
  // Processing / vehicle received / delivered: the sales order already has these.
  const { data: fromOrder } = useGetLeadOrderVehicleQuery({ id: lead.id }, { refetchOnMountOrArgChange: true });
  useEffect(() => {
    if (!fromOrder) return;
    setV((s) => ({ ...s, pboNo: fromOrder.orderNo ?? s.pboNo, chassisNo: fromOrder.chassisNo ?? s.chassisNo, engineNo: fromOrder.engineNo ?? s.engineNo }));
  }, [fromOrder]);
  // Required once the lead has a sales order; before that they may be left blank (the voucher shows the
  // order's numbers as soon as it exists).
  const hasOrder = !!lead.salesOrderId;
  const locked = { pboNo: !!fromOrder?.orderNo, chassisNo: !!fromOrder?.chassisNo, engineNo: !!fromOrder?.engineNo };
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const needsPanels = v.coverage === 'partial' || v.coverage === 'custom';
  // The dealership's own voucher fields (PPF format).
  const { data: format } = useGetDocumentTemplateQuery({ kind: 'ppf', dealershipId: lead.dealershipId });
  const customFields = format?.customFields ?? [];
  const [extra, setExtra] = useState<Record<string, string>>({});

  const submit = () => {
    // PBO, chassis and engine: required once there is a sales order (from the order, or typed here).
    const missing: Record<string, string> = {};
    if (hasOrder && !v.pboNo.trim()) missing.pboNo = 'Enter the PBO / CBO number';
    if (hasOrder && !v.chassisNo.trim()) missing.chassisNo = 'Enter the chassis number';
    if (hasOrder && !v.engineNo.trim()) missing.engineNo = 'Enter the engine number';
    if (!v.amount.trim()) missing.amount = 'Enter the PPF price';
    if (Object.keys(missing).length) return setErrors(missing);
    return run(
      () =>
        create({
          id: lead.id,
          ppfFormCreate: {
            pboNo: blank(v.pboNo),
            chassisNo: blank(v.chassisNo),
            engineNo: blank(v.engineNo),
            coverage: v.coverage as 'full_body',
            coverageDetails: blank(v.coverageDetails),
            filmBrand: blank(v.filmBrand),
            finish: v.finish as 'gloss',
            warrantyYears: v.warrantyYears.trim() ? Number(v.warrantyYears) : null,
            amount: v.amount.trim(),
            discount: v.discount.trim() || '0',
            advancePaid: v.advancePaid.trim() || '0',
            installationDate: v.installationDate || null,
            notes: blank(v.notes),
            extraFields: extra,
          },
        }).unwrap(),
      onCreated,
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={`New PPF voucher — ${lead.prospectName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={submit}>
            Save &amp; preview
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:col-span-2">
          <span className="font-medium">{lead.prospectName}</span> · {lead.prospectMobile}
          {lead.email ? ` · ${lead.email}` : ''} <span className="text-slate-500">— from the lead</span>
        </p>
        <p className="text-sm text-slate-600 sm:col-span-2">
          {fromOrder?.orderNo
            ? 'PBO, chassis and engine are taken from the sales order; enter anything the order does not have yet.'
            : 'No sales order yet: fill in the PBO / CBO, chassis and engine if you have them. Otherwise leave them blank; the voucher shows the order’s numbers once it is raised.'}
        </p>
        <Field label="PBO / CBO no." htmlFor="ppf-pbo" required={hasOrder} error={errors.pboNo} hint={locked.pboNo ? 'From the sales order' : undefined}>
          <Input id="ppf-pbo" value={v.pboNo} onChange={set('pboNo')} readOnly={locked.pboNo} invalid={!!errors.pboNo} className={locked.pboNo ? 'bg-slate-50' : undefined} />
        </Field>
        <Field label="Chassis" htmlFor="ppf-chassis" required={hasOrder} error={errors.chassisNo} hint={locked.chassisNo ? 'From the sales order' : undefined}>
          <Input id="ppf-chassis" value={v.chassisNo} onChange={set('chassisNo')} readOnly={locked.chassisNo} invalid={!!errors.chassisNo} className={locked.chassisNo ? 'bg-slate-50' : undefined} />
        </Field>
        <Field label="Engine" htmlFor="ppf-engine" required={hasOrder} error={errors.engineNo} hint={locked.engineNo ? 'From the sales order' : undefined}>
          <Input id="ppf-engine" value={v.engineNo} onChange={set('engineNo')} readOnly={locked.engineNo} invalid={!!errors.engineNo} className={locked.engineNo ? 'bg-slate-50' : undefined} />
        </Field>
        {customFields.map((name, i) => (
          <Field key={name} label={name} htmlFor={`ppf-extra-${i}`}>
            <Input id={`ppf-extra-${i}`} value={extra[name] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [name]: e.target.value }))} />
          </Field>
        ))}
        <Field label="Coverage" htmlFor="ppf-coverage" required error={errors.coverage}>
          <Select id="ppf-coverage" value={v.coverage} onChange={set('coverage')}>
            {PPF_COVERAGES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Finish" htmlFor="ppf-finish">
          <Select id="ppf-finish" value={v.finish} onChange={set('finish')}>
            {PPF_FINISHES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Panels covered" htmlFor="ppf-panels" className="sm:col-span-2" error={errors.coverageDetails} hint={needsPanels ? 'List the panels the film goes on' : undefined}>
          <Input id="ppf-panels" value={v.coverageDetails} onChange={set('coverageDetails')} placeholder="e.g. Bonnet, front bumper, fenders, mirrors" />
        </Field>
        <Field label="Film brand" htmlFor="ppf-brand">
          <Input id="ppf-brand" value={v.filmBrand} onChange={set('filmBrand')} placeholder="e.g. XPEL, 3M, STEK" />
        </Field>
        <Field label="Warranty (years)" htmlFor="ppf-warranty" error={errors.warrantyYears}>
          <Input id="ppf-warranty" type="number" min={0} max={15} value={v.warrantyYears} onChange={set('warrantyYears')} />
        </Field>
        <Field label="Price (PKR)" htmlFor="ppf-amount" required error={errors.amount}>
          <Input id="ppf-amount" inputMode="decimal" value={v.amount} onChange={set('amount')} invalid={!!errors.amount} placeholder="e.g. 350000" />
        </Field>
        <Field label="Discount (PKR)" htmlFor="ppf-discount" error={errors.discount}>
          <Input id="ppf-discount" inputMode="decimal" value={v.discount} onChange={set('discount')} invalid={!!errors.discount} placeholder="0" />
        </Field>
        <Field label="Paid (PKR)" htmlFor="ppf-advance" error={errors.advancePaid}>
          <Input id="ppf-advance" inputMode="decimal" value={v.advancePaid} onChange={set('advancePaid')} invalid={!!errors.advancePaid} placeholder="0" />
        </Field>
        <Field label="Promise date" htmlFor="ppf-date" error={errors.installationDate} hint="When the PPF will be done">
          <Input id="ppf-date" type="date" value={v.installationDate} onChange={set('installationDate')} />
        </Field>
        <Field label="Notes" htmlFor="ppf-notes" className="sm:col-span-2">
          <Textarea id="ppf-notes" rows={2} value={v.notes} onChange={set('notes')} />
        </Field>
      </div>
    </Dialog>
  );
}
