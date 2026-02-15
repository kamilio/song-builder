/**
 * SessionView page (US-014, US-015, US-016, US-017, US-018, US-021)
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
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { ImageIcon, Pin, Settings, Bug } from "lucide-react";
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
import { log, getAll } from "@/music/lib/actionLog";

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

async function handleImageReportBug() {
  log({
    category: "user:action",
    action: "report:bug",
    data: {},
  });
  const entries = getAll();
  await navigator.clipboard.writeText(JSON.stringify(entries, null, 2));
}

// ─── TopBar ────────────────────────────────────────────────────────────────

function TopBar() {
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

      <NavMenu items={IMAGE_NAV_ITEMS} onReportBug={handleImageReportBug} />
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
 */
function ThumbnailImage({ item }: { item: ImageItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View full image"
      data-testid="thumbnail-link"
    >
      <img
        src={item.url}
        alt=""
        className="block object-cover rounded"
        style={{ width: 64, height: 64, flexShrink: 0 }}
        data-testid="thumbnail-image"
      />
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
 */
function SkeletonCard() {
  return (
    <div
      className="rounded-lg overflow-hidden border bg-card shadow-sm animate-pulse"
      data-testid="skeleton-card"
      aria-hidden="true"
    >
      <div
        className="bg-muted"
        style={{ width: "320px", height: "320px" }}
      />
    </div>
  );
}

// ─── MainPane ──────────────────────────────────────────────────────────────

interface MainPaneProps {
  generations: ImageGeneration[];
  items: ImageItem[];
  /** When set, show N skeleton cards instead of the real latest images (US-021). */
  skeletonCount?: number;
}

/**
 * Renders images from the generation with the highest stepId.
 * Shows skeleton cards while generation is in-flight (US-021).
 * Shows an empty state when no generations exist.
 */
function MainPane({ generations, items, skeletonCount }: MainPaneProps) {
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
      {latestItems.map((item) => (
        <div
          key={item.id}
          className="rounded-lg overflow-hidden border bg-card shadow-sm"
          data-testid="image-card"
        >
          <img
            src={item.url}
            alt=""
            className="w-full h-auto block"
            style={{ maxWidth: "320px" }}
          />
        </div>
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

  // Initialise data from storage once on mount (id is stable for the lifetime of this view).
  const [data, setData] = useState<SessionData | null>(() => loadSession(id));

  // Prompt text — pre-populated with the latest generation's prompt (US-018).
  // Never cleared programmatically: the user owns the textarea value.
  const [prompt, setPrompt] = useState<string>(() =>
    latestPrompt(data?.generations ?? [])
  );

  // True while a generateImage call is in-flight (disables Generate button).
  const [isGenerating, setIsGenerating] = useState(false);

  // Number of skeleton cards to show in the main pane while generation is
  // in-flight (US-021). Set to numImages at generation start, cleared on finish.
  const [skeletonCount, setSkeletonCount] = useState<number | undefined>(undefined);

  // API key guard (US-020): shows ApiKeyMissingModal when poeApiKey is absent.
  const { isModalOpen: isApiKeyModalOpen, guardAction, closeModal: closeApiKeyModal } = useApiKeyGuard();

  // Used to ignore stale setState calls if the component unmounts mid-flight.
  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleNewSession = useCallback(() => {
    navigate("/image");
  }, [navigate]);

  const handleGenerate = useCallback(async () => {
    if (isGenerating) return;
    // Guard: show modal and abort if no API key is configured (US-020).
    if (!guardAction()) return;
    const trimmed = prompt.trim();
    if (!trimmed || !id || !data) return;

    setIsGenerating(true);

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

      // Fire parallel image requests.
      const urls = await client.generateImage(trimmed, numImages);

      if (!isMounted.current) return;

      // Persist each returned URL as an ImageItem.
      for (const url of urls) {
        imageStorageService.createItem({ generationId: generation.id, url });
      }

      log({
        category: "llm:response",
        action: "image:generate:complete",
        data: { sessionId: id, generationId: generation.id, count: urls.length },
      });

      // Reload session data from storage so the UI reflects the new generation.
      const updated = loadSession(id);
      if (isMounted.current) {
        setData(updated);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Generation failed";
      log({
        category: "llm:response",
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
  }, [id, data, prompt, isGenerating, guardAction]);

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
            <MainPane generations={data.generations} items={data.items} skeletonCount={skeletonCount} />
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
          <div className="flex gap-3 items-end max-w-3xl mx-auto">
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
    {isApiKeyModalOpen && <ApiKeyMissingModal onClose={closeApiKeyModal} />}
    </>
  );
}
