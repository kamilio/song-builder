import { useState, useEffect, useRef, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSettings,
  saveSettings,
  exportStorage,
  importStorage,
  resetStorage,
} from "@/music/lib/storage/storageService";
import {
  getImageSettings,
  saveImageSettings,
  exportImageStorage,
  importImageStorage,
  resetImageStorage,
} from "@/image/lib/storage/storageService";

const MODELS_CACHE_KEY = "song-builder:poe-models";

interface ModelsCache {
  key: string;
  models: { id: string; label: string }[];
}

function readModelsCache(): ModelsCache | null {
  try {
    const raw = localStorage.getItem(MODELS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ModelsCache;
  } catch {
    return null;
  }
}

function writeModelsCache(key: string, models: { id: string; label: string }[]): void {
  try {
    localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify({ key, models }));
  } catch {
    // Ignore storage errors (quota exceeded, private browsing, etc.)
  }
}

function loadInitialSettings() {
  const settings = getSettings();
  const imageSettings = getImageSettings();
  return {
    apiKey: settings?.poeApiKey ?? "",
    numSongs: settings?.numSongs ?? 3,
    chatModel: settings?.chatModel ?? "",
    // US-028: imagesPerModel replaces numImages. Fall back to numImages for backward compat.
    imagesPerModel: imageSettings?.imagesPerModel ?? imageSettings?.numImages ?? 3,
  };
}

function loadCachedModels(apiKey: string): { id: string; label: string }[] {
  if (!apiKey) return [];
  const cache = readModelsCache();
  if (cache && cache.key === apiKey) return cache.models;
  return [];
}

