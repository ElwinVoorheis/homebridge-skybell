import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { routes } from './routes';
import './theme.css';

// The server already retries the slow SkyBell API; the user decides when to try again (FR-12).
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {routes.map((r) => (
            <Route key={r.path} path={r.path} element={r.element} />
          ))}
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
