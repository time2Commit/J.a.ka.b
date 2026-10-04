/**
 * Normalizza il nome di un progetto per confronti e suggerimenti:
 * minuscolo, senza accenti, spazi compressi.
 * Il risultato viene salvato in `Project.nameNormalized` (indice trigram).
 */
export function normalizeProjectName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
