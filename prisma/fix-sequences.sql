-- Fix all auto-increment sequences to match current max IDs
-- Run this after any data import or when encountering unique constraint errors

-- Fix ak_animes sequence
SELECT setval(
  pg_get_serial_sequence('ak_animes', 'id_anime'),
  COALESCE((SELECT MAX(id_anime) FROM ak_animes), 1),
  true
);

-- Fix ak_mangas sequence
SELECT setval(
  pg_get_serial_sequence('ak_mangas', 'id_manga'),
  COALESCE((SELECT MAX(id_manga) FROM ak_mangas), 1),
  true
);

-- Fix ak_jeux_video sequence
SELECT setval(
  pg_get_serial_sequence('ak_jeux_video', 'id_jeu'),
  COALESCE((SELECT MAX(id_jeu) FROM ak_jeux_video), 1),
  true
);

-- Fix ak_screenshots sequence
SELECT setval(
  pg_get_serial_sequence('ak_screenshots', 'id_screen'),
  COALESCE((SELECT MAX(id_screen) FROM ak_screenshots), 1),
  true
);

-- Fix ak_jeux_video_screenshots sequence
SELECT setval(
  pg_get_serial_sequence('ak_jeux_video_screenshots', 'id'),
  COALESCE((SELECT MAX(id) FROM ak_jeux_video_screenshots), 1),
  true
);

-- Fix ak_critiques sequence
SELECT setval(
  pg_get_serial_sequence('ak_critiques', 'id_critique'),
  COALESCE((SELECT MAX(id_critique) FROM ak_critiques), 1),
  true
);

-- Fix ak_articles sequence
SELECT setval(
  pg_get_serial_sequence('ak_articles', 'id_article'),
  COALESCE((SELECT MAX(id_article) FROM ak_articles), 1),
  true
);

-- Fix smf_members sequence
SELECT setval(
  pg_get_serial_sequence('smf_members', 'id_member'),
  COALESCE((SELECT MAX(id_member) FROM smf_members), 1),
  true
);
