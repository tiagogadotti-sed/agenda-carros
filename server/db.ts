import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
const BOOKING_TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS booking_region BEFORE INSERT ON bookings BEGIN
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM vehicles WHERE id=NEW.vehicle_id AND region_id=NEW.region_id) OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND region_id=NEW.region_id) THEN RAISE(ABORT,'region_mismatch') END;
  END;
  CREATE TRIGGER IF NOT EXISTS booking_overlap BEFORE INSERT ON bookings WHEN NEW.cancelled=0 BEGIN
    SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE vehicle_id=NEW.vehicle_id AND cancelled=0 AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'booking_conflict') END;
  END;
  CREATE TRIGGER IF NOT EXISTS booking_overlap_update BEFORE UPDATE ON bookings WHEN NEW.cancelled=0 BEGIN
    SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE id<>NEW.id AND vehicle_id=NEW.vehicle_id AND cancelled=0 AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'booking_conflict') END;
  END;`;

export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS regions(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL REFERENCES regions(id), name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','viewer')), must_change_password INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS login_security(user_id INTEGER PRIMARY KEY REFERENCES users(id), failures INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)));
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS vehicles(id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL REFERENCES regions(id), name TEXT NOT NULL, UNIQUE(region_id,name));
  CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL REFERENCES regions(id), vehicle_id INTEGER NOT NULL REFERENCES vehicles(id), user_id INTEGER NOT NULL REFERENCES users(id), start TEXT NOT NULL, end TEXT NOT NULL CHECK(end>start), reason TEXT NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS booking_dates ON bookings(vehicle_id,start,end);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL, user_id INTEGER NOT NULL, action TEXT NOT NULL, target INTEGER NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);

  // Migrações incrementais
  try {
    runMigrations(db);
  } catch (error) {
    db.close();
    throw new Error(
      "Falha na migração do SQLite. Nenhuma alteração da migração foi aplicada.",
      { cause: error },
    );
  }

  return db;
}

function runMigrations(db: DatabaseSync) {
  // Rebuilding a referenced table requires foreign keys OFF before the transaction.
  // The schema, data conversion and trigger recreation commit together.
  db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
  try {
    db.exec(
      "DROP TRIGGER IF EXISTS booking_region; DROP TRIGGER IF EXISTS booking_overlap; DROP TRIGGER IF EXISTS booking_overlap_update;",
    );
    const userCols = db.prepare("PRAGMA table_info(users)").all() as {
      name: string;
    }[];
    if (!userCols.some((c) => c.name === "must_change_password")) {
      db.exec(
        "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
      );
    }

    if (
      userCols.some((c) => c.name === "email") &&
      !userCols.some((c) => c.name === "username")
    ) {
      db.exec("ALTER TABLE users RENAME COLUMN email TO username");
    }

    const hasUsernameCol = (
      db.prepare("PRAGMA table_info(users)").all() as { name: string }[]
    ).some((c) => c.name === "username");
    if (hasUsernameCol) {
      const users = db
        .prepare("SELECT id, name, username FROM users")
        .all() as { id: number; name: string; username: string }[];
      for (const u of users) {
        if (u.username && u.username.includes("@")) {
          let clean = u.username.split("@")[0].toLowerCase().trim();
          if (!clean.includes(".")) {
            const parts = u.name
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .split(/\s+/);
            if (parts.length >= 2) {
              clean = `${parts[0]}.${parts[parts.length - 1]}`;
            }
          }
          db.prepare("UPDATE users SET username=? WHERE id=?").run(clean, u.id);
        }
      }
    }

    const vehicleCols = db.prepare("PRAGMA table_info(vehicles)").all() as {
      name: string;
    }[];
    if (vehicleCols.some((c) => c.name === "plate")) {
      db.exec(`
        CREATE TABLE vehicles_new(
          id INTEGER PRIMARY KEY,
          region_id INTEGER NOT NULL REFERENCES regions(id),
          name TEXT NOT NULL,
          UNIQUE(region_id, name)
        );
        INSERT INTO vehicles_new(id, region_id, name) SELECT id, region_id, name FROM vehicles;
        DROP TABLE vehicles;
        ALTER TABLE vehicles_new RENAME TO vehicles;
      `);
    }
    db.exec(BOOKING_TRIGGERS);
    if (db.prepare("PRAGMA foreign_key_check").all().length)
      throw new Error("Referências inválidas no banco de dados.");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  } finally {
    db.exec("PRAGMA foreign_keys=ON;");
  }
}
