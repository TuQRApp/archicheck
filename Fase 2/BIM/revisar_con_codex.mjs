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
- generar_json_colab.py: adaptador que reempaqueta los mismos datos reales del IFC (por nivel, no agregados) en el JSON exacto que espera el portal web de ArchiCheck ("Resultados Colab", subido a mano por el arquitecto para la revisión gráfica antes de generar el informe final con Claude+GPT-4o). Proyecta la geometría 2D real de cada elemento a coordenadas de PÍXEL sobre el PNG que el propio script genera con matplotlib, usando ax.transData.transform() capturado justo antes de guardar la figura. Descompone IfcStair (contenedor) para sacar el IfcStairFlight real cuando existe, o usa el propio IfcStair como fallback si no tiene tramos hijos (algunos exportadores lo modelan así, con geometría 3D propia utilizable). Usa el GlobalId completo como id de recinto (antes truncado a 8 caracteres). Ids cortos tipo MU-01/P-01/V-01/ES-01 como etiqueta visible (únicos en todo el documento).

Cambios de HOY, revisar con especial atención:
- arco_apertura_puerta() (en generar_plano_pdf.py, usado también por generar_json_colab.py): sintetiza el símbolo estándar de apertura de puerta (arco 90° + línea de hoja abierta) a partir de IfcDoorStyle.OperationType (SINGLE_SWING_LEFT/RIGHT) y el ObjectPlacement de la puerta, usando calculate_unit_scale() para convertir unidades. Cuando no hay OperationType útil, marca "?" en vez de omitir en silencio.
- filtrar_vanos_reales() (en generar_plano_pdf.py, usado en los 3 scripts): filtra IfcDoor/IfcWindow que en realidad son vanos de obra sin terminar o hardware no transitable (hallazgo real: un archivo de ejemplo tenía ~50% de sus "puertas" y 70% de sus "ventanas" así). La señal es: si ALGUNOS elementos de esa categoría en el archivo declaran OverallWidth/OverallHeight y otros no, los que no declaran ninguna se excluyen; si NINGUNO en todo el archivo declara dimensión, se mantienen todos (esa ausencia no es señal de nada, es como exporta ese archivo — un archivo de ejemplo distinto tiene sus puertas/ventanas reales así, sin ninguna dimensión).
- Fix de escaleras: IfcStair puede llegar contenido en el nivel sin ningún IfcStairFlight hijo (decomposición vacía) pero con geometría 3D propia utilizable -- se agregó como fallback dibujable, con cuidado de no duplicar cuando SÍ hay tramos reales (el propio IfcStair se saca de la lista de elementos crudos en ese caso).

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
