import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, ShadingType,
  convertMillimetersToTwip,
} from "docx";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Paleta ───────────────────────────────────────────────────────────────
const AZUL       = "1E40AF";
const NEGRO      = "1A1A1A";
const GRIS       = "6B7280";
const AZUL_CLARO = "DBEAFE";
const AMARILLO   = "FEF9C3";

// ── Helpers ──────────────────────────────────────────────────────────────

function run(text, { bold = false, color = NEGRO, size = 22, italic = false } = {}) {
  return new TextRun({ text, bold, color, size, italics: italic, font: "Calibri" });
}

function para(runs, { spaceBefore = 0, spaceAfter = 80, indent = 0 } = {}) {
  return new Paragraph({
    children: Array.isArray(runs) ? runs : [runs],
    spacing: { before: spaceBefore, after: spaceAfter },
    indent: indent ? { left: convertMillimetersToTwip(indent) } : undefined,
  });
}

function heading1(text) {
  return new Paragraph({
    children: [run(text, { bold: true, color: AZUL, size: 32 })],
    spacing: { before: 300, after: 80 },
  });
}

function tagLine(label, value) {
  return para([
    run(label + "  ", { bold: true, color: AZUL, size: 20 }),
    run(value, { color: NEGRO, size: 22 }),
  ], { spaceAfter: 60, indent: 6 });
}

function bodyText(text, indent = 0) {
  return para([run(text, { color: NEGRO, size: 22 })], { spaceAfter: 80, indent });
}

function sectionLabel(text) {
  return para([run(text, { bold: true, color: AZUL, size: 22 })], { spaceAfter: 60 });
}

function bulletItem(text) {
  return new Paragraph({
    children: [run(text, { color: NEGRO, size: 22 })],
    bullet: { level: 0 },
    spacing: { before: 0, after: 60 },
    indent: { left: convertMillimetersToTwip(6) },
  });
}

function separator() {
  return para([run("─".repeat(70), { color: GRIS, size: 16 })], { spaceBefore: 40, spaceAfter: 40 });
}

function nota(text) {
  return para([run(text, { color: GRIS, size: 18, italic: true })], { spaceBefore: 40, spaceAfter: 40, indent: 6 });
}

function spacer(pt = 80) {
  return para([run("")], { spaceAfter: pt });
}

// ── Tabla genérica ────────────────────────────────────────────────────────

function makeTable(headers, colWidths, rows) {
  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: AZUL_CLARO },
      children: [para([run(h, { bold: true, color: AZUL, size: 18 })], { spaceBefore: 40, spaceAfter: 40 })],
    })),
  });

  const dataRows = rows.map(cells => new TableRow({
    children: cells.map((val, i) => {
      let textColor = NEGRO;
      let fillColor = "FFFFFF";
      let bold = false;
      let textVal = val;
      if (typeof val === "object" && val !== null) {
        textColor = val.color || NEGRO;
        fillColor = val.fill  || "FFFFFF";
        bold      = val.bold  || false;
        textVal   = val.text  || "";
      }
      return new TableCell({
        width: { size: colWidths[i], type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: fillColor },
        children: [para([run(String(textVal), { color: textColor, size: 18, bold })], { spaceBefore: 40, spaceAfter: 40 })],
      });
    }),
  }));

  return new Table({ rows: [headerRow, ...dataRows], width: { size: 9000, type: WidthType.DXA } });
}

// ── Tabla de dependencias ─────────────────────────────────────────────────

function makeDepTable() {
  return makeTable(
    ["Tarea", "Meses", "Paralela con", "Depende de", "Objetivo clave"],
    [1700, 1100, 1600, 1500, 3100],
    [
      ["T1 · Extracción", "1–2",   "T2",       "—",       "Precisión geométrica sobre planos chilenos"],
      ["T2 · Validación", "1–3",   "T1, T4",   "—",       "5–8 arquitectos en piloto, feedback documentado"],
      ["T3 · Informe",    "2–3",   "—",        "T1 + T2", "Ciclo completo: plano → informe DOM"],
      ["T4 · Comercial",  "2–4",   "T1, T2",   "—",       "Plan de negocios + primeras ventas reales"],
      ["T5 · Cierre",     "4",     "—",        "T1–T4",   "Métricas consolidadas + pipeline inversión"],
    ]
  );
}

