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

// TEMPORARY verification hook (dev only), removed after the browser tests.
function simulateTemp(repository: import('./songRepository').SongRepository | null) {
  if (!repository || !import.meta.env.DEV) return repository;
  return {
    ...repository,
    listSongs: async (options?: { signal?: AbortSignal }) => {
      const current = localStorage.getItem('genesaret_simulate_catalog_temp') ?? '';
      if (current === 'offline') throw new Error('simulated offline');
      if (current.startsWith('delay:')) await new Promise((resolve) => setTimeout(resolve, Number(current.slice(6))));
      const songs = await repository.listSongs(options);
      return current.startsWith('hide:') ? songs.filter((song) => song.id !== current.slice(5)) : songs;
    },
  };
}

let store: CatalogStore | null = null;

export function getCatalogStore(): CatalogStore {
  if (!store) {
    const status = getSupabaseStatus();
    const useRemote = readCatalogSource(import.meta.env.VITE_CATALOG_SOURCE) === 'remote' && status.state === 'configured';
    store = createCatalogStore({
      bundled: bundledSongRepository.getAll(),
      // The reader (and the REST client) load on the first refresh, after the first render.
      remote: useRemote ? () => import('./remoteCatalog').then((module) => simulateTemp(module.createRemoteSongRepository())) : null,
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
