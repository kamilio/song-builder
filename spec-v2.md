# Song Builder — Spec v2

## Overview

A client-side web app for generating song lyrics and audio. Built with React and TypeScript. All data is persisted in local storage — no backend required. Deployable to GitHub Pages (`https://kamilio.github.io/song-builder/`).

The primary flow is linear: write lyrics → generate songs. Each lyrics entry is a self-contained session that owns its chat history and its generated songs.

---

## Navigation

### Breadcrumbs

A breadcrumb bar at the top of every page shows the current location:

| View | URL | Breadcrumb |
| --- | --- | --- |
| Home (new song input) | `/` | _(none)_ |
| Lyrics list | `/lyrics` | `Lyrics` |
| Lyrics editor | `/lyrics/:messageId` | `Lyrics / {title}` |
| Songs view | `/lyrics/:messageId/songs` | `Lyrics / {title} / Songs` |
| Pinned Songs | `/pinned` | `Pinned Songs` |
| Settings | `/settings` | `Settings` |

`:messageId` is the ID of the current message being viewed. The root of the conversation tree is derived by walking up `parentId` links — no separate root identifier is stored or used in routes.

Each segment is a clickable link. No persistent left sidebar.

### Top-right menu

A minimal circular button in the top-right corner opens a dropdown with:

- **All Lyrics** — navigates to the Lyrics list (`/lyrics`)
- **Pinned Songs** — navigates to Pinned Songs (`/pinned`)
- **Settings** — navigates to Settings (`/settings`)
- **Report Bug** — copies the full in-memory action log to the clipboard

---

## Pages

### 1. Home (`/`)

The landing page. A single large prompt input, no other chrome — modelled on Claude's desktop home screen.

**Layout:**

- Centred prompt input with placeholder text: _"What song do you want to make?"_
- Submit button (or Enter to submit)
- No list, no table, no sidebar

**Behavior:**

- Submitting the prompt creates the first user message (with `parentId: null`), then immediately navigates to `/lyrics/:messageId` using that message's ID
- The input is the only entry point for starting a new song
- Previous chats are accessible via **All Lyrics** in the top-right menu

---

### 2. Lyrics List (`/lyrics`)

A searchable table of all assistant messages (lyrics versions) — one row per lyrics version, across all branches of all trees.

**Layout:**

- Page title: "Lyrics"
- Search input (filters by title and style in real time)
- Table rows: title, style, song count, created date
- No "New Lyrics" button — new songs start from Home (`/`)

**Behavior:**

- Clicking a row navigates to `/lyrics/:messageId` using that assistant message's ID; walking up `parentId` links renders the full conversation path to that message
- Each row has a soft-delete action (`deleted: true` on the message, removes it from the list)
- Soft-deleted messages are never shown

---

### 3. Lyrics Editor (`/lyrics/:messageId`)

The main workspace for writing and iterating on lyrics. Two-panel layout.

`:messageId` is the ID of the current message. The full conversation path is derived by walking up `parentId` links from this message to the root and rendering top-down.

**Layout:**

- **Left panel** — structured, inline-editable fields followed by the lyrics body
- **Right panel** — chat interface for iterating with Claude
- **"Songs"** button at the top right of the left panel navigates to the Songs View for this entry

**Left panel — inline editing:**

All fields are rendered as formatted content. Clicking a field activates an inline editor. Changes save on blur or Enter (single-line fields). Fields:

| Field | Display style | Edit style |
| --- | --- | --- |
| `title` | Large heading (h1) | Single-line text input |
| `style` | Styled tag/pill group | Single-line text input |
| `commentary` | Italic paragraph | Textarea |
| `duration` | Formatted as `M:SS` (e.g. `2:30`) | Number input in seconds |
| Lyrics body | Verse-formatted text (line breaks preserved) | Textarea |

A pencil icon appears on hover for each field to signal editability.

**Right panel — chat:**

- Scrollable message history showing the path from root to the current message
- **User messages** — plain text bubbles
- **Assistant messages** — rendered as structured **LyricsItem cards**, never as raw frontmatter text:
  - `title` displayed as a heading
  - `style` displayed as a styled tag
  - `commentary` displayed as a short italic note
  - Lyrics body shown as a collapsible preview (first 4 lines visible, expand to see all)
  - Song count badge: "3 songs" (or "No songs yet")
  - **"Songs"** button navigates to `/lyrics/:messageId/songs` for this specific LyricsItem
  - Clicking the card navigates to `/lyrics/:messageId` — no confirmation
