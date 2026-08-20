// Thin fetch wrapper for the FastAPI backend. Tokens live only in httpOnly
// cookies set by the backend — this client never reads, stores, or forwards
// a token itself, it just always sends credentials so the browser attaches
// the cookies automatically.

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "employee";
  organization_id: string;
  organization_name: string | null;
}

export interface AuthResponse {
  user: AuthUser;
  message: string;
}

export interface SignupPayload {
  email: string;
  password: string;
  confirm_password: string;
  full_name: string;
  organization_name: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// FastAPI validation errors come back as detail: [{ msg, loc, ... }, ...];
// everything else as detail: "some string". Normalize both to one message.
function messageFromDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: unknown };
    if (typeof first?.msg === "string") {
      return first.msg.replace(/^Value error,\s*/, "");
    }
  }
  return fallback;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await parseBody(res);

  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    const fallback =
      res.status === 429
        ? "Too many attempts, try again later."
        : "Something went wrong. Please try again.";
    throw new ApiError(res.status, messageFromDetail(detail, fallback), detail);
  }

  return data as T;
}

export function signupAdmin(payload: SignupPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/signup", { method: "POST", body: payload });
}

export function login(payload: LoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", { method: "POST", body: payload });
}

export function logout(): Promise<{ message: string }> {
  return request<{ message: string }>("/auth/logout", { method: "POST" });
}

export function refreshSession(): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/refresh", { method: "POST" });
}

// GET /auth/me is the actual protected endpoint (behind get_current_user on
// the backend) — it validates the access token cookie and returns the
// current user, or 401 if the token is missing/invalid/expired.
export function getCurrentUser(): Promise<AuthUser> {
  return request<AuthUser>("/auth/me", { method: "GET" });
}

// --- Google OAuth (admin) --------------------------------------------------
// Not a fetch call — "Continue with Google" is a plain link to this URL.
// Google's OAuth consent flow requires an actual top-level browser
// navigation; it can't be done via XHR/fetch. The backend handles the
// whole redirect chain (Supabase -> Google -> back to our callback) and
// lands the browser on either /admin/dashboard or /admin/onboarding/organization.
export const GOOGLE_LOGIN_URL = `${API_BASE_URL}/auth/google/login`;

export interface OnboardingStatus {
  email: string;
  needs_onboarding: boolean;
}

export interface OnboardingPayload {
  organization_name: string;
  logo_url: string | null;
}

// Backed by the short-lived onboarding_token cookie (not the regular access
// token) — only valid for a first-time Google user who hasn't finished
// onboarding yet.
export function getOnboardingStatus(): Promise<OnboardingStatus> {
  return request<OnboardingStatus>("/auth/onboarding/status", { method: "GET" });
}

export function submitOnboarding(payload: OnboardingPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/onboarding/organization", {
    method: "POST",
    body: payload,
  });
}

// --- Employee invites (admin-only management) -------------------------------

export interface InvitePublic {
  id: string;
  email: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface InviteActionResponse {
  invite: InvitePublic;
  message: string;
}

export interface InviteListResponse {
  invites: InvitePublic[];
}

export function inviteEmployee(email: string): Promise<InviteActionResponse> {
  return authenticatedRequest<InviteActionResponse>("/employees/invite", {
    method: "POST",
    body: { email },
  });
}

export function listInvites(): Promise<InviteListResponse> {
  return authenticatedRequest<InviteListResponse>("/employees/invites", { method: "GET" });
}

export function resendInvite(inviteId: string): Promise<InviteActionResponse> {
  return authenticatedRequest<InviteActionResponse>(`/employees/invites/${inviteId}/resend`, {
    method: "POST",
  });
}

export function revokeInvite(inviteId: string): Promise<InviteActionResponse> {
  return authenticatedRequest<InviteActionResponse>(`/employees/invites/${inviteId}/revoke`, {
    method: "POST",
  });
}

// --- Employee invite acceptance / signup / login ----------------------------
// None of these carry an existing session, so they use the plain (non-
// authenticatedRequest) request helper, same as admin signup/login above.

export interface InviteValidateResponse {
  valid: boolean;
  email: string | null;
  organization_name: string | null;
  reason: string | null;
}

export interface AcceptInvitePayload {
  token: string;
  password: string;
  confirm_password: string;
  full_name: string;
}

export interface EmployeeSignupPayload {
  email: string;
  password: string;
  confirm_password: string;
  full_name: string;
}

export interface EmployeeLoginPayload {
  email: string;
  password: string;
}

export interface AcceptInviteResponse {
  email: string;
  message: string;
}

export function validateInviteToken(token: string): Promise<InviteValidateResponse> {
  return request<InviteValidateResponse>(
    `/employees/invite/validate?token=${encodeURIComponent(token)}`,
    { method: "GET" }
  );
}

export function acceptInvite(payload: AcceptInvitePayload): Promise<AcceptInviteResponse> {
  return request<AcceptInviteResponse>("/employees/invite/accept", {
    method: "POST",
    body: payload,
  });
}

export function employeeSignup(payload: EmployeeSignupPayload): Promise<AcceptInviteResponse> {
  return request<AcceptInviteResponse>("/employees/signup", { method: "POST", body: payload });
}

export function employeeLogin(payload: EmployeeLoginPayload): Promise<AuthResponse> {
  return request<AuthResponse>("/employees/login", { method: "POST", body: payload });
}

// --- Users Management (list/view/enable/disable/delete, admin-only) --------

export interface EmployeeUserPublic {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "employee";
  status: "invited" | "active" | "disabled" | "deleted";
  created_at: string;
  invited_by: string | null;
  invited_by_name: string | null;
}

export interface EmployeeListResponse {
  users: EmployeeUserPublic[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserActionResponse {
  user: EmployeeUserPublic;
  message: string;
}

export interface ListUsersParams {
  status?: "active" | "disabled";
  search?: string;
  page?: number;
  pageSize?: number;
}

export function listUsers(params: ListUsersParams = {}): Promise<EmployeeListResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.pageSize ?? 10));
  return authenticatedRequest<EmployeeListResponse>(`/employees?${query.toString()}`, {
    method: "GET",
  });
}

