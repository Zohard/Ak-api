-- Fix sequence for ak_listes_top table
-- This resolves "duplicate key value violates unique constraint" errors

-- Show current sequence value
SELECT 'Current sequence value:' as info, last_value FROM ak_listes_top_id_liste_seq;

-- Show max ID in table
SELECT 'Max ID in table:' as info, MAX(id_liste) as max_id FROM ak_listes_top;

-- Fix the sequence to be max_id + 1
SELECT setval('ak_listes_top_id_liste_seq', COALESCE((SELECT MAX(id_liste) + 1 FROM ak_listes_top), 1), false);

-- Verify the fix
SELECT 'New sequence value:' as info, last_value FROM ak_listes_top_id_liste_seq;
SELECT 'Max ID in table:' as info, MAX(id_liste) as max_id FROM ak_listes_top;

-- Show difference (should be at least 1)
SELECT 'Sequence is ahead by:' as info,
       (SELECT last_value FROM ak_listes_top_id_liste_seq) -
       COALESCE((SELECT MAX(id_liste) FROM ak_listes_top), 0) as difference;
