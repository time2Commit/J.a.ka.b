import { DEFAULT_STATUSES } from "../src/defaults";
import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient();

async function main() {
  await prisma.workspace.upsert({ where: { id: "default" }, update: {}, create: {} });
  for (const status of DEFAULT_STATUSES) {
    await prisma.status.upsert({ where: { name: status.name }, update: {}, create: status });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
