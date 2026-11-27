import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Field, Input, Section, Select, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiErrorMessage, formatDateTime } from '@/shared/lib';
import { type AcceptanceForm, acceptanceFormFrom, blankAcceptanceForm, buildAcceptanceNotePdf, buildAllDocumentsPdf, buildDeliveryNoteSheetPdf, buildGatePassPdf, buildUndertakingsPdf } from '../../../documents/acceptanceNote';
import { DownloadIcon, PrintIcon, usePdf } from '../../../documents/DocumentPreview';
import { P } from '../../../permissions';
import {
  type DeliveryDocument,
  type SalesOrder,
  useGetAcceptanceNoteQuery,
  useGetSalesOrderQuery,
  useListDeliveryDocumentsQuery,
  useRemoveDeliveryDocumentMutation,
  useSaveDeliveryDocumentMutation,
  useUpdateDeliveryDocumentMutation,
} from '../../../salesApi';

type Key = keyof AcceptanceForm;
type FieldDef = [key: Key, label: string, hint?: string];
export type DeliveryDocKind = 'acceptance' | 'note' | 'undertakings' | 'gatepass' | 'all';

const RECEIVER: Key[] = ['receiverName', 'receiverContact', 'receiverCnic'];

/**
 * The delivery documents. Each lists its fields in the order the form shows them and which of them can be typed when the
 * document is opened from an order: only what is decided at hand-over. Everything else comes from the order and is locked.
 * A document typed by hand (no order) has every field open.
 */
