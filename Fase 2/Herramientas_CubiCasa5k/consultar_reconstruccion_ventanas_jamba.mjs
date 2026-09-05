// Consulta puntual (no periódica) a DeepSeek y Codex sobre el fix nuevo
// D3-ventana-reconstruccion-por-jamba, recién portado a la Celda 4. Mismo
// mecanismo de credenciales que revisar_con_deepseek.mjs / revisar_con_codex.mjs
// (ver consultar_gap_export_ventanas.mjs para el precedente de esta misma
// gap/caso), pero prompt de una sola pregunta enfocada, no scan de archivos.
//
// Uso: node consultar_reconstruccion_ventanas_jamba.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHICHECK_ROOT = path.resolve(__dirname, "../..");

const OUT_DIR = path.join(__dirname, "_consultas");
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function leerEnv(nombreArchivo, nombreVar) {
  const envPath = path.join(ARCHICHECK_ROOT, nombreArchivo);
  const envContent = fs.readFileSync(envPath, "utf8");
  return envContent.match(new RegExp(`${nombreVar}=(.+)`))[1].trim();
}

const CODIGO_FUNCION = fs.readFileSync(
  path.join(__dirname, "cuerpo_cerrado.py"),
  "utf8"
).split("def reconstruir_ventanas_por_jamba")[1];
const FUNCION_COMPLETA = "def reconstruir_ventanas_por_jamba" + CODIGO_FUNCION;

const CONTEXTO = `Proyecto ArchiCheck: analiza planos arquitectónicos (PDF) para pre-validar cumplimiento normativo chileno. Pipeline geométrico determinista en Python (Colab), Celda 4, extrae muros/puertas/ventanas de los paths vectoriales del PDF.

HALLAZGO Y FIX A EVALUAR (recién implementado, sin correr todavía en una corrida nueva de Colab end-to-end -- solo validado contra un JSON ya generado):

CONTEXTO DEL BUG ORIGINAL: en el plano de Beauchef (Camarín/Baño), una fila de 6 ventanas reales se exportaba como 11 fragmentos de muro sueltos (\`MU03\` a \`MU13\`, \`ancho_linea_prom\` implausible de 1.44m, largo individual 0.13-0.17m). Causa raíz: el mecanismo \`_detectar_lineas_referencia_periodicas\` (que excluye líneas de deslinde/rasante del export porque son colineales + gap acotado + span largo) atrapó también las líneas reales de las ventanas -- una fila de ventanas repetidas de una fachada cae en el MISMO patrón geométrico. Las líneas reales de cada ventana (top/centro/bottom, la firma D1-D3 ya usada en \`identificar_lineas_centrales\` para "par de bordes paralelos + línea central") quedaron enterradas en \`muros_excluidos_por_referencia\` en vez de llegar a \`muros_geo\` como fragmentos sin sentido.

UN PRIMER INTENTO DE FIX (descartado): agrupar los 11 fragmentos por CERCANÍA/proximidad espacial en 4 zonas -- dio una agrupación asimétrica que el arquitecto (usuario final, no yo) confirmó visualmente como incorrecta contra el plano real y una captura con cotas reales (\`Screenshot_529.jpg\`).

EL FIX GENERALIZADO QUE SE IMPLEMENTÓ Y VALIDÉ (función completa, agregada a cuerpo_cerrado.py):

\`\`\`python
${FUNCION_COMPLETA}
\`\`\`

Se llama en Celda 4 justo después de \`_detectar_lineas_referencia_periodicas\`, y su resultado se exporta a un campo propio nuevo \`ventanas_reconstruidas_por_jamba\` (separado a propósito de \`muros_geo\` y de la decisión de arquitectura mayor, todavía sin tomar, de un \`ventanas_geo\` general con regla de precedencia contra \`analisis_semantico\`).

CÓMO SE VALIDÓ: corrida contra el JSON real ya generado de Beauchef (\`archicheck_geometrico_beauchef_30ago_0356.json\`, página 3) -- reprodujo EXACTAMENTE las mismas 6 ventanas que el intento manual con coordenadas hardcodeadas había confirmado antes (\`_reconstruir_ventanas.py\`, ya descartado por no generalizar), sin ningún falso positivo entre las otras 19 cadenas excluidas de esa página (fragmentos de jamba/mainel con \`ancho_linea_prom\` de 1.44m, geométricamente distintos -- la función los descarta porque no forman grupos de exactamente 3 miembros con el mismo par de jamba). Verificado también con overlay dibujado sobre el PNG real de la página -- calza pixel a pixel con la versión manual.

LO QUE NO SE VALIDÓ TODAVÍA: una corrida nueva de Colab end-to-end (Vision + extracción vectorial completa) contra este u otro plano -- solo se probó sobre un JSON de una corrida anterior ya generada. Tampoco se probó contra ningún proyecto que NO sea Beauchef (PdV, Isla de Pascua, Campo Lindo).

PREGUNTAS (sé específico y crítico -- si encontrás un hueco, decilo directamente en vez de validar por cortesía):

1. La condición "exactamente 3 líneas con el mismo par de jamba (x0,x1) dentro de tol_jamba_m=0.03m" -- ¿es demasiado estricta (podría perder ventanas reales con solo 2 líneas visibles, o con 4+ por algún artefacto del split de \`_dividir_en_muros_por_union\`) o demasiado laxa (podría fusionar por error 2 elementos distintos que coincidan en ancho por casualidad)? Concretamente: ¿qué pasa si una ventana real solo tiene top+bottom sin línea central visible en el plano (dibujo simplificado)? Hoy esa ventana quedaría sin reconstruir -- ¿es un riesgo real o un caso raro que no vale la pena cubrir todavía?

2. El chequeo de \`max_spread_vertical_m=2.0\` (la distancia vertical entre las 3 líneas de un grupo no puede superar 2m) -- ¿es suficiente para evitar que 2 elementos completamente distintos en habitaciones distintas, que por coincidencia comparten el mismo ancho de jamba, se fusionen como si fueran la misma ventana? ¿Falta también un chequeo de proximidad horizontal/contexto (ej. que las 3 líneas pertenezcan al mismo muro/pared), o el riesgo es despreciable en la práctica?

3. Los valores de tolerancia (\`tol_jamba_m=0.03\`, \`ancho_min_m=0.15\`, \`ancho_max_m=3.0\`, \`max_spread_vertical_m=2.0\`) son estimaciones razonables a criterio propio, no verificados contra más de un proyecto real -- ¿alguno te parece claramente mal calibrado a priori (demasiado ancho o demasiado angosto) antes de tener más datos?

4. ¿Hay algún patrón de la clase "reglas reusables, no datos hardcodeados" (principio explícito de este proyecto) que se me haya colado sin darme cuenta -- algo calibrado implícitamente al caso Beauchef que no generalizaría a un plano con otra convención de dibujo?

Respondé en español.`;

