import { cuerpoCerradoFusiona } from "./_tmp_cuerpo_cerrado.mjs";

const mpx = 0.00588; // metros/px, misma corrida real (log Celda 4 pdv.txt)
const seg = (p1, p2) => ({ p1, p2 });

console.log("=== CASO 1 (debe RECHAZAR) — pilar MU18 vs centro de ventana idx484 ===");
{
  const contextoCap1 = [
    seg([2047, 803], [1940, 803]),   // idx396
    seg([2004, 752], [1940, 752]),   // idx401
    seg([2004, 930], [2004, 939]),   // idx402 (pilar)
    seg([2004, 1066], [2004, 1075]), // idx403
    seg([2004, 1211], [2004, 1219]), // idx404
    seg([2004, 1347], [2004, 1355]), // idx405
    seg([2004, 1483], [2004, 1560]), // idx406
    seg([2047, 930], [2047, 939]),   // idx407 (pilar)
    seg([2047, 1066], [2047, 1075]), // idx408
    seg([2047, 1211], [2047, 1219]), // idx409
    seg([2047, 1347], [2047, 1355]), // idx410
    seg([2047, 1483], [2047, 1560]), // idx411
    seg([2047, 1483], [2004, 1483]), // idx472
    seg([2047, 1355], [2004, 1355]), // idx473
    seg([2047, 1219], [2004, 1219]), // idx474
    seg([2047, 1211], [2004, 1211]), // idx475
    seg([2047, 1347], [2004, 1347]), // idx476
    seg([2047, 1066], [2004, 1066]), // idx477
    seg([2047, 1075], [2004, 1075]), // idx478
    seg([2047, 939], [2004, 939]),   // idx479 (pilar)
    seg([2047, 930], [2004, 930]),   // idx480 (pilar)
    seg([2026, 1355], [2026, 1483]), // idx481 (ventana)
    seg([2026, 1347], [2026, 1219]), // idx482 (ventana)
    seg([2026, 1066], [2026, 939]),  // idx483 (ventana)
    seg([2026, 803], [2026, 930]),   // idx484 (ventana) <- grupo B
  ];
  const grupoA_pilar = [
    seg([2004, 930], [2004, 939]),
    seg([2047, 930], [2047, 939]),
    seg([2047, 939], [2004, 939]),
    seg([2047, 930], [2004, 930]),
  ];
  const grupoB_ventana = [seg([2026, 803], [2026, 930])];

  const r = cuerpoCerradoFusiona(grupoA_pilar, grupoB_ventana, contextoCap1, mpx);
  console.log(JSON.stringify({ fusiona: r.fusiona, motivo: r.motivo, anchoA_m: r.anchoA.anchoM, anchoB_m: r.anchoB.anchoM }, null, 2));
}

console.log("\n=== CASO 2 (debe ACEPTAR) — muro MU13 (capa Muros) + fragmento recuperado (capa Proyecciones) ===");
{
  const grupoA_mu13 = [
    seg([2263, 2036], [2263, 2129]), // idx95
    seg([2297, 2002], [2297, 2129]), // idx97
    seg([2203, 2036], [2263, 2036]), // idx94
    seg([2203, 2002], [2297, 2002]), // idx96
    seg([2297, 2129], [2263, 2129]), // idx1324
  ];
  const grupoB_proyecciones = [
    seg([2263, 2129], [2263, 2155]), // idx1344
    seg([2263, 2176], [2263, 2219]), // idx1345
    seg([2297, 2129], [2297, 2155]), // idx1349
    seg([2297, 2176], [2297, 2219]), // idx1350
  ];
  const contexto = [...grupoA_mu13, ...grupoB_proyecciones];

  const r = cuerpoCerradoFusiona(grupoA_mu13, grupoB_proyecciones, contexto, mpx);
  console.log(JSON.stringify({ fusiona: r.fusiona, motivo: r.motivo, anchoA_m: r.anchoA.anchoM, anchoB_m: r.anchoB.anchoM, tolPx: r.tolPx }, null, 2));
}

console.log("\n=== CASO 3 (control -- debe RECHAZAR) — MU13 vs ventana lejana idx484 (sin relacion real) ===");
{
  const grupoA_mu13 = [
    seg([2263, 2036], [2263, 2129]),
    seg([2297, 2002], [2297, 2129]),
  ];
  const grupoB_ventana = [seg([2026, 803], [2026, 930])];
  const contexto = [...grupoA_mu13, ...grupoB_ventana];
  const r = cuerpoCerradoFusiona(grupoA_mu13, grupoB_ventana, contexto, mpx);
  console.log(JSON.stringify({ fusiona: r.fusiona, motivo: r.motivo, anchoA_m: r.anchoA.anchoM, anchoB_m: r.anchoB.anchoM }, null, 2));
}

console.log("\n=== CASO 4 (debe RECHAZAR) — MU06 vs MU07 (Cocina): ambos con ancho real, pero separados por una ventana real de 2.3m ===");
{
  const grupoA_mu06 = [
    seg([664, 2240], [664, 2461]),  // idx1
    seg([715, 2274], [715, 2461]),  // idx11
    seg([715, 2461], [664, 2461]),  // idx891 (cap)
  ];
  const grupoB_mu07 = [
    seg([664, 2852], [664, 3103]),  // idx2
    seg([715, 2852], [715, 3103]),  // idx12
    seg([715, 2852], [664, 2852]),  // idx890 (cap)
    seg([715, 3103], [664, 3103]),  // idx866 (cap)
  ];
  const ventana_idx892 = seg([690, 2461], [690, 2852]);
  const contexto = [...grupoA_mu06, ...grupoB_mu07, ventana_idx892];
  const r = cuerpoCerradoFusiona(grupoA_mu06, grupoB_mu07, contexto, mpx);
  console.log(JSON.stringify({ fusiona: r.fusiona, motivo: r.motivo, anchoA_m: r.anchoA.anchoM, anchoB_m: r.anchoB.anchoM }, null, 2));

  console.log("  -- control: MU06 vs la propia ventana idx892 (debe rechazar por falta de par) --");
  const r2 = cuerpoCerradoFusiona(grupoA_mu06, [ventana_idx892], contexto, mpx);
  console.log(JSON.stringify({ fusiona: r2.fusiona, motivo: r2.motivo, anchoB_m: r2.anchoB.anchoM }, null, 2));
}
