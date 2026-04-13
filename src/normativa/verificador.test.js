import { describe, it, expect } from "vitest";
import { verificarProyecto } from "./verificador.js";
import { calcularEstacionamientos } from "./estacionamientos.js";

// ── Helpers ─────────────────────────────────────────────────────────────────
function cumple(resultados, parametroSubstr) {
  const r = resultados.find(r => r.parametro.includes(parametroSubstr));
  if (!r) throw new Error(`Parámetro no encontrado: "${parametroSubstr}"`);
  return r.cumple;
}

// ── verificarProyecto ────────────────────────────────────────────────────────
describe("verificarProyecto — COS", () => {
  it("Z-3 COS 0.55 → NO CUMPLE (excede 0.50)", () => {
    const res = verificarProyecto({ cosProyectado: 0.55 }, "Z-3");
    expect(cumple(res, "COS")).toBe(false);
  });

  it("Z-3 COS 0.45 → CUMPLE", () => {
    const res = verificarProyecto({ cosProyectado: 0.45 }, "Z-3");
    expect(cumple(res, "COS")).toBe(true);
  });

  it("Z-3 COS 0.50 (límite exacto) → CUMPLE", () => {
    const res = verificarProyecto({ cosProyectado: 0.50 }, "Z-3");
    expect(cumple(res, "COS")).toBe(true);
  });
});

describe("verificarProyecto — Altura en pisos", () => {
  it("Z-1 16 pisos → NO CUMPLE (excede 15)", () => {
    const res = verificarProyecto({ pisosProyectados: 16 }, "Z-1");
    expect(cumple(res, "pisos")).toBe(false);
  });

  it("Z-1 15 pisos (límite exacto) → CUMPLE", () => {
    const res = verificarProyecto({ pisosProyectados: 15 }, "Z-1");
    expect(cumple(res, "pisos")).toBe(true);
  });

  it("Z-1 10 pisos → CUMPLE", () => {
    const res = verificarProyecto({ pisosProyectados: 10 }, "Z-1");
    expect(cumple(res, "pisos")).toBe(true);
  });
});

describe("verificarProyecto — Antejardín", () => {
  it("Z-4 antejardín 3m → NO CUMPLE (mínimo 5m)", () => {
    const res = verificarProyecto({ antejardínProyectado: 3 }, "Z-4");
    expect(cumple(res, "Antejardín")).toBe(false);
  });

  it("Z-4 antejardín 5m (límite exacto) → CUMPLE", () => {
    const res = verificarProyecto({ antejardínProyectado: 5 }, "Z-4");
    expect(cumple(res, "Antejardín")).toBe(true);
  });

  it("Z-1 antejardín 6m → NO CUMPLE (mínimo 7m)", () => {
    const res = verificarProyecto({ antejardínProyectado: 6 }, "Z-1");
    expect(cumple(res, "Antejardín")).toBe(false);
  });
});

describe("verificarProyecto — CC", () => {
  it("Z-3 CC 1.9 → NO CUMPLE (excede 1.8)", () => {
    const res = verificarProyecto({ ccProyectado: 1.9 }, "Z-3");
    expect(cumple(res, "CC")).toBe(false);
  });

  it("Z-3 CC 1.8 (límite exacto) → CUMPLE", () => {
    const res = verificarProyecto({ ccProyectado: 1.8 }, "Z-3");
    expect(cumple(res, "CC")).toBe(true);
  });
});

describe("verificarProyecto — Subdivisión predial", () => {
  it("Z-2 terreno 400m² → NO CUMPLE (mínimo 500m²)", () => {
    const res = verificarProyecto({ superficieTerreno: 400 }, "Z-2");
    expect(cumple(res, "Subdivisión")).toBe(false);
  });

  it("Z-3 terreno 300m² (límite exacto) → CUMPLE", () => {
    const res = verificarProyecto({ superficieTerreno: 300 }, "Z-3");
    expect(cumple(res, "Subdivisión")).toBe(true);
  });
});