const DOCS: Record<DeliveryDocKind, { title: string; text: string; fields: FieldDef[]; editable: Key[]; /** A heading before a field, to group the form document by document. */ headings?: Partial<Record<Key, string>>; build: (f: AcceptanceForm, label: string) => ReturnType<typeof buildAcceptanceNotePdf> }> = {
  acceptance: {
    title: 'Vehicle Delivery Acceptance Note',
    text: 'The sheet the receiver signs when the car is handed over.',
    fields: [
      ['date', 'Date'],
      ['time', 'Time', 'Optional: leave empty to write it by hand'],
      ['invoiceNo', 'Invoice No', 'From the vehicle invoice, when received'],
      ['orderNo', 'Order No', 'The PBO number'],
      ['make', 'Make'],
      ['model', 'Model'],
      ['variant', 'Variant'],
      ['year', 'Year'],
      ['chassis', 'Chassis'],
      ['engine', 'Engine No'],
      ['color', 'Color'],
      ['regNo', 'Reg no', 'When the plate is issued'],
      ['owner', 'Owner', 'The customer (or the company)'],
      ['contact', 'Contact (customer)', "The customer's phone from the order"],
      ['receiverName', "Receiver's Name", 'Who takes the car'],
      ['receiverContact', 'Receiver Contact'],
      ['receiverCnic', 'Receiver CNIC'],
      ['userName', 'User Name', "Empty: the receiver's name is printed"],
      ['address', 'Address', "The customer's address"],
    ],
    editable: ['time', 'regNo', 'receiverName', 'receiverContact', 'receiverCnic', 'userName'],
    build: buildAcceptanceNotePdf,
  },
  note: {
    title: 'Delivery Note (front and back)',
    text: 'The receiver certifies the inspection and delivery; the back has the authority letter, invoice and managers’ sign-off.',
    fields: [
      ['time', 'Time', 'Optional: printed after the date; empty: written by hand'],
      ['receiverName', "Receiver's Name", 'Who takes the car: printed after "This is to certify that"'],
      ['receiverCnic', 'Receiver CNIC'],
      ['receiverContact', 'Receiver Contact', 'Printed as Misc (empty: the customer’s phone)'],
      ['authority', 'Authority Letter & CNIC', 'Empty: ticked by hand'],
      ['invoiceAttached', 'Invoice Attached', 'Empty: ticked by hand'],
      ['date', 'Date', "Today's date"],
      ['owner', 'Owner (on behalf of)', 'Printed after "on behalf of" when someone else receives the car'],
      ['orderNo', 'PBO No'],
      ['model', 'Model'],
      ['variant', 'Variant'],
      ['engine', 'Engine #'],
      ['chassis', 'Chassis #'],
      ['color', 'Color'],
      ['contact', 'Contact (customer)', "The customer's phone from the order"],
    ],
    editable: ['time', 'receiverName', 'receiverContact', 'receiverCnic', 'authority', 'invoiceAttached'],
    build: buildDeliveryNoteSheetPdf,
  },
  undertakings: {
    title: 'Undertakings (invoice and possession)',
    text: 'Two undertakings on one page: print it, then cut the page in two. The PBO and the date are filled in.',
    fields: [
      ['time', 'Time', 'Optional: printed after the date in "Date & Time"'],
      ['date', 'Date', "Today's date"],
      ['orderNo', 'PBO No', 'Printed in the first undertaking'],
      ['owner', 'Name of Customer'],
    ],
    editable: ['time'],
    build: buildUndertakingsPdf,
  },
  gatepass: {
    title: 'Gate Pass',
    text: 'Lets the car out through the gate: invoice, order, customer, chassis and engine are filled in.',
    fields: [
      ['customerCode', 'Customer Code', 'Optional: written by hand if empty'],
      ['warrantyNo', 'Warranty / Book No', 'Optional: written by hand if empty'],
      ['invoiceNo', 'Invoice No', 'From the vehicle invoice, when received'],
      ['orderNo', 'Order No', 'The PBO number'],
      ['owner', 'Customer Name'],
      ['address', 'Address'],
      ['make', 'Make'],
      ['model', 'Model'],
      ['variant', 'Variant (printed as the description)'],
      ['chassis', 'Chassis No'],
      ['engine', 'Engine No'],
    ],
    editable: ['customerCode', 'warrantyNo', 'invoiceNo'],
    build: buildGatePassPdf,
  },
  all: {
    title: 'All delivery documents',
    text: 'The Acceptance Note, the Delivery Note (front and back), the undertakings and the Gate Pass, filled in and printed together.',
    fields: [
      ['time', 'Time', 'Optional: printed after the date; empty: written by hand'],
      ['receiverName', "Receiver's Name", 'Who takes the car'],
      ['receiverContact', 'Receiver Contact', 'Also printed as Misc on the Delivery Note'],
      ['receiverCnic', 'Receiver CNIC'],
      ['userName', 'User Name', "Empty: the receiver's name is printed"],
      ['regNo', 'Reg no', 'When the plate is issued'],
      ['authority', 'Authority Letter & CNIC', 'Empty: ticked by hand'],
      ['invoiceAttached', 'Invoice Attached', 'Empty: ticked by hand'],
      ['date', 'Date', "Today's date"],
      ['orderNo', 'Order No / PBO No'],
      ['invoiceNo', 'Invoice No', 'From the vehicle invoice, when received'],
      ['customerCode', 'Customer Code (Gate Pass)', 'Optional: written by hand if empty'],
      ['warrantyNo', 'Warranty / Book No (Gate Pass)', 'Optional: written by hand if empty'],
      ['make', 'Make'],
      ['model', 'Model'],
      ['variant', 'Variant'],
      ['year', 'Year'],
      ['chassis', 'Chassis'],
      ['engine', 'Engine No'],
      ['color', 'Color'],
      ['owner', 'Owner / Name of Customer'],
      ['contact', 'Contact (customer)', "The customer's phone from the order"],
      ['address', 'Address', "The customer's address"],
    ],
    editable: ['time', 'receiverName', 'receiverContact', 'receiverCnic', 'userName', 'regNo', 'authority', 'invoiceAttached', 'invoiceNo', 'customerCode', 'warrantyNo'],
    headings: {
      time: 'Date and time (all documents)',
      receiverName: 'Who is receiving the car (Acceptance Note and Delivery Note)',
      userName: 'Vehicle Delivery Acceptance Note',
      authority: 'Delivery Note (back page)',
      invoiceNo: 'Gate Pass',
    },
    build: buildAllDocumentsPdf,
  },
};
const KINDS: DeliveryDocKind[] = ['acceptance', 'note', 'undertakings', 'gatepass'];

