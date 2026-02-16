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
   * @param model - optional model name; falls back to claude-sonnet-4.5 when omitted
   */
  chat(messages: ChatMessage[], model?: string): Promise<string>;

  /**
   * Submit a style prompt to ElevenLabs and return a publicly-accessible audio URL.
   * @param prompt - style/lyrics prompt
   * @param musicLengthMs - desired audio length in milliseconds (derived from message.duration * 1000)
   */
  generateSong(prompt: string, musicLengthMs?: number): Promise<string>;

  /**
   * Submit a text prompt to the image model and return an array of publicly-accessible image URLs.
   * @param prompt - text description of the desired image
   * @param count - number of images to generate in parallel (default 3)
   * @param model - optional model id; falls back to implementation default when omitted
   * @param extraBody - optional extra fields forwarded verbatim to the API request body
   * @param remixImageBase64 - optional raw base64-encoded reference image for remix (no data URI prefix)
   */
  generateImage(prompt: string, count?: number, model?: string, extraBody?: Record<string, unknown>, remixImageBase64?: string): Promise<string[]>;
}
