/**
 * The four choir parts, named once for the whole app.
 *
 * Two ideas use them and are kept apart:
 * - VocalPart (a member): the part a person usually sings. Singular:
 *   "María · Soprano".
 * - VoiceRole (an arrangement): who sings a section. Plural, because it
 *   addresses a group: "Sopranos", "Contraltos".
 *
 * The internal id is "alto", the international name of the part; the interface
 * says "Contralto", which is how the part is called in Spanish-speaking choirs.
 * Both labels come from here, so a screen can never say one and another screen
 * the other.
 */
export type ChoirPart = 'soprano' | 'alto' | 'tenor' | 'bass';

export const CHOIR_PART_NAMES: Record<ChoirPart, { singular: string; plural: string }> = {
  soprano: { singular: 'Soprano', plural: 'Sopranos' },
  alto: { singular: 'Contralto', plural: 'Contraltos' },
  tenor: { singular: 'Tenor', plural: 'Tenores' },
  bass: { singular: 'Bajo', plural: 'Bajos' },
};
