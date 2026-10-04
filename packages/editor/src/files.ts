/** How an attachment is shown inside a note. */
export type FileKind = "image" | "pdf" | "file";

/** Raster images and PDFs are rendered inline; everything else is a download chip. */
const INLINE_IMAGE = /^image\/(png|jpe?g|gif|webp|avif)$/i;

export function fileKind(mime: string): FileKind {
  if (INLINE_IMAGE.test(mime)) return "image";
  if (/^application\/pdf$/i.test(mime)) return "pdf";
  return "file";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
