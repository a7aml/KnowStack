// Static mock/dummy data for UI purposes only. No backend or persistence involved.

export const mockOrg = {
  name: "Acme Industries",
  plan: "Enterprise",
};

export const mockAdminUser = {
  name: "Jordan Reyes",
  email: "jordan.reyes@acme-industries.com",
  role: "Workspace Admin",
  initials: "JR",
};

export const mockEmployeeUser = {
  name: "Sam Whitfield",
  email: "sam.whitfield@acme-industries.com",
  role: "Employee",
  initials: "SW",
};

export const landingFeatures = [
  {
    title: "Centralized knowledge base",
    description:
      "Bring documents, wikis, and files from across your organization into a single, searchable system of record.",
  },
  {
    title: "Tenant-isolated by design",
    description:
      "Every organization's data, embeddings, and access controls are fully partitioned. No cross-tenant visibility, ever.",
  },
  {
    title: "Role-based access control",
    description:
      "Admins manage users, documents, and policy. Employees get a focused, read-only workspace scoped to their org.",
  },
  {
    title: "Grounded, cited answers",
    description:
      "Every response is generated from retrieved source passages, with citations back to the original document.",
  },
  {
    title: "Full activity visibility",
    description:
      "Audit logs capture document access, queries, and administrative changes for compliance and oversight.",
  },
  {
    title: "Enterprise-grade infrastructure",
    description:
      "Built on managed authentication, storage, and a hardened Postgres data layer with vector search.",
  },
];

export const landingSteps = [
  {
    step: "01",
    title: "Connect your knowledge",
    description:
      "Upload documents or connect existing repositories to build your organization's knowledge base.",
  },
  {
    step: "02",
    title: "Invite your team",
    description:
      "Admins invite employees, assign roles, and configure access policy for the workspace.",
  },
  {
    step: "03",
    title: "Ask, retrieve, verify",
    description:
      "Employees ask questions in natural language and receive grounded answers with source citations.",
  },
];

export const adminNavItems = [
  { label: "Dashboard", href: "/admin/dashboard", enabled: true },
  { label: "RAG Chat", href: "/admin/chat", enabled: false },
  { label: "Documents", href: "/admin/documents", enabled: false },
  { label: "Users", href: "/admin/users", enabled: true },
  { label: "Organization Settings", href: "/admin/settings", enabled: true },
];

export const employeeNavItems = [
  { label: "Chat", href: "/chat", enabled: true },
];
