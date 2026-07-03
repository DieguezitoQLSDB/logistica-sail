import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { createRoot } from "react-dom/client";
import "./style.css";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const sectores = ["Ventas", "Producto", "Producción", "LOT", "Marketing", "Administración", "E-Commerce"];
const tipos = ["Entrega", "Retira", "Entrega y Retira"];
const prioridades = ["Normal", "Urgente"];
const horarios = ["Flexible", "Antes de una hora", "Entre dos horarios", "Horario exacto"];

const REFRESCO_MS = 60000;

function generarOpcionesHorario() {
  const opciones = [];
  for (let hora = 8; hora <= 18; hora++) {
    for (const minuto of [0, 15, 30, 45]) {
      if (hora === 18 && minuto > 0) continue;
      opciones.push(`${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`);
    }
  }
  return opciones;
}

const opcionesHorario = generarOpcionesHorario();

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getMonday(dateString = getToday()) {
  const date = new Date(dateString + "T00:00:00");
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(dateString + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateAR(dateString) {
  if (!dateString) return "";
  const cleanDate = String(dateString).slice(0, 10);
  const date = new Date(cleanDate + "T00:00:00");
  if (Number.isNaN(date.getTime())) return cleanDate;

  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatDateLabel(dateString) {
  const date = new Date(dateString + "T00:00:00");
  return date.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

function onlyNumbers(value) {
  return String(value || "").replace(/\D/g, "");
}

function requiereLleva(tipoTarea) {
  return tipoTarea === "Entrega" || tipoTarea === "Entrega y Retira";
}

function requiereTrae(tipoTarea) {
  return tipoTarea === "Retira" || tipoTarea === "Entrega y Retira";
}

function getHorario(item) {
  if (item.horario_tipo === "Flexible") return "Flexible";
  return item.horario_detalle || item.horario_tipo || "";
}

function buildHorarioDetalle(item) {
  if (item.horario_tipo === "Flexible") return "Flexible";

  if (item.horario_tipo === "Antes de una hora") {
    return item.horario_hora ? `Antes de las ${item.horario_hora}` : "";
  }

  if (item.horario_tipo === "Entre dos horarios") {
    return item.horario_desde && item.horario_hasta
      ? `Desde ${item.horario_desde} hasta ${item.horario_hasta}`
      : "";
  }

  if (item.horario_tipo === "Horario exacto") {
    return item.horario_hora ? `Para las ${item.horario_hora}` : "";
  }

  return "";
}

function parseHorarioDetalle(horarioTipo, horarioDetalle) {
  const text = horarioDetalle || "";

  if (horarioTipo === "Antes de una hora") {
    const match = text.match(/(\d{2}:\d{2})/);
    return { horario_hora: match ? match[1] : "", horario_desde: "", horario_hasta: "" };
  }

  if (horarioTipo === "Entre dos horarios") {
    const match = text.match(/(\d{2}:\d{2}).*?(\d{2}:\d{2})/);
    return {
      horario_hora: "",
      horario_desde: match ? match[1] : "",
      horario_hasta: match ? match[2] : "",
    };
  }

  if (horarioTipo === "Horario exacto") {
    const match = text.match(/(\d{2}:\d{2})/);
    return { horario_hora: match ? match[1] : "", horario_desde: "", horario_hasta: "" };
  }

  return { horario_hora: "", horario_desde: "", horario_hasta: "" };
}

function isHorarioCompleto(item) {
  if (item.horario_tipo === "Flexible") return true;
  if (item.horario_tipo === "Antes de una hora") return Boolean(item.horario_hora);
  if (item.horario_tipo === "Entre dos horarios") return Boolean(item.horario_desde && item.horario_hasta);
  if (item.horario_tipo === "Horario exacto") return Boolean(item.horario_hora);
  return false;
}

function getNombreLugar(solicitud, lugares) {
  const lugar = lugares.find((lugar) => lugar.id === solicitud.lugar_predeterminado_id);
  return lugar?.nombre || solicitud.contacto || "Sin nombre";
}

// ---------- Geolocalización y optimización de ruta (OpenStreetMap, gratis) ----------

const GEO_CACHE_KEY = "sail_geo_cache_v1";

function leerCacheGeo() {
  try {
    return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)) || {};
  } catch {
    return {};
  }
}

function guardarCacheGeo(cache) {
  try {
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // sin espacio o modo privado: seguimos sin cache
  }
}

let ultimaConsultaGeo = 0;

async function geocodificar(direccion) {
  const clave = String(direccion || "").trim().toLowerCase();
  if (!clave) return null;

  const cache = leerCacheGeo();
  if (cache[clave]) return cache[clave];

  // Nominatim pide máximo 1 consulta por segundo
  const espera = Math.max(0, ultimaConsultaGeo + 1100 - Date.now());
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaConsultaGeo = Date.now();

  const textoBusqueda = /argentina/i.test(direccion)
    ? direccion
    : `${direccion}, Buenos Aires, Argentina`;

  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=${encodeURIComponent(textoBusqueda)}`
    );
    const data = await resp.json();
    if (!data || !data[0]) return null;

    const punto = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    cache[clave] = punto;
    guardarCacheGeo(cache);
    return punto;
  } catch {
    return null;
  }
}

function distanciaKm(a, b) {
  const radioTierra = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * radioTierra * Math.asin(Math.sqrt(h));
}

function urlRutaCompletaMaps(rutaActual, puntoPartida) {
  const direcciones = [];
  if (puntoPartida && puntoPartida.trim()) direcciones.push(puntoPartida.trim());
  rutaActual.forEach((s) => direcciones.push(s.direccion));
  // Google Maps acepta hasta ~10 puntos en la URL
  return "https://www.google.com/maps/dir/" + direcciones.slice(0, 10).map(encodeURIComponent).join("/");
}

// ---------- Componentes chicos ----------

function Button({ children, variant = "primary", ...props }) {
  return (
    <button className={`btn ${variant}`} {...props}>
      {children}
    </button>
  );
}

function Badge({ entregado }) {
  if (entregado === true) return <span className="badge ok">Entregado</span>;
  if (entregado === false) return <span className="badge bad">No entregado</span>;
  return <span className="badge pending">Pendiente</span>;
}

function HorarioSelect({ value, onChange }) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Seleccionar horario</option>
      {opcionesHorario.map((hora) => (
        <option key={hora} value={hora}>
          {hora}
        </option>
      ))}
    </select>
  );
}

function HorarioCampos({ value, onChange }) {
  function update(changes) {
    onChange({ ...value, ...changes });
  }

  if (value.horario_tipo === "Flexible") return null;

  if (value.horario_tipo === "Antes de una hora") {
    return (
      <Field label="Detalle horario" required>
        <div className="grid">
          <span className="muted">Antes de las</span>
          <HorarioSelect value={value.horario_hora} onChange={(hora) => update({ horario_hora: hora })} />
        </div>
      </Field>
    );
  }

  if (value.horario_tipo === "Entre dos horarios") {
    return (
      <Field label="Detalle horario" required>
        <div className="grid">
          <div>
            <span className="muted">Desde</span>
            <HorarioSelect value={value.horario_desde} onChange={(hora) => update({ horario_desde: hora })} />
          </div>

          <div>
            <span className="muted">Hasta</span>
            <HorarioSelect value={value.horario_hasta} onChange={(hora) => update({ horario_hasta: hora })} />
          </div>
        </div>
      </Field>
    );
  }

  if (value.horario_tipo === "Horario exacto") {
    return (
      <Field label="Detalle horario" required>
        <div className="grid">
          <span className="muted">Para las</span>
          <HorarioSelect value={value.horario_hora} onChange={(hora) => update({ horario_hora: hora })} />
        </div>
      </Field>
    );
  }

  return null;
}

function App() {
  const [tab, setTab] = useState("empleado");
  const [solicitudes, setSolicitudes] = useState([]);
  const [lugares, setLugares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [semanaInicio, setSemanaInicio] = useState(getMonday());
  const [solicitudEditando, setSolicitudEditando] = useState(null);
  const [lugarEditando, setLugarEditando] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [ultimaActualizacion, setUltimaActualizacion] = useState("");
  const [optimizando, setOptimizando] = useState(null);

  const [nuevoLugar, setNuevoLugar] = useState({
    nombre: "",
    direccion: "",
    contacto: "",
    telefono: "",
  });

  const [form, setForm] = useState({
    fecha: getToday(),
    sector: "Ventas",
    tipo_tarea: "Entrega",
    direccion: "",
    horario_tipo: "Flexible",
    horario_hora: "",
    horario_desde: "",
    horario_hasta: "",
    prioridad: "Normal",
    contacto: "",
    telefono: "",
    detalle: "",
    lleva: "",
    trae: "",
    lugar_predeterminado_id: "",
  });

  function avisar(mensaje, tipo = "ok") {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, mensaje, tipo }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }

  function marcarActualizado() {
    setUltimaActualizacion(
      new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
    );
  }

  async function cargarSolicitudes(silencioso = false) {
    const { data, error } = await supabase
      .from("solicitudes")
      .select("*")
      .order("fecha", { ascending: true })
      .order("orden_ruta", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      if (!silencioso) avisar("Error cargando solicitudes: " + error.message, "error");
    } else {
      setSolicitudes(data || []);
    }
  }

  async function cargarLugares(silencioso = false) {
    const { data, error } = await supabase
      .from("lugares_predeterminados")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      if (!silencioso) avisar("Error cargando lugares predeterminados: " + error.message, "error");
    } else {
      setLugares(data || []);
    }
  }

  async function refrescar(silencioso = true) {
    await Promise.all([cargarSolicitudes(silencioso), cargarLugares(silencioso)]);
    marcarActualizado();
  }

  async function cargarTodo() {
    setLoading(true);
    await refrescar(false);
    setLoading(false);
  }

  useEffect(() => {
    cargarTodo();

    const intervalo = setInterval(() => {
      refrescar(true);
    }, REFRESCO_MS);

    const alVolver = () => {
      if (document.visibilityState === "visible") refrescar(true);
    };

    window.addEventListener("focus", alVolver);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      clearInterval(intervalo);
      window.removeEventListener("focus", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  function elegirLugar(id) {
    if (!id) {
      setForm({ ...form, lugar_predeterminado_id: "" });
      return;
    }

    const lugar = lugares.find((l) => l.id === id);
    if (!lugar) return;

    setForm({
      ...form,
      lugar_predeterminado_id: lugar.id,
      direccion: lugar.direccion || "",
      contacto: lugar.contacto || "",
      telefono: onlyNumbers(lugar.telefono || ""),
    });
  }

  function elegirLugarEdicion(id) {
    if (!id) {
      setSolicitudEditando({ ...solicitudEditando, lugar_predeterminado_id: "" });
      return;
    }

    const lugar = lugares.find((l) => l.id === id);
    if (!lugar) return;

    setSolicitudEditando({
      ...solicitudEditando,
      lugar_predeterminado_id: lugar.id,
      direccion: lugar.direccion || "",
      contacto: lugar.contacto || "",
      telefono: onlyNumbers(lugar.telefono || ""),
    });
  }

  async function guardarLugarPredeterminado(payload) {
    const nombre = window.prompt("¿Con qué nombre querés guardar este lugar? Ej: Taller Pepito");
    if (!nombre || !nombre.trim()) return;

    const { error } = await supabase.from("lugares_predeterminados").insert({
      nombre: nombre.trim(),
      direccion: payload.direccion,
      contacto: payload.contacto,
      telefono: payload.telefono,
      detalle_base: "",
      sector_sugerido: "",
      activo: true,
    });

    if (error) {
      avisar("Error guardando lugar predeterminado: " + error.message, "error");
      return;
    }

    await cargarLugares();
    avisar("Lugar guardado como predeterminado.");
  }

  async function crearLugarManual(e) {
    e.preventDefault();

    if (!nuevoLugar.nombre.trim() || !nuevoLugar.direccion.trim()) {
      avisar("Completá como mínimo nombre del lugar y dirección completa.", "error");
      return;
    }

    const { error } = await supabase.from("lugares_predeterminados").insert({
      nombre: nuevoLugar.nombre.trim(),
      direccion: nuevoLugar.direccion.trim(),
      contacto: nuevoLugar.contacto.trim(),
      telefono: onlyNumbers(nuevoLugar.telefono),
      detalle_base: "",
      sector_sugerido: "",
      activo: true,
    });

    if (error) {
      avisar("Error guardando lugar predeterminado: " + error.message, "error");
      return;
    }

    setNuevoLugar({
      nombre: "",
      direccion: "",
      contacto: "",
      telefono: "",
    });

    await cargarLugares();
    avisar("Lugar predeterminado creado.");
  }

  function validarSolicitud(item) {
    if (
      !item.fecha ||
      !item.sector ||
      !item.tipo_tarea ||
      !item.direccion.trim() ||
      !item.prioridad ||
      !item.contacto.trim() ||
      !item.telefono.trim()
    ) {
      avisar("Completá todos los campos obligatorios marcados con *.", "error");
      return false;
    }

    if (requiereLleva(item.tipo_tarea) && !item.lleva.trim()) {
      avisar("Completá el campo Qué lleva.", "error");
      return false;
    }

    if (requiereTrae(item.tipo_tarea) && !item.trae.trim()) {
      avisar("Completá el campo Qué trae.", "error");
      return false;
    }

    if (!isHorarioCompleto(item)) {
      avisar("Completá correctamente el horario.", "error");
      return false;
    }

    return true;
  }

  async function crearSolicitud(e) {
    e.preventDefault();
    if (!validarSolicitud(form)) return;

    const payload = {
      fecha: form.fecha,
      sector: form.sector,
      tipo_tarea: form.tipo_tarea,
      direccion: form.direccion.trim(),
      horario_tipo: form.horario_tipo,
      horario_detalle: buildHorarioDetalle(form),
      prioridad: form.prioridad,
      contacto: form.contacto.trim(),
      telefono: onlyNumbers(form.telefono),
      detalle: form.detalle.trim(),
      lleva: form.lleva.trim(),
      trae: form.trae.trim(),
      lugar_predeterminado_id: form.lugar_predeterminado_id || null,
      entregado: null,
      orden_ruta: null,
    };

    const { error } = await supabase.from("solicitudes").insert(payload);

    if (error) {
      avisar("Error guardando solicitud: " + error.message, "error");
      return;
    }

    await cargarSolicitudes();

    if (!form.lugar_predeterminado_id) {
      const quiereGuardar = window.confirm("Solicitud cargada. ¿Querés guardar esta dirección como lugar predeterminado?");
      if (quiereGuardar) await guardarLugarPredeterminado(payload);
      else avisar("Solicitud cargada.");
    } else {
      avisar("Solicitud cargada.");
    }

    setForm({
      ...form,
      direccion: "",
      horario_tipo: "Flexible",
      horario_hora: "",
      horario_desde: "",
      horario_hasta: "",
      prioridad: "Normal",
      contacto: "",
      telefono: "",
      detalle: "",
      lleva: "",
      trae: "",
      lugar_predeterminado_id: "",
    });
  }

  function empezarEdicion(s) {
    const parsedHorario = parseHorarioDetalle(s.horario_tipo, s.horario_detalle);

    setSolicitudEditando({
      ...s,
      ...parsedHorario,
      detalle: s.detalle || "",
      lleva: s.lleva || "",
      trae: s.trae || "",
      telefono: onlyNumbers(s.telefono || ""),
      lugar_predeterminado_id: s.lugar_predeterminado_id || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function guardarCambiosSolicitud(e) {
    e.preventDefault();
    if (!validarSolicitud(solicitudEditando)) return;

    const payload = {
      fecha: solicitudEditando.fecha,
      sector: solicitudEditando.sector,
      tipo_tarea: solicitudEditando.tipo_tarea,
      direccion: solicitudEditando.direccion.trim(),
      horario_tipo: solicitudEditando.horario_tipo,
      horario_detalle: buildHorarioDetalle(solicitudEditando),
      prioridad: solicitudEditando.prioridad,
      contacto: solicitudEditando.contacto.trim(),
      telefono: onlyNumbers(solicitudEditando.telefono),
      detalle: solicitudEditando.detalle.trim(),
      lleva: solicitudEditando.lleva.trim(),
      trae: solicitudEditando.trae.trim(),
      lugar_predeterminado_id: solicitudEditando.lugar_predeterminado_id || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("solicitudes").update(payload).eq("id", solicitudEditando.id);

    if (error) {
      avisar("Error guardando cambios: " + error.message, "error");
      return;
    }

    setSolicitudEditando(null);
    await cargarSolicitudes();
    avisar("Solicitud actualizada.");
  }

  async function eliminarSolicitud(id) {
    const confirmar = window.confirm("¿Seguro querés eliminar esta solicitud? Esta acción no se puede deshacer.");
    if (!confirmar) return;

    const { error } = await supabase.from("solicitudes").delete().eq("id", id);

    if (error) {
      avisar("Error eliminando solicitud: " + error.message, "error");
      return;
    }

    setSolicitudEditando(null);
    await cargarSolicitudes();
    avisar("Solicitud eliminada.");
  }

  async function marcar(id, value) {
    const { error } = await supabase
      .from("solicitudes")
      .update({ entregado: value, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      avisar("Error actualizando solicitud: " + error.message, "error");
    } else {
      await cargarSolicitudes();
      avisar(value === true ? "Marcada como entregada." : "Marcada como no entregada.");
    }
  }

  async function volverAPendiente(id) {
    const confirmar = window.confirm("¿Querés volver esta solicitud a pendiente?");
    if (!confirmar) return;

    const { error } = await supabase
      .from("solicitudes")
      .update({ entregado: null, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      avisar("Error volviendo la solicitud a pendiente: " + error.message, "error");
      return;
    }

    await cargarSolicitudes();
    avisar("Solicitud vuelta a pendiente.");
  }

  async function cambiarFecha(id, nuevaFecha) {
    const { error } = await supabase
      .from("solicitudes")
      .update({ fecha: nuevaFecha, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) avisar("Error cambiando fecha: " + error.message, "error");
    else await cargarSolicitudes();
  }

  async function guardarOrdenRuta(nuevaRuta, avisarAlTerminar = false) {
    const updates = nuevaRuta.map((solicitud, index) =>
      supabase
        .from("solicitudes")
        .update({
          orden_ruta: index + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", solicitud.id)
    );

    const results = await Promise.all(updates);
    const error = results.find((r) => r.error)?.error;

    if (error) {
      avisar("Error guardando el orden de la ruta: " + error.message, "error");
      await cargarSolicitudes();
      return;
    }

    await cargarSolicitudes();
    if (avisarAlTerminar) avisar("Orden de ruta guardado.");
  }

  async function resetearOrdenRuta(rutaActual) {
    const confirmar = window.confirm("¿Querés restablecer el orden automático de la ruta?");
    if (!confirmar) return;

    const updates = rutaActual.map((solicitud) =>
      supabase
        .from("solicitudes")
        .update({
          orden_ruta: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", solicitud.id)
    );

    const results = await Promise.all(updates);
    const error = results.find((r) => r.error)?.error;

    if (error) {
      avisar("Error restableciendo el orden: " + error.message, "error");
      return;
    }

    await cargarSolicitudes();
    avisar("Orden restablecido.");
  }

  async function optimizarRuta(rutaActual, puntoPartida) {
    if (rutaActual.length < 2) {
      avisar("Se necesitan al menos 2 paradas pendientes para optimizar la ruta.", "error");
      return;
    }

    setOptimizando({ actual: 0, total: rutaActual.length });

    const puntos = {};
    const sinUbicar = [];

    let base = null;
    if (puntoPartida && puntoPartida.trim()) {
      base = await geocodificar(puntoPartida.trim());
    }

    let procesadas = 0;
    for (const s of rutaActual) {
      const punto = await geocodificar(s.direccion);
      procesadas++;
      setOptimizando({ actual: procesadas, total: rutaActual.length });

      if (punto) puntos[s.id] = punto;
      else sinUbicar.push(s);
    }

    // Se optimiza dentro de cada fecha, manteniendo el orden de fechas.
    // Algoritmo del vecino más cercano: desde el punto de partida, siempre
    // la parada más cercana a la anterior.
    const fechas = [...new Set(rutaActual.map((s) => s.fecha))].sort();
    const ordenFinal = [];
    let posicionActual = base;

    for (const fecha of fechas) {
      const restantes = rutaActual.filter((s) => s.fecha === fecha && puntos[s.id]);

      while (restantes.length > 0) {
        let mejorIdx = 0;

        if (posicionActual) {
          let mejorDist = Infinity;
          restantes.forEach((s, idx) => {
            const d = distanciaKm(posicionActual, puntos[s.id]);
            if (d < mejorDist) {
              mejorDist = d;
              mejorIdx = idx;
            }
          });
        }

        const elegida = restantes.splice(mejorIdx, 1)[0];
        ordenFinal.push(elegida);
        posicionActual = puntos[elegida.id];
      }

      ordenFinal.push(...rutaActual.filter((s) => s.fecha === fecha && !puntos[s.id]));
    }

    setOptimizando(null);
    await guardarOrdenRuta(ordenFinal);

    if (sinUbicar.length > 0) {
      avisar(
        `Ruta optimizada. ${sinUbicar.length} dirección(es) no se pudieron ubicar en el mapa y quedaron al final. Revisá que estén bien escritas.`,
        "error"
      );
    } else {
      avisar("Ruta optimizada por cercanía. El orden nuevo ya está guardado.");
    }
  }

  async function actualizarLugar(lugar) {
    if (!lugar.nombre.trim() || !lugar.direccion.trim()) {
      avisar("Nombre y dirección son obligatorios.", "error");
      return;
    }

    const { error } = await supabase
      .from("lugares_predeterminados")
      .update({
        nombre: lugar.nombre.trim(),
        direccion: lugar.direccion.trim(),
        contacto: lugar.contacto || "",
        telefono: onlyNumbers(lugar.telefono || ""),
        detalle_base: "",
        sector_sugerido: "",
        updated_at: new Date().toISOString(),
      })
      .eq("id", lugar.id);

    if (error) {
      avisar("Error actualizando lugar: " + error.message, "error");
      return;
    }

    setLugarEditando(null);
    await cargarLugares();
    avisar("Lugar actualizado.");
  }

  async function desactivarLugar(id) {
    const confirmar = window.confirm("¿Seguro querés desactivar este lugar predeterminado?");
    if (!confirmar) return;

    const { error } = await supabase
      .from("lugares_predeterminados")
      .update({ activo: false, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) avisar("Error desactivando lugar: " + error.message, "error");
    else {
      await cargarLugares();
      avisar("Lugar desactivado.");
    }
  }

  const solicitudesVisibles = useMemo(() => {
    if (!fechaFiltro) return solicitudes;
    return solicitudes.filter((s) => s.fecha === fechaFiltro);
  }, [solicitudes, fechaFiltro]);

  const diasSemana = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(semanaInicio, i));
  }, [semanaInicio]);

  const solicitudesSemana = useMemo(() => {
    const finSemana = addDays(semanaInicio, 6);
    return solicitudes.filter((s) => s.fecha >= semanaInicio && s.fecha <= finSemana);
  }, [solicitudes, semanaInicio]);

  const ruta = useMemo(() => {
    return solicitudesVisibles
      .filter((s) => s.entregado !== true)
      .sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);

        const ordenA = a.orden_ruta ?? 9999;
        const ordenB = b.orden_ruta ?? 9999;
        if (ordenA !== ordenB) return ordenA - ordenB;

        if (a.prioridad === "Urgente" && b.prioridad !== "Urgente") return -1;
        if (a.prioridad !== "Urgente" && b.prioridad === "Urgente") return 1;

        return a.direccion.localeCompare(b.direccion, "es");
      });
  }, [solicitudesVisibles]);

  const historial = useMemo(() => {
    const limite = addDays(getToday(), -30);

    return solicitudes
      .filter((s) => s.entregado === true)
      .filter((s) => {
        const fechaReferencia = String(s.updated_at || s.fecha || "").slice(0, 10);
        return fechaReferencia >= limite;
      })
      .sort((a, b) => {
        const fechaA = String(a.updated_at || a.fecha || "").slice(0, 10);
        const fechaB = String(b.updated_at || b.fecha || "").slice(0, 10);
        return fechaB.localeCompare(fechaA);
      });
  }, [solicitudes]);

  const resumenCarga = useMemo(() => {
    const pendientes = ruta.filter((s) => s.entregado !== true);

    return {
      lleva: pendientes
        .filter((s) => s.lleva)
        .map((s) => ({
          id: `lleva-${s.id}`,
          fecha: formatDateAR(s.fecha),
          nombre: getNombreLugar(s, lugares),
          direccion: s.direccion,
          detalle: s.lleva,
        })),
      trae: pendientes
        .filter((s) => s.trae)
        .map((s) => ({
          id: `trae-${s.id}`,
          fecha: formatDateAR(s.fecha),
          nombre: getNombreLugar(s, lugares),
          direccion: s.direccion,
          detalle: s.trae,
        })),
    };
  }, [ruta, lugares]);

  const stats = useMemo(() => ({
    total: solicitudesVisibles.length,
    pendientes: solicitudesVisibles.filter((s) => s.entregado === null).length,
    entregadas: solicitudesVisibles.filter((s) => s.entregado === true).length,
    noEntregadas: solicitudesVisibles.filter((s) => s.entregado === false).length,
    urgentes: solicitudesVisibles.filter((s) => s.prioridad === "Urgente" && s.entregado !== true).length,
  }), [solicitudesVisibles]);

  const pendientesTotal = useMemo(
    () => solicitudes.filter((s) => s.entregado === null).length,
    [solicitudes]
  );

  const whatsappText = encodeURIComponent(
    `Transportista, ruta sugerida de Logística Sail${fechaFiltro ? ` para ${formatDateAR(fechaFiltro)}` : ""}:\n\n${ruta
      .map(
        (s, i) =>
          `${i + 1}) ${formatDateAR(s.fecha)} - ${s.direccion}\n${s.tipo_tarea} - ${s.detalle || "Sin detalle adicional"}\nLleva: ${s.lleva || "-"}\nTrae: ${s.trae || "-"}\nContacto: ${s.contacto} ${s.telefono}\nHorario: ${getHorario(s)}`
      )
      .join("\n\n")}\n\nMarcá cada parada como Entregado o No entregado al finalizar.`
  );

  return (
    <div className="page">
      <div className="container">
        <header className="header">
          <div>
            <p className="eyebrow">logisticasail.com</p>
            <h1>Logística Sail</h1>
            <p className="subtitle">Solicitudes internas, coordinación de paradas y ruta operativa para transportistas.</p>

            <p className="live-indicator">
              <span className="live-dot" />
              Actualización automática cada 1 minuto
              {ultimaActualizacion ? ` · Últ. actualización ${ultimaActualizacion}` : ""}
              <button className="link-refresh" type="button" onClick={() => refrescar(false)}>
                Actualizar ahora
              </button>
            </p>
          </div>

          <div className="stats">
            <Stat label="Total" value={stats.total} />
            <Stat label="Pend." value={stats.pendientes} />
            <Stat label="Entreg." value={stats.entregadas} />
            <Stat label="No ent." value={stats.noEntregadas} />
            <Stat label="Urg." value={stats.urgentes} />
          </div>
        </header>

        {solicitudEditando && (
          <EditorSolicitud
            solicitudEditando={solicitudEditando}
            setSolicitudEditando={setSolicitudEditando}
            lugares={lugares}
            elegirLugarEdicion={elegirLugarEdicion}
            guardarCambiosSolicitud={guardarCambiosSolicitud}
            eliminarSolicitud={eliminarSolicitud}
          />
        )}

        <nav className="tabs">
          <Button variant={tab === "empleado" ? "primary" : "outline"} onClick={() => setTab("empleado")}>Empleado</Button>
          <Button variant={tab === "semana" ? "primary" : "outline"} onClick={() => setTab("semana")}>Semana</Button>
          <Button variant={tab === "transportista" ? "primary" : "outline"} onClick={() => setTab("transportista")}>
            Transportista{pendientesTotal > 0 && <span className="tab-count">{pendientesTotal}</span>}
          </Button>
          <Button variant={tab === "resumen" ? "primary" : "outline"} onClick={() => setTab("resumen")}>Resumen carga</Button>
          <Button variant={tab === "historial" ? "primary" : "outline"} onClick={() => setTab("historial")}>Historial</Button>
          <Button variant={tab === "lugares" ? "primary" : "outline"} onClick={() => setTab("lugares")}>Lugares</Button>
        </nav>

        {loading ? (
          <div className="card loading-card">
            <span className="spinner" /> Cargando solicitudes...
          </div>
        ) : (
          <>
            {tab === "empleado" && (
              <EmpleadoForm
                form={form}
                setForm={setForm}
                lugares={lugares}
                elegirLugar={elegirLugar}
                crearSolicitud={crearSolicitud}
              />
            )}

            {tab === "semana" && (
              <SemanaView
                semanaInicio={semanaInicio}
                setSemanaInicio={setSemanaInicio}
                diasSemana={diasSemana}
                solicitudesSemana={solicitudesSemana}
                cambiarFecha={cambiarFecha}
                empezarEdicion={empezarEdicion}
                marcar={marcar}
                lugares={lugares}
              />
            )}

            {tab === "transportista" && (
              <TransportistaView
                fechaFiltro={fechaFiltro}
                setFechaFiltro={setFechaFiltro}
                ruta={ruta}
                whatsappText={whatsappText}
                guardarOrdenRuta={guardarOrdenRuta}
                resetearOrdenRuta={resetearOrdenRuta}
                optimizarRuta={optimizarRuta}
                optimizando={optimizando}
                empezarEdicion={empezarEdicion}
                marcar={marcar}
                lugares={lugares}
              />
            )}

            {tab === "resumen" && (
              <ResumenCarga fechaFiltro={fechaFiltro} setFechaFiltro={setFechaFiltro} resumenCarga={resumenCarga} />
            )}

            {tab === "historial" && (
              <HistorialView
                historial={historial}
                volverAPendiente={volverAPendiente}
                empezarEdicion={empezarEdicion}
                lugares={lugares}
              />
            )}

            {tab === "lugares" && (
              <LugaresView
                lugares={lugares}
                lugarEditando={lugarEditando}
                setLugarEditando={setLugarEditando}
                actualizarLugar={actualizarLugar}
                desactivarLugar={desactivarLugar}
                nuevoLugar={nuevoLugar}
                setNuevoLugar={setNuevoLugar}
                crearLugarManual={crearLugarManual}
              />
            )}
          </>
        )}
      </div>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tipo}`}>
            {t.mensaje}
          </div>
        ))}
      </div>
    </div>
  );
}

