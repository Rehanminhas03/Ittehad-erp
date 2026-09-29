import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Me, TokenResponse } from './authApi.generated';

export type SessionStatus = 'checking' | 'authenticated' | 'anonymous';

export interface AuthState {
  /** Kept in memory only; the refresh token lives in an httpOnly cookie. */
  accessToken: string | null;
  me: Me | null;
  status: SessionStatus;
}

const initialState: AuthState = { accessToken: null, me: null, status: 'checking' };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionReceived(state, action: PayloadAction<TokenResponse>) {
      state.accessToken = action.payload.accessToken;
      state.me = action.payload.me;
      state.status = 'authenticated';
    },
    meRefreshed(state, action: PayloadAction<Me>) {
      state.me = action.payload;
    },
    sessionCleared(state) {
      state.accessToken = null;
      state.me = null;
      state.status = 'anonymous';
    },
  },
});

export const { sessionReceived, meRefreshed, sessionCleared } = authSlice.actions;
export default authSlice.reducer;
