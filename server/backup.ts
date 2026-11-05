import "dotenv/config";
import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { openDb } from "./db";
const backupDir = process.env.BACKUP_DIR || "backups";
mkdirSync(backupDir, { recursive: true });
const db = openDb(process.env.DB_PATH || "./data/agenda.sqlite");
try {
  const path = join(backupDir, `agenda-${Date.now()}.sqlite`);
  await backup(db, path);
  console.log(`Backup consistente criado: ${path}`);
} finally {
  db.close();
}