const SELECTS: Partial<Record<Key, [value: string, text: string][]>> = {
  authority: [
    ['', 'Leave to tick by hand'],
    ['yes', 'YES'],
    ['no', 'NO'],
    ['na', 'NA'],
  ],
  invoiceAttached: [
    ['', 'Leave to tick by hand'],
    ['yes', 'YES'],
    ['undertaking', 'Undertaking'],
  ],
};

/** Whoever types: phone numbers keep digits only. */
const clean = (k: Key, v: string) => (k === 'receiverContact' || k === 'contact' ? v.replace(/[^\d+\s-]/g, '') : v);

/**
 * A delivery document: opens with everything the order knows (locked), the receiver's details can be typed (or the customer
 * ticked as the receiver), and what is shown is what prints: look it over, save it, then print or download. A saved
 * document opens again with the data that was entered.
 */
export function AcceptanceNoteDialog({ order, kind = 'acceptance', dealershipId, saved, viewOnly = false, onClose }: { order?: SalesOrder | null; kind?: DeliveryDocKind; dealershipId: number; saved?: DeliveryDocument | null; /** Opens a saved document to look at and print; "Edit" unlocks it. */ viewOnly?: boolean; onClose: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(!viewOnly);
  const ro = !editing;
  const doc = DOCS[kind];
  // With an order the document starts filled from it; without one (typed in by hand) it starts empty; a saved one, as it was saved.
  const { data, error, isFetching } = useGetAcceptanceNoteQuery({ id: order?.id ?? 0 }, { skip: !order, refetchOnMountOrArgChange: true });
  const [form, setForm] = useState<AcceptanceForm | null>(saved ? ({ ...blankAcceptanceForm(), ...saved.data } as AcceptanceForm) : order ? null : blankAcceptanceForm());
  // The preview follows the typing after a short pause.
  const [shown, setShown] = useState<AcceptanceForm | null>(null);
  // The customer who booked the car comes to take it: his name, contact and CNIC fill the receiver; someone else: typed by hand.
  const [isOwner, setIsOwner] = useState(false);
  const ownerCnic = data?.ownerCnic ?? '';
  useEffect(() => {
    if (data && !form) setForm(acceptanceFormFrom(data));
  }, [data, form]);
  useEffect(() => {
    if (!form) return;
    const t = setTimeout(() => setShown(form), 350);
    return () => clearTimeout(t);
  }, [form]);
  const label = order ? `${order.orderNo}${order.customerName ? ` - ${order.customerName}` : ''}` : saved?.label || form?.owner || form?.chassis || 'typed by hand';
  const build = useMemo(() => (shown ? () => doc.build(shown, label) : null), [shown, label, doc]);
  const pdf = usePdf(build);
  const frame = useRef<HTMLIFrameElement>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  // Saving: the first time it is a new record, then the same record is updated.
  const [savedId, setSavedId] = useState<number | null>(saved?.id ?? null);
  const [savedJson, setSavedJson] = useState<string | null>(saved ? JSON.stringify({ ...blankAcceptanceForm(), ...saved.data }) : null);
  const [create, { isLoading: creating }] = useSaveDeliveryDocumentMutation();
  const [update, { isLoading: updating }] = useUpdateDeliveryDocumentMutation();
  const dirty = !!form && JSON.stringify(form) !== savedJson;
  const save = async () => {
    if (!form) return;
    const body = { kind, dealershipId, orderId: order?.id ?? null, label: order ? label : form.owner || form.chassis || label, data: { ...form } as Record<string, string> };
    try {
      const r = savedId ? await update({ id: savedId, deliveryDocumentRequest: body }).unwrap() : await create({ deliveryDocumentRequest: body }).unwrap();
      setSavedId(r.id);
      setSavedJson(JSON.stringify(form));
      toast.success('Saved: you can open it again from the saved documents');
    } catch (e) {
      toast.error(e);
    }
  };

  const download = () => {
    if (!pdf) return;
    const a = document.createElement('a');
    a.href = pdf.url;
    a.download = pdf.fileName;
    a.click();
    toast.success(`${pdf.fileName} downloaded`);
  };
  const print = () => {
    if (!pdf || loadedUrl !== pdf.url) return;
    try {
      frame.current?.contentWindow?.focus();
      frame.current!.contentWindow!.print();
    } catch {
      window.open(pdf.url, '_blank', 'noopener');
    }
  };

  const fields = order ? [...doc.fields.filter(([k]) => doc.editable.includes(k)), ...doc.fields.filter(([k]) => !doc.editable.includes(k))] : doc.fields;
  const firstLocked = order ? fields.find(([k]) => !doc.editable.includes(k))?.[0] : undefined;

  return (
    <Dialog
      open
      onClose={onClose}
      size="full"
      title={ro ? `${doc.title} (saved)` : doc.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {ro ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : (
            <Button variant="secondary" loading={creating || updating} disabled={!form || (!!savedId && !dirty)} onClick={() => void save()}>
              {savedId && !dirty ? 'Saved ✓' : savedId ? 'Save changes' : 'Save'}
            </Button>
          )}
          <Button variant="secondary" disabled={!pdf || loadedUrl !== pdf.url} onClick={print}>
            <PrintIcon />
            Print
          </Button>
          <Button disabled={!pdf} onClick={download}>
            <DownloadIcon className="size-4" />
            Download PDF
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-red-700">{apiErrorMessage(error)}</p>
      ) : !form ? (
        <div className="grid h-60 place-items-center">
          <Spinner />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) minmax(0, 1fr)', gap: 20, height: 'calc(100vh - 190px)', minHeight: 420 }}>
          <div style={{ overflowY: 'auto', minHeight: 0, paddingRight: 8 }}>
            <p className="mb-3 text-sm text-slate-600">
              {ro
                ? 'A saved document: look it over and print or download it. Press Edit to change it.'
                : order
                ? 'The car and customer details come from the order and are locked. Only fill in who is receiving the car (or leave it to write by hand).'
                : "Type everything for this car by hand. The receiver's details can be left empty to write on the printed document."}
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {fields.map(([k, text, hint]) => {
                const locked = ro || (!!order && !doc.editable.includes(k));
                const options = SELECTS[k];
                return (
                  <Fragment key={k}>
                    {doc.headings?.[k] && <p className="col-span-2 mt-2 text-xs font-semibold tracking-wide text-brand-700 uppercase">{doc.headings[k]}</p>}
                    {k === 'receiverName' && (
                      <label className="col-span-2 mt-1 flex cursor-pointer items-start gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-sm ring-1 ring-brand-200">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 rounded border-slate-300"
                          checked={isOwner}
                          disabled={ro}
                          onChange={(e) => {
                            const on = e.target.checked;
                            setIsOwner(on);
                            // Ticked: the customer takes the car, so his details fill the receiver. Unticked: someone else, typed by hand.
                            setForm((s) => (s ? { ...s, receiverName: on ? s.owner : '', receiverContact: on ? s.contact : '', receiverCnic: on ? ownerCnic : '' } : s));
                          }}
                        />
                        <span>
                          <b className="text-slate-900">The customer who booked the car is receiving it</b>
                          <span className="block text-xs text-slate-600">Tick to fill the receiver from the customer. If someone else takes the car, leave it unticked and type their details.</span>
                        </span>
                      </label>
                    )}
                    {k === firstLocked && <p className="col-span-2 mt-2 border-t border-slate-200 pt-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">From the order (locked)</p>}
                    <Field label={text} htmlFor={`an-${k}`} hint={locked ? undefined : hint} className={k === 'address' || k === 'owner' || options ? 'col-span-2' : undefined}>
                      {options ? (
                        <Select id={`an-${k}`} value={form[k]} disabled={ro} onChange={(e) => setForm((s) => (s ? { ...s, [k]: e.target.value } : s))}>
                          {options.map(([v, t]) => (
                            <option key={v} value={v}>
                              {t}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          id={`an-${k}`}
                          value={form[k]}
                          disabled={locked}
                          className={locked ? 'bg-slate-100 text-slate-700' : undefined}
                          onChange={(e) => {
                            // Typing a different receiver means it is no longer the customer.
                            if (isOwner && RECEIVER.includes(k)) setIsOwner(false);
                            setForm((s) => (s ? { ...s, [k]: clean(k, e.target.value) } : s));
                          }}
                        />
                      )}
                    </Field>
                  </Fragment>
                );
              })}
            </div>
            {order && isFetching && <p className="mt-2 text-xs text-slate-500">Refreshing from the order…</p>}
          </div>
          <div className="relative overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200" style={{ height: '100%', minHeight: 0 }}>
            {!pdf ? (
              <div className="grid h-full place-items-center">
                <Spinner />
              </div>
            ) : (
              <iframe ref={frame} title={`${doc.title} preview`} src={`${pdf.url}#view=FitH&toolbar=0`} className="size-full" onLoad={() => setLoadedUrl(pdf.url)} />
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** One line of the list of documents: its name, what it is, and a button. */
function DocRow({ kind, onOpen, button }: { kind: DeliveryDocKind; onOpen: () => void; button: string }) {
  const d = DOCS[kind];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <div>
        <p className="text-sm font-semibold text-slate-900">{d.title}</p>
        <p className="text-xs text-slate-600">{d.text}</p>
      </div>
      <Button size="sm" onClick={onOpen}>
        <PrintIcon />
        {button}
      </Button>
    </div>
  );
}

/** The one button that opens every document filled in, to print them all together. */
function AllRow({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-3.5 ring-1 ring-brand-200">
      <div>
        <p className="text-sm font-semibold text-slate-900">All documents together</p>
        <p className="text-xs text-slate-600">Opens every document filled in, document by document, and prints them all in one go (5 pages).</p>
      </div>
      <Button size="sm" onClick={onOpen}>
        <PrintIcon />
        Open and print all
      </Button>
    </div>
  );
}

/** The saved documents (of one order, or all with a search): open one to view, print or correct it again. */
function SavedDocs({ orderId, search, onOpen }: { orderId?: number; search?: string; onOpen: (d: DeliveryDocument, viewOnly: boolean) => void }) {
  const toast = useToast();
  const { data, isFetching } = useListDeliveryDocumentsQuery({ orderId, q: search || undefined });
  const [remove, { isLoading: removing }] = useRemoveDeliveryDocumentMutation();
  if (!data?.length) return <p className="text-sm text-slate-500">{isFetching ? 'Loading…' : 'Nothing saved yet.'}</p>;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
      {data.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {DOCS[d.kind].title}
              <span className="ml-2 font-normal text-slate-600">{d.label}</span>
            </p>
            <p className="text-xs text-slate-500">
              Saved {formatDateTime(d.updatedAt)}
              {d.updatedByName ? ` by ${d.updatedByName}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onOpen(d, true)}>
              View
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onOpen(d, false)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={removing}
              onClick={async () => {
                if (!window.confirm('Remove this saved document?')) return;
                try {
                  await remove({ id: d.id }).unwrap();
                  toast.success('Removed');
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Remove
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The delivery documents of an order, under its vehicle: each opens filled from the order, to print before the car goes. */
export function OrderDeliveryDocs({ order }: { order: SalesOrder }) {
  const perm = usePermission();
  const [open, setOpen] = useState<{ kind: DeliveryDocKind; saved?: DeliveryDocument; viewOnly?: boolean } | null>(null);
  // These are Jetour's own forms.
  const brand = [P.ordersViewAll, P.ordersViewOwn].flatMap((c) => perm.dealershipsFor(c)).find((d) => d.id === order.dealershipId)?.brand;
  if (brand !== 'Jetour' || !order.vehicleId || order.status === 'cancelled') return null;
  return (
    <Section compact title="Delivery documents">
      <AllRow onOpen={() => setOpen({ kind: 'all' })} />
      <div className="space-y-2">
        {KINDS.map((k) => (
          <DocRow key={k} kind={k} onOpen={() => setOpen({ kind: k })} button="Open and print" />
        ))}
      </div>
      <h3 className="mt-4 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Saved for this order</h3>
      <SavedDocs orderId={order.id} onOpen={(d, viewOnly) => setOpen({ kind: d.kind, saved: d, viewOnly })} />
      {open && <AcceptanceNoteDialog order={order} kind={open.kind} saved={open.saved} viewOnly={open.viewOnly} dealershipId={order.dealershipId} onClose={() => setOpen(null)} />}
    </Section>
  );
}

/** The button on the Deliveries page: all the delivery documents, each opened empty to be typed by hand (no lead or order needed), and the saved ones. */
export function DeliveryDocumentsButton() {
  const perm = usePermission();
  const [list, setList] = useState(false);
  const [open, setOpen] = useState<{ kind: DeliveryDocKind; saved?: DeliveryDocument; viewOnly?: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const jetour = [P.ordersViewAll, P.deliveriesViewAll].flatMap((c) => perm.dealershipsFor(c)).find((d) => d.brand === 'Jetour');
  if (!jetour) return null;
  const pick = (next: { kind: DeliveryDocKind; saved?: DeliveryDocument; viewOnly?: boolean }) => {
    setList(false);
    setOpen(next);
  };
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setList(true)} title="Open the delivery documents, fill them in by hand, or open the saved ones">
        <PrintIcon />
        Delivery documents
      </Button>
      {list && (
        <Dialog
          open
          onClose={() => setList(false)}
          size="lg"
          title="Delivery documents"
          footer={
            <Button variant="secondary" onClick={() => setList(false)}>
              Close
            </Button>
          }
        >
          <p className="mb-3 text-sm text-slate-600">Open a document and type its details by hand, for a car with no lead or order. For a car on an order, open it from the order page: it is filled in for you.</p>
          <AllRow onOpen={() => pick({ kind: 'all' })} />
          <div className="space-y-2">
            {KINDS.map((k) => (
              <DocRow key={k} kind={k} onOpen={() => pick({ kind: k })} button="Open" />
            ))}
          </div>
          <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Saved documents</h3>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by order number or customer name" className="mb-2" />
          <SavedDocs search={search.trim()} onOpen={(d, viewOnly) => pick({ kind: d.kind, saved: d, viewOnly })} />
        </Dialog>
      )}
      {open && <AcceptanceNoteDialog kind={open.kind} saved={open.saved} viewOnly={open.viewOnly} dealershipId={open.saved?.dealershipId ?? jetour.id} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * "Documents" on a car in the Deliveries list: what was saved for its order first, then every delivery document, filled in
 * from the order, to open and print.
 */
export function CarDocumentsButton({ orderId }: { orderId: number }) {
  const [list, setList] = useState(false);
  const [open, setOpen] = useState<{ kind: DeliveryDocKind; saved?: DeliveryDocument; viewOnly?: boolean } | null>(null);
  const { data: order, error } = useGetSalesOrderQuery({ id: orderId }, { skip: !list && !open });
  // One window at a time: the list steps aside for the document and comes back when it is closed.
  const pick = (next: { kind: DeliveryDocKind; saved?: DeliveryDocument; viewOnly?: boolean }) => {
    setList(false);
    setOpen(next);
  };
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setList(true)} title="The delivery documents of this car">
        <PrintIcon />
        Documents
      </Button>
      {list && (
        <Dialog
          open
          onClose={() => setList(false)}
          size="lg"
          title={order ? `Documents — ${order.customerName ?? order.orderNo}` : 'Documents'}
          footer={
            <Button variant="secondary" onClick={() => setList(false)}>
              Close
            </Button>
          }
        >
          {/* The window opens from a table cell: its text reads from the left like any other window. */}
          <div className="text-left">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Saved for this car</h3>
            <SavedDocs orderId={orderId} onOpen={(d, viewOnly) => pick({ kind: d.kind, saved: d, viewOnly })} />
            <h3 className="mt-5 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">All documents</h3>
            {error ? (
              <p className="text-sm text-red-700">{apiErrorMessage(error)}</p>
            ) : !order ? (
              <Spinner className="mx-auto my-6 size-5 text-slate-400" />
            ) : (
              <>
                <AllRow onOpen={() => pick({ kind: 'all' })} />
                <div className="space-y-2">
                  {KINDS.map((k) => (
                    <DocRow key={k} kind={k} onOpen={() => pick({ kind: k })} button="Open and print" />
                  ))}
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}
      {open && order && (
        <AcceptanceNoteDialog
          order={order}
          kind={open.kind}
          saved={open.saved}
          viewOnly={open.viewOnly}
          dealershipId={order.dealershipId}
          onClose={() => {
            setOpen(null);
            setList(true);
          }}
        />
      )}
    </>
  );
}
