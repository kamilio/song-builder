export interface Settings {
  poeApiKey: string;
  numSongs: number;
}

/**
 * A single node in the message tree.
 *
 * Every user turn and every assistant turn is a first-class Message linked
 * via parentId. The root message has parentId: null and role "user".
 * There is no system-message role in storage — the system prompt is an
 * implementation detail of the LLM client.
 *
 * Lyrics fields (title, style, commentary, lyricsBody, duration) are
 * populated only on assistant messages that contain lyrics.
 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** null for root messages; points to the parent message id otherwise. */
  parentId: string | null;
  /** Optional lyrics metadata — only on assistant messages. */
  title?: string;
  style?: string;
  commentary?: string;
  lyricsBody?: string;
  /** Duration in seconds. */
  duration?: number;
  createdAt: string;
  /** Soft-delete flag. */
  deleted: boolean;
}

export interface Song {
  id: string;
  /** References the assistant Message whose lyrics were used to generate this song. */
  messageId: string;
  title: string;
  audioUrl: string;
  pinned: boolean;
  deleted: boolean;
  createdAt: string;
}

export interface StorageExport {
  settings: Settings | null;
  messages: Message[];
  songs: Song[];
}
