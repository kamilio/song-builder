/**
 * SessionView page (US-007, US-014, US-015, US-016, US-017, US-018, US-021, US-022, US-023, US-025)
 *
 * Route: /image/sessions/:id
 *
 * Loads the ImageSession, all ImageGenerations, and all ImageItems for the
 * given session id from localStorage via imageStorageService. Shows a 404
 * message if the session does not exist.
 *
 * Layout (three structural regions):
 *   TopBar  — branding + NavMenu with image-specific items
 *   ──────────────────────────────────────────────────────
 *   main pane (center/left)  │  thumbnail panel (right)
 *   ─────────────────────────┘──────────────────────────
 *   bottom input bar (full width)
 *
 * On mobile (< 640px) the thumbnail panel collapses into a horizontal
 * scrollable strip above the bottom input bar.
 *
 * US-015: Main pane renders images from the generation with the highest
 * stepId only, displayed in rows fitting the container width. Each image
 * renders as a card with an img element. Empty state shown when no
 * completed generations exist.
 *
 * US-016: Thumbnail panel (desktop right panel) and thumbnail strip (mobile)
 * show all images across all generation steps, grouped by stepId descending
 * (newest group first). Each thumbnail is a small fixed-size image.
 *
 * US-017: Each thumbnail is wrapped in an anchor tag that opens the image
 * URL in a new browser tab (target="_blank"). No in-app detail route is used.
 *
 * US-018: Bottom input bar contains a prompt textarea and Generate button.
 * The textarea is pre-populated with the prompt from the latest generation
 * on load and is never programmatically cleared. Clicking Generate creates a
 * new ImageGeneration (stepId auto-incremented by the storage service) and
 * fires parallel generateImage calls. The Generate button is disabled while
 * a generation is in-flight.
 *
 * US-020: Clicking Generate with no poeApiKey shows ApiKeyMissingModal.
 * No generateImage call is made when the modal is shown. The modal contains
 * a link to /settings. Dismissing the modal does not navigate away.
 *
 * US-021: While a generation is in-flight, N skeleton placeholder cards are
 * shown in the main pane (N = numImages from settings). Skeletons have the
 * same aspect ratio as real image cards (square, matching the 320px max-width
 * with a 1:1 ratio). No new thumbnails appear in the panel until the
 * generation step completes. Skeletons are replaced by real images when
 * generation finishes.
 *
 * US-022: Per-image inline error state. Each of the N parallel generateImage
 * requests is fired independently. If one rejects, only that slot shows an
 * inline error card — sibling slots that succeeded render their images
 * normally. No full-page error is shown.
 *
 * US-023: Download image action. Each image card in the main pane has a
 * Download button. Clicking it fetches the image as a blob and triggers a
 * browser file download. The filename includes the session title and image
 * index (1-based position in the current display list).
 *
 * US-024: Pin and unpin image action. Each image card in the main pane has a
 * Pin toggle button. Clicking it sets ImageItem.pinned to true (or false if
 * already pinned) via imageStorageService.updateItem, then reloads session
 * data so thumbnails reflect the new state. The Pin button visually
 * distinguishes pinned vs unpinned state. Thumbnail images also show a pin
 * indicator when pinned.
 *
 * US-025: Per-image regenerate action. Each image card in the main pane has a
 * Regenerate button. Clicking it fires a new generateImage call for that slot
 * only. The new image is stored as an additional ImageItem in the same
 * generation and displayed alongside the original — the old image remains
 * visible. While the slot is regenerating, a spinner card with elapsed timer
 * replaces the image card. Sibling slots are unaffected.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ImageIcon, LayoutList, Loader2, Pin, PinOff, Settings, Bug, Download, RefreshCw } from "lucide-react";
import { useElapsedTimer } from "@/shared/hooks/useElapsedTimer";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { NavMenu } from "@/shared/components/NavMenu";
import type { MenuItem } from "@/shared/components/NavMenu";
import { ApiKeyMissingModal } from "@/shared/components/ApiKeyMissingModal";
import { useApiKeyGuard } from "@/shared/hooks/useApiKeyGuard";
import { imageStorageService } from "@/image/lib/storage";
import type { ImageSession, ImageGeneration, ImageItem } from "@/image/lib/storage";
import { createLLMClient } from "@/shared/lib/llm/factory";
import { getSettings } from "@/music/lib/storage/storageService";
import { log } from "@/music/lib/actionLog";
import { useReportBug } from "@/shared/hooks/useReportBug";
import { IMAGE_MODELS } from "@/image/lib/imageModels";
import { downloadBlob } from "@/shared/lib/downloadBlob";
import type { ImageModelDef } from "@/image/lib/imageModels";
import { usePoeBalanceContext } from "@/shared/context/PoeBalanceContext";

// ─── Download helper (US-023) ──────────────────────────────────────────────

/**
 * Sanitises a string for use in a filename by replacing characters that are
 * invalid or problematic on common filesystems with a hyphen, then trimming
 * repeated hyphens and leading/trailing whitespace.
 */
