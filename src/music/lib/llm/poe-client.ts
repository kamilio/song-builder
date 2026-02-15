import OpenAI from "openai";
import type { LLMClient, ChatMessage } from "./types";

/**
 * Real LLM client that routes all requests through Poe's OpenAI-compatible API.
 * - Claude model for chat/lyrics generation
 * - ElevenLabs music model for song audio generation
 *
 * The API key is read from localStorage (set by the Settings page) so that
 * the browser never hard-codes credentials.  dangerouslyAllowBrowser is
 * required because we ship a client-side-only app.
 */
export class PoeLLMClient implements LLMClient {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://api.poe.com/v1",
      dangerouslyAllowBrowser: true,
      // Poe's CORS policy rejects the x-stainless-* headers that the OpenAI SDK
      // adds automatically. Strip them before the request leaves the browser.
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        for (const key of [...headers.keys()]) {
          if (key.startsWith("x-stainless-")) headers.delete(key);
        }
        return globalThis.fetch(url, { ...init, headers });
      },
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: "claude-sonnet-4.5",
      messages,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Claude returned an empty response");
    return content;
  }

  async generateSong(prompt: string, musicLengthMs?: number): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: "elevenlabs-music",
      messages: [{ role: "user", content: prompt }],
      // @ts-expect-error extra_body is a Poe-specific extension not in the OpenAI types
      extra_body: { music_length_ms: musicLengthMs ?? 150000 },
    });

    const audioUrl = response.choices[0]?.message?.content;
    if (!audioUrl) throw new Error("ElevenLabs returned an empty response");
    return audioUrl;
  }
}
