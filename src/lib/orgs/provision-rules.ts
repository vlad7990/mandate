// The organisation-provisioning rules, as a pure rule (§137 D1).
//
// Kept out of the server action so the door-opening identity checks are
// unit-testable. RLS decides WHO may insert (organizations_founder_insert,
// migration 114); these sentences decide what is a legal organisation
// identity, said in words before the unique index says it in codes.

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Suggests a slug from an organisation name. A suggestion only — the
 * founder edits it in the dialog, and `orgProvisionRefusal` is the rule
 * that decides what finally passes.
 */
export function deriveOrgSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
}

export function orgProvisionRefusal(args: {
  name: string;
  slug: string;
}): string | null {
  const name = args.name.trim();
  if (!name) {
    return "The organisation needs a name.";
  }
  if (name.length > 120) {
    return "That name is too long — keep it under 120 characters.";
  }
  const slug = args.slug.trim();
  if (!slug) {
    return "The organisation needs a slug.";
  }
  if (slug.length < 2 || slug.length > 50) {
    return "Slugs run from 2 to 50 characters.";
  }
  if (!SLUG_PATTERN.test(slug)) {
    return "Slugs are lowercase letters, digits and single hyphens — like acme-search.";
  }
  return null;
}
