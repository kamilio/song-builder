import { Button } from "@/components/ui/button";
import { ApiKeyMissingModal } from "@/components/ApiKeyMissingModal";
import { useApiKeyGuard } from "@/hooks/useApiKeyGuard";

export default function SongGenerator() {
  const { isModalOpen, guardAction, closeModal } = useApiKeyGuard();

  function handleGenerate() {
    if (!guardAction()) return;
    // TODO (US-011): trigger parallel song generation via LLM client
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Song Generator</h1>
      <p className="text-muted-foreground mt-2">
        Generate audio from your lyrics using ElevenLabs.
      </p>

      <div className="mt-6">
        <Button onClick={handleGenerate} data-testid="generate-songs-btn">
          Generate Songs
        </Button>
      </div>

      {isModalOpen && <ApiKeyMissingModal onClose={closeModal} />}
    </div>
  );
}