- Text input with send button at the bottom
- Loading indicator (skeleton card) while awaiting the assistant response

**Checkpoint navigation:**

Clicking an assistant message card navigates to `/lyrics/:messageId` using that message's ID — no button, no confirmation:

1. The URL updates to `/lyrics/:messageId` for the clicked message — this pushes a new browser history entry
2. The chat **re-renders showing only the path from root to that message** — the ancestor chain, derived by walking up `parentId` links
3. The left panel updates to show that message's lyrics fields
4. A **subtle inline banner** appears above the chat input if the current message is not a leaf (i.e. has descendants): _"Viewing an earlier version · Return to latest"_ — clicking "Return to latest" navigates to `/lyrics/:latestLeafMessageId`, the most recently created descendant in this branch
5. If the user **sends a new message**: it is stored with `parentId` pointing to the current message, then the chat re-renders showing the new message appended. If two messages now share the same `parentId`, a branch is formed. The URL updates to the new leaf message.

This means:

- Nothing is ever removed — forking just adds new messages to the tree
- Every message in every branch remains accessible via the Lyrics List
- The tree structure handles branching naturally; no cleanup required

**Chat behavior:**

- Submitting a message calls `llmClient.chat()` with the ancestor path of the current view (root → current message) as the conversation history
- The response is parsed as frontmatter + lyrics body; a new assistant Message is created and stored
- The new assistant message card appears at the bottom of the visible chat; the URL updates to `/lyrics/:newAssistantMessageId`
- Conversation is persisted to localStorage
- The system prompt instructs Claude to always return the full updated lyrics in frontmatter format, and to set `duration` to a value between 120–180 (seconds) based on the song length it envisions

**Frontmatter metadata fields:**

- `title`
- `style` — genre, mood, instrumentation hints
- `commentary` — Claude's notes on the lyrics
- `duration` — target length in seconds; Claude is instructed to suggest a value between 120–180 (2–3 minutes)

---

### 4. Songs View (`/lyrics/:messageId/songs`)

The audio generation phase for a specific assistant message (lyrics version). No chat.

`:messageId` is the ID of the assistant message that produced these lyrics.

**Layout:**

- Breadcrumb: `Lyrics / {title} / Songs`
- **"Generate"** button at the top triggers a new batch of parallel song generations
- List of all non-deleted generated songs, each with an audio player

**Song card:**

- Song title (derived from lyrics metadata + generation index)
- Inline `<audio>` player (always visible, not toggled)
- Action buttons: **Pin**, **Delete**, **Download**

**Behavior:**

- Generation calls `llmClient.generateSong()` N times concurrently (N from Settings, default 3)
- `music_length_ms` passed to ElevenLabs is `message.duration * 1000` (stored as seconds, API expects milliseconds)
- Each song card renders and updates independently — completing one song does not re-render or interrupt sibling cards
- Each song card is isolated via React.memo and keyed by a stable song ID
- Song state is stored as a Map keyed by song ID; only the relevant entry is updated on completion
- A loading skeleton is shown per song slot while its generation is in flight
- Songs are persisted to localStorage under the current message ID
- ElevenLabs returns a URL; that URL is used directly for playback and download

**Per-song actions:**

- **Pin** — sets `pinned: true`; song appears in Pinned Songs
- **Delete** — soft delete only (`deleted: true`); song is hidden from the list
- **Download** — fetches the audio URL and triggers the browser's native save dialog

---

### 5. Pinned Songs (`/pinned`)

A flat list of all pinned, non-deleted songs across all lyrics entries.

**Layout:**

- Page title: "Pinned Songs"
- Each song shows: song title, associated lyrics title (clickable — navigates to `/lyrics/:messageId/songs` for the message that produced it)
- Inline `<audio>` player per song
- Action buttons: **Unpin**, **Download**

**Behavior:**

- Unpin sets `pinned: false` and removes the song from this view
- Download triggers the browser's native save dialog

---

### 6. Settings (`/settings`)

**Fields:**

- **POE_API_KEY** — single key used for both Claude and ElevenLabs via Poe; saved to localStorage on submit
- **Number of songs to generate** — default 3; saved to localStorage on submit
- **Export** — calls `storageService.export()` and downloads JSON; checkbox: "Include API key in export" (opt-in, default off)
- **Import** — file picker; calls `storageService.import(json)` to replace all data
- **Reset Memory** — calls `storageService.reset()` which executes `localStorage.clear()`; requires a confirmation dialog ("This will permanently delete all lyrics, songs, and settings. This cannot be undone."); on confirm, clears everything and redirects to `/`; no backwards compatibility guaranteed — this is a full wipe

