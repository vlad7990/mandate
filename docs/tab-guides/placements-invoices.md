# Invoices

Every invoice this organisation has drafted, issued or voided.

## What you do here

1. Draft an invoice against a placement.
2. Review it, then **issue** it — which mints its number and freezes the
   document.
3. Send it, or print it.
4. Void one that should not have been issued.

## What done looks like

Every billable placement has an issued invoice, and every issued invoice
has been sent.

## What this screen will not do

It will not take payment or reconcile one — there is no payment
processing in the product, by choice. It does not chase overdue
invoices, and it will not let you edit an issued document: **an issued
invoice is frozen on purpose**, so what the client received and what you
hold are the same paper. Correcting one means voiding and re-issuing.

An invoice keeps the details it was issued with even if the template
behind it changes later. That is deliberate — the record outlives its
template.

This screen is behind `fees:read`; the database would return nothing to
anyone else regardless.

## Where this leads

Back to **Placements**, or to the client in **Clients**.
