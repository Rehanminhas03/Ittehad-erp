import { describe, expect, it } from 'vitest';
import { sessionCleared, sessionReceived } from '@/features/auth/authSlice';
import type { TokenResponse } from '@/features/auth/authApi.generated';
import { store } from './store';

const session = { accessToken: 't', expiresIn: 900, me: { user: { id: 1 } } } as unknown as TokenResponse;

describe('store: ending a session', () => {
  it('clears the API cache without recursing (regression: "Maximum call stack size exceeded")', () => {
    store.dispatch(sessionReceived(session));
    expect(() => store.dispatch(sessionCleared())).not.toThrow();
    expect(store.getState().auth.status).toBe('anonymous');
    // Signing in and out again keeps working.
    store.dispatch(sessionReceived(session));
    expect(() => store.dispatch(sessionCleared())).not.toThrow();
    expect(store.getState().auth.status).toBe('anonymous');
  });
});
