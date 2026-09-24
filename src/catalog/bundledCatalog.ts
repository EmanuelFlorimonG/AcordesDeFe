import { MOCK_SONGS } from '../data/mockSongs';
import { createBundledSongRepository } from './songRepository';

/**
 * The songs bundled with the app, as a repository. This is the only module
 * that reads the song data file; the rest of the app asks the repository.
 */
export const bundledSongRepository = createBundledSongRepository(MOCK_SONGS);
