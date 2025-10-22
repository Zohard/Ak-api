-- Fix view counter NULL values and add defaults
-- This migration ensures all view counters have proper default values

-- First, update all NULL values to 0
UPDATE ak_critique SET nb_clics = 0 WHERE nb_clics IS NULL;
UPDATE ak_critique SET nb_clics_week = 0 WHERE nb_clics_week IS NULL;
UPDATE ak_critique SET nb_clics_month = 0 WHERE nb_clics_month IS NULL;

-- Add default value to nb_clics (nb_clics_day already has it)
-- PostgreSQL syntax:
ALTER TABLE ak_critique ALTER COLUMN nb_clics SET DEFAULT 0;
ALTER TABLE ak_critique ALTER COLUMN nb_clics_week SET DEFAULT 0;
ALTER TABLE ak_critique ALTER COLUMN nb_clics_month SET DEFAULT 0;