function sanitiseFilename(value: string): string {
  return value
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

/**
 * Triggers a browser file download for the given image URL.
 *
 * Derives the file extension from the URL path (defaulting to .png) and
 * delegates the fetch-blob-anchor-click pattern to the shared downloadBlob
 * utility so the logic is not duplicated across the codebase.
 *
 * @param url      - Source image URL.
 * @param filename - Desired base filename (without extension).
 */
async function downloadImage(url: string, filename: string): Promise<void> {
  // Derive file extension from the URL, defaulting to .png.
  const urlExt = url.split("?")[0].split(".").pop()?.toLowerCase();
  const ext =
    urlExt && ["jpg", "jpeg", "gif", "webp", "png"].includes(urlExt)
      ? `.${urlExt}`
      : ".png";

  await downloadBlob(url, `${sanitiseFilename(filename)}${ext}`);
}

// ─── Navigation items ──────────────────────────────────────────────────────

const IMAGE_NAV_ITEMS: MenuItem[] = [
  {
    label: "All Sessions",
    href: "/image/sessions",
    icon: LayoutList,
    "data-testid": "nav-menu-all-sessions",
  },
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
  const { balance } = usePoeBalanceContext();
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
        {balance !== null && (
          <span
            className="text-xs text-muted-foreground tabular-nums"
            data-testid="poe-balance"
            aria-label={`POE balance: ${balance}`}
          >
            {balance}
          </span>
        )}
        <NavMenu items={IMAGE_NAV_ITEMS} onReportBug={handleReportBug} />
      </div>
    </header>
  );
}

// ─── Thumbnail helpers ─────────────────────────────────────────────────────

interface ThumbnailGroup {
  stepId: number;
  items: ImageItem[];
}

/**
 * Groups items by their generation's stepId, ordered by stepId descending
 * (newest group first). Items within each group retain their original order.
 */
function groupItemsByStep(
  generations: ImageGeneration[],
  items: ImageItem[]
): ThumbnailGroup[] {
  // Map generationId -> stepId for quick lookup
  const stepByGenId = new Map<string, number>(
    generations.map((g) => [g.id, g.stepId])
  );

  // Collect non-deleted items grouped by stepId
  const byStep = new Map<number, ImageItem[]>();
  for (const item of items) {
    if (item.deleted) continue;
    const stepId = stepByGenId.get(item.generationId);
    if (stepId === undefined) continue;
    if (!byStep.has(stepId)) byStep.set(stepId, []);
    byStep.get(stepId)!.push(item);
  }

  // Sort stepIds descending (newest first)
  const sortedStepIds = Array.from(byStep.keys()).sort((a, b) => b - a);
  return sortedStepIds.map((stepId) => ({ stepId, items: byStep.get(stepId)! }));
}

// ─── ThumbnailImage ────────────────────────────────────────────────────────

/** A single thumbnail image rendered at a small fixed size.
 *  Clicking opens the full image in a new browser tab (US-017).
 *  Shows a pin indicator when the item is pinned (US-024).
 */
function ThumbnailImage({ item }: { item: ImageItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View full image"
      data-testid="thumbnail-link"
      className="relative block shrink-0"
      style={{ width: 64, height: 64 }}
    >
      <img
        src={item.url}
        alt=""
        className="block object-cover rounded w-full h-full"
        data-testid="thumbnail-image"
      />
      {item.pinned && (
        <span
          className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
          aria-label="Pinned"
          data-testid="thumbnail-pin-indicator"
        >
          <Pin className="h-2.5 w-2.5 text-primary" aria-hidden="true" />
        </span>
      )}
    </a>
  );
}

// ─── ThumbnailPanel (desktop right panel) ──────────────────────────────────

interface ThumbnailPanelProps {
  generations: ImageGeneration[];
  items: ImageItem[];
}

/**
 * Desktop right panel: vertically scrollable list of all thumbnails grouped
 * by stepId descending.
 */
