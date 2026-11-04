import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDb } from "../server/db";
import { hashPassword } from "../server/auth";
import { createApp } from "../server/app";
const origin = "http://localhost:5173";
test("perfis, sessões, isolamento regional e conflitos de reservas", async () => {
  const db = openDb(":memory:");
  const app = createApp(db, origin);
  const post = (
    client: ReturnType<typeof request.agent>,
    url: string,
    body: object,
  ) =>
    client
      .post(url)
      .set("Origin", origin)
      .set("X-Requested-With", "agenda-cre")
      .send(body);
  try {
    db.exec("INSERT INTO regions VALUES(1,'Regional A'),(2,'Regional B')");
    for (const [id, region, role] of [
      [1, 1, "admin"],
      [2, 1, "manager"],
      [3, 1, "viewer"],
      [4, 2, "admin"],
    ] as const)
      db.prepare(
        "INSERT INTO users(id,region_id,name,username,password,role) VALUES(?,?,?,?,?,?)",
      ).run(
        id,
        region,
        role,
        `user.${id}`,
        hashPassword("senha-de-teste-segura"),
        role,
      );
    db.exec(
      "INSERT INTO vehicles VALUES(1,1,'Carro A'),(2,2,'Carro B')",
    );
    const admin = request.agent(app),
      manager = request.agent(app),
      viewer = request.agent(app),
      other = request.agent(app);
    await request(app).get("/api/bookings").expect(401);
    await admin
      .post("/api/login")
      .send({ username: "user.1", password: "senha-de-teste-segura" })
      .expect(403);
    for (const [client, id] of [
      [admin, 1],
      [manager, 2],
      [viewer, 3],
      [other, 4],
    ] as const) {
      const login = await post(client, "/api/login", {
        username: `user.${id}`,
        password: "senha-de-teste-segura",
      }).expect(200);
      assert.match(login.headers["set-cookie"][0], /HttpOnly/);
      assert.match(login.headers["set-cookie"][0], /SameSite=Strict/);
    }
    const body = {
      vehicle_id: 1,
      start: "2026-12-01T08:00:00-03:00",
      end: "2026-12-01T10:00:00-03:00",
      reason: "Visita escolar",
    };
    await post(viewer, "/api/bookings", body).expect(403);
    await post(other, "/api/bookings", body).expect(404);
    const results = await Promise.all([
      post(admin, "/api/bookings", body),
      post(manager, "/api/bookings", body),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const id = results.find((r) => r.status === 201)!.body.id;
    await post(manager, "/api/bookings", {
      ...body,
      start: body.end,
      end: "2026-12-01T11:00:00-03:00",
    }).expect(201);
    await post(admin, "/api/bookings", { ...body, end: body.start }).expect(
      400,
    );
    await post(admin, "/api/bookings", { ...body, start: "inválido" }).expect(
      400,
    );
    await post(other, `/api/bookings/${id}/cancel`, {}).expect(404);
    assert.equal((await other.get("/api/bookings")).body.length, 0);
    assert.equal((await viewer.get("/api/bookings")).body.length, 2);
    assert.equal((await viewer.get("/api/vehicles")).body.length, 1);
    await viewer.get("/api/users").expect(403);
    const newUser = {
      name: "Nova pessoa",
      username: "nova.pessoa",
      password: "Teste#88!",
      role: "admin",
    };
    await post(manager, "/api/users", newUser).expect(403);
    await post(admin, "/api/users", { ...newUser, password: "Teste#7" }).expect(
      400,
    );
    await post(manager, "/api/users", { ...newUser, role: "viewer" }).expect(
      201,
    );
    await post(admin, "/api/users", newUser).expect(409);
    await post(manager, "/api/vehicles", {
      name: "Teste",
    }).expect(403);
    await post(admin, `/api/bookings/${id}/cancel`, {}).expect(200);
    await post(admin, "/api/bookings", body).expect(201);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit WHERE action='booking.cancelled'",
        )
        .get()!.count,
      1,
    );
    const hash = db.prepare("SELECT password FROM users WHERE id=1").get()!
      .password as string;
    assert.notEqual(hash, "senha-de-teste-segura");
    await post(admin, "/api/logout", {}).expect(200);
    await admin.get("/api/me").expect(401);
    db.prepare("UPDATE sessions SET expires=0").run();
    await viewer.get("/api/me").expect(401);
  } finally {
    db.close();
  }
});