export default function Settings() {
  const initial = loadInitialSettings();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [numSongs, setNumSongs] = useState(initial.numSongs);
  const [chatModel, setChatModel] = useState(initial.chatModel);
  const [imagesPerModel, setImagesPerModel] = useState(initial.imagesPerModel);
  const [includeApiKey, setIncludeApiKey] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat model list fetched from POE V1 API, pre-populated from cache
  const [chatModels, setChatModels] = useState<{ id: string; label: string }[]>(
    () => loadCachedModels(initial.apiKey)
  );
  const [chatModelError, setChatModelError] = useState("");

  // Track which API key was last successfully fetched so we can skip redundant requests
  const fetchedForKeyRef = useRef<string>(
    // If the cache already covers the initial key, mark it as already fetched
    loadCachedModels(initial.apiKey).length > 0 ? initial.apiKey : ""
  );

  useEffect(() => {
    // Skip fetch if the key is empty or was already fetched for this exact key
    if (!apiKey || fetchedForKeyRef.current === apiKey) return;

    // Debounce: wait 600ms after the user stops typing before fetching
    const timer = setTimeout(() => {
      // Re-check inside the timeout in case the key changed again
      if (fetchedForKeyRef.current === apiKey) return;

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      fetchedForKeyRef.current = apiKey;

      fetch("https://api.poe.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<{
            data: Array<{
              id: string;
              created: number;
              price_per_input_token?: number;
            }>;
          }>;
        })
        .then((body) => {
          const filtered = (body.data ?? [])
            .filter((m) => {
              const createdAt = new Date(m.created * 1000);
              const pricePerMillion = (m.price_per_input_token ?? 0) * 1_000_000;
              return createdAt >= sixMonthsAgo && pricePerMillion < 2.0;
            })
            .map((m) => ({ id: m.id, label: m.id }));
          setChatModels(filtered);
          setChatModelError("");
          writeModelsCache(apiKey, filtered);
        })
        .catch(() => {
          // Reset fetchedForKey so a retry is possible on the same key
          fetchedForKeyRef.current = "";
          setChatModelError("Failed to load models. Your saved model is preserved.");
        });
    }, 600);

    return () => {
      clearTimeout(timer);
    };
  }, [apiKey]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    saveSettings({ poeApiKey: apiKey, numSongs, ...(chatModel ? { chatModel } : {}) });
    saveImageSettings({ numImages: imagesPerModel, imagesPerModel });
    setSavedMessage("Settings saved.");
    setTimeout(() => setSavedMessage(""), 3000);
  }

  function handleExport() {
    const musicData = exportStorage();
    if (!includeApiKey && musicData.settings) {
      musicData.settings = { ...musicData.settings, poeApiKey: "" };
    }
    const imageData = exportImageStorage();
    const combined = { ...musicData, image: imageData };
    const json = JSON.stringify(combined, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `studio-backup-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleResetConfirm() {
    resetStorage();
    resetImageStorage();
    localStorage.clear();
    navigate("/");
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        importStorage(data);
        if (data.image) {
          importImageStorage(data.image);
        }
        // Refresh form fields from the newly imported settings
        const settings = getSettings();
        setApiKey(settings?.poeApiKey ?? "");
        setNumSongs(settings?.numSongs ?? 3);
        setImportError("");
        setSavedMessage("Data imported successfully.");
        setTimeout(() => setSavedMessage(""), 3000);
      } catch {
        setImportError("Import failed: file is not a valid JSON export.");
        setTimeout(() => setImportError(""), 5000);
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = "";
  }

  return (
    <div className="p-4 md:p-8 max-w-lg">
      <h1>Settings</h1>
      <p className="text-muted-foreground mt-1">Configure your API key and preferences.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold">Music</h2>
          <div className="space-y-1.5">
            <label htmlFor="apiKey" className="text-sm font-medium">
              POE API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your Poe API key"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Get your key at{" "}
              <a
                href="https://poe.com/api_key"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                poe.com/api_key
              </a>
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="numSongs" className="text-sm font-medium">
              Songs to generate per request
            </label>
            <input
              id="numSongs"
              type="number"
              min={1}
              max={10}
              value={numSongs}
              onChange={(e) => setNumSongs(Number(e.target.value))}
              className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {apiKey && (
            <div className="space-y-1.5">
              <label htmlFor="chatModel" className="text-sm font-medium">
                Chat model
              </label>
              {chatModelError ? (
                <p className="text-sm text-destructive" role="alert" data-testid="chat-model-error">
                  {chatModelError}
                </p>
              ) : chatModels.length > 0 ? (
                <select
                  id="chatModel"
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Default (claude-sonnet-4.5)</option>
                  {chatModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="text-base font-semibold">Image</h2>
          <div className="space-y-1.5">
            <label htmlFor="imagesPerModel" className="text-sm font-medium">
              Images per model
            </label>
            <input
              id="imagesPerModel"
              type="number"
              value={imagesPerModel}
              onChange={(e) => setImagesPerModel(Number(e.target.value))}
              className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Save Settings
          </button>
          {savedMessage && (
            <p className="text-sm text-green-600">{savedMessage}</p>
          )}
        </div>
      </form>

      <div className="mt-6">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-3">
          <div>
            <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently delete all your lyrics, songs, and settings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowResetDialog(true)}
            className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Reset Memory
          </button>
        </div>
      </div>

      {showResetDialog && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
          <div className="bg-background rounded-lg shadow-lg p-6 max-w-sm w-full mx-4 space-y-4">
            <h2 id="reset-dialog-title" className="text-lg font-semibold">
              Reset Memory
            </h2>
            <p className="text-sm text-muted-foreground">
              This will permanently delete all lyrics, songs, and settings. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowResetDialog(false)}
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetConfirm}
                className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Import / Export</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Back up or restore your lyrics and songs as JSON.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="includeApiKey"
              type="checkbox"
              checked={includeApiKey}
              onChange={(e) => setIncludeApiKey(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="includeApiKey" className="text-sm">
              Include API key in export
            </label>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleExport}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Export Data
            </button>

            <button
              type="button"
              onClick={handleImportClick}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              Import Data
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Import JSON file"
            />
          </div>

          {importError && (
            <p
              className="text-sm text-destructive"
              data-testid="import-error"
              role="alert"
            >
              {importError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
