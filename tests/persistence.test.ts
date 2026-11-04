import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup } from "node:sqlite";
import { openDb } from "../server/db";
test("dados persistem após reinício e backup consistente pode ser restaurado", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agenda-cre-test-"));
  try {
    const path = join(dir, "app.sqlite");
    let db = openDb(path);
    db.exec("INSERT INTO regions VALUES(1,'Regional teste')");
    db.close();
    db = openDb(path);
    assert.equal(
      db.prepare("SELECT name FROM regions").get()!.name,
      "Regional teste",
    );
    await backup(db, join(dir, "backup.sqlite"));
    db.close();
    const restored = openDb(join(dir, "backup.sqlite"));
    assert.equal(
      restored.prepare("PRAGMA integrity_check").get()!.integrity_check,
      "ok",
    );
    assert.equal(
      restored.prepare("SELECT name FROM regions").get()!.name,
      "Regional teste",
    );
    restored.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
