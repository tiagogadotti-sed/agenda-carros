import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDb } from "../server/db";
import { createApp } from "../server/app";

test("health check público verifica o banco sem expor dados ou exigir login", async () => {
  const db = openDb(":memory:");
  const app = createApp(db, "https://agenda-carros.fly.dev", true);
  try {
    const response = await request(app).get("/healthz").expect(200);
    assert.deepEqual(response.body, { status: "ok" });
    assert.equal(response.headers["cache-control"], "no-store");
    await request(app).get("/api/me").expect(401);
  } finally {
    db.close();
  }
  const unavailable = await request(app).get("/healthz").expect(503);
  assert.deepEqual(unavailable.body, { status: "unavailable" });
});
