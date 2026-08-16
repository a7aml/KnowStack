import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/Card";
import { adminNavItems, mockAdminUser, mockOrg } from "@/lib/mock-data";

export default function AdminDashboardPage() {
  return (
    <DashboardShell
      navItems={adminNavItems}
      activeHref="/admin/dashboard"
      pageTitle="Dashboard"
      userName={mockAdminUser.name}
      userRole={mockAdminUser.role}
      userInitials={mockAdminUser.initials}
    >
      <div className="mx-auto max-w-3xl">
        <Card padding="lg" className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-text-subtle">
            {mockOrg.name}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-navy-950">
            Welcome, {mockAdminUser.name.split(" ")[0]}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-text-muted">
            This is your workspace overview. User management, document
            uploads, and settings will appear here once connected.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
