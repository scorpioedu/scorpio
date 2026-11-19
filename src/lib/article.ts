// "a" or "an" before a name, by how it sounds: "an AP Physics 1 unit", "a Physics Honors unit".

/** Letters whose spoken name starts with a vowel sound (A = "ay", F = "eff", M = "em"...). */
const VOWEL_SOUND_LETTERS = new Set("AEFHILMNORSX");

export function article(phrase: string): "a" | "an" {
  const word = phrase.trim().split(/[\s:·-]+/)[0] ?? "";
  if (!word) return "a";
  // An acronym or initialism is read letter by letter: AP, SAT, MIT, X-ray
  if (word.length > 1 && word === word.toUpperCase() && /^[A-Z]/.test(word))
    return VOWEL_SOUND_LETTERS.has(word[0]) ? "an" : "a";
  // A lone digit: "an 8", "an 11" are rare in course names; read the leading digit's sound
  if (/^(8|11|18)/.test(word)) return "an";
  if (/^(uni|use|usu|eu|one)/i.test(word)) return "a"; // "a unit", "a one-off"
  if (/^(hour|honest|honor|heir)/i.test(word)) return "an";
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/** The phrase with its article: withArticle("AP Physics 1") -> "an AP Physics 1". */
export function withArticle(phrase: string): string {
  return `${article(phrase)} ${phrase}`;
}
