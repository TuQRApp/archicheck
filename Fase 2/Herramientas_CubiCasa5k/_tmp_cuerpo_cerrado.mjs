import { createCanvas } from "@napi-rs/canvas";

// ── Paso A: ancho por emparejamiento de lineas paralelas (misma logica ya
//    validada como "linea sola = ventana") ──────────────────────────────
// Para cada segmento de `grupo`, busca en `contexto` (pool completo de
// segmentos cercanos, incluye el propio grupo) un segmento aprox. paralelo
// a distancia perpendicular entre tolMinM y tolMaxM. Si lo encuentra, ese
// segmento tiene "ancho real" (viene de 2 caras). Si ninguno de los
// segmentos del grupo tiene par, el grupo entero es linea suelta.
function angulo(s) {
  return Math.atan2(s.p2[1] - s.p1[1], s.p2[0] - s.p1[0]);
}
function distPerpEntreParalelas(a, b) {
  // distancia perpendicular entre 2 lineas casi paralelas, usando el punto
  // medio de "a" proyectado sobre la recta de "b"
  const mx = (a.p1[0] + a.p2[0]) / 2, my = (a.p1[1] + a.p2[1]) / 2;
  const dx = b.p2[0] - b.p1[0], dy = b.p2[1] - b.p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // normal unitaria de b
  return Math.abs((mx - b.p1[0]) * nx + (my - b.p1[1]) * ny);
}
function distPerpConSigno(a, b) {
  // igual que distPerpEntreParalelas pero conserva el signo (de que lado de
  // b esta a) -- necesario para saber si 2 vecinos de una linea central
  // estan en lados OPUESTOS, no del mismo lado
  const mx = (a.p1[0] + a.p2[0]) / 2, my = (a.p1[1] + a.p2[1]) / 2;
  const dx = b.p2[0] - b.p1[0], dy = b.p2[1] - b.p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  return (mx - b.p1[0]) * nx + (my - b.p1[1]) * ny;
}
function solapanEnDireccion(a, b) {
  // exige solape real de proyeccion a lo largo del eje de b, no solo
  // paralelismo a distancia -- si no, dos lineas paralelas lejanas sin
  // relacion contarian como "par"
  const dx = b.p2[0] - b.p1[0], dy = b.p2[1] - b.p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const proy = (p) => (p[0] - b.p1[0]) * ux + (p[1] - b.p1[1]) * uy;
  const [a0, a1] = [proy(a.p1), proy(a.p2)].sort((x, y) => x - y);
  const [b0, b1] = [0, len].sort((x, y) => x - y);
  return Math.max(a0, b0) < Math.min(a1, b1);
}

// ── Deteccion de lineas centrales (ventana) -- categoria propia ──────────
// Definicion permanente confirmada: 2 lineas enfrentadas CON una linea
// central entre medio (recta o curva, da igual) es SIEMPRE ventana, nunca
// muro -- aunque geometricamente cumpla cuerpo cerrado. La linea central
// nunca representa el ancho real: la ventana en si es angosta (2-3cm), el
// simbolo de 2 lineas + centro es solo una convencion de dibujo.
//
// Enfoque correcto (a diferencia de un primer intento fallido): una linea
// central se identifica ANTES de emparejar, como su propia categoria --
// no se puede detectar "por par" porque la propia linea central suele
// estar mas cerca de una de las 2 caras que la cara opuesta, y terminaria
// aceptandose a si misma como "la cara real" (bug encontrado con un caso
// sintetico simple: sin este enfoque, ancho=25 en vez de null). Una linea
// central real tiene 2 vecinos paralelos, EN LADOS OPUESTOS (signo
// contrario de distancia con signo), aproximadamente simetricos, cuya
// separacion total cae en el rango de espesor de muro (tolMinM-tolMaxM).
export function identificarLineasCentrales(contexto, mpx, tolMinM = 0.08, tolMaxM = 0.9, tolSimetriaM = 0.05) {
  const tolMinPx = tolMinM / mpx, tolMaxPx = tolMaxM / mpx, tolSimPx = tolSimetriaM / mpx;
  const centrales = new Set();
  for (const l of contexto) {
    const angL = (angulo(l) * 180 / Math.PI) % 180;
    const vecinos = [];
    for (const o of contexto) {
      if (o === l) continue;
      const angO = (angulo(o) * 180 / Math.PI) % 180;
      let dAng = Math.abs(angL - angO);
      if (dAng > 90) dAng = 180 - dAng;
      if (dAng > 10) continue;
      if (!solapanEnDireccion(l, o) && !solapanEnDireccion(o, l)) continue;
      vecinos.push({ o, d: distPerpConSigno(o, l) });
    }
    outer: for (let i = 0; i < vecinos.length; i++) {
      for (let j = i + 1; j < vecinos.length; j++) {
        const dX = vecinos[i].d, dY = vecinos[j].d;
        if (Math.sign(dX) === Math.sign(dY)) continue; // deben quedar a lados opuestos de l
        const separacion = Math.abs(dX) + Math.abs(dY);
        if (separacion < tolMinPx || separacion > tolMaxPx) continue; // separacion total = espesor de muro plausible
        if (Math.abs(Math.abs(dX) - Math.abs(dY)) > tolSimPx) continue; // l debe quedar cerca de la mitad, no pegada a una cara
        centrales.add(l);
        break outer;
      }
    }
  }
  return centrales;
}

