// Pure limits used by the upload UI. Keep the values here so tests and the
// reader agree on what "too large" means.
export const PASTE_MAX_CHARS = 2_000_000;
export const FILE_WARN_BYTES = 25 * 1024 * 1024;
export const LOW_MEMORY_GB = 4;

export const isPasteTooLarge = text => String(text == null ? '' : text).length > PASTE_MAX_CHARS;

export function needsLowMemoryWarning(bytes, deviceMemory) {
  return Number(bytes) > FILE_WARN_BYTES && typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= LOW_MEMORY_GB;
}
