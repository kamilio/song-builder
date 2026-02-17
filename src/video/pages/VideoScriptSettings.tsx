/**
 * Script settings page — stub for US-067.
 *
 * Route: /video/scripts/:id/settings
 *
 * US-067: The route must exist so the breadcrumb and navigation work.
 * Full implementation is in US-068.
 *
 * Safety:
 *   - Redirects to /video/scripts when script ID is not found.
 *   - Wrapped in ErrorBoundary.
 */

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { videoStorageService } from "@/video/lib/storage/storageService";

function VideoScriptSettingsInner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Load script synchronously (storage is synchronous).
  const script = id ? videoStorageService.getScript(id) : null;

  useEffect(() => {
    if (!id || !script) {
      navigate("/video/scripts", { replace: true });
    }
  }, [id, script, navigate]);

  if (!id || !script) {
    return null;
  }

  return (
    <div
      className="flex flex-col h-[calc(100vh-3.5rem)] overflow-y-auto p-6"
      data-testid="script-settings"
    >
      <div className="max-w-2xl mx-auto w-full space-y-6">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Script settings for <span className="font-medium">{script.title}</span>.
          Full settings (narration, subtitles, global prompt, variables) coming in a future release.
        </p>
      </div>
    </div>
  );
}

export default function VideoScriptSettings() {
  return (
    <ErrorBoundary>
      <VideoScriptSettingsInner />
    </ErrorBoundary>
  );
}
