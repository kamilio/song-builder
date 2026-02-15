import { Link } from "react-router-dom";
import { Button } from "@/music/components/ui/button";

interface ApiKeyMissingModalProps {
  onClose: () => void;
}

/**
 * Blocking modal shown when a user triggers generation without a POE_API_KEY.
 * Directs the user to the Settings page to configure their API key.
 */
export function ApiKeyMissingModal({ onClose }: ApiKeyMissingModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
      data-testid="api-key-missing-modal"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div className="relative z-10 bg-background border rounded-lg shadow-lg p-6 w-full max-w-md mx-4">
        <h2
          id="api-key-modal-title"
          className="text-lg font-semibold mb-2"
        >
          API Key Required
        </h2>
        <p className="text-muted-foreground mb-6">
          A POE API key is required to generate lyrics and songs. Please go to
          Settings to add your API key before continuing.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button asChild>
            <Link to="/music/settings" onClick={onClose}>
              Go to Settings
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
