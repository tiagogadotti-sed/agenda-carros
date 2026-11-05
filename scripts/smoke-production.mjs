// Verify the runtime with ONLY production dependencies, outside the checkout.
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

if (!process.env.npm_execpath)
  throw new Error("Execute npm run test:production.");
if (!existsSync("dist/index.html"))
  throw new Error("Execute npm run build antes.");
const root = resolve(".");
const temp = mkdtempSync(join(tmpdir(), "agenda-production-"));
let child;
let exited;
let logs = "";
try {
  for (const path of [
    "package.json",
    "package-lock.json",
    "server",
    "shared",
    "dist",
  ]) {
    cpSync(join(root, path), join(temp, path), { recursive: true });
  }
  const installed = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "ci", "--omit=dev", "--no-audit", "--no-fund"],
    {
      cwd: temp,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    },
  );
  assert.equal(installed.status, 0, "Instalação de produção falhou.");
  assert.ok(
    !existsSync(join(temp, "node_modules", "vite")),
    "Dependências de desenvolvimento não devem estar presentes.",
  );
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: temp,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "0.0.0.0",
      PORT: String(port),
      APP_ORIGIN: "https://agenda-carros.fly.dev",
      DB_PATH: join(temp, "persistent-data", "agenda.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  exited = once(child, "exit");
  child.stdout.on("data", (data) => {
    logs += data;
  });
  child.stderr.on("data", (data) => {
    logs += data;
  });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null)
      throw new Error(
        `Servidor encerrou com código ${child.exitCode}.\n${logs}`,
      );
    try {
      const health = await fetch(`${base}/healthz`, {
        signal: AbortSignal.timeout(1000),
      });
      if (health.ok) {
        ready = true;
        break;
      }
    } catch {
      /* server is starting */
    }
    await delay(200);
  }
  assert.ok(ready, `Servidor não iniciou.\n${logs}`);
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Agenda CRE/);
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  assert.ok(existsSync(join(temp, "persistent-data", "agenda.sqlite")));
  console.log(
    "Runtime de produção OK: sem devDependencies, SQLite, frontend e /healthz funcionando.",
  );
} finally {
  if (child && child.exitCode === null) child.kill("SIGTERM");
  if (exited) await exited;
  // Only removes the uniquely created temporary test directory.
  rmSync(temp, { recursive: true, force: true });
}