function ThumbnailPanel({ generations, items }: ThumbnailPanelProps) {
  const groups = groupItemsByStep(generations, items);

  if (groups.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center mt-2" data-testid="thumbnail-panel-empty">
        No images yet.
      </p>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.stepId} className="mb-3" data-testid="thumbnail-group">
          <p className="text-xs text-muted-foreground mb-1">Step {group.stepId}</p>
          <div className="flex flex-col gap-1">
            {group.items.map((item) => (
              <ThumbnailImage key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── ThumbnailStrip (mobile horizontal strip) ──────────────────────────────

/**
 * Mobile horizontal strip: all thumbnails across all steps rendered in a
 * single horizontal row, ordered newest step first.
 */
function ThumbnailStrip({ generations, items }: ThumbnailPanelProps) {
  const groups = groupItemsByStep(generations, items);

  if (groups.length === 0) {
    return (
      <p className="text-xs text-muted-foreground whitespace-nowrap" data-testid="thumbnail-strip-empty">
        No images yet.
      </p>
    );
  }

  return (
    <>
      {groups.map((group) =>
        group.items.map((item) => (
          <ThumbnailImage key={item.id} item={item} />
        ))
      )}
    </>
  );
}

// ─── SkeletonCard ──────────────────────────────────────────────────────────

/**
 * A placeholder card shown while a generation is in-flight (US-021).
 * Matches the aspect ratio and size of real image cards (square, 320px).
 * Shows a spinning icon and an elapsed-seconds counter while in-flight.
 */
function SkeletonCard() {
  const elapsed = useElapsedTimer(true);

  return (
    <div
      className="rounded-lg overflow-hidden border bg-card shadow-sm animate-pulse relative"
      data-testid="skeleton-card"
      role="status"
      aria-label={`Generating image… ${elapsed}s`}
    >
      <div
        className="bg-muted flex flex-col items-center justify-center gap-2"
        style={{ width: "320px", height: "320px" }}
      >
        <Loader2 className="h-8 w-8 text-muted-foreground/60 animate-spin" />
        <span className="text-sm text-muted-foreground/60 font-medium tabular-nums" data-testid="skeleton-elapsed">
          {elapsed}s
        </span>
      </div>
    </div>
  );
}

// ─── ErrorCard ─────────────────────────────────────────────────────────────

/**
 * Inline error card shown for a single failed image slot (US-022).
 * Displayed at the same size as a real image card so the layout stays stable.
 *
 * US-007: Renders a Retry button that re-fires generation for this slot only.
 * onRetry is called when the user clicks Retry; it is undefined while a retry
 * is already in-flight so the button is hidden/disabled during that time.
 */
function ErrorCard({ message, onRetry, isRetrying }: { message: string; onRetry?: () => void; isRetrying?: boolean }) {
  return (
    <div
      className="rounded-lg overflow-hidden border bg-destructive/10 border-destructive/30 shadow-sm flex flex-col items-center justify-center gap-2 p-4"
      data-testid="image-error-card"
      style={{ width: "320px", height: "320px" }}
    >
      <p className="text-destructive text-sm font-medium text-center">Image failed</p>
      <p className="text-destructive/80 text-xs text-center line-clamp-3">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          aria-label="Retry image generation"
          data-testid="retry-btn"
          className="flex items-center gap-1 rounded-md bg-destructive/20 hover:bg-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          {isRetrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}

// ─── SlotResult type ───────────────────────────────────────────────────────

/**
 * Represents the outcome of a single image generation slot (US-022).
 * A slot is either a successfully stored item or a failed request with an
 * error message. Used to render per-slot error cards alongside sibling
 * images that succeeded.
 *
 * US-007: The error variant includes an optional `isRetrying` flag that is
 * set to true while a retry for this specific slot is in-flight, so the
 * Retry button can be disabled during that time.
 */
type SlotResult =
  | { kind: "item"; item: ImageItem }
  | { kind: "error"; message: string; isRetrying?: boolean };

// ─── ImageCard (US-023, US-025) ────────────────────────────────────────────

interface ImageCardProps {
  item: ImageItem;
  /** 1-based index used to build the download filename. */
  index: number;
  /** Session title used to build the download filename. */
  sessionTitle: string;
  /** Called when the user toggles the pin state for this image (US-024). */
  onPinToggle: (item: ImageItem) => void;
  /**
   * US-025: Called when the user clicks Regenerate on this image card.
   * Fires a new generateImage call for this slot; the result is appended
   * alongside the original image.
   */
  onRegenerate?: (item: ImageItem) => void;
  /**
   * US-025: True while a regeneration for this specific image is in-flight.
   * When true, a spinner card replaces the image and the Regenerate button
   * is disabled.
   */
  isRegenerating?: boolean;
}

/**
 * A single image card with overlaid Download (US-023), Pin toggle (US-024),
 * and Regenerate (US-025) buttons. All buttons are always visible so users
 * can easily discover them.
 *
 * US-025: When isRegenerating is true, a spinner card with elapsed timer is
 * shown instead of the image. The old image is preserved in storage and will
 * be visible in thumbnails; the new image appears alongside it once ready.
 *
 * The Pin button visually distinguishes pinned (filled icon + tinted background)
 * from unpinned (outline icon) state.
 */
function ImageCard({ item, index, sessionTitle, onPinToggle, onRegenerate, isRegenerating }: ImageCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const elapsed = useElapsedTimer(isRegenerating ?? false);

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    log({ category: "user:action", action: "image:download", data: { itemId: item.id } });
    try {
      await downloadImage(item.url, `${sessionTitle}-${index}`);
    } finally {
      setIsDownloading(false);
    }
  }, [item.url, item.id, index, sessionTitle, isDownloading]);

  // US-025: While regenerating, show a spinner card at the same fixed size
  // as SkeletonCard so the layout stays stable.
  if (isRegenerating) {
    return (
      <div
        className="rounded-lg overflow-hidden border bg-card shadow-sm animate-pulse relative"
        data-testid="image-card-regenerating"
        role="status"
        aria-label={`Regenerating image… ${elapsed}s`}
      >
        <div
          className="bg-muted flex flex-col items-center justify-center gap-2"
          style={{ width: "320px", height: "320px" }}
        >
          <Loader2 className="h-8 w-8 text-muted-foreground/60 animate-spin" />
          <span className="text-sm text-muted-foreground/60 font-medium tabular-nums" data-testid="regenerating-elapsed">
            {elapsed}s
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-lg overflow-hidden border bg-card shadow-sm"
      data-testid="image-card"
    >
      <img
        src={item.url}
        alt=""
        className="w-full h-auto block"
        style={{ maxWidth: "320px" }}
      />
      <div className="absolute bottom-2 right-2 flex gap-1">
        {/* Pin toggle button (US-024) */}
        <button
          type="button"
          onClick={() => onPinToggle(item)}
          aria-label={item.pinned ? "Unpin image" : "Pin image"}
          aria-pressed={item.pinned}
          data-testid="pin-btn"
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium shadow transition-colors ${
            item.pinned
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-background/80 hover:bg-background"
          }`}
        >
          {item.pinned ? (
            <PinOff className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Pin className="h-3 w-3" aria-hidden="true" />
          )}
          {item.pinned ? "Unpin" : "Pin"}
        </button>
        {/* Download button (US-023) */}
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={isDownloading}
          aria-label="Download image"
          data-testid="download-btn"
          className="flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs font-medium shadow hover:bg-background transition-colors disabled:opacity-50"
        >
          <Download className="h-3 w-3" aria-hidden="true" />
          {isDownloading ? "Saving…" : "Download"}
        </button>
        {/* Regenerate button (US-025) */}
        {onRegenerate && (
          <button
            type="button"
            onClick={() => onRegenerate(item)}
            aria-label="Regenerate image"
            data-testid="regenerate-btn"
            className="flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs font-medium shadow hover:bg-background transition-colors"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Regen
          </button>
        )}
      </div>
    </div>
  );
}

// ─── MainPane ──────────────────────────────────────────────────────────────

interface MainPaneProps {
  generations: ImageGeneration[];
  items: ImageItem[];
  /** Session title used to build download filenames (US-023). */
  sessionTitle: string;
  /** When set, show N skeleton cards instead of the real latest images (US-021). */
  skeletonCount?: number;
  /**
   * Per-slot results from the most recent generation attempt (US-022).
   * When provided, each slot renders either an image card or an inline error
   * card — allowing sibling successes to display normally alongside failures.
   * Cleared once new storage-backed items are loaded.
   */
  slotResults?: SlotResult[];
  /** Called when the user clicks the Pin toggle on an image card (US-024). */
  onPinToggle: (item: ImageItem) => void;
  /**
   * US-007: Called when the user clicks Retry on an error card.
   * Receives the 0-based slot index of the failed slot so only that slot
   * is re-attempted without affecting sibling slots.
   */
  onRetrySlot?: (slotIndex: number) => void;
  /**
   * US-025: Called when the user clicks Regenerate on an image card.
   * Receives the ImageItem so the handler knows which image to regenerate.
   * The new image is appended alongside the original.
   */
  onRegenerateItem?: (item: ImageItem) => void;
  /**
   * US-025: Set of ImageItem IDs currently being regenerated.
   * Used to show the spinner card for each in-flight regeneration.
   */
  regeneratingItemIds?: Set<string>;
}

/**
 * Renders images from the generation with the highest stepId.
 * Shows skeleton cards while generation is in-flight (US-021).
 * Shows per-slot error cards for failed slots (US-022).
 * Shows an empty state when no generations exist.
 *
 * US-025: Passes onRegenerateItem and regeneratingItemIds to each ImageCard
 * so the Regenerate button and per-item spinner work without affecting siblings.
 */
function MainPane({ generations, items, sessionTitle, skeletonCount, slotResults, onPinToggle, onRetrySlot, onRegenerateItem, regeneratingItemIds }: MainPaneProps) {
  // While generation is in-flight, show skeleton placeholders (US-021).
  if (skeletonCount !== undefined && skeletonCount > 0) {
    return (
      <div
        className="flex flex-wrap gap-4 content-start"
        data-testid="main-pane-skeletons"
      >
        {Array.from({ length: skeletonCount }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  // After generation completes, show per-slot results (US-022).
  // This includes inline error cards for failed slots and image cards for
  // successful slots, before the next data reload replaces slotResults.
  if (slotResults && slotResults.length > 0) {
    return (
      <div
        className="flex flex-wrap gap-4 content-start"
        data-testid="main-pane-images"
      >
        {slotResults.map((slot, i) =>
          slot.kind === "item" ? (
            <ImageCard
              key={slot.item.id}
              item={slot.item}
              index={i + 1}
              sessionTitle={sessionTitle}
              onPinToggle={onPinToggle}
              onRegenerate={onRegenerateItem}
              isRegenerating={regeneratingItemIds?.has(slot.item.id)}
            />
          ) : (
            <ErrorCard
              key={`error-${i}`}
              message={slot.message}
              isRetrying={slot.isRetrying}
              onRetry={onRetrySlot ? () => onRetrySlot(i) : undefined}
            />
          )
        )}
      </div>
    );
  }

  if (generations.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-center gap-2"
        data-testid="main-pane-empty"
      >
        <p className="text-muted-foreground text-sm">
          No images yet. Enter a prompt below to generate images.
        </p>
      </div>
    );
  }

  // Find the generation with the highest stepId
  const latestGeneration = generations.reduce((best, g) =>
    g.stepId > best.stepId ? g : best
  );

  // Get non-deleted items for that generation
  const latestItems = items.filter(
    (item) => item.generationId === latestGeneration.id && !item.deleted
  );

  if (latestItems.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full text-center gap-2"
        data-testid="main-pane-empty"
      >
        <p className="text-muted-foreground text-sm">
          No images yet. Enter a prompt below to generate images.
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap gap-4 content-start"
      data-testid="main-pane-images"
    >
      {latestItems.map((item, i) => (
        <ImageCard
          key={item.id}
          item={item}
          index={i + 1}
          sessionTitle={sessionTitle}
          onPinToggle={onPinToggle}
          onRegenerate={onRegenerateItem}
          isRegenerating={regeneratingItemIds?.has(item.id)}
        />
      ))}
    </div>
  );
}

// ─── SessionView ───────────────────────────────────────────────────────────

interface SessionData {
  session: ImageSession;
  generations: ImageGeneration[];
  items: ImageItem[];
}

function loadSession(id: string | undefined): SessionData | null {
  if (!id) return null;
  const session = imageStorageService.getSession(id);
  if (!session) return null;
  return {
    session,
    generations: imageStorageService.getGenerationsBySession(id),
    items: imageStorageService.listItemsBySession(id),
  };
}

/** Returns the prompt from the generation with the highest stepId, or empty string. */
function latestPrompt(generations: ImageGeneration[]): string {
  if (generations.length === 0) return "";
  return generations.reduce((best, g) => (g.stepId > best.stepId ? g : best)).prompt;
}

export default function SessionView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { refreshBalance } = usePoeBalanceContext();

  // Initialise data from storage once on mount (id is stable for the lifetime of this view).
  const [data, setData] = useState<SessionData | null>(() => loadSession(id));

  // Prompt text — pre-populated with the latest generation's prompt (US-018).
  // Falls back to session.prompt (full text) then session.title (truncated) on
  // a fresh session with no generations yet. Never cleared programmatically:
  // the user owns the value.
  const [prompt, setPrompt] = useState<string>(() =>
    latestPrompt(data?.generations ?? []) || data?.session.prompt || data?.session.title || ""
  );

  // True while a generateImage call is in-flight (disables Generate button).
  const [isGenerating, setIsGenerating] = useState(false);

  // Number of skeleton cards to show in the main pane while generation is
  // in-flight (US-021). Set to numImages at generation start, cleared on finish.
  const [skeletonCount, setSkeletonCount] = useState<number | undefined>(undefined);

  // Per-slot results after generation completes (US-022).
  // Each entry is either a stored ImageItem or an error message for that slot.
  // Cleared when the next generation starts (replaced by skeleton cards).
  const [slotResults, setSlotResults] = useState<SlotResult[] | undefined>(undefined);

  // US-025: Set of ImageItem IDs currently being regenerated.
  // Each regeneration is independent; adding/removing an id does not affect other cards.
  const [regeneratingItemIds, setRegeneratingItemIds] = useState<Set<string>>(new Set());

  // Selected image model (US-004): default to the first model in the list.
  const [selectedModel, setSelectedModel] = useState<ImageModelDef>(IMAGE_MODELS[0]);

  // Remix file upload (US-006): holds the user-selected reference image file,
  // or null when no file is selected or the current model does not support remix.
  const [remixFile, setRemixFile] = useState<File | null>(null);

  // Clear remixFile whenever selectedModel changes to a model that does not
  // support remix (US-006 acceptance criterion: selecting a non-remix model
  // clears any previously selected file).
  useEffect(() => {
    if (!selectedModel.supportsRemix) {
      setRemixFile(null);
    }
  }, [selectedModel]);

  // API key guard (US-020/US-023): shows ApiKeyMissingModal when poeApiKey is absent.
  const { isModalOpen: isApiKeyModalOpen, guardAction, closeModal: closeApiKeyModal, proceedWithPendingAction: proceedApiKey } = useApiKeyGuard();

  // Used to ignore stale setState calls if the component unmounts mid-flight.
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Auto-trigger generation when navigated here from Home with a fresh session
  // (no generations yet). Uses a ref so a StrictMode double-mount doesn't fire twice.
  const hasAutoGeneratedRef = useRef(false);
  useEffect(() => {
    if (hasAutoGeneratedRef.current) return;
    if (!data || data.generations.length > 0) return;
    hasAutoGeneratedRef.current = true;
    void handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewSession = useCallback(() => {
    log({ category: "user:action", action: "image:new-session", data: {} });
    navigate("/image");
  }, [navigate]);

  /**
   * Toggles the pinned state of an ImageItem (US-024).
   * Persists the change via imageStorageService.updateItem, then reloads
   * the session data so both the main pane and thumbnail panel reflect
   * the updated state.
   */
  const handlePinToggle = useCallback((item: ImageItem) => {
    const newPinned = !item.pinned;
    log({
      category: "user:action",
      action: newPinned ? "image:pin" : "image:unpin",
      data: { itemId: item.id },
    });
    imageStorageService.updateItem(item.id, { pinned: newPinned });
    const updated = loadSession(id);
    if (isMounted.current) {
      setData(updated);
      // Also update any slot results so the main pane reflects the new state
      // while slotResults are still shown (e.g. immediately after generation).
      setSlotResults((prev) => {
        if (!prev) return prev;
        return prev.map((slot) =>
          slot.kind === "item" && slot.item.id === item.id
            ? { kind: "item", item: { ...slot.item, pinned: !item.pinned } }
            : slot
        );
      });
    }
  }, [id]);

  const handleGenerateCore = useCallback(async () => {
    if (isGenerating) return;
    const trimmed = prompt.trim();
    if (!trimmed || !id || !data) return;

    setIsGenerating(true);
    // Clear any previous per-slot results when a new generation starts (US-022).
    setSlotResults(undefined);

    log({
      category: "user:action",
      action: "image:generate:start",
      data: { sessionId: id },
    });

    try {
      const musicSettings = getSettings();
      const imageSettings = imageStorageService.getImageSettings();
      const numImages = imageSettings?.numImages ?? 3;

      // Show skeleton cards in the main pane while generation is in-flight (US-021).
      setSkeletonCount(numImages);

      const client = createLLMClient(musicSettings?.poeApiKey ?? undefined);

      // Create the generation record first (storage auto-assigns next stepId).
      const generation = imageStorageService.createGeneration({
        sessionId: id,
        prompt: trimmed,
      });

      // Base64-encode the remix file if one is selected (US-007).
      // FileReader.readAsDataURL() produces a data URI like "data:image/png;base64,<data>".
      // Strip the prefix to obtain the raw base64 string required by the API.
      let remixImageBase64: string | undefined;
      if (remixFile) {
        remixImageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            // Strip the "data:<mime>;base64," prefix
            const base64 = dataUrl.split(",")[1];
            resolve(base64);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(remixFile);
        });
      }

      // Fire N independent parallel requests using allSettled so that a single
      // failure does not abort sibling requests (US-022).
      // Pass selected model id, extraBody, and remixImageBase64 through (US-004, US-005, US-007).
      const settled = await Promise.allSettled(
        Array.from({ length: numImages }, () =>
          client.generateImage(trimmed, 1, selectedModel.id, selectedModel.extraBody, remixImageBase64)
        )
      );

      if (!isMounted.current) return;

      // Refresh balance after image generation completes (US-024).
      refreshBalance(musicSettings?.poeApiKey);

      // Build per-slot results: persist successful URLs and capture error messages.
      const slots: SlotResult[] = settled.map((result) => {
        if (result.status === "fulfilled") {
          const url = result.value[0];
          const item = imageStorageService.createItem({ generationId: generation.id, url });
          return { kind: "item", item } as SlotResult;
        } else {
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : "Generation failed";
          return { kind: "error", message } as SlotResult;
        }
      });

      // Reload session data from storage so thumbnails and future steps reflect
      // the newly stored items.
      const updated = loadSession(id);
      if (isMounted.current) {
        setData(updated);
        // Show per-slot results (including any error cards) in the main pane.
        setSlotResults(slots);
      }
    } catch (err) {
      // Unexpected error (e.g. storage failure) — log it; the UI will show the
      // previous state since slotResults remains undefined.
      const errMsg = err instanceof Error ? err.message : "Generation failed";
      log({
        category: "error",
        action: "image:generate:error",
        data: { sessionId: id, error: errMsg },
      });
    } finally {
      if (isMounted.current) {
        // Clear skeletons now that generation has finished (success or error).
        setSkeletonCount(undefined);
        setIsGenerating(false);
      }
    }
  }, [id, data, prompt, isGenerating, selectedModel, remixFile, refreshBalance]);

  const handleGenerate = useCallback(() => {
    // Guard: show modal and abort if no API key is configured (US-020/US-023).
    guardAction(() => void handleGenerateCore());
  }, [guardAction, handleGenerateCore]);

  /**
   * US-007: Retries a single failed image slot by index.
   *
   * Only the specified slot is re-attempted. Sibling slots are unaffected.
   * While the retry is in-flight, the error card for that slot shows
   * "Retrying…" and the Retry button is disabled. On success the error card
   * is replaced by the generated image; on failure the error message is
   * updated with the new error.
   */
  const handleRetrySlot = useCallback(async (slotIndex: number) => {
    if (!id || !data) return;
    // Guard: show modal and abort if no API key is configured.
    if (!guardAction()) return;

    const trimmed = prompt.trim();
    if (!trimmed) return;

    log({
      category: "user:action",
      action: "image:retry:start",
      data: { sessionId: id, slotIndex },
    });

    // Mark this slot as retrying so the UI disables the Retry button.
    setSlotResults((prev) => {
      if (!prev) return prev;
      return prev.map((slot, i) =>
        i === slotIndex && slot.kind === "error"
          ? { ...slot, isRetrying: true }
          : slot
      );
    });

    try {
      const musicSettings = getSettings();
      const client = createLLMClient(musicSettings?.poeApiKey ?? undefined);

      // Find the generation that produced the current slotResults.
      // The most recent generation (highest stepId) is the one we are retrying into.
      const latestGeneration =
        data.generations.length > 0
          ? data.generations.reduce((best, g) =>
              g.stepId > best.stepId ? g : best
            )
          : null;

      if (!latestGeneration || !isMounted.current) return;

      let remixImageBase64: string | undefined;
      if (remixFile) {
        remixImageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(",")[1]);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(remixFile);
        });
      }

      const result = await client.generateImage(
        trimmed,
        1,
        selectedModel.id,
        selectedModel.extraBody,
        remixImageBase64
      );

      if (!isMounted.current) return;

      const url = result[0];
      const item = imageStorageService.createItem({
        generationId: latestGeneration.id,
        url,
      });

      // Refresh balance after successful retry (US-024).
      refreshBalance(musicSettings?.poeApiKey);

      // Replace the error slot with the newly generated item.
      const updated = loadSession(id);
      if (isMounted.current) {
        setData(updated);
        setSlotResults((prev) => {
          if (!prev) return prev;
          return prev.map((slot, i) =>
            i === slotIndex ? ({ kind: "item", item } as SlotResult) : slot
          );
        });
      }
    } catch (err) {
      if (!isMounted.current) return;
      const errMsg = err instanceof Error ? err.message : "Generation failed";
      log({
        category: "error",
        action: "image:retry:error",
        data: { sessionId: id, slotIndex, error: errMsg },
      });
      // Update the slot with the new error message and clear isRetrying.
      setSlotResults((prev) => {
        if (!prev) return prev;
        return prev.map((slot, i) =>
          i === slotIndex && slot.kind === "error"
            ? { kind: "error", message: errMsg }
            : slot
        );
      });
    }
  }, [id, data, prompt, guardAction, selectedModel, remixFile, refreshBalance]);

  /**
   * US-025: Regenerates a single existing image card.
   *
   * Fires a new generateImage call for the given item. The new image is stored
   * as an additional ImageItem in the same generation and appended to the
   * display list alongside the original — the old image is never removed.
   *
   * While regeneration is in-flight, the card for `item` shows a spinner with
   * elapsed timer (isRegenerating=true). Sibling cards are unaffected.
   */
  const handleRegenerateItem = useCallback(async (item: ImageItem) => {
    if (!id || !data) return;
    // Guard: show modal and abort if no API key is configured.
    if (!guardAction()) return;

    const trimmed = prompt.trim();
    if (!trimmed) return;

    log({
      category: "user:action",
      action: "image:regenerate:start",
      data: { sessionId: id, itemId: item.id },
    });

    // Mark this item as regenerating so its card shows the spinner.
    setRegeneratingItemIds((prev) => new Set(prev).add(item.id));

    try {
      const musicSettings = getSettings();
      const client = createLLMClient(musicSettings?.poeApiKey ?? undefined);

      // Regenerate into the same generation as the source item so the new
      // image appears alongside the original in the main pane.
      const generationId = item.generationId;

      let remixImageBase64: string | undefined;
      if (remixFile) {
        remixImageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(",")[1]);
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(remixFile);
        });
      }

      const result = await client.generateImage(
        trimmed,
        1,
        selectedModel.id,
        selectedModel.extraBody,
        remixImageBase64
      );

      if (!isMounted.current) return;

      const url = result[0];
      // Store the new image in the same generation; it will appear alongside
      // the original when the session data is reloaded below.
      imageStorageService.createItem({ generationId, url });

      // Refresh balance after successful regeneration (US-024).
      refreshBalance(musicSettings?.poeApiKey);

      // Reload session data so the new image is reflected in the main pane
      // and thumbnail panel.
      const updated = loadSession(id);
      if (isMounted.current) {
        setData(updated);
        // Also update slotResults if they are currently shown, so the new
        // item appears without waiting for the next full generation.
        if (slotResults) {
          const reloaded = imageStorageService.listItemsBySession(id ?? "");
          const newItem = reloaded.find((i) => i.generationId === generationId && i.url === url);
          if (newItem) {
            setSlotResults((prev) => {
              if (!prev) return prev;
              return [...prev, { kind: "item", item: newItem }];
            });
          }
        }
      }
    } catch (err) {
      if (!isMounted.current) return;
      const errMsg = err instanceof Error ? err.message : "Generation failed";
      log({
        category: "error",
        action: "image:regenerate:error",
        data: { sessionId: id, itemId: item.id, error: errMsg },
      });
      // On failure, the original image card reappears (spinner is removed)
      // and a console error is recorded. No error card replaces the original.
    } finally {
      if (isMounted.current) {
        // Remove this item from the regenerating set so the spinner is hidden.
        setRegeneratingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
      }
    }
  }, [id, data, prompt, guardAction, selectedModel, remixFile, refreshBalance, slotResults]);

  if (!data) {
    return <Navigate to="/image" replace />;
  }

  return (
    <>
    <div className="flex flex-col h-screen" data-testid="session-view">
      <TopBar />

      {/*
       * Body: three structural regions.
       *
       * Desktop (≥ 640px):
       *   [ main pane (flex-1) | thumbnail panel (fixed width) ]
       *   [ bottom input bar (full width)                       ]
       *
       * Mobile (< 640px):
       *   [ main pane (flex-1)                       ]
       *   [ thumbnail strip (horizontal scroll)      ]
       *   [ bottom input bar                         ]
       */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Main + thumbnail row */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── Main pane ──────────────────────────────────────────────── */}
          <main
            className="flex-1 overflow-auto p-4"
            aria-label="Generated images"
            data-testid="main-pane"
          >
            <MainPane generations={data.generations} items={data.items} sessionTitle={data.session.title} skeletonCount={skeletonCount} slotResults={slotResults} onPinToggle={handlePinToggle} onRetrySlot={handleRetrySlot} onRegenerateItem={handleRegenerateItem} regeneratingItemIds={regeneratingItemIds} />
          </main>

          {/* ── Thumbnail panel (desktop right panel) ──────────────────── */}
          <aside
            className="hidden sm:flex flex-col w-40 border-l overflow-y-auto p-2 shrink-0"
            aria-label="Image thumbnails"
            data-testid="thumbnail-panel"
          >
            <ThumbnailPanel generations={data.generations} items={data.items} />
          </aside>
        </div>

        {/* ── Mobile thumbnail strip (below main pane, above input) ─── */}
        <div
          className="flex sm:hidden overflow-x-auto border-t p-2 gap-2 shrink-0"
          aria-label="Image thumbnails"
          data-testid="thumbnail-strip"
        >
          <ThumbnailStrip generations={data.generations} items={data.items} />
        </div>

        {/* ── Bottom input bar (US-018) ──────────────────────────────── */}
        <div
          className="border-t bg-background px-4 py-3 shrink-0"
          data-testid="bottom-bar"
        >
          <div className="flex flex-col gap-2 max-w-3xl mx-auto">
            {/* Model picker (US-004) */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="image-model-picker"
                className="text-xs text-muted-foreground whitespace-nowrap shrink-0"
              >
                Image model
              </label>
              <select
                id="image-model-picker"
                value={selectedModel.id}
                onChange={(e) => {
                  const model = IMAGE_MODELS.find((m) => m.id === e.target.value);
                  if (model) setSelectedModel(model);
                }}
                className="text-xs border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="model-picker"
                aria-label="Image model"
              >
                {IMAGE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
            {/* Remix image upload (US-006): only shown when selected model supports remix */}
            {selectedModel.supportsRemix && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="remix-image-upload"
                  className="text-xs text-muted-foreground whitespace-nowrap shrink-0"
                >
                  Reference image
                </label>
                <input
                  id="remix-image-upload"
                  type="file"
                  accept="image/jpeg,image/png"
                  onChange={(e) => setRemixFile(e.target.files?.[0] ?? null)}
                  className="text-xs"
                  data-testid="remix-image-upload"
                  aria-label="Reference image for remix"
                />
                {remixFile && (
                  <span className="text-xs text-muted-foreground truncate max-w-[180px]" data-testid="remix-file-name">
                    {remixFile.name}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-3 items-end max-w-3xl mx-auto mt-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate…"
              className="resize-none min-h-[72px] text-sm flex-1"
              aria-label="Image prompt"
              data-testid="prompt-input"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleGenerate();
                }
              }}
            />
            <div className="flex flex-col gap-2 shrink-0">
              <Button
                onClick={() => void handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                data-testid="generate-btn"
              >
                {isGenerating ? "Generating…" : "Generate"}
              </Button>
              <Button
                variant="outline"
                onClick={handleNewSession}
                data-testid="new-session-btn"
              >
                New Session
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
    {isApiKeyModalOpen && <ApiKeyMissingModal onClose={closeApiKeyModal} onProceed={proceedApiKey} />}
    </>
  );
}