export function getUser(userId: string): Promise<EmployeeUserPublic> {
  return authenticatedRequest<EmployeeUserPublic>(`/employees/${userId}`, { method: "GET" });
}

export function updateUserStatus(
  userId: string,
  status: "active" | "disabled"
): Promise<UserActionResponse> {
  return authenticatedRequest<UserActionResponse>(`/employees/${userId}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export function deleteUser(userId: string): Promise<UserActionResponse> {
  return authenticatedRequest<UserActionResponse>(`/employees/${userId}`, { method: "DELETE" });
}

// --- Organization settings (admin-only) -------------------------------------

export interface OrganizationPublic {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
}

export interface OrganizationActionResponse {
  organization: OrganizationPublic;
  message: string;
}

export interface UpdateOrganizationPayload {
  name?: string;
  logo_url?: string;
}

export function getOrganization(): Promise<OrganizationPublic> {
  return authenticatedRequest<OrganizationPublic>("/organization", { method: "GET" });
}

export function updateOrganization(
  payload: UpdateOrganizationPayload
): Promise<OrganizationActionResponse> {
  return authenticatedRequest<OrganizationActionResponse>("/organization", {
    method: "PATCH",
    body: payload,
  });
}

// --- Documents (admin-only upload/list/delete) ------------------------------

export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export interface DocumentPublic {
  id: string;
  file_name: string;
  file_size: number;
  status: DocumentStatus;
  error_message: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface DocumentListResponse {
  documents: DocumentPublic[];
  total: number;
  page: number;
  page_size: number;
}

export interface DocumentActionResponse {
  document: DocumentPublic;
  message: string;
}

export const DOCUMENT_ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];
export const DOCUMENT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

export interface ListDocumentsParams {
  page?: number;
  pageSize?: number;
}

export function listDocuments(params: ListDocumentsParams = {}): Promise<DocumentListResponse> {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("page_size", String(params.pageSize ?? 20));
  return authenticatedRequest<DocumentListResponse>(`/documents?${query.toString()}`, {
    method: "GET",
  });
}

export function deleteDocument(documentId: string): Promise<DocumentActionResponse> {
  return authenticatedRequest<DocumentActionResponse>(`/documents/${documentId}`, {
    method: "DELETE",
  });
}

// Uses its own fetch (not the generic `request` helper) since it sends
// multipart/form-data, not JSON — the browser needs to set the
// Content-Type header itself (with the multipart boundary), so it must
// never be set manually here.
async function uploadFormData<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  const data = await parseBody(res);

  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    const fallback =
      res.status === 413
        ? "File is too large."
        : res.status === 429
          ? "Too many attempts, try again later."
          : "Something went wrong. Please try again.";
    throw new ApiError(res.status, messageFromDetail(detail, fallback), detail);
  }

  return data as T;
}

export async function uploadDocument(file: File): Promise<DocumentActionResponse> {
  const formData = new FormData();
  formData.append("file", file);
  try {
    return await uploadFormData<DocumentActionResponse>("/documents/upload", formData);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await refreshSession();
      return uploadFormData<DocumentActionResponse>("/documents/upload", formData);
    }
    throw err;
  }
}

// For future protected endpoints (dashboard/users/documents/chat): retries
// once after a silent refresh when the access token has expired. Not used
// by signup/login/refresh/logout themselves, since a 401 there is a real
// auth failure, not an expired-token retry case.
export async function authenticatedRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  try {
    return await request<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await refreshSession();
      return request<T>(path, options);
    }
    throw err;
  }
}

