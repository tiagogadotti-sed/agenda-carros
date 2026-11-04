import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  region: string;
};
type Vehicle = { id: number; name: string; plate: string };
type Booking = {
  id: number;
  vehicle_id: number;
  vehicle: string;
  plate: string;
  start: string;
  end: string;
  reason: string;
  author: string;
  cancelled: number;
};
async function api(path: string, body?: unknown) {
  const r = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "agenda-cre",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Falha de comunicação.");
  return data;
}
const roles: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor de agenda",
  viewer: "Consulta",
};
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const time = (s: string) =>
  new Date(s).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("agenda"),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [bookings, setBookings] = useState<Booking[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [selected, setSelected] = useState(""),
    [day, setDay] = useState(localDay(new Date())),
    [showForm, setShowForm] = useState(false),
    [notice, setNotice] = useState("");
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  async function refresh() {
    const [v, b] = await Promise.all([api("/vehicles"), api("/bookings")]);
    setVehicles(v);
    setBookings(b);
  }
  useEffect(() => {
    api("/me")
      .then(async (u) => {
        setUser(u);
        await refresh();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (user && tab === "users")
      api("/users")
        .then(setUsers)
        .catch((e) => setError(e.message));
  }, [tab, user]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha inesperada.");
    } finally {
      setBusy(false);
    }
  }
  const form = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    return Object.fromEntries(new FormData(e.currentTarget));
  };
  const canManage = user?.role !== "viewer";
  const weekStart = new Date(day + "T12:00:00");
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const visible = bookings.filter(
    (b) => !b.cancelled && (!selected || b.vehicle_id === Number(selected)),
  );
  if (loading)
    return (
      <main className="login">
        <p>Carregando agenda…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login">
        <div className="intro">
          <span className="eyebrow">COORDENADORIA REGIONAL DE EDUCAÇÃO</span>
          <h1>
            Mais organização.
            <br />
            Mais caminhos.
          </h1>
          <p>A agenda de veículos da sua regional, em um só lugar.</p>
          <div className="road">
            CRE <span>→</span> ESCOLAS
          </div>
        </div>
        <section className="login-card">
          <span className="brand">◈ Agenda CRE</span>
          <h2>Bem-vindo à sua agenda</h2>
          <p>Entre com o acesso fornecido pela sua regional.</p>
          {notice && (
            <p role="status" className="success">
              {notice}
            </p>
          )}
          <form
            onSubmit={(e) => {
              const b = form(e);
              void action(async () => {
                await api("/login", b);
                setUser(await api("/me"));
                await refresh();
              });
            }}
          >
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy}>
              {busy ? "Entrando…" : "Entrar na agenda →"}
            </button>
          </form>
          <small>
            Primeiro acesso? Solicite seu cadastro ao administrador.
          </small>
        </section>
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <span className="brand">◈ Agenda CRE</span>
        <p className="regional">{user.region}</p>
        <nav>
          {[
            ["agenda", "▦", "Agenda"],
            ["vehicles", "◇", "Veículos"],
            ...(canManage ? [["users", "◎", "Usuários"]] : []),
          ].map(([id, icon, label]) => (
            <button
              className={tab === id ? "active" : ""}
              key={id}
              onClick={() => {
                setTab(id);
                setEditingVehicle(null);
                setEditingUser(null);
                setError("");
                setNotice("");
              }}
            >
              {icon} <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="account">
          <strong>{user.name}</strong>
          <small>{roles[user.role]}</small>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await api("/logout", {});
                setUser(null);
                setVehicles([]);
                setBookings([]);
                setUsers([]);
                setEditingVehicle(null);
                setEditingUser(null);
                setTab("agenda");
              })
            }
          >
            Sair da conta
          </button>
        </div>
      </aside>
      <main className="content">
        <header>
          <div>
            <span className="eyebrow">MOBILIDADE A SERVIÇO DA EDUCAÇÃO</span>
            <h1>
              {tab === "agenda"
                ? "Agenda de veículos"
                : tab === "vehicles"
                  ? "Nossa frota"
                  : "Pessoas e acessos"}
            </h1>
            <p>
              {tab === "agenda"
                ? "Consulte a disponibilidade e organize as próximas viagens."
                : tab === "vehicles"
                  ? "Os veículos disponíveis para sua regional."
                  : "Cada pessoa com o acesso certo."}
            </p>
          </div>
          <span className="badge">● {user.region}</span>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="success">
            {notice}
          </p>
        )}
        {tab === "agenda" && (
          <>
            <div className="stats">
              <article>
                <small>FROTA CADASTRADA</small>
                <strong>
                  {vehicles.length}
                  <span> veículos</span>
                </strong>
              </article>
              <article>
                <small>VIAGENS A PARTIR DE HOJE</small>
                <strong>
                  {
                    visible.filter((b) => b.end >= new Date().toISOString())
                      .length
                  }
                  <span> reservas</span>
                </strong>
              </article>
              <article>
                <small>SEU ACESSO</small>
                <strong className="role">{roles[user.role]}</strong>
              </article>
            </div>
            <section className="panel">
              <div className="toolbar">
                <div>
                  <h2>Calendário semanal</h2>
                  <p>Horários no fuso do seu dispositivo</p>
                </div>
                <div className="controls">
                  <label className="sr-only" htmlFor="week">
                    Data de referência
                  </label>
                  <input
                    id="week"
                    type="date"
                    value={day}
                    onChange={(e) => {
                      if (e.target.value) setDay(e.target.value);
                    }}
                  />
                  <label className="sr-only" htmlFor="car">
                    Filtrar veículo
                  </label>
                  <select
                    id="car"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    <option value="">Todos os veículos</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                  {canManage && (
                    <button onClick={() => setShowForm(!showForm)}>
                      {showForm ? "Fechar formulário" : "+ Agendar viagem"}
                    </button>
                  )}
                </div>
              </div>
              {showForm && canManage && (
                <form
                  className="editor"
                  onSubmit={(e) => {
                    const b = form(e);
                    void action(async () => {
                      await api("/bookings", {
                        ...b,
                        vehicle_id: Number(b.vehicle_id),
                        start: new Date(String(b.start)).toISOString(),
                        end: new Date(String(b.end)).toISOString(),
                      });
                      await refresh();
                      setShowForm(false);
                      setNotice("Viagem agendada.");
                    });
                  }}
                >
                  <h3>Nova viagem</h3>
                  <label>
                    Veículo
                    <select name="vehicle_id" required>
                      <option value="">Selecione</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {v.plate}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Início
                    <input
                      type="datetime-local"
                      name="start"
                      required
                      defaultValue={day + "T08:00"}
                    />
                  </label>
                  <label>
                    Fim
                    <input
                      type="datetime-local"
                      name="end"
                      required
                      defaultValue={day + "T09:00"}
                    />
                  </label>
                  <label className="wide">
                    Motivo da viagem
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={1000}
                      placeholder="Destino e finalidade da viagem"
                    />
                  </label>
                  <button disabled={busy || !vehicles.length}>
                    {busy ? "Salvando…" : "Confirmar agendamento"}
                  </button>
                </form>
              )}
              <div className="week">
                {days.map((d) => {
                  const start = new Date(localDay(d) + "T00:00:00"),
                    end = new Date(start);
                  end.setDate(end.getDate() + 1);
                  const list = visible.filter(
                    (b) => new Date(b.start) < end && new Date(b.end) > start,
                  );
                  return (
                    <section
                      key={d.toISOString()}
                      className={
                        localDay(d) === localDay(new Date()) ? "today" : ""
                      }
                    >
                      <div className="day">
                        <span>
                          {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                        </span>
                        <strong>{d.getDate()}</strong>
                        <small>
                          {d.toLocaleDateString("pt-BR", { month: "short" })}
                        </small>
                      </div>
                      {list.length ? (
                        list.map((b) => (
                          <article className="reservation" key={b.id}>
                            <strong>{b.vehicle}</strong>
                            <span>
                              {time(b.start)} → {time(b.end)}
                            </span>
                            <p>{b.reason}</p>
                            <small>{b.author}</small>
                            {localDay(new Date(b.start)) !==
                              localDay(new Date(b.end)) && (
                              <small>
                                {new Date(b.start).toLocaleDateString("pt-BR")}{" "}
                                — {new Date(b.end).toLocaleDateString("pt-BR")}
                              </small>
                            )}
                            {canManage && (
                              <button
                                className="cancel"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      "Cancelar esta reserva? O histórico será preservado.",
                                    )
                                  )
                                    void action(async () => {
                                      await api(
                                        "/bookings/" + b.id + "/cancel",
                                        {},
                                      );
                                      await refresh();
                                      setNotice("Reserva cancelada.");
                                    });
                                }}
                              >
                                Cancelar
                              </button>
                            )}
                          </article>
                        ))
                      ) : (
                        <p className="empty">Sem reservas</p>
                      )}
                    </section>
                  );
                })}
              </div>
            </section>
            <p className="footnote">
              Reservas conflitantes são bloqueadas automaticamente.
              Cancelamentos preservam o histórico.
            </p>
          </>
        )}
        {tab === "vehicles" && (
          <>
            <div className="fleet">
              {vehicles.map((v) => (
                <article className="panel" key={v.id}>
                  <span className="car-symbol">◇</span>
                  <h2>{v.name}</h2>
                  <span className="plate">{v.plate}</span>
                  {canManage && (
                    <div>
                      <button
                        disabled={busy}
                        onClick={() => {
                          setEditingVehicle(v);
                          setError("");
                          setNotice("");
                        }}
                      >
                        Editar veículo
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!vehicles.length && (
                <p>
                  Nenhum veículo cadastrado. O administrador pode cadastrar a
                  frota abaixo.
                </p>
              )}
            </div>
            {editingVehicle && canManage && (
              <form
                key={editingVehicle.id}
                className="panel editor"
                onSubmit={(e) => {
                  const b = form(e);
                  void action(async () => {
                    await api(`/vehicles/${editingVehicle.id}/edit`, b);
                    await refresh();
                    setEditingVehicle(null);
                    setNotice("Veículo atualizado.");
                  });
                }}
              >
                <h2>Editar veículo</h2>
                <label>
                  Nome
                  <input
                    name="name"
                    defaultValue={editingVehicle.name}
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </label>
                <label>
                  Placa
                  <input
                    name="plate"
                    defaultValue={editingVehicle.plate}
                    required
                    minLength={4}
                    maxLength={12}
                  />
                </label>
                <button disabled={busy}>Salvar alterações</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingVehicle(null)}
                >
                  Cancelar edição
                </button>
              </form>
            )}
            {user.role === "admin" && (
              <form
                className="panel editor"
                onSubmit={(e) => {
                  const el = e.currentTarget,
                    b = form(e);
                  void action(async () => {
                    await api("/vehicles", b);
                    await refresh();
                    el.reset();
                    setNotice("Veículo cadastrado.");
                  });
                }}
              >
                <h2>Cadastrar veículo</h2>
                <label>
                  Nome
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={80}
                    placeholder="Ex.: Sedan 01"
                  />
                </label>
                <label>
                  Placa
                  <input name="plate" required minLength={4} maxLength={12} />
                </label>
                <button disabled={busy}>Cadastrar</button>
              </form>
            )}
          </>
        )}
        {tab === "users" && canManage && (
          <>
            <section className="panel people">
              {users.map((u) => (
                <article key={u.id}>
                  <div>
                    <strong>{u.name}</strong>
                    <p>{u.email}</p>
                  </div>
                  <span className="badge">{roles[u.role]}</span>
                  {(user.role === "admin" || u.role !== "admin") && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        setEditingUser(u);
                        setError("");
                        setNotice("");
                      }}
                    >
                      Editar usuário
                    </button>
                  )}
                </article>
              ))}
            </section>
            {editingUser && (
              <form
                key={editingUser.id}
                className="panel editor"
                onSubmit={(e) => {
                  const b = form(e);
                  void action(async () => {
                    const result = await api(`/users/${editingUser.id}/edit`, {
                      ...b,
                      role: user.role === "admin" ? b.role : editingUser.role,
                    });
                    setEditingUser(null);
                    if (result.requiresLogin) {
                      setUser(null);
                      setUsers([]);
                      setVehicles([]);
                      setBookings([]);
                      setTab("agenda");
                      setNotice(
                        "Dados atualizados. Entre novamente com suas credenciais.",
                      );
                      return;
                    }
                    setUsers(await api("/users"));
                    setUser(await api("/me"));
                    await refresh();
                    setNotice("Usuário atualizado.");
                  });
                }}
              >
                <h2>Editar usuário</h2>
                <label>
                  Nome
                  <input
                    name="name"
                    defaultValue={editingUser.name}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    defaultValue={editingUser.email}
                    required
                    maxLength={254}
                  />
                </label>
                <label>
                  Nova senha
                  <input
                    name="password"
                    type="password"
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                  />
                  <small>Deixe em branco para manter a senha atual.</small>
                </label>
                <label>
                  Perfil
                  <select
                    name="role"
                    defaultValue={editingUser.role}
                    disabled={user.role !== "admin"}
                  >
                    <option value="viewer">Consulta</option>
                    <option value="manager">Gestor de agenda</option>
                    {user.role === "admin" && (
                      <option value="admin">Administrador</option>
                    )}
                  </select>
                </label>
                <p className="wide">
                  Alterações de e-mail, senha ou perfil encerram as sessões
                  desse usuário.
                </p>
                <button disabled={busy}>Salvar alterações</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingUser(null)}
                >
                  Cancelar edição
                </button>
              </form>
            )}
            <form
              className="panel editor"
              onSubmit={(e) => {
                const el = e.currentTarget,
                  b = form(e);
                void action(async () => {
                  await api("/users", b);
                  setUsers(await api("/users"));
                  el.reset();
                  setNotice("Usuário cadastrado.");
                });
              }}
            >
              <h2>Novo usuário</h2>
              <label>
                Nome
                <input name="name" required minLength={2} maxLength={100} />
              </label>
              <label>
                E-mail
                <input type="email" name="email" required />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  name="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                />
                <small>Mínimo de 8 caracteres</small>
              </label>
              <label>
                Perfil
                <select name="role">
                  <option value="viewer">Consulta</option>
                  {user.role === "admin" && (
                    <>
                      <option value="manager">Gestor de agenda</option>
                      <option value="admin">Administrador</option>
                    </>
                  )}
                </select>
              </label>
              <button disabled={busy}>Criar usuário</button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(console.error);
