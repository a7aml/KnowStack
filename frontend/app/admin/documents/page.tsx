"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  File,
  FileText,
  FileType,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Toast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import { Table, TableHeadRow, Th, Td, Tr } from "@/components/ui/Table";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { adminNavItems } from "@/lib/mock-data";
import {
  ApiError,
  getCurrentUser,
  refreshSession,
  listDocuments,
  uploadDocument,
  deleteDocument,
  DOCUMENT_ALLOWED_EXTENSIONS,
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  type AuthUser,
  type DocumentPublic,
} from "@/lib/apiClient";

const DOCUMENTS_PAGE_SIZE = 10;

// While any document is still pending/processing, poll the list so an admin
// sees status flip to ready/failed without a manual refresh.
const POLL_INTERVAL_MS = 4000;

const STATUS_TONE: Record<DocumentPublic["status"], BadgeTone> = {
  pending: "info",
  processing: "info",
  ready: "success",
  failed: "danger",
};

function initialsFor(fullName: string | null, email: string): string {
  const source = fullName?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

const FILE_ICON: Record<string, LucideIcon> = {
  ".pdf": FileText,
  ".docx": FileType,
  ".txt": File,
};

function iconForFile(fileName: string): LucideIcon {
  return FILE_ICON[extensionOf(fileName)] ?? File;
}

function validateFile(file: File): string | null {
  if (!DOCUMENT_ALLOWED_EXTENSIONS.includes(extensionOf(file.name))) {
    return `Unsupported file type. Allowed types: ${DOCUMENT_ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if (file.size === 0) {
    return "File is empty.";
  }
  if (file.size > DOCUMENT_MAX_FILE_SIZE_BYTES) {
    return `File exceeds the ${DOCUMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB size limit.`;
  }
  return null;
}

export default function AdminDocumentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const [documents, setDocuments] = useState<DocumentPublic[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<DocumentPublic | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadDocuments = useCallback(async (targetPage: number) => {
    setListError(null);
    try {
      const result = await listDocuments({ page: targetPage, pageSize: DOCUMENTS_PAGE_SIZE });
      setDocuments(result.documents);
      setTotal(result.total);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Could not load documents.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      let currentUser: AuthUser | null = null;
      try {
        currentUser = await getCurrentUser();
      } catch {
        try {
          currentUser = (await refreshSession()).user;
        } catch {
          currentUser = null;
        }
      }

      if (cancelled) return;

      if (!currentUser) {
        router.replace("/admin/login");
        return;
      }
      if (currentUser.role !== "admin") {
        // Document endpoints are already blocked server-side for employees
        // (require_admin) — there's no reason to render this page for them.
        router.replace("/login");
        return;
      }
      setUser(currentUser);
      setIsChecking(false);
      await loadDocuments(1);
    }

    verifySession();
    return () => {
      cancelled = true;
    };
  }, [router, loadDocuments]);

  useEffect(() => {
    if (isChecking) return;
    let cancelled = false;
    async function trigger() {
      if (!cancelled) await loadDocuments(page);
    }
    trigger();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChecking, page]);

  const hasInFlightDocuments = documents.some(
    (d) => d.status === "pending" || d.status === "processing"
  );

  useEffect(() => {
    if (isChecking || !hasInFlightDocuments) return;
    const interval = setInterval(() => {
      loadDocuments(page);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isChecking, hasInFlightDocuments, page, loadDocuments]);

  async function handleUpload(file: File) {
    setUploadError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setIsUploading(true);
    try {
      await uploadDocument(file);
      setPage(1);
      await loadDocuments(1);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file after an error
    if (file) void handleUpload(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteDocument(deleteTarget.id);
      setDeleteTarget(null);
      await loadDocuments(page);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete document.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isChecking || !user) {
    return <FullPageLoader />;
  }

  const displayName = user.full_name || user.email;
  const totalPages = Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE));

  return (
    <DashboardShell
      navItems={adminNavItems}
      activeHref="/admin/documents"
      pageTitle="Documents"
      userName={displayName}
      userRole={user.role === "admin" ? "Workspace Admin" : "Employee"}
      userInitials={initialsFor(user.full_name, user.email)}
    >
      <div className="mx-auto max-w-[1100px]">
        <Card padding="none">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-navy-950">Upload a document</h2>
            <p className="mt-1 text-sm text-text-muted">
              Accepted formats: PDF, DOCX, TXT. Maximum file size:{" "}
              {DOCUMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.
            </p>

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`mt-4 flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors duration-150 ${
                isDragging
                  ? "border-accent bg-navy-50"
                  : "border-border-strong hover:border-accent hover:bg-surface-sunken"
              } ${isUploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleFileInputChange}
                disabled={isUploading}
              />
              <UploadCloud size={20} strokeWidth={1.75} className="text-text-subtle" />
              <p className="text-sm font-medium text-text">
                {isUploading ? "Uploading…" : "Drag and drop a file here, or click to browse"}
              </p>
              <p className="text-xs text-text-subtle">.pdf, .docx, .txt</p>
            </div>

            {uploadError ? (
              <div className="mt-4">
                <Alert tone="danger">{uploadError}</Alert>
              </div>
            ) : null}
          </div>

          <div className="border-t border-border p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-navy-950">All documents</h2>
                <p className="mt-1 text-sm text-text-muted">
                  Documents uploaded to {user.organization_name ?? "your organization"}.
                </p>
              </div>
            </div>

            {isLoading ? (
              <div className="mt-4">
                <SkeletonTable rows={5} columns={6} />
              </div>
            ) : listError ? (
              <div className="mt-4">
                <Alert tone="danger">{listError}</Alert>
              </div>
            ) : documents.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents yet"
                description="Upload one above to get started."
              />
            ) : (
              <>
                <div className="mt-4">
                  <Table minWidth="720px">
                    <thead>
                      <TableHeadRow>
                        <Th className="w-2/5">File name</Th>
                        <Th className="w-24">Status</Th>
                        <Th className="w-20">Size</Th>
                        <Th className="w-32">Uploaded by</Th>
                        <Th className="w-28">Uploaded</Th>
                        <Th className="w-24">Actions</Th>
                      </TableHeadRow>
                    </thead>
                    <tbody>
                      {documents.map((doc) => {
                        const FileIcon = iconForFile(doc.file_name);
                        return (
                          <Tr key={doc.id}>
                            <Td className="text-text">
                              <div className="flex items-start gap-2.5">
                                <FileIcon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-subtle" />
                                <div className="min-w-0">
                                  <p className="truncate">{doc.file_name}</p>
                                  {doc.status === "failed" && doc.error_message ? (
                                    <p className="mt-0.5 text-xs text-danger">{doc.error_message}</p>
                                  ) : null}
                                </div>
                              </div>
                            </Td>
                            <Td>
                              <Badge tone={STATUS_TONE[doc.status]}>{doc.status}</Badge>
                            </Td>
                            <Td className="text-text-muted">{formatFileSize(doc.file_size)}</Td>
                            <Td className="text-text-muted">{doc.uploaded_by_name || "—"}</Td>
                            <Td className="text-text-muted">{formatDate(doc.created_at)}</Td>
                            <Td>
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                onClick={() => {
                                  setDeleteError(null);
                                  setDeleteTarget(doc);
                                }}
                              >
                                <Trash2 size={14} strokeWidth={1.75} />
                                Delete
                              </Button>
                            </Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-text-muted">
                    Showing {documents.length} of {total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft size={14} strokeWidth={1.75} />
                      Previous
                    </Button>
                    <span className="text-xs text-text-muted">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
                      <ChevronRight size={14} strokeWidth={1.75} />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete document"
        message={`This will permanently remove "${deleteTarget?.file_name ?? "this document"}", including its extracted content. Are you sure?`}
        confirmLabel="Delete"
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />
      <Toast message={deleteError} tone="danger" onDismiss={() => setDeleteError(null)} />
    </DashboardShell>
  );
}
