import { redirect } from "next/navigation";

// The standalone Logs tab was merged into the Dashboard (see
// app/admin/dashboard/page.tsx) — anyone who still has this URL bookmarked
// or types it directly gets sent to the page that now actually shows logs,
// instead of a dead/blank route.
export default function LogsRedirectPage() {
  redirect("/admin/dashboard");
}
