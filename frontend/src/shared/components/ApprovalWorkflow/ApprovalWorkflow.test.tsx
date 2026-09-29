import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowDefinition } from '@/shared/entity';
import { ApprovalWorkflow } from './ApprovalWorkflow';

const definition: WorkflowDefinition = {
  stateKey: 'status',
  initial: 'draft',
  states: [
    { key: 'draft', label: 'Draft' },
    { key: 'submitted', label: 'Submitted' },
    { key: 'approved', label: 'Approved', terminal: true },
    { key: 'rejected', label: 'Rejected', terminal: true },
  ],
  transitions: [
    { action: 'submit', label: 'Submit', from: ['draft'], to: 'submitted', requiresComment: false },
    { action: 'approve', label: 'Approve', from: ['submitted'], to: 'approved', requiresComment: false },
    { action: 'reject', label: 'Reject', from: ['submitted'], to: 'rejected', requiresComment: true },
  ],
};

// <dialog> methods are not implemented in jsdom.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};

describe('ApprovalWorkflow', () => {
  it('offers only the actions the server allows for the current state', () => {
    render(<ApprovalWorkflow definition={definition} state="submitted" availableActions={['approve']} onTransition={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    expect(screen.getByText('Submitted', { selector: '[aria-current="step"]' })).toBeInTheDocument();
  });

  it('requires a comment for transitions that demand one', async () => {
    const onTransition = vi.fn().mockResolvedValue(undefined);
    render(<ApprovalWorkflow definition={definition} state="submitted" availableActions={['approve', 'reject']} onTransition={onTransition} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }));
    const confirm = screen.getAllByRole('button', { name: 'Reject' }).at(-1)!;
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/comment/i), 'Price too low');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onTransition).toHaveBeenCalledWith('reject', 'Price too low');
  });
});
