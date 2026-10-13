// Resets the local store to the sample data from the designs. Photos already saved are left alone.
//   npm run seed

import { promises as fs } from "node:fs";
import path from "node:path";
import { SEED_USERS, seedLoads } from "../src/server/seed-data";

const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");

async function main() {
  await fs.mkdir(dir, { recursive: true });
  const db = { version: 1, users: SEED_USERS, loads: seedLoads(), pending: [] };
  await fs.writeFile(path.join(dir, "db.json"), JSON.stringify(db, null, 2));
  console.log(`Seeded ${db.users.length} people and ${db.loads.length} loads into ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