// Dado un par candidato (s,c) a distancia d, ¿alguna linea central real
// (ya identificada en `centrales`) cae aproximadamente a mitad de camino
// entre ambas, cubriendo la zona de contacto? Si es asi, (s,c) son las 2
// caras de una ventana, no de un muro.
function hayLineaCentralEntre(s, c, centrales, d, tolCentroPx = 8) {
  if (centrales.size === 0) return false;
  const dx = c.p2[0] - c.p1[0], dy = c.p2[1] - c.p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const t = (p) => (p[0] - c.p1[0]) * ux + (p[1] - c.p1[1]) * uy;
  const tA = t(s.p1), tB = t(s.p2);
  const [sMin, sMax] = [tA, tB].sort((a, b) => a - b);
  const loteMin = Math.max(sMin, 0), loteMax = Math.min(sMax, len);
  if (loteMax <= loteMin) return false;
  for (const l of centrales) {
    const angL = (angulo(l) * 180 / Math.PI) % 180;
    const angC = (angulo(c) * 180 / Math.PI) % 180;
    let dAng = Math.abs(angL - angC);
    if (dAng > 90) dAng = 180 - dAng;
    if (dAng > 10) continue;
    const dL = distPerpEntreParalelas(l, c);
    if (Math.abs(dL - d / 2) > tolCentroPx) continue;
    const tL1 = t(l.p1), tL2 = t(l.p2);
    const [lMin, lMax] = [tL1, tL2].sort((a, b) => a - b);
    const solapeReal = Math.min(loteMax, lMax) - Math.max(loteMin, lMin);
    if (solapeReal < 0.3 * (loteMax - loteMin)) continue;
    return true;
  }
  return false;
}

// Un segmento esta "bloqueado por ventana" si tuvo al menos un candidato de
// pareja geometricamente valido (angulo+distancia+solape) pero TODOS fueron
// rechazados por hayLineaCentralEntre -- distinto de "sin candidatos" (linea
// realmente aislada). Esto marca especificamente las 2 caras/tapas de una
// ventana (ej. las tapas de ancho de 2 tramos de muro separados por un vano),
// que es la evidencia que el remate de esquinas necesita para NO rellenar un
// cuadrado ahi -- sin este chequeo, el remate de esquinas (pensado para
// cerrar giros reales tipo L/T/+) usa el ancho propio de la pierna para
// pintar un cuadrado que, si el espesor del muro es comparable al ancho del
// vano, alcanza a tocar el cuadrado del otro lado y puentea la ventana igual,
// aunque el emparejamiento ya la haya bloqueado correctamente.
function segmentoBloqueadoPorVentana(s, contexto, mpx, tolMinM, tolMaxM, centrales) {
  if (centrales.has(s)) return true;
  const tolMinPx = tolMinM / mpx, tolMaxPx = tolMaxM / mpx;
  const angS = (angulo(s) * 180 / Math.PI) % 180;
  let huboCandidato = false;
  for (const c of contexto) {
    if (c === s || centrales.has(c)) continue;
    const angC = (angulo(c) * 180 / Math.PI) % 180;
    let dAng = Math.abs(angS - angC);
    if (dAng > 90) dAng = 180 - dAng;
    if (dAng > 10) continue;
    const d = distPerpEntreParalelas(s, c);
    if (d < tolMinPx || d > tolMaxPx) continue;
    if (!solapanEnDireccion(s, c)) continue;
    huboCandidato = true;
    if (!hayLineaCentralEntre(s, c, centrales, d)) return false; // par valido real -- no bloqueada
  }
  return huboCandidato; // hubo candidato(s) pero todos bloqueados por ventana
}

