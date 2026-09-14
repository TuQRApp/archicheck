// Consulta puntual a DeepSeek y Codex sobre un bug encontrado hoy en
// ancho_por_emparejamiento (cuerpo_cerrado.py) -- mismo mecanismo que
// consultar_reconstruccion_ventanas_jamba.mjs.
//
// Uso: node consultar_bug_conector_ancho_implausible.mjs

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

function extraerFuncion(codigoCompleto, nombreFuncion, siguientesMarcadores) {
  let bloque = codigoCompleto.split(`def ${nombreFuncion}`)[1];
  bloque = "def " + nombreFuncion + bloque;
  for (const marcador of siguientesMarcadores) {
    const idx = bloque.indexOf(`\ndef ${marcador}`);
    if (idx !== -1) bloque = bloque.slice(0, idx);
  }
  return bloque;
}

const CODIGO = fs.readFileSync(path.join(__dirname, "cuerpo_cerrado.py"), "utf8");

const FN_ANCHO = extraerFuncion(CODIGO, "ancho_por_emparejamiento", ["identificar_hojas_de_puerta"]);
const FN_HEREDADO_CONECTOR = extraerFuncion(CODIGO, "_ancho_heredado_de_conector", ["_ancho_heredado_de_segmento"]);
const FN_HEREDADO_SEGMENTO = extraerFuncion(CODIGO, "_ancho_heredado_de_segmento", ["construir_contexto_con_pares"]);
const FN_RELLENO = extraerFuncion(CODIGO, "_relleno_solido", ["_extender_y_rellenar_esquina"]);
const FN_DILATAR = extraerFuncion(CODIGO, "_dilatar", ["_componente_desde_punto"]);
const FN_COMPONENTE = extraerFuncion(CODIGO, "_componente_desde_punto", ["_punto_medio"]);
const FN_TOCA = extraerFuncion(CODIGO, "_grupo_toca_componente", ["_ancho_heredado_de_conector"]);
const FN_CUERPO_CERRADO = extraerFuncion(CODIGO, "cuerpo_cerrado_fusiona", ["relleno_solido_de_contexto"]);