async function consultarDeepSeek() {
  const API_KEY = leerEnv(".env.deepseek.local", "DEEPSEEK_API_KEY");
  console.log("→ Enviando a DeepSeek...");
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: CONTEXTO }],
      max_tokens: 4000,
    }),
  });
  const outPath = path.join(OUT_DIR, `${stamp}_deepseek.json`);
  if (!resp.ok) {
    fs.writeFileSync(outPath, JSON.stringify({ error: true, status: resp.status, body: await resp.text() }, null, 2));
    console.log(`  ✗ ERROR ${resp.status}`);
    return;
  }
  const data = await resp.json();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`  ✓ OK — ${outPath}`);
}

function extraerTextoCodex(data) {
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

async function consultarCodex() {
  const API_KEY = leerEnv(".env.openai.local", "OPENAI_API_KEY");
  const MODEL = "gpt-5.3-codex";
  console.log("→ Enviando a Codex...");
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: CONTEXTO }],
    }),
  });
  const outPath = path.join(OUT_DIR, `${stamp}_codex.json`);
  if (!resp.ok) {
    fs.writeFileSync(outPath, JSON.stringify({ error: true, status: resp.status, body: await resp.text() }, null, 2));
    console.log(`  ✗ ERROR ${resp.status}`);
    return;
  }
  const data = await resp.json();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  const texto = extraerTextoCodex(data);
  console.log(texto ? `  ✓ OK — ${outPath}` : `  ⚠ OK pero no se pudo extraer texto — revisar ${outPath} a mano`);
}

await consultarDeepSeek();
await consultarCodex();
console.log("\nListo. Resultados crudos en:", OUT_DIR);
