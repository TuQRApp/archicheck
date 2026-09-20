// "Revisión Ing SW" -- Paso 2 (DeepSeek + Codex), ver Proyecto/
// Diseno_Funcional_ArchiCheck.md S3.16. Script REUSABLE: siempre manda el
// mismo checklist fijo de 10 puntos (nunca una seleccion ad-hoc), mas el
// contexto especifico de los archivos que se le pasen. NUNCA se corre solo
// -- el usuario confirma cada vez antes de invocarlo (costo de API real).
//
// Uso: node revisar_ing_sw_paso2.mjs
// (los archivos a revisar y el contexto se editan abajo, en ARCHIVOS/CONTEXTO_CAMBIOS,
// antes de cada corrida -- no hay CLI args todavia, uso puntual por ahora)
//
// Requiere: .env.openai.local (OPENAI_API_KEY=...) y .env.deepseek.local
// (DEEPSEEK_API_KEY=...) en la raiz de archicheck/, ambos gitignored.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHICHECK_ROOT = path.resolve(__dirname, "..");

const OUT_DIR = path.join(__dirname, "_consultas_ing_sw_paso2");
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function leerEnv(nombreArchivo, nombreVar) {
  const envPath = path.join(ARCHICHECK_ROOT, nombreArchivo);
  const envContent = fs.readFileSync(envPath, "utf8");
  return envContent.match(new RegExp(`${nombreVar}=(.+)`))[1].trim();
}

// ─────────────────────────────────────────────────────────────────────
// CHECKLIST FIJO -- Diseno_Funcional_ArchiCheck.md S3.16, Paso 2. Se manda
// COMPLETO en cada corrida, nunca un subconjunto elegido segun el caso
// puntual -- instruccion explicita del usuario, 2026-09-20.
// ─────────────────────────────────────────────────────────────────────
const CHECKLIST = `Revisa el código de abajo cubriendo TODOS estos 10 aspectos -- es un checklist fijo, cubrilos todos, no elijas un subconjunto según lo que te parezca más relevante a primera vista:

1. Corrección lógica / bugs -- casos límite, condiciones de borde, qué pasa con None/valores faltantes en cada rama nueva.
2. Hardcodeo -- no solo si repite un valor que ya existe en otro lugar (eso ya se revisa con una herramienta mecánica aparte), sino valores mágicos genuinamente nuevos nunca centralizados, nombres de campo/Pset asumidos sin verificar, o un valor equivalente pero no idéntico al real (ej. 0.799 en vez de 0.8).
3. Efectos no-locales -- ¿este cambio puede alterar comportamiento en otra parte del sistema de forma no obvia?
4. Consistencia con patrones ya establecidos -- ¿duplica lógica que ya vive en otro archivo? ¿sigue la misma convención que código equivalente ya escrito?
5. "Dato ausente" vs. "no cumple" -- ¿todo None/campo faltante se trata como incertidumbre, nunca como incumplimiento?
6. Nunca fallar en silencio -- ¿hay algún camino (excepción tragada, except/pass, valor por defecto sin aviso) donde un caso raro desaparezca sin dejar rastro?
7. Evidencia real detrás de cada umbral/supuesto nuevo -- ¿tiene cita y fuente verificada, o es una estimación sin marcar como tal?
8. Rendimiento con datos reales grandes -- ¿algo O(n²)/O(n³) que pueda colgarse con un archivo real grande?
9. Robustez ante variación real de los datos de entrada -- ¿asume un idioma, un nombre de campo, una convención que podría no cumplirse en otro archivo real?
10. Trazabilidad -- ¿el código nuevo documenta el por qué, no solo el qué (motivo, evidencia)?

NO comentes sobre formato, nombres de variables, o preferencias de estilo. Si algo no es un problema real bajo ninguno de estos 10 puntos, no lo menciones -- prioriza precisión sobre exhaustividad, pero recorré los 10 puntos explícitamente antes de concluir que no hay nada que decir de alguno. Responde en español. Para cada hallazgo real: qué aspecto del checklist (1-10), archivo, línea o función aproximada, qué está mal, y por qué importa. Si no hay hallazgos reales, decilo explícitamente en vez de forzar algo.`;

