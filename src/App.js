
import React from "react";
import "./App.css";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";

function App() {
  // Lee la ruta actual
  const path = window.location.pathname;

  // Ruta pública para verificación por token (sin sesión)
  if (path.startsWith("/verify-email")) {
    return (
      <div className="app-root">
        <VerifyEmailPage />
      </div>
    );
  }

  // Si la ruta empieza por /dashboard mostramos el dashboard
  if (path.startsWith("/dashboard")) {
    return (
      <div className="app-root app-root--dashboard">
        <DashboardPage />
      </div>
    );
  }

  // Ruta por defecto: login
  return (
    <div className="app-root">
      <LoginPage />
    </div>
  );
}

export default App;
