export interface ImageSession {
  id: string;
  title: string;
  /** Full prompt text as entered by the user. Optional for backward compat with existing stored sessions. */
  prompt?: string;
  createdAt: string;
  /** Soft-delete flag. Optional for backward compat with existing stored sessions. */
  deleted?: boolean;
}

export interface ImageGeneration {
  id: string;
  sessionId: string;
  stepId: number;
  prompt: string;
  createdAt: string;
}

export interface ImageItem {
  id: string;
  generationId: string;
  url: string;
  pinned: boolean;
  deleted: boolean;
  createdAt: string;
  /** The image model id used to generate this item (US-028). Optional for backward compat. */
  model?: string;
}

export interface ImageSettings {
  numImages: number;
  /** Number of images to generate per model when multiple models are selected (US-028). Default 3. */
  imagesPerModel?: number;
}

export interface ImageStorageExport {
  sessions: ImageSession[];
  generations: ImageGeneration[];
  items: ImageItem[];
  settings: ImageSettings | null;
}
