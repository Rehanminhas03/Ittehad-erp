import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('shows the status in words', () => {
    render(<StatusBadge status="follow_up" />);
    expect(screen.getByText('Follow up')).toBeTruthy();
  });
  it('shows a dash instead of breaking the page when a record has no status', () => {
    render(<StatusBadge status={undefined} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
