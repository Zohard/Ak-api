/**
 * Reusable Prisma select objects for common query patterns.
 * Use these to reduce duplication across service files.
 */

// ─── Member / User ──────────────────────────────────────────────

/** Minimal member info for display (name only) */
export const MEMBER_NAME_SELECT = {
  idMember: true,
  memberName: true,
} as const;

/** Brief member info for cards and lists */
export const MEMBER_BRIEF_SELECT = {
  idMember: true,
  memberName: true,
  avatar: true,
} as const;

// ─── Anime ──────────────────────────────────────────────────────

/** Minimal anime select for relation/review embeds */
export const ANIME_BRIEF_SELECT = {
  idAnime: true,
  titre: true,
  image: true,
  niceUrl: true,
} as const;

/** Anime select for list/card views */
export const ANIME_LIST_SELECT = {
  idAnime: true,
  titre: true,
  niceUrl: true,
  image: true,
  annee: true,
  studio: true,
  moyenneNotes: true,
  type: true,
  nbEpisodes: true,
  dateAjout: true,
} as const;

// ─── Manga ──────────────────────────────────────────────────────

/** Minimal manga select for relation/review embeds */
export const MANGA_BRIEF_SELECT = {
  idManga: true,
  titre: true,
  image: true,
  niceUrl: true,
} as const;

/** Manga select for list/card views */
export const MANGA_LIST_SELECT = {
  idManga: true,
  titre: true,
  niceUrl: true,
  image: true,
  annee: true,
  editeur: true,
  origine: true,
  moyenneNotes: true,
  dateAjout: true,
} as const;

// ─── Games ──────────────────────────────────────────────────────

/** Minimal game select for relation/review embeds */
export const GAME_BRIEF_SELECT = {
  idJeu: true,
  titre: true,
  image: true,
  niceUrl: true,
} as const;

/** Game select for list/card views */
export const GAME_LIST_SELECT = {
  idJeu: true,
  titre: true,
  niceUrl: true,
  image: true,
  plateforme: true,
  genre: true,
  editeur: true,
  annee: true,
  moyenneNotes: true,
  nbReviews: true,
  dateAjout: true,
} as const;
