import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { storageService } from "@/music/lib/storage";
import { getAll as getActionLog } from "@/music/lib/actionLog";

// Expose storageService on window so Playwright tests can call it via page.evaluate
declare global {
  interface Window {
    storageService: typeof storageService;
    getActionLog: typeof getActionLog;
  }
}
window.storageService = storageService;
window.getActionLog = getActionLog;

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
