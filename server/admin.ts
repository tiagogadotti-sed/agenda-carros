import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { openDb } from "./db";
import { hashPassword } from "./auth";
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  const name = await rl.question("Nome do administrador: ");
  const email = (await rl.question("E-mail: ")).trim().toLowerCase();
  const region = await rl.question("Nome da regional: ");
  console.log("A senha digitada será visível neste terminal local.");
  const password = await rl.question("Senha (mínimo 12 caracteres): ");
  if (
    !name.trim() ||
    !region.trim() ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error("Dados inválidos.");
  const db = openDb(process.env.DB_PATH || "./data/agenda.sqlite");
  try {
    db.exec("BEGIN IMMEDIATE");
    let r = db.prepare("SELECT id FROM regions WHERE name=?").get(region);
    if (!r)
      r = {
        id: db.prepare("INSERT INTO regions(name) VALUES(?)").run(region)
          .lastInsertRowid,
      };
    db.prepare(
      "INSERT INTO users(region_id,name,email,password,role) VALUES(?,?,?,?,?)",
    ).run(r.id, name, email, hashPassword(password), "admin");
    db.exec("COMMIT");
    console.log("Administrador criado.");
  } finally {
    db.close();
  }
} finally {
  rl.close();
}
