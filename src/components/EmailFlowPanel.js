import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function toQuery(params) {
  // Construye querystring sin valores vacíos
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (!s) return;
    q.set(k, s);
  });
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

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
    };
  }

  return { ok: true, status: res.status, data };
}

export default function EmailFlowPanel({
  refreshMs = 0,
  endpointBase = "/cotizaciones",
  estadoMap,
}) {
  // Mapea los estados del backend a métricas del panel
  const map = useMemo(() => {
    return (
      estadoMap || {
        nuevas: "PENDIENTE",
        seguimiento: "EN_GESTION",
        cerradas: "RESPONDIDA",
      }
    );
  }, [estadoMap]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [nuevas, setNuevas] = useState(null);
  const [seguimiento, setSeguimiento] = useState(null);
  const [cerradas, setCerradas] = useState(null);

  const timerRef = useRef(null);

  async function loadCounts() {
    // Carga conteos por estado usando data.total
    if (!API_BASE_URL) {
      setError("Falta configurar REACT_APP_API_BASE_URL.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const base = `${endpointBase}${endpointBase.startsWith("/") ? "" : ""}`;

      const reqs = [
        apiGet(
          `${base}${toQuery({
            estado: map.nuevas,
            limit: 1,
            page: 1,
          })}`
        ),
        apiGet(
          `${base}${toQuery({
            estado: map.seguimiento,
            limit: 1,
            page: 1,
          })}`
        ),
        apiGet(
          `${base}${toQuery({
            estado: map.cerradas,
            limit: 1,
            page: 1,
          })}`
        ),
      ];

      const [r1, r2, r3] = await Promise.all(reqs);

      if (!r1.ok) {
        setError(r1.message || "Error consultando flujo.");
        setLoading(false);
        return;
      }
      if (!r2.ok) {
        setError(r2.message || "Error consultando flujo.");
        setLoading(false);
        return;
      }
      if (!r3.ok) {
        setError(r3.message || "Error consultando flujo.");
        setLoading(false);
        return;
      }

      const t1 = r1.data?.data?.total;
      const t2 = r2.data?.data?.total;
      const t3 = r3.data?.data?.total;

      setNuevas(typeof t1 === "number" ? t1 : Number(t1) || 0);
      setSeguimiento(typeof t2 === "number" ? t2 : Number(t2) || 0);
      setCerradas(typeof t3 === "number" ? t3 : Number(t3) || 0);
    } catch (e) {
      setError(e?.message || "Error de red consultando flujo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCounts();
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
      loadCounts();
    }, refreshMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshMs]);

  return (
    <div className="email-flow">
      {error ? <p className="email-flow-error">{error}</p> : null}

      <ul className="dashboard-list dashboard-list--stacked">
        <li className="dashboard-list-item">
          <span className="dashboard-list-label">Nuevas solicitudes</span>
          <span className="dashboard-list-value">
            {loading || nuevas === null ? "—" : String(nuevas)}
          </span>
        </li>
        <li className="dashboard-list-item">
          <span className="dashboard-list-label">En seguimiento</span>
          <span className="dashboard-list-value">
            {loading || seguimiento === null ? "—" : String(seguimiento)}
          </span>
        </li>
        <li className="dashboard-list-item">
          <span className="dashboard-list-label">Cerradas</span>
          <span className="dashboard-list-value">
            {loading || cerradas === null ? "—" : String(cerradas)}
          </span>
        </li>
      </ul>

      <div className="email-flow-actions">
        <button
          type="button"
          className="email-flow-btn"
          onClick={loadCounts}
          disabled={loading}
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>
    </div>
  );
}
