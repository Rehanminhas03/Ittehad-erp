import { useEffect, useState } from 'react';
import { Button, Dialog } from '@/shared/components/ui';
import { type CsvPreview, saveCsv, setCsvPreviewHandler } from './exporters';

const SHOWN = 500;
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Every "Excel" export opens here first: the table to look over, then Print or Download Excel. Mounted once in the app shell. */
export function CsvPreviewHost() {
  const [p, setP] = useState<CsvPreview | null>(null);
  useEffect(() => {
    setCsvPreviewHandler(setP);
    return () => setCsvPreviewHandler(null);
  }, []);
  if (!p) return null;
  const title = p.fileName.replace(/.csv$/, '');
  const cells = (r: CsvPreview['rows'][number]) => p.columns.map((c) => c.value(r));
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const head = p.columns.map((c) => `<th>${esc(c.header)}</th>`).join('');
    const body = p.rows.map((r) => `<tr>${cells(r).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('');
    w.document.write(`<!doctype html><title>${esc(title)}</title><style>body{font:11px Arial,sans-serif;margin:12mm}h1{font-size:15px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top;white-space:pre-line}th{background:#1e3a8a;color:#fff}@page{size:landscape}</style><h1>${esc(title)}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Dialog
      open
      onClose={() => setP(null)}
      size="xl"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={() => setP(null)}>
            Close
          </Button>
          <Button variant="secondary" onClick={print}>
            Print
          </Button>
          <Button onClick={() => saveCsv(p.fileName, p.columns, p.rows)}>Download Excel (CSV)</Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-slate-500">
        {p.rows.length} rows{p.rows.length > SHOWN ? ` (the first ${SHOWN} are shown here; the download and the print have all of them)` : ''}. Check it, then print or download.
      </p>
      <div className="max-h-[60vh] overflow-auto rounded-lg ring-1 ring-slate-200">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              {p.columns.map((c) => (
                <th key={c.header} className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-slate-600">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.rows.slice(0, SHOWN).map((r, i) => (
              <tr key={i}>
                {cells(r).map((v, j) => (
                  <td key={j} className="whitespace-pre-line px-2 py-1 align-top text-slate-800">
                    {v == null ? '' : String(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