describe("verificarProyecto — Art. 18 (calle ≤ 12m)", () => {
  it("calle 10m + 5 pisos → NO CUMPLE Art. 18", () => {
    const res = verificarProyecto({ pisosProyectados: 5, anchoCalleFrentera: 10 }, "Z-3");
    const art18 = res.filter(r => r.referencia.includes("Art. 18"));
    expect(art18.some(r => !r.cumple)).toBe(true);
  });

  it("calle 10m + 3 pisos → CUMPLE Art. 18 pisos", () => {
    const res = verificarProyecto({ pisosProyectados: 3, anchoCalleFrentera: 10 }, "Z-3");
    const art18pisos = res.find(r => r.parametro.includes("Pisos") && r.referencia.includes("Art. 18"));
    expect(art18pisos?.cumple).toBe(true);
  });

  it("calle 15m → no se aplica Art. 18", () => {
    const res = verificarProyecto({ pisosProyectados: 5, anchoCalleFrentera: 15 }, "Z-3");
    const art18 = res.filter(r => r.referencia.includes("Art. 18"));
    expect(art18).toHaveLength(0);
  });
});

describe("verificarProyecto — Zona no existente", () => {
  it("zona inexistente → resultado con cumple=false", () => {
    const res = verificarProyecto({ cosProyectado: 0.5 }, "Z-INEXISTENTE");
    expect(res[0].cumple).toBe(false);
  });
});

// ── calcularEstacionamientos ─────────────────────────────────────────────────
describe("calcularEstacionamientos — Residencial", () => {
  it("viv_condominio_bajo100 con 20 unidades → 24 vehículos, 5 bicicletas", () => {
    // vehiculos = 20 + max(4, ceil(20*0.20)) = 20 + max(4, 4) = 24
    // bicicletas = ceil(24/5) = 5
    const { vehiculos, bicicletas } = calcularEstacionamientos("viv_condominio_bajo100", { unidades: 20 });
    expect(vehiculos).toBe(24);
    expect(bicicletas).toBe(5);
  });

  it("viv_unifamiliar_bajo100 → 1 vehículo, 0 bicicletas", () => {
    const { vehiculos, bicicletas } = calcularEstacionamientos("viv_unifamiliar_bajo100", {});
    expect(vehiculos).toBe(1);
    expect(bicicletas).toBe(0);
  });

  it("viv_condominio_sobre100 con 10 unidades → 24 vehículos, 0 bicicletas", () => {
    // vehiculos = 10*2 + max(4, ceil(20*0.20)) = 20 + 4 = 24
    const { vehiculos, bicicletas } = calcularEstacionamientos("viv_condominio_sobre100", { unidades: 10 });
    expect(vehiculos).toBe(24);
    expect(bicicletas).toBe(0);
  });
});

describe("calcularEstacionamientos — Comercial", () => {
  it("restaurante 320m² → 4 vehículos, 1 bicicleta", () => {
    // vehiculos = ceil(320/80) = ceil(4) = 4
    // bicicletas = ceil(4/5) = ceil(0.8) = 1
    const { vehiculos, bicicletas } = calcularEstacionamientos("restaurante", { sup: 320 });
    expect(vehiculos).toBe(4);
    expect(bicicletas).toBe(1);
  });

  it("oficinas 200m² → 4 vehículos, 1 bicicleta", () => {
    const { vehiculos, bicicletas } = calcularEstacionamientos("oficinas", { sup: 200 });
    expect(vehiculos).toBe(4);
    expect(bicicletas).toBe(1);
  });
});

describe("calcularEstacionamientos — Deportivo", () => {
  it("multicanchas 3 unidades → 6 vehículos, 1 bicicleta", () => {
    const { vehiculos, bicicletas } = calcularEstacionamientos("multicanchas", { unidades: 3 });
    expect(vehiculos).toBe(6);
    expect(bicicletas).toBe(1);
  });
});

describe("calcularEstacionamientos — ID inválido", () => {
  it("id desconocido → vehiculos 0, bicicletas 0, regla null", () => {
    const r = calcularEstacionamientos("destino_inexistente", {});
    expect(r.vehiculos).toBe(0);
    expect(r.bicicletas).toBe(0);
    expect(r.regla).toBeNull();
  });
});
