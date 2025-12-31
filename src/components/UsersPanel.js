import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function fmtDateTimeCO(input) {
  // Formatea fecha/hora en Colombia
  try {
    const d = input ? new Date(input) : null;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch (e) {
    return "—";
  }
}

function safeNumber(n, fallback) {
  // Normaliza números
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function buildQuery(params) {
  // Construye query string
  const sp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === null || typeof v === "undefined" || v === "") return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function readToken() {
  // Lee token de sesión
  try {
    return window.localStorage.getItem("cubicaMail_token") || "";
  } catch (e) {
    return "";
  }
}

function readCurrentUserId() {
  // Lee id del usuario logueado
  try {
    const raw = window.localStorage.getItem("cubicaMail_usuario") || "";
    if (!raw) return "";
    const obj = JSON.parse(raw);
    return String(obj?.id || obj?._id || "");
  } catch (e) {
    return "";
  }
}

function clearSession() {
  // Limpia sesión guardada
  try {
    window.localStorage.removeItem("cubicaMail_token");
    window.localStorage.removeItem("cubicaMail_refresh");
    window.localStorage.removeItem("cubicaMail_usuario");
  } catch (e) {}
}

async function authFetch(url, opts) {
  // Fetch con auth y manejo básico de errores
  const token = readToken();
  if (!token) {
    const err = new Error("No hay sesión activa. Inicia sesión nuevamente.");
    err.status = 401;
    throw err;
  }

  const res = await fetch(url, {
    method: (opts && opts.method) || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...((opts && opts.headers) || {}),
    },
    body: opts && typeof opts.body === "string" ? opts.body : undefined,
    signal: opts && opts.signal ? opts.signal : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (res.status === 401) {
    clearSession();
    const err = new Error("Autenticación requerida. Vuelve a iniciar sesión.");
    err.status = 401;
    err.payload = data;
    throw err;
  }

  if (res.status === 403) {
    const err = new Error("Acceso denegado. Requiere rol ADMIN.");
    err.status = 403;
    err.payload = data;
    throw err;
  }

  if (!res.ok || (data && data.ok === false)) {
    const msg =
      (data && (data.message || data.error || data.msg || data.details)) || "";
    const err = new Error(msg || `Error ${res.status}.`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  return data;
}

async function copyToClipboard(text) {
  // Copia texto al portapapeles
  const t = String(text || "");
  if (!t) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(t);
      return;
    }
  } catch (e) {}

  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "true");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch (e) {}
}

export default function UsersPanel({
  endpoints,
  defaultLimit = 20,
  onChanged,
  title = "Usuarios",
  subtitle = "Gestión de usuarios (solo administradores)",
}) {
  // Configuración de endpoints
  const apiPaths = useMemo(() => {
    const base = {
      users: "/users",
    };
    return { ...base, ...(endpoints || {}) };
  }, [endpoints]);

  // Usuario actual
  const currentUserId = useMemo(() => readCurrentUserId(), []);

  // Estado de UI
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // Datos
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  // Filtros backend
  const [rol, setRol] = useState("");
  const [estado, setEstado] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(defaultLimit);

  // Búsqueda local
  const [q, setQ] = useState("");

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [editing, setEditing] = useState(null);
  const [createdToken, setCreatedToken] = useState("");

  // Confirmación in-app
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmUser, setConfirmUser] = useState(null);

  // Form
  const [fEmail, setFEmail] = useState("");
  const [fNombre, setFNombre] = useState("");
  const [fRol, setFRol] = useState("AGENT");
  const [fEstado, setFEstado] = useState("ACTIVO");
  const [fPassword, setFPassword] = useState("");

  const abortRef = useRef(null);

  function apiUrl(path) {
    // Construye URL base + path
    const base = String(API_BASE_URL || "").replace(/\/+$/, "");
    const p = String(path || "").startsWith("/")
      ? String(path || "")
      : `/${path || ""}`;
    return `${base}${p}`;
  }

  async function loadUsers(next) {
    // Carga usuarios del backend
    if (!API_BASE_URL) {
      setError("Falta configurar REACT_APP_API_BASE_URL en el frontend.");
      return;
    }

    const payload = next || {
      page,
      limit,
      rol,
      estado,
    };

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError("");

    try {
      const url =
        apiUrl(apiPaths.users) +
        buildQuery({
          page: safeNumber(payload.page, 1),
          limit: safeNumber(payload.limit, defaultLimit),
          rol: payload.rol || "",
          estado: payload.estado || "",
        });

      const res = await authFetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      const data = (res && (res.data || res.result)) || {};
      const list = Array.isArray(data.items) ? data.items : [];

      setItems(list);
      setTotal(safeNumber(data.total, 0));
      setPage(safeNumber(data.page, 1));
      setLimit(safeNumber(data.limit, defaultLimit));
    } catch (e) {
      if (e && e.name === "AbortError") return;
      setItems([]);
      setTotal(0);
      setError(e?.message || "No se pudo cargar usuarios.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // Carga inicial
    loadUsers({ page: 1, limit, rol, estado });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Recarga cuando cambian filtros backend
    loadUsers({ page: 1, limit, rol, estado });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rol, estado, limit]);

  const filteredItems = useMemo(() => {
    // Filtro local por nombre/email
    const s = String(q || "").trim().toLowerCase();
    if (!s) return items;

    return items.filter((u) => {
      const email = String(u?.email || "").toLowerCase();
      const nombre = String(u?.nombre || "").toLowerCase();
      return email.includes(s) || nombre.includes(s);
    });
  }, [items, q]);

  const totalPages = useMemo(() => {
    // Cálculo de páginas
    const l = safeNumber(limit, defaultLimit);
    const t = safeNumber(total, 0);
    return l > 0 ? Math.max(1, Math.ceil(t / l)) : 1;
  }, [limit, total, defaultLimit]);

  function openCreate() {
    // Abre modal para crear
    setConfirmOpen(false);
    setConfirmUser(null);

    setModalMode("create");
    setEditing(null);
    setCreatedToken("");
    setFEmail("");
    setFNombre("");
    setFRol("AGENT");
    setFEstado("ACTIVO");
    setFPassword("");
    setError("");
    setModalOpen(true);
  }

  function openEdit(u) {
    // Abre modal para editar
    setConfirmOpen(false);
    setConfirmUser(null);

    setModalMode("edit");
    setEditing(u || null);
    setCreatedToken("");
    setFEmail(String(u?.email || ""));
    setFNombre(String(u?.nombre || ""));
    setFRol(String(u?.rol || "AGENT"));
    setFEstado(String(u?.estado || "ACTIVO"));
    setFPassword("");
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    // Cierra modal
    if (isSaving) return;
    setModalOpen(false);
  }

  function openDeleteConfirm(u) {
    // Abre confirmación de eliminación
    if (!u || !u.id) return;

    const uid = String(u.id || "");
    const isSelf = currentUserId && uid === String(currentUserId);

    setError("");

    if (isSelf) {
      setError("No puedes eliminar tu propia cuenta.");
      return;
    }

    setModalOpen(false);
    setConfirmUser(u);
    setConfirmOpen(true);
  }

  function closeConfirm() {
    // Cierra confirmación
    if (isSaving) return;
    setConfirmOpen(false);
    setConfirmUser(null);
  }

  async function confirmDelete() {
    // Ejecuta eliminación confirmada
    if (!confirmUser || !confirmUser.id) return;

    setError("");
    setIsSaving(true);

    try {
      if (!API_BASE_URL) {
        throw new Error("Falta configurar REACT_APP_API_BASE_URL en el frontend.");
      }

      const uid = String(confirmUser.id || "");
      const url = apiUrl(`${apiPaths.users}/${uid}`);

      await authFetch(url, { method: "DELETE" });

      const nextItems = items.filter((x) => String(x?.id || "") !== uid);
      setItems(nextItems);
      setTotal((t) => Math.max(0, safeNumber(t, 0) - 1));

      setConfirmOpen(false);
      setConfirmUser(null);

      await loadUsers({ page: 1, limit, rol, estado });

      if (typeof onChanged === "function") {
        try {
          onChanged({ action: "deleted" });
        } catch (e) {}
      }
    } catch (e) {
      setError(e?.message || "No se pudo eliminar el usuario.");
    } finally {
      setIsSaving(false);
    }
  }

  async function submitForm(e) {
    // Envía create/edit al backend
    e.preventDefault();
    setError("");
    setCreatedToken("");
    setIsSaving(true);

    try {
      if (!API_BASE_URL) {
        throw new Error("Falta configurar REACT_APP_API_BASE_URL en el frontend.");
      }

      if (!String(fNombre || "").trim()) {
        throw new Error("El nombre es obligatorio.");
      }

      if (!String(fRol || "").trim()) {
        throw new Error("El rol es obligatorio.");
      }

      if (modalMode === "create") {
        if (!String(fEmail || "").trim()) throw new Error("El email es obligatorio.");
        if (!String(fPassword || "").trim())
          throw new Error("La contraseña es obligatoria.");
        if (String(fPassword).length < 8) {
          throw new Error("La contraseña debe tener al menos 8 caracteres.");
        }

        const url = apiUrl(apiPaths.users);
        const res = await authFetch(url, {
          method: "POST",
          body: JSON.stringify({
            email: String(fEmail).trim(),
            nombre: String(fNombre).trim(),
            rol: String(fRol).trim(),
            password: String(fPassword),
          }),
        });

        const data = (res && (res.data || res.result)) || {};
        const token = data.emailVerificationToken || "";

        setCreatedToken(String(token || ""));
        await loadUsers({ page: 1, limit, rol, estado });

        if (typeof onChanged === "function") {
          try {
            onChanged({ action: "created" });
          } catch (e) {}
        }

        return;
      }

      if (!editing || !editing.id) throw new Error("Usuario inválido para edición.");

      const url = apiUrl(`${apiPaths.users}/${editing.id}`);
      await authFetch(url, {
        method: "PATCH",
        body: JSON.stringify({
          nombre: String(fNombre).trim(),
          rol: String(fRol).trim(),
          estado: String(fEstado).trim(),
        }),
      });

      await loadUsers({ page, limit, rol, estado });
      setModalOpen(false);

      if (typeof onChanged === "function") {
        try {
          onChanged({ action: "updated" });
        } catch (e) {}
      }
    } catch (e2) {
      setError(e2?.message || "No se pudo guardar el usuario.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleEstado(u) {
    // Activa o desactiva un usuario
    if (!u || !u.id) return;

    setError("");
    setIsSaving(true);

    try {
      if (!API_BASE_URL) {
        throw new Error("Falta configurar REACT_APP_API_BASE_URL en el frontend.");
      }

      const current = String(u.estado || "").toUpperCase();
      const nextEstado = current === "ACTIVO" ? "INACTIVO" : "ACTIVO";

      const url = apiUrl(`${apiPaths.users}/${u.id}`);
      await authFetch(url, {
        method: "PATCH",
        body: JSON.stringify({ estado: nextEstado }),
      });

      await loadUsers({ page, limit, rol, estado });

      if (typeof onChanged === "function") {
        try {
          onChanged({ action: "status" });
        } catch (e) {}
      }
    } catch (e) {
      setError(e?.message || "No se pudo actualizar el estado.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="users-panel">
      <div className="users-head">
        <div className="users-titles">
          <div className="users-title">{title}</div>
          <div className="users-subtitle">{subtitle}</div>
        </div>

        <div className="users-head-actions">
          <button
            type="button"
            className="email-sync-btn"
            onClick={openCreate}
            disabled={isLoading || isSaving}
          >
            Nuevo usuario
          </button>
        </div>
      </div>

      <div className="users-filters">
        <div className="users-row users-row--search">
          <label className="users-label">Buscar</label>
          <input
            className="users-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre o email"
            disabled={isLoading || isSaving}
          />
        </div>

        <div className="users-row users-row--select">
          <label className="users-label">Rol</label>
          <select
            className="users-select"
            value={rol}
            onChange={(e) => setRol(e.target.value)}
            disabled={isLoading || isSaving}
          >
            <option value="">Todos</option>
            <option value="ADMIN">ADMIN</option>
            <option value="AGENT">AGENT</option>
          </select>
        </div>

        <div className="users-row users-row--select">
          <label className="users-label">Estado</label>
          <select
            className="users-select"
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            disabled={isLoading || isSaving}
          >
            <option value="">Todos</option>
            <option value="ACTIVO">ACTIVO</option>
            <option value="INACTIVO">INACTIVO</option>
          </select>
        </div>

        <div className="users-row users-row--select users-row-sm">
          <label className="users-label">Límite</label>
          <select
            className="users-select"
            value={String(limit)}
            onChange={(e) => setLimit(safeNumber(e.target.value, defaultLimit))}
            disabled={isLoading || isSaving}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="40">40</option>
            <option value="80">80</option>
          </select>
        </div>
      </div>

      {error ? <p className="email-sync-error">{error}</p> : null}

      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Verificado</th>
              <th>Creado</th>
              <th>Último login</th>
              <th className="users-th-actions">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="users-td-center">
                  Cargando...
                </td>
              </tr>
            ) : filteredItems.length ? (
              filteredItems.map((u) => {
                const isActivo =
                  String(u?.estado || "").toUpperCase() === "ACTIVO";
                const isAdmin = String(u?.rol || "").toUpperCase() === "ADMIN";
                const isSelf =
                  currentUserId && String(u?.id || "") === String(currentUserId);

                return (
                  <tr key={u.id}>
                    <td className="users-td-strong">{u?.nombre || "—"}</td>
                    <td className="users-td-mono">{u?.email || "—"}</td>
                    <td>
                      <span className={`users-pill ${isAdmin ? "is-admin" : ""}`}>
                        {u?.rol || "—"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`users-pill ${isActivo ? "is-ok" : "is-warn"}`}
                      >
                        {u?.estado || "—"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`users-pill ${
                          u?.emailVerificado ? "is-ok" : "is-warn"
                        }`}
                      >
                        {u?.emailVerificado ? "SI" : "NO"}
                      </span>
                    </td>
                    <td>{fmtDateTimeCO(u?.createdAt)}</td>
                    <td>{fmtDateTimeCO(u?.lastLoginAt)}</td>
                    <td className="users-td-actions">
                      <button
                        type="button"
                        className="users-btn users-btn-ghost"
                        onClick={() => openEdit(u)}
                        disabled={isSaving}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="users-btn users-btn-ghost"
                        onClick={() => toggleEstado(u)}
                        disabled={isSaving}
                      >
                        {isActivo ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        className="users-btn users-btn-ghost"
                        onClick={() => openDeleteConfirm(u)}
                        disabled={isSaving || isSelf}
                        title={
                          isSelf ? "No puedes eliminar tu propia cuenta" : "Eliminar"
                        }
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="users-td-center">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="users-footer">
        <div className="users-meta">
          <span>Total: {String(total)}</span>
          <span>
            Página: {String(page)} / {String(totalPages)}
          </span>
        </div>

        <div className="users-pager">
          <button
            type="button"
            className="users-btn users-btn-ghost"
            onClick={() =>
              loadUsers({ page: Math.max(1, page - 1), limit, rol, estado })
            }
            disabled={isLoading || isSaving || page <= 1}
          >
            Anterior
          </button>

          <button
            type="button"
            className="users-btn users-btn-ghost"
            onClick={() =>
              loadUsers({
                page: Math.min(totalPages, page + 1),
                limit,
                rol,
                estado,
              })
            }
            disabled={isLoading || isSaving || page >= totalPages}
          >
            Siguiente
          </button>

          <button
            type="button"
            className="users-btn users-btn-ghost"
            onClick={() => loadUsers({ page, limit, rol, estado })}
            disabled={isLoading || isSaving}
          >
            Recargar
          </button>
        </div>
      </div>

      {modalOpen ? (
        <div className="users-modal-overlay" role="dialog" aria-modal="true">
          <div className="users-modal">
            <div className="users-modal-head">
              <div className="users-modal-title">
                {modalMode === "create" ? "Nuevo usuario" : "Editar usuario"}
              </div>
              <button
                type="button"
                className="users-btn users-btn-ghost"
                onClick={closeModal}
                disabled={isSaving}
              >
                Cerrar
              </button>
            </div>

            <form onSubmit={submitForm}>
              <div className="users-modal-body">
                <div className="users-grid">
                  <div className="users-row">
                    <label className="users-label">Nombre</label>
                    <input
                      className="users-input"
                      value={fNombre}
                      onChange={(e) => setFNombre(e.target.value)}
                      placeholder="Nombre completo"
                      disabled={isSaving}
                    />
                  </div>

                  <div className="users-row">
                    <label className="users-label">Rol</label>
                    <select
                      className="users-select"
                      value={fRol}
                      onChange={(e) => setFRol(e.target.value)}
                      disabled={isSaving}
                    >
                      <option value="AGENT">AGENT</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>

                  <div className="users-row">
                    <label className="users-label">Email</label>
                    <input
                      className="users-input"
                      value={fEmail}
                      onChange={(e) => setFEmail(e.target.value)}
                      placeholder="correo@dominio.com"
                      disabled={isSaving || modalMode === "edit"}
                    />
                  </div>

                  {modalMode === "edit" ? (
                    <div className="users-row">
                      <label className="users-label">Estado</label>
                      <select
                        className="users-select"
                        value={fEstado}
                        onChange={(e) => setFEstado(e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="ACTIVO">ACTIVO</option>
                        <option value="INACTIVO">INACTIVO</option>
                      </select>
                    </div>
                  ) : (
                    <div className="users-row">
                      <label className="users-label">Contraseña</label>
                      <input
                        className="users-input"
                        type="password"
                        value={fPassword}
                        onChange={(e) => setFPassword(e.target.value)}
                        placeholder="Mínimo 8 caracteres"
                        disabled={isSaving}
                      />
                    </div>
                  )}
                </div>

                {createdToken ? (
                  <div className="users-token-box">
                    <div className="users-token-title">Token verificación email</div>
                    <div className="users-token-row">
                      <div className="users-token-value">{createdToken}</div>
                      <button
                        type="button"
                        className="users-btn users-btn-ghost"
                        onClick={() => copyToClipboard(createdToken)}
                        disabled={isSaving}
                      >
                        Copiar
                      </button>
                    </div>
                    <div className="users-token-hint">
                      Se genera al crear el usuario. Úsalo si tu flujo de verificación lo requiere.
                    </div>
                  </div>
                ) : null}

                {error ? <p className="email-sync-error">{error}</p> : null}
              </div>

              <div className="users-modal-foot">
                <button
                  type="button"
                  className="users-btn users-btn-ghost"
                  onClick={closeModal}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className="email-sync-btn" disabled={isSaving}>
                  {isSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div className="users-modal-overlay" role="dialog" aria-modal="true">
          <div className="users-modal">
            <div className="users-modal-head">
              <div className="users-modal-title">Eliminar usuario</div>
              <button
                type="button"
                className="users-btn users-btn-ghost"
                onClick={closeConfirm}
                disabled={isSaving}
              >
                Cerrar
              </button>
            </div>

            <div className="users-modal-body">
              <p className="email-sync-hint" style={{ marginTop: 0 }}>
                Esta acción no se puede deshacer.
              </p>

              <div className="users-token-box" style={{ marginTop: 12 }}>
                <div className="users-token-title">Usuario</div>
                <div className="users-token-row" style={{ alignItems: "flex-start" }}>
                  <div className="users-token-value" style={{ whiteSpace: "normal" }}>
                    {String(confirmUser?.nombre || "—")}
                    {confirmUser?.email ? ` (${String(confirmUser.email)})` : ""}
                  </div>
                </div>
              </div>

              {error ? <p className="email-sync-error">{error}</p> : null}
            </div>

            <div className="users-modal-foot">
              <button
                type="button"
                className="users-btn users-btn-ghost"
                onClick={closeConfirm}
                disabled={isSaving}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="email-sync-btn"
                onClick={confirmDelete}
                disabled={isSaving}
              >
                {isSaving ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
