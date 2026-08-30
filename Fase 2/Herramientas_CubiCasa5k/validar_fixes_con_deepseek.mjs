// Validación cruzada con DeepSeek de 2 fixes ya aplicados (commit 1eca3e4), encontrados
// originalmente por Codex. No es un scan general (revisar_con_deepseek.mjs) — es una
// verificación puntual: se le da a DeepSeek el código relevante (antes/después + el
// contexto necesario para confirmar la estructura real) y se le pide que diga si el bug
// era real y si el fix es correcto/completo, no que busque hallazgos nuevos.
//
// Uso: node validar_fixes_con_deepseek.mjs
// Requiere: ../../.env.deepseek.local (ya existente)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHICHECK_ROOT = path.resolve(__dirname, "../..");

const envPath = path.join(ARCHICHECK_ROOT, ".env.deepseek.local");
const API_KEY = fs.readFileSync(envPath, "utf8").match(/DEEPSEEK_API_KEY=(.+)/)[1].trim();

const SYSTEM_PROMPT = `Eres un revisor de código senior validando fixes ya aplicados por otro revisor (no buscando hallazgos nuevos). Para cada caso te doy: el código ANTES, el código DESPUÉS, la explicación del bug, y el contexto necesario para verificar la estructura de datos real. Tu tarea: decir explícitamente si (1) el bug descrito era real, (2) el fix es correcto y completo, o (3) el fix está mal o incompleto y por qué. Sé directo — si el análisis original está equivocado, dilo claramente, no lo suavices. Responde en español.`;

const USER_CONTENT = `
===== CASO 1: App.jsx — _colab_id en recintos_superficies =====

CONTEXTO — cómo se construye merged.capa2 (mergeResults, src/App.jsx):

function mergeSeccionConComparacion(s1 = {}, s2 = {}, tableKey, keyField, verdictField, origen, discAcc) {
  const t1 = s1[tableKey] || [], t2 = s2[tableKey] || [];
  const { merged, discrepancias } = compararTablas(t1, t2, keyField, verdictField, origen);
  discAcc.push(...discrepancias);
  const base = { ...(t1.length >= t2.length ? s1 : s2) };
  base.observaciones = mergeObs(s1.observaciones, s2.observaciones);
  base[tableKey] = merged;
  return base;
}

// Llamadas reales (dentro de mergeResults, capa2):
recintos_superficies:   mergeSeccionConComparacion(r1.capa2?.recintos_superficies   || {}, r2.capa2?.recintos_superficies   || {}, "tabla", "recinto",   "cumple", "Recintos y superficies",     discrepancias_ensamble),
circulaciones:           mergeSeccionConComparacion(r1.capa2?.circulaciones           || {}, r2.capa2?.circulaciones           || {}, "tabla", "elemento",  "cumple", "Circulaciones",              discrepancias_ensamble),
iluminacion_ventilacion: mergeSeccionConComparacion(r1.capa2?.iluminacion_ventilacion || {}, r2.capa2?.iluminacion_ventilacion || {}, "tabla", "recinto",   "cumple", "Iluminación y ventilación",  discrepancias_ensamble),

BUG DESCRITO: el bloque "Fix 3" (inyecta _colab_id, un id de referencia a Colab, en cada fila de las tablas de resultados para poder hacer click y saltar a la evidencia geométrica) usaba una ruta de propiedad distinta para recintos_superficies que para las otras 2 tablas del mismo tipo.

ANTES:
        for (const r of (merged.capa2?.circulaciones?.tabla || []))
          if (!r._colab_id) r._colab_id = findColabId(r.elemento);
        for (const r of (merged.capa2?.iluminacion_ventilacion?.tabla || []))
          if (!r._colab_id) r._colab_id = findColabId(r.recinto);
        for (const nivel of (merged.capa2?.recintos_superficies?.por_nivel || []))
          for (const r of (nivel.recintos || []))
            if (!r._colab_id) r._colab_id = findColabId(r.nombre);

DESPUÉS:
        for (const r of (merged.capa2?.circulaciones?.tabla || []))
          if (!r._colab_id) r._colab_id = findColabId(r.elemento);
        for (const r of (merged.capa2?.iluminacion_ventilacion?.tabla || []))
          if (!r._colab_id) r._colab_id = findColabId(r.recinto);
        for (const r of (merged.capa2?.recintos_superficies?.tabla || []))
          if (!r._colab_id) r._colab_id = findColabId(r.nombre);

PREGUNTA: ¿Es correcto que recintos_superficies.tabla (no .por_nivel) es la estructura real, dado que se construye con mergeSeccionConComparacion(..., "tabla", ...) igual que circulaciones/iluminacion_ventilacion? ¿El fix (cambiar .por_nivel por .tabla, aplanando el loop) es correcto y completo?

===== CASO 2: indexar_normativa.mjs — deduplicar() no se aplicaba a PRC =====

CONTEXTO — el resto de fuentes:
    const chunks = deduplicar(chunksLey(oguc, 'OGUC', 'OGUC'));
    await procesarChunks(chunks, \`OGUC (\${oguc.total_articulos} arts.)\`);
    ...
    await procesarChunks(deduplicar(chunksDDU(ddu351)), 'DDU 351 (Accesibilidad)');

función deduplicar:
function deduplicar(chunks) {
  const seen = new Map();
  return chunks.map(c => {
    if (!seen.has(c.codigo)) { seen.set(c.codigo, 1); return c; }
    const n = seen.get(c.codigo) + 1;
    seen.set(c.codigo, n);
    return { ...c, codigo: \`\${c.codigo}-dup\${n}\` };
  });
}

función chunksPRC (genera el codigo así): const codigo = \`\${prefijo}-\${art.numero || art.id}\`;

ANTES (en main(), bloque de PRCs):
      const prcChunks = chunksPRC(join(comunasDir, comuna));
      if (prcChunks.length > 0) {
        await procesarChunks(prcChunks, \`PRC \${comuna}\`);
      }

DESPUÉS:
      const prcChunks = deduplicar(chunksPRC(join(comunasDir, comuna)));
      if (prcChunks.length > 0) {
        await procesarChunks(prcChunks, \`PRC \${comuna}\`);
      }

PREGUNTA: ¿Es real que sin deduplicar(), dos artículos PRC sin numero/id generarían el mismo código y el upsert (on_conflict=codigo) pisaría uno con el otro en silencio? ¿El fix (envolver chunksPRC con deduplicar(), igual que las demás fuentes) es correcto y suficiente, o falta algo?
`;

const resp = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
  body: JSON.stringify({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: USER_CONTENT },
    ],
    max_tokens: 4000,
  }),
});

if (!resp.ok) {
  console.error(`ERROR ${resp.status}:`, await resp.text());
  process.exit(1);
}
const data = await resp.json();
console.log(data.choices[0].message.content);
