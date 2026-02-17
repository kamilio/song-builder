import type { LLMClient, ChatMessage } from "./types";
import { log } from "@/music/lib/actionLog";

/**
 * Decorator that wraps any LLMClient and automatically emits llm:request /
 * llm:response log entries for every call. Used in the factory so all call
 * sites are covered without manual instrumentation.
 */
export class LoggingLLMClient implements LLMClient {
  constructor(private readonly inner: LLMClient) {}

  async chat(messages: ChatMessage[], model?: string): Promise<string> {
    log({
      category: "llm:request",
      action: "llm:chat:start",
      data: { historyLength: messages.length, messages, model },
    });
    try {
      const result = await this.inner.chat(messages, model);
      log({
        category: "llm:response",
        action: "llm:chat:complete",
        data: { historyLength: messages.length, response: result },
      });
      return result;
    } catch (err) {
      log({
        category: "llm:response",
        action: "llm:chat:error",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  async generateSong(prompt: string, musicLengthMs?: number): Promise<string> {
    log({
      category: "llm:request",
      action: "llm:song:start",
      data: { prompt, musicLengthMs },
    });
    try {
      const result = await this.inner.generateSong(prompt, musicLengthMs);
      log({
        category: "llm:response",
        action: "llm:song:complete",
        data: { prompt, result },
      });
      return result;
    } catch (err) {
      log({
        category: "llm:response",
        action: "llm:song:error",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  async generateImage(prompt: string, count?: number, model?: string, extraBody?: Record<string, unknown>, remixImageBase64?: string): Promise<string[]> {
    log({
      category: "llm:request",
      action: "llm:image:start",
      data: { prompt, count, model, extraBody, hasRemixImage: remixImageBase64 !== undefined },
    });
    try {
      const result = await this.inner.generateImage(prompt, count, model, extraBody, remixImageBase64);
      log({
        category: "llm:response",
        action: "llm:image:complete",
        data: { prompt, count, results: result },
      });
      return result;
    } catch (err) {
      log({
        category: "llm:response",
        action: "llm:image:error",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  async generateVideo(prompt: string): Promise<string> {
    log({
      category: "llm:request",
      action: "llm:video:start",
      data: { prompt },
    });
    try {
      const result = await this.inner.generateVideo(prompt);
      log({
        category: "llm:response",
        action: "llm:video:complete",
        data: { prompt, result },
      });
      return result;
    } catch (err) {
      log({
        category: "llm:response",
        action: "llm:video:error",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }

  async generateAudio(text: string): Promise<string> {
    log({
      category: "llm:request",
      action: "llm:audio:start",
      data: { text },
    });
    try {
      const result = await this.inner.generateAudio(text);
      log({
        category: "llm:response",
        action: "llm:audio:complete",
        data: { text, result },
      });
      return result;
    } catch (err) {
      log({
        category: "llm:response",
        action: "llm:audio:error",
        data: { error: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }
}
