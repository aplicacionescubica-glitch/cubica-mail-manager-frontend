import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const RESPONDED_STATUS = "COTIZACION_MARCADA_RESPONDIDA";

function buildGmailUrl(item) {
  // Construye un link a Gmail usando threadId o messageId
  const threadId = item?.threadId || item?.emailThreadId || "";
  const messageId = item?.messageId || item?.emailMessageId || "";

  if (threadId) return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
  if (messageId) return `https://mail.google.com/mail/u/0/#all/${messageId}`;
  return "";
}

function openInGmail(item, setError) {
  // Abre el correo en Gmail en una pestaña nueva
  const url = buildGmailUrl(item);
  if (!url) {
    setError("Este registro no tiene referencia de Gmail (threadId/messageId).");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function formatDateTime(s) {
  // Formato de fecha/hora para Colombia
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(s);
  }
}

function todayYYYYMMDDCO() {
  // Fecha actual en Colombia en formato YYYY-MM-DD
  const now = new Date();
  const co = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Bogota" })
  );
  const y = co.getFullYear();
  const m = String(co.getMonth() + 1).padStart(2, "0");
  const d = String(co.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toCODateStartISO(dateStr) {
  // Convierte YYYY-MM-DD a inicio de día en Colombia
  if (!dateStr) return "";
  return `${dateStr}T00:00:00.000-05:00`;
}

function toCODateEndISO(dateStr) {
  // Convierte YYYY-MM-DD a fin de día en Colombia
  if (!dateStr) return "";
  return `${dateStr}T23:59:59.999-05:00`;
}

async function apiGet(path) {
  // GET con auth y manejo básico de errores
  if (!API_BASE_URL) {
    return { ok: false, status: 0, message: "Falta configurar REACT_APP_API_BASE_URL." };
  }

  const token = window.localStorage.getItem("cubicaMail_token");
  if (!token) {
    return { ok: false, status: 401, message: "No hay sesión activa." };
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (res.status === 401) {
    try {
      window.localStorage.removeItem("cubicaMail_token");
      window.localStorage.removeItem("cubicaMail_refresh");
      window.localStorage.removeItem("cubicaMail_usuario");
    } catch (err) {
      console.error("Error limpiando sesión:", err);
    }
    return { ok: false, status: 401, message: "Autenticación requerida." };
  }

  if (!res.ok || (data && data.ok === false)) {
    const msg =
      (data && (data.message || data.error || data.msg || data.details)) || "";
    return { ok: false, status: res.status, message: msg || `Error ${res.status}`, data };
  }

  return { ok: true, status: res.status, data };
}

export default function EmailHistoryPanel({ pageSize = 25 }) {
  // Filtros (hoy por defecto)
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => todayYYYYMMDDCO());
  const [dateTo, setDateTo] = useState(() => todayYYYYMMDDCO());

  // Paginación
  const [page, setPage] = useState(1);

  // Datos
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Debounce de búsqueda
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedSearch(String(search || "").trim());
      setPage(1);
    }, 400);

    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo]);

  async function load() {
    // Carga historial desde /emails/history con paginación y filtros reales
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("limit", String(pageSize));
      params.append("status", RESPONDED_STATUS);
      params.append("hasCotizacion", "true");

      if (debouncedSearch) params.append("q", debouncedSearch);
      if (dateFrom) params.append("dateFrom", toCODateStartISO(dateFrom));
      if (dateTo) params.append("dateTo", toCODateEndISO(dateTo));

      const r = await apiGet(`/emails/history?${params.toString()}`);
      if (!r.ok) {
        setError(r.message || "No fue posible cargar el historial.");
        setItems([]);
        setTotal(0);
        setLoading(false);
        return;
      }

      const payload = r.data?.data || {};
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setTotal(typeof payload.total === "number" ? payload.total : 0);
    } catch (e) {
      setError(e?.message || "Error de red consultando historial.");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, dateFrom, dateTo]);

  const totalPages = useMemo(() => {
    const t = Number(total) || 0;
    const p = Number(pageSize) || 1;
    const n = Math.ceil(t / p);
    return n > 0 ? n : 1;
  }, [total, pageSize]);

  function onPrev() {
    // Página anterior
    setPage((p) => (p > 1 ? p - 1 : 1));
  }

  function onNext() {
    // Página siguiente
    setPage((p) => (p < totalPages ? p + 1 : p));
  }

  function onRowKeyDown(e, it) {
    // Soporte teclado para abrir en Gmail
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openInGmail(it, setError);
    }
  }

  return (
    <section className="mq-panel mq-panel--history">
      <div className="mq-header mq-header--history">
        <div />

        <form className="mq-filters mq-filters--history" onSubmit={(e) => e.preventDefault()}>
          <input
            type="text"
            className="mq-search"
            placeholder="Buscar (asunto, remitente, snippet)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <input
            type="date"
            className="mq-date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Fecha desde"
          />

          <input
            type="date"
            className="mq-date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Fecha hasta"
          />
        </form>
      </div>

      <div className="mq-body">
        {loading && <p className="mq-info">Cargando historial…</p>}
        {error && !loading && <p className="mq-error">{error}</p>}

        {!loading && !error && (
          <p className="mq-summary">
            Total: {total} · Página {page} de {totalPages}
          </p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="mq-info">No hay registros con los filtros actuales.</p>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <div className="mq-table-wrap">
              <table className="mq-table">
                <thead>
                  <tr>
                    <th>Respondido</th>
                    <th>Remitente</th>
                    <th>Asunto</th>
                    <th>Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const url = buildGmailUrl(it);
                    const clickable = Boolean(url);

                    const remitente = it.fromName
                      ? `${it.fromName} · ${it.fromEmail || ""}`.trim()
                      : it.fromEmail || "—";

                    return (
                      <tr
                        key={it._id || it.messageId}
                        className={clickable ? "mq-row-click" : ""}
                        title={clickable ? "Abrir en Gmail" : "Sin referencia de Gmail"}
                        onClick={clickable ? () => openInGmail(it, setError) : undefined}
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : -1}
                        onKeyDown={clickable ? (e) => onRowKeyDown(e, it) : undefined}
                      >
                        <td>{formatDateTime(it.receivedAt || it.createdAt)}</td>
                        <td>{remitente || "—"}</td>
                        <td>{it.subject || "—"}</td>
                        <td className="mq-snippet">{it.snippet || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mq-pager">
              <button
                type="button"
                className="mq-pager-btn"
                onClick={onPrev}
                disabled={loading || page <= 1}
              >
                Anterior
              </button>

              <span className="mq-pager-text">
                Página {page} de {totalPages}
              </span>

              <button
                type="button"
                className="mq-pager-btn"
                onClick={onNext}
                disabled={loading || page >= totalPages}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
