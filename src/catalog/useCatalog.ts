/// <reference types="vite/client" />
import { useEffect, useSyncExternalStore } from 'react';
import { getSupabaseStatus } from '../lib/supabaseConfig';
import { bundledSongRepository } from './bundledCatalog';
import { getCatalogCache } from './catalogCache';
import { createCatalogStore, type CatalogSnapshot, type CatalogStore, type SongAvailability } from './catalogStore';

/**
 * The app's one catalog store. VITE_CATALOG_SOURCE=bundled is the rollback
 * switch: the build then uses only the songs shipped with it, asks Supabase
 * nothing and ignores the cache.
 */
export function readCatalogSource(value: string | undefined): 'bundled' | 'remote' {
  return value?.trim().toLowerCase() === 'bundled' ? 'bundled' : 'remote';
}

let store: CatalogStore | null = null;

export function getCatalogStore(): CatalogStore {
  if (!store) {
    const status = getSupabaseStatus();
    const useRemote = readCatalogSource(import.meta.env.VITE_CATALOG_SOURCE) === 'remote' && status.state === 'configured';
    store = createCatalogStore({
      bundled: bundledSongRepository.getAll(),
      // The reader (and the REST client) load on the first refresh, after the first render.
      remote: useRemote ? () => import('./remoteCatalog').then((module) => module.createRemoteSongRepository()) : null,
      cache: useRemote && status.state === 'configured' ? getCatalogCache(status.config.url) : null,
    });
  }
  return store;
}

/**
 * Asks Supabase for the catalog again, now (after an approval, for example).
 * In the same tab the new song is there when the songbook is shown again.
 */
export function refreshCatalog(): Promise<void> {
  return getCatalogStore().refresh({ force: true });
}

/**
 * The catalog for React. The first call starts the first request to Supabase
 * (without waiting for it); coming back to the tab or getting the connection
 * back asks again, at most every couple of minutes.
 */
export function useCatalog(): CatalogSnapshot {
  const catalog = getCatalogStore();
  const snapshot = useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);

  useEffect(() => {
    void catalog.refresh({ force: true });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void catalog.refresh();
    };
    const onOnline = () => void catalog.refresh({ force: true });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [catalog]);

  return snapshot;
}

/**
 * Why a song id can or can't be shown right now, for the screens that list
 * songs by id (setlists, Mass mode): "no disponible sin conexión" is not the
 * same as "ya no está en el cancionero".
 */
export function useSongAvailability(): (songId: string) => SongAvailability {
  const catalog = getCatalogStore();
  useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
  return catalog.availability;
}
