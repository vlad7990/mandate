// Client-safe tier vocabulary. The full scoring engine is `server-only`
// because it talks to Supabase, but the tier constants — labels, bands,
// ordering — are pure data and are needed by client components (sortable
// tables, slate cards, exports). Keep these here so the engine can stay
// gated.

export type Tier = "tier_1" | "tier_2" | "tier_3" | "tier_4";

export const TIER_BANDS: Record<Tier, { min: number; max: number; label: string }> = {
  tier_1: { min: 8, max: 10, label: "Tier 1 · Optimal" },
  tier_2: { min: 6, max: 7.99, label: "Tier 2 · Strong" },
  tier_3: { min: 4, max: 5.99, label: "Tier 3 · Stretch" },
  tier_4: { min: 0, max: 3.99, label: "Tier 4 · Below Bar" },
};

export const TIER_ORDER: Tier[] = ["tier_1", "tier_2", "tier_3", "tier_4"];
