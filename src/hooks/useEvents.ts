import { useCallback, useMemo } from 'react';
import type { EventStatus, MinistryEvent, MinistryEventDetails } from '../types/event';
import { EVENTS_STORAGE_KEY, createLocalEventRepository } from '../storage/eventStorage';
import type { Repository } from '../storage/localRepository';
import {
  clearSetlistFromEvents,
  createEvent,
  removeMemberFromEvents,
  setEventParticipants,
  setEventSetlist,
  setOccurrenceStatus,
  updateEvent,
} from '../utils/ministryEvents';
import { usePersistedList } from './usePersistedList';

export interface EventsStore {
  events: MinistryEvent[];
  recoveredFromUnreadableData: boolean;
  getEvent: (id: string) => MinistryEvent | null;
  create: (details: Partial<MinistryEventDetails>) => MinistryEvent;
  update: (id: string, details: Partial<MinistryEventDetails>) => void;
  remove: (id: string) => void;
  setParticipants: (id: string, memberIds: string[]) => void;
  setSetlist: (id: string, setlistId: string | null) => void;
  /** Closes or reopens one date; the transition rules are checked by the caller (statusChangeError) */
  setStatus: (id: string, date: string, status: EventStatus) => void;
  /** A member was deleted: called for nothing anymore */
  removeMemberEverywhere: (memberId: string) => void;
  /** A setlist was deleted: its activities stay, without repertoire */
  clearSetlistEverywhere: (setlistId: string) => void;
}

/**
 * The ministry's activities. Every change goes through utils/ministryEvents
 * and is saved through a repository, the only place that knows where they are
 * stored.
 */
export function useEvents(repository?: Repository<MinistryEvent>): EventsStore {
  const repo = useMemo(() => repository ?? createLocalEventRepository(), [repository]);
  const { items: events, setItems, recoveredFromUnreadableData } = usePersistedList(repo, EVENTS_STORAGE_KEY);

  const change = useCallback(
    (id: string, update: (event: MinistryEvent, now: number) => MinistryEvent) => {
      setItems((current) => {
        const now = Date.now();
        let changed = false;
        const next = current.map((event) => {
          if (event.id !== id) return event;
          const updated = update(event, now);
          changed = changed || updated !== event;
          return updated;
        });
        return changed ? next : current;
      });
    },
    [setItems]
  );

  const create = useCallback(
    (details: Partial<MinistryEventDetails>) => {
      const event = createEvent(details, { now: Date.now() });
      setItems((current) => [...current, event]);
      return event;
    },
    [setItems]
  );

  return {
    events,
    recoveredFromUnreadableData,
    getEvent: (id) => events.find((event) => event.id === id) ?? null,
    create,
    update: (id, details) => change(id, (event, now) => updateEvent(event, details, now)),
    remove: (id) => setItems((current) => current.filter((event) => event.id !== id)),
    setParticipants: (id, memberIds) => change(id, (event, now) => setEventParticipants(event, memberIds, now)),
    setSetlist: (id, setlistId) => change(id, (event, now) => setEventSetlist(event, setlistId, now)),
    setStatus: (id, date, status) => change(id, (event, now) => setOccurrenceStatus(event, date, status, now)),
    removeMemberEverywhere: (memberId) =>
      setItems((current) => removeMemberFromEvents(current, memberId, Date.now())),
    clearSetlistEverywhere: (setlistId) =>
      setItems((current) => clearSetlistFromEvents(current, setlistId, Date.now())),
  };
}