---

## API Key — First-Use Flow

If `POE_API_KEY` is missing when the user triggers any generation action (chat submit or song generate), a blocking modal appears directing the user to Settings. No API call is made while the modal is visible.

---

## In-Memory Action Log

Every significant event is appended to a session-scoped in-memory log (never written to localStorage). The log is a module-level array of structured entries; it resets on page reload.

**What gets logged:**

| Category | Events |
| --- | --- |
| Navigation | Route changes (from, to, params) |
| User actions | Button clicks, inline field edits (field name + old/new value), chat message submitted, song generation triggered, pin/unpin/delete, download |
| LLM requests | `chat()` call started — model, message count |
| LLM responses | `chat()` response received — duration ms, first 200 chars of response |
| LLM song requests | `generateSong()` call started — prompt summary |
| LLM song responses | `generateSong()` response received — duration ms, audioUrl |
| Storage | `storageService.import()` called, `storageService.export()` called |
| Errors | Uncaught errors — message, stack, context |

**Log entry shape:**

```typescript
interface ActionLogEntry {
  timestamp: string;   // ISO 8601
  category: string;    // e.g. "llm:request", "user:action", "navigation"
  event: string;       // e.g. "chat.started", "song.pinned", "route.changed"
  data?: Record<string, unknown>;  // event-specific payload
}
```

**"Report Bug" behavior:**

Clicking "Report Bug" in the top-right dropdown copies the full log to the clipboard as a formatted JSON array. The user can paste it directly into a bug report or share it with a developer. No modal, no prompt — just a single clipboard write with a brief toast confirmation ("Log copied").

**Implementation:**

- A singleton `actionLog` module exposes `log(entry)` and `getAll()` functions
- Components and services import and call `log()` directly — no global event bus needed
- The log is bounded to the last 500 entries to avoid unbounded memory growth

---

## Technical Stack

| Concern | Choice |
| --- | --- |
| Framework | React + TypeScript + Vite |
| UI library | shadcn/ui |
| State / persistence | Local storage only |
| API gateway | Poe (`https://api.poe.com/v1`) with `POE_API_KEY` |
| LLM abstraction | `LLMClient` interface — `PoeLLMClient` (real) or `MockLLMClient` (fixtures) |
| LLM | Claude via Poe (OpenAI-compatible) |
| Audio generation | ElevenLabs (`elevenlabs-music`) via Poe |
| Deployment | GitHub Pages via GitHub Actions (build artifacts never committed to main) |

---

## LLM Client Abstraction

All LLM access goes through a typed `LLMClient` interface. A factory function returns the appropriate implementation based on the `VITE_USE_MOCK_LLM` environment variable. Unchanged from v1.

```text
src/lib/llm/
  types.ts            — LLMClient interface: chat() and generateSong()
  poe-client.ts       — PoeLLMClient: wraps OpenAI SDK with Poe baseURL
  mock-client.ts      — MockLLMClient: replays committed fixture files with a simulated delay
  factory.ts          — createLLMClient(): returns mock or real based on VITE_USE_MOCK_LLM
  fixtures/
    lyrics-response.txt   — recorded Claude response (valid frontmatter + lyrics body)
    lyrics-response-2.txt — second recorded response; mock client cycles round-robin
    song-response.json    — recorded ElevenLabs response { audioUrl: "..." }
```

---

## Data Hierarchy

```text
Message { id: "m1", parentId: null, role: "user" }          ← root (parentId: null)
└── Message { id: "m2", parentId: "m1", role: "assistant" }  ← lyrics; URL: /lyrics/m2
    ├── Song { messageId: "m2" }
    ├── Song { messageId: "m2" }
    ├── Message { id: "m3", parentId: "m2", role: "user" }
    │   └── Message { id: "m4", parentId: "m3", role: "assistant" }  ← lyrics; URL: /lyrics/m4
    │       └── Song { messageId: "m4" }
    └── Message { id: "m3b", parentId: "m2", role: "user" }   ← fork: same parentId as m3
        └── Message { id: "m4b", parentId: "m3b", role: "assistant" }  ← lyrics; URL: /lyrics/m4b
```

