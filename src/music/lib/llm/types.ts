export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Typed interface for all LLM interactions in the app.
 * Implemented by PoeLLMClient (real) and MockLLMClient (fixture-based).
 */
export interface LLMClient {
  /**
   * Send a chat message history to Claude and return the assistant's response text.
   */
  chat(messages: ChatMessage[]): Promise<string>;

  /**
   * Submit a style prompt to ElevenLabs and return a publicly-accessible audio URL.
   * @param prompt - style/lyrics prompt
   * @param musicLengthMs - desired audio length in milliseconds (derived from message.duration * 1000)
   */
  generateSong(prompt: string, musicLengthMs?: number): Promise<string>;
}
