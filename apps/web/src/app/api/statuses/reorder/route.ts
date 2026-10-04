import { statusReorderSchema } from "@jakab/shared";
import { reorderStatuses } from "@/server/catalog";
import { parseBody, prisma, route } from "@/server/http";

export const POST = route(
  async (req) => reorderStatuses(prisma, (await parseBody(req, statusReorderSchema)).ids),
  { admin: true },
);
