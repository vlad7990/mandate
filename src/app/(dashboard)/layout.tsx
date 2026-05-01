import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
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

  return (
    <div className="bg-background text-on-background font-body-main h-screen flex overflow-hidden">
      <Sidebar
        user={{
          displayName,
          email,
          role: profile?.role ?? null,
        }}
        badges={{ network: networkCount }}
      />
      <main className="flex-1 ml-20 flex flex-col h-screen overflow-hidden">
        <Topbar />
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
      <Toaster richColors position="top-right" />
      <CopilotPanel />
    </div>
  );
}
