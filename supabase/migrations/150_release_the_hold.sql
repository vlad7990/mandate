-- 150 — RELEASE THE HOLD: THE PAGED READER GOES
--
-- 149 kept `network_people(...)` alive for one reason: the app that stops
-- calling it could not deploy while Vercel was paused for an overdue balance.
-- The balance is paid, `main` is deployed (mandate-fu67jdset, aliased to
-- getmandate.io), and the live page was verified reading the view directly —
-- header and rows agreeing under each filter (unfiltered 004, ?q=alteryx 002,
-- ?years=21+ 002, ?sort=name&dir=asc alphabetical).
--
-- So the slow second way to read the same rows goes, as 148 intended and as
-- its guard says. The Network page's read path is now exactly one thing: the
-- `network_people_folded` view, filtered and paged by the app, with
-- `network_people_rollup` for the figures.

DROP FUNCTION IF EXISTS public.network_people(text, text, text, text, text, text, text, text, integer, integer);