// ── Tabla de gastos ───────────────────────────────────────────────────────
//
// Presupuesto total: CLP $30.000.000 (cofinanciamiento Ignite, equity-free)
// Tipo de cambio referencial: CLP 920/USD → ~USD 32.600
//
// Criterio de asignación:
//   Desarrolladores: costo técnico principal. Contratista part-time para T1
//     (pipeline de extracción) y T3 (módulo de informe). 4 meses × $3.500.000.
//   Estudios de mercado: entrevistas T2, herramientas de transcripción/encuesta,
//     análisis competitivo.
//   Marketing y ventas: ads digitales (LinkedIn/Google, target estudios de
//     arquitectura), contenido (casos de uso, videos demo), eventos y visitas
//     a oficinas/DOMs.
//   Herramientas e infraestructura: cloud (Vercel, Cloudflare), llamadas a APIs
//     (Claude Vision, Floor Plan API), SaaS (CRM, diseño).
//   Operaciones y admin: legal (contratos, PI) + contabilidad.
//   Reserva 10%: imprevistos, cambios de alcance, testing adicional de APIs.

function makeBudgetTable() {
  const headers   = ["Categoría", "Detalle", "Meses", "Costo unitario", "Total (CLP)"];
  const colWidths = [1700, 3100, 800, 1500, 1900];

  const C = (text, fill = "FFFFFF", color = NEGRO) => ({ text, fill, color });

  // Presupuesto total: CLP $30.000.000
  //
  // Personal:
  //   Team leader              1 × $1.000.000 × 4 = $  4.000.000
  //   Cofundadores (x2)        2 × $  500.000 × 4 = $  4.000.000
  //   Desarrollador contratista 1 × $2.500.000 × 4 = $ 10.000.000
  //                                     Subtotal    = $ 18.000.000
  // Estudios de mercado                             = $  1.800.000
  // Marketing y ventas                              = $  3.400.000
  // Herramientas e infraestructura                  = $  3.200.000
  // Operaciones y admin                             = $  1.200.000
  // Reserva                                         = $  2.400.000
  //                                     TOTAL       = $ 30.000.000

  const rows = [
    // Personal
    ["Personal",
      "Team leader (dirección técnica y producto)",
      "4", "$ 1.000.000", C("$  4.000.000", "EFF6FF")],
    ["",
      "Cofundadores (×2, dedicación parcial al programa)",
      "4", "$    500.000 c/u", C("$  4.000.000", "EFF6FF")],
    ["",
      "Desarrollador contratista — pipeline extracción e informe (T1, T3)",
      "4", "$ 2.500.000", C("$ 10.000.000", "EFF6FF")],
    // Estudios de mercado
    ["Estudios de mercado",
      "Entrevistas con arquitectos — incentivos y herramientas de transcripción (T2)",
      "4", "$    300.000", C("$  1.200.000", "EFF6FF")],
    ["",
      "Herramientas de análisis competitivo y benchmark",
      "—", "$    600.000", C("$    600.000", "EFF6FF")],
    // Marketing y ventas
    ["Marketing y ventas",
      "Ads digitales — LinkedIn y Google (target estudios de arquitectura)",
      "3", "$    600.000", C("$  1.800.000", "EFF6FF")],
    ["",
      "Contenido (casos de uso, videos demo, materiales de venta)",
      "—", "$    800.000", C("$    800.000", "EFF6FF")],
    ["",
      "Eventos, networking y visitas a estudios y DOMs",
      "4", "$    200.000", C("$    800.000", "EFF6FF")],
    // Herramientas
    ["Herramientas e infraestructura",
      "Cloud (Vercel, Cloudflare) + APIs (Claude Vision, Floor Plan API)",
      "4", "$    600.000", C("$  2.400.000", "EFF6FF")],
    ["",
      "SaaS — CRM, diseño, documentación",
      "4", "$    200.000", C("$    800.000", "EFF6FF")],
    // Operaciones
    ["Operaciones y admin",
      "Legal (contratos, propiedad intelectual) + contabilidad",
      "4", "$    300.000", C("$  1.200.000", "EFF6FF")],
    // Reserva
    ["Reserva (8%)",
      "Imprevistos — cambios de alcance, testing adicional de APIs, viajes",
      "—", "—", C("$  2.400.000", AMARILLO)],
    // Total
    [C("TOTAL", AZUL_CLARO, AZUL),
      C("CLP $30.000.000 · Cofinanciamiento Startup Chile Ignite (equity-free)", AZUL_CLARO, AZUL),
      C("", AZUL_CLARO), C("", AZUL_CLARO),
      C("$ 30.000.000", AZUL_CLARO, AZUL)],
  ];

  return makeTable(headers, colWidths, rows);
}

