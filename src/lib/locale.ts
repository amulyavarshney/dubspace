const ALIASES: Record<string, string> = {
  english: "en", spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt", japanese: "ja", korean: "ko",
  chinese: "zh", mandarin: "zh", hindi: "hi", arabic: "ar", russian: "ru", dutch: "nl", polish: "pl", turkish: "tr",
  swedish: "sv", danish: "da", norwegian: "no", finnish: "fi", greek: "el", hebrew: "he", indonesian: "id", vietnamese: "vi",
  thai: "th", czech: "cs", hungarian: "hu", romanian: "ro", ukrainian: "uk", tamil: "ta", telugu: "te", bengali: "bn", malay: "ms",
  filipino: "fil", tagalog: "fil", "brazilian portuguese": "pt-BR", "latin american spanish": "es-419", "mexican spanish": "es-MX",
};

/** Best-effort normalization of free-form language labels to BCP 47 tags. */
export function normalizeLocale(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  const m = /^([a-z]{2,3})(?:[-_]([a-z]{2}|\d{3}|[a-z]{4}))?$/i.exec(raw);
  if (!m) return null;
  const lang = m[1].toLowerCase();
  if (!m[2]) return lang;
  const region = m[2].length === 4 ? m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : m[2].toUpperCase();
  return `${lang}-${region}`;
}

export function displayLanguageName(locale: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "language" });
    return dn.of(locale) ?? locale;
  } catch {
    return locale;
  }
}
