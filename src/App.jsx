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

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getHorario(item) {
  if (item.horario_tipo === "Flexible") return "Flexible";
  return item.horario_detalle || item.horario_tipo || "";
}

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

function App() {
  const [tab, setTab] = useState("empleado");
  const [solicitudes, setSolicitudes] = useState([]);
  const [lugares, setLugares] = useState([]);
  const [loading, setLoading] = useState(true);

  // Vacío = mostrar todas las fechas
  const [fechaFiltro, setFechaFiltro] = useState("");

  const [form, setForm] = useState({
    fecha: getToday(),
    sector: "Ventas",
    tipo_tarea: "Entrega",
    direccion: "",
    horario_tipo: "Flexible",
    horario_detalle: "",
    prioridad: "Normal",
    contacto: "",
    telefono: "",
    detalle: "",
    lleva: "",
    trae: "",
    lugar_predeterminado_id: "",
  });

  async function cargarSolicitudes() {
    const { data, error } = await supabase
      .from("solicitudes")
      .select("*")
      .order("fecha", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      alert("Error cargando solicitudes: " + error.message);
    } else {
      setSolicitudes(data || []);
    }
  }

  async function cargarLugares() {
    const { data, error } = await supabase
      .from("lugares_predeterminados")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      alert("Error cargando lugares predeterminados: " + error.message);
    } else {
      setLugares(data || []);
    }
  }

  async function cargarTodo() {
    setLoading(true);
    await Promise.all([cargarSolicitudes(), cargarLugares()]);
    setLoading(false);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  function elegirLugar(id) {
    if (!id) {
      setForm({
        ...form,
        lugar_predeterminado_id: "",
      });
      return;
    }

    const lugar = lugares.find((l) => l.id === id);
    if (!lugar) return;

    setForm({
      ...form,
      lugar_predeterminado_id: lugar.id,
      direccion: lugar.direccion || "",
      contacto: lugar.contacto || "",
      telefono: lugar.telefono || "",
      detalle: lugar.detalle_base || form.detalle,
      sector: lugar.sector_sugerido || form.sector,
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
      detalle_base: payload.detalle || "",
      sector_sugerido: payload.sector,
      activo: true,
    });

    if (error) {
      alert("Error guardando lugar predeterminado: " + error.message);
      return;
    }

    await cargarLugares();
    alert("Lugar guardado como predeterminado.");
  }

  async function crearSolicitud(e) {
    e.preventDefault();

    if (
      !form.fecha ||
      !form.sector ||
      !form.tipo_tarea ||
      !form.direccion.trim() ||
      !form.prioridad ||
      !form.contacto.trim() ||
      !form.telefono.trim() ||
      !form.lleva.trim() ||
      !form.trae.trim()
    ) {
      alert("Completá todos los campos obligatorios marcados con *.");
      return;
    }

    if (form.horario_tipo !== "Flexible" && !form.horario_detalle.trim()) {
      alert("Completá el detalle del horario.");
      return;
    }

    const payload = {
      fecha: form.fecha,
      sector: form.sector,
      tipo_tarea: form.tipo_tarea,
      direccion: form.direccion.trim(),
      horario_tipo: form.horario_tipo,
      horario_detalle: form.horario_tipo === "Flexible" ? "Flexible" : form.horario_detalle.trim(),
      prioridad: form.prioridad,
      contacto: form.contacto.trim(),
      telefono: form.telefono.trim(),
      detalle: form.detalle.trim(),
      lleva: form.lleva.trim(),
      trae: form.trae.trim(),
      lugar_predeterminado_id: form.lugar_predeterminado_id || null,
      entregado: null,
    };

    const { error } = await supabase.from("solicitudes").insert(payload);

    if (error) {
      alert("Error guardando solicitud: " + error.message);
      return;
    }

    await cargarSolicitudes();

    if (!form.lugar_predeterminado_id) {
      const quiereGuardar = window.confirm("Solicitud cargada. ¿Querés guardar esta dirección como lugar predeterminado?");
      if (quiereGuardar) {
        await guardarLugarPredeterminado(payload);
      }
    } else {
      alert("Solicitud cargada.");
    }

    setForm({
      ...form,
      direccion: "",
      horario_tipo: "Flexible",
      horario_detalle: "",
      prioridad: "Normal",
      contacto: "",
      telefono: "",
      detalle: "",
      lleva: "",
      trae: "",
      lugar_predeterminado_id: "",
    });
  }

  async function marcar(id, value) {
    const { error } = await supabase
      .from("solicitudes")
      .update({
        entregado: value,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      alert("Error actualizando solicitud: " + error.message);
      return;
    }

    await cargarSolicitudes();
  }

  const solicitudesVisibles = useMemo(() => {
    if (!fechaFiltro) return solicitudes;
    return solicitudes.filter((s) => s.fecha === fechaFiltro);
  }, [solicitudes, fechaFiltro]);

  const ruta = useMemo(() => {
    return solicitudesVisibles
      .filter((s) => s.entregado !== true)
      .sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        if (a.prioridad === "Urgente" && b.prioridad !== "Urgente") return -1;
        if (a.prioridad !== "Urgente" && b.prioridad === "Urgente") return 1;
        return a.direccion.localeCompare(b.direccion, "es");
      });
  }, [solicitudesVisibles]);

  const stats = useMemo(() => {
    return {
      total: solicitudesVisibles.length,
      pendientes: solicitudesVisibles.filter((s) => s.entregado === null).length,
      entregadas: solicitudesVisibles.filter((s) => s.entregado === true).length,
      noEntregadas: solicitudesVisibles.filter((s) => s.entregado === false).length,
      urgentes: solicitudesVisibles.filter((s) => s.prioridad === "Urgente" && s.entregado !== true).length,
    };
  }, [solicitudesVisibles]);

  const whatsappText = encodeURIComponent(
    `Ernesto, ruta sugerida de Logística Sail${fechaFiltro ? ` para ${fechaFiltro}` : ""}:\n\n${ruta
      .map(
        (s, i) =>
          `${i + 1}) ${s.fecha} - ${s.direccion}\n${s.tipo_tarea} - ${s.detalle || "Sin detalle adicional"}\nLleva: ${s.lleva || "-"}\nTrae: ${s.trae || "-"}\nContacto: ${s.contacto} ${s.telefono}\nHorario: ${getHorario(s)}`
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
            <p className="subtitle">Solicitudes internas, coordinación de paradas y ruta operativa para Ernesto.</p>
          </div>

          <div className="stats">
            <Stat label="Total" value={stats.total} />
            <Stat label="Pend." value={stats.pendientes} />
            <Stat label="Entreg." value={stats.entregadas} />
            <Stat label="No ent." value={stats.noEntregadas} />
            <Stat label="Urg." value={stats.urgentes} />
          </div>
        </header>

        <nav className="tabs">
          <Button variant={tab === "empleado" ? "primary" : "outline"} onClick={() => setTab("empleado")}>
            Empleado
          </Button>
          <Button variant={tab === "coordinacion" ? "primary" : "outline"} onClick={() => setTab("coordinacion")}>
            Coordinación
          </Button>
          <Button variant={tab === "ernesto" ? "primary" : "outline"} onClick={() => setTab("ernesto")}>
            Ernesto
          </Button>
        </nav>

        {loading ? (
          <div className="card">Cargando solicitudes...</div>
        ) : (
          <>
            {tab === "empleado" && (
              <section className="card">
                <p className="eyebrow">Empleado</p>
                <h2>Nueva solicitud para Ernesto</h2>
                <p className="muted">Los campos marcados con * son obligatorios.</p>

                <form onSubmit={crearSolicitud} className="form">
                  <Field label="Lugar predeterminado">
                    <select value={form.lugar_predeterminado_id} onChange={(e) => elegirLugar(e.target.value)}>
                      <option value="">Cargar dirección manual</option>
                      {lugares.map((lugar) => (
                        <option key={lugar.id} value={lugar.id}>
                          {lugar.nombre}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="grid">
                    <Field label="Fecha" required>
                      <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                    </Field>

                    <Field label="Sector" required>
                      <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
                        {sectores.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid">
                    <Field label="Tipo de tarea" required>
                      <select value={form.tipo_tarea} onChange={(e) => setForm({ ...form, tipo_tarea: e.target.value })}>
                        {tipos.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Prioridad" required>
                      <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                        {prioridades.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Dirección completa" required>
                    <input
                      placeholder="Ej: Arcos 2140, Belgrano"
                      value={form.direccion}
                      onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                    />
                  </Field>

                  <div className="grid">
                    <Field label="Horario" required>
                      <select
                        value={form.horario_tipo}
                        onChange={(e) => setForm({ ...form, horario_tipo: e.target.value, horario_detalle: "" })}
                      >
                        {horarios.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>

                    {form.horario_tipo !== "Flexible" && (
                      <Field label="Detalle horario" required>
                        <input
                          placeholder="Ej: Antes de 15:00 / 10:00 a 13:00"
                          value={form.horario_detalle}
                          onChange={(e) => setForm({ ...form, horario_detalle: e.target.value })}
                        />
                      </Field>
                    )}
                  </div>

                  <div className="grid">
                    <Field label="Contacto en destino" required>
                      <input placeholder="Nombre" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
                    </Field>

                    <Field label="Teléfono" required>
                      <input placeholder="WhatsApp" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                    </Field>
                  </div>

                  <div className="grid">
                    <Field label="Qué lleva" required>
                      <textarea
                        placeholder="Ej: 3 cajas, prendas, remito, muestras, avíos. Si no lleva nada, escribir: Nada."
                        value={form.lleva}
                        onChange={(e) => setForm({ ...form, lleva: e.target.value })}
                      />
                    </Field>

                    <Field label="Qué trae" required>
                      <textarea
                        placeholder="Ej: producción terminada, cambios, bolsas, documentación. Si no trae nada, escribir: Nada."
                        value={form.trae}
                        onChange={(e) => setForm({ ...form, trae: e.target.value })}
                      />
                    </Field>
                  </div>

                  <Field label="Detalle de la tarea">
                    <textarea
                      placeholder="Opcional. Aclaración adicional para Ernesto."
                      value={form.detalle}
                      onChange={(e) => setForm({ ...form, detalle: e.target.value })}
                    />
                  </Field>

                  <Button type="submit">Enviar solicitud</Button>
                </form>
              </section>
            )}

            {tab === "coordinacion" && (
              <section className="card">
                <div className="topline">
                  <div>
                    <p className="eyebrow">Coordinación</p>
                    <h2>Panel de solicitudes</h2>
                    <p className="muted">Por defecto se muestran todas las solicitudes. Podés filtrar por fecha.</p>
                  </div>

                  <div className="actions">
                    <Field label="Filtrar por fecha">
                      <input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} />
                    </Field>
                    <Button variant="outline" type="button" onClick={() => setFechaFiltro("")}>
                      Ver todas
                    </Button>
                  </div>
                </div>

                <div className="list">
                  {solicitudesVisibles.length === 0 && <p className="muted">No hay solicitudes para mostrar.</p>}

                  {solicitudesVisibles.map((s) => (
                    <SolicitudCard key={s.id} s={s}>
                      <Button variant="success" onClick={() => marcar(s.id, true)}>
                        Entregado
                      </Button>
                      <Button variant="danger" onClick={() => marcar(s.id, false)}>
                        No entregado
                      </Button>
                      <Button variant="outline" onClick={() => marcar(s.id, null)}>
                        Pendiente
                      </Button>
                    </SolicitudCard>
                  ))}
                </div>
              </section>
            )}

            {tab === "ernesto" && (
              <section className="card">
                <div className="topline">
                  <div>
                    <p className="eyebrow">Transportista</p>
                    <h2>Ruta de Ernesto</h2>
                    <p className="muted">Por defecto ve todas las paradas pendientes. También puede filtrar por fecha.</p>
                  </div>

                  <div className="actions">
                    <Field label="Filtrar por fecha">
                      <input type="date" value={fechaFiltro} onChange={(e) => setFechaFiltro(e.target.value)} />
                    </Field>

                    <Button variant="outline" type="button" onClick={() => setFechaFiltro("")}>
                      Ver todas
                    </Button>

                    <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer">
                      <Button>WhatsApp</Button>
                    </a>
                  </div>
                </div>

                <p className="notice">
                  Esta versión muestra todas las pendientes por defecto. Si filtrás por fecha, solo muestra las paradas de ese día.
                </p>

                <div className="list">
                  {ruta.length === 0 && <p className="muted">No quedan paradas pendientes para mostrar.</p>}

                  {ruta.map((s, i) => (
                    <div key={s.id} className="route-item">
                      <div className="route-number">{i + 1}</div>

                      <SolicitudCard s={s}>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.direccion)}`} target="_blank" rel="noreferrer">
                          <Button variant="outline">Abrir Maps</Button>
                        </a>

                        <Button variant="success" onClick={() => marcar(s.id, true)}>
                          Entregado
                        </Button>

                        <Button variant="danger" onClick={() => marcar(s.id, false)}>
                          No entregado
                        </Button>
                      </SolicitudCard>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
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

function SolicitudCard({ s, children }) {
  return (
    <article className="request">
      <div>
        <div className="request-head">
          <strong>
            {s.fecha} · {s.tipo_tarea} · {s.sector}
          </strong>

          <Badge entregado={s.entregado} />

          {s.prioridad === "Urgente" && <span className="badge urgent">Urgente</span>}
        </div>

        <p>{s.direccion}</p>
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
