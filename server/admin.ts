import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { openDb } from "./db";
import { hashPassword } from "./auth";
import { isStrongPassword, PASSWORD_MESSAGE } from "../shared/password";
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const name = await rl.question("Nome do administrador: ");
  const username = (await rl.question("Usuário (nome.sobrenome): ")).trim().toLowerCase();
  const region = await rl.question("Nome da regional: ");
  console.log("A senha digitada será visível neste terminal local.");
  console.log(PASSWORD_MESSAGE);
  const password = await rl.question("Senha: ");
  if (!name.trim() || !region.trim() || !/^[a-z0-9]+(?:\.[a-z0-9]+)+$/.test(username))
    throw new Error("Informe nome, regional e um usuário válido no formato nome.sobrenome.");
  if (!isStrongPassword(password)) throw new Error(PASSWORD_MESSAGE);
  const db = openDb(process.env.DB_PATH || "./data/agenda.sqlite");
  try {
    db.exec("BEGIN IMMEDIATE");
    let r = db.prepare("SELECT id FROM regions WHERE name=?").get(region) as { id: number | bigint } | undefined;
    if (!r)
      r = {
        id: db.prepare("INSERT INTO regions(name) VALUES(?)").run(region)
          .lastInsertRowid,
      };
    db.prepare(
      "INSERT INTO users(region_id,name,username,password,role) VALUES(?,?,?,?,?)",
    ).run(r.id, name, username, hashPassword(password), "admin");
    db.exec("COMMIT");
    console.log("Administrador criado.");
  } finally {
    db.close();
  }
} finally {
  rl.close();
}
