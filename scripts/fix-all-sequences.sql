-- Fix all sequences in the database
-- This script automatically fixes all auto-increment sequences

-- Function to fix a single sequence
CREATE OR REPLACE FUNCTION fix_sequence(table_name text, id_column text)
RETURNS void AS $$
DECLARE
    seq_name text;
    max_id bigint;
BEGIN
    -- Construct sequence name
    seq_name := table_name || '_' || id_column || '_seq';

    -- Get max ID from table
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', id_column, table_name) INTO max_id;

    -- Fix sequence
    EXECUTE format('SELECT setval(%L, %s, true)', seq_name, max_id);

    RAISE NOTICE 'Fixed sequence % for table % (max_id: %)', seq_name, table_name, max_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not fix sequence for %.% - %', table_name, id_column, SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Fix all main tables
SELECT fix_sequence('ak_listes_top', 'id_liste');
SELECT fix_sequence('ak_animes', 'id_anime');
SELECT fix_sequence('ak_mangas', 'id_manga');
SELECT fix_sequence('ak_jeux_video', 'id_jeu');
SELECT fix_sequence('ak_critiques', 'id_critique');
SELECT fix_sequence('ak_synopsis', 'id_synopsis');
SELECT fix_sequence('ak_screens', 'id_screen');
SELECT fix_sequence('ak_screenshots', 'id_screen');
SELECT fix_sequence('ak_anime_screenshots', 'id');
SELECT fix_sequence('ak_business', 'id_business');
SELECT fix_sequence('ak_contact', 'id');
SELECT fix_sequence('ak_actualites', 'id_news');
SELECT fix_sequence('ak_sondages', 'id_sondage');
SELECT fix_sequence('smf_members', 'id_member');
SELECT fix_sequence('smf_topics', 'id_topic');
SELECT fix_sequence('smf_messages', 'id_msg');
SELECT fix_sequence('smf_personal_messages', 'id_pm');

-- Cleanup
DROP FUNCTION IF EXISTS fix_sequence(text, text);

-- Verify results for ak_listes_top
SELECT
    'ak_listes_top' as table_name,
    (SELECT last_value FROM ak_listes_top_id_liste_seq) as sequence_value,
    (SELECT MAX(id_liste) FROM ak_listes_top) as max_id_in_table,
    (SELECT last_value FROM ak_listes_top_id_liste_seq) - COALESCE((SELECT MAX(id_liste) FROM ak_listes_top), 0) as difference;
