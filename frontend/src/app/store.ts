import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import authReducer, { sessionCleared } from '@/features/auth/authSlice';
import uiReducer from '@/features/ui/uiSlice';
import { baseApi } from '@/shared/api/baseApi';

const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
  [baseApi.reducerPath]: baseApi.reducer,
});

export function makeStore(preloaded?: Partial<ReturnType<typeof rootReducer>>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: preloaded,
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });
  setupListeners(store.dispatch);
  return store;
}

export const store = makeStore();

// Signing out (or a session ending) drops every cached server response, so the next user never sees
// stale data. `last` is updated BEFORE dispatching: the reset notifies this same listener again, and
// with the old value it would reset again, recursing until "Maximum call stack size exceeded".
store.subscribe(
  (() => {
    let last = store.getState().auth.status;
    return () => {
      const now = store.getState().auth.status;
      const ended = last === 'authenticated' && now === 'anonymous';
      last = now;
      if (ended) store.dispatch(baseApi.util.resetApiState());
    };
  })(),
);

export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
export { sessionCleared };
