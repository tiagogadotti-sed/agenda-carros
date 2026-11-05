import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../server/db";

function legacyFixture(path: string, collision = false) {
  const db = openDb(path);
  db.exec(`INSERT INTO regions VALUES(1,'Regional teste');
    ALTER TABLE users RENAME COLUMN username TO email;
    ALTER TABLE users DROP COLUMN must_change_password;
    ALTER TABLE vehicles ADD COLUMN plate TEXT;
    INSERT INTO vehicles VALUES(1,1,'Veículo teste','ABC1234');
    INSERT INTO users VALUES(1,1,'Pessoa Teste','pessoa@exemplo.org','hash','admin');
    INSERT INTO bookings VALUES(1,1,1,1,'2026-12-01T08:00:00.000Z','2026-12-01T10:00:00.000Z','Visita',0);`);
  if (collision)
    db.exec(
      "INSERT INTO users VALUES(2,1,'Pessoa Teste','pessoa@outro.org','hash','viewer')",
    );
  db.close();
}

test("migração de banco antigo preserva veículos, reservas e triggers", () => {
  const dir = mkdtempSync(join(tmpdir(), "agenda-migrations-"));
  try {
    const path = join(dir, "legacy.sqlite");
    legacyFixture(path);
    let db = openDb(path);
    assert.equal(
      db.prepare("SELECT username FROM users WHERE id=1").get()!.username,
      "pessoa.teste",
    );
    assert.equal(
      db.prepare("SELECT name FROM vehicles WHERE id=1").get()!.name,
      "Veículo teste",
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get()!.n, 1);
    assert.equal(db.prepare("PRAGMA foreign_keys").get()!.foreign_keys, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(
      () =>
        db.exec(
          "INSERT INTO bookings VALUES(2,1,1,1,'2026-12-01T09:00:00.000Z','2026-12-01T11:00:00.000Z','Conflito',0)",
        ),
      /booking_conflict/,
    );
    db.close();
    db = openDb(path);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bookings").get()!.n, 1);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("colisão de usuários interrompe migração e restaura estrutura e dados anteriores", () => {
  const dir = mkdtempSync(join(tmpdir(), "agenda-migrations-"));
  try {
    const path = join(dir, "legacy.sqlite");
    legacyFixture(path, true);
    assert.throws(() => openDb(path), /Falha na migração/);
    const db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n, 2);
      assert.equal(
        db.prepare("SELECT email FROM users WHERE id=1").get()!.email,
        "pessoa@exemplo.org",
      );
      assert.equal(
        db.prepare("SELECT plate FROM vehicles WHERE id=1").get()!.plate,
        "ABC1234",
      );
      assert.equal(
        db
          .prepare(
            "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'",
          )
          .get()!.n,
        3,
      );
      assert.equal(
        db.prepare("SELECT COUNT(*) AS n FROM bookings").get()!.n,
        1,
      );
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
