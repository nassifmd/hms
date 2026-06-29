-- ============================================================
-- Fix malformed visit numbers caused by SUBSTRING(visit_number FROM 5) bug
--
-- The bug: extracting from position 5 included part of the year (e.g. '026')
-- in the sequence, causing sequences like 26000002 which when re-concatenated
-- produced visit numbers like VIS202626000002 instead of VIS2026000002.
--
-- Run this script, review the output, then run the UPDATE if malformed rows exist.
-- ============================================================

-- Step 1: Inspect malformed visit numbers (anything not matching VIS + 4-digit year + 6-digit seq)
SELECT id, visit_number, created_at
FROM visits
WHERE visit_number !~ '^VIS[0-9]{4}[0-9]{6}$'
ORDER BY created_at;

-- Step 2 (run only if Step 1 returns rows):
-- Renumber malformed visit numbers to the correct format.
-- This assigns a new sequential number within the same year.
-- CAUTION: Review Step 1 output before running this block.

/*
DO $$
DECLARE
  rec RECORD;
  yr TEXT;
  new_seq BIGINT;
  new_number VARCHAR(50);
BEGIN
  FOR rec IN
    SELECT id, visit_number, created_at
    FROM visits
    WHERE visit_number !~ '^VIS[0-9]{4}[0-9]{6}$'
    ORDER BY created_at
  LOOP
    -- Extract the year from the visit_number (positions 4-7 after VIS)
    yr := SUBSTRING(rec.visit_number FROM 4 FOR 4);

    -- Get next safe sequence for that year
    SELECT COALESCE(MAX(CAST(SUBSTRING(visit_number FROM '(\d+)$') AS BIGINT)), 0) + 1
    INTO new_seq
    FROM visits
    WHERE visit_number ~ ('^VIS' || yr || '[0-9]{6}$');

    new_number := 'VIS' || yr || LPAD(new_seq::TEXT, 6, '0');

    RAISE NOTICE 'Renaming % -> %', rec.visit_number, new_number;

    UPDATE visits
    SET visit_number = new_number, updated_at = NOW()
    WHERE id = rec.id;
  END LOOP;
END;
$$;
*/
