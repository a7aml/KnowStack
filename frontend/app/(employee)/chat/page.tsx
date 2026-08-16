import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/Card";
import { employeeNavItems, mockEmployeeUser, mockOrg } from "@/lib/mock-data";

export default function EmployeeChatPage() {
  return (
    <DashboardShell
      navItems={employeeNavItems}
      activeHref="/chat"
      pageTitle="Chat"
      userName={mockEmployeeUser.name}
      userRole={mockEmployeeUser.role}
      userInitials={mockEmployeeUser.initials}
    >
      <div className="mx-auto max-w-3xl">
        <Card padding="lg" className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-text-subtle">
            {mockOrg.name}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-navy-950">
            Welcome, {mockEmployeeUser.name.split(" ")[0]}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-text-muted">
            Your knowledge assistant will appear here. Once connected, you
            will be able to ask questions and receive answers grounded in
            your organization&apos;s documents.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