export function anchoPorEmparejamiento(grupo, contexto, mpx, tolMinM = 0.08, tolMaxM = 0.9) {
  const tolMinPx = tolMinM / mpx, tolMaxPx = tolMaxM / mpx;
  // lineas centrales de ventana: se excluyen por completo del pool de
  // posibles "caras de muro" -- ni pueden ser s, ni pueden ser aceptadas
  // como c de otra linea. Identificadas antes de emparejar (ver nota en
  // identificarLineasCentrales sobre por que no se puede detectar por par).
  const centrales = identificarLineasCentrales(contexto, mpx, tolMinM, tolMaxM);
  let mejorAncho = null;
  const detalle = [];
  for (const s of grupo) {
    if (centrales.has(s)) {
      detalle.push({ segmento: s, anchoPx: null, par: null });
      continue; // s mismo es una linea central de ventana, nunca es cara de muro
    }
    const angS = (angulo(s) * 180 / Math.PI) % 180;
    let parEncontrado = null;
    let parSeg = null;
    const candidatos = [];
    for (const c of contexto) {
      if (c === s || centrales.has(c)) continue; // una linea central nunca es la "cara" de otro muro
      const angC = (angulo(c) * 180 / Math.PI) % 180;
      let dAng = Math.abs(angS - angC);
      if (dAng > 90) dAng = 180 - dAng;
      if (dAng > 10) continue; // debe ser casi paralelo
      const d = distPerpEntreParalelas(s, c);
      if (d < tolMinPx || d > tolMaxPx) continue;
      if (!solapanEnDireccion(s, c)) continue;
      candidatos.push({ c, d });
    }
    candidatos.sort((a, b) => a.d - b.d);
    for (const { c, d } of candidatos) {
      // si una linea central real cae entre s y este candidato c, ese par
      // ES la ventana (s y c son sus 2 caras) -- no vale como ancho de muro
      if (hayLineaCentralEntre(s, c, centrales, d)) continue;
      parEncontrado = d; parSeg = c;
      break; // el candidato valido mas cercano
    }
    detalle.push({ segmento: s, anchoPx: parEncontrado, par: parSeg });
    if (parEncontrado !== null && (mejorAncho === null || parEncontrado < mejorAncho)) {
      mejorAncho = parEncontrado;
    }
  }
  return { anchoPx: mejorAncho, anchoM: mejorAncho !== null ? mejorAncho * mpx : null, detalle };
}

// ── Paso B: rasterizar contexto local + cerrar micro-gaps + conectividad ──
function bbox(segmentos, margenPx) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segmentos) {
    for (const p of [s.p1, s.p2]) {
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
  }
  return { x0: x0 - margenPx, y0: y0 - margenPx, x1: x1 + margenPx, y1: y1 + margenPx };
}

function rasterizar(contexto, box, grosorLineaPx = 2) {
  const w = Math.ceil(box.x1 - box.x0), h = Math.ceil(box.y1 - box.y0);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "black";
  ctx.lineWidth = grosorLineaPx;
  ctx.lineCap = "round";
  for (const s of contexto) {
    ctx.beginPath();
    ctx.moveTo(s.p1[0] - box.x0, s.p1[1] - box.y0);
    ctx.lineTo(s.p2[0] - box.x0, s.p2[1] - box.y0);
    ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, w, h);
  const bin = new Uint8Array(w * h); // 1 = trazo (negro)
  for (let i = 0; i < w * h; i++) bin[i] = img.data[i * 4] < 128 ? 1 : 0;
  return { bin, w, h };
}

