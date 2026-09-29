import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { store } from './app/store';
import { SessionBootstrap } from '@/features/auth';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <SessionBootstrap>
        <RouterProvider router={router} />
      </SessionBootstrap>
    </Provider>
  </StrictMode>,
);