// ─────────────────────────────────────────────────────────────────────
// CONTEXTO especifico de esta corrida -- editar antes de cada uso.
// ─────────────────────────────────────────────────────────────────────
const CONTEXTO_CAMBIOS = `Proyecto ArchiCheck (análisis normativo chileno de proyectos de arquitectura).

CONTEXTO PREVIO (misma sesión, ya revisado y corregido en 4 consultas anteriores a esta misma pareja de modelos -- área/ancho de recinto, círculo de giro accesible, pendiente/ancho de rampa, ancho de escalera/deduplicación IfcStair). Fase 2/reglas_normativas.py es la fuente única de OGUC_REGLAS. NO vuelvas a marcar esos 4 puntos, ya están resueltos. El foco de ESTA consulta es un trabajo distinto y más grande: "punto 5 -- Normativas" del mismo día, con 2 partes.

PARTE A -- DEPURACIÓN Y CORRECCIÓN DE CITAS (verificación artículo por artículo contra el texto real de OGUC/LGUC/DDU, NO contra lo que ya estaba escrito):

1. Fase 2/reglas_normativas.py: 'puerta_ancho_libre' estaba citando OGUC Art. 4.1.7 N°6 con 0.80m -- ese N°6 letra b) es en realidad el caso de baño accesible, no la puerta general. Se corrigió a Art. 4.1.7 N°4, 0.90m (caso general), y se agregó una entrada NUEVA y separada 'puerta_ancho_libre_bano_accesible' (0.80m, N°6 letra b)) para no perder ese caso. Se agregó también 'ventilacion_iluminacion_pct' (10.0) marcada explícitamente 'SIN VERIFICAR' -- la cita previa (OGUC 4.2.5/4.2.6) resultó ser de pasillos/altura de evacuación, no de ventanas; el artículo real de ventilación de locales habitables (4.1.2) es cualitativo, sin porcentaje, así que el 10% quedó como convención de diseño sin respaldo OGUC, marcada como tal en vez de presentada como norma real. La entrada 'pasillo' (1.20m) también se dejó con cita 'SIN VERIFICAR' tras una búsqueda exhaustiva que no encontró artículo general de OGUC para ancho de pasillo (solo 4.7.22 -- específico de teatros -- y 6.4.2 -- vivienda social accesible, 0.90-1.05m -- ninguno coincide con el caso general reclamado). NOTA para esta revisión: quedó pendiente, no resuelto hoy, que el Art. 4.2.18 (tabla por carga de ocupación) da un ancho mínimo real de pasillo de 1.10m -- no se aplicó todavía, es una decisión pendiente, no evalúes esto como bug de este cambio.

2. Fase 2/BIM/analizar_todos.py: renombradas cumple_ancho_min_0_80m -> cumple_ancho_min y puertas_ok_0_80m -> puertas_ok_ancho_min (los nombres viejos tenían el valor ahora incorrecto incrustado en el nombre). El chequeo de ventilación se cambió de un 10.0 hardcodeado a importar _VENTILACION_MIN_PCT/_REF_VENTILACION desde reglas_normativas.py (fuente única).

3. Fase 2/BIM/generar_json_colab.py: el informe mostraba al arquitecto el texto literal "mínimo OGUC 10%" como si fuera una cita normativa real -- afirmación falsa de cara al usuario final. Corregido a un f-string que usa _VENTILACION_MIN_PCT y aclara explícitamente "sin cita OGUC verificada -- ver Convenciones_BIM.md".

4. normativa/nacional/reglas_verificacion.json: auditadas las 12 reglas contra el texto completo real de OGUC (770 artículos)/LGUC (245 artículos). 8 de 12 tenían cita incorrecta o de un artículo que trata un tema distinto -- corregidas con la cita real encontrada (incluye 2 casos donde no había ninguna cita previa remotamente correcta y se encontró la real por primera vez: 'cambio_destino' -> OGUC Art. 4.2.2, 'proteccion_patrimonio' -> OGUC Art. 2.1.43 + 2.6.4 + 5.1.4, cadena real de autorización via Consejo de Monumentos Nacionales / SEREMI MINVU, no la DOM). Las 4 restantes se confirmaron correctas tal cual estaban.

5. normativa/nacional/schema.sql: tenía una copia DUPLICADA y desincronizada de las mismas 12 reglas (con las citas viejas, ya corregidas en el JSON pero nunca propagadas aquí) -- corregida, y se cambió 'ON CONFLICT (id) DO NOTHING' a 'ON CONFLICT (id) DO UPDATE SET ...' porque DO NOTHING nunca habría corregido una fila ya insertada. Se verificó con la base real que esta tabla (reglas_verificacion_nacional) nunca llegó a crearse en producción -- cero drift real, solo desincronización de archivos.

PARTE B -- TAXONOMÍA MULTI-DIMENSIONAL EN SUPABASE (normativa_chunks, columna metadata jsonb ya existente, sin agregar columnas nuevas), ejecutada en vivo contra la base real (1608 filas):

6. normativa/taxonomia_articulos.json: tabla de clasificación en 2 niveles -- 'articulos' (exacta por número, clasificacion_metodo:"verificado", solo para ~46 artículos ya leídos a fondo -- capítulos 4.1/4.2 completos + 2.1.43/2.6.4/5.1.4) y 'capitulos_fallback' (heurística por prefijo de capítulo para el resto, clasificacion_metodo:"heuristica_no_verificada" -- nunca se mezclan sin distinguir cuál es cuál).

7. normativa/clasificar_normativa.mjs: función única clasificar(fuente, codigo, metadataExistente, taxonomia) -- clasifica en 7 dimensiones (tipo_edificacion, tipo_norma vocabulario controlado, ambito+comuna+zona, etapa_pipeline como array de códigos OBS-G/E/V/M/N/INC/DF del producto, vigencia+vigencia_fecha, canal CAD/BIM/ambos, jerarquia con 3 valores enum). Importada tanto por indexar_normativa.mjs (cargas futuras) como por backfill_metadata.mjs (filas ya cargadas). BUG REAL encontrado y corregido en el camino: la primera versión asumía fuente==='PRC' exacto, pero en la tabla real la fuente de Providencia es 'PRC-PRV' -- 281 filas cayeron a un fallback vacío con ambito mal puesto como "nacional" en la primera corrida del backfill; se detectó comparando una fila real después de esa corrida, se corrigió a fuente.startsWith('PRC') + mapeo de sufijo de comuna, y se re-corrió (1608/1608, 0 errores).

8. normativa/backfill_metadata.mjs: pagina las 1608 filas (de 1000 en 1000), clasifica cada una, hace PATCH del metadata (merge con lo existente) via REST con concurrencia=15. Usa la SECRET key (service_role) porque se verificó empíricamente que la publishable key (RLS) no persiste escrituras -- probado con un campo reversible antes de usar la key real para todo.

9. normativa/migracion_taxonomia_metadata.sql: crea índice GIN sobre metadata; extiende match_normativa() con 6 parámetros opcionales nuevos (p_tipo_edificacion, p_tipo_norma, p_ambito, p_comuna, p_canal, p_solo_vigentes default true) MANTENIENDO la firma original de 3 argumentos intacta (overload de Postgres por cantidad de argumentos -- el Worker en producción que llama la versión de 3 args no necesitó ningún cambio); agrega articulos_por_etapa(p_etapa, p_solo_vigentes) nueva. Ejecutado en vivo -- funciones e índice confirmados con pg_proc/pg_indexes reales; articulos_por_etapa('OBS-N05') devuelve exactamente los 3 artículos reales de ventilación (4.1.2/4.1.3/4.1.4).

10. normativa/indexar_normativa.mjs: modificadas chunksLey()/chunksDDU()/chunksPRC() para llamar clasificar() y fusionar la taxonomía en el metadata de cada chunk al momento de cargar (cargas futuras, no retroactivo -- eso lo hace backfill_metadata.mjs aparte).

11. Fase 2/verificar_hardcodeo_normativo.py (el propio script de Etapa 0 de "Revisión Ing SW"): extendido HOY para además escanear normativa/ recursivo (*.mjs, *.sql, *.json), no solo *.py -- el gap real que motivó esta extensión es que este mismo script nunca habría detectado la desincronización de reglas_verificacion.json vs. nacional/schema.sql (punto 5 arriba) porque antes solo miraba archivos .py. Se agregaron 2 exenciones documentadas (taxonomia_articulos.json, reglas_verificacion.json -- son documentación narrativa, no lógica ejecutable) y soporte para reconocer comentarios de JS (//, /*, *) y SQL (--) en _es_comentario_o_docstring.

GAP CONOCIDO Y YA DOCUMENTADO, no evaluar como bug: la base Supabase viva sigue indexada desde normativa/nacional/Fuentes/oguc.json (644 artículos)/lguc.json (234), NO desde las extracciones más completas oguc_pdf.json (770)/lguc_pdf.json (245) usadas todo el día para la curación de PARTE A -- re-indexar desde las fuentes _pdf.json queda pendiente, es trabajo futuro documentado en Backlog_Macro.md ítem 4, no algo que este cambio debía resolver.

Objetivo de esta revisión: cubrir los 10 puntos del checklist sobre TODO lo anterior (PARTE A y PARTE B) -- con especial atención a los puntos 2 (evidencia real detrás de cada cita nueva -- ¿alguna de las 8 correcciones de reglas_verificacion.json o las 2 nuevas de reglas_normativas.py sigue sin verificación real?), 5 (¿la clasificación heurística de capitulos_fallback se presenta alguna vez como si fuera tan confiable como la verificada?), 6 (¿algún error silencioso posible en el backfill si clasificar() lanza excepción a mitad de la paginación?) y 9 (¿la extensión de match_normativa()/el nuevo índice GIN escalan bien si normativa_chunks crece varios órdenes de magnitud?).`;

