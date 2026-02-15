import type { LLMClient, ChatMessage } from "./types";
// Vite inlines these fixture files as strings at build time via the `?raw` suffix.
import lyricsFixture1 from "./fixtures/lyrics-response.txt?raw";
import lyricsFixture2 from "./fixtures/lyrics-response-2.txt?raw";
import songFixtureRaw from "./fixtures/song-response.json?raw";

const lyricsFixtures = [lyricsFixture1, lyricsFixture2];

/**
 * Fixture-based LLM client used in tests and offline development.
 * Reads pre-recorded responses from committed fixture files and adds a
 * configurable simulated delay to mimic real latency.
 *
 * chat() cycles through lyricsFixtures round-robin so that multi-step
 * conversation tests receive distinct responses on each call.
 *
 * Activated when VITE_USE_MOCK_LLM=true (set automatically by the
 * Playwright webServer config and `npm run dev:mock`).
 */
export class MockLLMClient implements LLMClient {
  /** Simulated latency in milliseconds (default 200 ms). */
  private readonly delayMs: number;
  private chatCallCount = 0;

  constructor(delayMs = 200) {
    this.delayMs = delayMs;
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async chat(_messages: ChatMessage[]): Promise<string> {
    await this.delay();
    return lyricsFixtures[this.chatCallCount++ % lyricsFixtures.length];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateSong(_prompt: string, _musicLengthMs?: number): Promise<string> {
    await this.delay();
    const parsed = JSON.parse(songFixtureRaw) as { audioUrl: string };
    return parsed.audioUrl;
  }
}
