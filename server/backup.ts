import "dotenv/config";
import { backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { openDb } from "./db";
mkdirSync("backups", { recursive: true });
const db = openDb(process.env.DB_PATH || "./data/agenda.sqlite");
try {
  const path = `backups/agenda-${Date.now()}.sqlite`;
  await backup(db, path);
  console.log(`Backup consistente criado: ${path}`);
} finally {
  db.close();
}
