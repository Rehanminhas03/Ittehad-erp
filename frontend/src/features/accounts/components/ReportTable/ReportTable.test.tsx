import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReportTable } from './ReportTable';

describe('ReportTable', () => {
  it('renders rows and an aligned totals row', () => {
    render(
      <ReportTable
        rows={[
          { id: 1, name: 'Cash', debit: '100.00' },
          { id: 2, name: 'Bank', debit: '50.00' },
        ]}
        rowKey={(r) => r.id}
        columns={[
          { header: 'Account', render: (r) => r.name },
          { header: 'Debit', numeric: true, render: (r) => r.debit },
        ]}
        totals={['Total', '150.00']}
      />,
    );
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 2 + totals
    expect(within(rows[3]!).getByText('150.00').className).toContain('text-right');
    expect(within(rows[1]!).getByText('Cash')).toBeTruthy();
  });
});