// Rellena el AREA SOLIDA real de cada segmento con par -- el cuadrilatero
// entre el segmento y su cara enfrentada, no solo un trazo fino centrado en
// el. Esto es lo que corresponde a "verter agua entre las 2 caras": el
// resultado es el cuerpo cerrado real, no una aproximacion de linea gruesa.
function rellenoSolido(contextoConPares, box, todosLosSegmentos, objetivoSet, mpx, tolMinM = 0.08, tolMaxM = 0.9) {
  const w = Math.ceil(box.x1 - box.x0), h = Math.ceil(box.y1 - box.y0);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "black";
  ctx.strokeStyle = "black";
  for (const { segmento: s, par: c, anchoPx } of contextoConPares) {
    if (!c) continue;
    if (objetivoSet && !objetivoSet.has(s)) continue; // el contexto solo da ancho, no se pinta el mismo
    // mismo chequeo de plausibilidad que en el remate de esquinas: un
    // segmento corto (una tapa de ancho) que encuentra pareja mas lejos que
    // su propio largo es geometricamente inverosimil como cara real de este
    // muro -- sin este filtro se dibuja un cuadrilatero gigante hacia un
    // muro vecino no relacionado.
    const largoS = Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1]);
    if (anchoPx > largoS) continue;
    // eje = la recta de c. Proyecta AMBOS segmentos sobre ese eje y usa
    // solo el tramo donde los dos realmente se solapan -- si el par (c) es
    // mas corto que s, el relleno no debe extenderse mas alla de donde la
    // evidencia real (c) todavia existe.
    const dx = c.p2[0] - c.p1[0], dy = c.p2[1] - c.p1[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const t = (p) => (p[0] - c.p1[0]) * ux + (p[1] - c.p1[1]) * uy;
    const puntoEnEje = (tt) => [c.p1[0] + ux * tt, c.p1[1] + uy * tt];

    const tA = t(s.p1), tB = t(s.p2); // proyeccion de s.p1/s.p2 sobre el eje de c
    const [sMin, sMax] = [tA, tB].sort((a, b) => a - b);
    const [cMin, cMax] = [0, len].sort((a, b) => a - b);
    const loteMin = Math.max(sMin, cMin), loteMax = Math.min(sMax, cMax);
    if (loteMax <= loteMin) continue; // sin solape real, no rellenar nada

    // punto sobre la propia recta de s que corresponde a cada extremo del
    // tramo solapado, via interpolacion u en [s.p1..s.p2] (evita asumir
    // que s.p1 es el minimo -- s puede apuntar en cualquier sentido)
    const puntoEnS = (loteVal) => {
      const u = (loteVal - tA) / (tB - tA || 1);
      return [s.p1[0] + (s.p2[0] - s.p1[0]) * u, s.p1[1] + (s.p2[1] - s.p1[1]) * u];
    };
    const p1 = puntoEnS(loteMin), p2 = puntoEnS(loteMax);
    const c1 = puntoEnEje(loteMin), c2 = puntoEnEje(loteMax);

    ctx.beginPath();
    ctx.moveTo(p1[0] - box.x0, p1[1] - box.y0);
    ctx.lineTo(p2[0] - box.x0, p2[1] - box.y0);
    ctx.lineTo(c2[0] - box.x0, c2[1] - box.y0);
    ctx.lineTo(c1[0] - box.x0, c1[1] - box.y0);
    ctx.closePath();
    ctx.fill();
  }
  // ── Remate de esquinas (exteriores E interiores) ──────────────────────
  // El relleno de arriba solo cubre, para cada pierna, el tramo donde
  // encuentra su propia pareja paralela -- eso dibuja bien el cuerpo de
  // cada tramo recto, pero dos piernas perpendiculares que se juntan en
  // un vertice real (una L, una T, una cruz "+") dejan sin pintar el
  // cuadrado de la esquina (tanto el exterior de una L como cualquier
  // esquina interior de una T o una cruz), aunque el punto de contacto
  // ya alcance para que cuerpo cerrado los de por conectados. Para que
  // el dibujo no se vea "cortado" donde en realidad hay muro solido,
  // se rellena un cuadrado centrado en cada vertice real (donde 2+
  // segmentos del contexto se tocan), del tamano del espesor real mas
  // ancho que llega a ese vertice -- funciona igual para L, T o cruz,
  // sin importar cuantas piernas se junten ahi.
  // Cuenta TODOS los segmentos del contexto (tengan par propio o no --
  // un conector corto de esquina, como el remate entre 2 piernas, casi
  // nunca encuentra su propia pareja paralela porque es demasiado corto,
  // pero sigue siendo el segmento real que marca que ahi hay un vertice
  // de union). El ANCHO para pintar la esquina, en cambio, sale solo de
  // los segmentos que SI tienen ancho real emparejado (las piernas).
  const SNAP_PX = 3;
  const vKey = (p) => `${Math.round(p[0] / SNAP_PX)},${Math.round(p[1] / SNAP_PX)}`;
  const poolCompleto = todosLosSegmentos || contextoConPares.map((x) => x.segmento);
  const centralesCtx = mpx ? identificarLineasCentrales(poolCompleto, mpx, tolMinM, tolMaxM) : new Set();
  const vertices = new Map(); // key -> {pt, segCount, tocaObjetivo, tocaVentana, piernas}
  for (const s of poolCompleto) {
    const esObjetivo = !objetivoSet || objetivoSet.has(s);
    const esVentana = mpx ? segmentoBloqueadoPorVentana(s, poolCompleto, mpx, tolMinM, tolMaxM, centralesCtx) : false;
    for (const p of [s.p1, s.p2]) {
      const k = vKey(p);
      const v = vertices.get(k) || { pt: p, segCount: 0, tocaObjetivo: false, tocaVentana: false, piernas: [] };
      v.segCount++;
      if (esObjetivo) v.tocaObjetivo = true;
      if (esVentana) v.tocaVentana = true;
      vertices.set(k, v);
    }
  }
  // registra, por vertice, las piernas con ancho real emparejado -- solo
  // piernas objetivo (mismo criterio que antes: el remate de esquina nunca
  // sale de un vecino de contexto con espesor distinto, ej. un muro grande
  // usado solo como referencia de ancho)
  for (const { segmento: s, par: c, anchoPx } of contextoConPares) {
    if (anchoPx == null || !c) continue;
    if (objetivoSet && !objetivoSet.has(s)) continue;
    // un remate corto (la tapa de ancho en el extremo de un muro) a veces
    // encuentra por casualidad una "pareja" paralela lejana y ajena (ej. un
    // muro distinto que pasa cerca) -- si la pareja esta mas lejos que el
    // propio largo del segmento, es geometricamente inverosimil que sea el
    // ancho real de este muro, se descarta como fuente de ancho de esquina
    const largoSeg = Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1]);
    if (anchoPx > largoSeg) continue;
    for (const p of [s.p1, s.p2]) {
      const k = vKey(p);
      const v = vertices.get(k);
      if (v) v.piernas.push({ segmento: s, par: c, anchoPx, punta: p });
    }
  }
  // Remate de esquinas: para cada vertice real con 2+ piernas de ancho
  // propio, y cada PAR de piernas de direccion suficientemente distinta (no
  // una continuacion recta del mismo muro), extiende el relleno de CADA
  // pierna mas alla del vertice usando el semi-ancho REAL de la OTRA pierna
  // -- no un cuadrado generico con el mayor ancho de todas. Piernas de
  // distinto espesor (ej. una L con un tramo de 15cm y otro de 20cm) asi
  // generan un remate rectangular del tamano exacto que corresponde, nunca
  // una aproximacion cuadrada.
  for (const v of vertices.values()) {
    if (!v.tocaObjetivo) continue; // no rellenar esquinas que son puramente del contexto (ej. la propia MU13)
    if (v.tocaVentana) continue; // vertice = tapa/cara de una ventana ya detectada -- nunca rellenar aqui, aunque parezca un giro en L (bloquearia el vano)
    const piernas = v.piernas;
    for (let i = 0; i < piernas.length; i++) {
      for (let j = 0; j < piernas.length; j++) {
        if (i === j) continue;
        const pi = piernas[i], pj = piernas[j];
        let dAng = Math.abs(((angulo(pi.segmento) - angulo(pj.segmento)) * 180 / Math.PI) % 180);
        if (dAng > 90) dAng = 180 - dAng;
        if (dAng < 20) continue; // casi colineales -- continuacion recta del mismo muro, no una esquina
        extenderYRellenarEsquina(ctx, box, pi.segmento, pi.par, pi.punta, pj.anchoPx / 2);
      }
    }
  }

  const img = ctx.getImageData(0, 0, w, h);
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = img.data[i * 4] < 128 ? 1 : 0;
  return { bin, w, h };
}

