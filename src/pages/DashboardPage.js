import React, { useEffect, useState } from "react";
import "./DashboardPage.css";
import MailQuotesPanel from "../components/MailQuotesPanel";
import EmailSyncPanel from "../components/EmailSyncPanel";
import EmailFlowPanel from "../components/EmailFlowPanel";
import QuotesDailySummaryPanel from "../components/QuotesDailySummaryPanel";
import ResponseTipCard from "../components/ResponseTipCard";
import EmailHistoryPanel from "../components/EmailHistoryPanel";
import UsersPanel from "../components/UsersPanel";
import InventoryPanel from "../components/InventoryPanel";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

async function apiGet(path) {
  // GET con auth y manejo básico de errores
  const token = window.localStorage.getItem("cubicaMail_token");
  if (!token) {
    return { ok: false, status: 401, message: "No hay sesión activa." };
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok || (data && data.ok === false)) {
    const msg =
      (data && (data.message || data.error || data.msg || data.details)) || "";
    return {
      ok: false,
      status: res.status,
      message: msg || `Error ${res.status}`,
      data,
    };
  }

  return { ok: true, status: res.status, data };
}

function safeTotal(resp) {
  // Lee total desde respuesta paginada (cotizaciones)
  const t = resp?.data?.data?.total;
  if (typeof t === "number") return t;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function safeAnyTotal(resp) {
  // Lee total desde distintos shapes de respuesta paginada
  const t1 = resp?.data?.data?.total;
  const t2 = resp?.data?.total;
  const t3 = resp?.data?.data?.pages;

  if (typeof t1 === "number") return t1;
  if (typeof t2 === "number") return t2;

  const n1 = Number(t1);
  if (Number.isFinite(n1)) return n1;

  const n2 = Number(t2);
  if (Number.isFinite(n2)) return n2;

  const n3 = Number(t3);
  if (Number.isFinite(n3)) return n3;

  return 0;
}

function safeArrayLen(resp, path) {
  // Lee cantidad desde un array dentro de la respuesta
  const a = path(resp);
  return Array.isArray(a) ? a.length : 0;
}

function InventorySummaryCard() {
  // Resumen general de inventario para el dashboard
  const [stats, setStats] = useState({
    itemsTotal: 0,
    lowStockAlerts: 0,
    movesTotal: 0,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!API_BASE_URL) return;

      setLoading(true);

      try {
        const [rItems, rAlerts, rMoves] = await Promise.all([
          apiGet("/inventory/items?page=1&limit=1"),
          apiGet("/inventory/alerts/low-stock"),
          apiGet("/inventory/moves?page=1&limit=1"),
        ]);

        if (cancelled) return;

        const itemsTotal = rItems.ok ? safeAnyTotal(rItems) : 0;

        const lowStockAlerts = rAlerts.ok
          ? safeArrayLen(rAlerts, (x) => x?.data?.data?.items) ||
            safeArrayLen(rAlerts, (x) => x?.data?.items) ||
            safeArrayLen(rAlerts, (x) => x?.data?.data) ||
            0
          : 0;

        const movesTotal = rMoves.ok ? safeAnyTotal(rMoves) : 0;

        setStats({ itemsTotal, lowStockAlerts, movesTotal });
      } catch (e) {
        if (cancelled) return;
        setStats({ itemsTotal: 0, lowStockAlerts: 0, movesTotal: 0 });
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h2 className="dashboard-card-title">
        <span
          style={{
            marginRight: 6,
            display: "inline-flex",
            verticalAlign: "middle",
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M7 7h10v14H7V7Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M9 3h6l2 4H7l2-4Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M10 11h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M10 14h4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span>Inventario</span>
      </h2>

      <p className="dashboard-card-sub">
        Resumen rápido de items, alertas y movimientos.
      </p>

      <div className="dashboard-metrics">
        <div className="dashboard-metric">
          <div className="dashboard-metric-label">Items</div>
          <div className="dashboard-metric-value">
            {loading ? "..." : stats.itemsTotal}
          </div>
        </div>

        <div className="dashboard-metric">
          <div className="dashboard-metric-label">Alertas de bajo stock</div>
          <div className="dashboard-metric-value">
            {loading ? "..." : stats.lowStockAlerts}
          </div>
        </div>

        <div className="dashboard-metric">
          <div className="dashboard-metric-label">Movimientos</div>
          <div className="dashboard-metric-value">
            {loading ? "..." : stats.movesTotal}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardPage() {
  // Usuario autenticado
  const [usuario, setUsuario] = useState(null);

  // Sección activa del dashboard
  const [activeSection, setActiveSection] = useState("resumen");

  // Métricas para consejos (panel derecho)
  const [tipStats, setTipStats] = useState({
    pendientes: 0,
    seguimiento: 0,
    cerradas: 0,
  });

  // Verifica token y carga usuario
  useEffect(() => {
    const token = window.localStorage.getItem("cubicaMail_token");
    const rawUser = window.localStorage.getItem("cubicaMail_usuario");

    if (!token) {
      window.location.href = "/";
      return;
    }

    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        setUsuario(parsed);
      } catch (err) {
        console.error("Error leyendo usuario desde localStorage:", err);
      }
    }
  }, []);

  // Carga y refresca métricas del flujo para el componente de consejos
  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function loadTipStats() {
      // Evita ejecutar sin base URL configurada
      if (!API_BASE_URL) return;

      try {
        const [rPend, rSeg, rCer] = await Promise.all([
          apiGet("/cotizaciones?estado=PENDIENTE&limit=1&page=1"),
          apiGet("/cotizaciones?estado=EN_GESTION&limit=1&page=1"),
          apiGet("/cotizaciones?estado=RESPONDIDA&limit=1&page=1"),
        ]);

        if (cancelled) return;

        const pendientes = rPend.ok ? safeTotal(rPend) : 0;
        const seguimiento = rSeg.ok ? safeTotal(rSeg) : 0;
        const cerradas = rCer.ok ? safeTotal(rCer) : 0;

        setTipStats({ pendientes, seguimiento, cerradas });
      } catch (e) {
        if (cancelled) return;
        setTipStats({ pendientes: 0, seguimiento: 0, cerradas: 0 });
      }
    }

    loadTipStats();

    // Refresco automático cada 60 segundos
    timer = window.setInterval(() => {
      loadTipStats();
    }, 60000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  // Cierre de sesión
  const handleLogout = () => {
    try {
      window.localStorage.removeItem("cubicaMail_token");
      window.localStorage.removeItem("cubicaMail_refresh");
      window.localStorage.removeItem("cubicaMail_usuario");
    } catch (err) {
      console.error("Error limpiando sesión:", err);
    }
    window.location.href = "/";
  };

  // Deriva nombre y rol para mostrar
  const nombre =
    (usuario && (usuario.nombre || usuario.name)) ||
    (usuario && usuario.email ? usuario.email.split("@")[0] : "Usuario");

  const rol = usuario && (usuario.rol || usuario.role || "");
  const rolUpper = rol ? String(rol).toUpperCase() : "";
  const isAdmin = rolUpper === "ADMIN";

  // Render de contenido por sección
  const renderSection = () => {
    if (activeSection === "resumen") {
      return (
        <>
          <header className="dashboard-main-header">
            <div>
              <h1 className="dashboard-main-title">Resumen general</h1>
              <p className="dashboard-main-sub">
                Vista rápida de cotizaciones, estado del correo e inventario.
              </p>
            </div>
            <div className="dashboard-main-period">
              <span>Hoy</span>
            </div>
          </header>

          <section className="dashboard-main-grid">
            <div style={{ display: "grid", gap: 12 }}>
              <div className="dashboard-card dashboard-card--primary dashboard-card--compact">
                <h2 className="dashboard-card-title">
                  <span
                    style={{
                      marginRight: 6,
                      display: "inline-flex",
                      verticalAlign: "middle",
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <path
                        d="M7 4h10a2 2 0 0 1 2 2v3.5H5V6a2 2 0 0 1 2-2Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5 9.5h14V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9.5Z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9 13h6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                      <path
                        d="M9 16h3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <span>Cotizaciones</span>
                </h2>

                <p className="dashboard-card-sub">
                  Resumen diario de cotizaciones gestionadas.
                </p>

                <QuotesDailySummaryPanel />
              </div>

              <div className="dashboard-card dashboard-card--compact">
                <InventorySummaryCard />
              </div>
            </div>

            <div className="dashboard-card">
              <h2 className="dashboard-card-title">
                <span
                  style={{
                    marginRight: 6,
                    display: "inline-flex",
                    verticalAlign: "middle",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      d="M6.5 7A6.5 6.5 0 0 1 19 9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M18 5.5 19 9l-3.5-.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M17.5 17A6.5 6.5 0 0 1 5 15"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6 18.5 5 15l3.5.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>Estado de sincronización</span>
              </h2>
              <p className="dashboard-card-sub">
                Información de la integración con la bandeja de correo.
              </p>

              <EmailSyncPanel
                variant="compact"
                usuarioEmail={usuario && usuario.email ? usuario.email : ""}
              />
            </div>
          </section>
        </>
      );
    }

    if (activeSection === "cotizaciones") {
      return (
        <>
          <header className="dashboard-main-header">
            <div>
              <h1 className="dashboard-main-title">Bandeja de cotizaciones</h1>
              <p className="dashboard-main-sub">
                Cotizaciones generadas a partir de los correos sincronizados.
              </p>
            </div>
          </header>

          <div className="dashboard-card" style={{ marginTop: 12 }}>
            <MailQuotesPanel />
          </div>
        </>
      );
    }

    if (activeSection === "historial") {
      return (
        <>
          <header className="dashboard-main-header">
            <div>
              <h1 className="dashboard-main-title">Historial de correos</h1>
              <p className="dashboard-main-sub">
                Correos procesados. Haz clic en una fila para abrir en Gmail.
              </p>
            </div>
          </header>

          <div className="dashboard-card" style={{ marginTop: 12 }}>
            <EmailHistoryPanel />
          </div>
        </>
      );
    }

    if (activeSection === "inventario") {
      return (
        <>
          <header className="dashboard-main-header">
            <div>
              <h1 className="dashboard-main-title">Inventario</h1>
              <p className="dashboard-main-sub">
                Control de items, stock, movimientos y alertas.
              </p>
            </div>
          </header>

          <div className="dashboard-card" style={{ marginTop: 12 }}>
            <InventoryPanel isAdmin={isAdmin} />
          </div>
        </>
      );
    }

    if (activeSection === "configuracion") {
      return (
        <>
          <div className="dashboard-section-placeholder">
            <h1 className="dashboard-main-title">Configuración de correo</h1>
            <p className="dashboard-main-sub">
              Conexión con Gmail, permisos y ajustes de sincronización.
            </p>
          </div>

          <div className="dashboard-card" style={{ marginTop: 12 }}>
            <h2 className="dashboard-card-title">Sincronización manual</h2>
            <p className="dashboard-card-sub">
              Ejecuta la sincronización de cotizaciones o respuestas.
            </p>

            <EmailSyncPanel
              variant="full"
              usuarioEmail={usuario && usuario.email ? usuario.email : ""}
            />
          </div>
        </>
      );
    }

    if (activeSection === "usuarios") {
      if (!isAdmin) {
        return (
          <div className="dashboard-section-placeholder">
            <h1 className="dashboard-main-title">Administración de usuarios</h1>
            <p className="dashboard-main-sub">
              Acceso denegado. Esta sección requiere rol ADMIN.
            </p>
          </div>
        );
      }

      return (
        <>
          <header className="dashboard-main-header">
            <div>
              <h1 className="dashboard-main-title">Administración de usuarios</h1>
              <p className="dashboard-main-sub">
                Control de cuentas, roles y acceso al gestor de correos.
              </p>
            </div>
          </header>

          <div className="dashboard-card" style={{ marginTop: 12 }}>
            <UsersPanel endpoints={{ users: "/users" }} />
          </div>
        </>
      );
    }

    return null;
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <div className="dashboard-sidebar-user">
            <div className="dashboard-avatar">
              <span className="dashboard-avatar-initial">
                {nombre ? nombre.charAt(0).toUpperCase() : "U"}
              </span>
            </div>
            <div className="dashboard-sidebar-user-texts">
              <span className="dashboard-sidebar-name">{nombre}</span>
              <span className="dashboard-sidebar-email">
                {usuario && usuario.email ? usuario.email : "correo@empresa.com"}
              </span>
            </div>
          </div>

          <nav className="dashboard-nav">
            <button
              type="button"
              className={
                activeSection === "resumen"
                  ? "dashboard-nav-item dashboard-nav-item--active"
                  : "dashboard-nav-item"
              }
              onClick={() => setActiveSection("resumen")}
            >
              <span style={{ display: "inline-flex", marginRight: 8, verticalAlign: "middle" }}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <rect x="4" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="13" y="4" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="4" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <rect x="13" y="13" width="7" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              <span>Resumen</span>
            </button>

            <button
              type="button"
              className={
                activeSection === "cotizaciones"
                  ? "dashboard-nav-item dashboard-nav-item--active"
                  : "dashboard-nav-item"
              }
              onClick={() => setActiveSection("cotizaciones")}
            >
              <span style={{ display: "inline-flex", marginRight: 8, verticalAlign: "middle" }}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M4 7.5L12 12.5L20 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Bandeja de cotizaciones</span>
            </button>

            <button
              type="button"
              className={
                activeSection === "historial"
                  ? "dashboard-nav-item dashboard-nav-item--active"
                  : "dashboard-nav-item"
              }
              onClick={() => setActiveSection("historial")}
            >
              <span style={{ display: "inline-flex", marginRight: 8, verticalAlign: "middle" }}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M12 9v3.5L14.2 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>Historial de correos</span>
            </button>

            <button
              type="button"
              className={
                activeSection === "inventario"
                  ? "dashboard-nav-item dashboard-nav-item--active"
                  : "dashboard-nav-item"
              }
              onClick={() => setActiveSection("inventario")}
            >
              <span style={{ display: "inline-flex", marginRight: 8, verticalAlign: "middle" }}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M7 7h10v14H7V7Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M9 3h6l2 4H7l2-4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M10 11h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M10 14h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <span>Inventario</span>
            </button>

            <button
              type="button"
              className={
                activeSection === "configuracion"
                  ? "dashboard-nav-item dashboard-nav-item--active"
                  : "dashboard-nav-item"
              }
              onClick={() => setActiveSection("configuracion")}
            >
              <span style={{ display: "inline-flex", marginRight: 8, verticalAlign: "middle" }}>
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M12 9.5a2.5 2.5 0 1 1 0 5a2.5 2.5 0 0 1 0-5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  <path
                    d="M4 13.2V10.8l2-.6a2 2 0 0 0 1.2-1.1l.1-.3L6.7 7l1.7-1.7l1.8 0.6a2 2 0 0 0 1.3 0l1.8-0.6L15.3 7l-0.6 1.8l0.1.3a2 2 0 0 0 1.2 1.1l2 .6v2.4l-2 .6a2 2 0 0 0-1.2 1.1l-0.1.3l0.6 1.8L13.7 19l-1.8-.6a2 2 0 0 0-1.3 0L8.8 19L7 17.3l0.6-1.8l-0.1-.3A2 2 0 0 0 6.3 13.8Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>Configuración</span>
            </button>

            {isAdmin ? (
              <button
                type="button"
                className={
                  activeSection === "usuarios"
                    ? "dashboard-nav-item dashboard-nav-item--active"
                    : "dashboard-nav-item"
                }
                onClick={() => setActiveSection("usuarios")}
              >
                <span style={{ display: "inline-flex", marginRight: 8, verticalAlign: "middle" }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <circle cx="9" cy="9" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M4.5 17.5C5.3 15.8 7 14.6 9 14.6s3.7 1.2 4.5 2.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <circle cx="17" cy="10" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M15.5 17.8c.5-.9 1.3-1.6 2.4-1.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
                <span>Usuarios</span>
              </button>
            ) : null}
          </nav>

          <button type="button" className="dashboard-sidebar-logout" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </aside>

        <div className="dashboard-main-area">
          <header className="dashboard-header">
            <div className="dashboard-header-left">
              <div className="dashboard-logo-mark">
                <img
                  src="https://res.cloudinary.com/donvukufx/image/upload/v1764187057/cubica_logo_HD_transparent_u5xaeh.png"
                  alt="Logo Cubica"
                  className="dashboard-logo-img"
                />
              </div>
              <div className="dashboard-header-texts">
                <span className="dashboard-app-name">Cubica Manager</span>
                <span className="dashboard-app-sub">
                  Gestión centralizada de correos, cotizaciones e inventario.
                </span>
              </div>
            </div>

            {rolUpper && (
              <div className="dashboard-header-right">
                <span className="dashboard-user-role">{rolUpper}</span>
              </div>
            )}
          </header>

          <main className="dashboard-main">
            <section key={activeSection} className="dashboard-main-panel">
              {renderSection()}
            </section>

            <aside className="dashboard-right-panel">
              <div className="dashboard-card dashboard-card--compact">
                <h2 className="dashboard-card-title">
                  <span style={{ marginRight: 6, display: "inline-flex", verticalAlign: "middle" }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M4 8l5.5 4a3 3 0 0 0 3 0L18 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>Flujo de correos</span>
                </h2>
                <p className="dashboard-card-sub">
                  Resumen de cómo se distribuyen las consultas.
                </p>

                <EmailFlowPanel />
              </div>

              <ResponseTipCard
                pendientes={tipStats.pendientes}
                seguimiento={tipStats.seguimiento}
                cerradasMes={tipStats.cerradas}
              />
            </aside>
          </main>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
