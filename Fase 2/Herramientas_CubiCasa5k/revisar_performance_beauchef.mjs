// Revisión DIRIGIDA (no el scan general) con DeepSeek + Codex — investiga por qué
// _fusionar_muros_por_proximidad (cuerpo_cerrado.py + Celda 4) cuelga >1 hora en la
// página más densa de Beauchef, incluso después de 2 rondas de fixes de complejidad
// algorítmica ya aplicados (26-ago: O(n^3) en identificar_hojas_de_puerta; 27-ago:
// cache de 1 slot para identificar_lineas_centrales/identificar_hojas_de_puerta
// dentro de clasificar_no_muro). Uso: node revisar_performance_beauchef.mjs
// Requiere .env.deepseek.local y .env.openai.local en la raíz de archicheck/.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHICHECK_ROOT = path.resolve(__dirname, "../..");
const OUT_DIR = path.join(__dirname, "_perf_reviews");
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function leer(rel) {
  return fs.readFileSync(path.join(ARCHICHECK_ROOT, rel), "utf8");
}

// Extrae solo la función _fusionar_muros_por_proximidad completa (con docstring) del
// extracto de Celda 4 -- enviar la celda completa (220KB) es ruido innecesario para
// esta pregunta puntual.
function extraerFuncion(codigo, nombreFn) {
  const inicio = codigo.indexOf(`def ${nombreFn}(`);
  if (inicio === -1) throw new Error(`no se encontro ${nombreFn}`);
  const lineas = codigo.slice(inicio).split("\n");
  const out = [lineas[0]];
  for (let i = 1; i < lineas.length; i++) {
    const l = lineas[i];
    if (l.length && !l.startsWith(" ") && !l.startsWith("\t") && l.trim() !== "") break;
    out.push(l);
  }
  return out.join("\n");
}

const cuerpoCerrado = leer("Fase 2/Herramientas_CubiCasa5k/cuerpo_cerrado.py");
const celda4 = leer("Fase 2/Desarrollos/Test/Celda 4 - copiar en Colab.py");
const fusionFn = extraerFuncion(celda4, "_fusionar_muros_por_proximidad");

const CONTEXTO = `Eres un revisor de código senior especializado en complejidad algorítmica. El proyecto es ArchiCheck: pipeline geométrico en Python (corre en Google Colab) que extrae muros/puertas/ventanas desde paths vectoriales de un PDF de plano arquitectónico -- determinista, sin IA para la geometría.

SÍNTOMA REAL, con evidencia de log real (no hipotético): al re-correr el notebook contra un proyecto real (Beauchef, Centro Recreacional, 4 páginas configuradas) tras 2 rondas de fixes de performance ya aplicados, la celda de extracción (Celda 4) corrió MÁS DE 1 HORA sin terminar, específicamente en la página más densa del proyecto:
- "Muros exportados: 944 (de 2 grupos protegidos, 729 segmentos descartados por ángulo no-ortogonal)" -- es decir, la función _dividir_en_muros_por_union (que corta en un muro nuevo en cada cruce real de 3+ segmentos) fragmentó apenas 2 grupos conectados de geometría real en 944 entradas separadas de muros_geo, por alta densidad de cruces/T en esa zona del plano.
- El log real muestra: "⏱ Extracción + filtrado (Paso 1-4): 0:00:05" -- o sea, a los 5 SEGUNDOS de terminar la extracción, la ejecución ya está dentro de _fusionar_muros_por_proximidad (que debe re-fusionar esas 944 entradas fragmentadas de vuelta a muros reales), imprimiendo decenas de líneas "DIAG bloqueado MUxx vs MUyy" y "DIAG PAREJA" (diagnóstico de hasta 15+4 muestras, pero el LOOP COMPLETO sigue evaluando todos los pares candidatos aunque el diagnóstico ya se haya impreso). La corrida se cuelga/no termina dentro de esta función, para ESTA página específica -- otras páginas del mismo proyecto (con 126, 30, 63 muros post-fusión) terminan en minutos.

FIXES YA APLICADOS ANTES DE ESTA CORRIDA (no repitas estos hallazgos, ya están resueltos -- busca lo que SIGUE causando el cuelgue):
1. (26-ago) identificar_hojas_de_puerta llamaba a ancho_por_emparejamiento (que a su vez recalculaba identificar_lineas_centrales, O(n²)) una vez POR SEGMENTO del contexto -- eso era O(n³) real. Arreglado con un parámetro centrales_ids precalculado una vez.
2. (27-ago) cuerpo_cerrado_fusiona llamaba a clasificar_no_muro(contexto_local, mpx) SIN cachear, y esa función internamente llama a identificar_lineas_centrales/identificar_hojas_de_puerta varias veces (una por cada "firma" registrada) SOBRE EL MISMO contexto_local dentro de una sola llamada -- eso duplicaba/cuadruplicaba el trabajo O(n²) dentro de cada llamada individual a cuerpo_cerrado_fusiona. Arreglado con un cache de 1 slot por identidad de objeto (contexto is el mismo objeto exacto -> sirve el resultado cacheado) dentro de identificar_lineas_centrales e identificar_hojas_de_puerta mismas (ver _CACHE_CENTRALES/_CACHE_HOJAS en cuerpo_cerrado.py).

TU TAREA: dado que el síntoma persiste DESPUÉS de esos 2 fixes, encontrá qué complejidad algorítmica SIGUE sin resolverse, específicamente la que escala mal con:
(a) el NÚMERO DE PARES CANDIDATOS evaluados por _fusionar_muros_por_proximidad (línea "for j in candidatos" en adelante) cuando hay n=944 entradas de entrada -- ¿cuántos pares candidatos puede proponer razonablemente el bucketing espacial (línea "cell = max(1, tol_fusion_px)") para geometría muy fragmentada/densa como esta? ¿Hay algún caso donde el bucketing degenera (ej. celdas muy pobladas) y termina evaluando ~n² pares en vez de un número acotado?
(b) el tamaño del contexto_local que se reconstruye DESDE CERO en cada par evaluado (líneas ~919-923, "contexto_par = [s for k in range(n) if ... ]") -- esto es un scan O(n) sobre TODAS las n entradas, ejecutado UNA VEZ POR CADA PAR candidato que llega hasta ahí. Con P pares evaluados y n=944, ¿cuánto pesa esto? ¿Y el cache de 1 slot de identificar_lineas_centrales/identificar_hojas_de_puerta ayuda acá, dado que contexto_par es una lista NUEVA (distinta identidad de objeto) en cada iteración -- o sea, el cache NUNCA puede servir entre pares distintos, solo dentro de una misma llamada a cuerpo_cerrado_fusiona? ¿Es correcto ese análisis?
(c) dentro de cuerpo_cerrado_fusiona mismo, además de clasificar_no_muro, también llama a construir_contexto_con_pares(contexto_local, mpx, hoja_ids=hoja_ids) -- ¿esta función es O(m²) sobre el tamaño m del contexto_local? Si m es grande en una zona densa (muchos de los 944 fragmentos concentrados en poco espacio), ¿el costo por par podría ser O(m²) con m potencialmente grande, multiplicado por P pares?

Buscá el peor patrón real de complejidad total (algo del tipo O(n × P) para reconstruir contexto_par, más O(P × m²) para el trabajo geométrico por par) y proponé, si es posible, un cambio CONCRETO y de bajo riesgo (sin cambiar ningún criterio de clasificación/fusión, solo evitar trabajo redundante o acotar mejor el contexto) -- por ejemplo: precomputar una sola vez una estructura espacial reusable entre pares cercanos, evitar el scan O(n) de contexto_par con el mismo bucketing espacial que ya existe para candidatos, o detectar si el propio bucketing produce demasiados candidatos en zonas densas y necesita una celda más chica. NO sugieras cambios de criterio geométrico (tolerancias, qué cuenta como muro/hoja/ventana) -- solo complejidad/rendimiento. Responde en español, con referencias a línea/función exactas del código que te paso, y si proponés un fix, dejalo como sugerencia concreta de código, no solo la idea.`;

