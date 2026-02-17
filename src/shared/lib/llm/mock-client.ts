import type { LLMClient, ChatMessage } from "./types";
// Vite inlines these fixture files as strings at build time via the `?raw` suffix.
import lyricsFixture1 from "./fixtures/lyrics-response.txt?raw";
import lyricsFixture2 from "./fixtures/lyrics-response-2.txt?raw";
import songFixtureRaw from "./fixtures/song-response.json?raw";
import imageUrlsRaw from "./fixtures/image-urls.json?raw";
import videoScriptFixture from "./fixtures/video-script-response.txt?raw";
import videoUrlFixture from "./fixtures/video-url.txt?raw";
import audioUrlFixture from "./fixtures/audio-url.txt?raw";

const lyricsFixtures = [lyricsFixture1, lyricsFixture2];
const imageUrlFixtures: string[] = JSON.parse(imageUrlsRaw) as string[];

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
 *
 * Testing hook: set `window.__mockLLMImageFailCount = N` in a Playwright test
 * to make the next N generateImage calls throw an error. Each call decrements
 * the counter. When it reaches 0, subsequent calls succeed normally.
 * Used by retry-button tests to create failed slots.
 */

declare global {
  interface Window {
    __mockLLMImageFailCount?: number;
    /**
     * Testing hook: override the URL returned by MockLLMClient.generateAudio.
     * Set to a string URL in a Playwright test to control the audio fixture URL
     * returned to the caller (e.g. a URL that triggers the duration-rejection
     * path when combined with a mocked HTMLAudioElement duration).
     * Clear by setting to undefined after the test.
     */
    __mockLLMAudioUrl?: string;
  }
}

export class MockLLMClient implements LLMClient {
  /** Simulated latency in milliseconds (default 200 ms). */
  private readonly delayMs: number;
  private chatCallCount = 0;
  private imageCallCount = 0;

  constructor(delayMs = 200) {
    this.delayMs = delayMs;
  }

  private delay(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.delayMs));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async chat(messages: ChatMessage[], _model?: string): Promise<string> {
    await this.delay();
    // Return video script YAML when the last user message contains video-related keywords.
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMessage) {
      const content = lastUserMessage.content.toLowerCase();
      if (content.includes("video") || content.includes("script") || content.includes("shot")) {
        return videoScriptFixture;
      }
    }
    return lyricsFixtures[this.chatCallCount++ % lyricsFixtures.length];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateSong(_prompt: string, _musicLengthMs?: number): Promise<string> {
    await this.delay();
    const parsed = JSON.parse(songFixtureRaw) as { audioUrl: string };
    return parsed.audioUrl;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateImage(_prompt: string, count = 3, _model?: string, _extraBody?: Record<string, unknown>, _remixImageBase64?: string): Promise<string[]> {
    await this.delay();
    // Testing hook: decrement __mockLLMImageFailCount; if it was > 0, throw.
    if (typeof window !== "undefined" && (window.__mockLLMImageFailCount ?? 0) > 0) {
      window.__mockLLMImageFailCount = (window.__mockLLMImageFailCount ?? 1) - 1;
      throw new Error("Mock image generation failure");
    }
    const urls: string[] = [];
    for (let i = 0; i < count; i++) {
      urls.push(imageUrlFixtures[this.imageCallCount++ % imageUrlFixtures.length]);
    }
    return urls;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateVideo(_prompt: string, _duration?: number): Promise<string> {
    await this.delay();
    return videoUrlFixture.trim();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async generateAudio(_text: string): Promise<string> {
    await this.delay();
    // Testing hook: return a custom URL if set by a Playwright test.
    if (typeof window !== "undefined" && window.__mockLLMAudioUrl !== undefined) {
      return window.__mockLLMAudioUrl;
    }
    return audioUrlFixture.trim();
  }
}
