import { useState, useRef, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  getSettings,
  saveSettings,
  exportStorage,
  importStorage,
  resetStorage,
} from "@/lib/storage/storageService";

function loadInitialSettings() {
  const settings = getSettings();
  return {
    apiKey: settings?.poeApiKey ?? "",
    numSongs: settings?.numSongs ?? 3,
  };
}

export default function Settings() {
  const initial = loadInitialSettings();
  const navigate = useNavigate();
  const [apiKey, setApiKey] = useState(initial.apiKey);
  const [numSongs, setNumSongs] = useState(initial.numSongs);
  const [includeApiKey, setIncludeApiKey] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    saveSettings({ poeApiKey: apiKey, numSongs });
    setSavedMessage("Settings saved.");
    setTimeout(() => setSavedMessage(""), 3000);
  }

  function handleExport() {
    const data = exportStorage();
    if (!includeApiKey && data.settings) {
      data.settings = { ...data.settings, poeApiKey: "" };
    }
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "song-builder-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleResetConfirm() {
    resetStorage();
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
    <div className="p-8 max-w-lg">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground mt-2">Configure your API key and preferences.</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-1">
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
        </div>

        <div className="space-y-1">
          <label htmlFor="numSongs" className="text-sm font-medium">
            Songs to generate
          </label>
          <input
            id="numSongs"
            type="number"
            min={1}
            max={10}
            value={numSongs}
            onChange={(e) => setNumSongs(Number(e.target.value))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Save Settings
        </button>

        {savedMessage && (
          <p className="text-sm text-green-600">{savedMessage}</p>
        )}
      </form>

      <div className="mt-8 space-y-4 border-t pt-6">
        <h2 className="text-lg font-semibold">Danger Zone</h2>

        <button
          type="button"
          onClick={() => setShowResetDialog(true)}
          className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Reset Memory
        </button>
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

      <div className="mt-8 space-y-4 border-t pt-6">
        <h2 className="text-lg font-semibold">Import / Export</h2>

        <div className="flex items-center gap-2">
          <input
            id="includeApiKey"
            type="checkbox"
            checked={includeApiKey}
            onChange={(e) => setIncludeApiKey(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="includeApiKey" className="text-sm font-medium">
            Include API keys in export
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
  );
}
