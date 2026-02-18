# CLAUDE.md — AI Studio

## Project Overview

AI Studio is a client-side web application for generating music lyrics, audio, images, and video scripts using AI via the Poe API. All data is persisted in localStorage — no backend. The stack is React 19 + TypeScript + Vite + Tailwind CSS v4, with shadcn/ui for components and Playwright for end-to-end tests.

## Tech Stack

- **Framework:** React 19, TypeScript, Vite
- **Styling:** Tailwind CSS v4, shadcn/ui, class-variance-authority
- **Routing:** React Router v7
- **Testing:** Playwright (e2e + screenshot baselines)
- **AI:** Poe API via OpenAI SDK (single `POE_API_KEY`)
- **Rich text:** Tiptap (video prompt editor)
- **Drag-and-drop:** @dnd-kit (shot reordering)
- **YAML:** js-yaml (video script export)

## Quality Gates

Every change must pass all of these before it is considered complete:

```bash
npm run lint          # ESLint on src/
npm run test          # Playwright — all tests (music, image, video)
npm run build         # TypeScript check + Vite production build
```

When working on a specific feature area, also verify the relevant subset:

```bash
# Music
npx playwright test tests/music/

# Image
npx playwright test tests/image/

# Video
npx playwright test tests/video/
```

After UI changes, regenerate affected screenshot baselines:

```bash
npx playwright test tests/music/screenshot-baselines.spec.ts --update-snapshots
npx playwright test tests/image/screenshot-baselines.spec.ts --update-snapshots
npx playwright test tests/video/screenshot-baselines.spec.ts --update-snapshots
```

## Architecture

### Feature Modules

```
src/
  shared/          # UI primitives, LLM client, hooks, utils
  music/           # Lyrics generator, song generator, pinned songs
  image/           # Image sessions, generation, pinned images
  video/           # Script editor, shot generation, templates, YAML export
```

### LLM Client

All AI access goes through a typed `LLMClient` interface in `src/shared/lib/llm/`:

- `poe-client.ts` — real Poe API via OpenAI SDK
- `mock-client.ts` — fixture-based, used in all tests
- `logging-client.ts` — wraps any client with action log entries
- `factory.ts` — returns mock when `VITE_USE_MOCK_LLM=true`, else Poe

**Tests and Playwright MCP QA always run against MockLLMClient. No live API calls during testing.**

### Storage

- Music: `storageService` (messages, songs, settings) — `song-builder:*` localStorage keys
- Image: `imageStorageService` (sessions, generations, items) — `song-builder:image-*` keys
- Video: `videoStorageService` (scripts, global templates) — `song-builder:video-*` keys
- All three are exposed on `window` in `main.tsx` for Playwright test access

### Dev vs Production

- `import.meta.env.DEV` gates: Report Bug menu item, console.debug action logging
- `VITE_USE_MOCK_LLM=true` gates: MockLLMClient (dev/test) vs PoeLLMClient (production)

## Exploratory Testing (Playwright MCP QA)

After implementing a feature, run an exploratory testing session using Playwright MCP browser tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_evaluate`) against the running dev server. This is a required quality gate in addition to automated tests.

### When to Run

- After every user story / feature change — verify the page renders and behaves correctly
- After UI changes — take screenshots at both desktop and mobile (375x812) viewports
- Before shipping a plan — run a full end-to-end smoke test across all affected features

### What to Verify

1. **Functional flows** — navigate to the feature, interact with all controls, verify state persists
2. **Mobile responsiveness** — resize to 375x812 via `browser_resize`, verify no horizontal overflow, tab layouts work, touch targets are adequate
3. **Empty states** — seed empty fixtures, verify meaningful empty state messages render
4. **Error paths** — navigate to non-existent IDs, verify redirects or error boundaries
5. **Cross-feature interactions** — verify changes don't break other feature areas
6. **Storage integrity** — use `window.storageService` / `window.imageStorageService` / `window.videoStorageService` via `browser_evaluate` to inspect persisted state
7. **Action log** — use `window.getActionLog()` via `browser_evaluate` to verify events were logged
8. **No console errors** — check `browser_console_messages` for unexpected errors

### Standard MCP QA Flow

```
1. Start dev server:  npm run dev:mock
2. browser_navigate → target page
3. browser_snapshot → verify structure
4. Interact (click, type, select)
5. browser_snapshot → verify result
6. browser_evaluate → inspect localStorage / action log
7. browser_resize(375, 812) → repeat key flows at mobile
8. browser_console_messages → check for errors
```

### Smoke Test Patterns

**Music:** navigate to /music, enter prompt, generate lyrics, generate songs, pin a song, verify pinned page

**Image:** navigate to /image, enter prompt, generate images, pin an image, verify pinned page, create new session

**Video:** create script from /video, verify editor loads with shots, switch to Shot mode, generate video, select a take, pin it, export YAML, verify templates page, verify All Videos and Pinned Videos pages

### Exploratory Testing Categories

When a feature has enough complexity, run dedicated exploratory sessions for:

- **Routes and breadcrumbs** — all route shapes render, breadcrumb segments correct, back button works, deep links load without 404
- **Settings page interactions** — mixed-state toggles, persistence across reload, autocomplete triggers, CRUD operations via modals
- **Editor features** — duration picker, toggles, auto-select, tooltips, drag-and-drop, template modals
- **AI chat tool use** — plain text responses, single and multi-tool calls, error cards, state mutation visibility
- **Regression sweep** — cross-feature interactions, YAML export field completeness, rapid route navigation, mobile viewport

Fix any bugs discovered during exploratory testing immediately in the same session, then re-verify with MCP.

## Key Conventions

- **Soft delete only** — set `deleted: true`, never hard-remove records
- **isMounted ref** — all async state updates guard against unmounted components
- **data-testid** — every interactive element carries a testid for Playwright
- **No cross-feature imports** — music/image/video import from `shared/`, never from each other
- **Fixtures committed** — mock LLM responses live in `src/shared/lib/llm/fixtures/`
- **Screenshot baselines** — committed PNGs at desktop (1280x800) and mobile (375x812)
- **Action log** — in-memory, bounded to 500 entries, dev-only console.debug output

## Common Commands

```bash
npm run dev              # Start dev server (real Poe API)
npm run dev:mock         # Start dev server (mock LLM, no API key needed)
npm run restart-dev:mock # Kill port 5173 + restart mock dev server
npm run build            # TypeScript check + production build
npm run lint             # ESLint
npm run test             # Run all Playwright tests
npm run generate:fixtures  # Re-record LLM fixtures (needs POE_API_KEY)
```