const ARCHIVOS = [
  ["Fase 2/reglas_normativas.py", path.join(ARCHICHECK_ROOT, "Fase 2", "reglas_normativas.py")],
  ["Fase 2/BIM/analizar_todos.py", path.join(ARCHICHECK_ROOT, "Fase 2", "BIM", "analizar_todos.py")],
  ["Fase 2/BIM/piloto_ids_oguc.py", path.join(ARCHICHECK_ROOT, "Fase 2", "BIM", "piloto_ids_oguc.py")],
  ["Fase 2/BIM/generar_json_colab.py", path.join(ARCHICHECK_ROOT, "Fase 2", "BIM", "generar_json_colab.py")],
  ["normativa/nacional/reglas_verificacion.json", path.join(ARCHICHECK_ROOT, "normativa", "nacional", "reglas_verificacion.json")],
  ["normativa/nacional/schema.sql", path.join(ARCHICHECK_ROOT, "normativa", "nacional", "schema.sql")],
  ["normativa/taxonomia_articulos.json", path.join(ARCHICHECK_ROOT, "normativa", "taxonomia_articulos.json")],
  ["normativa/clasificar_normativa.mjs", path.join(ARCHICHECK_ROOT, "normativa", "clasificar_normativa.mjs")],
  ["normativa/backfill_metadata.mjs", path.join(ARCHICHECK_ROOT, "normativa", "backfill_metadata.mjs")],
  ["normativa/migracion_taxonomia_metadata.sql", path.join(ARCHICHECK_ROOT, "normativa", "migracion_taxonomia_metadata.sql")],
  ["normativa/indexar_normativa.mjs", path.join(ARCHICHECK_ROOT, "normativa", "indexar_normativa.mjs")],
  ["Fase 2/verificar_hardcodeo_normativo.py", path.join(ARCHICHECK_ROOT, "Fase 2", "verificar_hardcodeo_normativo.py")],
];

