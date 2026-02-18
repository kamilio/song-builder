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

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ImageIcon, Maximize2, Pin, PinOff, Plus, Settings, Bug, X } from "lucide-react";
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
        to="/"
        className="flex items-center gap-2 shrink-0 hover:opacity-75 transition-opacity"
        aria-label="Studio home"
      >
        <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
          <ImageIcon className="h-3.5 w-3.5 text-primary-foreground" aria-hidden="true" />
        </div>
        <span className="font-semibold text-sm hidden sm:inline">Studio</span>
      </Link>

      <div className="flex items-center gap-2 shrink-0">
        <Link
          to="/image"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border border-border bg-background hover:bg-accent transition-colors"
          data-testid="new-session-btn"
          aria-label="New session"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">New Session</span>
        </Link>
        <NavMenu items={IMAGE_NAV_ITEMS} onReportBug={handleReportBug} />
      </div>
    </header>
  );
}

// ─── PinnedImageItem ────────────────────────────────────────────────────────

interface PinnedImageItemProps {
  item: ImageItem;
  onUnpin: (item: ImageItem) => void;
  onOpenFullscreen: (item: ImageItem) => void;
}

function PinnedImageItem({ item, onUnpin, onOpenFullscreen }: PinnedImageItemProps) {
  return (
    <div
      className="relative rounded-lg overflow-hidden border bg-card shadow-sm"
      data-testid="pinned-image-item"
    >
      <img
        src={item.url}
        alt=""
        className="block w-full h-auto cursor-zoom-in"
        style={{ maxWidth: "240px", maxHeight: "240px", objectFit: "cover" }}
        onClick={() => onOpenFullscreen(item)}
        aria-label="Open fullscreen"
      />
      <div className="absolute bottom-2 right-2 flex gap-1">
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenFullscreen(item)}
          aria-label="Open fullscreen viewer"
          data-testid="fullscreen-btn"
          className="flex items-center gap-1 bg-background/90 hover:bg-background"
        >
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

// ─── Simple fullscreen viewer for a flat list of images ───────────────────

interface SimpleImageViewerProps {
  items: ImageItem[];
  initialItem: ImageItem;
  onClose: () => void;
}

function SimpleImageViewer({ items, initialItem, onClose }: SimpleImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const idx = items.findIndex((i) => i.id === initialItem.id);
    return idx >= 0 ? idx : 0;
  });

  const goToPrev = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items.length]);

  const goToNext = useCallback(() => {
    if (items.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goToPrev();
      else if (e.key === "ArrowRight") goToNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goToPrev, goToNext]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (items.length === 0) return null;
  const safeIndex = Math.min(currentIndex, items.length - 1);
  const currentItem = items[safeIndex];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen image viewer"
      data-testid="fullscreen-viewer"
      onClick={handleBackdropClick}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close fullscreen viewer"
        data-testid="fullscreen-close-btn"
        className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {items.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goToPrev(); }}
          aria-label="Previous image"
          data-testid="fullscreen-prev-btn"
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
        >
          <ChevronLeft className="h-6 w-6" aria-hidden="true" />
        </button>
      )}

      <div
        className="relative max-w-[90vw] max-h-[85vh] flex items-center justify-center"
        data-testid="fullscreen-image-container"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={currentItem.id}
          src={currentItem.url}
          alt=""
          className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
          data-testid="fullscreen-image"
        />
        {items.length > 1 && (
          <div
            className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white tabular-nums"
            data-testid="fullscreen-counter"
            aria-label={`Image ${safeIndex + 1} of ${items.length}`}
          >
            {safeIndex + 1} / {items.length}
          </div>
        )}
      </div>

      {items.length > 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goToNext(); }}
          aria-label="Next image"
          data-testid="fullscreen-next-btn"
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
        >
          <ChevronRight className="h-6 w-6" aria-hidden="true" />
        </button>
      )}
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

  const [viewerItem, setViewerItem] = useState<ImageItem | null>(null);

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

  const handleOpenFullscreen = useCallback((item: ImageItem) => {
    setViewerItem(item);
  }, []);

  const handleCloseFullscreen = useCallback(() => {
    setViewerItem(null);
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
              <PinnedImageItem key={item.id} item={item} onUnpin={handleUnpin} onOpenFullscreen={handleOpenFullscreen} />
            ))}
          </div>
        )}
      </main>

      {viewerItem && pinnedItems.length > 0 && (
        <SimpleImageViewer
          items={pinnedItems}
          initialItem={viewerItem}
          onClose={handleCloseFullscreen}
        />
      )}
    </div>
  );
}