// ── Datos de las tareas ───────────────────────────────────────────────────

const TAREAS = [
  {
    titulo: "T1 — Motor de extracción confiable",
    periodo: "Meses 1–2",
    desc: "Integrar y calibrar Floor Plan API (y/o alternativas identificadas en el benchmark) sobre 10+ planos reales chilenos de distintos tipos (oficinas, comercio, vivienda). Definir métricas internas de precisión: IoU de muros y F1 de vanos, medidas contra ground truth propio. Este es el cuello de botella tecnológico que habilita T3.",
    mentores: "Conectar con al menos 1 mentor técnico (IA / visión computacional) para auditar la arquitectura de extracción y la elección de herramientas. Priorizar mentores del ecosistema Startup Chile con experiencia en computer vision o construcción tech.",
    entregables: [
      "Dataset ground truth: 10+ planos anotados con geometría verificada.",
      "Informe de precisión técnica: IoU y F1 por tipo de plano y herramienta.",
      "Decisión documentada de stack (Floor Plan API / alternativa) con justificación.",
    ],
  },
  {
    titulo: "T2 — Validación con arquitectos",
    periodo: "Meses 1–3 (paralela a T1)",
    desc: "Onboardear 5–8 arquitectos en piloto (pagado o simbólico). El foco es capturar qué hallazgos validan como útiles, cuáles rechazan y por qué — insumo directo para calibrar T1 y definir el formato de T3.",
    mentores: "Usar la red de Startup Chile (founders, corporativos, actividades del programa) para acceso a estudios de arquitectura y contactos en DOMs. Al menos 1 mentor con experiencia en ventas B2B o en el sector construcción/inmobiliario.",
    entregables: [
      "8+ entrevistas documentadas (problema, flujo actual, disposición a pagar).",
      "Matriz de feedback por tipo de observación (acepta / rechaza / modifica).",
      "3+ pilotos activos con acuerdo firmado (aunque sea piloto gratuito).",
    ],
  },
  {
    titulo: "T3 — Informe de cumplimiento exportable",
    periodo: "Meses 2–3",
    desc: "Cerrar el ciclo completo del producto: plano → extracción geométrica → revisión OGUC/PRC → informe Word/PDF con citas normativas exactas por artículo, listo para adjuntar a un expediente DOM. Es la entrega de valor que convierte el prototipo en algo que el arquitecto puede cobrarle a su cliente.",
    mentores: "1 mentor de producto/UX para validar el formato del informe con el usuario real antes de construirlo. Si el programa conecta con corporativos del sector inmobiliario, usar esas reuniones para testear el informe como artefacto.",
    entregables: [
      "Template de informe validado por al menos 3 arquitectos.",
      "Documentación de las reglas normativas implementadas (artículos OGUC/PRC codificados).",
      "Integración del informe en el flujo del producto (generación automática desde la plataforma).",
    ],
  },
  {
    titulo: "T4 — Comercialización y plan de negocios",
    periodo: "Meses 2–4 (paralela)",
    desc: "Definir precio, canal y propuesta de valor concreta (qué le ahorra en tiempo y dinero al arquitecto, medido con datos reales de T2). Ejecutar primeras ventas. Desarrollar el modelo financiero del negocio usando los talleres y mentorías del programa.",
    mentores: "1 mentor de go-to-market o ventas SaaS B2B. Usar las actividades de aceleración de Startup Chile (talleres de pricing, pitch, modelo de negocio) como insumo directo para construir el plan. Networking con corporativos del ecosistema como potenciales clientes o aliados de distribución.",
    entregables: [
      "Plan de negocios: modelo de ingresos, proyección a 12 meses, CAC/LTV estimado.",
      "3–5 ventas documentadas (contrato o factura).",
      "MRR demostrable al cierre del programa.",
      "Benchmark competitivo actualizado (Revi, revisores manuales, herramientas internacionales).",
    ],
  },
  {
    titulo: "T5 — Cierre e inicio de levantamiento de capital",
    periodo: "Mes 4",
    desc: "Consolidar métricas del programa (precisión técnica, usuarios activos, MRR) y abrir conversaciones con inversionistas usando los datos reales como tracción. El objetivo es tener todo listo para levantar una ronda seed una vez cerrado el Ignite.",
    mentores: "Usar las conexiones de Startup Chile con ángeles e inversionistas early-stage para primeras reuniones formales. Al menos 1 mentor con experiencia en levantamiento de capital seed en LatAm. Objetivo: 2–3 reuniones con inversionistas antes del Demo Day del programa.",
    entregables: [
      "Pitch deck actualizado con datos reales del programa.",
      "Informe de cierre Ignite: métricas vs. metas definidas en T1–T4.",
      "Pipeline de inversión documentado: contactos, estado de conversación, próximos pasos.",
    ],
  },
];

