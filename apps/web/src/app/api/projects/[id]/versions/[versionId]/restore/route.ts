import { collabPost } from "@/server/collab";
import { route } from "@/server/http";

type Params = { id: string; versionId: string };

/** Non-destructive: the collab server keeps the current content as a `pre-restore` version first. */
export const POST = route<Params>((req, { params }) =>
  collabPost(
    `/internal/projects/${params.id}/versions/${params.versionId}/restore`,
    req.headers.get("cookie"),
  ),
);
