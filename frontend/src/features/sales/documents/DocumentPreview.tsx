import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, Dialog, Spinner } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { apiErrorMessage } from '@/shared/lib';
import { useGetDeliveryNoteQuery, useGetPpfDocumentQuery, useGetQuotationDocumentQuery } from '../salesApi';
import { type BuiltPdf, buildDeliveryNotePdf, buildPpfPdf, buildQuotationPdf, usesLetterhead } from './pdf';

export type DocKind = 'quotation' | 'ppf' | 'delivery_note';
export const DOC_TITLES: Record<DocKind, string> = { quotation: 'Vehicle quotation', ppf: 'PPF voucher', delivery_note: 'Delivery note' };
/** A drawn PDF and the bytes shown in the preview; download and print use these same bytes. */
export type ShownPdf = BuiltPdf & { url: string; blob: Blob };

const Icon = ({ d, className = 'size-4' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
    <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const DownloadIcon = ({ className }: { className?: string }) => (
  <Icon className={className} d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14.5v1A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5v-1" />
);
export const PrintIcon = ({ className }: { className?: string }) => (
  <Icon className={className} d="M6 7V3h8v4M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 11h8v6H6z" />
);
export const EyeIcon = ({ className }: { className?: string }) => (
  <Icon className={className} d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Zm8 2.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" />
);

/** Draws a PDF whenever `build` changes (null = nothing to draw yet) and serves it from a blob URL. */
export function usePdf(build: (() => Promise<BuiltPdf>) | null) {
  const [pdf, setPdf] = useState<ShownPdf | null>(null);
  useEffect(() => {
    if (!build) return;
    let url: string | null = null;
    let cancelled = false;
    build().then((built) => {
      if (cancelled) return;
      // Output once: a second jsPDF output of the same document comes out uncompressed.
      const blob = built.doc.output('blob');
      url = URL.createObjectURL(blob);
      setPdf({ ...built, url, blob });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setPdf(null);
    };
  }, [build]);
  return pdf;
}

/** Fetches what the document shows (always the latest saved version and format) and draws its PDF. */
function useDocumentPdf(kind: DocKind, id: number, skip: boolean, letterhead: boolean | null) {
  const q = useGetQuotationDocumentQuery({ id }, { skip: skip || kind !== 'quotation', refetchOnMountOrArgChange: true });
  const p = useGetPpfDocumentQuery({ id }, { skip: skip || kind !== 'ppf', refetchOnMountOrArgChange: true });
  const n = useGetDeliveryNoteQuery({ id }, { skip: skip || kind !== 'delivery_note', refetchOnMountOrArgChange: true });
  const res = kind === 'quotation' ? q : kind === 'ppf' ? p : n;
  const [build, setBuild] = useState<(() => Promise<BuiltPdf>) | null>(null);
  useEffect(() => {
    if (skip || res.isFetching) return setBuild(null);
    if (kind === 'quotation' && q.data) {
      const onPaper = letterhead ?? usesLetterhead(q.data.dealership.code);
      setBuild(() => () => buildQuotationPdf(q.data!, { letterhead: onPaper }));
    }
    if (kind === 'ppf' && p.data) setBuild(() => () => buildPpfPdf(p.data!));
    if (kind === 'delivery_note' && n.data) setBuild(() => () => buildDeliveryNotePdf(n.data!));
  }, [skip, kind, q.data, p.data, n.data, res.isFetching, letterhead]);
  const pdf = usePdf(build);
  const letterheadDefault = kind === 'quotation' && !!q.data && usesLetterhead(q.data.dealership.code);
  return { pdf, error: res.error, loading: res.isFetching || (!!res.data && !pdf), letterheadDefault, quotation: kind === 'quotation' ? q.data : undefined };
}

/**
 * Shows the document as it will print, so it can be checked before it goes to the customer, then
 * downloads or prints it. Used for quotations, PPF vouchers and delivery notes.
 */
export function DocumentPreview({ kind, id, open, onClose }: { kind: DocKind; id: number; open: boolean; onClose: () => void }) {
  // Quotations of Hyundai / Jetour print on their letterhead paper (no header / footer) by default;
  // untick for the full page (e.g. to send it on WhatsApp).
  const [letterhead, setLetterhead] = useState<boolean | null>(null);
  const { pdf, error, loading, letterheadDefault, quotation } = useDocumentPdf(kind, id, !open, letterhead);
  const toast = useToast();
  const [sharing, setSharing] = useState(false);
  const title = pdf ? `${DOC_TITLES[kind]} — ${pdf.fileName.replace(/\.pdf$/, '')}` : DOC_TITLES[kind];
  const onPaper = letterhead ?? letterheadDefault;

  // WhatsApp: always the full page (header, footer, stamp and signature). On a phone the PDF is shared
  // straight to WhatsApp (pick the chat); on a computer it is downloaded and the customer's chat opened.
  const sendOnWhatsApp = async () => {
    if (!quotation) return;
    setSharing(true);
    try {
      const built = await buildQuotationPdf(quotation, { letterhead: false });
      const file = new File([built.doc.output('blob')], built.fileName, { type: 'application/pdf' });
      const message = `Dear ${quotation.billTo || quotation.customer.name}, please find attached your vehicle quotation ${quotation.quotationNo} from ${quotation.dealership.name}.`;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: built.fileName, text: message });
        return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = built.fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      const digits = quotation.customer.mobile.replace(/\D/g, '');
      const intl = digits.startsWith('0') ? `92${digits.slice(1)}` : digits;
      window.open(`https://wa.me/${intl}?text=${encodeURIComponent(`${message} (The PDF has been downloaded: attach it here.)`)}`, '_blank', 'noopener');
      toast.success('Quotation downloaded and WhatsApp opened: attach the PDF in the chat');
    } catch (e) {
      // Closing the share sheet is not an error.
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast.error(e);
    } finally {
      setSharing(false);
    }
  };

  const extra =
    kind === 'quotation' ? (
      <div className="mr-auto flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Version">
          {(
            [
              [true, 'Letterhead paper (print)', 'No logos, header or footer: they are printed on the letterhead paper'],
              [false, 'Full page (WhatsApp / email)', 'With the header, footer, logos, stamp and signature'],
            ] as const
          ).map(([value, text, hint]) => (
            <button
              key={text}
              type="button"
              role="radio"
              aria-checked={onPaper === value}
              title={hint}
              onClick={() => setLetterhead(value)}
              className={onPaper === value ? 'rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-brand-700 shadow-sm' : 'rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900'}
            >
              {text}
            </button>
          ))}
        </div>
        <Button variant="secondary" loading={sharing} disabled={!quotation} onClick={() => void sendOnWhatsApp()} className="!text-emerald-700">
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3Z" />
          </svg>
          Send on WhatsApp
        </Button>
      </div>
    ) : undefined;
  return <PdfDialog open={open} onClose={onClose} title={title} pdf={pdf} error={error} loading={loading} extra={extra} />;
}

/** A drawn PDF in a dialog: shown as it will print, then downloaded or printed. */
export function PdfDialog({
  open,
  onClose,
  title,
  pdf,
  error,
  loading,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  pdf: ShownPdf | null;
  error?: unknown;
  loading?: boolean;
  /** Shown at the start of the footer (e.g. the letterhead paper option). */
  extra?: ReactNode;
}) {
  const toast = useToast();
  const frame = useRef<HTMLIFrameElement>(null);
  // Printing is offered once the PDF has loaded in the preview (earlier, the browser would print a blank page).
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  const download = () => {
    if (!pdf) return;
    // The previewed bytes, so what was checked is exactly what is saved.
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
      // Browsers that cannot print an embedded PDF: open it in a tab to print from there.
      window.open(pdf.url, '_blank', 'noopener');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={title}
      footer={
        <>
          {extra}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {pdf && (
            <a href={pdf.url} target="_blank" rel="noopener" className="inline-flex items-center rounded-lg px-3 text-sm font-medium text-brand-700 hover:underline md:hidden">
              Open
            </a>
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
      <div className="relative h-[70vh] min-h-80 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
        {error ? (
          <p className="p-6 text-sm text-red-700">{apiErrorMessage(error)}</p>
        ) : loading || !pdf ? (
          <div className="grid h-full place-items-center">
            <Spinner />
          </div>
        ) : (
          <iframe ref={frame} title={`${title} preview`} src={`${pdf.url}#view=FitH&toolbar=0`} className="size-full" onLoad={() => setLoadedUrl(pdf.url)} />
        )}
      </div>
    </Dialog>
  );
}

/** A button that opens the delivery note (view, download, print) — signed by the customer at hand-over. */
export function DeliveryNoteButton({ deliveryId, size = 'sm', label = 'Delivery note' }: { deliveryId: number; size?: 'sm' | 'md'; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
      <Button size={size} variant="secondary" onClick={() => setOpen(true)}>
        <PrintIcon />
        {label}
      </Button>
      {open && <DocumentPreview kind="delivery_note" id={deliveryId} open onClose={() => setOpen(false)} />}
    </span>
  );
}
