import { lazy } from 'react';

/**
 * The big screens, loaded when they are first opened instead of with the app.
 *
 * The songbook (search, the song viewer, the player) stays in the first
 * download: it is what nearly every visitor opens. Everything a ministry uses
 * only now and then (setlists, members, calendar, history, Mass mode) arrives
 * on demand, each in its own file. Small components are not split: the
 * request would cost more than it saves.
 *
 * The public song editor (phase 6B) and the admin panel (phase 6C) go here
 * too, so visitors who only read songs never download them. So do the account
 * screens: an account is optional, and nobody pays for one they never open.
 */

export const SetlistsView = lazy(() =>
  import('../components/Setlists/SetlistsView').then((module) => ({ default: module.SetlistsView }))
);
export const SetlistDetail = lazy(() =>
  import('../components/Setlists/SetlistDetail').then((module) => ({ default: module.SetlistDetail }))
);

export const MembersView = lazy(() =>
  import('../components/Members/MembersView').then((module) => ({ default: module.MembersView }))
);
export const MemberDetail = lazy(() =>
  import('../components/Members/MemberDetail').then((module) => ({ default: module.MemberDetail }))
);
export const MemberFormDialog = lazy(() =>
  import('../components/Members/MemberFormDialog').then((module) => ({ default: module.MemberFormDialog }))
);

export const CalendarView = lazy(() =>
  import('../components/Calendar/CalendarView').then((module) => ({ default: module.CalendarView }))
);
export const EventDetail = lazy(() =>
  import('../components/Calendar/EventDetail').then((module) => ({ default: module.EventDetail }))
);
export const EventFormDialog = lazy(() =>
  import('../components/Calendar/EventFormDialog').then((module) => ({ default: module.EventFormDialog }))
);

export const HistoryView = lazy(() =>
  import('../components/History/HistoryView').then((module) => ({ default: module.HistoryView }))
);
export const PerformanceDetail = lazy(() =>
  import('../components/History/PerformanceDetail').then((module) => ({ default: module.PerformanceDetail }))
);

export const MassMode = lazy(() => import('../components/Mass/MassMode').then((module) => ({ default: module.MassMode })));

export const CategoriesView = lazy(() =>
  import('../components/Dashboard/CategoriesView').then((module) => ({ default: module.CategoriesView }))
);
export const AuthorsView = lazy(() =>
  import('../components/Dashboard/AuthorsView').then((module) => ({ default: module.AuthorsView }))
);
export const PlaylistsView = lazy(() =>
  import('../components/Dashboard/PlaylistsView').then((module) => ({ default: module.PlaylistsView }))
);

export const PrivacyPolicy = lazy(() =>
  import('../components/Legal/PrivacyPolicy').then((module) => ({ default: module.PrivacyPolicy }))
);
export const TermsConditions = lazy(() =>
  import('../components/Legal/TermsConditions').then((module) => ({ default: module.TermsConditions }))
);
export const About = lazy(() => import('../components/Pages/About').then((module) => ({ default: module.About })));
export const Contact = lazy(() => import('../components/Pages/Contact').then((module) => ({ default: module.Contact })));

// The song page: the most visited screen after the songbook, so it is also
// prefetched as soon as the browser is idle (prefetchSongViewer): opening a
// song never waits for the network.
const loadSongViewer = () => import('../components/SongViewer/SongViewer');
export const SongViewer = lazy(() => loadSongViewer().then((module) => ({ default: module.SongViewer })));
export function prefetchSongViewer(): void {
  const start = () => void loadSongViewer();
  if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 1500);
}

// Shown only when Supabase can't be reached: not part of the first download.
export const CatalogFallbackNotice = lazy(() =>
  import('../components/Layout/CatalogStatus').then((module) => ({ default: module.CatalogFallbackNotice }))
);
export const SongUnavailableScreen = lazy(() =>
  import('../components/Layout/CatalogStatus').then((module) => ({ default: module.SongUnavailableScreen }))
);

// The public song editor and the proposal status page: only whoever opens them downloads them.
export const SongEditorScreen = lazy(() =>
  import('../components/SongEditor/SongEditorScreen').then((module) => ({ default: module.SongEditorScreen }))
);
export const TrackingScreen = lazy(() =>
  import('../components/Submissions/TrackingScreen').then((module) => ({ default: module.TrackingScreen }))
);
export const ProposalEditScreen = lazy(() =>
  import('../components/Submissions/ProposalEditScreen').then((module) => ({ default: module.ProposalEditScreen }))
);
export const SongEditProposalScreen = lazy(() =>
  import('../components/Submissions/SongEditProposalScreen').then((module) => ({ default: module.SongEditProposalScreen }))
);

export const AccountDialog = lazy(() =>
  import('../components/Account/AccountDialog').then((module) => ({ default: module.AccountDialog }))
);
export const NewPasswordScreen = lazy(() =>
  import('../components/Account/NewPasswordScreen').then((module) => ({ default: module.NewPasswordScreen }))
);
