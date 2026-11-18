// Join codes for classes. Codes are reserved in `course_codes/{code}` so two classes never share one.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** An 8-character code without look-alike characters (no I, O, 0 or 1). */
export function newClassCode(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  return Array.from(random(8), (b) => ALPHABET[b % ALPHABET.length]).join("");
}
