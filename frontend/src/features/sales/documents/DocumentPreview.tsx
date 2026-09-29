import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Spinner } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { apiErrorMessage } from '@/shared/lib';
import { useGetPpfDocumentQuery, useGetQuotationDocumentQuery } from '../salesApi';
import { type BuiltPdf, buildPpfPdf, buildQuotationPdf } from './pdf';

export type DocKind = 'quotation' | 'ppf';
export const DOC_TITLES: Record<DocKind, string> = { quotation: 'Vehicle quotation', ppf: 'PPF voucher' };
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
function useDocumentPdf(kind: DocKind, id: number, skip: boolean) {
  const q = useGetQuotationDocumentQuery({ id }, { skip: skip || kind !== 'quotation', refetchOnMountOrArgChange: true });
  const p = useGetPpfDocumentQuery({ id }, { skip: skip || kind !== 'ppf', refetchOnMountOrArgChange: true });
  const res = kind === 'quotation' ? q : p;
  const [build, setBuild] = useState<(() => Promise<BuiltPdf>) | null>(null);
  useEffect(() => {
    if (skip || res.isFetching) return setBuild(null);
    if (kind === 'quotation' && q.data) setBuild(() => () => buildQuotationPdf(q.data!));
    if (kind === 'ppf' && p.data) setBuild(() => () => buildPpfPdf(p.data!));
  }, [skip, kind, q.data, p.data, res.isFetching]);
  const pdf = usePdf(build);
  return { pdf, error: res.error, loading: res.isFetching || (!!res.data && !pdf) };
}

/**
 * Shows the document as it will print, so it can be checked before it goes to the customer, then
 * downloads or prints it. Used for quotations and PPF vouchers.
 */
export function DocumentPreview({ kind, id, open, onClose }: { kind: DocKind; id: number; open: boolean; onClose: () => void }) {
  const { pdf, error, loading } = useDocumentPdf(kind, id, !open);
  const title = pdf ? `${DOC_TITLES[kind]} — ${pdf.fileName.replace(/\.pdf$/, '')}` : DOC_TITLES[kind];
  return <PdfDialog open={open} onClose={onClose} title={title} pdf={pdf} error={error} loading={loading} />;
}

/** A drawn PDF in a dialog: shown as it will print, then downloaded or printed. */
export function PdfDialog({ open, onClose, title, pdf, error, loading }: { open: boolean; onClose: () => void; title: string; pdf: ShownPdf | null; error?: unknown; loading?: boolean }) {
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
