import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../server/db";
import { createApp } from "../server/app";
import { hashPassword } from "../server/auth";
import { isStrongPassword } from "../shared/password";

test("senha exige todas as classes, inclusive no cadastro e na edição", async () => {
  const db = openDb(":memory:");
  try {
    const bad = [
      "Ab1!abc",
      "abcdef1!",
      "ABCDEF1!",
      "Abcdefg!",
      "Abcdefg1",
      "Abcdef1 ",
      "A1!" + "a".repeat(126),
    ];
    for (const password of bad) assert.equal(isStrongPassword(password), false);
    assert.equal(isStrongPassword("Ábcdef1!"), true);
    assert.equal(isStrongPassword("Abcdef1!"), true);
    db.exec("INSERT INTO regions VALUES(1,'Teste')");
    db.prepare(
      "INSERT INTO users(id,region_id,name,username,password,role) VALUES(1,1,?,?,?,?)",
    ).run("Admin", "admin.user", hashPassword("Abcdef1!"), "admin");
    const agent = request.agent(createApp(db));
    const post = (path: string, body: object) =>
      agent
        .post(path)
        .set("Origin", "http://localhost:5173")
        .set("X-Requested-With", "agenda-cre")
        .send(body);
    await post("/api/login", {
      username: "admin.user",
      password: "Abcdef1!",
    }).expect(200);
    for (const password of bad) {
      await post("/api/users", {
        name: "Pessoa",
        username: "user.teste",
        role: "viewer",
        password,
      }).expect(400);
      await post("/api/users/1/edit", {
        name: "Admin",
        username: "admin.user",
        role: "admin",
        password,
      }).expect(400);
    }
    await post("/api/users", {
      name: "Pessoa",
      username: "user.teste",
      role: "viewer",
      password: "Abcdef1!",
    }).expect(201);
  } finally {
    db.close();
  }
});

test("três falhas bloqueiam permanentemente, apenas admin da regional desbloqueia", async () => {
  const dir = mkdtempSync(join(tmpdir(), "agenda-lock-test-"));
  const path = join(dir, "app.sqlite");
  let db = openDb(path);
  try {
    db.exec("INSERT INTO regions VALUES(1,'A'),(2,'B')");
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
        "Pessoa " + id,
        `user.${id}`,
        hashPassword("Abcdef1!"),
        role,
      );
    let app = createApp(db);
    let admin = request.agent(app),
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
    const login = (
      client: ReturnType<typeof request.agent>,
      username: string,
      password = "Abcdef1!",
    ) => post(client, "/api/login", { username, password });
    await login(admin, "user.1").expect(200);
    await login(manager, "user.2").expect(200);
    await login(viewer, "user.3").expect(200);
    for (let i = 0; i < 2; i++)
      await login(viewer, "user.3", "errada").expect(401);
    await login(viewer, "user.3").expect(200); // Sucesso zera a sequência.
    await login(viewer, "user.3", "errada").expect(401);
    await login(viewer, "USER.3", "errada").expect(401);
    await login(viewer, " user.3 ", "errada").expect(423);
    await viewer.get("/api/me").expect(401); // Sessões antigas também encerradas.
    await login(viewer, "user.3").expect(423);
    assert.equal(
      (await admin.get("/api/users")).body.find(
        (u: { id: number }) => u.id === 3,
      ).locked,
      1,
    );
    await post(manager, "/api/users/3/unlock", {}).expect(403);
    await post(viewer, "/api/users/3/unlock", {}).expect(401);
    await post(admin, "/api/users/4/unlock", {}).expect(404);
    // Alterar senha, e-mail ou perfil não contorna o bloqueio ligado ao ID.
    await post(admin, "/api/users/3/edit", {
      name: "Pessoa",
      username: "novo.user",
      role: "manager",
      password: "Nova#8888",
    }).expect(200);
    await login(viewer, "novo.user", "Nova#8888").expect(423);
    db.close();
    db = openDb(path);
    app = createApp(db);
    admin = request.agent(app);
    viewer = request.agent(app);
    await login(viewer, "novo.user", "Nova#8888").expect(423);
    await login(admin, "user.1").expect(200);
    await post(admin, "/api/users/3/unlock", {}).expect(200);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM login_security WHERE user_id=3")
        .get()!.n,
      0,
    );
    await login(viewer, "novo.user", "Nova#8888").expect(200);
    await login(viewer, "novo.user", "errada").expect(401); // Contador reinicia após desbloqueio.
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM audit WHERE action='user.locked'")
        .get()!.n,
      1,
    );
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM audit WHERE action='user.unlocked'")
        .get()!.n,
      1,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
