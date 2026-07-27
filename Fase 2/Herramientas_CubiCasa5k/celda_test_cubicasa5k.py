# ══════════════════════════════════════════════════════════
# TEST — CubiCasa5K contra planos chilenos (Plaza Pedro de Valdivia)
# Pegar como celda NUEVA en Colab (requiere GPU T4, igual que DINO+SAM2).
# No modifica el notebook principal de ArchiCheck — es un test aparte,
# paso 3 del roadmap: probar el checkpoint pre-entrenado antes de decidir
# si vale la pena integrarlo.
#
# Basado en el codigo oficial de muestra del repo (samples.ipynb) +
# la normalizacion exacta confirmada en floortrans/loaders/svg_loader.py.
# No se pudo probar este script fuera de Colab (necesita GPU) — si tira
# error, mandarlo completo para ajustarlo.
# ══════════════════════════════════════════════════════════

# ── 1. Clonar repo + instalar dependencias ──────────────────
import subprocess, sys, os

subprocess.run(['git', 'clone', '-q', 'https://github.com/CubiCasa/CubiCasa5k.git'], check=True)
os.chdir('CubiCasa5k')
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'gdown'], check=True)

# ── 2. Descargar pesos pre-entrenados ───────────────────────
# Google Drive file ID tomado del link del README oficial
WEIGHTS_ID = '1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK'
subprocess.run(['gdown', f'https://drive.google.com/uc?id={WEIGHTS_ID}',
                 '-O', 'model_best_val_loss_var.pkl'], check=True)
print('✓ Pesos descargados')

# ── 2b. Parche de compatibilidad: scipy.stats.mode() nueva vs codigo viejo ──
# FIX 2026-07-23: el repo (2019) usa stats.mode(widths).mode[0], que asume
# que .mode es un array. En scipy nuevo, .mode es escalar por defecto -->
# "IndexError: invalid index to scalar variable". Se parchea el archivo del
# repo directamente, no se puede arreglar desde afuera.
import re
_archivo_pp = 'floortrans/post_prosessing.py'
with open(_archivo_pp, 'r') as f:
    _contenido = f.read()
_patron = re.compile(r'^([ \t]*)wall_width = stats\.mode\(widths\)\.mode\[0\]\s*$', re.MULTILINE)
def _reemplazo(m):
    ind = m.group(1)
    return (f"{ind}try:\n{ind}    _mode_res = stats.mode(widths, keepdims=True)\n"
            f"{ind}except TypeError:\n{ind}    _mode_res = stats.mode(widths)\n"
            f"{ind}_mode_val = _mode_res.mode\n"
            f"{ind}wall_width = _mode_val[0] if hasattr(_mode_val, '__len__') else _mode_val")
_contenido, _n = _patron.subn(_reemplazo, _contenido)
if _n > 0:
    with open(_archivo_pp, 'w') as f:
        f.write(_contenido)
    print(f'✓ Parche scipy.stats.mode aplicado ({_n} ocurrencia(s))')
else:
    print('⚠ Parche scipy.stats.mode: no se encontro la linea (puede que ya este parchada)')

# ── 3. Subir los PNG a testear ──────────────────────────────
from google.colab import files
print('Selecciona los PNG a testear (ej. los pag2-1.png y pag2-2.png de PdV):')
uploaded = files.upload()
imagenes_test = list(uploaded.keys())

# ── 4. Cargar el modelo (igual que samples.ipynb del repo) ──
import torch
import numpy as np
import cv2
sys.path.insert(0, '.')
from floortrans.models import get_model
from floortrans.post_prosessing import split_prediction, get_polygons

room_classes = ["Background", "Outdoor", "Wall", "Kitchen", "Living Room", "Bed Room",
                "Bath", "Entry", "Railing", "Storage", "Garage", "Undefined"]
icon_classes = ["No Icon", "Window", "Door", "Closet", "Electrical Applience",
                 "Toilet", "Sink", "Sauna Bench", "Fire Place", "Bathtub", "Chimney"]
# Indices de interes para ArchiCheck: Window=1, Door=2 dentro de icon_classes
IDX_VENTANA = 1
IDX_PUERTA  = 2

model = get_model('hg_furukawa_original', 51)
n_classes = 44
split = [21, 12, 11]
model.conv4_   = torch.nn.Conv2d(256, n_classes, bias=True, kernel_size=1)
model.upsample = torch.nn.ConvTranspose2d(n_classes, n_classes, kernel_size=4, stride=4)
checkpoint = torch.load('model_best_val_loss_var.pkl', map_location='cuda')
model.load_state_dict(checkpoint['model_state'])
model.eval()
model.cuda()
print('✓ Modelo cargado')