async function llamarDeepSeek(userContent) {
  const envPath = path.join(ARCHICHECK_ROOT, ".env.deepseek.local");
  const API_KEY = fs.readFileSync(envPath, "utf8").match(/DEEPSEEK_API_KEY=(.+)/)[1].trim();
  console.log(`→ DeepSeek: enviando ${userContent.length} caracteres...`);
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: "Eres un revisor de código senior especializado en complejidad algorítmica y performance." },
        { role: "user", content: userContent },
      ],
      max_tokens: 8000,
    }),
  });
  const outPath = path.join(OUT_DIR, `${stamp}_deepseek.json`);
  if (!resp.ok) {
    fs.writeFileSync(outPath, JSON.stringify({ error: true, status: resp.status, body: await resp.text() }, null, 2));
    console.log(`  ✗ ERROR ${resp.status} — ${outPath}`);
    return;
  }
  const data = await resp.json();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`  ✓ OK — ${outPath}`);
}

async function llamarCodex(userContent) {
  const envPath = path.join(ARCHICHECK_ROOT, ".env.openai.local");
  const API_KEY = fs.readFileSync(envPath, "utf8").match(/OPENAI_API_KEY=(.+)/)[1].trim();
  const MODEL = "gpt-5.3-codex";
  console.log(`→ Codex: enviando ${userContent.length} caracteres...`);
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      input: [
        { role: "system", content: "Eres un revisor de código senior especializado en complejidad algorítmica y performance." },
        { role: "user", content: userContent },
      ],
    }),
  });
  const outPath = path.join(OUT_DIR, `${stamp}_codex.json`);
  if (!resp.ok) {
    fs.writeFileSync(outPath, JSON.stringify({ error: true, status: resp.status, body: await resp.text() }, null, 2));
    console.log(`  ✗ ERROR ${resp.status} — ${outPath}`);
    return;
  }
  const data = await resp.json();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`  ✓ OK — ${outPath}`);
}

const userContent = `${CONTEXTO}

===== ARCHIVO: Fase 2/Herramientas_CubiCasa5k/cuerpo_cerrado.py (completo) =====
${cuerpoCerrado}

===== ARCHIVO: Fase 2/Desarrollos/Test/Celda 4 - copiar en Colab.py — SOLO _fusionar_muros_por_proximidad (la función donde ocurre el cuelgue) =====
${fusionFn}`;

await llamarDeepSeek(userContent);
await llamarCodex(userContent);
console.log("\nListo. Resultados crudos en:", OUT_DIR);
