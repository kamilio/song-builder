# Image Generation Feature Spec

## Overview

Add a new `/image` section to the app for AI image generation. The core concept is **sessions**: each initial prompt creates a new session, and within a session the user can regenerate (modifying the prompt each time), which increments a `stepId`. Each generation produces **3 images by default** (configurable).

---

## Routes

| Path | Page |
|---|---|
| `/` | Shared home — Music / Image tab switcher |
| `/image` | Image landing (big prompt input + recent sessions) |
| `/image/sessions/:id` | Session view |
| `/image/pinned` | Pinned images |
| `/settings` | Global settings (replaces `/music/settings`) |

---

## Data Model (localStorage)

Three new storage keys alongside existing music ones:

```ts
ImageSession  { id, title, createdAt }
// title = first prompt, truncated

ImageGeneration  { id, sessionId, stepId, prompt, createdAt }
// stepId increments each time user generates within a session

ImageItem  { id, generationId, url, pinned, deleted, createdAt }
```

---

## Session Page Layout

```
┌──────────────────────────────────┬──────────────┐
│                                  │  [thumb]     │
│   main pane                      │  [thumb]     │
│   (latest stepId only)           │  [thumb]     │
│   images rendered in rows        │  ──────────  │
│                                  │  [thumb]     │
│                                  │  [thumb]     │
│                                  │  [thumb]     │
├──────────────────────────────────┴──────────────┤
│  [prompt input — never clears]   [New Session] [Generate] │
└─────────────────────────────────────────────────┘
```

- **Main pane**: shows all images from the latest `stepId` only, rendered in rows
- **Right panel**: scrollable thumbnail list of ALL images across ALL steps, grouped by `stepId` descending
- **Thumbnail click**: opens minimal detail view in a new browser tab (just the image, nicer render later)
- **Prompt input**: sticky, never cleared — user edits it between generations
- **New Session button**: navigates to `/image`, resets state, auto-focuses input
- **Mobile**: right thumbnail panel collapses to a horizontal scrollable strip above the input

---

## Image Generation API

Same Poe API as music — same base URL, same OpenAI SDK, same API key:

```python
client = openai.OpenAI(
    api_key="YOUR_POE_API_KEY",
    base_url="https://api.poe.com/v1",
)
chat = client.chat.completions.create(
    model="nano-banana",
    messages=[{ "role": "user", "content": "<prompt>" }],
    extra_body={ "image_only": True }
)
# image URL is in: chat.choices[0].message.content
```

Generate 3 images in parallel per generation (default). Add to `LLMClient` interface:

```ts
generateImage(prompt: string): Promise<string[]>
```

`MockLLMClient` returns fixture image URLs for tests.

---

## Shared Components

Refactor `src/music/` to extract reusable pieces into `src/shared/`:

```
src/shared/
  components/
    ui/
      button.tsx
      textarea.tsx
    ApiKeyMissingModal.tsx
    NavMenu.tsx
    Toast.tsx
  hooks/
    useApiKeyGuard.ts
    useToast.ts
  lib/
    utils.ts
```

Both `src/music/` and `src/image/` import from `src/shared/`.

---

## Settings Refactor

- `/music/settings` → `/settings` (global route)
- Two sections on one page:
  - **Music**: `poeApiKey` (global), `numSongs`
  - **Image**: `numImages` (default 3), model config
- API key is shared across both features
- Update all internal links from `/music/settings` → `/settings`

---

## Navigation

- **NavMenu** (shared component) adapts items based on current route context:
  - In `/music/*`: All Lyrics, Pinned Songs, Settings, Report Bug
  - In `/image/*`: All Sessions, Pinned Images, Settings, Report Bug
- **Shared home** at `/`: tab switcher between Music and Image, each tab links to its own landing page (`/music`, `/image`)
- Each subsystem landing page has no tab switcher — tabs only on the root home

---

## Image Actions

- **Download** image
- **Pin** image (toggle)
- Pinned images viewable at `/image/pinned`

---

## Session History

- `/image` landing shows recent sessions (like music home shows recent lyrics)
- Session title = first prompt text, truncated
- Clicking a session navigates to `/image/sessions/:id`

---

## File Structure

```
src/
  shared/
    components/ui/  button.tsx  textarea.tsx
    components/     ApiKeyMissingModal.tsx  NavMenu.tsx  Toast.tsx
    hooks/          useApiKeyGuard.ts  useToast.ts
    lib/            utils.ts
  music/            (refactored to import from shared/)
  image/
    pages/          Home.tsx  SessionView.tsx  PinnedImages.tsx
    components/     ImageCard.tsx  ThumbnailStrip.tsx  GenerationRow.tsx
    lib/
      storage/      index.ts  storageService.ts  types.ts
      llm/          client.ts

tests/
  music/            (existing)
  image/            (new Playwright tests)

fixtures/
  index.ts          (add image fixtures)
```

---

## Loading & Error States

- While generating: skeleton placeholders in main pane (3 placeholders at correct aspect ratio)
- Per-image error: inline error state on that image card (not full-page error)
- Thumbnails only appear after generation completes

---

## Out of Scope (for now)

- In-session image detail page (thumbnail click opens new tab, not a route)
- Nicer image detail render (deferred)
- Image editing / inpainting
- Session sharing
