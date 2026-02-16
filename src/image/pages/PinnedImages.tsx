/**
 * PinnedImages page (US-025)
 *
 * Route: /image/pinned
 *
 * Lists all non-deleted ImageItems with pinned = true.
 * Each item shows the image thumbnail and an Unpin button that sets
 * pinned = false and removes the item from the list immediately.
 * An empty state message is shown when no images are pinned.
 */

import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { ImageIcon, Pin, PinOff, Settings, Bug } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import { imageStorageService } from "@/image/lib/storage";
import type { ImageItem } from "@/image/lib/storage";
import { log } from "@/music/lib/actionLog";
import { useReportBug } from "@/shared/hooks/useReportBug";

// ─── Navigation items ──────────────────────────────────────────────────────

const IMAGE_NAV_ITEMS: MenuItem[] = [
  {
    label: "Pinned Images",
    href: "/image/pinned",
    icon: Pin,
    "data-testid": "nav-menu-pinned",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    "data-testid": "nav-menu-settings",
  },
  {
    label: "Report Bug",
    icon: Bug,
    isReportBug: true,
    "data-testid": "nav-menu-report-bug",
  },
];

// ─── TopBar ────────────────────────────────────────────────────────────────

function TopBar() {
  const { handleReportBug } = useReportBug();
  return (
    <header
      className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 border-b bg-background/95 backdrop-blur-sm gap-4"
      data-testid="top-bar"
    >
      <Link
        to="/image"
        className="flex items-center gap-2 shrink-0 hover:opacity-75 transition-opacity"
        aria-label="Image Generator home"
      >
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <ImageIcon className="h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />
        </div>
        <span className="font-semibold text-sm hidden sm:inline">Image Generator</span>
      </Link>

      <NavMenu items={IMAGE_NAV_ITEMS} onReportBug={handleReportBug} />
    </header>
  );
}

// ─── PinnedImageItem ────────────────────────────────────────────────────────

interface PinnedImageItemProps {
  item: ImageItem;
  onUnpin: (item: ImageItem) => void;
}

function PinnedImageItem({ item, onUnpin }: PinnedImageItemProps) {
  return (
    <div
      className="relative rounded-lg overflow-hidden border bg-card shadow-sm"
      data-testid="pinned-image-item"
    >
      <img
        src={item.url}
        alt=""
        className="block w-full h-auto"
        style={{ maxWidth: "240px", maxHeight: "240px", objectFit: "cover" }}
      />
      <div className="absolute bottom-2 right-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onUnpin(item)}
          aria-label="Unpin image"
          data-testid="unpin-btn"
          className="flex items-center gap-1 bg-background/90 hover:bg-background"
        >
          <PinOff className="h-3 w-3" aria-hidden="true" />
          Unpin
        </Button>
      </div>
    </div>
  );
}

// ─── PinnedImages ───────────────────────────────────────────────────────────

export default function PinnedImages() {
  // Load all pinned, non-deleted items on mount.
  const [pinnedItems, setPinnedItems] = useState<ImageItem[]>(() =>
    imageStorageService
      .export()
      .items.filter((item) => item.pinned && !item.deleted)
  );

  /** Unpin an item: update storage and remove it from the list immediately. */
  const handleUnpin = useCallback((item: ImageItem) => {
    imageStorageService.updateItem(item.id, { pinned: false });
    log({
      category: "user:action",
      action: "image:unpin",
      data: { itemId: item.id },
    });
    setPinnedItems((prev) => prev.filter((i) => i.id !== item.id));
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />

      <main className="flex-1 overflow-auto p-4 md:p-8 max-w-5xl">
        <div className="flex items-center gap-2.5 mb-1">
          <Pin size={18} className="text-primary" aria-hidden="true" />
          <h1 className="text-xl font-bold tracking-tight">Pinned Images</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm mb-6">
          Your saved images. Unpin any image to remove it from this list.
        </p>

        {pinnedItems.length === 0 ? (
          <div
            className="mt-10 flex flex-col items-center gap-3 text-center"
            data-testid="pinned-images-empty"
          >
            <Pin size={32} className="text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-foreground">No pinned images yet</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pin an image from an image session to save it here.
              </p>
            </div>
          </div>
        ) : (
          <div
            className="flex flex-wrap gap-4"
            data-testid="pinned-image-list"
          >
            {pinnedItems.map((item) => (
              <PinnedImageItem key={item.id} item={item} onUnpin={handleUnpin} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
