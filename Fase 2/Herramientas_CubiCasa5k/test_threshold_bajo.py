# ══════════════════════════════════════════════════════════
# TEST — threshold bajo + diagnostico de señal cruda
# Pegar como celda nueva, reutiliza 'model', 'imagenes_test' ya cargados.
# No hace falta repetir nada anterior.
#
# Ademas de bajar el threshold, imprime el conteo de TODOS los tipos de
# icono detectados (no solo puerta/ventana) para saber si el modelo esta
# detectando algo en general (aunque sea otro tipo, como inodoro/lavamanos)
# o si esta genuinamente en silencio total con esta imagen.
# ══════════════════════════════════════════════════════════
import cv2, numpy as np, torch

icon_classes = ["No Icon", "Window", "Door", "Closet", "Electrical Applience",
                 "Toilet", "Sink", "Sauna Bench", "Fire Place", "Bathtub", "Chimney"]

def procesar_imagen_threshold(path, threshold, max_lado=2000):
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

    # Conteo de TODOS los tipos de icono detectados, no solo puerta/ventana
    conteo_por_clase = {}
    for t in types:
        clase_idx = t.get('class')
        nombre = icon_classes[clase_idx] if isinstance(clase_idx, int) and clase_idx < len(icon_classes) else f'clase_{clase_idx}'
        conteo_por_clase[nombre] = conteo_por_clase.get(nombre, 0) + 1

    return {
        'archivo': path,
        'total_detecciones': len(types),
        'por_clase': conteo_por_clase,
        'n_puertas': conteo_por_clase.get('Door', 0),
        'n_ventanas': conteo_por_clase.get('Window', 0),
    }

for thr in [0.5, 0.3, 0.2, 0.1]:
    print(f'\n{"="*56}')
    print(f'THRESHOLD = {thr}')
    print(f'{"="*56}')
    for img_path in imagenes_test:
        r = procesar_imagen_threshold(img_path, threshold=thr)
        print(f'\n  {img_path}')
        print(f'    Total detecciones (todas las clases): {r["total_detecciones"]}')
        print(f'    Por clase: {r["por_clase"]}')
        print(f'    -> Puertas: {r["n_puertas"]}  Ventanas: {r["n_ventanas"]}')