function EmpleadoForm({ form, setForm, lugares, elegirLugar, crearSolicitud }) {
  return (
    <section className="card">
      <p className="eyebrow">Empleado</p>
      <h2>Nueva solicitud para transportista</h2>
      <p className="muted">Los campos marcados con * son obligatorios.</p>

      <form onSubmit={crearSolicitud} className="form">
        <Field label="Lugar predeterminado">
          <select value={form.lugar_predeterminado_id} onChange={(e) => elegirLugar(e.target.value)}>
            <option value="">Cargar dirección manual</option>
            {lugares.map((lugar) => (
              <option key={lugar.id} value={lugar.id}>{lugar.nombre}</option>
            ))}
          </select>
        </Field>

        <div className="grid">
          <Field label="Fecha" required>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Field>

          <Field label="Sector solicitante" required>
            <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
              {sectores.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid">
          <Field label="Tipo de tarea" required>
            <select value={form.tipo_tarea} onChange={(e) => setForm({ ...form, tipo_tarea: e.target.value })}>
              {tipos.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>

          <Field label="Prioridad" required>
            <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
              {prioridades.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Dirección completa" required>
          <input placeholder="Ej: Arcos 2140, Belgrano" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
        </Field>

        <div className="grid">
          <Field label="Horario" required>
            <select
              value={form.horario_tipo}
              onChange={(e) =>
                setForm({
                  ...form,
                  horario_tipo: e.target.value,
                  horario_hora: "",
                  horario_desde: "",
                  horario_hasta: "",
                })
              }
            >
              {horarios.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>

          <HorarioCampos value={form} onChange={setForm} />
        </div>

        <div className="grid">
          <Field label="Contacto en destino" required>
            <input placeholder="Nombre" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
          </Field>

          <Field label="Teléfono de contacto" required>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Solo números"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: onlyNumbers(e.target.value) })}
            />
          </Field>
        </div>

        <div className="grid">
          <Field label="Qué lleva" required={requiereLleva(form.tipo_tarea)}>
            <textarea
              placeholder={requiereLleva(form.tipo_tarea) ? "Campo obligatorio. Ej: prendas, cajas, remito." : "Opcional."}
              value={form.lleva}
              onChange={(e) => setForm({ ...form, lleva: e.target.value })}
            />
          </Field>

          <Field label="Qué trae" required={requiereTrae(form.tipo_tarea)}>
            <textarea
              placeholder={requiereTrae(form.tipo_tarea) ? "Campo obligatorio. Ej: producción, cambios, documentación." : "Opcional."}
              value={form.trae}
              onChange={(e) => setForm({ ...form, trae: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Detalle de la tarea">
          <textarea placeholder="Opcional. Aclaración adicional para transportista." value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} />
        </Field>

        <Button type="submit">Enviar solicitud</Button>
      </form>
    </section>
  );
}

function EditorSolicitud({ solicitudEditando, setSolicitudEditando, lugares, elegirLugarEdicion, guardarCambiosSolicitud, eliminarSolicitud }) {
  return (
    <section className="card editor-card">
      <p className="eyebrow">Editar solicitud</p>
      <h2>Modificar o eliminar solicitud</h2>

      <form onSubmit={guardarCambiosSolicitud} className="form">
        <Field label="Lugar predeterminado">
          <select value={solicitudEditando.lugar_predeterminado_id || ""} onChange={(e) => elegirLugarEdicion(e.target.value)}>
            <option value="">Sin lugar predeterminado</option>
            {lugares.map((lugar) => (
              <option key={lugar.id} value={lugar.id}>{lugar.nombre}</option>
            ))}
          </select>
        </Field>

        <div className="grid">
          <Field label="Fecha" required>
            <input type="date" value={solicitudEditando.fecha} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, fecha: e.target.value })} />
          </Field>

          <Field label="Sector solicitante" required>
            <select value={solicitudEditando.sector} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, sector: e.target.value })}>
              {sectores.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid">
          <Field label="Tipo de tarea" required>
            <select value={solicitudEditando.tipo_tarea} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, tipo_tarea: e.target.value })}>
              {tipos.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>

          <Field label="Prioridad" required>
            <select value={solicitudEditando.prioridad} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, prioridad: e.target.value })}>
              {prioridades.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Dirección completa" required>
          <input value={solicitudEditando.direccion} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, direccion: e.target.value })} />
        </Field>

        <div className="grid">
          <Field label="Horario" required>
            <select
              value={solicitudEditando.horario_tipo}
              onChange={(e) =>
                setSolicitudEditando({
                  ...solicitudEditando,
                  horario_tipo: e.target.value,
                  horario_hora: "",
                  horario_desde: "",
                  horario_hasta: "",
                })
              }
            >
              {horarios.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>

          <HorarioCampos value={solicitudEditando} onChange={setSolicitudEditando} />
        </div>

        <div className="grid">
          <Field label="Contacto en destino" required>
            <input value={solicitudEditando.contacto} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, contacto: e.target.value })} />
          </Field>

          <Field label="Teléfono de contacto" required>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              value={solicitudEditando.telefono}
              onChange={(e) => setSolicitudEditando({ ...solicitudEditando, telefono: onlyNumbers(e.target.value) })}
            />
          </Field>
        </div>

        <div className="grid">
          <Field label="Qué lleva" required={requiereLleva(solicitudEditando.tipo_tarea)}>
            <textarea value={solicitudEditando.lleva || ""} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, lleva: e.target.value })} />
          </Field>

          <Field label="Qué trae" required={requiereTrae(solicitudEditando.tipo_tarea)}>
            <textarea value={solicitudEditando.trae || ""} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, trae: e.target.value })} />
          </Field>
        </div>

        <Field label="Detalle de la tarea">
          <textarea value={solicitudEditando.detalle || ""} onChange={(e) => setSolicitudEditando({ ...solicitudEditando, detalle: e.target.value })} />
        </Field>

        <div className="actions">
          <Button type="submit" variant="success">Guardar cambios</Button>
          <Button type="button" variant="outline" onClick={() => setSolicitudEditando(null)}>Cancelar</Button>
          <Button type="button" variant="danger" onClick={() => eliminarSolicitud(solicitudEditando.id)}>Eliminar solicitud</Button>
        </div>
      </form>
    </section>
  );
}

