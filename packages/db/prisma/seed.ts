import { DEFAULT_CALENDAR, DEFAULT_STATUSES } from "../src/defaults";
import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient();

async function main() {
  await prisma.workspace.upsert({ where: { id: "default" }, update: {}, create: {} });
  await prisma.calendar.upsert({
    where: { id: DEFAULT_CALENDAR.id },
    update: {},
    create: DEFAULT_CALENDAR,
  });
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
