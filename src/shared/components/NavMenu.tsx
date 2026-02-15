/**
 * Top-right circular navigation menu button.
 *
 * Purely presentational: receives menu items and an onReportBug callback from
 * the parent so it has no hardcoded routes and no direct dependency on actionLog.
 *
 * Renders a circular icon button that opens a dropdown with the provided items.
 * The dropdown closes on outside click, on item click, and on Escape.
 */

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";

export interface MenuItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon: React.ElementType;
  /** When true, clicking this item invokes the onReportBug callback and shows a toast. */
  isReportBug?: boolean;
  "data-testid"?: string;
}

interface NavMenuProps {
  items: MenuItem[];
  onReportBug: () => Promise<void>;
}

export function NavMenu({ items, onReportBug }: NavMenuProps) {
  const [open, setOpen] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleReportBug() {
    setOpen(false);
    try {
      await onReportBug();
      setToastMessage("Log copied");
    } catch {
      setToastMessage("Copy failed — clipboard unavailable");
    }
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2500);
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Circular trigger button */}
      <button
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((prev) => !prev)}
        data-testid="nav-menu-trigger"
        className="h-9 w-9 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center border bg-background hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          data-testid="nav-menu-dropdown"
          className="absolute right-0 top-11 z-50 min-w-[160px] rounded-md border bg-background shadow-md py-1"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const sharedClass =
              "flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-sm hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer text-left";

            if (item.href) {
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  role="menuitem"
                  data-testid={item["data-testid"]}
                  className={sharedClass}
                  onClick={() => setOpen(false)}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            }

            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                data-testid={item["data-testid"]}
                className={sharedClass}
                onClick={item.isReportBug ? handleReportBug : () => {
                  setOpen(false);
                  item.onClick?.();
                }}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Report Bug toast */}
      {toastVisible && (
        <div
          role="status"
          aria-live="polite"
          data-testid="report-bug-toast"
          className="fixed bottom-4 right-4 z-50 rounded-md border bg-background px-4 py-2 text-sm shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