- **Message is the only entity.** There is no separate `Chat` record and no separate `LyricsItem` record.
- Messages form a **tree** via `parentId`. The root message has `parentId: null`. Multiple messages can share the same `parentId` — that is how branching works.
- **The root is derived, never stored.** Given any `messageId`, walk up `parentId` links until `parentId === null` to find the root. No `rootId` field or route segment is needed.
- **Rendering a conversation**: start from the current `messageId`, collect ancestors by walking up `parentId`, then render top-down. Only the ancestor chain is shown — messages on sibling branches are simply not in that path.
- **Assistant messages are the lyrics.** Their `id` is the lyrics identity. Parsed frontmatter fields are stored directly on the Message.
- **Forking** (sending from a checkpoint): the new user message is stored with `parentId` pointing to the checkpoint — now two messages share the same `parentId`, creating a branch. Nothing is removed.
- **Songs** reference the assistant `Message.id` that produced them.
- User messages carry no lyrics fields and own no songs.

---

## Data Model

```typescript
type MessageRole = "user" | "assistant";

interface Message {
  id: string;
  parentId: string | null;  // null for the root message; multiple children allowed, forming a tree
  role: MessageRole;
  content: string;           // raw text for user; raw frontmatter text for assistant

  // Present only when role === "assistant" (parsed from frontmatter):
  title?: string;
  style?: string;
  commentary?: string;
  lyricsBody?: string;
  duration?: number;         // seconds (120–180); rendered as M:SS; sent to ElevenLabs as ms

  deleted?: boolean;         // soft-delete flag; only meaningful on assistant messages
  createdAt: string;
}

interface Song {
  id: string;
  messageId: string;         // ID of the assistant Message that produced this song
  title: string;
  audioUrl: string;
  pinned: boolean;
  deleted: boolean;
  createdAt: string;
}

interface Settings {
  poeApiKey: string;
  numSongs: number;
}
```

**Notes:**

- A conversation is a tree rooted at a message with `parentId: null`; the root is derived by traversal — no separate field needed
- The title shown in the Lyrics List and breadcrumbs is the `title` field of the assistant message being viewed
- Songs are owned by a specific assistant Message; each lyrics version independently accumulates its own songs
- Nothing is hard-deleted; deletions are soft (`deleted: true`) — the sole exception is **Reset Memory**, which calls `localStorage.clear()` and is irreversible
- ElevenLabs audio URLs are used directly for playback; users download songs they want to keep
- Import/export logic lives in `storageService`; the Settings page is only the UI
- API keys are excluded from export by default

---

## Dev Tooling

```sh
npm run dev                 # start dev server (real Poe API)
npm run dev:mock            # start dev server with mock LLM (no API key needed)
npm run build               # production build (always uses real LLM client)
npm start                   # serve production build locally
npm test                    # run Playwright tests (always uses mock LLM)
npm run screenshot:<page>   # screenshot test for a specific page
npm run generate:fixtures   # record real API responses into src/lib/llm/fixtures/
```

---

## Testing

Three distinct modes exist. They are never mixed.

---

### Mode 1 — Playwright tests (automated, always mock)

- **Always mock LLM**: `npm run test` starts the dev server with `VITE_USE_MOCK_LLM=true`; no live API calls ever made in tests
- **State seeding**: tests seed localStorage by calling `storageService.import(fixture)` via `page.evaluate` — the same import code path as the Settings UI
- **Selector priority**: accessibility selectors first; add `data-testid` attributes where no accessible selector is available
- **Screenshot tests**: seed fixture data, render page, capture full-page screenshot
- **Quality gate**: `npm run lint`, `npm run test`, `npm run build` must all pass at the end of every story

Playwright tests must **never** read from `.env`, use a real API key, or depend on network access. If a test needs an API key in localStorage, it seeds one via the fixture (e.g. `poeApiKey: "test-poe-api-key"`).

---

### Mode 2 — Playwright MCP QA (manual, normally mock)

The standard MCP QA run uses the mock dev server (`npm run dev:mock`, port 5174) and walks through every QA flow below. No `.env` needed. State is seeded inline using `storageService.import()` or `localStorage` calls from the MCP browser context.

**Quality gate**: every story must pass a full MCP walk-through of all QA flows before it is considered done.

---

### Mode 3 — Playwright MCP real-API testing (manual, on demand)

Used occasionally to verify that the real Poe API and ElevenLabs integration work end-to-end. Not run on every iteration.

**Setup**:

1. Ensure `.env` exists at the repo root (gitignored) with your key:

   ```
   POE_API_KEY=your-key-here
   ```

