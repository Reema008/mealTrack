import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ConfirmProvider } from './components/Confirm';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { SessionProvider } from './data/session';
import { AuthExpiredError, NetworkError } from './lib/errors';
import { initTheme } from './lib/theme';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      // Don't hammer the server for auth problems; do retry transient failures.
      retry: (count, err) => !(err instanceof AuthExpiredError) && count < (err instanceof NetworkError ? 5 : 2),
      networkMode: 'offlineFirst',
    },
  },
});

initTheme();
registerSW({
  immediate: true,
  // A new version reloads the app automatically (autoUpdate). Phones keep an
  // installed app alive in the background, so check again when it comes back.
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => void registration.update().catch(() => {});
    window.setInterval(check, 15 * 60_000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    window.addEventListener('online', check);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ToastProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </ToastProvider>
        </SessionProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
