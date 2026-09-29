import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RouteError } from './RouteError';

function Broken(): never {
  throw new TypeError("Cannot read properties of undefined (reading 'replace')");
}

describe('RouteError', () => {
  it('replaces a crashed page with a message and a Reload button', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const router = createMemoryRouter([{ path: '/', element: <Broken />, errorElement: <RouteError /> }]);
    render(<RouterProvider router={router} />);
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong on this page');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });
});
