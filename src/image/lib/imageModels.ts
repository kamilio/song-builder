export interface ImageModelDef {
  id: string;
  label: string;
  supportsRemix: boolean;
  extraBody?: Record<string, unknown>;
}

export const IMAGE_MODELS: ImageModelDef[] = [
  {
    id: "nano-banana",
    label: "Nano Banana",
    supportsRemix: false,
    extraBody: { image_only: true },
  },
  {
    id: "remix-turbo",
    label: "Remix Turbo",
    supportsRemix: true,
  },
];
