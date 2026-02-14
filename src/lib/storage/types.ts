export interface Settings {
  poeApiKey: string;
  numSongs: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LyricsEntry {
  id: string;
  title: string;
  style: string;
  commentary: string;
  body: string;
  chatHistory: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export interface Song {
  id: string;
  lyricsEntryId: string;
  title: string;
  audioUrl: string;
  pinned: boolean;
  deleted: boolean;
  createdAt: string;
}

export interface StorageExport {
  settings: Settings | null;
  lyricsEntries: LyricsEntry[];
  songs: Song[];
}
