import type {
  MinistryInstrument,
  MinistryMember,
  MinistryMemberDetails,
  MinistryRole,
  VocalPart,
} from '../types/ministry';
import { createId, type IdFactory } from './createId';
import { normalizeText } from './normalizeText';
import { CHOIR_PART_NAMES } from './voiceParts';

/**
 * Members of the ministry, as pure functions: every change returns a new
 * member. Storage and screens sit on top, so the list can later come from an
 * API without touching any of this.
 */

export const MAX_MEMBER_NAME_LENGTH = 80;
export const MAX_MEMBER_NOTES_LENGTH = 500;

/** Offered first; the rest exist in the model for when they are needed. */
export const PRIMARY_ROLES: MinistryRole[] = ['director', 'singer', 'musician'];
export const MINISTRY_ROLES: MinistryRole[] = ['director', 'singer', 'musician', 'coordinator', 'sound', 'other'];

export const ROLE_LABELS: Record<MinistryRole, string> = {
  director: 'Director',
  singer: 'Cantante',
  musician: 'Músico',
  coordinator: 'Coordinador',
  sound: 'Sonido',
  other: 'Otro',
};

export const MINISTRY_INSTRUMENTS: MinistryInstrument[] = ['guitar', 'keys', 'bass', 'drums', 'percussion', 'other'];

export const INSTRUMENT_LABELS: Record<MinistryInstrument, string> = {
  guitar: 'Guitarra',
  keys: 'Piano / Teclado',
  bass: 'Bajo',
  drums: 'Batería',
  percussion: 'Cajón / Percusión',
  other: 'Otro instrumento',
};

export const VOCAL_PARTS: VocalPart[] = ['soprano', 'alto', 'tenor', 'bass'];

/** Singular: the part one person sings. Named in utils/voiceParts, like the arrangement's. */
export const VOCAL_PART_LABELS: Record<VocalPart, string> = {
  soprano: CHOIR_PART_NAMES.soprano.singular,
  alto: CHOIR_PART_NAMES.alto.singular,
  tenor: CHOIR_PART_NAMES.tenor.singular,
  bass: CHOIR_PART_NAMES.bass.singular,
};

/** Only known values, each one once, in the order they are listed. */
function normalizeList<T extends string>(value: unknown, allowed: T[]): T[] {
  if (!Array.isArray(value)) return [];
  return allowed.filter((option) => value.includes(option));
}

export const normalizeRoles = (value: unknown) => normalizeList(value, MINISTRY_ROLES);
export const normalizeInstruments = (value: unknown) => normalizeList(value, MINISTRY_INSTRUMENTS);
export const normalizeVocalParts = (value: unknown) => normalizeList(value, VOCAL_PARTS);

export function cleanMemberName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, MAX_MEMBER_NAME_LENGTH) : '';
}

export function cleanMemberDetails(details: Partial<MinistryMemberDetails>): MinistryMemberDetails {
  return {
    name: cleanMemberName(details.name),
    roles: normalizeRoles(details.roles),
    instruments: normalizeInstruments(details.instruments),
    vocalParts: normalizeVocalParts(details.vocalParts),
    notes: typeof details.notes === 'string' ? details.notes.trim().slice(0, MAX_MEMBER_NOTES_LENGTH) : '',
    isActive: details.isActive ?? true,
  };
}

export function createMember(
  details: Partial<MinistryMemberDetails>,
  { now, createId: makeId = createId }: { now: number; createId?: IdFactory }
): MinistryMember {
  const clean = cleanMemberDetails(details);
  if (!clean.name) throw new Error('Un miembro necesita un nombre.');
  return { id: makeId(), ...clean, createdAt: now, updatedAt: now };
}

export function updateMember(
  member: MinistryMember,
  details: Partial<MinistryMemberDetails>,
  now: number
): MinistryMember {
  const clean = cleanMemberDetails({ ...member, ...details });
  if (!clean.name) throw new Error('Un miembro necesita un nombre.');
  return { ...member, ...clean, updatedAt: now };
}

/** Someone who leaves for a while is deactivated: nothing that points at them is lost. */
export function setMemberActive(member: MinistryMember, isActive: boolean, now: number): MinistryMember {
  return member.isActive === isActive ? member : { ...member, isActive, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Showing members
// ---------------------------------------------------------------------------

/** "MR" for María Rodríguez, "E" for Emanuel. Never more than two letters. */
export function memberInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** "Director · Cantante · Soprano": what someone does, in one line. */
export function describeMemberRoles(member: Pick<MinistryMember, 'roles' | 'vocalParts'>): string {
  return [
    ...member.roles.map((role) => ROLE_LABELS[role]),
    ...member.vocalParts.map((part) => VOCAL_PART_LABELS[part]),
  ].join(' · ');
}

export function describeMemberInstruments(member: Pick<MinistryMember, 'instruments'>): string {
  return member.instruments.map((instrument) => INSTRUMENT_LABELS[instrument]).join(' · ');
}

/** Everything about someone in one short line, for lists. */
export function describeMember(member: MinistryMember): string {
  return [describeMemberRoles(member), describeMemberInstruments(member)].filter(Boolean).join(' · ');
}

export function sortMembers(members: MinistryMember[]): MinistryMember[] {
  return [...members].sort(
    (a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.createdAt - b.createdAt
  );
}

// ---------------------------------------------------------------------------
// Finding members
// ---------------------------------------------------------------------------

export type MemberStatusFilter = 'active' | 'inactive' | 'all';

export interface MemberFilters {
  query: string;
  role: MinistryRole | null;
  instrument: MinistryInstrument | null;
  vocalPart: VocalPart | null;
  status: MemberStatusFilter;
}

export const DEFAULT_MEMBER_FILTERS: MemberFilters = {
  query: '',
  role: null,
  instrument: null,
  vocalPart: null,
  status: 'active',
};

/** Name search ignores accents and case; every other filter must match too. */
export function filterMembers(members: MinistryMember[], filters: MemberFilters): MinistryMember[] {
  const query = normalizeText(filters.query.trim());
  return sortMembers(
    members.filter(
      (member) =>
        (!query || normalizeText(member.name).includes(query)) &&
        (!filters.role || member.roles.includes(filters.role)) &&
        (!filters.instrument || member.instruments.includes(filters.instrument)) &&
        (!filters.vocalPart || member.vocalParts.includes(filters.vocalPart)) &&
        (filters.status === 'all' || member.isActive === (filters.status === 'active'))
    )
  );
}
