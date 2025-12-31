import React, { useState, useEffect } from "react";
import "./LoginPage.css";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function LoginPage() {
  // Tema actual: "light" o "dark"
  const [theme, setTheme] = useState(() => {
    const saved = window.localStorage.getItem("cubicaMail_theme");
    return saved === "dark" ? "dark" : "light";
  });

  // Aplica la clase al body cuando cambia el tema
  useEffect(() => {
    if (theme === "dark") {
      document.body.classList.add("theme-dark");
    } else {
      document.body.classList.remove("theme-dark");
    }
    window.localStorage.setItem("cubicaMail_theme", theme);
  }, [theme]);

  // Cambia entre claro y oscuro
  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

  // Estado del formulario
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Estado de la petición
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Maneja el envío del formulario
  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!API_BASE_URL) {
      setError("No se ha configurado la URL del backend.");
      return;
    }

    if (!email || !password) {
      setError("Ingresa correo y contraseña.");
      return;
    }

    try {
      setIsLoading(true);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json().catch(() => null);
      console.log("Respuesta completa de login:", data);

      if (!response.ok) {
        const serverMsg =
          data && (data.message || data.error || data.msg || data.details);
        const fallback = `Error ${response.status}: No fue posible iniciar sesión.`;
        setError(serverMsg || fallback);
        console.error("Error login:", {
          status: response.status,
          url: `${API_BASE_URL}/auth/login`,
          raw: data,
        });
        return;
      }

      if (data && data.ok === false) {
        const msg =
          data.message ||
          data.error ||
          "Credenciales inválidas o error de servidor.";
        setError(msg);
        console.error("Login ok=false:", data);
        return;
      }

      const payload = data?.data || {};
      const usuario = payload.usuario || null;
      const tokens = payload.tokens || {};
      const accessToken = tokens.accessToken || null;
      const refreshToken = tokens.refreshToken || null;

      if (!accessToken) {
        console.warn(
          "No se encontró accessToken en data.data.tokens:",
          data
        );
        setError(
          "No se recibió el token de sesión desde el servidor. Revisa el formato de tokens."
        );
        return;
      }

      try {
        window.localStorage.setItem("cubicaMail_token", accessToken);
        if (refreshToken) {
          window.localStorage.setItem("cubicaMail_refresh", refreshToken);
        }
        if (usuario) {
          window.localStorage.setItem(
            "cubicaMail_usuario",
            JSON.stringify(usuario)
          );
        }
      } catch (storageError) {
        console.error("Error guardando datos de sesión:", storageError);
      }

      setSuccess("Inicio de sesión correcto.");

      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 700);
    } catch (err) {
      console.error(err);
      setError("Error al conectar con el servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-root--login">
      <div className="login-window">
        <div className="login-header">
          <div className="login-header-title">Cubica Manager</div>
        </div>

        <div className="login-body">
          <div className="login-logo-wrap">
            <img
              src="https://res.cloudinary.com/donvukufx/image/upload/v1764187057/cubica_logo_HD_transparent_u5xaeh.png"
              alt="Logo Cubica"
              className="login-logo"
            />
          </div>

          <h1 className="login-title">Iniciar sesión</h1>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="email" className="login-label">
                Correo electrónico
              </label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="login-input-icon-svg"
                  >
                    <rect
                      x="3"
                      y="5"
                      width="18"
                      height="14"
                      rx="2"
                      ry="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M4 7.5L12 12.5L20 7.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <input
                  id="email"
                  type="email"
                  className="login-input"
                  placeholder="Correo administrativo"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password" className="login-label">
                Contraseña
              </label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="login-input-icon-svg"
                  >
                    <rect
                      x="6"
                      y="10"
                      width="12"
                      height="9"
                      rx="2"
                      ry="2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M9 10V8.5A3.5 3.5 0 0 1 12.5 5A3.5 3.5 0 0 1 16 8.5V10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <circle cx="12" cy="14" r="1" fill="currentColor" />
                  </svg>
                </span>
                <input
                  id="password"
                  type="password"
                  className="login-input"
                  placeholder="Contraseña"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="login-button-content">
                  <span className="login-spinner" />
                  <span>Iniciando sesión...</span>
                </span>
              ) : (
                "Entrar"
              )}
            </button>

            <div className="login-messages">
              {error && <p className="login-error-text">{error}</p>}
              {success && <p className="login-success-text">{success}</p>}
            </div>
          </form>

          <p className="login-footer">Cubica · {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
