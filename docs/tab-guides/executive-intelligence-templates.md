# Role templates

Reusable descriptions of an executive role — the intake answers and the
competency weights — so the same kind of search does not get rebuilt
from scratch each time.

## What you do here

1. Read the cards. Each says whether it is **Global** (ships with
   Mandate) or **Org** (yours), and how many competencies it weights.
2. **Use Template** to start a search already prefilled from it —
   everything stays editable in the intake.
3. Admins only: **New Template**, or **Edit** one of your own. Fill the
   optional intake defaults, then set a weight per competency — 0 leaves
   a competency out.
4. Admins only: **Delete** a template your organisation no longer wants.

## What done looks like

Your card appears in the list with an **Org** badge and a weight count,
and a search started from it arrives prefilled.

## What this screen will not do

**Global templates are nobody's to edit or delete** — not yours, not an
admin's. The Edit and Delete buttons are not rendered for them at all,
and the database refuses regardless. Giving your template the same key
as a global one overrides it for your organisation; the form tells you
when you are doing that.

**A template that seeded a search cannot be deleted.** Those searches
point at it, and their record has to keep resolving.

No agent runs here. Weights are numbers a person types — nothing
suggests them, and nothing scores anything on this screen.

There is no duplicate, no version history, no import or export, no
preview of the prefilled intake, and no way to promote your template to
the global library. Authoring needs `skills:write`, which only an admin
holds; everyone else can read the list and use a template.

## Where this leads

Into a new executive search, prefilled. The competencies you are
weighting are defined under **Competencies**.
