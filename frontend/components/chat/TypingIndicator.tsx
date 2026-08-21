export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-surface-sunken px-4 py-3" aria-label="Generating response">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-text-subtle"
          style={{
            animation: "caret-blink 1.1s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}
