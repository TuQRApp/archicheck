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
- arco_apertura_puerta() (en generar_plano_pdf.py, usado también por generar_json_colab.py): ahora devuelve (arcos, fuente) en vez de solo arcos. arcos es una LISTA de arcos (1 para puerta simple, 2 para DOUBLE_DOOR_SINGLE_SWING -- cada hoja con su propia bisagra en un extremo opuesto del vano). fuente es "declarado" (dato real de IfcDoorStyle.OperationType) o "geometria" (ÚLTIMO recurso, ver bisagra_por_geometria() más abajo) -- (None, None) si ninguno de los dos da señal. Los 2 puntos de llamada dibujan cada fuente SIEMPRE visualmente distinta (línea sólida azul vs. punteada ámbar #D97706) y nunca mezclan ambas fuentes para la misma puerta. Cuando ni el dato declarado ni la geometría dan señal, se marca "?" en vez de omitir en silencio.
- bisagra_por_geometria() (en generar_plano_pdf.py, función NUEVA de hoy): cuando no hay OperationType útil, infiere el lado de la bisagra a partir de la asimetría del footprint de la puerta -- separa el footprint (convex hull) en mitad izquierda/derecha del ancho, en coordenadas LOCALES de la puerta (resolviendo el sistema 2x2 de ejeX/ejeY de get_local_placement()), y compara el rango de Y de cada mitad: la mitad de MENOR rango es la bisagra. Umbral de asimetría mínima para confiar en la señal: UMBRAL_ASIMETRIA_BISAGRA_M = 0.02 m (si la diferencia entre ambos rangos es menor, se considera "sin señal", devuelve None). Calibrado contra UN SOLO caso de verdad conocida del archivo de prueba (una puerta con arco real ya confirmado a mano en una sesión anterior) -- es una inferencia de último recurso, marcada siempre distinta en el dibujo (nunca como si fuera dato declarado).
- OJO con unidades en bisagra_por_geometria(): la geometría triangulada de ifcopenshell.geom (con use-world-coords=True) YA viene en metros sin importar la unidad del archivo, pero get_local_placement() devuelve la matriz de transformación en la unidad CRUDA del archivo (ej. mm) -- hay que aplicar escala_m (calculate_unit_scale()) SOLO a la traslación (origen), nunca a los vectores de eje (rotación pura, sin escala). Mezclar esto mal produce un desfase de ~3 órdenes de magnitud en el origen calculado.
- filtrar_vanos_reales() (en generar_plano_pdf.py, usado en los 3 scripts): filtra IfcDoor/IfcWindow que en realidad son vanos de obra sin terminar o hardware no transitable (hallazgo real: un archivo de ejemplo tenía ~50% de sus "puertas" y 70% de sus "ventanas" así). La señal es: si ALGUNOS elementos de esa categoría en el archivo declaran OverallWidth/OverallHeight y otros no, los que no declaran ninguna se excluyen; si NINGUNO en todo el archivo declara dimensión, se mantienen todos (esa ausencia no es señal de nada, es como exporta ese archivo — un archivo de ejemplo distinto tiene sus puertas/ventanas reales así, sin ninguna dimensión).
- Fix de escaleras: IfcStair puede llegar contenido en el nivel sin ningún IfcStairFlight hijo (decomposición vacía) pero con geometría 3D propia utilizable -- se agregó como fallback dibujable, con cuidado de no duplicar cuando SÍ hay tramos reales (el propio IfcStair se saca de la lista de elementos crudos en ese caso).
- analizar_todos.py y piloto_ids_oguc.py: los umbrales "puerta ancho libre >=0.80m" (OGUC Art. 4.1.7 N6) y "muro FireRating declarado" (OGUC Art. 4.3.3) ahora están consolidados en OGUC_REGLAS (diccionario compartido con el pipeline PDF, en un archivo que NO forma parte de este grupo de revisión) bajo las claves 'puerta_ancho_libre' y 'muro_fire_rating' -- los valores 0.80/"Pset_WallCommon.FireRating" siguen hardcodeados en estos 2 scripts como copia manual (no hay import real posible entre el archivo fuente, que es un espejo local de una celda de Colab, y estos scripts), con comentarios nuevos que citan esa fuente. Verificar que los valores/referencias en estos 2 scripts sean textualmente consistentes con lo que describen los comentarios (0.80 m / Art. 4.1.7 N6 / Pset_WallCommon.FireRating / Art. 4.3.3), no que hayan quedado desincronizados al editar.

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
