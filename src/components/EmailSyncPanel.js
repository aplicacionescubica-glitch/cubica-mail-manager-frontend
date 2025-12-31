import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const LS_KEY = "cubicaMail_emailSyncInfo_v1";

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

function readUserEmail() {
  // Lee el usuario guardado para mostrar la cuenta conectada
  try {
    const raw = window.localStorage.getItem("cubicaMail_usuario");
    if (!raw) return "";
    const u = JSON.parse(raw);
    return u?.email || u?.correo || u?.username || u?.user || "";
  } catch (e) {
    return "";
  }
}

function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function pickFirstString(obj, keys) {
  // Toma el primer string no vacío de un set de llaves
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function normalizeBundle(payload) {
  // Normaliza respuesta del backend a un bundle { inbox, sent }
  const p = payload && typeof payload === "object" ? payload : {};
  const inbox = p.inbox && typeof p.inbox === "object" ? p.inbox : null;
  const sent = p.sent && typeof p.sent === "object" ? p.sent : null;

  if (inbox || sent) return { inbox, sent };
  return { inbox: p, sent: null };
}

function getSummaryForMode(bundle, mode) {
  // Retorna el summary correspondiente al modo
  if (!bundle) return null;
  if (mode === "respuestas") return bundle.sent || null;
  return bundle.inbox || null;
}

export default function EmailSyncPanel({
  variant = "compact",
  defaultMode = "cotizaciones",
  endpoints,
  maxMessagesDefault = 50,
  onSynced,
  usuarioEmail,
}) {
  // Configuración de endpoints (UI y backend usan /sync-email)
  const apiPaths = useMemo(() => {
    const base = {
      cotizaciones: "/cotizaciones/sync-email",
      respuestas: "/cotizaciones/sync-email",
    };
    return { ...base, ...(endpoints || {}) };
  }, [endpoints]);

  // Estado de UI
  const [mode, setMode] = useState(defaultMode);
  const [maxMessages, setMaxMessages] = useState(maxMessagesDefault);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Estado de resultados
  const [lastRunAt, setLastRunAt] = useState("");
  const [lastMode, setLastMode] = useState(defaultMode);
  const [bundle, setBundle] = useState(null);

  // Carga el último resultado guardado
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        if (saved.lastRunAt) setLastRunAt(saved.lastRunAt);
        if (saved.lastMode) setLastMode(saved.lastMode);
        if (saved.bundle) setBundle(saved.bundle);
      }
    } catch (e) {
      // Ignora errores de storage
    }
  }, []);

  async function runSync(targetMode) {
    // Ejecuta la sincronización contra el backend
    if (!API_BASE_URL) {
      setError("Falta configurar REACT_APP_API_BASE_URL en el frontend.");
      return;
    }

    const token = window.localStorage.getItem("cubicaMail_token");
    if (!token) {
      setError("No hay sesión activa. Inicia sesión nuevamente.");
      return;
    }

    const m = targetMode || mode;
    const path = apiPaths[m];
    if (!path) {
      setError("No hay endpoint configurado para la sincronización.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          maxMessages: safeNumber(maxMessages) || safeNumber(maxMessagesDefault),
        }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        data = null;
      }

      if (res.status === 401) {
        setError("Autenticación requerida. Vuelve a iniciar sesión.");
        try {
          window.localStorage.removeItem("cubicaMail_token");
          window.localStorage.removeItem("cubicaMail_refresh");
          window.localStorage.removeItem("cubicaMail_usuario");
        } catch (e) {
          console.error("Error limpiando sesión después de 401:", e);
        }
        setIsLoading(false);
        return;
      }

      if (res.status === 403) {
        setError("Acceso denegado. Requiere rol ADMIN para sincronizar.");
        setIsLoading(false);
        return;
      }

      if (!res.ok || (data && data.ok === false)) {
        const msg =
          (data &&
            (data.message || data.error || data.msg || data.details)) ||
          "";
        setError(msg || `Error ${res.status} al sincronizar.`);
        setIsLoading(false);
        return;
      }

      const payload =
        (data && (data.data || data.summary || data.result)) || data;

      const normalizedBundle = normalizeBundle(payload);

      const nowIso = new Date().toISOString();
      setLastRunAt(nowIso);
      setLastMode(m);
      setBundle(normalizedBundle);

      try {
        window.localStorage.setItem(
          LS_KEY,
          JSON.stringify({
            lastRunAt: nowIso,
            lastMode: m,
            bundle: normalizedBundle,
          })
        );
      } catch (e) {
        // Ignora errores de storage
      }

      if (typeof onSynced === "function") {
        try {
          onSynced({ mode: m, bundle: normalizedBundle });
        } catch (e) {
          // Evita romper la UI por un callback
        }
      }
    } catch (e) {
      setError(e?.message || "Error de red al sincronizar.");
    } finally {
      setIsLoading(false);
    }
  }

  const cuenta = usuarioEmail || readUserEmail() || "—";
  const effectiveMode = lastMode || mode;

  // Summary mostrado según el modo seleccionado
  const shown = getSummaryForMode(bundle, effectiveMode);

  // Campos compatibles con distintos summaries
  const totalMessages =
    shown && typeof shown === "object"
      ? safeNumber(shown.totalMessages ?? shown.total ?? shown.count)
      : null;

  const processed =
    shown && typeof shown === "object"
      ? safeNumber(shown.processed ?? shown.processedCount)
      : null;

  const errors =
    shown && typeof shown === "object"
      ? safeNumber(shown.errors ?? shown.errorCount)
      : null;

  const created =
    shown && typeof shown === "object"
      ? safeNumber(shown.created ?? shown.createdCount)
      : null;

  const reused =
    shown && typeof shown === "object"
      ? safeNumber(shown.reused ?? shown.reusedCount)
      : null;

  const matched =
    shown && typeof shown === "object"
      ? safeNumber(shown.matched ?? shown.matchCount)
      : null;

  const updated =
    shown && typeof shown === "object"
      ? safeNumber(shown.updated ?? shown.updatedCount)
      : null;

  const skipped =
    shown && typeof shown === "object"
      ? safeNumber(shown.skipped ?? shown.skippedCount)
      : null;

  const details =
    shown && typeof shown === "object" && Array.isArray(shown.details)
      ? shown.details
      : null;

  return (
    <div className="email-sync">
      <div className="email-sync-actions">
        {variant === "full" ? (
          <>
            <div className="email-sync-row">
              <label className="email-sync-label">Tipo</label>
              <select
                className="email-sync-select"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={isLoading}
              >
                <option value="cotizaciones">Cotizaciones</option>
                <option value="respuestas">Respuestas</option>
              </select>
            </div>

            <div className="email-sync-row">
              <label className="email-sync-label">Máx. correos</label>
              <input
                className="email-sync-input"
                type="number"
                min={1}
                max={200}
                value={maxMessages}
                onChange={(e) => setMaxMessages(e.target.value)}
                disabled={isLoading}
              />
            </div>

            <button
              type="button"
              className="email-sync-btn"
              onClick={() => runSync(mode)}
              disabled={isLoading}
            >
              {isLoading ? "Sincronizando..." : "Sincronizar ahora"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="email-sync-btn"
              onClick={() => runSync("cotizaciones")}
              disabled={isLoading}
            >
              {isLoading ? "Sincronizando..." : "Sync cotizaciones"}
            </button>
            <button
              type="button"
              className="email-sync-btn"
              onClick={() => runSync("respuestas")}
              disabled={isLoading}
            >
              {isLoading ? "Sincronizando..." : "Sync respuestas"}
            </button>
          </>
        )}
      </div>

      {error ? <p className="email-sync-error">{error}</p> : null}

      <ul className="dashboard-list">
        <li className="dashboard-list-item">
          <span className="dashboard-list-label">Cuenta conectada</span>
          <span className="dashboard-list-value">{cuenta}</span>
        </li>

        <li className="dashboard-list-item">
          <span className="dashboard-list-label">Última sincronización</span>
          <span className="dashboard-list-value">
            {lastRunAt ? fmtDateTimeCO(lastRunAt) : "—"}
          </span>
        </li>

        <li className="dashboard-list-item">
          <span className="dashboard-list-label">Correos por revisar</span>
          <span className="dashboard-list-value">
            {totalMessages === null ? "—" : String(totalMessages)}
          </span>
        </li>

        <li className="dashboard-list-item">
          <span className="dashboard-list-label">Procesados</span>
          <span className="dashboard-list-value">
            {processed === null ? "—" : String(processed)}
          </span>
        </li>

        {effectiveMode === "cotizaciones" ? (
          <>
            <li className="dashboard-list-item">
              <span className="dashboard-list-label">Creadas</span>
              <span className="dashboard-list-value">
                {created === null ? "—" : String(created)}
              </span>
            </li>
            <li className="dashboard-list-item">
              <span className="dashboard-list-label">Reutilizadas</span>
              <span className="dashboard-list-value">
                {reused === null ? "—" : String(reused)}
              </span>
            </li>
          </>
        ) : (
          <>
            <li className="dashboard-list-item">
              <span className="dashboard-list-label">Coincidencias</span>
              <span className="dashboard-list-value">
                {matched === null ? "—" : String(matched)}
              </span>
            </li>
            <li className="dashboard-list-item">
              <span className="dashboard-list-label">Actualizadas</span>
              <span className="dashboard-list-value">
                {updated === null ? "—" : String(updated)}
              </span>
            </li>
            <li className="dashboard-list-item">
              <span className="dashboard-list-label">Omitidas</span>
              <span className="dashboard-list-value">
                {skipped === null ? "—" : String(skipped)}
              </span>
            </li>
          </>
        )}

        <li className="dashboard-list-item">
          <span className="dashboard-list-label">Errores</span>
          <span className="dashboard-list-value">
            {errors === null ? "—" : String(errors)}
          </span>
        </li>
      </ul>

      {variant === "full" && details ? (
        <details className="email-sync-details">
          <summary className="email-sync-summary">Ver detalles</summary>
          <div className="email-sync-details-body">
            {details.length ? (
              <ul className="email-sync-details-list">
                {details.slice(0, 20).map((d, idx) => {
                  const key = d?.messageId || d?.id || String(idx);
                  const status = pickFirstString(d, [
                    "status",
                    "result",
                    "action",
                    "state",
                  ]);
                  const info =
                    pickFirstString(d, ["error", "reason", "subject", "snippet"]) ||
                    "";

                  return (
                    <li key={key} className="email-sync-details-item">
                      <span className="email-sync-details-status">
                        {status || "INFO"}
                      </span>
                      <span className="email-sync-details-text">
                        {info ? String(info) : "Sin detalle"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="email-sync-muted">No hay detalles disponibles.</p>
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
