// Wipes the local demo data (.data/) so the next page load starts again from the demo fleet.
// Has no effect on a Supabase setup.
//
//   npm run reset-demo

import { rmSync } from "node:fs";
import path from "node:path";

const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. Restart the app (or just reload) to get fresh demo data.`);