const CONTEXTO = `Proyecto ArchiCheck: analiza planos arquitectónicos (PDF) para pre-validar cumplimiento normativo chileno. Pipeline geométrico determinista en Python (Colab), Celda 4 + cuerpo_cerrado.py, extrae muros/puertas/ventanas de los paths vectoriales del PDF -- nunca usa IA para la geometría.

HALLAZGO DE HOY (caso real, plano PdV Nivel 1, reportado por el arquitecto usuario final): dos entidades "muro" que deberían ser UNA sola (una muesca/escalón real en el muro: 2 tramos de retorno cortos de 8px c/u + un conector perpendicular corto de 34px de largo que los une) quedan separadas en el JSON final -- \`cuerpo_cerrado_fusiona\` las rechaza con "no conectados incluso tras cerrar micro-gaps" pese a que sus segmentos se TOCAN en coordenadas exactas (distancia 0px).

INVESTIGACIÓN YA HECHA (con datos reales, instrumentando el código en vivo, no adivinando):
1. Descarté que sea un problema de \`tol_conector_esquina_m\` (el mecanismo de "conector de esquina hereda ancho de un vecino real", agregado 2026-08-23) -- ese mecanismo NUNCA SE LLEGA A EJECUTAR para este caso.
2. La razón: el conector corto (34px de largo) SÍ obtiene un \`anchoPx\` no-None de \`ancho_por_emparejamiento\` -- pero un valor IMPLAUSIBLE: 59px, es decir, MAYOR que su propio largo (34px). Confirmado con print directo: \`anchoA=51.0, anchoB=59.0, ancho_min_px=51.0, tol_px_dilatacion=5.1, conectado=False\`.
3. Esto pasa porque \`ancho_por_emparejamiento\` (código completo abajo) busca en TODO el contexto un candidato "c" aprox. paralelo (±10°) a distancia perpendicular entre tol_min_m (0.08m) y tol_max_m (0.9m), y con solape de proyección -- pero NUNCA compara esa distancia contra el LARGO PROPIO del segmento "s" que se está evaluando. Un conector corto (34px) puede "emparejar" por casualidad con algo a 59px de distancia (dentro del rango de espesor de muro plausible en abstracto), aunque sea geométricamente absurdo que ESE segmento en particular (tan corto) sea la cara de un muro tan ancho.
4. Consecuencia en cascada: como \`ancho_por_emparejamiento\` no devolvió None, \`cuerpo_cerrado_fusiona\` NUNCA intenta \`_ancho_heredado_de_conector\` (el mecanismo que sí resolvería esto bien, ya construido y confirmado con otros 2 casos reales -- MU02 y MU108 de PdV). Y más abajo, en \`_relleno_solido\`, SÍ existe el chequeo \`if ancho_px > largo_s: continue\` que correctamente descarta este match como "inverosímil" para pintarlo -- pero eso pasa DEMASIADO TARDE, solo afecta el renderizado, no la decisión de \`cuerpo_cerrado_fusiona\` tomada antes. El segmento termina sin pintarse en ningún lado (ni como cara real, ni como conector con ancho heredado), así que \`_grupo_toca_componente\` correctamente no lo encuentra conectado a nada.

FIX QUE PROPONGO (todavía sin aplicar, evaluando antes de tocar código geométrico delicado -- ya hubo una regresión real en este proyecto tocando código similar, el filtro de achurado de 2026-07-27, revertido por fusión catastrófica no detectada a tiempo):

Agregar en \`ancho_por_emparejamiento\`, al evaluar cada candidato \`c\` para \`s\`, el MISMO chequeo de plausibilidad que ya existe en \`_relleno_solido\` (\`ancho_px > largo_s\`) -- si la distancia perpendicular \`d\` supera el largo propio de \`s\`, no aceptar ese candidato como "par" (queda con \`anchoPx=None\` para ese segmento), dejando que \`_ancho_heredado_de_conector\` evalúe si es un conector real en su lugar.

Instrucción explícita del usuario sobre el alcance del fix: "el cuerpo cerrado siempre debe cumplirse" -- no agregar ningún tope de LARGO de segmento como condición aparte (ej. "solo aplicar esto si el segmento mide menos de X"); el fix debe ser el chequeo de plausibilidad geométrica en sí (ancho vs. largo propio), no una excepción basada en tamaño.

CÓDIGO RELEVANTE COMPLETO:

\`\`\`python
${FN_ANCHO}
\`\`\`

\`\`\`python
${FN_HEREDADO_CONECTOR}
\`\`\`

\`\`\`python
${FN_HEREDADO_SEGMENTO}
\`\`\`

\`\`\`python
${FN_RELLENO}
\`\`\`

\`\`\`python
${FN_DILATAR}
${FN_COMPONENTE}
${FN_TOCA}
\`\`\`

\`\`\`python
${FN_CUERPO_CERRADO}
\`\`\`

PREGUNTAS (sé específico y crítico -- si encontrás un hueco, decilo directamente en vez de validar por cortesía):

1. ¿Es correcto mi diagnóstico de la causa raíz (\`ancho_por_emparejamiento\` acepta un candidato "d > largo_s" que después \`_relleno_solido\` rechaza para pintar, dejando el segmento huérfano de cualquier tratamiento -- ni cara real, ni conector heredado)? ¿Hay algo en el código que no estoy viendo que ya debería prevenir esto?

2. Si agrego el chequeo \`d <= largo_s\` (o alguna variante) DENTRO de \`ancho_por_emparejamiento\` en el loop de candidatos (antes de \`candidatos.append((c, d))\`, o al filtrar \`candidatos\` antes del loop de \`_hay_linea_central_entre\`) -- ¿qué caso REAL legítimo podría romper? Concretamente: ¿hay un patrón real de muro donde un segmento CORTO (por ejemplo, un tramo entre 2 puertas muy próximas, o un tramo partido por un cruce) deba emparejar legítimamente con una cara a mayor distancia que su propio largo, y que este fix excluiría por error?

3. La condición exacta que uso en \`_relleno_solido\` hoy es \`ancho_px > largo_s\` (estrictamente mayor). Para el chequeo NUEVO en \`ancho_por_emparejamiento\`, ¿conviene la misma condición exacta (\`d > largo_s\` → descartar candidato), o hay una razón para que sean ligeramente distintas (ej. un margen de tolerancia, o comparar contra el candidato con mejor \`d\` en vez de cada uno individualmente)?

4. ¿Dónde exactamente insertarías la línea nueva dentro del loop de \`ancho_por_emparejamiento\` (después de \`candidatos.append((c, d))\`, dentro del \`if\` de filtros previos, o en el loop de selección \`for c, d in candidatos:\`) para que sea mínimamente invasivo y no cambie el comportamiento de ningún otro caso ya validado (Beauchef, PdV, Campo Lindo)?

5. ¿Hay algún otro lugar del código (además de \`_relleno_solido\`) donde el mismo chequeo \`ancho_px > largo_s\` ya se aplica y debería mantenerse consistente / no duplicarse de forma redundante tras este fix?

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
