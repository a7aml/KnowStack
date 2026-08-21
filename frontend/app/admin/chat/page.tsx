"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send, Trash2, MessageSquare, MessagesSquare } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import { Alert } from "@/components/ui/Alert";
import { Toast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { adminNavItems } from "@/lib/mock-data";
import {
  ApiError,
  getCurrentUser,
  refreshSession,
  createChatSession,
  listChatSessions,
  listChatMessages,
  deleteChatSession,
  streamChatMessage,
  CHAT_QUESTION_MAX_LENGTH,
  type AuthUser,
  type ChatSessionPublic,
  type ChatMessagePublic,
  type ChatSourceCitation,
} from "@/lib/apiClient";

function initialsFor(fullName: string | null, email: string): string {
  const source = fullName?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

let tempIdCounter = 0;
function nextTempId(): string {
  tempIdCounter += 1;
  return `temp-${Date.now()}-${tempIdCounter}`;
}

export default function AdminChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const [sessions, setSessions] = useState<ChatSessionPublic[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessagePublic[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ChatSessionPublic | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (isSending) abortRef.current?.abort();
      setActiveSessionId(sessionId);
      setMessages([]);
      setMessagesError(null);
      setIsLoadingMessages(true);
      try {
        const { messages: fetched } = await listChatMessages(sessionId);
        setMessages(fetched);
      } catch (err) {
        setMessagesError(err instanceof ApiError ? err.message : "Could not load messages.");
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [isSending]
  );

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setSessionsError(null);
    try {
      const { sessions: fetched } = await listChatSessions();
      setSessions(fetched);
      if (fetched.length > 0) {
        await selectSession(fetched[0].id);
      }
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : "Could not load chat sessions.");
    } finally {
      setIsLoadingSessions(false);
    }
  }, [selectSession]);

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
        router.replace("/login");
        return;
      }
      setUser(currentUser);
      setIsChecking(false);
      await loadSessions();
    }

    verifySession();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleNewChat() {
    setSendError(null);
    try {
      const { session } = await createChatSession();
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : "Could not start a new chat.");
    }
  }

  async function handleSend() {
    const trimmed = question.trim();
    if (!trimmed || isSending) return;

    setSendError(null);
    let sessionId = activeSessionId;

    if (!sessionId) {
      try {
        const { session } = await createChatSession();
        setSessions((prev) => [session, ...prev]);
        sessionId = session.id;
        setActiveSessionId(session.id);
      } catch (err) {
        setSendError(err instanceof ApiError ? err.message : "Could not start a new chat.");
        return;
      }
    }

    const userMessage: ChatMessagePublic = {
      id: nextTempId(),
      role: "user",
      content: trimmed,
      sources: null,
      created_at: new Date().toISOString(),
    };
    const assistantId = nextTempId();
    const assistantMessage: ChatMessagePublic = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: null,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setQuestion("");
    setIsSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChatMessage(
        sessionId,
        trimmed,
        {
          onToken: (text) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + text } : m))
            );
          },
          onSources: (sources: ChatSourceCitation[]) => {
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, sources } : m)));
          },
          onDone: () => {
            // Session may have just been titled from this first question —
            // refresh the sidebar list so its title shows up.
            loadSessionsQuietly();
          },
          onError: (message) => {
            setSendError(message);
          },
        },
        controller.signal
      );
    } catch (err) {
      if ((err as { name?: string }).name !== "AbortError") {
        setSendError(err instanceof ApiError ? err.message : "Connection lost. Please try again.");
      }
    } finally {
      setIsSending(false);
    }
  }

  async function loadSessionsQuietly() {
    try {
      const { sessions: fetched } = await listChatSessions();
      setSessions(fetched);
    } catch {
      // Non-critical — the sidebar just won't show the auto-generated
      // title until the next successful refresh.
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteChatSession(deleteTarget.id);
      setSessions((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      if (activeSessionId === deleteTarget.id) {
        setActiveSessionId(null);
        setMessages([]);
      }
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete chat.");
    } finally {
      setIsDeleting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  if (isChecking || !user) {
    return <FullPageLoader />;
  }

  const displayName = user.full_name || user.email;

  return (
    <DashboardShell
      navItems={adminNavItems}
      activeHref="/admin/chat"
      pageTitle="RAG Chat"
      userName={displayName}
      userRole="Workspace Admin"
      userInitials={initialsFor(user.full_name, user.email)}
    >
      <div className="flex h-[75vh] min-h-[500px] gap-4">
        <Card padding="none" className="flex w-64 shrink-0 flex-col overflow-hidden">
          <div className="border-b border-border p-3">
            <Button variant="primary" size="sm" fullWidth type="button" onClick={handleNewChat}>
              <Plus size={16} strokeWidth={1.75} />
              New chat
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {isLoadingSessions ? (
              <div className="flex flex-col gap-2 p-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-11 w-full" />
                ))}
              </div>
            ) : sessionsError ? (
              <p className="p-2 text-xs text-danger">{sessionsError}</p>
            ) : sessions.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No chats yet" description="Start a new chat to begin." />
            ) : (
              <ul className="flex flex-col gap-1">
                {sessions.map((s) => (
                  <li key={s.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => selectSession(s.id)}
                      className={`w-full truncate rounded-md px-3 py-2 pr-8 text-left text-sm transition-colors duration-150 ${
                        s.id === activeSessionId
                          ? "bg-navy-950 text-white"
                          : "text-text-muted hover:bg-surface-sunken hover:text-text"
                      }`}
                    >
                      <span className="block truncate">{s.title || "New chat"}</span>
                      <span
                        className={`block text-[11px] ${
                          s.id === activeSessionId ? "text-white/60" : "text-text-subtle"
                        }`}
                      >
                        {formatDate(s.created_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteError(null);
                        setDeleteTarget(s);
                      }}
                      className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1.5 text-text-subtle transition-colors hover:bg-danger-bg hover:text-danger group-hover:block"
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-6">
            {!activeSessionId && messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                  <MessagesSquare size={22} strokeWidth={1.75} />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-navy-950">Ask your knowledge base</h2>
                <p className="mt-2 max-w-sm text-sm text-text-muted">
                  Questions are answered using your organization&apos;s uploaded documents.
                  Start typing below to begin.
                </p>
              </div>
            ) : isLoadingMessages ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-14 w-2/3 self-end" />
                <Skeleton className="h-20 w-3/4" />
                <Skeleton className="h-14 w-1/2 self-end" />
              </div>
            ) : messagesError ? (
              <p className="text-sm text-danger">{messagesError}</p>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="text-sm text-text-muted">No messages yet. Ask a question below.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((m, i) => {
                  const isLast = i === messages.length - 1;
                  const isStreamingThis = isSending && isLast && m.role === "assistant";
                  if (isStreamingThis && m.content === "") {
                    return <TypingIndicator key={m.id} />;
                  }
                  return <MessageBubble key={m.id} message={m} isStreaming={isStreamingThis} />;
                })}
              </div>
            )}
          </div>

          {sendError ? (
            <div className="border-t border-border px-4 py-2">
              <Alert tone="danger">{sendError}</Alert>
            </div>
          ) : null}

          <div className="border-t border-border p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-border-strong bg-surface px-3 py-2 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value.slice(0, CHAT_QUESTION_MAX_LENGTH))}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                rows={1}
                placeholder="Ask a question about your documents…"
                className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm text-text placeholder:text-text-subtle focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending || !question.trim()}
                aria-label="Send message"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white transition-colors hover:bg-navy-800 disabled:bg-navy-200"
              >
                <Send size={15} strokeWidth={1.75} />
              </button>
            </div>
            <p className="mt-1 text-right text-[11px] text-text-subtle">
              {question.length}/{CHAT_QUESTION_MAX_LENGTH}
            </p>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete chat"
        message={`This will permanently remove "${deleteTarget?.title || "this chat"}". Are you sure?`}
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
