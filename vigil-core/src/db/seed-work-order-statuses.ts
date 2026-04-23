import { eq } from "drizzle-orm";
import { db } from "./connection.js";
import { users, workOrderStatuses } from "./schema.js";

// Phase 108 W-01: workOrderStatuses.userId is now NOT NULL — look up the seed
// user's id and include it in every insert.
const SEED_EMAIL = "jamesonmorrill1@gmail.com";

async function seed() {
  if (!db) {
    console.error("No DB connection — DATABASE_URL must be set");
    process.exit(1);
  }

  const [seedUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SEED_EMAIL));

  if (!seedUser) {
    console.error(`Seed user not found for email: ${SEED_EMAIL}`);
    process.exit(1);
  }

  const existing = [
    { userId: seedUser.id, caseNumber: "CS0353598", status: "done" },
    { userId: seedUser.id, caseNumber: "CS0355778", status: "done" },
    { userId: seedUser.id, caseNumber: "CS0354176", status: "done" },
    { userId: seedUser.id, caseNumber: "CS0354992", status: "done" },
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
