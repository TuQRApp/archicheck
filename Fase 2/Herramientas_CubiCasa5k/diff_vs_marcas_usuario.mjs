import fs from "fs";

function parseCsvSimple(path) {
  const lines = fs.readFileSync(path, "utf8").trim().split("\n");
  const rows = lines.slice(1).map(l => {
    const campos = [...l.matchAll(/"((?:[^"]|"")*)"/g)].map(m => m[1].replace(/""/g, '"'));
    return campos;
  });
  return rows;
}

function diffNivel(nombre, etiquetasPath, clasifPath, marcasUsuarioPath) {
  const clusters = JSON.parse(fs.readFileSync(etiquetasPath, "utf8"));
  const clasif = JSON.parse(fs.readFileSync(clasifPath, "utf8"));
  const mios = clusters
    .map((c, i) => ({ ...c, tipo: clasif[String(i + 1)], idx: i + 1 }))
    .filter(c => c.tipo);

  const filasUsuario = parseCsvSimple(marcasUsuarioPath);
  const TIPO_MAP = { PU: "puerta", VE: "ventana", ES: "escalera", RA: "rampa" };
  const usuario = filasUsuario.map(r => ({
    num: r[0], tipo: TIPO_MAP[r[1]], cx_rel: +r[2], cy_rel: +r[3], notas: r[4],
  }));

  const usados = new Set();
  const sinMatchUsuario = [];
  for (const u of usuario) {
    let mejor = null, mejorD = Infinity, mejorI = -1;
    mios.forEach((m, i) => {
      if (usados.has(i)) return;
      const d = Math.hypot(u.cx_rel - m.cx_rel, u.cy_rel - m.cy_rel);
      if (d < mejorD) { mejorD = d; mejor = m; mejorI = i; }
    });
    if (mejor && mejorD < 0.03) {
      usados.add(mejorI);
      if (mejor.tipo !== u.tipo) {
        console.log(`[${nombre}] TIPO DISTINTO: usuario#${u.num} (${u.tipo}) vs mio-cluster#${mejor.idx} (${mejor.tipo}) dist=${mejorD.toFixed(4)}`);
      }
    } else {
      sinMatchUsuario.push(u);
    }
  }

  const sinMatchMio = mios.filter((_, i) => !usados.has(i));

  console.log(`\n=== ${nombre} ===`);
  console.log(`Usuario: ${usuario.length} marcas | Mio: ${mios.length} clusters`);
  console.log(`Marcas del usuario SIN match en mi deteccion (${sinMatchUsuario.length}):`);
  sinMatchUsuario.forEach(u => console.log(`  #${u.num} ${u.tipo} (${u.cx_rel},${u.cy_rel}) - ${u.notas}`));
  console.log(`Clusters mios SIN match en la tabla del usuario (${sinMatchMio.length}):`);
  sinMatchMio.forEach(m => console.log(`  cluster#${m.idx} ${m.tipo} (${m.cx_rel},${m.cy_rel})`));
}

diffNivel(
  "N1",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/etiquetas_n1.json",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/clasificacion_n1.json",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/marcas_v3_nivel1_raw.csv"
);

diffNivel(
  "N2",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/etiquetas_n2.json",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/clasificacion_n2.json",
  "archicheck/Fase 2/Herramientas_CubiCasa5k/marcas_v3_nivel2_raw.csv"
);
