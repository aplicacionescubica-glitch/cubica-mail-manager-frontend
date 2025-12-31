import React, { useMemo } from "react";

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function buildTip({ pendientes, seguimiento, cerradasMes }) {
  // Genera un consejo corto basado en reglas simples
  const p = safeNum(pendientes);
  const s = safeNum(seguimiento);
  const c = safeNum(cerradasMes);

  if (p >= 12) {
    return "Tienes muchas pendientes. Prioriza las más antiguas y responde primero las que tengan mayor valor o urgencia.";
  }

  if (p >= 6) {
    return "Buen momento para acelerar respuestas. Cierra primero las pendientes y luego haz seguimiento a las que están en gestión.";
  }

  if (p >= 1 && s >= 6) {
    return "Vas bien con nuevas solicitudes. Enfócate en seguimiento para convertir las cotizaciones en cierres.";
  }

  if (p === 0 && s > 0) {
    return "Todo al día en nuevas solicitudes. Haz seguimiento a las cotizaciones en gestión para cerrar más rápido.";
  }

  if (p === 0 && s === 0 && c === 0) {
    return "Aún no hay cierres este mes. Revisa el mensaje de respuesta y agrega un llamado a la acción claro para impulsar conversiones.";
  }

  if (p === 0 && s === 0 && c > 0) {
    return "Buen control. Mantén la sincronización activa y revisa nuevas solicitudes con frecuencia para no dejar pendientes.";
  }

  return "Mantén el ritmo: responde a tiempo, registra observaciones y da seguimiento para mejorar el cierre de cotizaciones.";
}

export default function ResponseTipCard({
  pendientes = 0,
  seguimiento = 0,
  cerradasMes = 0,
  title = "Mejora tu respuesta",
}) {
  // Calcula el texto del consejo en base a métricas
  const tip = useMemo(() => {
    return buildTip({ pendientes, seguimiento, cerradasMes });
  }, [pendientes, seguimiento, cerradasMes]);

  return (
    <div className="dashboard-card dashboard-card--tip">
      <h3 className="dashboard-tip-title">
        <span
          style={{
            marginRight: 6,
            display: "inline-flex",
            verticalAlign: "middle",
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M12 4.5a4.5 4.5 0 0 1 3.4 7.5c-.7.7-1.1 1.4-1.3 2.1h-4.2c-.2-.7-.6-1.4-1.3-2.1A4.5 4.5 0 0 1 12 4.5Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M10.4 17.5h3.2V19a1.6 1.6 0 0 1-1.6 1.6A1.6 1.6 0 0 1 10.4 19Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </span>
        <span>{title}</span>
      </h3>

      <p className="dashboard-tip-text">{tip}</p>
    </div>
  );
}
