// Shared rating vocabulary for the hiring-manager portal feedback form
// + the public submit handler. Lives in its own client-safe module
// because both the form (client component) and the API route (server)
// import it.

export const HM_RATINGS = ["strong_yes", "yes", "maybe", "no"] as const;
export type HmRating = (typeof HM_RATINGS)[number];

export const HM_RATING_LABELS: Record<HmRating, string> = {
  strong_yes: "Strong Yes",
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
};
