import { useCallback, useMemo } from 'react';
import type { PerformanceRecord } from '../types/performance';
import type { Repository } from '../storage/localRepository';
import { PERFORMANCE_STORAGE_KEY, createLocalPerformanceRepository } from '../storage/performanceStorage';
import {
  createPerformanceSnapshot,
  getPerformanceForOccurrence,
  updatePerformanceRecord,
  type PerformanceChanges,
  type PerformanceSources,
} from '../utils/performanceHistory';
import { usePersistedList } from './usePersistedList';

export interface PerformanceHistoryStore {
  records: PerformanceRecord[];
  recoveredFromUnreadableData: boolean;
  getRecord: (id: string) => PerformanceRecord | null;
  getForOccurrence: (eventId: string, occurrenceDate: string) => PerformanceRecord | null;
  /**
   * Records what was sung on a closed date. Returns the record, the one that
   * already existed for that date (never a second one), or null when nothing
   * was sung.
   */
  record: (sources: PerformanceSources) => PerformanceRecord | null;
  update: (id: string, changes: PerformanceChanges) => void;
  remove: (id: string) => void;
}

/**
 * The history of performances. Nothing else writes to it: deleting a song, a
 * setlist, a member or an activity leaves it as it is.
 */
export function usePerformanceHistory(repository?: Repository<PerformanceRecord>): PerformanceHistoryStore {
  const repo = useMemo(() => repository ?? createLocalPerformanceRepository(), [repository]);
  const { items: records, setItems, recoveredFromUnreadableData } = usePersistedList(repo, PERFORMANCE_STORAGE_KEY);

  const record = useCallback(
    (sources: PerformanceSources) => {
      const existing = getPerformanceForOccurrence(records, sources.event.id, sources.occurrenceDate);
      if (existing) return existing;
      const created = createPerformanceSnapshot(sources, { now: Date.now() });
      if (!created) return null;
      setItems((current) =>
        getPerformanceForOccurrence(current, created.eventId, created.occurrenceDate) ? current : [...current, created]
      );
      return created;
    },
    [records, setItems]
  );

  return {
    records,
    recoveredFromUnreadableData,
    getRecord: (id) => records.find((entry) => entry.id === id) ?? null,
    getForOccurrence: (eventId, occurrenceDate) => getPerformanceForOccurrence(records, eventId, occurrenceDate),
    record,
    update: (id, changes) =>
      setItems((current) =>
        current.map((entry) => (entry.id === id ? updatePerformanceRecord(entry, changes, Date.now()) : entry))
      ),
    remove: (id) => setItems((current) => current.filter((entry) => entry.id !== id)),
  };
}
