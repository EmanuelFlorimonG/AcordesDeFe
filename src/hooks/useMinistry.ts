import { useCallback, useMemo } from 'react';
import { usePersistedList } from './usePersistedList';
import type { MinistryMember, MinistryMemberDetails, SingerKeyPreference } from '../types/ministry';
import {
  KEY_PREFERENCES_STORAGE_KEY,
  MEMBERS_STORAGE_KEY,
  createLocalKeyPreferenceRepository,
  createLocalMemberRepository,
  type Repository,
} from '../storage/ministryStorage';
import {
  removeKeyPreference as removePreferenceFrom,
  removeMemberKeyPreferences,
  setKeyPreference as setPreferenceIn,
} from '../utils/keyPreferences';
import { createMember, setMemberActive, updateMember } from '../utils/ministryMembers';

export interface MinistryStore {
  members: MinistryMember[];
  membersById: Map<string, MinistryMember>;
  keyPreferences: SingerKeyPreference[];
  recoveredFromUnreadableData: boolean;
  createMember: (details: Partial<MinistryMemberDetails>) => MinistryMember;
  updateMember: (id: string, details: Partial<MinistryMemberDetails>) => void;
  setMemberActive: (id: string, isActive: boolean) => void;
  /**
   * Deletes a member and the keys they had saved. What points at them from
   * setlists is cleaned by the caller (App), which owns the setlists.
   */
  deleteMember: (id: string) => void;
  setKeyPreference: (memberId: string, songId: string, key: string) => void;
  removeKeyPreference: (memberId: string, songId: string) => void;
}

interface UseMinistryOptions {
  memberRepository?: Repository<MinistryMember>;
  keyPreferenceRepository?: Repository<SingerKeyPreference>;
}

/**
 * The ministry: its members and the keys they usually sing in. Every change
 * goes through the pure functions in utils and is saved through repositories,
 * the only place that knows where any of it is stored.
 */
export function useMinistry({ memberRepository, keyPreferenceRepository }: UseMinistryOptions = {}): MinistryStore {
  const memberRepo = useMemo(() => memberRepository ?? createLocalMemberRepository(), [memberRepository]);
  const keyRepo = useMemo(
    () => keyPreferenceRepository ?? createLocalKeyPreferenceRepository(),
    [keyPreferenceRepository]
  );

  const members = usePersistedList(memberRepo, MEMBERS_STORAGE_KEY);
  const preferences = usePersistedList(keyRepo, KEY_PREFERENCES_STORAGE_KEY);
  const setMembers = members.setItems;
  const setPreferences = preferences.setItems;

  const membersById = useMemo(() => new Map(members.items.map((member) => [member.id, member])), [members.items]);

  const changeMember = useCallback(
    (id: string, change: (member: MinistryMember, now: number) => MinistryMember) => {
      setMembers((current) => {
        const now = Date.now();
        let changed = false;
        const next = current.map((member) => {
          if (member.id !== id) return member;
          const updated = change(member, now);
          changed = changed || updated !== member;
          return updated;
        });
        return changed ? next : current;
      });
    },
    [setMembers]
  );

  const create = useCallback(
    (details: Partial<MinistryMemberDetails>) => {
      const member = createMember(details, { now: Date.now() });
      setMembers((current) => [...current, member]);
      return member;
    },
    [setMembers]
  );

  return {
    members: members.items,
    membersById,
    keyPreferences: preferences.items,
    recoveredFromUnreadableData: members.recoveredFromUnreadableData || preferences.recoveredFromUnreadableData,
    createMember: create,
    updateMember: (id, details) => changeMember(id, (member, now) => updateMember(member, details, now)),
    setMemberActive: (id, isActive) => changeMember(id, (member, now) => setMemberActive(member, isActive, now)),
    deleteMember: (id) => {
      setMembers((current) => current.filter((member) => member.id !== id));
      setPreferences((current) => removeMemberKeyPreferences(current, id));
    },
    setKeyPreference: (memberId, songId, key) =>
      setPreferences((current) => setPreferenceIn(current, memberId, songId, key, Date.now())),
    removeKeyPreference: (memberId, songId) =>
      setPreferences((current) => removePreferenceFrom(current, memberId, songId)),
  };
}
