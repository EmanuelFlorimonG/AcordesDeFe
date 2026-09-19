import React, { useEffect, useMemo, useSyncExternalStore } from 'react';
import { LoaderCircle, LogOut } from 'lucide-react';
import { createEditorialRepository, type EditorialRepository } from '../../admin/editorialRepository';
import { adminHash, parseAdminRoute, sectionOf, type AdminRoute } from '../../admin/routes';
import type { EditorialRole } from '../../catalog/reviewContract';
import { getAdminServices } from '../../admin/supabaseAuth';
import { useAdminAccess } from '../../admin/useAdminAccess';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { secondaryButton } from '../Setlists/ui';
import { AdminCentered } from './AdminCentered';
import { AdminLayout } from './AdminLayout';
import { AdminLogin } from './AdminLogin';
import { AdminEmpty } from './AdminNotice';
import { AdminOverview } from './AdminOverview';
import { AdminSongDetail } from './AdminSongDetail';
import { AdminSongs } from './AdminSongs';
import { AdminSubmissionDetail } from './AdminSubmissionDetail';
import { AdminSubmissions } from './AdminSubmissions';

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const readHash = () => window.location.hash;

/**
 * #/admin: the editorial panel, a separate app inside GENESARET. It is its
 * own lazy chunk (with supabase-js), so the public songbook never downloads
 * it. Visitors are never asked to sign in; only this address has a sign-in.
 */
const AdminApp: React.FC = () => {
  const services = useMemo(() => getAdminServices(), []);
  const repository = useMemo(() => (services ? createEditorialRepository(services.data) : null), [services]);
  const { access, recheck } = useAdminAccess(services, repository);
  const hash = useSyncExternalStore(subscribeToHash, readHash);
  const route = parseAdminRoute(hash);
  // The same preference as the songbook, so switching between them never flashes.
  const [isDarkMode, setIsDarkMode] = useLocalStorage<boolean>('genesaret_dark_mode', false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // The panel is not for search engines, and its tab says where you are.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Panel editorial · Acordes de Fe';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => {
      document.title = previousTitle;
      robots.remove();
    };
  }, []);

  if (!services || !repository) {
    return (
      <AdminCentered>
        <h1 className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Panel no disponible</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Esta versión de la aplicación no está conectada al servidor.</p>
      </AdminCentered>
    );
  }

  const signOut = () => void services.auth.signOut();

  switch (access.state) {
    case 'loading':
    case 'checking':
      return (
        <div role="status" aria-live="polite" className="flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-sm text-slate-500 dark:bg-dark-950 dark:text-slate-400">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
          {access.state === 'loading' ? 'Cargando…' : 'Comprobando permisos…'}
        </div>
      );
    case 'signed-out':
      return <AdminLogin auth={services.auth} />;
    case 'no-role':
      return (
        <AdminCentered>
          <h1 className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Sin acceso</h1>
          <p role="alert" className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            No tienes permisos para acceder al panel editorial.
          </p>
          {access.session.email && (
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Sesión iniciada como <span className="font-semibold">{access.session.email}</span>.
            </p>
          )}
          <button type="button" onClick={signOut} className={`${secondaryButton} mt-5 w-full`}>
            <LogOut aria-hidden="true" className="h-4 w-4" />
            Cerrar sesión
          </button>
        </AdminCentered>
      );
    case 'error':
      return (
        <AdminCentered>
          <h1 className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white">No se pudieron comprobar tus permisos</h1>
          <p role="alert" className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Revisa tu conexión y vuelve a intentarlo.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={recheck} className={secondaryButton}>
              Reintentar
            </button>
            <button type="button" onClick={signOut} className={secondaryButton}>
              Cerrar sesión
            </button>
          </div>
        </AdminCentered>
      );
    case 'ready':
      return (
        <AdminReady
          repository={repository}
          route={route}
          userId={access.session.userId}
          email={access.session.email}
          role={access.role}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode((value) => !value)}
          onSignOut={signOut}
        />
      );
  }
};

interface AdminReadyProps {
  repository: EditorialRepository;
  route: AdminRoute;
  userId: string;
  email: string | null;
  role: EditorialRole;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onSignOut: () => void;
}

/** The panel once access is confirmed: the layout and the screen of the current route. */
export const AdminReady: React.FC<AdminReadyProps> = ({ repository, route, userId, email, role, isDarkMode, onToggleDarkMode, onSignOut }) => (
  <AdminLayout section={sectionOf(route)} email={email} role={role} isDarkMode={isDarkMode} onToggleDarkMode={onToggleDarkMode} onSignOut={onSignOut}>
    {route.page === 'overview' ? (
      <AdminOverview repository={repository} />
    ) : route.page === 'submissions' ? (
      <AdminSubmissions repository={repository} status={route.status} />
    ) : route.page === 'submission' ? (
      <AdminSubmissionDetail key={route.id} repository={repository} id={route.id} userId={userId} />
    ) : route.page === 'songs' ? (
      <AdminSongs repository={repository} />
    ) : route.page === 'song' ? (
      <AdminSongDetail key={route.id} repository={repository} id={route.id} userId={userId} />
    ) : (
      <AdminEmpty title="Esta página del panel no existe.">
        <a href={adminHash.overview()} className="font-semibold text-[#2464ED] hover:underline dark:text-sky-400">
          Ir al resumen
        </a>
      </AdminEmpty>
    )}
  </AdminLayout>
);

export default AdminApp;
