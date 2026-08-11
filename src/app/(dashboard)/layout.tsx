import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { BreadcrumbProvider } from "@/components/dashboard/breadcrumbs";
import { Toaster } from "@/components/ui/sonner";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { countNetworkPeople } from "@/lib/network/network-aggregator";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("status, full_name, email, role")
    .eq("id", user.id)
    .single();

  if (profile?.status === "pending") {
    redirect("/auth/pending");
  }

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    redirect(
      `/auth/signin?error=${encodeURIComponent("Your account is suspended.")}`
    );
  }

  const displayName = profile?.full_name?.trim() || profile?.email || user.email || "Operator";
  const email = profile?.email || user.email || "";

  // Network badge — distinct people in the org's candidate pool. The
  // aggregator dedupes per-project rows by identity (email/linkedin/
  // name+company) so the badge matches the Network page count.
  const networkCount = await countNetworkPeople();

  // Mandate count for the rail badge. Cheap — head-only, no rows.
  const { count: mandateCount } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true });

  return (
    <BreadcrumbProvider>
      <div className="flex h-screen overflow-hidden bg-background font-body-main text-on-background">
        <Sidebar
          user={{
            displayName,
            email,
            role: profile?.role ?? null,
          }}
          badges={{ network: networkCount, mandates: mandateCount ?? 0 }}
        />

        {/*
          `min-w-0` matters: without it a wide table inside the content
          region sets the flex item's min-content width and pushes the
          rail off-screen instead of scrolling inside its own container.

          The old markup was `flex-1 ml-20` — a hardcoded margin
          clearing a fixed 80px rail. The rail is now 0px, 64px or
          240px depending on viewport, so a fixed margin would be wrong
          at two of the three sizes. The shell is flex; nothing needs to
          know the rail's width.
        */}
        <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
          <Topbar />
          <div className="flex-1 overflow-auto">{children}</div>
        </main>

        <Toaster richColors position="top-right" />
        <CopilotPanel />
      </div>
    </BreadcrumbProvider>
  );
}