2. Start the real dev server: `npm run dev` (no `VITE_USE_MOCK_LLM`)

3. In the MCP browser, inject the API key directly into localStorage — no UI form needed:

   ```js
   // Paste this into browser_evaluate or run via MCP browser_run_code.
   // Read the key from your .env beforehand and substitute it below.
   const settings = JSON.parse(localStorage.getItem('song-builder:settings') || '{}');
   localStorage.setItem('song-builder:settings', JSON.stringify({
     ...settings,
     poeApiKey: 'YOUR_KEY_HERE',
     numSongs: settings.numSongs ?? 3,
   }));
   location.reload();
   ```

4. Proceed with any QA flow that exercises live generation (Flows 1, 2, 8).

This snippet is **MCP-only** — it is never used in Playwright test files.

---

### Fixtures

All automated test state is seeded via `storageService.import()`. The fixture set must cover every QA flow. Expand `fixtures/index.ts` whenever a new flow requires data that doesn't exist yet.

**Fixture inventory:**

| Export | Key scenarios covered |
| --- | --- |
| `emptyFixture` | Home page cold start, Reset Memory post-state |
| `baseFixture` | Single entry, one unpinned song, API key set |
| `noApiKeyFixture` | API key missing modal (Flow 15) |
| `multiMessageFixture` | 3-turn chat history — checkpoint nav, LyricsItem cards (Flows 3, 4, 5, 6) |
| `pinnedFixture` | 1 pinned + 1 unpinned song — Pinned Songs page (Flows 9, 10) |
| `deletedSongFixture` | 1 deleted + 2 active songs — soft-delete assertion (Flow 11) |
| `songGeneratorFixture` | 3 songs on one entry — Songs View baseline (Flows 7, 8, 12) |
| `multiEntryFixture` | 3 entries (1 deleted) — Lyrics List search, row nav, delete (Flow 13, 14) |
| `fullFixture` | Mixed state: 2 active entries, 1 deleted entry, pinned/deleted/active songs — full MCP runs |

**Mock LLM fixture files** (`src/lib/llm/fixtures/`):

- `lyrics-response.txt` — first `chat()` call returns "Sunday Gold"
- `lyrics-response-2.txt` — second call returns "Neon Rain" (mock client cycles round-robin)
- `song-response.json` — every `generateSong()` call returns the same audio URL

Add more `lyrics-response-N.txt` files and extend the cycle array in `mock-client.ts` when flows need more than two distinct responses.

---

## QA Flows

**Every iteration must walk through all flows below via Playwright MCP before the story is considered done.** Seed the appropriate fixture, perform the actions, and assert the expected outcome.

### Flow 1 — Start a new song
1. Navigate to `/`
2. Type a prompt and submit
3. **Assert**: navigated to `/lyrics/:messageId`; chat shows the user message; a LyricsItem card appears once the mock response resolves; URL updates to the assistant message ID; left panel shows the parsed title and lyrics body

### Flow 2 — Iterate on lyrics (chat)
1. Seed a single-entry thread fixture; navigate to `/lyrics/:messageId` (latest assistant message)
2. Type a new message and submit
3. **Assert**: loading skeleton appears; after mock delay, a new LyricsItem card appears at the bottom; left panel updates to the latest lyrics; URL updates to the new assistant message ID

### Flow 3 — Inline field editing
1. Seed a single-entry thread; navigate to `/lyrics/:messageId`
2. Hover over the `title` field — **assert** pencil icon visible
3. Click the field — **assert** text input appears with current value
4. Change the value and blur — **assert** display updates; left panel shows new value

### Flow 4 — Checkpoint navigation (select earlier version)
1. Seed a multi-message thread; navigate to `/lyrics/:latestMessageId`
2. Click an earlier assistant message card
3. **Assert**: URL becomes `/lyrics/:earlierMessageId`; left panel shows that version's lyrics; banner "Viewing an earlier version · Return to latest" is visible; messages after the checkpoint are not shown

### Flow 5 — Return to latest
1. Continue from Flow 4 (checkpoint active)
2. Click "Return to latest" in the banner
3. **Assert**: URL is `/lyrics/:latestMessageId`; full chat history visible; banner gone

### Flow 6 — Fork from checkpoint
1. Seed a multi-message thread; navigate to `/lyrics/:checkpointMessageId`
2. Send a new message from the checkpoint
3. **Assert**: new user + assistant messages appear; URL updates to the new assistant message ID; banner gone; original branch messages still exist (visible in Lyrics List)

