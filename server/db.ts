import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function openDb(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS regions(id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL REFERENCES regions(id), name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','manager','viewer')));
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS vehicles(id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL REFERENCES regions(id), name TEXT NOT NULL, plate TEXT NOT NULL, UNIQUE(region_id,plate));
  CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL REFERENCES regions(id), vehicle_id INTEGER NOT NULL REFERENCES vehicles(id), user_id INTEGER NOT NULL REFERENCES users(id), start TEXT NOT NULL, end TEXT NOT NULL CHECK(end>start), reason TEXT NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS booking_dates ON bookings(vehicle_id,start,end);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, region_id INTEGER NOT NULL, user_id INTEGER NOT NULL, action TEXT NOT NULL, target INTEGER NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TRIGGER IF NOT EXISTS booking_region BEFORE INSERT ON bookings BEGIN
    SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM vehicles WHERE id=NEW.vehicle_id AND region_id=NEW.region_id) OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND region_id=NEW.region_id) THEN RAISE(ABORT,'region_mismatch') END;
  END;
  CREATE TRIGGER IF NOT EXISTS booking_overlap BEFORE INSERT ON bookings WHEN NEW.cancelled=0 BEGIN
    SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE vehicle_id=NEW.vehicle_id AND cancelled=0 AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'booking_conflict') END;
  END;
  CREATE TRIGGER IF NOT EXISTS booking_overlap_update BEFORE UPDATE ON bookings WHEN NEW.cancelled=0 BEGIN
    SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE id<>NEW.id AND vehicle_id=NEW.vehicle_id AND cancelled=0 AND start<NEW.end AND end>NEW.start) THEN RAISE(ABORT,'booking_conflict') END;
  END;`);
  return db;
}
