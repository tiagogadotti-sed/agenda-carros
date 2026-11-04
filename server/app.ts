import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import { hashPassword, verifyPassword, tokenHash } from "./auth";
type User = {
  id: number;
  region_id: number;
  name: string;
  email: string;
  role: "admin" | "manager" | "viewer";
};
export function createApp(
  db: DatabaseSync,
  origin = "http://localhost:5173",
  production = false,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.get("Origin") !== origin ||
        req.get("X-Requested-With") !== "agenda-cre")
    ) {
      res.status(403).json({ error: "Origem da requisição inválida." });
      return;
    }
    next();
  });
  const sessionOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "strict" as const,
    path: "/",
  };
  const cookieToken = (req: Request) =>
    req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("session="))
      ?.slice(8) || "";
  app.post(
    "/api/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "Muitas tentativas. Aguarde 15 minutos." },
    }),
    (req, res) => {
      const input = z
        .object({
          email: z.string().email().max(254),
          password: z.string().min(1).max(128),
        })
        .parse(req.body);
      const user = db
        .prepare("SELECT * FROM users WHERE email=?")
        .get(input.email.toLowerCase()) as
        (User & { password: string }) | undefined;
      if (!user || !verifyPassword(input.password, user.password)) {
        res.status(401).json({ error: "E-mail ou senha inválidos." });
        return;
      }
      db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        tokenHash(token),
        user.id,
        Date.now() + 8 * 3600000,
      );
      res.cookie("session", token, { ...sessionOptions, maxAge: 8 * 3600000 });
      res.json({ ok: true });
    },
  );
  app.use("/api", (req, res, next) => {
    const user = db
      .prepare(
        "SELECT u.id,u.region_id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
      )
      .get(tokenHash(cookieToken(req)), Date.now());
    if (!user) {
      res.status(401).json({ error: "Faça login para continuar." });
      return;
    }
    res.locals.user = user;
    next();
  });
  const allowed =
    (roles: string[]) => (req: Request, res: Response, next: NextFunction) => {
      if (!roles.includes(res.locals.user.role)) {
        res.status(403).json({ error: "Seu perfil não permite esta ação." });
        return;
      }
      next();
    };
  const audit = (u: User, action: string, target: number) =>
    db
      .prepare(
        "INSERT INTO audit(region_id,user_id,action,target) VALUES(?,?,?,?)",
      )
      .run(u.region_id, u.id, action, target);
  app.get("/api/me", (_req, res) => {
    const u = res.locals.user as User;
    res.json({
      ...u,
      region: db.prepare("SELECT name FROM regions WHERE id=?").get(u.region_id)
        ?.name,
    });
  });
  app.post("/api/logout", (req, res) => {
    db.prepare("DELETE FROM sessions WHERE token=?").run(
      tokenHash(cookieToken(req)),
    );
    res.clearCookie("session", sessionOptions);
    res.json({ ok: true });
  });
  app.get("/api/vehicles", (_req, res) =>
    res.json(
      db
        .prepare("SELECT * FROM vehicles WHERE region_id=? ORDER BY name")
        .all(res.locals.user.region_id),
    ),
  );
  app.post("/api/vehicles", allowed(["admin"]), (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(80),
        plate: z.string().trim().min(4).max(12),
      })
      .parse(req.body);
    const u = res.locals.user as User;
    const r = db
      .prepare("INSERT INTO vehicles(region_id,name,plate) VALUES(?,?,?)")
      .run(u.region_id, b.name, b.plate.toUpperCase());
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.get("/api/users", allowed(["admin", "manager"]), (_req, res) =>
    res.json(
      db
        .prepare(
          "SELECT id,name,email,role FROM users WHERE region_id=? ORDER BY name",
        )
        .all(res.locals.user.region_id),
    ),
  );
  app.post("/api/users", allowed(["admin", "manager"]), (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().email().max(254),
        password: z.string().min(8).max(128),
        role: z.enum(["admin", "manager", "viewer"]),
      })
      .parse(req.body);
    const u = res.locals.user as User;
    if (u.role === "manager" && b.role !== "viewer") {
      res
        .status(403)
        .json({ error: "Gestores podem criar apenas usuários de consulta." });
      return;
    }
    const r = db
      .prepare(
        "INSERT INTO users(region_id,name,email,password,role) VALUES(?,?,?,?,?)",
      )
      .run(
        u.region_id,
        b.name,
        b.email.toLowerCase(),
        hashPassword(b.password),
        b.role,
      );
    audit(u, "user.created", Number(r.lastInsertRowid));
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.get("/api/bookings", (_req, res) =>
    res.json(
      db
        .prepare(
          "SELECT b.*,v.name AS vehicle,v.plate,u.name AS author FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id JOIN users u ON u.id=b.user_id WHERE b.region_id=? ORDER BY b.start",
        )
        .all(res.locals.user.region_id),
    ),
  );
  app.post("/api/bookings", allowed(["admin", "manager"]), (req, res) => {
    const b = z
      .object({
        vehicle_id: z.number().int().positive(),
        start: z.string().datetime({ offset: true }),
        end: z.string().datetime({ offset: true }),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
    const u = res.locals.user as User;
    const start = new Date(b.start).toISOString(),
      end = new Date(b.end).toISOString();
    if (end <= start) {
      res.status(400).json({ error: "O fim deve ser posterior ao início." });
      return;
    }
    if (
      !db
        .prepare("SELECT id FROM vehicles WHERE id=? AND region_id=?")
        .get(b.vehicle_id, u.region_id)
    ) {
      res.status(404).json({ error: "Veículo não encontrado." });
      return;
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      const r = db
        .prepare(
          "INSERT INTO bookings(region_id,vehicle_id,user_id,start,end,reason) VALUES(?,?,?,?,?,?)",
        )
        .run(u.region_id, b.vehicle_id, u.id, start, end, b.reason);
      audit(u, "booking.created", Number(r.lastInsertRowid));
      db.exec("COMMIT");
      res.status(201).json({ id: Number(r.lastInsertRowid) });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  app.post(
    "/api/bookings/:id/cancel",
    allowed(["admin", "manager"]),
    (req, res) => {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const u = res.locals.user as User;
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = db
          .prepare(
            "UPDATE bookings SET cancelled=1 WHERE id=? AND region_id=? AND cancelled=0",
          )
          .run(id, u.region_id);
        if (!r.changes) {
          db.exec("ROLLBACK");
          res
            .status(404)
            .json({ error: "Reserva não encontrada ou já cancelada." });
          return;
        }
        audit(u, "booking.cancelled", id);
        db.exec("COMMIT");
        res.json({ ok: true });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Recurso não encontrado." }),
  );
  app.use(express.static(resolve("dist")));
  app.get("/", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({
        error: "Confira os campos. Senhas devem ter pelo menos 8 caracteres.",
        details: err.issues.map((i) => i.path.join(".")),
      });
      return;
    }
    if (err.message.includes("booking_conflict")) {
      res
        .status(409)
        .json({ error: "Este veículo já está reservado nesse período." });
      return;
    }
    if (err.message.includes("UNIQUE constraint")) {
      res
        .status(409)
        .json({ error: "Este e-mail ou placa já está cadastrado." });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Requisição inválida." });
      return;
    }
    console.error("Falha interna:", err.message);
    res.status(500).json({ error: "Não foi possível concluir a operação." });
  });
  return app;
}
