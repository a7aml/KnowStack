"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History, LogOut, MessagesSquare, Plus, Send, Trash2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import {
  ApiError,
  getCurrentUser,
  refreshSession,
  logout,
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

// Deliberately not the admin DashboardShell/Sidebar: this is the only page
// an employee ever sees, so it gets its own simple, single-purpose layout
// (a slim top bar + one centered chat column) rather than a stripped-down
// copy of the admin dashboard chrome.

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

export default function EmployeeChatPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const [sessions, setSessions] = useState<ChatSessionPublic[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessagePublic[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const selectSession = useCallback(
    async (sessionId: string) => {
      if (isSending) abortRef.current?.abort();
      setActiveSessionId(sessionId);
      setMessages([]);
      setMessagesError(null);
      setHistoryOpen(false);
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
    try {
      const { sessions: fetched } = await listChatSessions();
      setSessions(fetched);
      if (fetched.length > 0) {
        await selectSession(fetched[0].id);
      }
    } catch {
      // Non-critical for the initial load — the composer still works even
      // if history fails to load; the user can retry via the History menu.
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
        router.replace("/login");
        return;
      }
      if (currentUser.role !== "employee") {
        // Admins have their own chat UI at /admin/chat — keep them there.
        router.replace("/admin/dashboard");
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
    setHistoryOpen(false);
    try {
      const { session } = await createChatSession();
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Could not start a new chat.");
    }
  }

  async function handleDeleteSession(sessionId: string) {
    setDeletingId(sessionId);
    try {
      await deleteChatSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch {
      // Left in the list — the user can just try again from the menu.
    } finally {
      setDeletingId(null);
    }
  }

  async function loadSessionsQuietly() {
    try {
      const { sessions: fetched } = await listChatSessions();
      setSessions(fetched);
    } catch {
      // Non-critical — the auto-generated title just won't show up yet.
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

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.replace("/login");
    }
  }

  if (isChecking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-text-muted">Checking your session…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="relative flex shrink-0 items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-surface-sunken"
          >
            <History size={14} strokeWidth={1.75} />
            History
          </button>
          <button
            type="button"
            onClick={handleNewChat}
            className="flex items-center gap-1.5 rounded-full bg-navy-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-navy-800"
          >
            <Plus size={14} strokeWidth={1.75} />
            New chat
          </button>
          <div className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-navy-950 text-xs font-semibold text-white">
            {initialsFor(user.full_name, user.email)}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            className="rounded-md p-1.5 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>

        {historyOpen ? (
          <div className="absolute right-4 top-full z-20 mt-2 w-72 animate-fade-in-up rounded-lg border border-border bg-surface shadow-lg sm:right-6">
            <div className="max-h-80 overflow-y-auto p-2">
              {isLoadingSessions ? (
                <div className="flex flex-col gap-2 p-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-full" />
                  ))}
                </div>
              ) : sessions.length === 0 ? (
                <p className="p-3 text-xs text-text-muted">No past chats yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {sessions.map((s) => (
                    <li key={s.id} className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => selectSession(s.id)}
                        className={`flex-1 truncate rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 ${
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
                        disabled={deletingId === s.id}
                        onClick={() => handleDeleteSession(s.id)}
                        className="shrink-0 rounded p-1.5 text-text-subtle transition-colors hover:bg-danger-bg hover:text-danger disabled:opacity-50"
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col overflow-hidden px-4 py-6 sm:px-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            {!activeSessionId && messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                  <MessagesSquare size={22} strokeWidth={1.75} />
                </div>
                <h1 className="mt-4 text-2xl font-semibold text-navy-950">
                  Hi {user.full_name?.split(" ")[0] || "there"}
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm text-text-muted">
                  Ask anything about {user.organization_name ?? "your organization"}&apos;s
                  documents — answers come with sources you can check.
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
              <div className="flex flex-col gap-4 pb-2">
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
            <div className="mt-2">
              <Alert tone="danger">{sendError}</Alert>
            </div>
          ) : null}

          <div className="mt-4 flex items-end gap-2 rounded-2xl border border-border-strong bg-surface px-3 py-2 shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value.slice(0, CHAT_QUESTION_MAX_LENGTH))}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              rows={1}
              placeholder="Message your knowledge assistant…"
              className="max-h-32 flex-1 resize-none bg-transparent py-1.5 text-sm text-text placeholder:text-text-subtle focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || !question.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-white transition-colors hover:bg-navy-800 disabled:bg-navy-200"
              aria-label="Send"
            >
              <Send size={15} strokeWidth={1.75} />
            </button>
          </div>
          <p className="mt-1 text-right text-[11px] text-text-subtle">
            {question.length}/{CHAT_QUESTION_MAX_LENGTH}
          </p>
        </div>
      </main>
    </div>
  );
}
