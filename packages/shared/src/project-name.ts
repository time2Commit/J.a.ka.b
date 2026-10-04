/**
 * Normalizes a project name for comparisons and suggestions:
 * lowercase, accents stripped, whitespace collapsed.
 * The result is stored in `Project.nameNormalized` (trigram index).
 */
export function normalizeProjectName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
