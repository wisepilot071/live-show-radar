/** Joins class names, skipping falsy values. Small enough not to need a dependency. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
