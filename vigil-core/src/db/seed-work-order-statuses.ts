import { db } from "./connection.js";
import { workOrderStatuses } from "./schema.js";

async function seed() {
  if (!db) {
    console.error("No DB connection — DATABASE_URL must be set");
    process.exit(1);
  }

  const existing = [
    { caseNumber: "CS0353598", status: "done" },
    { caseNumber: "CS0355778", status: "done" },
    { caseNumber: "CS0354176", status: "done" },
    { caseNumber: "CS0354992", status: "done" },
  ];

  for (const record of existing) {
    await db
      .insert(workOrderStatuses)
      .values(record)
      .onConflictDoNothing();
  }

  console.log(`Seeded ${existing.length} work order statuses`);
  process.exit(0);
}

seed();
