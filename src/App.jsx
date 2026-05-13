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
  const [loading, setLoading] = useState(true);

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
  });

  async function cargarSolicitudes() {
    setLoading(true);

    const { data, error } = await supabase
      .from("solicitudes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert("Error cargando solicitudes: " + error.message);
    } else {
      setSolicitudes(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    cargarSolicitudes();
  }, []);

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
      !form.detalle.trim()
    ) {
      alert("Completá todos los campos obligatorios.");
      return;
    }

    if (form.horario_tipo !== "Flexible" && !form.horario_detalle.trim()) {
      alert("Completá el detalle del horario.");
      return;
    }

    const payload = {
      ...form,
      direccion: form.direccion.trim(),
      contacto: form.contacto.trim(),
      telefono: form.telefono.trim(),
      detalle: form.detalle.trim(),
      horario_detalle: form.horario_tipo === "Flexible" ? "Flexible" : form.horario_detalle.trim(),
      entregado: null,
    };

    const { error } = await supabase.from("solicitudes").insert(payload);

    if (error) {
      alert("Error guardando solicitud: " + error.message);
      return;
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
    });

    await cargarSolicitudes();
    alert("Solicitud cargada.");
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

  const ruta = useMemo(() => {
    return solicitudes
      .filter((s) => s.entregado !== true)
      .sort((a, b) => {
        if (a.prioridad === "Urgente" && b.prioridad !== "Urgente") return -1;
        if (a.prioridad !== "Urgente" && b.prioridad === "Urgente") return 1;
        return a.direccion.localeCompare(b.direccion, "es");
      });
  }, [solicitudes]);

  const stats = useMemo(() => {
    return {
      total: solicitudes.length,
      pendientes: solicitudes.filter((s) => s.entregado === null).length,
      entregadas: solicitudes.filter((s) => s.entregado === true).length,
      noEntregadas: solicitudes.filter((s) => s.entregado === false).length,
      urgentes: solicitudes.filter((s) => s.prioridad === "Urgente" && s.entregado !== true).length,
    };
  }, [solicitudes]);

  const whatsappText = encodeURIComponent(
    `Ernesto, ruta sugerida de Logística Sail:\n\n${ruta
      .map(
        (s, i) =>
          `${i + 1}) ${s.direccion}\n${s.tipo_tarea} - ${s.detalle}\nContacto: ${s.contacto} ${s.telefono}\nHorario: ${getHorario(s)}`
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
                <p className="muted">Cargá solo lo necesario: qué tiene que hacer, dónde, cuándo y con quién hablar.</p>

                <form onSubmit={crearSolicitud} className="form">
                  <div className="grid">
                    <Field label="Fecha">
                      <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                    </Field>

                    <Field label="Sector">
                      <select value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
                        {sectores.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <div className="grid">
                    <Field label="Tipo de tarea">
                      <select value={form.tipo_tarea} onChange={(e) => setForm({ ...form, tipo_tarea: e.target.value })}>
                        {tipos.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Prioridad">
                      <select value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                        {prioridades.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </Field>
                  </div>

                  <Field label="Dirección completa">
                    <input
                      placeholder="Ej: Arcos 2140, Belgrano"
                      value={form.direccion}
                      onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                    />
                  </Field>

                  <div className="grid">
                    <Field label="Horario">
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
                      <Field label="Detalle horario">
                        <input
                          placeholder="Ej: Antes de 15:00 / 10:00 a 13:00"
                          value={form.horario_detalle}
                          onChange={(e) => setForm({ ...form, horario_detalle: e.target.value })}
                        />
                      </Field>
                    )}
                  </div>

                  <div className="grid">
                    <Field label="Contacto en destino">
                      <input placeholder="Nombre" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
                    </Field>

                    <Field label="Teléfono">
                      <input placeholder="WhatsApp" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                    </Field>
                  </div>

                  <Field label="Detalle de la tarea">
                    <textarea
                      placeholder="Qué tiene que llevar, retirar, entregar o hacer Ernesto"
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
                <p className="eyebrow">Coordinación</p>
                <h2>Panel de solicitudes</h2>

                <div className="list">
                  {solicitudes.length === 0 && <p className="muted">Todavía no hay solicitudes.</p>}

                  {solicitudes.map((s) => (
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
                  </div>

                  <a href={`https://wa.me/?text=${whatsappText}`} target="_blank" rel="noreferrer">
                    <Button>WhatsApp</Button>
                  </a>
                </div>

                <p className="notice">
                  Esta versión ordena pendientes y pone las urgentes primero. La optimización real por distancia/tráfico se conecta después con Google Maps API.
                </p>

                <div className="list">
                  {ruta.length === 0 && <p className="muted">No quedan paradas pendientes.</p>}

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

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
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
            {s.tipo_tarea} · {s.sector}
          </strong>

          <Badge entregado={s.entregado} />

          {s.prioridad === "Urgente" && <span className="badge urgent">Urgente</span>}
        </div>

        <p>{s.direccion}</p>
        <p className="muted">{getHorario(s)}</p>
        <p>{s.detalle}</p>

        <p className="small">
          Contacto: {s.contacto} · {s.telefono}
        </p>
      </div>

      {children && <div className="actions">{children}</div>}
    </article>
  );
}

createRoot(document.getElementById("root")).render(<App />);
