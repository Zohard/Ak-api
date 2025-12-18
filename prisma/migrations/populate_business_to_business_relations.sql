-- Populate business-to-business relations from documented relationships in notes
-- This migration extracts business relationships that were previously only documented in text

-- Insert business-to-business relations based on notes documentation
INSERT INTO ak_business_to_business (id_business_source, id_business_related, type, precisions, doublon) VALUES

-- === ANIPLEX/SONY FAMILY ===
-- A-1 Pictures (239) → Aniplex (240)
(239, 240, 'Filiale', 'A-1 Pictures a été créé par le studio Aniplex pour le seconder sur l''animation de ses productions', 0),

-- CloverWorks (16656) → A-1 Pictures (239) & Aniplex (240)
(16656, 239, 'Ancienne branche', 'Anciennement branche d''A-1 Pictures, CloverWorks a gagné son indépendance', 0),
(16656, 240, 'Filiale', 'CloverWorks reste une filiale d''Aniplex', 0),

-- Aniplex (240) → Sony Music Entertainment (688)
(240, 688, 'Anciennement nommé', 'Aniplex était anciennement Sony Music Entertainment (SME) Visual Works Inc. (2001-2003)', 0),

-- Sony subsidiaries → Sony (1349)
(3301, 1349, 'Branche', 'Sony Computer Entertainment est la branche jeux vidéo du groupe Sony', 0),
(688, 1349, 'Filiale', 'Sony Music Entertainment fait partie du groupe Sony', 0),
(634, 1349, 'Filiale', 'Sony Pictures Home Entertainment fait partie du groupe Sony', 0),
(7016, 1349, 'Filiale', 'Sony Pictures Entertainment Japan fait partie du groupe Sony', 0),

-- === BANDAI/NAMCO FAMILY ===
-- Bandai (3702) → Namco Bandai Holdings (399)
(3702, 399, 'Fusion', 'Bandai a fusionné avec Namco pour former le groupe Namco Bandai Holdings en 2005', 0),

-- Namco (1977) → Namco Bandai Holdings (399)
(1977, 399, 'Fusionné avec', 'Namco a fusionné avec Bandai pour former Namco Bandai Holdings en 2005', 0),

-- Bandai subsidiaries
(3703, 399, 'Appartient au groupe', 'Bandai Entertainment appartient au groupe Namco Bandai Holdings', 0),
(223, 3702, 'Branche du groupe', 'Bandai Visual est une branche du groupe Bandai chargé de la production de contenu vidéo et musical', 0),
(223, 370, 'Partenaire', 'Bandai Visual travaille notamment avec le studio Sunrise', 0),

-- Bandai Namco subsidiaries → Namco Bandai Holdings (399)
(17959, 399, 'Filiale', 'Bandai Namco Pictures fait partie du groupe Namco Bandai', 0),
(19187, 399, 'Filiale', 'Bandai Namco Entertainment fait partie du groupe Namco Bandai', 0),
(19185, 399, 'Filiale', 'Bandai Namco Studios fait partie du groupe Namco Bandai', 0),
(3069, 399, 'Filiale', 'Namco Bandai Games fait partie du groupe Namco Bandai', 0),

-- Beez (396) → Namco Bandai Holdings (399)
(396, 399, 'Filiale', 'BEEZ est une filiale française du groupe Namco Bandai Holdings', 0),

-- === KADOKAWA GROUP ===
-- Kadokawa subsidiaries → Kadokawa Corporation (108)
(51, 108, 'Filiale', 'Kadokawa Shoten fait partie du groupe Kadokawa Corporation', 0),
(1628, 108, 'Filiale', 'Kadokawa Herald Pictures fait partie du groupe Kadokawa', 0),
(19110, 108, 'Filiale', 'Kadokawa Media House fait partie du groupe Kadokawa', 0),

-- === TF1 GROUP ===
-- AB Groupe (610) → TF1 (11569)
(610, 11569, 'Filiale', 'AB Groupe est une filiale du groupe TF1', 0),
(6797, 610, 'Filiale', 'AB Vidéos est la filiale commerciale d''AB Groupe', 0),
(607, 11569, 'Filiale', 'TF1 Video est une filiale de TF1', 0),

-- === AIC GROUP ===
-- AIC subsidiaries → AIC (208)
(547, 208, 'Filiale', 'AIC A.S.T.A. est une filiale du studio AIC', 0),
(548, 208, 'Filiale', 'AIC Spirits est une filiale du studio AIC', 0),

-- === SUNRISE GROUP ===
-- Sunrise subsidiaries → Sunrise (370)
(17835, 370, 'Filiale', 'Sunrise Beyond est une filiale de Sunrise', 0),
(7363, 370, 'Filiale', 'Sunrise D.I.D. est une filiale de Sunrise', 0),
(10950, 370, 'Filiale', 'Sunrise Music Publisher est une filiale de Sunrise', 0),

-- Bones (193) → Sunrise (370)
(193, 370, 'Créé par anciens de', 'Bones a été créé par trois anciens membres du Studio Sunrise', 0),

-- === TOEI GROUP ===
-- Toei subsidiaries → Toei Animation (517)
(2551, 517, 'Filiale', 'Toei Kagaku Kougyô est lié au groupe Toei', 0),
(587, 517, 'Filiale', 'Toei Video est une filiale de Toei Animation', 0),
(7686, 517, 'Racheté par', 'Eei-Toei, investissement conjoint, a été racheté en 1998 par Toei et renommé Toei Animation Philippines', 0),

-- === MARVELOUS GROUP ===
-- Marvelous relations
(229, 469, 'Fusionné avec', 'Marvelous Entertainment a fusionné avec Marvelous Interactive le 30 juin 2007', 0),
(468, 469, 'Racheté par', 'Le studio Artland a été racheté par Marvelous Interactive en 2006', 0),

-- === OTHER STUDIO RELATIONS ===
-- Gonzo
(6577, 141, 'Filiale', 'G.D.H. est une filiale du studio Gonzo', 0),

-- Geneon Entertainment
(234, 11559, 'Ancienne filiale', 'Geneon Entertainment était anciennement une filiale de Pioneer LDC', 0),
(234, 439, 'Appartient à', 'Geneon Entertainment appartient au groupe Dentsu', 0),

-- Brains Base
(16978, 268, 'Fondé par anciens de', 'Lapin Track a été fondé par d''anciennes personnalités de Brains Base', 0),

-- Mushi Production
(187, 245, 'Fondé par anciens de', 'Madhouse a été fondé par des ex-animateurs de Mushi Production', 0),

-- Nippon Animation
(1570, 398, 'Fondé par', 'Nippon Animedia a été fondé par le studio Nippon Animation en 2000', 0),

-- Bird Studio
(661, 188, 'Fondé par', 'Bird Studio a été fondé par Akira Toriyama', 0),

-- Hasbro
(12754, 17037, 'Racheté par', 'Milton Bradley Company a été racheté par Hasbro en 1984', 0)

ON CONFLICT DO NOTHING;