// Extiende el relleno de la pierna `s` (con su cara par `c`) mas alla de su
// propio extremo `v` -- por `extPx`, en direccion opuesta a su propio cuerpo
// (hacia la esquina) -- preservando el espesor REAL de s (via su propia
// pareja c), nunca un valor generico. Se usa para cerrar el remate de una
// esquina real (L/T/+) cuando la OTRA pierna que se junta ahi tiene un
// espesor distinto: cada pierna se extiende solo por el semi-ancho real de
// la otra, asi el remate resultante es un rectangulo (no un cuadrado) del
// tamano exacto que corresponde a esos 2 espesores, nunca mas alla de lo
// que la evidencia (c) realmente alcanza.
function extenderYRellenarEsquina(ctx, box, s, c, v, extPx) {
  if (!c || extPx <= 0) return;
  const otroExtremo = (s.p1[0] === v[0] && s.p1[1] === v[1]) ? s.p2 : s.p1;
  const dx = v[0] - otroExtremo[0], dy = v[1] - otroExtremo[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len; // direccion desde el cuerpo de s, hacia v y mas alla
  const vExt = [v[0] + ux * extPx, v[1] + uy * extPx];
  const cdx = c.p2[0] - c.p1[0], cdy = c.p2[1] - c.p1[1];
  const clen = Math.hypot(cdx, cdy) || 1;
  const cux = cdx / clen, cuy = cdy / clen;
  const tC = (p) => (p[0] - c.p1[0]) * cux + (p[1] - c.p1[1]) * cuy;
  const puntoEnEje = (tt) => [c.p1[0] + cux * tt, c.p1[1] + cuy * tt];
  // recorta al tramo real de c -- si c no llega tan lejos como v/vExt, no se
  // inventa ancho ahi (degenera a area cero, conservador)
  const tV = Math.max(0, Math.min(clen, tC(v)));
  const tVExt = Math.max(0, Math.min(clen, tC(vExt)));
  const cV = puntoEnEje(tV), cVExt = puntoEnEje(tVExt);
  ctx.beginPath();
  ctx.moveTo(v[0] - box.x0, v[1] - box.y0);
  ctx.lineTo(vExt[0] - box.x0, vExt[1] - box.y0);
  ctx.lineTo(cVExt[0] - box.x0, cVExt[1] - box.y0);
  ctx.lineTo(cV[0] - box.x0, cV[1] - box.y0);
  ctx.closePath();
  ctx.fill();
}

function dilatar(bin, w, h, radioPx) {
  const r = Math.max(1, Math.round(radioPx));
  let cur = bin;
  for (let it = 0; it < r; it++) {
    const next = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (cur[i]) { next[i] = 1; continue; }
        if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) ||
            (y > 0 && cur[i - w]) || (y < h - 1 && cur[i + w])) {
          next[i] = 1;
        }
      }
    }
    cur = next;
  }
  return cur;
}

