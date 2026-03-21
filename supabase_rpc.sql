-- Run these in Supabase SQL Editor AFTER the main schema
-- Atomic sequence increment functions

CREATE OR REPLACE FUNCTION next_qt_seq()
RETURNS INTEGER AS $$
DECLARE
  new_seq INTEGER;
BEGIN
  UPDATE qt_sequence SET last_seq = last_seq + 1 WHERE id = 1
  RETURNING last_seq INTO new_seq;
  RETURN new_seq;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION next_inv_seq()
RETURNS INTEGER AS $$
DECLARE
  new_seq INTEGER;
BEGIN
  UPDATE inv_sequence SET last_seq = last_seq + 1 WHERE id = 1
  RETURNING last_seq INTO new_seq;
  RETURN new_seq;
END;
$$ LANGUAGE plpgsql;
