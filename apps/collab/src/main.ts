import { prisma } from "@jakab/db";
import { config } from "./config";
import { createCollabServer } from "./server";

const server = createCollabServer({ db: prisma });
await server.listen();
console.log(`collab server listening on ws://localhost:${config.port}`);
