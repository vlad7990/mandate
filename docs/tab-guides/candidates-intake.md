# CV intake

A stack of CVs, one search, one pass. Pick the mandate, add up to twenty
files, and parse them all in one go.

## What you do here

1. Choose the **mandate** these CVs belong to. The list says which
   searches are calibrated — an uncalibrated one has nothing to score
   against yet.
2. Drop the CVs in, or choose files. PDF or DOCX, up to 10 MB each.
3. Press **Upload and parse**. Each file is read in turn and becomes a
   candidate on that mandate; the row tells you which are queued,
   parsing, parsed or failed.
4. Follow a parsed row straight to the person, or open the mandate to see
   them all.

## What done looks like

Every CV in the batch reads **PARSED**, and the people are on the
mandate with their profiles filled in.

## What this screen will not do

**It parses one file at a time, on purpose, and it does not roll back.**
Each CV is a real call to the CV Parsing Agent; a batch that failed
atomically would throw away work already done. Whatever parsed, parsed —
the rest is reported honestly beside its filename.

If the mandate itself refuses the upload — its scoring model no longer
matches its finalised job spec — the batch **stops on the first refusal**
rather than repeating the same failure twenty times.

It will not score anyone against a mandate that has not been calibrated.
The CV is still read and the person still created, but there is nothing
to judge them against until onboarding has run.

**It will not parse the same person into this mandate twice — but what it
can be sure of depends on when it looks.** Before anything is uploaded it
compares the file itself, so the same document twice in one batch, or a
file already in this mandate, is skipped outright and costs nothing. Only
after a CV has been read does it know whose it is: if that person is
already here under the same email address or LinkedIn profile, the record
just created is removed, the existing one is left exactly as it stands,
and the row tells you the file you uploaded was not kept.

Where the only thing shared is a name and an employer, **both records
stay**. Two people really do share a name at one large firm, so that pair
is flagged for you on the candidate's own screen rather than merged. There
is no merge tool here: if they are one person, delete the record you do
not want.

The same file under a **different** mandate is not a duplicate at all. It
is reported and parsed anyway — one person in two searches is two records,
each scored against its own role.

Uploading records you as the person who brought each candidate in. That
governs which CVs the reuse agent draws on when it makes suggestions for
you; it does not hide them from anyone.

## Where this leads

Into the mandate's **Candidates** list, where the ranking runs. To reuse
someone you already have rather than upload them again, use the mandate's
own **Suggest from our pool**.
