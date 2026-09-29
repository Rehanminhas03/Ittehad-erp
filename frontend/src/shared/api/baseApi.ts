import {
  type BaseQueryFn,
  createApi,
  type FetchArgs,
  fetchBaseQuery,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { type AuthState, sessionCleared, sessionReceived } from '@/features/auth/authSlice';
import type { TokenResponse } from '@/features/auth/authApi.generated';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '',
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as { auth: AuthState }).auth.accessToken;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

// One refresh at a time: concurrent 401s wait for the same rotation instead of racing
// (a second rotation with the old cookie would trip the server's reuse detection).
let refreshing: Promise<boolean> | null = null;

export const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extra) => {
  let result = await rawBaseQuery(args, api, extra);
  const url = typeof args === 'string' ? args : args.url;
  if (result.error?.status === 401 && !url.startsWith('/api/auth/')) {
    refreshing ??= (async () => {
      const r = await rawBaseQuery({ url: '/api/auth/refresh', method: 'POST' }, api, extra);
      if (r.data) {
        api.dispatch(sessionReceived(r.data as TokenResponse));
        return true;
      }
      api.dispatch(sessionCleared());
      return false;
    })().finally(() => {
      refreshing = null;
    });
    if (await refreshing) result = await rawBaseQuery(args, api, extra);
  }
  return result;
};

/**
 * Single RTK Query API; feature endpoints are generated from the backend OpenAPI schema
 * (see openapi-config.cjs) and injected here.
 */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  // Cached data survives navigation (e.g. switching role dashboards) for 5 minutes without refetching.
  keepUnusedDataFor: 300,
  refetchOnMountOrArgChange: false,
  endpoints: () => ({}),
});
