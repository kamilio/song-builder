import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "@/shared/components/ErrorBoundary";
import { storageService } from "@/music/lib/storage";
import { getAll as getActionLog } from "@/music/lib/actionLog";
import { imageStorageService } from "@/image/lib/storage";

// Expose storageService on window so Playwright tests can call it via page.evaluate
declare global {
  interface Window {
    storageService: typeof storageService;
    getActionLog: typeof getActionLog;
    imageStorageService: typeof imageStorageService;
  }
}
window.storageService = storageService;
window.getActionLog = getActionLog;
window.imageStorageService = imageStorageService;

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
