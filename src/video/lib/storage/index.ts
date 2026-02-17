export type {
  AudioSource,
  VideoHistoryEntry,
  ShotNarration,
  ShotVideo,
  Shot,
  ScriptSettings,
  LocalTemplate,
  Script,
  GlobalTemplate,
} from "./types";
export { videoStorageService } from "./storageService";
export {
  createScript,
  getScript,
  updateScript,
  deleteScript,
  listScripts,
  createGlobalTemplate,
  listGlobalTemplates,
  updateGlobalTemplate,
  deleteGlobalTemplate,
  resetVideoStorage,
} from "./storageService";