function floodFillDesde(bin, w, h, px, py) {
  const visitado = new Uint8Array(w * h);
  const stack = [[Math.round(px), Math.round(py)]];
  // si el punto exacto no cae sobre un pixel "1" (trazo), busca el mas cercano
  if (px < 0 || py < 0 || px >= w || py >= h || !bin[Math.round(py) * w + Math.round(px)]) {
    let mejor = null, mejorD = Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (bin[y * w + x]) {
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < mejorD) { mejorD = d; mejor = [x, y]; }
      }
    }
    if (!mejor) return visitado;
    stack.length = 0; stack.push(mejor);
  }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (visitado[i] || !bin[i]) continue;
    visitado[i] = 1;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return visitado;
}

function puntoMedio(segmentos) {
  let sx = 0, sy = 0, n = 0;
  for (const s of segmentos) {
    sx += (s.p1[0] + s.p2[0]) / 2; sy += (s.p1[1] + s.p2[1]) / 2; n++;
  }
  return [sx / n, sy / n];
}

// true si ALGUN punto muestreado sobre `segmentos` (no el centroide del
// grupo, que puede caer en el hueco entre 2 caras) pertenece a `componente`
function grupoTocaComponente(segmentos, componente, w, h, box, pasoPx = 2) {
  for (const s of segmentos) {
    const largo = Math.hypot(s.p2[0] - s.p1[0], s.p2[1] - s.p1[1]);
    const n = Math.max(1, Math.round(largo / pasoPx));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(s.p1[0] + (s.p2[0] - s.p1[0]) * t - box.x0);
      const y = Math.round(s.p1[1] + (s.p2[1] - s.p1[1]) * t - box.y0);
      if (x >= 0 && y >= 0 && x < w && y < h && componente[y * w + x] === 1) return true;
    }
  }
  return false;
}

