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
import { isStrongPassword, PASSWORD_MESSAGE } from "../shared/password";
const newPassword = z.string().refine(isStrongPassword, PASSWORD_MESSAGE);
const LOCK_MESSAGE =
  "Conta bloqueada após 3 tentativas inválidas. Solicite o desbloqueio ao administrador.";
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
  localPort = 3001,
) {
  const configuredOrigin = new URL(origin).origin;
  const allowedOrigins = new Set([configuredOrigin]);
  const configuredUrl = new URL(configuredOrigin);
  if (
    !production &&
    ["localhost", "127.0.0.1", "[::1]"].includes(configuredUrl.hostname)
  ) {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const alias = new URL(configuredOrigin);
      alias.hostname = host;
      allowedOrigins.add(alias.origin);
      allowedOrigins.add(`http://${host}:${localPort}`);
    }
  }
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "16kb" }));
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (!allowedOrigins.has(req.get("Origin") || "") ||
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
          email: z.string().trim().email().max(254),
          password: z.string().min(1).max(128),
        })
        .parse(req.body);
      db.exec("BEGIN IMMEDIATE");
      try {
        const user = db
          .prepare("SELECT * FROM users WHERE email=?")
          .get(input.email.toLowerCase()) as
          (User & { password: string }) | undefined;
        if (!user) {
          db.exec("COMMIT");
          res.status(401).json({ error: "E-mail ou senha inválidos." });
          return;
        }
        const state = db
          .prepare("SELECT failures,locked FROM login_security WHERE user_id=?")
          .get(user.id);
        if (state?.locked) {
          db.exec("COMMIT");
          res.status(423).json({ error: LOCK_MESSAGE });
          return;
        }
        if (!verifyPassword(input.password, user.password)) {
          const failures = Number(state?.failures || 0) + 1;
          const locked = failures >= 3 ? 1 : 0;
          db.prepare(
            "INSERT INTO login_security(user_id,failures,locked) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET failures=excluded.failures,locked=excluded.locked",
          ).run(user.id, failures, locked);
          if (locked) {
            db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
            db.prepare(
              "INSERT INTO audit(region_id,user_id,action,target) VALUES(?,?,'user.locked',?)",
            ).run(user.region_id, user.id, user.id);
          }
          db.exec("COMMIT");
          res
            .status(locked ? 423 : 401)
            .json({
              error: locked ? LOCK_MESSAGE : "E-mail ou senha inválidos.",
            });
          return;
        }
        db.prepare("DELETE FROM login_security WHERE user_id=?").run(user.id);
        db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
        const token = randomBytes(32).toString("hex");
        db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
          tokenHash(token),
          user.id,
          Date.now() + 8 * 3600000,
        );
        db.exec("COMMIT");
        res.cookie("session", token, {
          ...sessionOptions,
          maxAge: 8 * 3600000,
        });
        res.json({ ok: true });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  );
  app.use("/api", (req, res, next) => {
    const user = db
      .prepare(
        "SELECT u.id,u.region_id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND NOT EXISTS(SELECT 1 FROM login_security ls WHERE ls.user_id=u.id AND ls.locked=1)",
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
      mustChangePassword: Boolean(
        (db.prepare("SELECT must_change_password FROM users WHERE id=?").get(u.id) as { must_change_password: number } | undefined)
          ?.must_change_password,
      ),
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
          "SELECT u.id,u.name,u.email,u.role,COALESCE(ls.locked,0) AS locked FROM users u LEFT JOIN login_security ls ON ls.user_id=u.id WHERE u.region_id=? ORDER BY u.name",
        )
        .all(res.locals.user.region_id),
    ),
  );
  app.post("/api/users", allowed(["admin", "manager"]), (req, res) => {
    const b = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().email().max(254),
        password: newPassword,
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
        "INSERT INTO users(region_id,name,email,password,role,must_change_password) VALUES(?,?,?,?,?,1)",
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
  app.post(
    "/api/vehicles/:id/edit",
    allowed(["admin", "manager"]),
    (req, res) => {
      const id = z.coerce.number().int().positive().parse(req.params.id);
      const b = z
        .object({
          name: z.string().trim().min(2).max(80),
          plate: z.string().trim().min(4).max(12),
        })
        .parse(req.body);
      const u = res.locals.user as User;
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = db
          .prepare(
            "UPDATE vehicles SET name=?,plate=? WHERE id=? AND region_id=?",
          )
          .run(b.name, b.plate.toUpperCase(), id, u.region_id);
        if (!result.changes) {
          db.exec("ROLLBACK");
          res.status(404).json({ error: "Veículo não encontrado." });
          return;
        }
        audit(u, "vehicle.updated", id);
        db.exec("COMMIT");
        res.json({ ok: true });
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  );
  app.post("/api/users/:id/unlock", allowed(["admin"]), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const u = res.locals.user as User;
    db.exec("BEGIN IMMEDIATE");
    try {
      if (
        !db
          .prepare("SELECT id FROM users WHERE id=? AND region_id=?")
          .get(id, u.region_id)
      ) {
        db.exec("ROLLBACK");
        res.status(404).json({ error: "Usuário não encontrado." });
        return;
      }
      db.prepare("DELETE FROM login_security WHERE user_id=?").run(id);
      audit(u, "user.unlocked", id);
      db.exec("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  app.post("/api/users/:id/edit", allowed(["admin", "manager"]), (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().email().max(254),
        role: z.enum(["admin", "manager", "viewer"]),
        password: z.union([z.literal(""), newPassword]).optional(),
      })
      .parse(req.body);
    const u = res.locals.user as User;
    db.exec("BEGIN IMMEDIATE");
    try {
      const target = db
        .prepare("SELECT id,role,email FROM users WHERE id=? AND region_id=?")
        .get(id, u.region_id) as
        Pick<User, "id" | "role" | "email"> | undefined;
      if (!target) {
        db.exec("ROLLBACK");
        res.status(404).json({ error: "Usuário não encontrado." });
        return;
      }
      if (
        u.role === "manager" &&
        (target.role === "admin" || b.role === "admin")
      ) {
        db.exec("ROLLBACK");
        res.status(403).json({
          error:
            "Gestores podem alternar entre Gestor e Consulta, mas não editar ou atribuir Administrador.",
        });
        return;
      }
      if (
        target.role === "admin" &&
        b.role !== "admin" &&
        Number(
          db
            .prepare(
              "SELECT COUNT(*) AS total FROM users WHERE region_id=? AND role='admin'",
            )
            .get(u.region_id)!.total,
        ) <= 1
      ) {
        db.exec("ROLLBACK");
        res.status(409).json({
          error: "A regional precisa manter pelo menos um administrador.",
        });
        return;
      }
      db.prepare(
        "UPDATE users SET name=?,email=?,role=? WHERE id=? AND region_id=?",
      ).run(b.name, b.email.toLowerCase(), b.role, id, u.region_id);
      if (b.password)
        db.prepare("UPDATE users SET password=? WHERE id=?").run(
          hashPassword(b.password),
          id,
        );
      const revoke =
        Boolean(b.password) ||
        target.email !== b.email.toLowerCase() ||
        target.role !== b.role;
      if (revoke) db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
      audit(u, "user.updated", id);
      db.exec("COMMIT");
      const requiresLogin = revoke && id === u.id;
      if (requiresLogin) res.clearCookie("session", sessionOptions);
      res.json({ ok: true, requiresLogin });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  });
  app.post("/api/me/password", (req, res) => {
    const b = z
      .object({
        current: z.string().min(1).max(128),
        password: newPassword,
      })
      .parse(req.body);
    const u = res.locals.user as User;
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = db
        .prepare("SELECT password FROM users WHERE id=?")
        .get(u.id) as { password: string } | undefined;
      if (!row || !verifyPassword(b.current, row.password)) {
        db.exec("COMMIT");
        res.status(401).json({ error: "Senha atual incorreta." });
        return;
      }
      db.prepare("UPDATE users SET password=?,must_change_password=0 WHERE id=?").run(
        hashPassword(b.password),
        u.id,
      );
      db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
      audit(u, "user.password_changed", u.id);
      db.exec("COMMIT");
      res.clearCookie("session", sessionOptions);
      res.json({ ok: true });
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
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
        error: err.issues.some((i) => i.path.includes("password"))
          ? PASSWORD_MESSAGE
          : "Confira os campos informados.",
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
