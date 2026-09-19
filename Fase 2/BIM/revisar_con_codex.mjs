// Revisión de código con Codex (OpenAI) del piloto BIM/IFC de hoy — mismo
// mecanismo que Fase 2/Herramientas_CubiCasa5k/revisar_con_codex.mjs, pero
// apuntando a los scripts nuevos (extracción/analisis desde IFC), no al
// pipeline PDF.
//
// Uso: node revisar_con_codex.mjs
// Requiere: ../../.env.openai.local con OPENAI_API_KEY=... (raíz de archicheck/, gitignored)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHICHECK_ROOT = path.resolve(__dirname, "../..");

const envPath = path.join(ARCHICHECK_ROOT, ".env.openai.local");
const envContent = fs.readFileSync(envPath, "utf8");
const API_KEY = envContent.match(/OPENAI_API_KEY=(.+)/)[1].trim();

const MODEL = "gpt-5.3-codex"; // ver nota en revisar_con_codex.mjs original: gpt-5-codex da 404

const OUT_DIR = path.join(__dirname, "_codex_reviews");
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function armarBloque(rutaRelativa, contenido) {
  return `\n\n===== ARCHIVO: ${rutaRelativa} =====\n${contenido}`;
}

const SYSTEM_PROMPT = `Eres un revisor de código senior. El proyecto es ArchiCheck (análisis normativo chileno de proyectos de arquitectura). El código que vas a revisar es un PILOTO nuevo, separado del pipeline PDF de producción: explora si se puede hacer el mismo tipo de análisis normativo directamente desde archivos BIM (IFC), usando la librería ifcopenshell (Python) + ifctester (IDS de buildingSMART).

Contexto de cada script:
- generar_plano_pdf.py: triangula la geometría 3D de cada elemento IFC (ifcopenshell.geom), proyecta los triángulos al plano XY con shapely, y dibuja un plano en planta por nivel con matplotlib, guardado en PDF.
- analizar_todos.py: extrae muros/puertas/ventanas/recintos de varios IFC de ejemplo, arma un JSON con esa info, y aplica 3 reglas normativas (ancho de puerta ≥0.80m, resistencia al fuego declarada en muros, ventilación natural ≥10% de la superficie del recinto vía IfcRelSpaceBoundary).
- piloto_ids_oguc.py: usa IfcTester (IDS) para las mismas 2 primeras reglas de forma declarativa.
- generar_json_colab.py: adaptador que reempaqueta los mismos datos reales del IFC (por nivel, no agregados) en el JSON exacto que espera el portal web de ArchiCheck ("Resultados Colab", subido a mano por el arquitecto para la revisión gráfica antes de generar el informe final con Claude+GPT-4o). Novedad de hoy: antes exportaba muros_geo/puertas_geo/ventanas_*/escaleras_detalle vacíos (sin posición); ahora proyecta la geometría 2D real de cada elemento a coordenadas de PÍXEL sobre el PNG que el propio script genera con matplotlib, usando ax.transData.transform() capturado justo antes de guardar la figura (para que la transformación coincida exactamente con el PNG final). Además descompone IfcStair (contenedor) para sacar el IfcStairFlight real (mismo patrón de bug que IfcSpace: geometría no siempre llega por IfcRelContainedInSpatialStructure, a veces hay que bajar un nivel más vía IfcRelAggregates), y usa el GlobalId completo como id de recinto (antes truncado a 8 caracteres, lo que colapsaba ~16 de 21 recintos de un archivo real bajo el mismo id por colisión de prefijo).

Estos IFC son de ejemplo (Autodesk/ArchiCAD/KIT — ninguno chileno), y el objetivo hoy es solo probar viabilidad técnica, no un sistema en producción.

Busca específicamente: bugs reales (no estilo), casos límite no manejados, confusión entre "dato ausente" (None/null) y "no cumple la regla" (un bug real de este tipo ya se encontró y corrigió hoy en analizar_todos.py — verifica si quedó algún caso similar sin corregir), supuestos sobre la estructura del IFC que no siempre se cumplen (ej. asumir que una clase o Pset siempre existe con el mismo nombre), problemas de rendimiento evidentes, y inconsistencias entre archivos. NO comentes sobre formato, nombres de variables, o preferencias de estilo. Si algo no es un problema real, no lo menciones — prioriza precisión sobre exhaustividad. Responde en español, en una lista, cada hallazgo con: archivo, línea o función aproximada, qué está mal, y por qué importa.`;

const grupos = [
  {
    nombre: "01_pipeline_bim",
    archivos: [
      ["Fase 2/BIM/piloto_ids_oguc.py", path.join(__dirname, "piloto_ids_oguc.py")],
      ["Fase 2/BIM/generar_plano_pdf.py", path.join(__dirname, "generar_plano_pdf.py")],
      ["Fase 2/BIM/analizar_todos.py", path.join(__dirname, "analizar_todos.py")],
      ["Fase 2/BIM/generar_json_colab.py", path.join(__dirname, "generar_json_colab.py")],
    ],
  },
];

function extraerTexto(data) {
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return null;
  const partes = [];
  for (const item of data.output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const c of item.content) {
      if (c.type === "output_text" && typeof c.text === "string") partes.push(c.text);
    }
  }
  return partes.length ? partes.join("\n") : null;
}

async function revisarGrupo(grupo) {
  let userContent = `Revisa el siguiente código (grupo: ${grupo.nombre}):`;
  for (const [rel, abs] of grupo.archivos) {
    if (!fs.existsSync(abs)) {
      console.log(`  ⚠ no encontrado, se omite: ${rel}`);
      continue;
    }
    userContent += armarBloque(rel, fs.readFileSync(abs, "utf8"));
  }

  console.log(`→ Enviando grupo ${grupo.nombre} (${userContent.length} caracteres)...`);
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  const outPath = path.join(OUT_DIR, `${stamp}_${grupo.nombre}.json`);
  if (!resp.ok) {
    const errText = await resp.text();
    fs.writeFileSync(outPath, JSON.stringify({ error: true, status: resp.status, body: errText }, null, 2));
    console.log(`  ✗ ERROR ${resp.status} — guardado en ${outPath}`);
    return;
  }
  const data = await resp.json();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  const texto = extraerTexto(data);
  console.log(texto ? `  ✓ OK — guardado en ${outPath}` : `  ⚠ OK pero no se pudo extraer texto — revisar ${outPath} a mano`);
}

for (const grupo of grupos) {
  await revisarGrupo(grupo);
}
console.log("\nListo. Resultados crudos en:", OUT_DIR);
