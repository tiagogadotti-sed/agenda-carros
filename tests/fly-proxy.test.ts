import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDb } from "../server/db";
import { createApp } from "../server/app";

const origin = "https://agenda-carros.fly.dev";

test("Fly limita por IP real e ignora X-Forwarded-For forjado", async (t) => {
  const db = openDb(":memory:");
  const loggedErrors = t.mock.method(console, "error", () => {});
  try {
    const app = createApp(db, origin, true, 3000, true);
    const login = (ip: string, forwarded: string) =>
      request(app)
        .post("/api/login")
        .set("Origin", origin)
        .set("X-Requested-With", "agenda-cre")
        .set("Fly-Client-IP", ip)
        .set("X-Forwarded-For", forwarded)
        .send({ username: "inexistente.teste", password: "Teste#88" });
    for (let i = 0; i < 20; i++) {
      await login("203.0.113.10", `198.51.100.${i + 1}, 192.0.2.1`).expect(401);
    }
    await login("203.0.113.10", "198.51.100.99, 192.0.2.1").expect(429);
    // Outro cliente não compartilha a cota do proxy.
    await login("203.0.113.11", "198.51.100.99, 192.0.2.1").expect(401);
    assert.equal(loggedErrors.mock.callCount(), 0);
    assert.equal(app.get("trust proxy"), false);
  } finally {
    db.close();
  }
});

test("Fly agrupa IPv6 e usa fallback seguro para cabeçalhos inválidos", async () => {
  const db = openDb(":memory:");
  try {
    const app = createApp(db, origin, true, 3000, true);
    const login = (ip?: string) => {
      const req = request(app)
        .post("/api/login")
        .set("Origin", origin)
        .set("X-Requested-With", "agenda-cre");
      if (ip) req.set("Fly-Client-IP", ip);
      return req.send({ username: "inexistente.teste", password: "Teste#88" });
    };
    for (let i = 0; i < 20; i++)
      await login("2001:db8:abcd:1200::1").expect(401);
    await login("2001:db8:abcd:12ff::2").expect(429);
    await login("2001:db8:abcd:1300::1").expect(401);
    for (let i = 0; i < 20; i++) await login(`invalid-${i}`).expect(401);
    await login().expect(429);
  } finally {
    db.close();
  }
});

test("fora do Fly cabeçalho Fly-Client-IP não pode burlar o limite", async () => {
  const db = openDb(":memory:");
  try {
    const app = createApp(db, origin, true);
    for (let i = 0; i < 21; i++) {
      await request(app)
        .post("/api/login")
        .set("Origin", origin)
        .set("X-Requested-With", "agenda-cre")
        .set("Fly-Client-IP", `203.0.113.${i + 1}`)
        .send({ username: "inexistente.teste", password: "Teste#88" })
        .expect(i < 20 ? 401 : 429);
    }
  } finally {
    db.close();
  }
});
