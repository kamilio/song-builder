import type { LLMClient } from "./types";
import { MockLLMClient } from "./mock-client";
import { PoeLLMClient } from "./poe-client";

/**
 * Returns the appropriate LLMClient for the current environment.
 *
 * - When VITE_USE_MOCK_LLM=true (dev:mock, all Playwright tests): MockLLMClient
 * - Otherwise (production, manual dev): PoeLLMClient, keyed by the caller-supplied apiKey
 *
 * The apiKey is only required when the mock is disabled.
 */
export function createLLMClient(apiKey?: string): LLMClient {
  if (import.meta.env.VITE_USE_MOCK_LLM === "true") {
    return new MockLLMClient();
  }

  if (!apiKey) {
    throw new Error(
      "POE_API_KEY is required when VITE_USE_MOCK_LLM is not set. " +
        "Configure your API key in Settings.",
    );
  }

  return new PoeLLMClient(apiKey);
}