# ── 5. Inferencia por imagen ─────────────────────────────────
def procesar_imagen(path, max_lado=2000):
    """
    Normalizacion exacta confirmada en floortrans/loaders/svg_loader.py:
    fplan = 2 * (fplan / 255.0) - 1  (rango [-1, 1], no la tipica /255 solo)
    max_lado: si la imagen es muy grande, la achica para evitar OOM en la
    GPU T4 (16GB) — el modelo es totalmente convolucional, funciona a
    cualquier tamano, pero una imagen de 2860x5052 puede ser demasiado.
    """
    img_bgr = cv2.imread(path)
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    h0, w0 = img_rgb.shape[:2]
    ratio = min(max_lado / w0, max_lado / h0, 1.0)
    if ratio < 1.0:
        img_rgb = cv2.resize(img_rgb, (int(w0 * ratio), int(h0 * ratio)))
    h, w = img_rgb.shape[:2]

    fplan = 2 * (img_rgb.astype(np.float32) / 255.0) - 1
    fplan = np.moveaxis(fplan, -1, 0)  # HWC -> CHW
    img_t = torch.tensor(fplan).unsqueeze(0).cuda()

    with torch.no_grad():
        try:
            pred = model(img_t)
        except torch.cuda.OutOfMemoryError:
            print(f'  ⚠ OOM a {w}x{h} — reintentando a la mitad de resolucion')
            torch.cuda.empty_cache()
            return procesar_imagen(path, max_lado=max_lado // 2)

    # FIX 2026-07-23: split_prediction (dentro del repo de CubiCasa5K) hace
    # heatmaps.data.numpy() sin mover el tensor a CPU primero -- falla con
    # "can't convert cuda:0 device type tensor to numpy". Hay que pasarle
    # el tensor ya en CPU.
    pred = pred.cpu()
    heatmaps, rooms, icons = split_prediction(pred, (h, w), split)
    polygons, types, room_polygons, room_types = get_polygons(
        (heatmaps, rooms, icons), threshold=0.5,
        all_opening_types=[IDX_VENTANA, IDX_PUERTA]
    )

    puertas  = [p for p, t in zip(polygons, types) if t.get('class') == IDX_PUERTA]
    ventanas = [p for p, t in zip(polygons, types) if t.get('class') == IDX_VENTANA]

    return {
        'archivo': path, 'w': w, 'h': h,
        'n_puertas': len(puertas), 'n_ventanas': len(ventanas),
        'puertas': puertas, 'ventanas': ventanas,
    }

print('\n' + '=' * 56)
resultados = []
for img_path in imagenes_test:
    print(f'\nProcesando: {img_path}')
    r = procesar_imagen(img_path)
    print(f'  ✓ Puertas detectadas : {r["n_puertas"]}')
    print(f'  ✓ Ventanas detectadas: {r["n_ventanas"]}')
    resultados.append(r)

# ── 6. Comparacion contra ground truth conocido ──────────────
GROUND_TRUTH = {
    'pag2-1': {'puertas': 16, 'ventanas': 10, 'nombre': 'Nivel 1'},
    'pag2-2': {'puertas': 10, 'ventanas': 7,  'nombre': 'Nivel 2'},
}
print('\n' + '=' * 56)
print('COMPARACION CONTRA GROUND TRUTH')
print('=' * 56)
for r in resultados:
    tag = next((k for k in GROUND_TRUTH if k in r['archivo']), None)
    if tag:
        gt = GROUND_TRUTH[tag]
        print(f"\n{gt['nombre']} ({r['archivo']}):")
        print(f"  Puertas : CubiCasa5K={r['n_puertas']:3d}  |  Ground truth={gt['puertas']:3d}")
        print(f"  Ventanas: CubiCasa5K={r['n_ventanas']:3d}  |  Ground truth={gt['ventanas']:3d}")
    else:
        print(f"\n{r['archivo']}: sin ground truth conocido para comparar")

print('\nDescarga los resultados si queres revisarlos con mas detalle:')
import json
with open('cubicasa5k_resultados.json', 'w') as f:
    json.dump([{k: v for k, v in r.items() if k not in ('puertas', 'ventanas')} for r in resultados], f, indent=2)
files.download('cubicasa5k_resultados.json')
