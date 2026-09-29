import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

export interface Toast {
  id: string;
  kind: 'success' | 'error' | 'info';
  message: string;
}

export interface UiState {
  /** Desktop: sidebar expanded or collapsed. */
  sidebarOpen: boolean;
  /** Phones / tablets: the navigation drawer slid over the page. */
  mobileNavOpen: boolean;
  toasts: Toast[];
}

const initialState: UiState = { sidebarOpen: true, mobileNavOpen: false, toasts: [] };

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setMobileNavOpen(state, action: PayloadAction<boolean>) {
      state.mobileNavOpen = action.payload;
    },
    toastShown: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts.push(action.payload);
      },
      prepare(kind: Toast['kind'], message: string) {
        return { payload: { id: nanoid(), kind, message } };
      },
    },
    toastDismissed(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const { toggleSidebar, setMobileNavOpen, toastShown, toastDismissed } = uiSlice.actions;
export default uiSlice.reducer;
