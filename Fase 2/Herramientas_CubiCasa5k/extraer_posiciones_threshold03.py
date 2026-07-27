# ══════════════════════════════════════════════════════════
# EXTRAER POSICIONES a threshold 0.3 — con el bug de numpy.int64 corregido
# Pegar como celda nueva, reutiliza 'model', 'imagenes_test' ya cargados.
#
# FIX 2026-07-23: el indice de clase que devuelve el modelo es numpy.int64,
# no int de Python -- isinstance(clase_idx, int) daba False y mandaba
# puertas reales al bucket erroneo "clase_2". Se corrige comparando con
# int(clase_idx) siempre, sin isinstance.
# ══════════════════════════════════════════════════════════
import cv2, numpy as np, torch, json

icon_classes = ["No Icon", "Window", "Door", "Closet", "Electrical Applience",
                 "Toilet", "Sink", "Sauna Bench", "Fire Place", "Bathtub", "Chimney"]

THRESHOLD = 0.3

def extraer_posiciones(path, threshold=THRESHOLD, max_lado=2000):
    img_bgr = cv2.imread(path)
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h0, w0 = img_rgb.shape[:2]
    ratio = min(max_lado / w0, max_lado / h0, 1.0)
    if ratio < 1.0:
        img_rgb = cv2.resize(img_rgb, (int(w0 * ratio), int(h0 * ratio)))
    h, w = img_rgb.shape[:2]

    fplan = 2 * (img_rgb.astype(np.float32) / 255.0) - 1
    fplan = np.moveaxis(fplan, -1, 0)
    img_t = torch.tensor(fplan).unsqueeze(0).cuda()

    with torch.no_grad():
        pred = model(img_t)
    pred = pred.cpu()

    heatmaps, rooms, icons = split_prediction(pred, (h, w), split)
    polygons, types, room_polygons, room_types = get_polygons(
        (heatmaps, rooms, icons), threshold=threshold,
        all_opening_types=[IDX_VENTANA, IDX_PUERTA]
    )

    puertas, ventanas = [], []
    for poly, t in zip(polygons, types):
        clase_idx = int(t.get('class'))  # FIX: forzar a int de Python siempre
        poly_arr = np.array(poly)
        cx = float(poly_arr[:, 0].mean())
        cy = float(poly_arr[:, 1].mean())
        item = {
            'cx_rel': round(cx / w, 3),
            'cy_rel': round(cy / h, 3),
            'clase': icon_classes[clase_idx] if clase_idx < len(icon_classes) else f'clase_{clase_idx}',
        }
        if clase_idx == IDX_PUERTA:
            puertas.append(item)
        elif clase_idx == IDX_VENTANA:
            ventanas.append(item)

    return {'archivo': path, 'w': w, 'h': h, 'puertas': puertas, 'ventanas': ventanas}

resultados_pos = []
for img_path in imagenes_test:
    r = extraer_posiciones(img_path)
    print(f'\n{img_path}')
    print(f'  Puertas ({len(r["puertas"])}):')
    for p in r['puertas']:
        print(f'    cx_rel={p["cx_rel"]}  cy_rel={p["cy_rel"]}')
    print(f'  Ventanas ({len(r["ventanas"])}):')
    for v in r['ventanas']:
        print(f'    cx_rel={v["cx_rel"]}  cy_rel={v["cy_rel"]}')
    resultados_pos.append(r)

with open('cubicasa5k_posiciones_thr03.json', 'w') as f:
    json.dump(resultados_pos, f, indent=2)
from google.colab import files
files.download('cubicasa5k_posiciones_thr03.json')
