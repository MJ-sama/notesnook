export const APP_DISPLAY_NAME = "SelfTalk";

// Apply only to client UI copy, after translation. Upstream service names,
// attribution, backup paths and user-generated content keep their own names.
export function appText(translated: string): string {
  return translated.replace(/\bNotesnook\b/gi, APP_DISPLAY_NAME);
}