// ── Construir documento ───────────────────────────────────────────────────

const children = [];

// Portada
children.push(
  para([run("ArchiCheck", { bold: true, color: AZUL, size: 52 })], { spaceAfter: 60 }),
  para([run("Plan de trabajo · Startup Chile Ignite", { color: GRIS, size: 28 })], { spaceAfter: 60 }),
  para([run("4 meses · CLP $30.000.000 · Agosto–Diciembre 2026", { color: GRIS, size: 22, italic: true })], { spaceAfter: 160 }),
  separator(),
  bodyText(
    "El programa Ignite entrega financiamiento equity-free, mentorías especializadas, " +
    "conexión con corporativos e inversionistas, y actividades de aceleración intensiva. " +
    "Este plan estructura el trabajo en 5 tareas principales que absorben esas actividades " +
    "del programa — mentores, redes y plan de negocios no son actividades aparte, sino " +
    "componentes explícitos dentro de cada tarea."
  ),
  spacer(160),
);

// Estructura y dependencias
children.push(
  heading1("Estructura y dependencias"),
  bodyText(
    "T1 y T2 arrancan el día 1 en paralelo. T3 depende de precisión suficiente en T1 + señales de T2. " +
    "T4 puede arrancar con el demo actual antes de que T1 esté completa. T5 consolida las cuatro anteriores. " +
    "Las actividades de mentores y redes corren transversal a todo el programa — no son eventos puntuales."
  ),
  spacer(80),
  makeDepTable(),
  spacer(200),
);

// Tareas
for (const t of TAREAS) {
  children.push(
    separator(),
    heading1(t.titulo),
    tagLine("Período:", t.periodo),
    spacer(40),
    bodyText(t.desc),
    spacer(60),
    sectionLabel("Mentores y redes (Startup Chile)"),
    bodyText(t.mentores, 6),
    spacer(60),
    sectionLabel("Entregables"),
    ...t.entregables.map(e => bulletItem(e)),
    spacer(80),
  );
}

// Gastos
children.push(
  separator(),
  heading1("Presupuesto de gastos"),
  bodyText(
    "Presupuesto total: CLP $30.000.000 (cofinanciamiento equity-free Startup Chile Ignite). " +
    "El mayor ítem es personal técnico (T1 y T3), que representa la inversión central del programa. " +
    "Estudios de mercado y marketing/ventas están dimensionados para generar tracción real, " +
    "no para construcción de marca en esta etapa. La reserva del 10% cubre sobrepasos en testing " +
    "de APIs y ajustes de alcance. Tipo de cambio referencial: CLP 920/USD → presupuesto ≈ USD 32.600."
  ),
  spacer(80),
  makeBudgetTable(),
  spacer(80),
  para([
    run("Nota: ", { bold: true, color: GRIS, size: 18 }),
    run(
      "El costo de desarrollador asume un contratista part-time (~20 hrs/semana). " +
      "Si se contrata un desarrollador junior full-time, el costo baja a ~$2.500.000/mes " +
      "y la reserva aumenta en la diferencia. Todos los valores son estimados; " +
      "los montos efectivos quedan sujetos al calendario de desembolso de Startup Chile.",
      { color: GRIS, size: 18, italic: true }
    ),
  ], { spaceAfter: 60, indent: 6 }),
  spacer(160),
);

// Pie
children.push(
  separator(),
  nota(`ArchiCheck · Plan Startup Chile Ignite · Generado ${new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}`),
);

// ── Empaquetar y guardar ──────────────────────────────────────────────────
const doc = new Document({
  sections: [{
    properties: {
      page: {
        margin: {
          top:    convertMillimetersToTwip(25),
          bottom: convertMillimetersToTwip(25),
          left:   convertMillimetersToTwip(30),
          right:  convertMillimetersToTwip(25),
        },
      },
    },
    children,
  }],
});

const outPath = path.join(__dirname, "Docs 17Ago", "ArchiCheck_Plan_Ignite.docx");
const buffer = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);
console.log(`Documento guardado: ${outPath}`);
