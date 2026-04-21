/**
 * scripts/seed-local.ts — Seed local vigil_dev DB with fixture data (Phase 107.1 D-06).
 *
 * Idempotent: uses onConflictDoNothing (or count-based guards where no unique
 * constraint exists) for every insert so re-running is safe.
 *
 * Populates the minimum set needed to exercise every PWA screen:
 *   - 1 seed user (email matches VIGIL_ALLOWED_EMAILS in .env.example)
 *   - 1 vk_ API key owned by the seed user
 *   - 5 thoughts spanning category values: task, therapy, idea, reflection, project
 *   - 1 work order
 *   - 1 project
 *
 * Usage:
 *   npm --prefix vigil-core run seed:local
 *
 * Requires: DATABASE_URL env var pointing at a migrated local Postgres
 *   (localhost:5432/vigil_dev). Run `npm run db:migrate` first if you see a
 *   "relation does not exist" error.
 *
 * The vk_ API key is printed to stdout exactly once on first-run creation,
 * because it's unrecoverable after sha256 hashing. On idempotent re-runs the
 * key is NOT rotated — existing keys are preserved.
 */

import crypto from "node:crypto";
import { hash as argon2Hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { db } from "../src/db/connection.js";
import {
  users,
  apiKeys,
  thoughts,
  projects,
  workOrders,
} from "../src/db/schema.js";

const SEED_EMAIL = "jamesonmorrill1@gmail.com";
const SEED_PASSWORD = "dev-password-1234"; // local-only, replaceable via /v1/auth/login flow
const SEED_PROJECT_NAME = "Vigil Local Dev Fixture";
const SEED_WO_CASE = "SEED-WO-001";

type SeedThought = {
  content: string;
  category: string;
  cloudKitRecordID: string;
};

const THOUGHT_FIXTURES: SeedThought[] = [
  {
    content: "Follow up with HVAC vendor on walk-in freezer alarm",
    category: "task",
    cloudKitRecordID: "seed-local-task-1",
  },
  {
    content:
      "Noticed I spiral when context-switching between 3+ priorities — flag for next therapy session",
    category: "therapy",
    cloudKitRecordID: "seed-local-therapy-1",
  },
  {
    content:
      "What if the brief ranked items by anticipated cognitive load, not just due date?",
    category: "idea",
    cloudKitRecordID: "seed-local-idea-1",
  },
  {
    content:
      "Week felt long but the execution velocity is tracking with expectations; resist the urge to rush v3.6.",
    category: "reflection",
    cloudKitRecordID: "seed-local-reflection-1",
  },
  {
    content:
      "Phase 107.1 unblocks every future local-dev task — treat it as foundational.",
    category: "project",
    cloudKitRecordID: "seed-local-project-1",
  },
];

async function main(): Promise<void> {
  if (!db) {
    console.error(
      "ERROR: DATABASE_URL is not set or unreachable. " +
        "Ensure vigil-core/.env has DATABASE_URL=postgresql://localhost:5432/vigil_dev " +
        "and that `brew services start postgresql@16` has been run.",
    );
    process.exit(1);
  }

  // 1. Upsert seed user (Pitfall 6 — user must exist before api_key FK is satisfied)
  const passwordHash = await argon2Hash(SEED_PASSWORD);
  await db
    .insert(users)
    .values({ email: SEED_EMAIL, passwordHash })
    .onConflictDoNothing({ target: users.email });

  const [seedUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, SEED_EMAIL))
    .limit(1);
  if (!seedUser) {
    console.error(
      "ERROR: seed user insert failed and lookup returned no row. " +
        "Check migrations: `npm run db:migrate` must have run.",
    );
    process.exit(1);
  }

  // 2. Upsert project (no unique-name constraint → count-based idempotency guard).
  //    Thought.projectId is optional so we don't block on the project row existing,
  //    but downstream UI filters need at least one project for Projects tab to render.
  const existingProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, seedUser.id));
  if (existingProjects.length === 0) {
    await db.insert(projects).values({
      name: SEED_PROJECT_NAME,
      description: "Auto-seeded local dev fixture — Phase 107.1 D-06",
      userId: seedUser.id,
      status: "active",
    });
  }

  // 3. Seed api_key (only if user has zero existing vk_ keys — keeps vk_ stable
  //    across re-runs; rotating on every invocation would invalidate the key the
  //    user copied on first run).
  const existingKeys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, seedUser.id));
  if (existingKeys.length === 0) {
    const rawBytes = crypto.randomBytes(32).toString("hex");
    const rawKey = `vk_${rawBytes}`;
    const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
    const keyPrefix = rawKey.slice(0, 11); // "vk_" + first 8 hex chars

    await db.insert(apiKeys).values({
      userId: seedUser.id,
      name: "local-dev-seed-key",
      keyHash,
      keyPrefix,
    });
    console.log("");
    console.log("Seeded vk_ API key (save this — unrecoverable):");
    console.log(`  ${rawKey}`);
    console.log("");
  } else {
    console.log(
      `api_key already seeded — ${existingKeys.length} existing key(s), no new vk_ key generated`,
    );
  }

  // 4. Seed thoughts (cloudKitRecordID is unique — onConflictDoNothing on that
  //    column makes each row idempotent without needing a per-row existence check).
  for (const fixture of THOUGHT_FIXTURES) {
    await db
      .insert(thoughts)
      .values({
        content: fixture.content,
        userId: seedUser.id,
        category: fixture.category,
        source: "text",
        cloudKitRecordID: fixture.cloudKitRecordID,
      })
      .onConflictDoNothing({ target: thoughts.cloudKitRecordID });
  }

  // 5. Seed work order (caseNumber is PK — onConflictDoNothing makes it idempotent).
  await db
    .insert(workOrders)
    .values({
      caseNumber: SEED_WO_CASE,
      userId: seedUser.id,
      store: "Store #1234",
      shortDescription: "Walk-in freezer temperature alarm — intermittent",
      trade: "HVAC",
      location: "Kitchen — walk-in freezer",
      equipment: "Freezer unit (serial TBD)",
      priority: "P2",
      contact: "Store manager",
      state: "open",
      notes: "Auto-seeded local dev fixture — Phase 107.1 D-06",
    })
    .onConflictDoNothing({ target: workOrders.caseNumber });

  console.log("seed-local: complete");
  console.log(`  user:        ${SEED_EMAIL} (id=${seedUser.id})`);
  console.log(`  project:     ${SEED_PROJECT_NAME}`);
  console.log(
    `  thoughts:    ${THOUGHT_FIXTURES.length} (categories: task, therapy, idea, reflection, project)`,
  );
  console.log(`  work order:  ${SEED_WO_CASE}`);
  console.log("");
  console.log("Exit 0 — idempotent re-run safe.");
  process.exit(0);
}

main().catch((err) => {
  console.error("seed-local: FAILED");
  console.error(err);
  process.exit(1);
});
