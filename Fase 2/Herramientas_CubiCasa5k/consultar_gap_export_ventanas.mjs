// Consulta puntual (no periódica) a DeepSeek y Codex sobre un hallazgo concreto:
// el clasificador geométrico de ventanas (clasificar_no_muro/identificar_lineas_centrales)
// nunca se propaga al export (muros_geo.append), y no existe un ventanas_geo. Se pide
// segunda opinión sobre la causa raíz Y sobre en qué documento del proyecto debería
// quedar registrado (Convenciones_CAD.md vs catalogo_tipologias.py vs Diseno_Funcional_
// ArchiCheck.md). Mismo mecanismo de credenciales que revisar_con_deepseek.mjs /
// revisar_con_codex.mjs, pero prompt de una sola pregunta enfocada, no scan de archivos.
//
// Uso: node consultar_gap_export_ventanas.mjs

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

const CONTEXTO = `Proyecto ArchiCheck: analiza planos arquitectónicos (PDF) para pre-validar cumplimiento normativo chileno. Un pipeline geométrico determinista en Python (Colab) extrae muros/puertas/ventanas de los paths vectoriales del PDF.

HALLAZGO A EVALUAR (encontrado auditando el código real, no reportado por el usuario):

1) En la Celda 4 (extraer_datos_vectoriales), el export real de muros se arma así (extracto real, Celda 4 - copiar en Colab.py, líneas ~1643-1706):

\`\`\`python
for grupo in grupos_conectividad:
    if _span_grupo(segmentos_l, grupo) < UMBRAL_MURO_PX:
        continue
    segs_protegidos = [i for i in grupo if protegido[i]]
    if not segs_protegidos:
        continue
    segs_reales = []
    segs_no_muro = []
    for i in segs_protegidos:
        ang = _angulo_segmento(segmentos_l[i]) % 90
        if min(ang, 90 - ang) <= TOL_EJE_MURO_DEG:
            segs_reales.append(i)
        else:
            segs_no_muro.append(i)
    if not segs_reales:
        continue
    cadenas_muro = _dividir_en_muros_por_union(segmentos_l, segs_reales, TOL_MURO_PX, TOL_DIAMETRO_CLUSTER_PX)
    for _cadena in cadenas_muro:
        # ... arma segmentos_muro, anchos_muro, _estado_muro ...
        muros_geo.append({
            'id': f'MU{len(muros_geo) + 1:02d}',
            'segmentos': segmentos_muro,
            'largo_total_m': ...,
            'ancho_linea_prom': ...,
            'estado': _estado_muro,
        })
\`\`\`

Ese bloque decide qué entra a \`muros_geo\` SOLO por span/ángulo/conectividad. Nunca llama a \`clasificar_no_muro()\`.

2) \`clasificar_no_muro()\` (en cuerpo_cerrado.py, usa identificar_lineas_centrales/identificar_hojas_de_puerta) SÍ existe y SÍ funciona -- pero solo se usa en 2 lugares del pipeline: (a) como gate dentro de \`cuerpo_cerrado_fusiona\` para BLOQUEAR que 2 caras de ventana se fusionen entre sí como si fueran muro, y (b) para colorear el PNG de diagnóstico (\`diag_completo_*\`, código posterior en la misma Celda 4, línea ~2043 en adelante). Ninguno de los dos consumidores escribe de vuelta a \`muros_geo\` ni a ningún otro campo exportado.

3) No existe un campo \`ventanas_geo\` en el schema de salida. Confirmado en Diseno_Funcional_ArchiCheck.md (línea 328, lista real de campos por página: \`mediciones_geometricas\`, \`incumplimientos_geo\`, \`analisis_semantico\`, \`muros_geo\`, \`puertas_geo\`, \`muros_excluidos_por_referencia\` -- sin ventanas). El mismo documento, línea 79, dice explícitamente que por diseño original "ventana/escalera/rampa siguen viniendo de \`analisis_semantico\` (estimación de Claude Vision)" -- nunca de geometría determinista.

4) Ese mismo documento (§2.9, escrito 2026-08-21, sin actualizar desde entonces -- no refleja el port a Python de cuerpo_cerrado.py, ni catalogo_tipologias.py, ni las secciones D.1-D.11 de Convenciones_CAD.md) ya registraba el mismo síntoma un caso antes: "es exactamente el bug MU18 (ventana+pilar+ventana)... porque puerta/ventana son solo diagnóstico" (línea 256). Es decir: el gap ya se había detectado el 21-ago y nunca se resolvió; reapareció el 30-ago en un proyecto distinto (Beauchef, segmentos MU18-21) con el mismo mecanismo exacto.

5) catalogo_tipologias.py tiene esta entrada (líneas 82-90):
\`\`\`python
"D1-D3-ventana-lineas-centrales": {
    "seccion": "D.1 / D.3", "elemento": "Muros / Ventanas",
    "nombre": "Filtro ventana como falso candidato a muro/pilar (firma ABSOLUTA, especifica de ventana)",
    "criterio": "Par de bordes paralelos + 1 linea central simetrica...",
    "estado": "implementado",
    "implementado_en": ["cuerpo_cerrado.py:identificar_lineas_centrales"],
},
\`\`\`
"estado": "implementado" es técnicamente correcto (la función existe y clasifica bien) pero no deja rastro de que el resultado nunca llega al export.

MI DIAGNÓSTICO DE CAUSA RAÍZ (a evaluar, no a repetir sin criticar): esto no es un bug de lógica de clasificación -- la clasificación en sí es correcta. Es un gap de arquitectura/wiring: cuando el clasificador geométrico de ventanas se construyó (22-24 ago) sobre un diseño original (documentado 21-ago) que asumía que las ventanas SIEMPRE vendrían de Claude Vision, nadie le creó un slot de salida propio (\`ventanas_geo\`) ni se conectó su resultado al export de \`muros_geo\` -- quedó enchufado solo a fusión y a diagnóstico visual.

EL PROYECTO TIENE 3 FORMATOS DE DOCUMENTACIÓN DISTINTOS PARA ESTE TIPO DE HALLAZGOS:
- Convenciones_CAD.md: referencia narrativa de CÓMO LEER símbolos/geometría de un plano CAD (firma de ventana, puerta, etc.) -- no es sobre qué hace el código con esa lectura después.
- catalogo_tipologias.py: catálogo estructurado, una entrada por criterio geométrico, con estado (implementado/parcial/pendiente) y función(es) donde vive, verificado por grep -- su grano es "¿existe código para este criterio?", no "¿el pipeline completo lo usa end-to-end?".
- Diseno_Funcional_ArchiCheck.md: documento de arquitectura vigente -- tiene una sección de schema de salida real por página y una sección "Lo que NO está implementado"; explícitamente NO es bitácora (esa es el roadmap, que ya registró este hallazgo como historia).

PREGUNTAS:
1. ¿Coincidís con el diagnóstico de causa raíz de arriba? ¿Hay algo que se esté pasando por alto -- por ejemplo, algún motivo real (no solo histórico) para que ventana siga sin tener slot de export propio, o algún riesgo concreto en agregar \`ventanas_geo\` que no se esté considerando?
2. Dado los 3 formatos descritos arriba, ¿en cuál (o combinación de cuáles) debería quedar documentado este hallazgo -- la causa raíz Y el hecho de que sigue sin resolverse -- para que no se vuelva a redescubrir en el próximo proyecto? ¿Le agregarías algo a la entrada de catalogo_tipologias.py para que "implementado" no dé a entender que ya llega al export, o eso ensancha el propósito de ese archivo más de lo que conviene?

Respondé en español. Sé específico y crítico -- si el diagnóstico tiene un hueco, decilo directamente en vez de validarlo por cortesía.`;

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
