import { route } from "@/server/http";
import { runOrphanCleanup } from "@/server/maintenance";

/** Runs the unreferenced-file cleanup now (it also runs once a day). */
export const POST = route(() => runOrphanCleanup(), { admin: true });
