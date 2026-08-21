import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessagePublic } from "@/lib/apiClient";

interface MessageBubbleProps {
  message: ChatMessagePublic;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming = false }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[85%] flex-col gap-1.5", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser ? "bg-navy-900 text-white" : "bg-surface-sunken text-text"
          )}
        >
          {message.content}
          {isStreaming ? (
            <span className="animate-caret ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 bg-current align-middle" />
          ) : null}
        </div>
        {!isUser && message.sources && message.sources.length > 0 ? (
          <div className="flex w-full max-w-md flex-col gap-1.5">
            <p className="px-1 text-[11px] font-medium uppercase tracking-wide text-text-subtle">
              Sources
            </p>
            {message.sources.map((s, i) => (
              <div
                key={`${s.document_id}-${s.chunk_index}-${i}`}
                className="flex items-start gap-2.5 rounded-md border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong"
              >
                <FileText size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-subtle" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-text">{s.file_name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-text-subtle">{s.snippet}</p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
