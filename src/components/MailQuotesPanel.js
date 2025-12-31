import React, { useEffect, useRef, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

function MailQuotesPanel() {
  // Estado de datos
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  // Estado de carga / error
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Filtros
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("PENDIENTE");

  // Drawer responder
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyClosing, setReplyClosing] = useState(false);
  const [replyQuote, setReplyQuote] = useState(null);
  const [replySubject, setReplySubject] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replyError, setReplyError] = useState("");
  const [isReplySending, setIsReplySending] = useState(false);

  const replyTextRef = useRef(null);
  const closeTimerRef = useRef(null);

  function getToken() {
    // Lee token de sesión
    try {
      return window.localStorage.getItem("cubicaMail_token") || "";
    } catch {
      return "";
    }
  }

  function clearSession() {
    // Limpia sesión
    try {
      window.localStorage.removeItem("cubicaMail_token");
      window.localStorage.removeItem("cubicaMail_refresh");
      window.localStorage.removeItem("cubicaMail_usuario");
    } catch {}
  }

  function escapeHtml(s) {
    // Escapa texto para HTML básico
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function textToHtml(s) {
    // Convierte texto con saltos de línea a HTML simple
    const safe = escapeHtml(s);
    return safe.replaceAll("\n", "<br/>");
  }

  function buildGmailUrl(q) {
    // Construye un link a Gmail usando threadId o messageId
    const threadId = q?.emailThreadId || q?.threadId || "";
    const messageId = q?.emailMessageId || q?.messageId || "";

    if (threadId) return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
    if (messageId) return `https://mail.google.com/mail/u/0/#all/${messageId}`;
    return "";
  }

  function openInGmail(q) {
    // Abre el correo en Gmail en una pestaña nueva
    const url = buildGmailUrl(q);
    if (!url) {
      setError("Esta cotización no tiene referencia de Gmail (threadId/messageId).");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function defaultReplySubject(q) {
    // Construye asunto por defecto
    const s = String(q?.asunto || q?.subject || "").trim();
    if (!s) return "Re: Cotización";
    if (/^re:/i.test(s)) return s;
    return `Re: ${s}`;
  }

  function openReplyDrawer(q, ev) {
    // Abre drawer de respuesta
    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();

    setReplyError("");
    setError("");

    if (!API_BASE_URL) {
      setError("No se ha configurado la URL del backend.");
      return;
    }

    const token = getToken();
    if (!token) {
      setError("Sesión no encontrada. Inicia sesión nuevamente.");
      return;
    }

    const id = q?.id || q?._id;
    if (!id) {
      setError("No se encontró el id de la cotización.");
      return;
    }

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setReplyClosing(false);
    setReplyQuote(q);
    setReplySubject(defaultReplySubject(q));
    setReplyCc("");
    setReplyText("");
    setReplyOpen(true);
  }

  function hardCloseReplyDrawer() {
    // Cierra drawer y limpia estado
    setReplyOpen(false);
    setReplyClosing(false);
    setReplyQuote(null);
    setReplySubject("");
    setReplyCc("");
    setReplyText("");
    setReplyError("");
  }

  function closeReplyDrawer() {
    // Cierre con animación
    if (isReplySending) return;
    if (!replyOpen) return;
    if (replyClosing) return;

    setReplyClosing(true);

    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      hardCloseReplyDrawer();
      closeTimerRef.current = null;
    }, 170);
  }

  async function sendReply() {
    // Envía respuesta al backend
    if (!replyQuote) return;

    const token = getToken();
    if (!token) {
      setReplyError("Sesión no encontrada. Inicia sesión nuevamente.");
      return;
    }

    const id = replyQuote?.id || replyQuote?._id;
    if (!id) {
      setReplyError("No se encontró el id de la cotización.");
      return;
    }

    const asunto = String(replySubject || "").trim();
    const mensajeTexto = String(replyText || "").trim();

    if (!asunto) {
      setReplyError("El asunto es obligatorio.");
      return;
    }

    if (!mensajeTexto) {
      setReplyError("El mensaje es obligatorio.");
      return;
    }

    const cc = String(replyCc || "").trim();
    const mensajeHtml = textToHtml(mensajeTexto);

    setIsReplySending(true);
    setReplyError("");

    try {
      const res = await fetch(`${API_BASE_URL}/cotizaciones/${id}/responder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          asunto,
          cc: cc || undefined,
          mensajeTexto,
          mensajeHtml,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        setReplyError("Autenticación requerida. Vuelve a iniciar sesión.");
        clearSession();
        return;
      }

      if (!res.ok || (data && data.ok === false)) {
        const msg = data && (data.message || data.error || data.msg || data.details);
        setReplyError(msg || `Error ${res.status} al enviar la respuesta.`);
        return;
      }

      closeReplyDrawer();
      await fetchQuotes();
    } catch (err) {
      console.error("Error responder cotización:", err);
      setReplyError("No fue posible conectar con el servidor.");
    } finally {
      setIsReplySending(false);
    }
  }

  // Carga de cotizaciones desde el backend
  const fetchQuotes = async () => {
    if (!API_BASE_URL) {
      setError("No se ha configurado la URL del backend.");
      return;
    }

    const token = getToken();
    if (!token) {
      setError("Sesión no encontrada. Inicia sesión nuevamente.");
      return;
    }

    try {
      setIsLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (search.trim()) params.append("q", search.trim());
      if (status !== "todos") params.append("estado", status);

      const response = await fetch(`${API_BASE_URL}/cotizaciones?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        setError("Autenticación requerida. Vuelve a iniciar sesión.");
        clearSession();
        setItems([]);
        setTotal(0);
        return;
      }

      if (!response.ok) {
        const msg = data && (data.message || data.error || data.msg || data.details);
        setError(msg || `Error ${response.status} al cargar cotizaciones.`);
        setItems([]);
        setTotal(0);
        return;
      }

      const payload = data?.data || {};
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      const nextTotal = typeof payload.total === "number" ? payload.total : nextItems.length;

      setItems(nextItems);
      setTotal(nextTotal);
    } catch (err) {
      console.error("Error fetch cotizaciones:", err);
      setError("No fue posible conectar con el servidor.");
      setItems([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  // Cargar al inicio y cuando cambie el estado
  useEffect(() => {
    fetchQuotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Focus y cierre por ESC cuando abre el drawer
  useEffect(() => {
    if (!replyOpen) return;

    const t = setTimeout(() => {
      try {
        replyTextRef.current && replyTextRef.current.focus();
      } catch {}
    }, 80);

    const onKeyDown = (e) => {
      if (e.key === "Escape") closeReplyDrawer();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyOpen]);

  // Limpieza de timers
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // Enviar búsqueda manualmente (Enter en el input)
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchQuotes();
  };

  // Formato simple de fecha/hora
  const formatDateTime = (s) => {
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
      return s;
    }
  };

  const rowIsClickable = (q) => Boolean(buildGmailUrl(q));

  const handleRowKeyDown = (e, q) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openInGmail(q);
    }
  };

  return (
    <section className="mq-panel">
      <header className="mq-header">
        <form className="mq-filters" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            className="mq-search"
            placeholder="Buscar por cliente, asunto o código"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select className="mq-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="todos">Todos los estados</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="EN_GESTION">En gestión</option>
            <option value="RESPONDIDA">Respondida</option>
            <option value="VENCIDA">Vencida</option>
          </select>
        </form>
      </header>

      <div className="mq-body">
        {isLoading && <p className="mq-info">Cargando cotizaciones…</p>}
        {error && !isLoading && <p className="mq-error">{error}</p>}

        {!isLoading && !error && items.length === 0 && (
          <p className="mq-info">No hay cotizaciones con los filtros actuales.</p>
        )}

        {!isLoading && !error && items.length > 0 && (
          <>
            <p className="mq-summary">Total cotizaciones: {total || items.length}</p>

            <div className="mq-table-wrap">
              <table className="mq-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Asunto</th>
                    <th>Estado</th>
                    <th>Origen</th>
                    <th>Total</th>
                    <th style={{ width: 150 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((q) => {
                    const clickable = rowIsClickable(q);
                    const key = q.id || q._id;

                    return (
                      <tr
                        key={key}
                        className={clickable ? "mq-row-click" : ""}
                        title={clickable ? "Abrir este correo en Gmail" : "Sin referencia de Gmail"}
                        onClick={clickable ? () => openInGmail(q) : undefined}
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : -1}
                        onKeyDown={clickable ? (e) => handleRowKeyDown(e, q) : undefined}
                      >
                        <td>{formatDateTime(q.recibidaEn || q.createdAt)}</td>
                        <td>{q.remitenteNombre || q.clienteNombre || q.remitenteEmail || "-"}</td>
                        <td>{q.asunto || q.subject || "-"}</td>
                        <td>{q.estado || "—"}</td>
                        <td>{q.origen || q.source || "GMAIL"}</td>
                        <td>
                          {typeof q.total === "number"
                            ? q.total.toLocaleString("es-CO", { style: "currency", currency: "COP" })
                            : "—"}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="mq-actions">
                            <button
                              type="button"
                              className="users-btn users-btn-ghost"
                              onClick={(e) => openReplyDrawer(q, e)}
                              disabled={isLoading}
                            >
                              Responder
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {replyOpen ? (
        <div
          className={`mq-reply-overlay ${replyClosing ? "is-closing" : ""}`}
          onClick={closeReplyDrawer}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`mq-reply-drawer ${replyClosing ? "is-closing" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="users-modal-head mq-reply-head">
              <div className="users-modal-title">Responder cotización</div>

              <div className="mq-reply-head-actions">
                <button
                  type="button"
                  className="users-btn users-btn-ghost"
                  onClick={closeReplyDrawer}
                  disabled={isReplySending || replyClosing}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="mq-reply-body">
              <div className="users-grid">
                <div className="users-row" style={{ gridColumn: "1 / -1" }}>
                  <label className="users-label">Para</label>
                  <input
                    className="users-input"
                    value={String(
                      replyQuote?.remitenteEmail || replyQuote?.fromEmail || replyQuote?.email || ""
                    )}
                    readOnly
                  />
                </div>

                <div className="users-row" style={{ gridColumn: "1 / -1" }}>
                  <label className="users-label">CC</label>
                  <input
                    className="users-input"
                    value={replyCc}
                    onChange={(e) => setReplyCc(e.target.value)}
                    placeholder="Opcional"
                    disabled={isReplySending || replyClosing}
                  />
                </div>

                <div className="users-row" style={{ gridColumn: "1 / -1" }}>
                  <label className="users-label">Asunto</label>
                  <input
                    className="users-input"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    disabled={isReplySending || replyClosing}
                  />
                </div>

                <div className="users-row" style={{ gridColumn: "1 / -1" }}>
                  <label className="users-label">Mensaje</label>
                  <textarea
                    ref={replyTextRef}
                    className="users-input mq-reply-textarea"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escribe tu respuesta"
                    disabled={isReplySending || replyClosing}
                  />
                </div>
              </div>

              {replyError ? <p className="email-sync-error">{replyError}</p> : null}
            </div>

            <div className="users-modal-foot mq-reply-foot">
              <button
                type="button"
                className="users-btn users-btn-ghost"
                onClick={closeReplyDrawer}
                disabled={isReplySending || replyClosing}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="email-sync-btn"
                onClick={sendReply}
                disabled={isReplySending || replyClosing}
              >
                {isReplySending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default MailQuotesPanel;
