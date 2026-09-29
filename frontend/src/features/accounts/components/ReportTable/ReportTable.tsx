import type { ReactNode } from 'react';
import { cn } from '@/shared/lib';

export interface ReportColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  /** Right-aligned tabular figures (amounts). */
  numeric?: boolean;
  className?: string;
}

/** Plain, dense table for ledgers and financial reports, with an optional totals row. */
export function ReportTable<T>({
  rows,
  columns,
  rowKey,
  totals,
}: {
  rows: T[];
  columns: ReportColumn<T>[];
  rowKey: (row: T) => string | number;
  /** Cells of a bold totals row, aligned with the columns (null = empty cell). */
  totals?: (ReactNode | null)[];
}) {
  const cell = (c: ReportColumn<T>) => cn('py-2 pr-3', c.numeric && 'text-right tabular-nums whitespace-nowrap', c.className);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
            {columns.map((c) => (
              <th key={c.header} className={cn(cell(c), 'font-medium')}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.header} className={cell(c)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
              {columns.map((c, i) => (
                <td key={c.header} className={cell(c)}>
                  {totals[i]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
