import "dotenv/config";
import { openDb } from "./db";
import { createApp } from "./app";
const production = process.env.NODE_ENV === "production";
if (production && !process.env.APP_ORIGIN?.startsWith("https://"))
  throw new Error("Configure APP_ORIGIN com HTTPS em produção.");
const db = openDb(process.env.DB_PATH || "./data/agenda.sqlite");
const server = createApp(
  db,
  process.env.APP_ORIGIN || "http://localhost:5173",
  production,
  Number(process.env.PORT || 3001),
).listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log("Agenda CRE: http://localhost:" + (process.env.PORT || 3001)),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
