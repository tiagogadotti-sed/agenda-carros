import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { openDb } from "../server/db";
import { createApp } from "../server/app";
import { hashPassword, verifyPassword } from "../server/auth";

test("edição respeita perfis, regional, unicidade, sessões e último administrador", async () => {
  const db = openDb(":memory:");
  try {
    db.exec(
      "INSERT INTO regions VALUES(1,'A'),(2,'B'); INSERT INTO vehicles VALUES(1,1,'Carro A','AAA1234'),(2,1,'Carro B','BBB1234'),(3,2,'Carro C','CCC1234')",
    );
    for (const [id, region, role] of [
      [1, 1, "admin"],
      [2, 1, "manager"],
      [3, 1, "viewer"],
      [4, 2, "admin"],
    ] as const)
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?)").run(
        id,
        region,
        "Pessoa " + id,
        `${id}@example.org`,
        hashPassword("Teste#88"),
        role,
      );
    const app = createApp(db);
    const admin = request.agent(app),
      manager = request.agent(app),
      viewer = request.agent(app);
    const post = (
      client: ReturnType<typeof request.agent>,
      url: string,
      body: object,
    ) =>
      client
        .post(url)
        .set("Origin", "http://localhost:5173")
        .set("X-Requested-With", "agenda-cre")
        .send(body);
    for (const [client, id] of [
      [admin, 1],
      [manager, 2],
      [viewer, 3],
    ] as const)
      await post(client, "/api/login", {
        email: `${id}@example.org`,
        password: "Teste#88",
      }).expect(200);
    const vehicle = { name: "Veículo atualizado", plate: "xyz1234" };
    await post(viewer, "/api/vehicles/1/edit", vehicle).expect(403);
    await post(manager, "/api/vehicles/3/edit", vehicle).expect(404);
    await post(manager, "/api/vehicles/1/edit", vehicle).expect(200);
    assert.equal(
      db.prepare("SELECT plate FROM vehicles WHERE id=1").get()!.plate,
      "XYZ1234",
    );
    await post(admin, "/api/vehicles/2/edit", vehicle).expect(409);
    await post(admin, "/api/vehicles/1/edit", { ...vehicle, name: "" }).expect(
      400,
    );
    await post(admin, "/api/vehicles/1/edit", {
      ...vehicle,
      name: "Nome final",
    }).expect(200);
    const person = {
      name: "Pessoa editada",
      email: "3@example.org",
      role: "viewer",
      password: "",
    };
    await post(viewer, "/api/users/3/edit", person).expect(403);
    await post(manager, "/api/users/4/edit", person).expect(404);
    await post(manager, "/api/users/1/edit", {
      ...person,
      role: "admin",
    }).expect(403);
    await post(manager, "/api/users/3/edit", {
      ...person,
      role: "admin",
    }).expect(403);
    await post(manager, "/api/users/1/edit", {
      ...person,
      role: "viewer",
    }).expect(403);
    const previous = db.prepare("SELECT password FROM users WHERE id=3").get()!
      .password;
    await post(manager, "/api/users/3/edit", person).expect(200);
    assert.equal(
      db.prepare("SELECT password FROM users WHERE id=3").get()!.password,
      previous,
    );
    await viewer.get("/api/me").expect(200);
    await post(manager, "/api/users/3/edit", {
      ...person,
      password: "curta",
    }).expect(400);
    await post(manager, "/api/users/3/edit", {
      ...person,
      email: "1@example.org",
    }).expect(409);
    assert.equal(
      db.prepare("SELECT email FROM users WHERE id=3").get()!.email,
      "3@example.org",
    );
    await post(manager, "/api/users/3/edit", {
      ...person,
      password: "Nova#888",
    }).expect(200);
    await viewer.get("/api/me").expect(401);
    assert.ok(
      verifyPassword(
        "Nova#888",
        db.prepare("SELECT password FROM users WHERE id=3").get()!
          .password as string,
      ),
    );
    await post(viewer, "/api/login", {
      email: "3@example.org",
      password: "Teste#88",
    }).expect(401);
    await post(viewer, "/api/login", {
      email: "3@example.org",
      password: "Nova#888",
    }).expect(200);
    await post(admin, "/api/users/1/edit", {
      name: "Admin",
      email: "1@example.org",
      role: "viewer",
    }).expect(409);
    await post(manager, "/api/users/3/edit", {
      ...person,
      role: "manager",
    }).expect(200);
    await viewer.get("/api/me").expect(401);
    await post(viewer, "/api/login", {
      email: person.email,
      password: "Nova#888",
    }).expect(200);
    assert.equal((await viewer.get("/api/me")).body.role, "manager");
    await post(manager, "/api/users/3/edit", person).expect(200);
    await viewer.get("/api/me").expect(401);
    await post(viewer, "/api/login", {
      email: person.email,
      password: "Nova#888",
    }).expect(200);
    assert.equal((await viewer.get("/api/me")).body.role, "viewer");
    await viewer.get("/api/users").expect(403);
    const response = await post(manager, "/api/users/2/edit", {
      name: "Gestor",
      email: "gestor@example.org",
      role: "manager",
    }).expect(200);
    assert.equal(response.body.requiresLogin, true);
    await manager.get("/api/me").expect(401);
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit WHERE action='vehicle.updated'",
        )
        .get()!.count,
      2,
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit WHERE action='user.updated'",
        )
        .get()!.count,
      5,
    );
  } finally {
    db.close();
  }
});
