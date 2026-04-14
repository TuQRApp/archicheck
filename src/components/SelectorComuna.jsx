import { useState, useEffect } from "react";
import comunasStatic from "../../normativa/comunas.json";

const BASE_STYLE = {
  background: "rgba(15,23,42,0.8)",
  border: "1px solid rgba(99,152,210,0.25)",
  borderRadius: 8,
  color: "#e2e8f0",
  fontFamily: "'DM Mono','Fira Code','Courier New',monospace",
  fontSize: 13,
  padding: "10px 14px",
  width: "100%",
  cursor: "pointer",
  appearance: "none",
  outline: "none",
};

const LABEL_STYLE = {
  display: "block",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
  fontFamily: "'DM Mono','Fira Code','Courier New',monospace",
};

const ERROR_STYLE = {
  fontSize: 11,
  color: "#f87171",
  marginTop: 4,
};

/**
 * Selector de comuna con normativa cargada.
 *
 * @param {object}   props
 * @param {string}   props.value        - comunaId seleccionada
 * @param {function} props.onChange     - (comunaId: string) => void
 * @param {boolean}  [props.required]   - siempre true en contexto de proyecto
 * @param {boolean}  [props.disabled]
 * @param {string}   [props.apiUrl]     - URL de /api/comunas (opcional; usa JSON estático si no se provee)
 * @param {boolean}  [props.showError]  - muestra error de validación si true y sin selección
 */
export default function SelectorComuna({
  value,
  onChange,
  required = true,
  disabled = false,
  apiUrl = null,
  showError = false,
}) {
  const [comunas, setComunas]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [fetchErr, setFetchErr] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function cargar() {
      setLoading(true);
      setFetchErr(null);
      try {
        if (apiUrl) {
          const res = await fetch(apiUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (!cancelled) setComunas(data.filter(c => c.activa));
        } else {
          if (!cancelled) setComunas(comunasStatic.filter(c => c.activa));
        }
      } catch (err) {
        if (!cancelled) {
          setFetchErr(err.message);
          setComunas(comunasStatic.filter(c => c.activa));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    cargar();
    return () => { cancelled = true; };
  }, [apiUrl]);

  const sinSeleccion = required && !value;
  const mostrarError = showError && sinSeleccion;

  return (
    <div style={{ width: "100%" }}>
      <label style={LABEL_STYLE}>
        Comuna {required && <span style={{ color: "#f87171" }}>*</span>}
      </label>

      {loading ? (
        <div style={{ ...BASE_STYLE, color: "#64748b", cursor: "default" }}>
          Cargando comunas…
        </div>
      ) : comunas.length === 0 ? (
        <div style={{ ...BASE_STYLE, color: "#f87171", cursor: "default" }}>
          Sin comunas configuradas — contactar administrador
        </div>
      ) : (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          required={required}
          style={{
            ...BASE_STYLE,
            borderColor: mostrarError
              ? "rgba(248,113,113,0.6)"
              : value
              ? "rgba(99,152,210,0.45)"
              : "rgba(99,152,210,0.25)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <option value="" style={{ color: "#000" }}>— Selecciona una comuna —</option>
          {comunas.map(c => (
            <option key={c.id} value={c.id} style={{ color: "#000" }}>
              {c.nombre} — {c.prc_version ?? c.prc_nombre}
            </option>
          ))}
        </select>
      )}

      {mostrarError && (
        <p style={ERROR_STYLE}>Debes seleccionar una comuna para continuar.</p>
      )}

      {fetchErr && (
        <p style={{ ...ERROR_STYLE, color: "#fbbf24" }}>
          No se pudo cargar comunas desde API — usando datos locales.
        </p>
      )}
    </div>
  );
}