// ── Funcion principal ──────────────────────────────────────────────────
export function cuerpoCerradoFusiona(grupoA, grupoB, contextoLocal, mpx, opts = {}) {
  const { margenM = 0.6, grosorLineaPx = 2, pisoMinPx = 2 } = opts;
  const anchoA = anchoPorEmparejamiento(grupoA, contextoLocal, mpx);
  const anchoB = anchoPorEmparejamiento(grupoB, contextoLocal, mpx);

  if (anchoA.anchoPx === null) {
    return { fusiona: false, motivo: "grupo A sin par paralelo -- linea suelta (ventana/ref), no muro", anchoA, anchoB };
  }
  if (anchoB.anchoPx === null) {
    return { fusiona: false, motivo: "grupo B sin par paralelo -- linea suelta (ventana/ref), no muro", anchoA, anchoB };
  }

  const anchoMinPx = Math.min(anchoA.anchoPx, anchoB.anchoPx);
  const tolPx = Math.max(0.10 * anchoMinPx, pisoMinPx);

  // El relleno solido solo debe construirse con material "real" (con par
  // paralelo propio) -- una linea suelta (ventana/cota) nunca debe poder
  // actuar de puente entre A y B, aunque toque a ambos por coincidencia de
  // punto. Sin este filtro, cualquier centro de ventana que roce las 2
  // caras conectaria 2 muros reales separados por una abertura real.
  const margenPx = margenM / mpx;
  const box = bbox([...grupoA, ...grupoB], margenPx);

  const conPares = contextoLocal
    .map((s) => ({ segmento: s, ...anchoPorEmparejamiento([s], contextoLocal, mpx) }))
    .filter((x) => x.anchoPx !== null)
    .map((x) => ({ segmento: x.segmento, par: x.detalle[0].par, anchoPx: x.anchoPx }));

  const { bin, w, h } = rellenoSolido(conPares, box, contextoLocal, null, mpx);
  const dilBin = dilatar(bin, w, h, tolPx);

  const [pax, pay] = puntoMedio(grupoA);
  const componente = floodFillDesde(dilBin, w, h, pax - box.x0, pay - box.y0);

  const conectado = grupoTocaComponente(grupoB, componente, w, h, box);

  if (!conectado) {
    return { fusiona: false, motivo: "no conectados incluso tras cerrar micro-gaps (hueco real, ej. puerta/ventana)", anchoA, anchoB, tolPx, raster: { box, w, h, componente, bin: dilBin } };
  }

  return { fusiona: true, motivo: "cuerpo cerrado: conectados + ambos con ancho real emparejado", anchoA, anchoB, tolPx, raster: { box, w, h, componente, bin: dilBin } };
}

// Exporta el relleno solido real (sin dilatar) de un pool de segmentos, para
// dibujarlo directamente como prueba visual -- esto es lo que se debe
// mostrar como "cuerpo cerrado", no lineas de color sobre el trazo original.
// `objetivo`: subconjunto de contextoLocal que se PINTA de verdad -- el
// resto de contextoLocal solo aporta ancho real (pareja paralela) y
// evidencia de vertices de union, pero nunca se pinta a si mismo. Sin
// esto, pasar un muro grande ya existente (ej. MU13) como referencia de
// ancho terminaba pintando tambien el cuerpo entero de ese muro.
export function rellenoSolidoDeContexto(contextoLocal, mpx, margenM = 0.6, objetivo = null) {
  const box = bbox(objetivo || contextoLocal, margenM / mpx);
  const objetivoSet = objetivo ? new Set(objetivo) : null;
  const conPares = contextoLocal
    .map((s) => ({ segmento: s, ...anchoPorEmparejamiento([s], contextoLocal, mpx) }))
    .filter((x) => x.anchoPx !== null)
    .map((x) => ({ segmento: x.segmento, par: x.detalle[0].par, anchoPx: x.anchoPx }));
  const { bin, w, h } = rellenoSolido(conPares, box, contextoLocal, objetivoSet, mpx);
  return { box, w, h, bin };
}
