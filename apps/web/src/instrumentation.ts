/** Starts the daily maintenance job when the server boots (Node runtime only). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runImportCleanup, runOrphanCleanup } = await import("./server/maintenance");
  const run = () =>
    Promise.all([runOrphanCleanup(), runImportCleanup()])
      .then(([orphans]) => orphans)
      .then(
        ({ removed }) =>
          removed > 0 && console.log(`cleanup: removed ${removed} unreferenced file(s)`),
      )
      .catch((error) => console.error("cleanup failed", error));
  // First run shortly after boot, then daily; never keeps the process alive on its own.
  setTimeout(run, 60_000).unref();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
