import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function fmtDateKeyCO(d) {
  // Devuelve YYYY-MM-DD en zona horaria Colombia
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch (e) {
    return "";
  }
}

function fmtMonthKeyCO(d) {
  // Devuelve YYYY-MM en zona horaria Colombia
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    return `${get("year")}-${get("month")}`;
  } catch (e) {
    return "";
  }
}

function toDateSafe(input) {
  const d = input ? new Date(input) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
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
  const t = resp?.data?.data?.total;
  if (typeof t === "number") return t;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function safeItems(resp) {
  const items = resp?.data?.data?.items;
  return Array.isArray(items) ? items : [];
}

export default function QuotesDailySummaryPanel({
  endpointBase = "/cotizaciones",
  pageSize = 80,
  refreshMs = 0,
}) {
  // Estado de UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Métricas
  const [todayCount, setTodayCount] = useState(null);
  const [pendingCount, setPendingCount] = useState(null);
  const [closedThisMonth, setClosedThisMonth] = useState(null);

  const timerRef = useRef(null);

  const todayKey = useMemo(() => fmtDateKeyCO(new Date()), []);
  const monthKey = useMemo(() => fmtMonthKeyCO(new Date()), []);

  async function loadSummary() {
    // Carga métricas con el backend actual
    setLoading(true);
    setError("");

    try {
      const base = endpointBase;

      const rPending = await apiGet(`${base}?estado=PENDIENTE&limit=1&page=1`);
      if (!rPending.ok) {
        setError(rPending.message || "Error consultando pendientes.");
        setLoading(false);
        return;
      }

      const rRecent = await apiGet(`${base}?page=1&limit=${pageSize}`);
      if (!rRecent.ok) {
        setError(rRecent.message || "Error consultando cotizaciones recientes.");
        setLoading(false);
        return;
      }

      const rClosed = await apiGet(`${base}?estado=RESPONDIDA&page=1&limit=${pageSize}`);
      if (!rClosed.ok) {
        setError(rClosed.message || "Error consultando cerradas.");
        setLoading(false);
        return;
      }

      const pending = safeTotal(rPending);

      const recentItems = safeItems(rRecent);
      let today = 0;
      for (const it of recentItems) {
        const d = toDateSafe(it?.createdAt || it?.created_at || it?.fechaCreacion);
        if (!d) continue;
        if (fmtDateKeyCO(d) === todayKey) today += 1;
      }

      const closedItems = safeItems(rClosed);
      let closed = 0;
      for (const it of closedItems) {
        const d = toDateSafe(it?.updatedAt || it?.updated_at || it?.fechaRespuesta || it?.respondidaAt);
        if (!d) continue;
        if (fmtMonthKeyCO(d) === monthKey) closed += 1;
      }

      setPendingCount(pending);
      setTodayCount(today);
      setClosedThisMonth(closed);
    } catch (e) {
      setError(e?.message || "Error de red consultando resumen.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!refreshMs || refreshMs < 5000) return;
    if (timerRef.current) window.clearInterval(timerRef.current);

    timerRef.current = window.setInterval(() => {
      loadSummary();
    }, refreshMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs]);

  return (
    <div className="quotes-daily">
      {error ? <p className="quotes-daily-error">{error}</p> : null}

      <div className="dashboard-metrics">
        <div className="dashboard-metric">
          <span className="dashboard-metric-label">Cotizaciones del día</span>
          <span className="dashboard-metric-value">
            {loading || todayCount === null ? "—" : String(todayCount)}
          </span>
        </div>

        <div className="dashboard-metric">
          <span className="dashboard-metric-label">Pendientes por responder</span>
          <span className="dashboard-metric-value">
            {loading || pendingCount === null ? "—" : String(pendingCount)}
          </span>
        </div>

        <div className="dashboard-metric">
          <span className="dashboard-metric-label">Cerradas este mes</span>
          <span className="dashboard-metric-value">
            {loading || closedThisMonth === null ? "—" : String(closedThisMonth)}
          </span>
        </div>
      </div>

      <p className="quotes-daily-hint">
        Del día y este mes se calculan con las cotizaciones más recientes.
      </p>
    </div>
  );
}
