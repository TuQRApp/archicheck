import { createCanvas, loadImage } from "@napi-rs/canvas";
import fs from "fs";

// Ilustra el concepto "entrada A / entrada B / punto de contacto p / ventana
// local" sobre un caso real: MU-A48 (vertical, Bodega) y MU-A49 (horizontal,
// arranca justo donde A48 termina arriba) -- union confirmada valida por el
// arquitecto (grupo 48+49+50+51).

const basePng = "../Desarrollos/Test/pdv/Dataset muros 8ago/ArchiCheck_dataset_muros_pdv_pag2-1_20260808_1729.png";
const img = await loadImage(basePng);

const A = [ // MU-A48
  [[314.04,1448.50],[315.91,351.38]],
  [[315.91,351.38],[693.50,351.38]],
  [[693.50,351.38],[689.76,1446.63]],
];
const B = [ // MU-A49
  [[697.24,351.38],[1026.24,356.99]],
  [[1026.24,356.99],[1024.37,504.64]],
];
const p = [695.4, 351.4]; // punto de contacto (aprox., entre el extremo de A48 y A49)
const RADIO_VENTANA = 150;

// --- Vista general (contexto amplio) ---
{
  const cx = 800, cy = 700, w = 1400, h = 1200;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h, 0, 0, w, h);
  const tx = (x) => x - (cx - w/2);
  const ty = (y) => y - (cy - h/2);

  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ff0000";
  A.forEach(([p1,p2]) => { ctx.beginPath(); ctx.moveTo(tx(p1[0]),ty(p1[1])); ctx.lineTo(tx(p2[0]),ty(p2[1])); ctx.stroke(); });
  ctx.strokeStyle = "#0066ff";
  B.forEach(([p1,p2]) => { ctx.beginPath(); ctx.moveTo(tx(p1[0]),ty(p1[1])); ctx.lineTo(tx(p2[0]),ty(p2[1])); ctx.stroke(); });

  // punto p
  ctx.fillStyle = "#00aa00";
  ctx.beginPath(); ctx.arc(tx(p[0]), ty(p[1]), 10, 0, Math.PI*2); ctx.fill();

  // ventana local (radio 150px)
  ctx.strokeStyle = "#00aa00";
  ctx.setLineDash([12,8]);
  ctx.lineWidth = 4;
  ctx.strokeRect(tx(p[0]-RADIO_VENTANA), ty(p[1]-RADIO_VENTANA), RADIO_VENTANA*2, RADIO_VENTANA*2);
  ctx.setLineDash([]);

  // etiquetas
  ctx.font = "bold 32px sans-serif";
  ctx.fillStyle = "#ff0000"; ctx.fillText("A (MU-A48)", tx(340), ty(700));
  ctx.fillStyle = "#0066ff"; ctx.fillText("B (MU-A49)", tx(760), ty(430));
  ctx.fillStyle = "#00aa00"; ctx.fillText("p (punto de contacto)", tx(p[0]-260), ty(p[1]-30));
  ctx.fillText("ventana local (radio 150px)", tx(p[0]-260), ty(p[1]+RADIO_VENTANA+40));

  fs.writeFileSync("_tmp_ilustracion_AB_contexto.png", canvas.toBuffer("image/png"));
  console.log("guardado contexto");
}

// --- Zoom dentro de la ventana local ---
{
  const w = RADIO_VENTANA*2, h = RADIO_VENTANA*2;
  const cx = p[0], cy = p[1];
  const canvas = createCanvas(w*2, h*2); // 2x para verse mas grande
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h, 0, 0, w*2, h*2);
  const scale = 2;
  const tx = (x) => (x - (cx - w/2)) * scale;
  const ty = (y) => (y - (cy - h/2)) * scale;

  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ff0000";
  A.forEach(([p1,p2]) => { ctx.beginPath(); ctx.moveTo(tx(p1[0]),ty(p1[1])); ctx.lineTo(tx(p2[0]),ty(p2[1])); ctx.stroke(); });
  ctx.strokeStyle = "#0066ff";
  B.forEach(([p1,p2]) => { ctx.beginPath(); ctx.moveTo(tx(p1[0]),ty(p1[1])); ctx.lineTo(tx(p2[0]),ty(p2[1])); ctx.stroke(); });

  ctx.fillStyle = "#00aa00";
  ctx.beginPath(); ctx.arc(tx(p[0]), ty(p[1]), 12, 0, Math.PI*2); ctx.fill();

  ctx.font = "bold 28px sans-serif";
  ctx.fillStyle = "#ff0000"; ctx.fillText("A", tx(400), ty(340));
  ctx.fillStyle = "#0066ff"; ctx.fillText("B", tx(850), ty(420));
  ctx.fillStyle = "#00aa00"; ctx.fillText("p", tx(p[0]+15), ty(p[1]-15));

  fs.writeFileSync("_tmp_ilustracion_AB_zoom.png", canvas.toBuffer("image/png"));
  console.log("guardado zoom");
}
