-- 105: the delete backstop 056 promised, made true.
--
-- Found by the 104 harness (assertion 5), 2026-08-25: 032's original
-- single-column FK — executive_searches_template_id_fkey ON DELETE
-- SET NULL — fires FIRST on a template delete and detaches every
-- referencing search. With template_id NULLed, 056's two composite
-- NO ACTION constraints are MATCH SIMPLE-exempt, so the "a template
-- referenced by any search cannot be deleted" guarantee 056's own
-- commentary states NEVER HELD: the delete succeeded and the
-- searches silently lost their provenance (keeping a stale
-- template_is_global=false into the bargain).
--
-- A search's record points at the template that seeded it. The
-- record does not lose its pointer because somebody deleted the
-- template — the delete is refused instead, which is what the
-- app-layer in-use check already tells the admin in words. This FK
-- is the backstop behind that sentence.

ALTER TABLE public.executive_searches
  DROP CONSTRAINT IF EXISTS executive_searches_template_id_fkey;

ALTER TABLE public.executive_searches
  ADD CONSTRAINT executive_searches_template_id_fkey
  FOREIGN KEY (template_id)
  REFERENCES public.executive_role_templates (id) ON DELETE NO ACTION;
