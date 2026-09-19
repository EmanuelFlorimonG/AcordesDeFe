import { createContext, useContext } from 'react';
import type { MinistryMember, SingerKeyPreference } from '../types/ministry';

/**
 * The ministry as the screens read it: who the members are and the keys they
 * sing in. Read-only on purpose — changes go through useMinistry in App — so
 * any view deep inside a setlist, rehearsal or mass mode can show a name from
 * an id without every component in between passing it along.
 */
export interface MinistryData {
  members: MinistryMember[];
  membersById: Map<string, MinistryMember>;
  keyPreferences: SingerKeyPreference[];
}

const EMPTY: MinistryData = { members: [], membersById: new Map(), keyPreferences: [] };

export const MinistryContext = createContext<MinistryData>(EMPTY);

export function useMinistryData(): MinistryData {
  return useContext(MinistryContext);
}

/** Names of the people with these ids, as they are called now; unknown ids are skipped. */
export function memberNames(ids: string[] | undefined, membersById: Map<string, MinistryMember>): string[] {
  return (ids ?? []).flatMap((id) => {
    const member = membersById.get(id);
    return member ? [member.name] : [];
  });
}
