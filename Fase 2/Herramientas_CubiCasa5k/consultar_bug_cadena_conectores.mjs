// Consulta puntual a DeepSeek y Codex sobre el bug de "herencia en
// cadena" de ancho en cuerpo_cerrado.py -- mismo mecanismo que
// consultar_bug_conector_ancho_implausible.mjs (mismo dia, segunda
// consulta: la primera arreglo un bug distinto -- ancho_por_
// emparejamiento aceptando pares implausibles -- y ESTE es el
// siguiente bug encontrado justo despues, al intentar resolver
// cadenas de 2+ conectores sin ancho propio).
//
// Uso: node consultar_bug_cadena_conectores.mjs

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
const FN_CUERPO_CERRADO = extraerFuncion(CODIGO, "cuerpo_cerrado_fusiona", ["relleno_solido_de_contexto"]);
const FN_DIVIDIR_UNION = extraerFuncion(CODIGO, "_dividir_en_muros_por_union", ["construir_contexto_con_pares"]);
const FN_RELLENO = extraerFuncion(CODIGO, "_relleno_solido", ["_extender_y_rellenar_esquina"]);

const CONTEXTO = `Proyecto ArchiCheck: analiza planos arquitectónicos (PDF) para pre-validar cumplimiento normativo chileno. Pipeline geométrico determinista en Python (Colab), Celda 4 + cuerpo_cerrado.py, extrae muros/puertas/ventanas de los paths vectoriales del PDF -- nunca usa IA para la geometría.

CASO REAL SIN RESOLVER (reportado por el arquitecto usuario final, plano PdV Nivel 1): varios grupos de muros que deberían fusionarse en un solo cuerpo cerrado quedan separados en el JSON final. Ejemplos concretos dados por el usuario: MU30+MU31 (una muesca real con 2 tramos de retorno cortos + conector, NINGUNO de los 3 con ancho propio -- ni siquiera el vecino inmediato de cada uno lo tiene), MU03+MU16+MU17, MU18+MU19+MU20+MU21, MU01, MU09.

HOY SE PROBARON 3 CAMBIOS RELACIONADOS EN \`cuerpo_cerrado.py\`, LOS 3 TERMINARON REVERTIDOS tras medir el resultado real, aislado con \`git stash\`, en 3 proyectos reales completos (PdV, Beauchef, Campo Lindo -- no solo el que motivó cada cambio). Esta consulta es sobre CÓMO seguir, con la lección aprendida de que "la lógica del fix se ve razonable" y "consultamos con ustedes y pareció validado" NO fueron suficiente evidencia -- solo medir aislado con los 3 proyectos reales lo fue.

BASELINE REAL (código actual, sin ningún cambio de hoy en esta zona -- \`git diff\` limpio contra el último commit):
| Proyecto | entradas → muros finales |
|---|---|
| PdV pág.1 | 126 → 59 |
| PdV pág.2 | 108 → 40 |
| Campo Lindo pág.2 | 271 → 64 |
| Campo Lindo pág.3 | 109 → 36 |
| Beauchef | 791 → 250 |

CAMBIO 1 -- \`ancho_por_emparejamiento\` (código incluido abajo): agregar \`if d > largo_s: continue\` al filtrar candidatos paralelos -- descarta un candidato cuya distancia perpendicular supera el largo PROPIO del segmento evaluado \`s\`, aunque esa distancia caiga dentro del rango abstracto tol_min_m/tol_max_m (mismo criterio que ya usa \`_relleno_solido\` para decidir si pinta, aplicado antes, en la clasificación). Motivación real: un conector corto (34px) de PdV emparejaba por casualidad con una cara a 59px (mayor que su propio largo) -- geométricamente inverosímil, pero \`ancho_por_emparejamiento\` no lo rechazaba, lo cual le impedía caer en el fallback de conector heredado (\`_ancho_heredado_de_conector\`, ya construido y confirmado con 2 casos reales previos, MU02/MU108). Este cambio SE CONSULTÓ con DeepSeek+Codex ANTES de aplicarlo y pareció validado (consenso sobre la lógica, casos límite revisados). Resultado real medido HOY, aislando el cambio con git stash (solo este cambio, nada más) y comparando contra el baseline real de la tabla de arriba:
| Proyecto | Sin el cambio (baseline real) | Con \`d > largo_s\` (tol_conector_esquina_m=0.03) | Con \`d > largo_s\` (tol_conector_esquina_m=0.06) |
|---|---|---|---|
| PdV pág.1 | 126 → 59 | 126 → 62 (PEOR) | 126 → 61 (PEOR) |
| PdV pág.2 | 108 → 40 | 108 → 41 (peor) | 108 → 41 (peor) |
| Campo Lindo pág.3 | 109 → 36 | (no medido aislado) | 109 → 37 (peor) |
| Beauchef | 791 → 250 | 791 → 425 (MUCHO PEOR) | 791 → 416 (MUCHO PEOR) |

Es decir: el cambio, en TODAS las combinaciones probadas, empeora los 3 proyectos reales -- nunca mejora ninguno cuando se mide aislado del resto de cambios del día. (Una corrida temprana, antes de aislar bien los cambios acumulados de la sesión, había mostrado Beauchef en 221 -- no se pudo reproducir esa cifra de forma aislada; probablemente reflejaba un estado intermedio del código que no quedó registrado con precisión. NO confiar en esa cifra.)

Hipótesis de por qué empeora pese a que la lógica parece correcta: bloquear un candidato "d > largo_s" no solo excluye el caso conflictivo que motivó el fix -- también excluye OTROS pares que eran coincidencias simples correctas (matches directos que no necesitaban pasar por el fallback), empujándolos a \`_ancho_heredado_de_conector\`, que les puede asignar un ancho DISTINTO (a veces peor / inconsistente con el contexto real), lo cual termina bloqueando MÁS fusiones por "cuerpo cerrado" (incompatibilidad de ancho al dilatar) de las que arregla.

CAMBIO 2 -- \`tol_conector_esquina_m\` 0.03→0.06 (el radio de tolerancia de vértice compartido en \`_ancho_heredado_de_conector\`/\`_ancho_heredado_de_segmento\`, para que el conector corto de MU30/MU31 -- que toca a su vecino real a 8px=0.047m -- sea reconocido como conector real). Probado SIEMPRE junto con el CAMBIO 1 (ver tabla de arriba) -- no se aisló de forma limpia sin el CAMBIO 1 en los 3 proyectos, así que no se puede afirmar con certeza si el 0.06 por sí solo (sin \`d > largo_s\`) es seguro o no. Revertido a 0.03 por precaución, junto con todo lo demás.

CAMBIO 3 -- herencia en cadena (BFS de 2+ saltos en \`_ancho_heredado_de_conector\`/\`_ancho_heredado_de_segmento\`, para resolver el caso donde ni siquiera el vecino inmediato de un conector tiene ancho propio -- necesario aparte del CAMBIO 1, porque incluso con \`d > largo_s\` corregido, un conector puede tocar a OTRO conector sin ancho propio en vez de tocar directo una cara real). 2 variantes de dominio probadas, ambas TAMBIÉN con el CAMBIO 1 ya aplicado (así que estos números están confundidos con el CAMBIO 1, que ya sabemos que por sí solo empeora todo):
| Proyecto | Cambio 1 solo (sin cadena) | Cambio 1 + cadena, dominio=contexto local completo | Cambio 1 + cadena, dominio=grupo propio |
|---|---|---|---|
| PdV pág.1 | 126 → 59/61 (según tol, ver tabla arriba) | 126 → 49 | 126 → 61 |
| PdV pág.2 | 108 → 40/41 | 108 → 36 | 108 → 41 |
| Campo Lindo pág.2 | (no medido solo) | 271 → 48 | 271 → 64 |
| Campo Lindo pág.3 | 109 → 37 | 109 → 30 | 109 → 37 |
| Beauchef | 791 → 221 (cifra dudosa, ver arriba) / 416 | 791 → 374 | 791 → 416 |

Dominio=contexto completo (todos los muros candidatos dentro de \`margen_contexto_m\`=0.6m, no solo los 2 grupos evaluados): mejoraba PdV/Campo Lindo respecto de "cambio 1 solo" pero Beauchef se veía muy mal (374) -- encontré un caso real donde un segmento de 5px hereda ancho=37px "en cadena" (2 saltos) vía un tramo de 4px de OTRO muro candidato sin relación estructural real, saltando vértice a vértice sin verificar que pertenezca al mismo cuerpo físico. Dominio=grupo propio (grupo_a/grupo_b, la cadena de segmentos ya unida por \`_dividir_en_muros_por_union\` como UN candidato de muro): pensado para excluir esos saltos a muros ajenos, pero NO arregló Beauchef (416, igual o peor) y además empeoró PdV/Campo Lindo -- un \`grupo\` pre-fusión casi nunca tiene 2+ segmentos sin ancho propio entre sí, así que acotar a él prácticamente desactiva la cadena sin resolver el caso real.

DECISIÓN TOMADA HOY: los 3 cambios fueron revertidos completamente. \`cuerpo_cerrado.py\` está de vuelta, byte a byte, en la versión del último commit (\`git diff\` limpio). El caso MU30/MU31 y los demás ejemplos del usuario siguen sin resolverse.

INSTRUCCIÓN EXPLÍCITA DEL USUARIO sobre el alcance de cualquier fix futuro: "el cuerpo cerrado siempre debe cumplirse" -- no agregar ningún tope de LARGO de segmento ni de DISTANCIA como condición aparte/arbitraria; cualquier límite debe ser un criterio geométrico/estructural real, no un número ajustado para que "funcione" en los casos vistos hasta ahora.

CÓDIGO ACTUAL (estado real, sin ninguno de los 3 cambios):

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
${FN_CUERPO_CERRADO}
\`\`\`

\`\`\`python
${FN_DIVIDIR_UNION}
\`\`\`

PREGUNTAS (sé específico y crítico -- si esto no tiene una solución limpia con la información disponible, decilo directamente en vez de proponer algo que probablemente no vamos a poder validar; y si mi metodología de prueba tiene un hueco que explique por qué un cambio con lógica sólida termina midiendo peor en la práctica, señalalo):

1. ¿Por qué el CAMBIO 1 (\`d > largo_s\`), cuya lógica ustedes mismos revisaron y parecía correcta, empeora los 3 proyectos reales en la práctica? ¿La hipótesis que propongo (bloquear el candidato empuja OTROS pares válidos hacia un fallback que los resuelve peor) les parece la explicación correcta, o hay otro mecanismo más probable? ¿Hay una forma de aplicar el MISMO criterio de plausibilidad sin ese efecto colateral (por ejemplo, solo como criterio de DESEMPATE entre candidatos igualmente válidos, no como filtro que excluye por completo)?

2. Dado que 3 intentos distintos (variando 3 dimensiones distintas del problema: plausibilidad del par, tolerancia de vértice, y alcance del BFS de herencia) fallaron en producción real pese a que cada uno resolvía el caso que lo motivó en aislamiento, ¿qué eso sugiere sobre el diseño general de \`cuerpo_cerrado_fusiona\`? ¿Es un problema de que el sistema de "ancho por emparejamiento + herencia de conector" es intrínsecamente frágil a nivel local (decisiones segmento-por-segmento) y el caso MU30/MU31 necesita una estrategia distinta, más global (ej. reconocer el patrón completo de una "muesca" -- 2 caras paralelas del muro principal + retorno corto + conector -- de una sola vez, en \`_dividir_en_muros_por_union\` o en una etapa aparte, en vez de resolverlo segmento por segmento en la fusión)?

3. ¿Qué método de validación recomendarían ANTES de proponer un próximo intento, dado que "consultar con ustedes sobre la lógica" y "ver que el número final mejora en la corrida siguiente" ya demostraron no ser suficientes? Concretamente: ¿tiene sentido pedirles que, antes de dar cualquier fix por bueno, generen ustedes mismos casos de prueba sintéticos adversariales (ej. "2 muros distintos cuyos remates casualmente están a 6cm uno del otro" para Beauchef, o "una cadena real de 2 conectores sin ancho propio" para PdV) y verificar el comportamiento esperado en cada uno, en vez de solo revisar el código en abstracto?

4. Concretamente para el caso MU30/MU31: ¿lo atacarían en \`_dividir_en_muros_por_union\` (para que la muesca completa quede en un solo grupo desde el principio, evitando el problema de "ancho por emparejamiento" y "herencia de conector" por completo para este caso) o en otra etapa? Si tienen una propuesta concreta de código, inclúyanla, pero marquen explícitamente qué evidencia adicional necesitaríamos reunir (con qué prints/diagnósticos) para confirmar que funciona en los 3 proyectos ANTES de aplicarla.

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
