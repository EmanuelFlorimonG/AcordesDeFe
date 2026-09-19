import React, { Suspense, lazy, useSyncExternalStore } from 'react';
import App from '../App';
import { isAdminHash } from '../admin/routes';
import { FullScreenFallback } from '../components/Layout/ScreenFallback';

// The editorial panel is a separate, lazily loaded app: the songbook never downloads it.
const AdminApp = lazy(() => import('../components/Admin/AdminApp'));

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};

/** The songbook, or the editorial panel when the address is #/admin. */
export const Root: React.FC = () => {
  const admin = useSyncExternalStore(subscribeToHash, () => isAdminHash(window.location.hash));
  return admin ? (
    <Suspense fallback={<FullScreenFallback />}>
      <AdminApp />
    </Suspense>
  ) : (
    <App />
  );
};