function SemanaView({ semanaInicio, setSemanaInicio, diasSemana, solicitudesSemana, cambiarFecha, empezarEdicion, marcar, lugares }) {
  return (
    <section className="card">
      <div className="topline">
        <div>
          <p className="eyebrow">Vista semanal</p>
          <h2>Semana del {formatDateAR(semanaInicio)}</h2>
          <p className="muted">Podés mover solicitudes de día si conviene resolverlas antes.</p>
        </div>

        <Field label="Inicio de semana">
          <input type="date" value={semanaInicio} onChange={(e) => setSemanaInicio(getMonday(e.target.value))} />
        </Field>
      </div>

      <div className="list">
        {diasSemana.map((dia) => {
          const items = solicitudesSemana.filter((s) => s.fecha === dia);

          return (
            <div key={dia} className="card dia-card">
              <h2 className="dia-titulo">
                {formatDateLabel(dia)}
                {items.length > 0 && <span className="tab-count">{items.length}</span>}
              </h2>
              {items.length === 0 && <p className="muted">Sin solicitudes.</p>}

              <div className="list">
                {items.map((s) => (
                  <SolicitudCard key={s.id} s={s} lugares={lugares}>
                    <Field label="Mover a fecha">
                      <input type="date" value={s.fecha} onChange={(e) => cambiarFecha(s.id, e.target.value)} />
                    </Field>

                    <Button variant="outline" onClick={() => empezarEdicion(s)}>Editar</Button>
                    <Button variant="success" onClick={() => marcar(s.id, true)}>Entregado</Button>
                    <Button variant="danger" onClick={() => marcar(s.id, false)}>No entregado</Button>
                  </SolicitudCard>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TransportistaView({
  fechaFiltro,
  setFechaFiltro,
  ruta,
  whatsappText,
  guardarOrdenRuta,
  resetearOrdenRuta,
  optimizarRuta,
  optimizando,
  empezarEdicion,
  marcar,
  lugares,
}) {
  const [rutaLocal, setRutaLocal] = useState(ruta);
  const [guardandoOrden, setGuardandoOrden] = useState(false);

  const [puntoPartida, setPuntoPartida] = useState(() => {
    try {
      return localStorage.getItem("sail_punto_partida") || "";
    } catch {
      return "";
    }
  });

  function cambiarPuntoPartida(valor) {
    setPuntoPartida(valor);
    try {
      localStorage.setItem("sail_punto_partida", valor);
    } catch {
      // sin storage disponible: solo dura la sesión
    }
  }

  useEffect(() => {
    setRutaLocal(ruta);
  }, [ruta]);

  async function moverItem(index, direccion) {
    const nuevoIndex = direccion === "subir" ? index - 1 : index + 1;
    if (nuevoIndex < 0 || nuevoIndex >= rutaLocal.length) return;

    const nuevaRuta = [...rutaLocal];
    const item = nuevaRuta[index];

    nuevaRuta.splice(index, 1);
    nuevaRuta.splice(nuevoIndex, 0, item);

    setRutaLocal(nuevaRuta);
    setGuardandoOrden(true);

    await guardarOrdenRuta(nuevaRuta);

    setGuardandoOrden(false);
  }

  const hayParadas = rutaLocal.length > 0;

  return (
    <section className="card">
      <div className="topline">
        <div>
          <p className="eyebrow">Transportista</p>
          <h2>Ruta del transportista</h2>
          <p className="muted">
            Podés optimizar la ruta automáticamente por cercanía, o acomodarla a mano con Subir y Bajar.
          </p>
        </div>

        <div className="actions">
          <Field label="Filtrar por fecha">
            <input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} />
          </Field>

          <Button variant="outline" type="button" onClick={() => setFechaFiltro(getToday())}>Hoy</Button>
          <Button variant="outline" type="button" onClick={() => setFechaFiltro("")}>Ver todas</Button>
        </div>
      </div>

      <div className="card optimizador">
        <h2>Ruta óptima automática</h2>
        <p className="muted">
          Escribí desde dónde arranca el transportista (depósito u oficina) y apretá Optimizar:
          la app ubica cada dirección en el mapa y arma el recorrido más corto, parada por parada.
        </p>

        <div className="optimizador-fila">
          <Field label="Punto de partida (se guarda para la próxima)">
            <input
              placeholder="Ej: Arcos 2140, Belgrano, CABA"
              value={puntoPartida}
              onChange={(e) => cambiarPuntoPartida(e.target.value)}
            />
          </Field>

          <div className="actions">
            <Button
              type="button"
              disabled={Boolean(optimizando) || !hayParadas}
              onClick={() => optimizarRuta(rutaLocal, puntoPartida)}
            >
              {optimizando ? "Optimizando..." : "Optimizar ruta"}
            </Button>

            {hayParadas && (
              <a href={urlRutaCompletaMaps(rutaLocal, puntoPartida)} target="_blank" rel="noreferrer">
                <Button variant="outline" type="button">Ver recorrido en Maps</Button>
              </a>
            )}

            <Button variant="outline" type="button" onClick={() => resetearOrdenRuta(rutaLocal)}>
              Restablecer orden
            </Button>

            <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer">
              <Button type="button">WhatsApp</Button>
            </a>
          </div>
        </div>

        {optimizando && (
          <div className="optimizando">
            <p className="muted">
              Ubicando direcciones y calculando el mejor recorrido... ({optimizando.actual} de {optimizando.total})
            </p>
            <div className="progress">
              <div
                className="progress-fill"
                style={{ width: `${Math.round((optimizando.actual / optimizando.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <p className="notice">
        El cambio de orden se ve al instante y luego se guarda. Cuando una orden se marca como Entregado, pasa al Historial.
        {guardandoOrden ? " Guardando orden..." : ""}
      </p>

      <div className="list">
        {rutaLocal.length === 0 && (
          <div className="empty-state">
            <p>No quedan paradas pendientes para mostrar.</p>
          </div>
        )}

        {rutaLocal.map((s, i) => (
          <div key={s.id} className="route-item">
            <div className="route-number">{i + 1}</div>

            <SolicitudCard s={s} lugares={lugares}>
              <div className="actions">
                <Button
                  variant="outline"
                  type="button"
                  disabled={i === 0}
                  onClick={() => moverItem(i, "subir")}
                >
                  Subir
                </Button>

                <Button
                  variant="outline"
                  type="button"
                  disabled={i === rutaLocal.length - 1}
                  onClick={() => moverItem(i, "bajar")}
                >
                  Bajar
                </Button>
              </div>

              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.direccion)}`} target="_blank" rel="noreferrer">
                <Button variant="outline">Abrir Maps</Button>
              </a>

              <Button variant="outline" onClick={() => empezarEdicion(s)}>Editar</Button>
              <Button variant="success" onClick={() => marcar(s.id, true)}>Entregado</Button>
              <Button variant="danger" onClick={() => marcar(s.id, false)}>No entregado</Button>
            </SolicitudCard>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistorialView({ historial, volverAPendiente, empezarEdicion, lugares }) {
  return (
    <section className="card">
      <p className="eyebrow">Historial</p>
      <h2>Órdenes entregadas</h2>
      <p className="muted">
        Acá aparecen las órdenes marcadas como entregadas durante los últimos 30 días. Si una se marcó por error, podés volverla a pendiente.
      </p>

      <div className="list">
        {historial.length === 0 && (
          <div className="empty-state">
            <p>No hay órdenes entregadas en los últimos 30 días.</p>
          </div>
        )}

        {historial.map((s) => (
          <SolicitudCard key={s.id} s={s} lugares={lugares}>
            <Button variant="outline" onClick={() => empezarEdicion(s)}>Editar</Button>
            <Button variant="danger" onClick={() => volverAPendiente(s.id)}>Volver a pendiente</Button>
          </SolicitudCard>
        ))}
      </div>
    </section>
  );
}

function ResumenCarga({ fechaFiltro, setFechaFiltro, resumenCarga }) {
  function renderResumenItem(item) {
    return (
      <div key={item.id} className="resumen-simple-item">
        <div className="resumen-simple-fecha">{item.fecha}</div>
        <div className="resumen-simple-nombre">{item.nombre}</div>
        <div className="resumen-simple-detalle">{item.detalle}</div>
      </div>
    );
  }

  return (
    <section className="card">
      <div className="topline">
        <div>
          <p className="eyebrow">Resumen de carga</p>
          <h2>Qué lleva y qué trae el transportista</h2>
          <p className="muted">Basado en las paradas pendientes visibles. Podés filtrar por fecha o ver todas.</p>
        </div>

        <div className="actions">
          <Field label="Filtrar por fecha">
            <input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} />
          </Field>
          <Button variant="outline" type="button" onClick={() => setFechaFiltro(getToday())}>Hoy</Button>
          <Button variant="outline" type="button" onClick={() => setFechaFiltro("")}>Ver todas</Button>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Lleva</h2>
          {resumenCarga.lleva.length === 0 && <p className="muted">Sin carga registrada para llevar.</p>}
          <div className="resumen-simple-lista">
            {resumenCarga.lleva.map((item) => renderResumenItem(item))}
          </div>
        </div>

        <div className="card">
          <h2>Trae</h2>
          {resumenCarga.trae.length === 0 && <p className="muted">Sin carga registrada para traer.</p>}
          <div className="resumen-simple-lista">
            {resumenCarga.trae.map((item) => renderResumenItem(item))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LugaresView({
  lugares,
  lugarEditando,
  setLugarEditando,
  actualizarLugar,
  desactivarLugar,
  nuevoLugar,
  setNuevoLugar,
  crearLugarManual,
}) {
  return (
    <section className="card">
      <p className="eyebrow">Lugares predeterminados</p>
      <h2>Administrar lugares guardados</h2>
      <p className="muted">Los lugares se ordenan alfabéticamente por nombre. Guardá solo datos fijos: nombre, dirección, contacto y teléfono.</p>

      <div className="card">
        <h2>Nuevo lugar predeterminado</h2>

        <form onSubmit={crearLugarManual} className="form">
          <Field label="Nombre del lugar" required>
            <input
              placeholder="Ej: Taller Beto"
              value={nuevoLugar.nombre}
              onChange={(e) => setNuevoLugar({ ...nuevoLugar, nombre: e.target.value })}
            />
          </Field>

          <Field label="Dirección completa" required>
            <input
              placeholder="Ej: Av. Avellaneda 3200, Flores"
              value={nuevoLugar.direccion}
              onChange={(e) => setNuevoLugar({ ...nuevoLugar, direccion: e.target.value })}
            />
          </Field>

          <div className="grid">
            <Field label="Contacto">
              <input
                placeholder="Ej: Beto"
                value={nuevoLugar.contacto}
                onChange={(e) => setNuevoLugar({ ...nuevoLugar, contacto: e.target.value })}
              />
            </Field>

            <Field label="Teléfono de contacto">
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Solo números"
                value={nuevoLugar.telefono}
                onChange={(e) => setNuevoLugar({ ...nuevoLugar, telefono: onlyNumbers(e.target.value) })}
              />
            </Field>
          </div>

          <Button type="submit">Guardar lugar</Button>
        </form>
      </div>

      <div className="list">
        {lugares.length === 0 && (
          <div className="empty-state">
            <p>Todavía no hay lugares guardados.</p>
          </div>
        )}

        {lugares.map((lugar) => {
          const editando = lugarEditando?.id === lugar.id;
          const item = editando ? lugarEditando : lugar;

          return (
            <div key={lugar.id} className="request">
              <div style={{ flex: 1 }}>
                {editando ? (
                  <div className="form">
                    <Field label="Nombre del lugar" required>
                      <input value={item.nombre || ""} onChange={(e) => setLugarEditando({ ...item, nombre: e.target.value })} />
                    </Field>

                    <Field label="Dirección completa" required>
                      <input value={item.direccion || ""} onChange={(e) => setLugarEditando({ ...item, direccion: e.target.value })} />
                    </Field>

                    <div className="grid">
                      <Field label="Contacto">
                        <input value={item.contacto || ""} onChange={(e) => setLugarEditando({ ...item, contacto: e.target.value })} />
                      </Field>

                      <Field label="Teléfono de contacto">
                        <input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={item.telefono || ""}
                          onChange={(e) => setLugarEditando({ ...item, telefono: onlyNumbers(e.target.value) })}
                        />
                      </Field>
                    </div>
                  </div>
                ) : (
                  <>
                    <strong>{lugar.nombre}</strong>
                    <p>{lugar.direccion}</p>
                    <p className="small">Contacto: {lugar.contacto || "-"} · {lugar.telefono || "-"}</p>
                  </>
                )}
              </div>

              <div className="actions">
                {editando ? (
                  <>
                    <Button variant="success" onClick={() => actualizarLugar(item)}>Guardar</Button>
                    <Button variant="outline" onClick={() => setLugarEditando(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setLugarEditando(lugar)}>Editar</Button>
                    <Button variant="danger" onClick={() => desactivarLugar(lugar.id)}>Desactivar</Button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {children}
    </label>
  );
}

function SolicitudCard({ s, lugares = [], children }) {
  const lugar = lugares.find((l) => l.id === s.lugar_predeterminado_id);

  return (
    <article className={`request ${s.prioridad === "Urgente" && s.entregado !== true ? "urgente" : ""}`}>
      <div>
        <div className="request-head">
          <strong>
            {formatDateAR(s.fecha)} · {s.tipo_tarea} · {s.sector}
          </strong>

          <Badge entregado={s.entregado} />

          {s.prioridad === "Urgente" && <span className="badge urgent">Urgente</span>}
        </div>

        <p>
          {lugar && <strong>{lugar.nombre} · </strong>}
          {s.direccion}
        </p>
        <p className="muted">{getHorario(s)}</p>

        <div className="notice">
          <strong>Lleva:</strong> {s.lleva || "-"}
          <br />
          <strong>Trae:</strong> {s.trae || "-"}
        </div>

        {s.detalle && <p>{s.detalle}</p>}

        <p className="small">
          Contacto: {s.contacto} · {s.telefono}
        </p>
      </div>

      {children && <div className="actions">{children}</div>}
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);

