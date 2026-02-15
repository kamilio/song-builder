import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { storageService } from "@/lib/storage";

const EXAMPLE_PROMPTS = [
  "A melancholy indie folk song about missing someone on a rainy day",
  "An upbeat pop anthem about chasing your dreams in a new city",
  "A slow blues song about fixing an old car in the summer heat",
  "An acoustic love song written from the perspective of a lighthouse keeper",
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const message = storageService.createMessage({
      role: "user",
      content: trimmed,
      parentId: null,
    });

    navigate(`/lyrics/${message.id}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-secondary/30">
      {/* Logo + wordmark */}
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-8 h-8 text-primary-foreground"
            aria-hidden="true"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Song Builder</h1>
          <p className="mt-1.5 text-muted-foreground text-base">
            Describe the song you want. Claude writes the lyrics, ElevenLabs makes it real.
          </p>
        </div>
      </div>

      {/* Prompt form */}
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl flex flex-col gap-3"
        aria-label="New song prompt"
      >
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What song do you want to make?"
          className="resize-none min-h-[120px] text-base shadow-sm"
          aria-label="Song prompt"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            ⌘ + Enter to start
          </span>
          <Button type="submit" disabled={!prompt.trim()}>
            Start writing →
          </Button>
        </div>
      </form>

      {/* Example prompts */}
      <div className="mt-10 w-full max-w-xl">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Try an example
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="text-left text-sm px-3 py-2.5 rounded-lg border border-border bg-card hover:bg-secondary/60 text-foreground transition-colors leading-snug"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
