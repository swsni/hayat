import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './index.css';

const App = lazy(() => import('./App.tsx'));
const CafeCustomerApp = lazy(() => import('./components/CafeCustomerApp.tsx'));
const CafeBaristaDashboard = lazy(() => import('./components/CafeBaristaDashboard.tsx'));
const CafeAnalyticsDashboard = lazy(() => import('./components/CafeAnalyticsDashboard.tsx'));
import { LanguageProvider } from './LanguageContext';

// Register Service Worker for seamless offline caching and operations fallback
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[PWA] Service Worker registered in scope:', registration.scope);
      })
      .catch((error) => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  });
}

const root = document.getElementById('root')!;
const path = window.location.pathname;


let Component = App;
if (path.startsWith('/cafe/analytics')) {
  Component = CafeAnalyticsDashboard;
} else if (path.startsWith('/cafe/admin')) {
  Component = CafeBaristaDashboard;
} else if (path.startsWith('/cafe')) {
  Component = CafeCustomerApp;
}

createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>Loading...</div>}>
        <Component />
      </Suspense>
    </LanguageProvider>
  </StrictMode>,
);