### Flow 7 — Navigate to Songs View
1. Seed a lyrics entry with songs; navigate to `/lyrics/:messageId`
2. Click the "Songs" button on a LyricsItem card (or in the left panel)
3. **Assert**: navigated to `/lyrics/:messageId/songs`; breadcrumb reads `Lyrics / {title} / Songs`; song cards are visible with audio players

### Flow 8 — Generate songs
1. Seed a lyrics entry with API key set; navigate to the Songs View
2. Click **Generate**
3. **Assert**: N loading skeletons appear concurrently; each resolves independently to a song card with an audio player; no full-page re-render on sibling completion

### Flow 9 — Pin a song
1. Seed a lyrics entry with at least one song; navigate to Songs View
2. Click **Pin** on a song card
3. **Assert**: pin button state updates; navigate to `/pinned`; song appears in the list with the lyrics title shown

### Flow 10 — Unpin a song
1. Navigate to `/pinned` (song already pinned via seed or Flow 9)
2. Click **Unpin**
3. **Assert**: song removed from the Pinned Songs list immediately

### Flow 11 — Delete a song
1. Seed a lyrics entry with 2+ songs; navigate to Songs View
2. Click **Delete** on one song card
3. **Assert**: that card disappears; other cards unaffected; reload page — deleted song still absent

### Flow 12 — Download a song
1. Navigate to Songs View with a song present
2. Click **Download**
3. **Assert**: browser download dialog triggered (or download initiated — Playwright can intercept the download event)

### Flow 13 — Lyrics List navigation
1. Seed multiple lyrics entries; navigate to `/lyrics`
2. **Assert**: table shows one row per assistant message with title, style, song count, date
3. Type in search input — **assert** rows filter in real time by title/style
4. Click a row — **assert** navigated to `/lyrics/:messageId` for that message

### Flow 14 — Soft-delete a lyrics entry
1. Navigate to `/lyrics` with entries present
2. Click the delete action on a row
3. **Assert**: row removed from list immediately; navigate away and back — row still absent

### Flow 15 — API key missing modal
1. Seed empty settings (no API key); navigate to `/lyrics/:messageId`
2. Submit a chat message
3. **Assert**: blocking modal appears before any LLM call; modal directs to Settings; no network request made

### Flow 16 — Settings: save API key and song count
1. Navigate to `/settings`
2. Enter an API key and change song count; submit
3. **Assert**: values persisted to localStorage; reload page — values still present in the form

### Flow 17 — Settings: export and import
1. Navigate to `/settings`; click **Export**
2. **Assert**: JSON file download triggered
3. Click **Import**; select the exported file
4. **Assert**: data restored; navigate to `/lyrics` — entries visible

### Flow 18 — Settings: Reset Memory
1. Navigate to `/settings`; click **Reset Memory**
2. **Assert**: confirmation dialog appears with the exact warning text
3. Confirm — **assert**: localStorage cleared; redirected to `/`; no entries in Lyrics List

### Flow 19 — Top-right menu navigation
1. Click the circular menu button (top-right) on any page
2. **Assert**: dropdown opens with All Lyrics, Pinned Songs, Settings, Report Bug
3. Click each item — **assert** correct navigation occurs

### Flow 20 — Report Bug (action log copy)
1. Perform at least one navigation action; click **Report Bug** from the top-right menu
2. **Assert**: toast "Log copied" appears; clipboard contains a valid JSON array with at least one entry matching the `ActionLogEntry` shape

---

## Build Order

Stories are implemented in this sequence:

1. Data model & storage migration (Message tree replaces LyricsEntry + chatHistory; new fixtures)
2. Redesign navigation (remove sidebar, add breadcrumbs + top-right menu)
3. Home page redesign (single prompt input, creates root message, navigates to `/lyrics/:messageId`)
4. Lyrics Editor core rebuild (tree traversal for chat rendering, new URL scheme)
5. Inline-editable fields in the Lyrics Editor left panel
6. LyricsItem cards (chat snapshot previews — compact structured display per assistant message)
7. Checkpoint navigation — click card → navigate to `/lyrics/:messageId`; "Viewing earlier version" banner; "Return to latest"
8. Songs View overhaul (new URL `/lyrics/:messageId/songs`, React.memo, Map-based state, `duration` field)
9. Lyrics List (tree-aware, song count column)
10. Pinned Songs (link to source lyrics entry Songs View)
11. In-memory action log + Report Bug
12. Settings: Reset Memory confirmation dialog
