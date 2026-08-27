// Revisión de código periódica con DeepSeek — ver Convenciones_CAD.md D.11.
// Disparo manual (el usuario decide cuándo correr esto), archivos completos (no diffs),
// la respuesta cruda se guarda para que Claude la filtre después (no se muestra sin filtrar).
//
// Uso: node revisar_con_deepseek.mjs
// Requiere: ../../.env.deepseek.local con DEEPSEEK_API_KEY=... (raíz de archicheck/, gitignored vía *.local)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHICHECK_ROOT = path.resolve(__dirname, "../..");
const WORKER_ROOT = path.resolve(ARCHICHECK_ROOT, "../archicheck-worker");

const envPath = path.join(ARCHICHECK_ROOT, ".env.deepseek.local");
const envContent = fs.readFileSync(envPath, "utf8");
const API_KEY = envContent.match(/DEEPSEEK_API_KEY=(.+)/)[1].trim();

const OUT_DIR = path.join(__dirname, "_deepseek_reviews");
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

// Extrae solo celdas de código de un .ipynb (ignora outputs/imágenes embebidas)
function extraerCodigoNotebook(rutaIpynb) {
  const nb = JSON.parse(fs.readFileSync(rutaIpynb, "utf8"));
  const celdas = (nb.cells || [])
    .filter(c => c.cell_type === "code")
    .map((c, i) => `# ── Celda ${i + 1} ──\n` + (Array.isArray(c.source) ? c.source.join("") : c.source));
  return celdas.join("\n\n");
}

function leerArchivo(rutaAbs) {
  if (rutaAbs.endsWith(".ipynb")) return extraerCodigoNotebook(rutaAbs);
  return fs.readFileSync(rutaAbs, "utf8");
}

function armarBloque(rutaRelativa, contenido) {
  return `\n\n===== ARCHIVO: ${rutaRelativa} =====\n${contenido}`;
}

const SYSTEM_PROMPT = `Eres un revisor de código senior. El proyecto es ArchiCheck: una herramienta que analiza planos arquitectónicos (PDF) para pre-validar cumplimiento normativo chileno (OGUC/LGUC/PRC) antes de presentar a la DOM.

Arquitectura relevante para tu revisión:
- Frontend React (Vite) que arma prompts y llama a un Worker (Cloudflare) que hace de proxy hacia Anthropic (Claude) y OpenAI (GPT-4o).
- Un pipeline geométrico determinista en Python (corre en Google Colab, no en producción) que extrae muros/puertas/ventanas desde los paths vectoriales del PDF — NUNCA usa un modelo de IA para la geometría, solo para nombrar/clasificar recintos.
- Scripts de indexación de normativa hacia Supabase (RAG).

Busca específicamente: bugs reales (no estilo), casos límite no manejados, posibles null/undefined sin chequear, condiciones de carrera, problemas de seguridad (inyección, secretos expuestos, XSS), código muerto/duplicado, y inconsistencias entre archivos relacionados. NO comentes sobre formato, nombres de variables, o preferencias de estilo. Si algo no es un problema real, no lo menciones — prioriza precisión sobre exhaustividad. Responde en español, en una lista, cada hallazgo con: archivo, línea o función aproximada, qué está mal, y por qué importa.`;

const grupos = [
  {
    nombre: "01_frontend_principal",
    archivos: [["src/App.jsx", path.join(ARCHICHECK_ROOT, "src/App.jsx")]],
  },
  {
    nombre: "02_frontend_secundario",
    archivos: [
      ["src/main.jsx", path.join(ARCHICHECK_ROOT, "src/main.jsx")],
      ["src/components/CropModal.jsx", path.join(ARCHICHECK_ROOT, "src/components/CropModal.jsx")],
      ["src/components/SelectorComuna.jsx", path.join(ARCHICHECK_ROOT, "src/components/SelectorComuna.jsx")],
      ["src/normativa/estacionamientos.js", path.join(ARCHICHECK_ROOT, "src/normativa/estacionamientos.js")],
      ["src/normativa/verificador.js", path.join(ARCHICHECK_ROOT, "src/normativa/verificador.js")],
      ["src/normativa/verificador.test.js", path.join(ARCHICHECK_ROOT, "src/normativa/verificador.test.js")],
    ],
  },
  {
    nombre: "03_worker",
    archivos: [
      ["archicheck-worker/worker.js", path.join(WORKER_ROOT, "worker.js")],
      ["archicheck-worker/reglas_aprendidas.js", path.join(WORKER_ROOT, "reglas_aprendidas.js")],
    ],
  },
  {
    nombre: "04_pipeline_geometrico",
    archivos: [
      ["Fase 2/Herramientas_CubiCasa5k/cuerpo_cerrado.py", path.join(ARCHICHECK_ROOT, "Fase 2/Herramientas_CubiCasa5k/cuerpo_cerrado.py")],
      ["Fase 2/Herramientas_CubiCasa5k/catalogo_tipologias.py", path.join(ARCHICHECK_ROOT, "Fase 2/Herramientas_CubiCasa5k/catalogo_tipologias.py")],
      ["Fase 2/Herramientas_CubiCasa5k/test_cuerpo_cerrado.py", path.join(ARCHICHECK_ROOT, "Fase 2/Herramientas_CubiCasa5k/test_cuerpo_cerrado.py")],
      ["Fase 2/Herramientas_CubiCasa5k/test_threshold_bajo.py", path.join(ARCHICHECK_ROOT, "Fase 2/Herramientas_CubiCasa5k/test_threshold_bajo.py")],
      ["Fase 2/Herramientas_CubiCasa5k/celda_test_cubicasa5k.py", path.join(ARCHICHECK_ROOT, "Fase 2/Herramientas_CubiCasa5k/celda_test_cubicasa5k.py")],
    ],
  },
  {
    nombre: "05_notebook_vigente",
    archivos: (() => {
      const dir = path.join(ARCHICHECK_ROOT, "Fase 2/Desarrollos/Test");
      const nbs = fs.readdirSync(dir).filter(f => f.startsWith("ArchiCheck_Base") && f.endsWith(".ipynb"));
      nbs.sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs);
      const masReciente = nbs[0];
      return [[`Fase 2/Desarrollos/Test/${masReciente} (solo celdas de código)`, path.join(dir, masReciente)]];
    })(),
  },
  {
    nombre: "06_normativa_indexacion",
    archivos: [
      ["normativa/indexar_normativa.mjs", path.join(ARCHICHECK_ROOT, "normativa/indexar_normativa.mjs")],
      ["normativa/extraer_ddu.mjs", path.join(ARCHICHECK_ROOT, "normativa/extraer_ddu.mjs")],
    ],
  },
];

async function revisarGrupo(grupo) {
  let userContent = `Revisa el siguiente código (grupo: ${grupo.nombre}):`;
  for (const [rel, abs] of grupo.archivos) {
    if (!fs.existsSync(abs)) {
      console.log(`  ⚠ no encontrado, se omite: ${rel}`);
      continue;
    }
    userContent += armarBloque(rel, leerArchivo(abs));
  }

  console.log(`→ Enviando grupo ${grupo.nombre} (${userContent.length} caracteres)...`);
  const resp = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      max_tokens: 8000,
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
  console.log(`  ✓ OK — guardado en ${outPath}`);
}

for (const grupo of grupos) {
  await revisarGrupo(grupo);
}
console.log("\nListo. Resultados crudos en:", OUT_DIR);
