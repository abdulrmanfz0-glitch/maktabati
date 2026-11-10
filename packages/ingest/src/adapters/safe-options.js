// Safe pdf.js options shared by the Node and browser adapters: never execute anything from the PDF.
// (pdf.js scripting lives in the viewer layer, which the engine never loads.)
export const SAFE_OPTIONS = Object.freeze({
  isEvalSupported: false,
  enableXfa: false,
  disableFontFace: true,
  fontExtraProperties: true, // exposes each font's ToUnicode keys to the glyph census
  useSystemFonts: false,
  stopAtErrors: false,
  verbosity: 0
});