function armarUserContent() {
  let userContent = CONTEXTO_CAMBIOS + "\n\n" + CHECKLIST + "\n\nCódigo a revisar:";
  for (const [rel, abs] of ARCHIVOS) {
    if (!fs.existsSync(abs)) {
      console.log(`  ⚠ no encontrado, se omite: ${rel}`);
      continue;
    }
    userContent += `\n\n===== ARCHIVO: ${rel} =====\n${fs.readFileSync(abs, "utf8")}`;
  }
  return userContent;
}

async function consultarDeepSeek(userContent) {
  const API_KEY = leerEnv(".env.deepseek.local", "DEEPSEEK_API_KEY");
  console.log("→ Enviando a DeepSeek...");
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [{ role: "user", content: userContent }],
      max_tokens: 8000,
    }),
  });
  const outPath = path.join(OUT_DIR, `${stamp}_deepseek.json`);
  if (!resp.ok) {
    fs.writeFileSync(outPath, JSON.stringify({ error: true, status: resp.status, body: await resp.text() }, null, 2));
    console.log(`  ✗ ERROR ${resp.status} -- guardado en ${outPath}`);
    return;
  }
  const data = await resp.json();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`  ✓ OK -- guardado en ${outPath}`);
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

async function consultarCodex(userContent) {
  const API_KEY = leerEnv(".env.openai.local", "OPENAI_API_KEY");
  const MODEL = "gpt-5.3-codex";
  console.log("→ Enviando a Codex...");
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: userContent }],
    }),
  });
  const outPath = path.join(OUT_DIR, `${stamp}_codex.json`);
  if (!resp.ok) {
    fs.writeFileSync(outPath, JSON.stringify({ error: true, status: resp.status, body: await resp.text() }, null, 2));
    console.log(`  ✗ ERROR ${resp.status} -- guardado en ${outPath}`);
    return;
  }
  const data = await resp.json();
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  const texto = extraerTextoCodex(data);
  console.log(texto ? `  ✓ OK -- guardado en ${outPath}` : `  ⚠ OK pero no se pudo extraer texto -- revisar ${outPath} a mano`);
}

const userContent = armarUserContent();
console.log(`Enviando ${ARCHIVOS.length} archivo(s), ${userContent.length} caracteres, checklist de 10 puntos incluido.`);
await consultarDeepSeek(userContent);
await consultarCodex(userContent);
console.log("\nListo. Resultados crudos en:", OUT_DIR);
