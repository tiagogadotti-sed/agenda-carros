import { test } from "node:test";
import request from "supertest";
import { openDb } from "../server/db";
import { createApp } from "../server/app";

test("desenvolvimento aceita aliases locais, mas bloqueia origens externas e portas inesperadas", async () => {
  const db = openDb(":memory:");
  try {
    const app = createApp(db);
    const login = (origin?: string, marker = true) => {
      const req = request(app).post("/api/login");
      if (origin) req.set("Origin", origin);
      if (marker) req.set("X-Requested-With", "agenda-cre");
      return req.send({ email: "teste@example.org", password: "senha-teste" });
    };
    for (const origin of [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://[::1]:5173",
      "http://localhost:3001",
    ]) {
      await login(origin).expect(401); // Chegou à autenticação; não há conta de teste.
    }
    for (const origin of [
      "https://externo.example",
      "http://localhost:5174",
      "http://localhost.evil.example:5173",
      "null",
      undefined,
    ]) {
      await login(origin).expect(403);
    }
    await login("http://localhost:5173", false).expect(403);
  } finally {
    db.close();
  }
});

test("produção aceita exclusivamente APP_ORIGIN", async () => {
  const db = openDb(":memory:");
  try {
    const app = createApp(db, "https://agenda.example.org/", true);
    for (const [origin, status] of [
      ["https://agenda.example.org", 401],
      ["http://127.0.0.1:5173", 403],
      ["https://externo.example", 403],
    ] as const) {
      await request(app)
        .post("/api/login")
        .set("Origin", origin)
        .set("X-Requested-With", "agenda-cre")
        .send({ email: "teste@example.org", password: "senha-teste" })
        .expect(status);
    }
  } finally {
    db.close();
  }
});
