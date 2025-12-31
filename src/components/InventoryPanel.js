import React, { useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

async function apiRequest(method, path, body) {
  /* Request con auth y manejo básico de errores */
  const token = window.localStorage.getItem("cubicaMail_token");
  if (!token) return { ok: false, status: 401, message: "No hay sesión activa." };

  const headers = { Authorization: `Bearer ${token}` };
  if (method !== "GET") headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
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
    return { ok: false, status: res.status, message: msg || `Error ${res.status}`, data };
  }

  return { ok: true, status: res.status, data };
}

function toDateSafe(input) {
  /* Parse seguro de fechas */
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function pad2(n) {
  /* Padding simple */
  return n < 10 ? `0${n}` : String(n);
}

function fmtDateTimeCOShort(input) {
  /* Formato corto dd/MM/yyyy HH:mm */
  const d = toDateSafe(input);
  if (!d) return "";
  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  return `${day}/${month}/${year} ${hh}:${mm}`;
}

function buildQuery(params) {
  /* Serializa query params ignorando vacíos */
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    const s = String(v).trim();
    if (!s) return;
    q.set(k, s);
  });
  const out = q.toString();
  return out ? `?${out}` : "";
}

function InventoryPanel({ isAdmin }) {
  /* Estado principal del módulo */
  const [tab, setTab] = useState("stock"); // stock | items | bodegas | alertas | movimientos
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  /* Modales */
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [showCreateMove, setShowCreateMove] = useState(false);
  const [showEditItem, setShowEditItem] = useState(false);

  const [showCreateWarehouse, setShowCreateWarehouse] = useState(false);
  const [showEditWarehouse, setShowEditWarehouse] = useState(false);
  const [showPurgeWarehouse, setShowPurgeWarehouse] = useState(false);

  const [showTransfer, setShowTransfer] = useState(false);

  /* Filtros */
  const [q, setQ] = useState("");
  const [stockCategory, setStockCategory] = useState("");
  const [itemsCategory, setItemsCategory] = useState("");

  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");

  /* Respuestas */
  const [itemsResp, setItemsResp] = useState(null);
  const [stockResp, setStockResp] = useState(null);
  const [alertsResp, setAlertsResp] = useState(null);
  const [movesResp, setMovesResp] = useState(null);
  const [warehousesResp, setWarehousesResp] = useState(null);

  /* Formularios admin */
  const [newItem, setNewItem] = useState({
    name: "",
    category: "",
    unit: "und",
    min_stock: 0,
    warehouseId: "",
    initialQty: 0,
  });

  const [newMove, setNewMove] = useState({
    itemId: "",
    warehouseId: "",
    type: "IN",
    qty: 0,
    to: 0,
    note: "",
  });

  const [transferForm, setTransferForm] = useState({
    itemId: "",
    fromWarehouseId: "",
    toWarehouseId: "",
    qty: 0,
    note: "",
  });

  const [editItem, setEditItem] = useState({
    _id: "",
    name: "",
    category: "",
    unit: "",
    min_stock: 0,
    active: true,
  });

  const [newWarehouse, setNewWarehouse] = useState({
    name: "",
    code: "",
    description: "",
    active: true,
  });

  const [editWarehouse, setEditWarehouse] = useState({
    _id: "",
    name: "",
    code: "",
    description: "",
    active: true,
  });

  const [purgeWarehouse, setPurgeWarehouse] = useState({
    _id: "",
    name: "",
    reassignToWarehouseId: "",
  });

  useEffect(() => {
    /* Cierra modales con Escape */
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      setShowCreateItem(false);
      setShowCreateMove(false);
      setShowEditItem(false);
      setShowCreateWarehouse(false);
      setShowEditWarehouse(false);
      setShowPurgeWarehouse(false);
      setShowTransfer(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function fmtMoveType(input) {
    /* Traduce tipo de movimiento para UI */
    const t = String(input || "").toUpperCase();
    if (t === "IN") return "Entrada";
    if (t === "OUT") return "Salida";
    if (t === "ADJUST") return "Ajuste";
    return t || "";
  }

  function getRespItems(resp) {
    /* Extrae arrays de distintas formas de respuesta */
    const a = resp?.data?.data?.items;
    if (Array.isArray(a)) return a;
    const b = resp?.data?.items;
    if (Array.isArray(b)) return b;
    const c = resp?.data?.data;
    if (Array.isArray(c)) return c;
    return [];
  }

  function normalizeStockRow(r) {
    /* Normaliza fila de stock para soportar diferentes shapes */
    const item = r?.item || r?.inventoryItem || r?.producto || r?.data || null;

    const id = r?._id || r?.itemId || item?._id || item?.id || r?.id || "";
    const name = r?.name || item?.name || "";
    const category = r?.category || item?.category || "";

    const minStockRaw =
      r?.min_stock ?? r?.minStock ?? item?.min_stock ?? item?.minStock ?? 0;

    const stockRaw =
      r?.stock ??
      r?.current_stock ??
      r?.currentStock ??
      r?.on_hand ??
      r?.onHand ??
      r?.available ??
      r?.qty ??
      r?.balance ??
      r?.existencia ??
      0;

    return {
      _id: String(id || ""),
      name: String(name || ""),
      category: String(category || ""),
      min_stock: Number(minStockRaw || 0),
      stock: Number(stockRaw || 0),
    };
  }

  function getAlertStock(r) {
    /* Lee stock de alerta con compatibilidad */
    const n =
      r?.stock ??
      r?.current_stock ??
      r?.currentStock ??
      r?.on_hand ??
      r?.onHand ??
      r?.available ??
      r?.qty ??
      0;
    return Number(n || 0);
  }

  const warehousesRows = useMemo(() => {
    /* Bodegas desde endpoint /warehouses */
    const raw = getRespItems(warehousesResp);
    return raw.map((w) => ({
      _id: String(w?._id || ""),
      name: String(w?.name || ""),
      code: String(w?.code || ""),
      description:
        w?.description === null || w?.description === undefined ? "" : String(w.description || ""),
      active: Boolean(w?.active),
    }));
  }, [warehousesResp]);

  const activeWarehouses = useMemo(() => {
    /* Lista de bodegas activas */
    return warehousesRows.filter((w) => w.active);
  }, [warehousesRows]);

  const selectedWarehouse = useMemo(() => {
    /* Bodega seleccionada */
    const id = String(selectedWarehouseId || "").trim();
    if (!id) return null;
    return warehousesRows.find((w) => String(w._id) === id) || null;
  }, [warehousesRows, selectedWarehouseId]);

  const itemsRows = useMemo(() => {
    /* Items desde endpoint de items */
    return getRespItems(itemsResp);
  }, [itemsResp]);

  const stockRows = useMemo(() => {
    /* Stock desde endpoint de stock */
    const raw = getRespItems(stockResp);
    return raw.map(normalizeStockRow);
  }, [stockResp]);

  const stockCategories = useMemo(() => {
    /* Categorías disponibles para filtro de Stock */
    const set = new Set();
    for (const it of stockRows) {
      const c = String(it?.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [stockRows]);

  const visibleStockRows = useMemo(() => {
    /* Stock filtrado: bodega seleccionada solo muestra stock > 0 y filtra por categoría */
    const wid = String(selectedWarehouseId || "").trim();
    const cat = String(stockCategory || "").trim();

    let rows = stockRows;

    if (wid) rows = rows.filter((it) => Number(it?.stock || 0) > 0);
    if (cat) rows = rows.filter((it) => String(it?.category || "").trim() === cat);

    return rows;
  }, [stockRows, stockCategory, selectedWarehouseId]);

  const itemsCategories = useMemo(() => {
    /* Categorías disponibles para filtro de Items */
    const set = new Set();
    for (const it of itemsRows) {
      const c = String(it?.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [itemsRows]);

  const itemIdsWithPositiveStockInWarehouse = useMemo(() => {
    /* IDs de items con stock > 0 en la bodega seleccionada */
    const wid = String(selectedWarehouseId || "").trim();
    if (!wid) return null;

    const set = new Set();
    for (const r of stockRows) {
      const id = String(r?._id || "").trim();
      if (!id) continue;
      if (Number(r?.stock || 0) > 0) set.add(id);
    }
    return set;
  }, [stockRows, selectedWarehouseId]);

  const visibleItemsRows = useMemo(() => {
    /* Items filtrados por bodega (stock > 0) y categoría */
    const cat = String(itemsCategory || "").trim();
    let rows = itemsRows;

    if (itemIdsWithPositiveStockInWarehouse) {
      rows = rows.filter((it) => itemIdsWithPositiveStockInWarehouse.has(String(it?._id || "")));
    }

    if (cat) rows = rows.filter((it) => String(it?.category || "").trim() === cat);

    return rows;
  }, [itemsRows, itemsCategory, itemIdsWithPositiveStockInWarehouse]);

  const alertsRows = useMemo(() => {
    /* Alertas desde endpoint de low-stock */
    const raw = getRespItems(alertsResp);
    const wid = String(selectedWarehouseId || "").trim();

    if (!wid) return raw;

    /* En bodega, solo mostrar alertas de items con stock > 0 en esa bodega */
    return raw.filter((r) => getAlertStock(r) > 0);
  }, [alertsResp, selectedWarehouseId]);

  const movesRows = useMemo(() => {
    /* Movimientos desde endpoint de moves */
    return getRespItems(movesResp);
  }, [movesResp]);

  const itemOptions = useMemo(() => {
    /* Opciones para select del modal de movimiento */
    if (itemsRows.length) return itemsRows;
    return stockRows.map((s) => ({
      _id: s._id,
      name: s.name,
      category: s.category,
    }));
  }, [itemsRows, stockRows]);

  const alertsCount = useMemo(() => {
    /* Conteo para badge de alertas */
    const n = alertsRows.length;
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }, [alertsRows]);

  function pickDefaultWarehouseId(list) {
    /* Escoge bodega por defecto si no hay selección */
    const active = (list || []).find((w) => w.active);
    if (active?._id) return String(active._id);
    const any = (list || [])[0];
    if (any?._id) return String(any._id);
    return "";
  }

  async function loadWarehouses({ silent } = {}) {
    /* Carga bodegas y retorna el id por defecto */
    if (!API_BASE_URL) return "";

    if (!silent) {
      setLoading(true);
      setErrorMsg("");
    }

    try {
      const r = await apiRequest("GET", "/warehouses?limit=200&sort=name:asc");
      if (!r.ok) throw new Error(r.message || "No fue posible cargar bodegas");
      setWarehousesResp(r);

      const list = getRespItems(r);
      const nextDefault = pickDefaultWarehouseId(
        (list || []).map((w) => ({
          _id: w?._id,
          active: Boolean(w?.active),
        }))
      );

      let selected = "";
      setSelectedWarehouseId((prev) => {
        const current = String(prev || "").trim();
        if (current) {
          selected = current;
          return current;
        }
        selected = nextDefault;
        return nextDefault;
      });

      return selected || nextDefault || "";
    } catch (e) {
      setErrorMsg(String(e?.message || "Error cargando bodegas"));
      return "";
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function openMoveModalForItem(itemId) {
    /* Abre modal de movimiento y precarga el item */
    if (!isAdmin) {
      setErrorMsg("No tienes permisos para realizar esta acción");
      return;
    }

    const wid = String(selectedWarehouseId || "").trim() || pickDefaultWarehouseId(warehousesRows);

    setErrorMsg("");
    setNewMove({
      itemId: String(itemId || ""),
      warehouseId: wid,
      type: "IN",
      qty: 0,
      to: 0,
      note: "",
    });
    setShowCreateMove(true);
  }

  function openTransferModalForItem(itemId) {
    /* Abre modal de transferencia y precarga item/bodegas */
    if (!isAdmin) {
      setErrorMsg("No tienes permisos para realizar esta acción");
      return;
    }

    const fromId =
      String(selectedWarehouseId || "").trim() || pickDefaultWarehouseId(warehousesRows);

    const toId =
      activeWarehouses.find((w) => String(w._id) !== String(fromId))?._id || "";

    setErrorMsg("");
    setTransferForm({
      itemId: String(itemId || ""),
      fromWarehouseId: String(fromId || ""),
      toWarehouseId: String(toId || ""),
      qty: 0,
      note: "",
    });
    setShowTransfer(true);
  }

  function openEditItemModal(item) {
    /* Abre modal de edición y precarga el item */
    if (!item?._id) return;
    setErrorMsg("");

    setEditItem({
      _id: String(item._id),
      name: String(item.name || ""),
      category: String(item.category || ""),
      unit: String(item.unit || ""),
      min_stock: Number(item.min_stock || 0),
      active: Boolean(item.active),
    });

    setShowEditItem(true);
  }

  function openEditWarehouseModal(w) {
    /* Abre modal de edición y precarga la bodega */
    if (!w?._id) return;
    setErrorMsg("");

    setEditWarehouse({
      _id: String(w._id),
      name: String(w.name || ""),
      code: String(w.code || ""),
      description:
        w.description === null || w.description === undefined ? "" : String(w.description || ""),
      active: Boolean(w.active),
    });

    setShowEditWarehouse(true);
  }

  function openPurgeWarehouseModal(w) {
    /* Abre modal de eliminación definitiva y define destino */
    if (!w?._id) return;
    if (!isAdmin) {
      setErrorMsg("No tienes permisos para realizar esta acción");
      return;
    }

    const id = String(w._id);
    const reassignTo =
      activeWarehouses.find((x) => String(x._id) !== id)?._id || "";

    setErrorMsg("");
    setPurgeWarehouse({
      _id: id,
      name: String(w.name || ""),
      reassignToWarehouseId: String(reassignTo || ""),
    });

    setShowPurgeWarehouse(true);
  }

  async function refreshAlertsSilently(warehouseIdOverride) {
    /* Actualiza alertas para badge sin bloquear UI */
    if (!API_BASE_URL) return;
    try {
      const wid = String(warehouseIdOverride || selectedWarehouseId || "").trim() || null;
      const qs = buildQuery({
        q: q || null,
        category: stockCategory || null,
        warehouseId: wid,
      });
      const r = await apiRequest("GET", `/inventory/alerts/low-stock${qs}`);
      if (r.ok) setAlertsResp(r);
    } catch (e) {
      /* Silencioso */
    }
  }

  async function loadInventoryData(activeTab, opts = {}) {
    /* Carga datos según pestaña activa */
    if (!API_BASE_URL) return;

    const wid = String(opts.warehouseIdOverride || selectedWarehouseId || "").trim() || null;

    setLoading(true);
    setErrorMsg("");

    try {
      if (activeTab === "items") {
        const qs = buildQuery({
          q: q || null,
          page: 1,
          limit: 50,
        });
        const r = await apiRequest("GET", `/inventory/items${qs}`);
        if (!r.ok) throw new Error(r.message || "No fue posible cargar items");
        setItemsResp(r);

        /* Precarga stock de la bodega para filtrar items por bodega */
        if (wid) {
          const qsStock = buildQuery({
            q: q || null,
            warehouseId: wid,
          });
          const rs = await apiRequest("GET", `/inventory/stock${qsStock}`);
          if (rs.ok) setStockResp(rs);
        }
      }

      if (activeTab === "stock") {
        const qs = buildQuery({
          q: q || null,
          category: stockCategory || null,
          warehouseId: wid,
        });
        const r = await apiRequest("GET", `/inventory/stock${qs}`);
        if (!r.ok) throw new Error(r.message || "No fue posible cargar stock");
        setStockResp(r);
      }

      if (activeTab === "alertas") {
        const qs = buildQuery({
          q: q || null,
          category: stockCategory || null,
          warehouseId: wid,
        });
        const r = await apiRequest("GET", `/inventory/alerts/low-stock${qs}`);
        if (!r.ok) throw new Error(r.message || "No fue posible cargar alertas");
        setAlertsResp(r);
      }

      if (activeTab === "movimientos") {
        const qs = buildQuery({
          page: 1,
          limit: 50,
          warehouseId: wid,
        });
        const r = await apiRequest("GET", `/inventory/moves${qs}`);
        if (!r.ok) throw new Error(r.message || "No fue posible cargar movimientos");
        setMovesResp(r);
      }

      if (activeTab === "bodegas") {
        await loadWarehouses({ silent: true });
      }
    } catch (e) {
      setErrorMsg(String(e?.message || "Error cargando inventario"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    /* Carga inicial con bodega por defecto */
    let mounted = true;

    (async () => {
      const wid = await loadWarehouses({ silent: true });
      if (!mounted) return;

      await loadInventoryData(tab, { warehouseIdOverride: wid });
      await refreshAlertsSilently(wid);
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    /* Carga al cambiar pestaña */
    loadInventoryData(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    /* Refresca datos dependientes de bodega */
    if (!selectedWarehouseId) return;
    if (tab === "stock" || tab === "alertas" || tab === "movimientos" || tab === "items") {
      loadInventoryData(tab);
      refreshAlertsSilently();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouseId]);

  const handleRefresh = async () => {
    /* Refresca pestaña y badge de alertas */
    await loadInventoryData(tab);
    refreshAlertsSilently();
    if (tab === "bodegas") await loadWarehouses();
  };

  const handleApplyFilters = async () => {
    /* Aplica filtros server-side por q y filtros locales */
    await loadInventoryData(tab);
    refreshAlertsSilently();
  };

  function pickCreatedItemId(resp) {
    /* Extrae id del item creado */
    const a = resp?.data?.data?.item?._id;
    if (a) return String(a);
    const b = resp?.data?.item?._id;
    if (b) return String(b);
    const c = resp?.data?.data?._id;
    if (c) return String(c);
    return "";
  }

  async function handleCreateItem(e) {
    /* Crea un item (solo admin) y opcionalmente registra stock inicial en una bodega */
    e.preventDefault();
    if (!isAdmin) return;

    const payload = {
      name: String(newItem.name || "").trim(),
      category: String(newItem.category || "").trim() || null,
      unit: String(newItem.unit || "").trim() || null,
      min_stock: Number(newItem.min_stock || 0),
      active: true,
    };

    const wid = String(newItem.warehouseId || "").trim();
    const initialQty = Number(newItem.initialQty || 0);

    if (!payload.name) {
      setErrorMsg("El nombre del item es requerido");
      return;
    }

    if (!Number.isFinite(payload.min_stock) || payload.min_stock < 0) {
      setErrorMsg("El stock mínimo debe ser >= 0");
      return;
    }

    if (wid && (!Number.isFinite(initialQty) || initialQty < 0)) {
      setErrorMsg("El stock inicial debe ser >= 0");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const r = await apiRequest("POST", "/inventory/items", payload);
      if (!r.ok) throw new Error(r.message || "No fue posible crear el item");

      const createdId = pickCreatedItemId(r);

      if (wid && initialQty > 0 && createdId) {
        const movePayload = {
          itemId: createdId,
          warehouseId: wid,
          type: "IN",
          qty: initialQty,
          note: "Stock inicial",
        };

        const m = await apiRequest("POST", "/inventory/moves", movePayload);
        if (!m.ok) throw new Error(m.message || "No fue posible registrar el stock inicial");
      }

      const defaultWid = String(selectedWarehouseId || "").trim() || wid || "";

      setNewItem({
        name: "",
        category: "",
        unit: "und",
        min_stock: 0,
        warehouseId: defaultWid,
        initialQty: 0,
      });

      setShowCreateItem(false);

      await loadInventoryData("items");
      await loadInventoryData("stock");
      await loadInventoryData("alertas");
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error creando item"));
    } finally {
      setLoading(false);
      refreshAlertsSilently();
    }
  }

  async function handleDeleteItem(item) {
    /* Elimina definitivamente un item si no tiene movimientos; si tiene, ofrece desactivar */
    if (!isAdmin) return;

    const id = String(item?._id || "").trim();
    if (!id) return;

    const name = String(item?.name || "").trim();
    const ok = window.confirm(
      `Eliminar definitivamente el item${name ? ` "${name}"` : ""}.\n\nSolo se permite si no tiene movimientos.`
    );
    if (!ok) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const r = await apiRequest("DELETE", `/inventory/items/${id}/purge`);
      if (!r.ok) {
        const isHasMoves =
          r.status === 409 ||
          String(r?.data?.error || "").toUpperCase() === "ITEM_HAS_MOVES" ||
          String(r?.data?.data?.error || "").toUpperCase() === "ITEM_HAS_MOVES" ||
          String(r?.message || "").toUpperCase().includes("MOVIM");

        if (isHasMoves) {
          const doDeactivate = window.confirm(
            "No se puede eliminar porque el item tiene movimientos.\n\n¿Deseas desactivarlo en su lugar?"
          );

          if (!doDeactivate) {
            setErrorMsg("No se eliminó el item. Tiene movimientos.");
            return;
          }

          const d = await apiRequest("DELETE", `/inventory/items/${id}`);
          if (!d.ok) throw new Error(d.message || "No fue posible desactivar el item");

          await loadInventoryData("items");
          await loadInventoryData("stock");
          await loadInventoryData("alertas");
          return;
        }

        throw new Error(r.message || "No fue posible eliminar el item");
      }

      await loadInventoryData("items");
      await loadInventoryData("stock");
      await loadInventoryData("alertas");
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error eliminando item"));
    } finally {
      setLoading(false);
      refreshAlertsSilently();
    }
  }

  async function handleUpdateItem(e) {
    /* Actualiza un item (solo admin) */
    e.preventDefault();
    if (!isAdmin) return;

    const id = String(editItem._id || "").trim();
    if (!id) return;

    const payload = {
      name: String(editItem.name || "").trim(),
      category: String(editItem.category || "").trim() || null,
      unit: String(editItem.unit || "").trim() || null,
      min_stock: Number(editItem.min_stock || 0),
      active: Boolean(editItem.active),
    };

    if (!payload.name) {
      setErrorMsg("El nombre del item es requerido");
      return;
    }

    if (!Number.isFinite(payload.min_stock) || payload.min_stock < 0) {
      setErrorMsg("El stock mínimo debe ser >= 0");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const r = await apiRequest("PUT", `/inventory/items/${id}`, payload);
      if (!r.ok) throw new Error(r.message || "No fue posible actualizar el item");

      setShowEditItem(false);

      await loadInventoryData("items");
      await loadInventoryData("stock");
      await loadInventoryData("alertas");
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error actualizando item"));
    } finally {
      setLoading(false);
      refreshAlertsSilently();
    }
  }

  async function handleCreateMove(e) {
    /* Crea un movimiento (solo admin) */
    e.preventDefault();
    if (!isAdmin) return;

    const type = String(newMove.type || "").toUpperCase().trim();
    const payload = {
      itemId: String(newMove.itemId || "").trim(),
      warehouseId: String(newMove.warehouseId || "").trim(),
      type,
      note: String(newMove.note || "").trim() || null,
    };

    if (!payload.itemId) {
      setErrorMsg("Selecciona un item");
      return;
    }

    if (!payload.warehouseId) {
      setErrorMsg("Selecciona una bodega");
      return;
    }

    if (type === "ADJUST") {
      payload.to = Number(newMove.to);
      if (!Number.isFinite(payload.to) || payload.to < 0) {
        setErrorMsg("El stock final (to) debe ser >= 0");
        return;
      }
    } else {
      payload.qty = Number(newMove.qty);
      if (!Number.isFinite(payload.qty) || payload.qty <= 0) {
        setErrorMsg("La cantidad debe ser mayor a 0");
        return;
      }
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const r = await apiRequest("POST", "/inventory/moves", payload);
      if (!r.ok) throw new Error(r.message || "No fue posible registrar el movimiento");

      setShowCreateMove(false);

      await loadInventoryData("stock");
      await loadInventoryData("alertas");
      await loadInventoryData("movimientos");
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error registrando movimiento"));
    } finally {
      setLoading(false);
      refreshAlertsSilently();
    }
  }

  async function handleCreateTransfer(e) {
    /* Crea transferencia entre bodegas (solo admin) */
    e.preventDefault();
    if (!isAdmin) return;

    const payload = {
      itemId: String(transferForm.itemId || "").trim(),
      fromWarehouseId: String(transferForm.fromWarehouseId || "").trim(),
      toWarehouseId: String(transferForm.toWarehouseId || "").trim(),
      qty: Number(transferForm.qty),
      note: String(transferForm.note || "").trim() || null,
    };

    if (!payload.itemId) {
      setErrorMsg("Selecciona un item");
      return;
    }
    if (!payload.fromWarehouseId) {
      setErrorMsg("Selecciona la bodega origen");
      return;
    }
    if (!payload.toWarehouseId) {
      setErrorMsg("Selecciona la bodega destino");
      return;
    }
    if (payload.fromWarehouseId === payload.toWarehouseId) {
      setErrorMsg("La bodega origen y destino no pueden ser la misma");
      return;
    }
    if (!Number.isFinite(payload.qty) || payload.qty <= 0) {
      setErrorMsg("La cantidad debe ser mayor a 0");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const r = await apiRequest("POST", "/inventory/transfers", payload);
      if (!r.ok) throw new Error(r.message || "No fue posible transferir el stock");

      setShowTransfer(false);

      await loadInventoryData("stock");
      await loadInventoryData("alertas");
      await loadInventoryData("movimientos");
      await loadInventoryData("items");
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error transfiriendo stock"));
    } finally {
      setLoading(false);
      refreshAlertsSilently();
    }
  }

  async function handleCreateWarehouse(e) {
    /* Crea bodega (solo admin) */
    e.preventDefault();
    if (!isAdmin) return;

    const payload = {
      name: String(newWarehouse.name || "").trim(),
      code: String(newWarehouse.code || "").trim().toUpperCase(),
      description: String(newWarehouse.description || "").trim() || null,
      active: Boolean(newWarehouse.active),
    };

    if (!payload.name) {
      setErrorMsg("El nombre de la bodega es requerido");
      return;
    }
    if (!payload.code) {
      setErrorMsg("El code de la bodega es requerido");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const r = await apiRequest("POST", "/warehouses", payload);
      if (!r.ok) throw new Error(r.message || "No fue posible crear la bodega");

      setNewWarehouse({ name: "", code: "", description: "", active: true });
      setShowCreateWarehouse(false);

      await loadWarehouses({ silent: true });
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error creando bodega"));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateWarehouse(e) {
    /* Actualiza bodega (solo admin) */
    e.preventDefault();
    if (!isAdmin) return;

    const id = String(editWarehouse._id || "").trim();
    if (!id) return;

    const payload = {
      name: String(editWarehouse.name || "").trim(),
      code: String(editWarehouse.code || "").trim().toUpperCase(),
      description: String(editWarehouse.description || "").trim() || null,
      active: Boolean(editWarehouse.active),
    };

    if (!payload.name) {
      setErrorMsg("El nombre de la bodega es requerido");
      return;
    }
    if (!payload.code) {
      setErrorMsg("El code de la bodega es requerido");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const r = await apiRequest("PUT", `/warehouses/${id}`, payload);
      if (!r.ok) throw new Error(r.message || "No fue posible actualizar la bodega");

      setShowEditWarehouse(false);
      await loadWarehouses({ silent: true });
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error actualizando bodega"));
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleWarehouseActive(w) {
    /* Activa o desactiva bodega (solo admin) */
    if (!isAdmin) return;

    const id = String(w?._id || "").trim();
    if (!id) return;

    setLoading(true);
    setErrorMsg("");

    try {
      if (w.active) {
        const r = await apiRequest("DELETE", `/warehouses/${id}`);
        if (!r.ok) throw new Error(r.message || "No fue posible desactivar la bodega");
      } else {
        const r = await apiRequest("PUT", `/warehouses/${id}`, { active: true });
        if (!r.ok) throw new Error(r.message || "No fue posible activar la bodega");
      }

      await loadWarehouses({ silent: true });

      setSelectedWarehouseId((prev) => {
        const current = String(prev || "").trim();
        if (!current) return prev;

        const nextList = warehousesRows.map((x) => ({
          _id: x._id,
          active: String(x._id) === id ? !Boolean(w.active) : Boolean(x.active),
        }));

        const found = nextList.find((x) => String(x._id) === current);
        if (found && found.active) return current;

        return pickDefaultWarehouseId(nextList);
      });
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error actualizando bodega"));
    } finally {
      setLoading(false);
    }
  }

  async function handlePurgeWarehouse(e) {
    /* Elimina definitivamente bodega y reasigna movimientos (solo admin) */
    e.preventDefault();
    if (!isAdmin) return;

    const id = String(purgeWarehouse._id || "").trim();
    const reassignToWarehouseId = String(purgeWarehouse.reassignToWarehouseId || "").trim();

    if (!id) return;
    if (!reassignToWarehouseId) {
      setErrorMsg("Selecciona una bodega destino para reasignar los items");
      return;
    }
    if (id === reassignToWarehouseId) {
      setErrorMsg("La bodega destino no puede ser la misma");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const r = await apiRequest("DELETE", `/warehouses/${id}/purge`, {
        reassignToWarehouseId,
      });
      if (!r.ok) throw new Error(r.message || "No fue posible eliminar la bodega");

      setShowPurgeWarehouse(false);
      await loadWarehouses({ silent: true });

      setSelectedWarehouseId((prev) => {
        const current = String(prev || "").trim();
        if (current && current === id) return String(reassignToWarehouseId);
        return prev;
      });

      if (tab === "stock" || tab === "alertas" || tab === "movimientos" || tab === "items") {
        await loadInventoryData(tab);
        refreshAlertsSilently();
      }
    } catch (e2) {
      setErrorMsg(String(e2?.message || "Error eliminando bodega"));
    } finally {
      setLoading(false);
    }
  }

  if (!API_BASE_URL) {
    return (
      <div className="mq-alert mq-alert--danger">
        REACT_APP_API_BASE_URL no está configurado.
      </div>
    );
  }

  /* Estilos inline del modal */
  const modalOverlayStyle = {
    position: "fixed",
    inset: 0,
    background: "rgba(2, 6, 23, 0.55)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    display: "grid",
    placeItems: "center",
    padding: 16,
    zIndex: 2000,
  };

  const modalCardStyle = {
    width: "min(740px, 100%)",
    borderRadius: 16,
    background: "rgba(255, 255, 255, 0.92)",
    border: "1px solid rgba(209, 213, 219, 0.7)",
    boxShadow: "0 22px 60px rgba(15, 23, 42, 0.45)",
    overflow: "hidden",
  };

  const modalHeaderStyle = {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(209, 213, 219, 0.7)",
    display: "flex",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  };

  const modalBodyStyle = { padding: 14 };

  const modalFooterStyle = {
    padding: "12px 14px",
    borderTop: "1px solid rgba(209, 213, 219, 0.7)",
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    flexWrap: "wrap",
  };

  /* Tabs en una sola fila sin scroll */
  const tabsRowStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: 8,
    alignItems: "center",
    width: "100%",
  };

  const compactTabStyle = {
    width: "100%",
    minHeight: 36,
    padding: "9px 8px",
    fontSize: "0.74rem",
    borderRadius: 999,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    lineHeight: 1,
  };

  const badgeStyle = {
    position: "absolute",
    top: 3,
    right: 10,
    minWidth: 16,
    height: 16,
    padding: "0 5px",
    borderRadius: 999,
    background: "#ef4444",
    color: "#ffffff",
    fontSize: "0.70rem",
    lineHeight: "16px",
    fontWeight: 700,
    boxShadow: "0 8px 18px rgba(15, 23, 42, 0.35)",
    pointerEvents: "none",
  };

  /* Barra de herramientas */
  const toolbarStyle = {
    marginTop: 10,
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
  };

  const leftToolsStyle = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "flex-end",
  };

  const rightToolsStyle = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
  };

  const toolBtnStyle = { height: 40, padding: "0 14px", borderRadius: 12 };

  /* Tabla */
  const tableWrapStyle = {
    overflow: "auto",
    borderRadius: 14,
    border: "1px solid rgba(226, 232, 240, 0.85)",
    background: "rgba(255, 255, 255, 0.65)",
  };

  const tableStyle = { width: "100%", borderCollapse: "collapse" };

  const thCompact = {
    padding: "10px 10px",
    textAlign: "left",
    fontSize: "0.78rem",
    opacity: 0.85,
    whiteSpace: "nowrap",
  };

  const tdCompact = {
    padding: "10px 10px",
    fontSize: "0.86rem",
    borderTop: "1px solid rgba(226, 232, 240, 0.85)",
    verticalAlign: "middle",
  };

  /* Stock: columnas más compactas para evitar scroll horizontal */
  const stockTh = {
    ...thCompact,
    padding: "8px 8px",
    fontSize: "0.74rem",
  };

  const stockTd = {
    ...tdCompact,
    padding: "8px 8px",
    fontSize: "0.82rem",
  };

  const stockTdWrap = {
    ...stockTd,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };

  const stockTdNum = {
    ...stockTd,
    textAlign: "center",
    whiteSpace: "nowrap",
  };

  /* Stock sin scroll horizontal */
  const stockTableWrapStyle = {
    ...tableWrapStyle,
    overflowX: "hidden",
    overflowY: "auto",
  };

  const stockTableStyle = {
    ...tableStyle,
    tableLayout: "fixed",
    width: "100%",
    minWidth: 0,
  };

  const tdWrap = {
    ...tdCompact,
    whiteSpace: "normal",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  };

  const rowClickableStyle = { cursor: isAdmin ? "pointer" : "default" };

  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        position: "relative",
        zIndex: 0,
        marginBottom: 16,
      }}
    >
      <div style={tabsRowStyle}>
        <button
          type="button"
          title="Stock"
          className={tab === "stock" ? "dashboard-nav-item dashboard-nav-item--active" : "dashboard-nav-item"}
          style={compactTabStyle}
          onClick={() => setTab("stock")}
        >
          Stock
        </button>

        <button
          type="button"
          title="Items"
          className={tab === "items" ? "dashboard-nav-item dashboard-nav-item--active" : "dashboard-nav-item"}
          style={compactTabStyle}
          onClick={() => setTab("items")}
        >
          Items
        </button>

        <button
          type="button"
          title="Bodegas"
          className={tab === "bodegas" ? "dashboard-nav-item dashboard-nav-item--active" : "dashboard-nav-item"}
          style={compactTabStyle}
          onClick={() => setTab("bodegas")}
        >
          Bodegas
        </button>

        <button
          type="button"
          title="Alertas"
          className={tab === "alertas" ? "dashboard-nav-item dashboard-nav-item--active" : "dashboard-nav-item"}
          style={{ ...compactTabStyle, position: "relative" }}
          onClick={() => setTab("alertas")}
        >
          Alertas
          {alertsCount > 0 ? (
            <span style={badgeStyle}>{alertsCount > 99 ? "99+" : String(alertsCount)}</span>
          ) : null}
        </button>

        <button
          type="button"
          title="Movimientos"
          className={tab === "movimientos" ? "dashboard-nav-item dashboard-nav-item--active" : "dashboard-nav-item"}
          style={compactTabStyle}
          onClick={() => setTab("movimientos")}
        >
          Movimientos
        </button>
      </div>

      <div style={toolbarStyle}>
        <div style={leftToolsStyle}>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="dashboard-card-sub" style={{ margin: 0 }}>
              Búsqueda
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre o categoría"
              className="mq-search"
              style={{ minWidth: 320, height: 40 }}
            />
          </div>

          {(tab === "stock" || tab === "alertas" || tab === "movimientos" || tab === "items") ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div className="dashboard-card-sub" style={{ margin: 0 }}>
                Bodega
              </div>
              <select
                className="mq-search"
                style={{ height: 40, minWidth: 220 }}
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
              >
                <option value="">Selecciona una bodega</option>
                {warehousesRows.map((w) => (
                  <option key={w._id} value={w._id}>
                    {w.name} {w.code ? `(${w.code})` : ""} {w.active ? "" : "- Inactiva"}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {tab === "stock" ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div className="dashboard-card-sub" style={{ margin: 0 }}>
                Categoría
              </div>
              <select
                className="mq-search"
                style={{ height: 40, minWidth: 220 }}
                value={stockCategory}
                onChange={(e) => setStockCategory(e.target.value)}
              >
                <option value="">Todas</option>
                {stockCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {tab === "items" ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div className="dashboard-card-sub" style={{ margin: 0 }}>
                Categoría
              </div>
              <select
                className="mq-search"
                style={{ height: 40, minWidth: 220 }}
                value={itemsCategory}
                onChange={(e) => setItemsCategory(e.target.value)}
              >
                <option value="">Todas</option>
                {itemsCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button
            type="button"
            className="mq-btn"
            onClick={handleApplyFilters}
            disabled={loading}
            style={toolBtnStyle}
          >
            Aplicar
          </button>

          <button
            type="button"
            className="mq-btn mq-btn--ghost"
            onClick={handleRefresh}
            disabled={loading}
            style={toolBtnStyle}
          >
            Refrescar
          </button>

          {tab === "items" ? (
            isAdmin ? (
              <button
                type="button"
                className="mq-btn"
                onClick={() => {
                  setErrorMsg("");
                  const wid =
                    String(selectedWarehouseId || "").trim() || pickDefaultWarehouseId(warehousesRows);
                  setNewItem({
                    name: "",
                    category: "",
                    unit: "und",
                    min_stock: 0,
                    warehouseId: wid,
                    initialQty: 0,
                  });
                  setShowCreateItem(true);
                }}
                disabled={loading}
                style={toolBtnStyle}
              >
                Crear item
              </button>
            ) : (
              <div className="mq-alert" style={{ marginTop: 0 }}>
                Modo lectura: para crear o editar items se requiere rol ADMIN.
              </div>
            )
          ) : null}
        </div>

        <div style={rightToolsStyle}>
          {tab === "bodegas" ? (
            isAdmin ? (
              <button
                type="button"
                className="mq-btn"
                onClick={() => {
                  setErrorMsg("");
                  setNewWarehouse({ name: "", code: "", description: "", active: true });
                  setShowCreateWarehouse(true);
                }}
                disabled={loading}
                style={toolBtnStyle}
              >
                Crear bodega
              </button>
            ) : (
              <div className="mq-alert" style={{ marginTop: 0 }}>
                Modo lectura: para crear o editar bodegas se requiere rol ADMIN.
              </div>
            )
          ) : null}
        </div>
      </div>

      {errorMsg ? (
        <div className="mq-alert mq-alert--danger" style={{ marginTop: 12 }}>
          {errorMsg}
        </div>
      ) : null}

      {loading ? (
        <div className="mq-alert" style={{ marginTop: 12 }}>
          Cargando...
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        {tab === "stock" ? (
          <div>
            <h2 className="dashboard-card-title" style={{ marginBottom: 6 }}>
              Stock actual{selectedWarehouse?.name ? ` - ${selectedWarehouse.name}` : ""}
            </h2>

            <div className="dashboard-card-sub" style={{ marginTop: 0 }}>
              Haz click en una fila para registrar un movimiento o transferir entre bodegas.
            </div>

            <div style={{ marginTop: 10, ...stockTableWrapStyle }}>
              <table className="mq-table" style={stockTableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...stockTh, width: "46%" }}>Item</th>
                    <th style={{ ...stockTh, width: "32%" }}>Categoría</th>
                    <th style={{ ...stockTh, width: "11%", textAlign: "center" }}>Mínimo</th>
                    <th style={{ ...stockTh, width: "11%", textAlign: "center" }}>Stock</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleStockRows.length ? (
                    visibleStockRows.map((r, idx) => (
                      <tr
                        key={r._id || `${idx}`}
                        style={rowClickableStyle}
                        onClick={() => openMoveModalForItem(r._id)}
                      >
                        <td style={stockTdWrap} title={r.name || ""}>
                          {r.name || ""}
                        </td>
                        <td style={stockTdWrap} title={r.category || ""}>
                          {r.category || ""}
                        </td>
                        <td style={stockTdNum}>{String(r.min_stock ?? 0)}</td>
                        <td style={stockTdNum}>{String(r.stock ?? 0)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ padding: 10, opacity: 0.85, textAlign: "center" }}>
                        No hay datos para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "items" ? (
          <div>
            <h2 className="dashboard-card-title" style={{ marginBottom: 8 }}>
              Items de inventario{selectedWarehouse?.name ? ` - ${selectedWarehouse.name}` : ""}
            </h2>

            <div className="dashboard-card-sub" style={{ marginTop: 0 }}>
              La bodega filtra los items con stock mayor a 0 en esa bodega.
            </div>

            <div style={{ marginTop: 10, ...tableWrapStyle }}>
              <table className="mq-table" style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thCompact, width: isAdmin ? "28%" : "32%" }}>Nombre</th>
                    <th style={{ ...thCompact, width: "22%" }}>Categoría</th>
                    <th style={{ ...thCompact, width: "14%" }}>Unidad</th>
                    <th style={{ ...thCompact, width: "14%" }}>Mínimo</th>
                    <th style={{ ...thCompact, width: isAdmin ? "10%" : "18%" }}>Activo</th>
                    {isAdmin ? <th style={{ ...thCompact, width: "12%" }}>Acciones</th> : null}
                  </tr>
                </thead>

                <tbody>
                  {visibleItemsRows.length ? (
                    visibleItemsRows.map((r, idx) => (
                      <tr
                        key={r._id || `${idx}`}
                        style={{ cursor: isAdmin ? "pointer" : "default" }}
                        onClick={() => openEditItemModal(r)}
                      >
                        <td style={tdCompact} title={r.name || ""}>
                          {r.name || ""}
                        </td>
                        <td style={tdCompact} title={r.category || ""}>
                          {r.category || ""}
                        </td>
                        <td style={tdCompact}>{String(r.unit || "")}</td>
                        <td style={tdCompact}>{String(r.min_stock ?? 0)}</td>
                        <td style={tdCompact}>{r.active ? "Sí" : "No"}</td>

                        {isAdmin ? (
                          <td style={{ ...tdCompact, whiteSpace: "nowrap" }}>
                            <button
                              type="button"
                              className="mq-btn mq-btn--ghost"
                              style={{ ...toolBtnStyle, height: 34, padding: "0 10px", marginRight: 8 }}
                              disabled={loading || !isAdmin}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditItemModal(r);
                              }}
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              className="mq-btn"
                              style={{ ...toolBtnStyle, height: 34, padding: "0 10px" }}
                              disabled={loading || !isAdmin}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteItem(r);
                              }}
                            >
                              Eliminar definitivo
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5} style={{ padding: 10, opacity: 0.85, textAlign: "center" }}>
                        No hay datos para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "bodegas" ? (
          <div>
            <h2 className="dashboard-card-title" style={{ marginBottom: 8 }}>
              Bodegas
            </h2>

            <div className="dashboard-card-sub" style={{ marginTop: 0 }}>
              Administra bodegas, activa/desactiva y elimina definitivamente con reasignación.
            </div>

            <div style={{ marginTop: 10, ...tableWrapStyle }}>
              <table className="mq-table" style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thCompact, width: "34%" }}>Nombre</th>
                    <th style={{ ...thCompact, width: "16%" }}>Code</th>
                    <th style={{ ...thCompact, width: "12%" }}>Activa</th>
                    <th style={{ ...thCompact, width: "38%" }}>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {warehousesRows.length ? (
                    warehousesRows.map((w) => (
                      <tr key={w._id}>
                        <td style={tdCompact} title={w.description || ""}>
                          {w.name}
                        </td>
                        <td style={tdCompact}>{w.code || ""}</td>
                        <td style={tdCompact}>{w.active ? "Sí" : "No"}</td>
                        <td style={{ ...tdCompact, whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            className="mq-btn mq-btn--ghost"
                            style={{ ...toolBtnStyle, height: 34, padding: "0 10px", marginRight: 8 }}
                            disabled={loading || !isAdmin}
                            onClick={() => openEditWarehouseModal(w)}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            className="mq-btn"
                            style={{ ...toolBtnStyle, height: 34, padding: "0 10px", marginRight: 8 }}
                            disabled={loading || !isAdmin}
                            onClick={() => handleToggleWarehouseActive(w)}
                          >
                            {w.active ? "Desactivar" : "Activar"}
                          </button>

                          <button
                            type="button"
                            className="mq-btn mq-btn--ghost"
                            style={{ ...toolBtnStyle, height: 34, padding: "0 10px" }}
                            disabled={loading || !isAdmin}
                            onClick={() => openPurgeWarehouseModal(w)}
                          >
                            Eliminar definitivo
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ padding: 10, opacity: 0.85, textAlign: "center" }}>
                        No hay datos para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "alertas" ? (
          <div>
            <h2 className="dashboard-card-title" style={{ marginBottom: 8 }}>
              Alertas de stock bajo{selectedWarehouse?.name ? ` - ${selectedWarehouse.name}` : ""}
            </h2>

            <div style={{ marginTop: 10, ...tableWrapStyle }}>
              <table className="mq-table" style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thCompact, width: "35%" }}>Item</th>
                    <th style={{ ...thCompact, width: "35%" }}>Categoría</th>
                    <th style={{ ...thCompact, width: "15%" }}>Mínimo</th>
                    <th style={{ ...thCompact, width: "15%" }}>Stock</th>
                  </tr>
                </thead>

                <tbody>
                  {alertsRows.length ? (
                    alertsRows.map((r, idx) => (
                      <tr key={r._id || `${idx}`}>
                        <td style={tdCompact} title={r.name || ""}>
                          {r.name || ""}
                        </td>
                        <td style={tdCompact} title={r.category || ""}>
                          {r.category || ""}
                        </td>
                        <td style={tdCompact}>{String(r.min_stock ?? 0)}</td>
                        <td style={tdCompact}>{String(getAlertStock(r))}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ padding: 10, opacity: 0.85, textAlign: "center" }}>
                        No hay datos para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {tab === "movimientos" ? (
          <div>
            <h2 className="dashboard-card-title" style={{ marginBottom: 8 }}>
              Movimientos recientes{selectedWarehouse?.name ? ` - ${selectedWarehouse.name}` : ""}
            </h2>

            <div style={{ marginTop: 10, ...tableWrapStyle }}>
              <table className="mq-table" style={tableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...thCompact, width: "20%" }}>Fecha</th>
                    <th style={{ ...thCompact, width: "12%" }}>Tipo</th>
                    <th style={{ ...thCompact, width: "14%" }}>Cantidad</th>
                    <th style={{ ...thCompact, width: "14%" }}>Stock final</th>
                    <th style={{ ...thCompact, width: "40%" }}>Nota</th>
                  </tr>
                </thead>

                <tbody>
                  {movesRows.length ? (
                    movesRows.map((r, idx) => (
                      <tr key={r._id || `${idx}`}>
                        <td style={tdCompact} title={r.createdAt ? String(r.createdAt) : ""}>
                          {fmtDateTimeCOShort(r.createdAt)}
                        </td>
                        <td style={tdCompact}>{fmtMoveType(r.type)}</td>
                        <td style={tdCompact}>{String(r.qty ?? "")}</td>
                        <td style={tdCompact}>
                          {r.to === null || r.to === undefined ? "" : String(r.to)}
                        </td>
                        <td style={tdCompact} title={r.note || ""}>
                          {r.note || ""}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: 10, opacity: 0.85, textAlign: "center" }}>
                        No hay datos para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* Modales (sin cambios de lógica) */}
      {showCreateItem ? (
        <div
          style={modalOverlayStyle}
          onMouseDown={() => setShowCreateItem(false)}
          role="presentation"
        >
          <div
            style={modalCardStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={modalHeaderStyle}>
              <div>
                <div className="dashboard-card-title" style={{ margin: 0 }}>
                  Crear item
                </div>
                <div className="dashboard-card-sub" style={{ margin: 0 }}>
                  Registra un nuevo item de inventario.
                </div>
              </div>

              <button
                type="button"
                className="mq-btn mq-btn--ghost"
                onClick={() => setShowCreateItem(false)}
                disabled={loading}
                style={toolBtnStyle}
              >
                Cerrar
              </button>
            </div>

            <div style={modalBodyStyle}>
              {!isAdmin ? (
                <div className="mq-alert" style={{ marginTop: 0, marginBottom: 10 }}>
                  Modo lectura: solo un usuario ADMIN puede guardar cambios.
                </div>
              ) : null}

              <form onSubmit={handleCreateItem} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Nombre
                  </label>
                  <input
                    className="mq-search"
                    value={newItem.name}
                    onChange={(e) => setNewItem((p) => ({ ...p, name: e.target.value }))}
                    style={{ height: 40 }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Categoría (opcional)
                  </label>
                  <input
                    className="mq-search"
                    value={newItem.category}
                    onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value }))}
                    style={{ height: 40 }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Unidad (opcional)
                    </label>
                    <input
                      className="mq-search"
                      value={newItem.unit}
                      onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Stock mínimo
                    </label>
                    <input
                      className="mq-search"
                      value={newItem.min_stock}
                      onChange={(e) => setNewItem((p) => ({ ...p, min_stock: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Bodega inicial (opcional)
                    </label>
                    <select
                      className="mq-search"
                      value={newItem.warehouseId}
                      onChange={(e) => setNewItem((p) => ({ ...p, warehouseId: e.target.value }))}
                      style={{ height: 40 }}
                    >
                      <option value="">No asignar</option>
                      {activeWarehouses.map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name} {w.code ? `(${w.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Stock inicial (opcional)
                    </label>
                    <input
                      className="mq-search"
                      value={newItem.initialQty}
                      onChange={(e) => setNewItem((p) => ({ ...p, initialQty: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>
                </div>

                <div style={modalFooterStyle}>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost"
                    onClick={() => setShowCreateItem(false)}
                    disabled={loading}
                    style={toolBtnStyle}
                  >
                    Cancelar
                  </button>

                  <button type="submit" className="mq-btn" disabled={loading} style={toolBtnStyle}>
                    Crear
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showEditItem ? (
        <div
          style={modalOverlayStyle}
          onMouseDown={() => setShowEditItem(false)}
          role="presentation"
        >
          <div
            style={modalCardStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={modalHeaderStyle}>
              <div>
                <div className="dashboard-card-title" style={{ margin: 0 }}>
                  Editar item
                </div>
                <div className="dashboard-card-sub" style={{ margin: 0 }}>
                  Actualiza los datos del item de inventario.
                </div>
              </div>

              <button
                type="button"
                className="mq-btn mq-btn--ghost"
                onClick={() => setShowEditItem(false)}
                disabled={loading}
                style={toolBtnStyle}
              >
                Cerrar
              </button>
            </div>

            <div style={modalBodyStyle}>
              {!isAdmin ? (
                <div className="mq-alert" style={{ marginTop: 0, marginBottom: 10 }}>
                  Modo lectura: solo un usuario ADMIN puede guardar cambios.
                </div>
              ) : null}

              <form onSubmit={handleUpdateItem} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Nombre
                  </label>
                  <input
                    className="mq-search"
                    value={editItem.name}
                    onChange={(e) => setEditItem((p) => ({ ...p, name: e.target.value }))}
                    style={{ height: 40 }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Categoría (opcional)
                  </label>
                  <input
                    className="mq-search"
                    value={editItem.category}
                    onChange={(e) => setEditItem((p) => ({ ...p, category: e.target.value }))}
                    style={{ height: 40 }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Unidad (opcional)
                    </label>
                    <input
                      className="mq-search"
                      value={editItem.unit}
                      onChange={(e) => setEditItem((p) => ({ ...p, unit: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Stock mínimo
                    </label>
                    <input
                      className="mq-search"
                      value={editItem.min_stock}
                      onChange={(e) => setEditItem((p) => ({ ...p, min_stock: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Activo
                  </label>
                  <select
                    className="mq-search"
                    value={editItem.active ? "true" : "false"}
                    onChange={(e) => setEditItem((p) => ({ ...p, active: e.target.value === "true" }))}
                    style={{ height: 40 }}
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div style={modalFooterStyle}>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost"
                    onClick={() => setShowEditItem(false)}
                    disabled={loading}
                    style={toolBtnStyle}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="mq-btn"
                    disabled={!isAdmin || loading}
                    style={toolBtnStyle}
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateMove ? (
        <div
          style={modalOverlayStyle}
          onMouseDown={() => setShowCreateMove(false)}
          role="presentation"
        >
          <div
            style={modalCardStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={modalHeaderStyle}>
              <div>
                <div className="dashboard-card-title" style={{ margin: 0 }}>
                  Registrar movimiento
                </div>
                <div className="dashboard-card-sub" style={{ margin: 0 }}>
                  Entrada suma, Salida resta, Ajuste define el stock final.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  className="mq-btn mq-btn--ghost"
                  disabled={loading || !isAdmin}
                  style={toolBtnStyle}
                  onClick={() => {
                    const it = String(newMove.itemId || "").trim();
                    setShowCreateMove(false);
                    if (it) openTransferModalForItem(it);
                  }}
                >
                  Transferir
                </button>

                <button
                  type="button"
                  className="mq-btn mq-btn--ghost"
                  onClick={() => setShowCreateMove(false)}
                  disabled={loading}
                  style={toolBtnStyle}
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div style={modalBodyStyle}>
              {!isAdmin ? (
                <div className="mq-alert" style={{ marginTop: 0, marginBottom: 10 }}>
                  Modo lectura: solo un usuario ADMIN puede guardar cambios.
                </div>
              ) : null}

              <form onSubmit={handleCreateMove} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Item
                    </label>
                    <select
                      className="mq-search"
                      value={newMove.itemId}
                      onChange={(e) => setNewMove((p) => ({ ...p, itemId: e.target.value }))}
                      style={{ height: 40 }}
                    >
                      <option value="">Selecciona un item</option>
                      {itemOptions.map((it) => (
                        <option key={it._id} value={it._id}>
                          {it.name} {it.category ? `- ${it.category}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Bodega
                    </label>
                    <select
                      className="mq-search"
                      value={newMove.warehouseId}
                      onChange={(e) => setNewMove((p) => ({ ...p, warehouseId: e.target.value }))}
                      style={{ height: 40 }}
                    >
                      <option value="">Selecciona una bodega</option>
                      {activeWarehouses.map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name} {w.code ? `(${w.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Tipo
                    </label>
                    <select
                      className="mq-search"
                      value={newMove.type}
                      onChange={(e) => setNewMove((p) => ({ ...p, type: e.target.value }))}
                      style={{ height: 40 }}
                    >
                      <option value="IN">Entrada</option>
                      <option value="OUT">Salida</option>
                      <option value="ADJUST">Ajuste</option>
                    </select>
                  </div>

                  {String(newMove.type || "").toUpperCase() === "ADJUST" ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      <label className="dashboard-card-sub" style={{ margin: 0 }}>
                        Stock final (to)
                      </label>
                      <input
                        className="mq-search"
                        value={newMove.to}
                        onChange={(e) => setNewMove((p) => ({ ...p, to: e.target.value }))}
                        style={{ height: 40 }}
                      />
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      <label className="dashboard-card-sub" style={{ margin: 0 }}>
                        Cantidad
                      </label>
                      <input
                        className="mq-search"
                        value={newMove.qty}
                        onChange={(e) => setNewMove((p) => ({ ...p, qty: e.target.value }))}
                        style={{ height: 40 }}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Nota (opcional)
                  </label>
                  <input
                    className="mq-search"
                    value={newMove.note}
                    onChange={(e) => setNewMove((p) => ({ ...p, note: e.target.value }))}
                    style={{ height: 40 }}
                  />
                </div>

                <div style={modalFooterStyle}>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost"
                    onClick={() => setShowCreateMove(false)}
                    disabled={loading}
                    style={toolBtnStyle}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="mq-btn"
                    disabled={loading || !isAdmin}
                    style={toolBtnStyle}
                  >
                    Registrar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showTransfer ? (
        <div style={modalOverlayStyle} onMouseDown={() => setShowTransfer(false)} role="presentation">
          <div
            style={modalCardStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={modalHeaderStyle}>
              <div>
                <div className="dashboard-card-title" style={{ margin: 0 }}>
                  Transferir entre bodegas
                </div>
                <div className="dashboard-card-sub" style={{ margin: 0 }}>
                  Crea una salida en origen y una entrada en destino.
                </div>
              </div>

              <button
                type="button"
                className="mq-btn mq-btn--ghost"
                onClick={() => setShowTransfer(false)}
                disabled={loading}
                style={toolBtnStyle}
              >
                Cerrar
              </button>
            </div>

            <div style={modalBodyStyle}>
              {!isAdmin ? (
                <div className="mq-alert" style={{ marginTop: 0, marginBottom: 10 }}>
                  Modo lectura: solo un usuario ADMIN puede transferir.
                </div>
              ) : null}

              <form onSubmit={handleCreateTransfer} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Item
                  </label>
                  <select
                    className="mq-search"
                    value={transferForm.itemId}
                    onChange={(e) => setTransferForm((p) => ({ ...p, itemId: e.target.value }))}
                    style={{ height: 40 }}
                  >
                    <option value="">Selecciona un item</option>
                    {itemOptions.map((it) => (
                      <option key={it._id} value={it._id}>
                        {it.name} {it.category ? `- ${it.category}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Origen
                    </label>
                    <select
                      className="mq-search"
                      value={transferForm.fromWarehouseId}
                      onChange={(e) => setTransferForm((p) => ({ ...p, fromWarehouseId: e.target.value }))}
                      style={{ height: 40 }}
                    >
                      <option value="">Selecciona bodega</option>
                      {activeWarehouses.map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name} {w.code ? `(${w.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Destino
                    </label>
                    <select
                      className="mq-search"
                      value={transferForm.toWarehouseId}
                      onChange={(e) => setTransferForm((p) => ({ ...p, toWarehouseId: e.target.value }))}
                      style={{ height: 40 }}
                    >
                      <option value="">Selecciona bodega</option>
                      {activeWarehouses.map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name} {w.code ? `(${w.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Cantidad
                    </label>
                    <input
                      className="mq-search"
                      value={transferForm.qty}
                      onChange={(e) => setTransferForm((p) => ({ ...p, qty: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Nota (opcional)
                    </label>
                    <input
                      className="mq-search"
                      value={transferForm.note}
                      onChange={(e) => setTransferForm((p) => ({ ...p, note: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>
                </div>

                <div style={modalFooterStyle}>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost"
                    onClick={() => setShowTransfer(false)}
                    disabled={loading}
                    style={toolBtnStyle}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="mq-btn"
                    disabled={loading || !isAdmin}
                    style={toolBtnStyle}
                  >
                    Transferir
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showCreateWarehouse ? (
        <div
          style={modalOverlayStyle}
          onMouseDown={() => setShowCreateWarehouse(false)}
          role="presentation"
        >
          <div
            style={modalCardStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={modalHeaderStyle}>
              <div>
                <div className="dashboard-card-title" style={{ margin: 0 }}>
                  Crear bodega
                </div>
                <div className="dashboard-card-sub" style={{ margin: 0 }}>
                  Registra una nueva bodega.
                </div>
              </div>

              <button
                type="button"
                className="mq-btn mq-btn--ghost"
                onClick={() => setShowCreateWarehouse(false)}
                disabled={loading}
                style={toolBtnStyle}
              >
                Cerrar
              </button>
            </div>

            <div style={modalBodyStyle}>
              <form onSubmit={handleCreateWarehouse} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Nombre
                    </label>
                    <input
                      className="mq-search"
                      value={newWarehouse.name}
                      onChange={(e) => setNewWarehouse((p) => ({ ...p, name: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Code
                    </label>
                    <input
                      className="mq-search"
                      value={newWarehouse.code}
                      onChange={(e) => setNewWarehouse((p) => ({ ...p, code: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Descripción (opcional)
                  </label>
                  <input
                    className="mq-search"
                    value={newWarehouse.description}
                    onChange={(e) => setNewWarehouse((p) => ({ ...p, description: e.target.value }))}
                    style={{ height: 40 }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Activa
                  </label>
                  <select
                    className="mq-search"
                    value={newWarehouse.active ? "true" : "false"}
                    onChange={(e) => setNewWarehouse((p) => ({ ...p, active: e.target.value === "true" }))}
                    style={{ height: 40 }}
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div style={modalFooterStyle}>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost"
                    onClick={() => setShowCreateWarehouse(false)}
                    disabled={loading}
                    style={toolBtnStyle}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="mq-btn"
                    disabled={loading || !isAdmin}
                    style={toolBtnStyle}
                  >
                    Crear
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showEditWarehouse ? (
        <div
          style={modalOverlayStyle}
          onMouseDown={() => setShowEditWarehouse(false)}
          role="presentation"
        >
          <div
            style={modalCardStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={modalHeaderStyle}>
              <div>
                <div className="dashboard-card-title" style={{ margin: 0 }}>
                  Editar bodega
                </div>
                <div className="dashboard-card-sub" style={{ margin: 0 }}>
                  Actualiza los datos de la bodega.
                </div>
              </div>

              <button
                type="button"
                className="mq-btn mq-btn--ghost"
                onClick={() => setShowEditWarehouse(false)}
                disabled={loading}
                style={toolBtnStyle}
              >
                Cerrar
              </button>
            </div>

            <div style={modalBodyStyle}>
              <form onSubmit={handleUpdateWarehouse} style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Nombre
                    </label>
                    <input
                      className="mq-search"
                      value={editWarehouse.name}
                      onChange={(e) => setEditWarehouse((p) => ({ ...p, name: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label className="dashboard-card-sub" style={{ margin: 0 }}>
                      Code
                    </label>
                    <input
                      className="mq-search"
                      value={editWarehouse.code}
                      onChange={(e) => setEditWarehouse((p) => ({ ...p, code: e.target.value }))}
                      style={{ height: 40 }}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Descripción (opcional)
                  </label>
                  <input
                    className="mq-search"
                    value={editWarehouse.description}
                    onChange={(e) => setEditWarehouse((p) => ({ ...p, description: e.target.value }))}
                    style={{ height: 40 }}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Activa
                  </label>
                  <select
                    className="mq-search"
                    value={editWarehouse.active ? "true" : "false"}
                    onChange={(e) => setEditWarehouse((p) => ({ ...p, active: e.target.value === "true" }))}
                    style={{ height: 40 }}
                  >
                    <option value="true">Sí</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div style={modalFooterStyle}>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost"
                    onClick={() => setShowEditWarehouse(false)}
                    disabled={loading}
                    style={toolBtnStyle}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="mq-btn"
                    disabled={loading || !isAdmin}
                    style={toolBtnStyle}
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showPurgeWarehouse ? (
        <div
          style={modalOverlayStyle}
          onMouseDown={() => setShowPurgeWarehouse(false)}
          role="presentation"
        >
          <div
            style={modalCardStyle}
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div style={modalHeaderStyle}>
              <div>
                <div className="dashboard-card-title" style={{ margin: 0 }}>
                  Eliminar bodega definitivamente
                </div>
                <div className="dashboard-card-sub" style={{ margin: 0 }}>
                  Los items y movimientos serán reasignados a otra bodega.
                </div>
              </div>

              <button
                type="button"
                className="mq-btn mq-btn--ghost"
                onClick={() => setShowPurgeWarehouse(false)}
                disabled={loading}
                style={toolBtnStyle}
              >
                Cerrar
              </button>
            </div>

            <div style={modalBodyStyle}>
              <form onSubmit={handlePurgeWarehouse} style={{ display: "grid", gap: 12 }}>
                <div className="mq-alert" style={{ marginTop: 0 }}>
                  Bodega a eliminar: <strong>{purgeWarehouse.name || ""}</strong>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <label className="dashboard-card-sub" style={{ margin: 0 }}>
                    Reasignar a
                  </label>
                  <select
                    className="mq-search"
                    value={purgeWarehouse.reassignToWarehouseId}
                    onChange={(e) =>
                      setPurgeWarehouse((p) => ({ ...p, reassignToWarehouseId: e.target.value }))
                    }
                    style={{ height: 40 }}
                  >
                    <option value="">Selecciona bodega destino</option>
                    {activeWarehouses
                      .filter((w) => String(w._id) !== String(purgeWarehouse._id))
                      .map((w) => (
                        <option key={w._id} value={w._id}>
                          {w.name} {w.code ? `(${w.code})` : ""}
                        </option>
                      ))}
                  </select>
                </div>

                <div style={modalFooterStyle}>
                  <button
                    type="button"
                    className="mq-btn mq-btn--ghost"
                    onClick={() => setShowPurgeWarehouse(false)}
                    disabled={loading}
                    style={toolBtnStyle}
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    className="mq-btn"
                    disabled={loading || !isAdmin}
                    style={toolBtnStyle}
                  >
                    Eliminar definitivo
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default InventoryPanel;
