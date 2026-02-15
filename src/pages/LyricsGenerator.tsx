import { useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { ApiKeyMissingModal } from "@/components/ApiKeyMissingModal";
import { useApiKeyGuard } from "@/hooks/useApiKeyGuard";

export default function LyricsGenerator() {
  const [message, setMessage] = useState("");
  const { isModalOpen, guardAction, closeModal } = useApiKeyGuard();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guardAction()) return;
    // TODO (US-010): send message to LLM client
    setMessage("");
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Lyrics Generator</h1>
      <p className="text-muted-foreground mt-2">
        Chat with Claude to generate and refine your lyrics.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex gap-2" data-testid="chat-form">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type a message…"
          aria-label="Chat message"
          className="flex-1 border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="chat-input"
        />
        <Button type="submit" data-testid="chat-submit">
          Send
        </Button>
      </form>

      {isModalOpen && <ApiKeyMissingModal onClose={closeModal} />}
    </div>
  );
}
