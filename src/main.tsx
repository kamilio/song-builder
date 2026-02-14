import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { storageService } from "@/lib/storage";

// Expose storageService on window so Playwright tests can call it via page.evaluate
declare global {
  interface Window {
    storageService: typeof storageService;
  }
}
window.storageService = storageService;

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
