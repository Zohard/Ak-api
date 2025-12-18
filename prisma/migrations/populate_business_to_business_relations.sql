-- Populate business-to-business relations from documented relationships in notes
-- This migration extracts business relationships that were previously only documented in text

-- Insert business-to-business relations based on notes documentation
INSERT INTO ak_business_to_business (id_business_source, id_business_related, type, precisions, doublon) VALUES
-- A-1 Pictures (239) → Aniplex (240)
(239, 240, 'Filiale', 'A-1 Pictures a été créé par le studio Aniplex pour le seconder sur l''animation de ses productions', 0),

-- CloverWorks (16656) → A-1 Pictures (239)
(16656, 239, 'Ancienne branche', 'Anciennement branche d''A-1 Pictures, CloverWorks a gagné son indépendance', 0),

-- CloverWorks (16656) → Aniplex (240)
(16656, 240, 'Filiale', 'CloverWorks reste une filiale d''Aniplex', 0),

-- Bandai (3702) → Namco Bandai Holdings (399)
(3702, 399, 'Fusion', 'Bandai a fusionné avec Namco pour former le groupe Namco Bandai Holdings en 2005', 0),

-- Bandai Entertainment (3703) → Namco Bandai Holdings (399)
(3703, 399, 'Appartient au groupe', 'Bandai Entertainment appartient au groupe Namco Bandai Holdings', 0),

-- Bandai Visual (223) → Bandai (3702)
(223, 3702, 'Branche du groupe', 'Bandai Visual est une branche du groupe Bandai chargé de la production de contenu vidéo et musical', 0),

-- Bandai Namco Pictures (17959) → Namco Bandai Holdings (399)
(17959, 399, 'Filiale', 'Bandai Namco Pictures fait partie du groupe Namco Bandai', 0),

-- Bandai Namco Entertainment (19187) → Namco Bandai Holdings (399)
(19187, 399, 'Filiale', 'Bandai Namco Entertainment fait partie du groupe Namco Bandai', 0),

-- Bandai Namco Studios (19185) → Namco Bandai Holdings (399)
(19185, 399, 'Filiale', 'Bandai Namco Studios fait partie du groupe Namco Bandai', 0),

-- Namco Bandai Games (3069) → Namco Bandai Holdings (399)
(3069, 399, 'Filiale', 'Namco Bandai Games fait partie du groupe Namco Bandai', 0),

-- Sony relations
-- Aniplex (240) → Sony Music Entertainment (688)
(240, 688, 'Anciennement nommé', 'Aniplex était anciennement Sony Music Entertainment (SME) Visual Works Inc. (2001-2003)', 0),

-- Sony Computer Entertainment (3301) → Sony (1349)
(3301, 1349, 'Branche', 'Sony Computer Entertainment est la branche jeux vidéo du groupe Sony', 0),

-- Sony Music Entertainment (688) → Sony (1349)
(688, 1349, 'Filiale', 'Sony Music Entertainment fait partie du groupe Sony', 0),

-- Sony Pictures Home Entertainment (634) → Sony (1349)
(634, 1349, 'Filiale', 'Sony Pictures Home Entertainment fait partie du groupe Sony', 0),

-- Sony Pictures Entertainment Japan (7016) → Sony (1349)
(7016, 1349, 'Filiale', 'Sony Pictures Entertainment Japan fait partie du groupe Sony', 0),

-- Kadokawa relations
-- Kadokawa Shoten (51) → Kadokawa Corporation (108)
(51, 108, 'Filiale', 'Kadokawa Shoten fait partie du groupe Kadokawa Corporation', 0),

-- Kadokawa Herald Pictures (1628) → Kadokawa Corporation (108)
(1628, 108, 'Filiale', 'Kadokawa Herald Pictures fait partie du groupe Kadokawa', 0),

-- Kadokawa Media House (19110) → Kadokawa Corporation (108)
(19110, 108, 'Filiale', 'Kadokawa Media House fait partie du groupe Kadokawa', 0)

ON CONFLICT DO NOTHING;
