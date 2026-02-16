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

  async generateImage(prompt: string, count?: number): Promise<string[]> {
    log({
      category: "llm:request",
      action: "llm:image:start",
      data: { prompt, count },
    });
    try {
      const result = await this.inner.generateImage(prompt, count);
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
}
