import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { makeStore } from '@/app/store';
import type { Me } from '@/features/auth/authApi.generated';

export function renderWithStore(ui: ReactNode, { me, route = '/' }: { me: Me | null; route?: string }) {
  const store = makeStore({
    auth: { accessToken: me ? 'token' : null, me, status: me ? 'authenticated' : 'anonymous' },
  });
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </Provider>,
    ),
  };
}

export function meWith(codes: string[]): Me {
  return {
    user: { id: 1, email: 'u@test', fullName: 'Test User', phone: null },
    dealerships: [{ id: 1, code: 'HYD', name: 'Hyundai Islamabad', brand: 'Hyundai' }],
    branches: [],
    permissions: codes.map((code) => ({ code, global: true, dealershipIds: [], branchIds: [] })),
  };
}
