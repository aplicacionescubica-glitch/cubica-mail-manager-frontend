import React, { useEffect, useMemo, useState } from "react";
import "./VerifyEmailPage.css";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

/* Lee token desde query string */
function getQueryToken() {
  try {
    const qs = new URLSearchParams(window.location.search);
    return qs.get("token") || "";
  } catch {
    return "";
  }
}

/* Normaliza la URL base del backend para construir /api/... sin duplicaciones */
function normalizeApiBase(raw) {
  const base = String(raw || "").trim().replace(/\/+$/, "");
  if (!base) return "";

  // Si el usuario puso /api/auth por error, lo recortamos a /api
  if (base.endsWith("/api/auth")) return base.slice(0, -"/auth".length);

  // Si ya termina en /api, se deja tal cual
  if (base.endsWith("/api")) return base;

  // Si no trae /api, lo agregamos
  return `${base}/api`;
}

/* Verifica correo usando token del link sin Authorization */
async function verifyEmail(token) {
  const apiBase = normalizeApiBase(API_BASE_URL);

  if (!apiBase) {
    return {
      ok: false,
      message: "Falta configurar REACT_APP_API_BASE_URL en el frontend.",
    };
  }

  // Producción está respondiendo 404 en GET /auth/verify-email, usamos POST
  const url = `${apiBase}/auth/verify-email`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || (data && data.ok === false)) {
    const msg =
      (data && (data.message || data.error || data.msg || data.details)) || "";

    return {
      ok: false,
      message: msg || `Error ${res.status}`,
      status: res.status,
      data,
      url,
    };
  }

  return { ok: true, data, url };
}

function VerifyEmailPage() {
  const token = useMemo(() => getQueryToken(), []);
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      if (!token) {
        if (!alive) return;
        setStatus("error");
        setMessage("No se encontró el token de verificación en el enlace.");
        return;
      }

      setStatus("loading");
      setMessage("Verificando correo...");
      setDetails(null);

      try {
        const r = await verifyEmail(token);
        if (!alive) return;

        if (!r.ok) {
          setStatus("error");
          setMessage(
            r.message ||
              "No fue posible verificar el correo. El token puede estar vencido o ya fue usado."
          );
          setDetails(r.data || { requestUrl: r.url });
          return;
        }

        setStatus("ok");
        setMessage("Cuenta verificada. Ya puedes iniciar sesión.");

        window.setTimeout(() => {
          window.location.href = "/";
        }, 1200);
      } catch {
        if (!alive) return;
        setStatus("error");
        setMessage(
          "No fue posible verificar el correo. Intenta nuevamente o solicita un nuevo enlace."
        );
        setDetails(null);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [token]);

  function goLogin() {
    window.location.href = "/";
  }

  return (
    <div className="verify-root">
      <div className="verify-card">
        <h1 className="verify-title">Verificación de correo</h1>

        {status === "loading" && (
          <p className="verify-text">{message || "Verificando..."}</p>
        )}

        {status === "ok" && (
          <>
            <p className="verify-text verify-ok">{message}</p>
            <button className="verify-btn" onClick={goLogin}>
              Ir al login
            </button>
          </>
        )}

        {status === "error" && (
          <>
            <p className="verify-text verify-error">{message}</p>
            <div className="verify-actions">
              <button className="verify-btn" onClick={goLogin}>
                Volver al login
              </button>
            </div>

            {details ? (
              <pre className="verify-debug">
                {JSON.stringify(details, null, 2)}
              </pre>
            ) : null}
          </>
        )}

        {status === "idle" && (
          <p className="verify-text">Preparando verificación...</p>
        )}
      </div>
    </div>
  );
}

export default VerifyEmailPage;
