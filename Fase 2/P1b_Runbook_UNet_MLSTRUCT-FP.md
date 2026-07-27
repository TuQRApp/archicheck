# P1b — Runbook: Entrenar U-Net sobre MLSTRUCT-FP (RunPod / Vast.ai)

**Objetivo:** replicar/ajustar el modelo U-Net de segmentación de muros del propio equipo de Pizarro (MLSTRUCT-FP), no reinventar un pipeline desde cero. El repo de benchmarks ya trae el notebook de entrenamiento — este runbook es la guía para correrlo en una GPU alquilada.

**Alcance importante:** U-Net/MLSTRUCT-FP segmenta **solo muros** (`Wall`), no puertas/ventanas/escaleras. Es complementario a Grounding DINO + SAM 2 (P1), no un reemplazo — Wall-only está confirmado en la documentación fuente del proyecto (`IA_Analisis_Planos_Arquitectonicos.txt`).

---

## 0. Qué repos usar

| Repo | Para qué |
|---|---|
| [`MLSTRUCT/MLSTRUCT-FP`](https://github.com/MLSTRUCT/MLSTRUCT-FP) | Librería base: carga el dataset (objetos Floor/Wall/Slab), genera crops/rotaciones/escalas custom |
| [`MLSTRUCT/MLStructFP_benchmarks`](https://github.com/MLSTRUCT/MLStructFP_benchmarks) | **Repo con el entrenamiento real** — `create_data.ipynb` (arma el dataset de entrenamiento) + `fp_unet.ipynb` (entrena el U-Net). Archivado (solo lectura) desde 2026-04-23, pero clonable y usable tal cual. |

No hay que escribir el U-Net desde cero — el objetivo de P1 es **correr y validar** este notebook ya existente, no reimplementarlo.

---

## 1. Conseguir el dataset

El dataset MLSTRUCT-FP (954 planos, 165 proyectos, ~1.3M patches extraídos) **no se descarga directo** — hay que completar un formulario público en el repo `MLSTRUCT/MLSTRUCT-FP` para recibir el link de descarga (.zip). Este paso lo tiene que hacer una persona (no es automatizable), así que es lo primero a gestionar antes de reservar GPU — no tiene sentido pagar RunPod mientras se espera el link.

---

## 2. Elegir e iniciar la instancia GPU

- **RunPod o Vast.ai**, GPU tipo T4 o superior (una A100 no es necesaria para este dataset/tamaño de modelo — sería gastar de más).
- Imagen base: cualquier template con Python 3.8+ y drivers NVIDIA. **Ojo con la versión de CUDA**: el repo de benchmarks pide CUDA 10.1 + cuDNN 7.6.5, versión vieja (2026: las imágenes estándar de RunPod ya vienen con CUDA 11/12). Es muy probable que haya que ajustar versiones de `torch`/`tensorflow` en el `setup.py` del repo para que instale sobre CUDA moderno — no asumir que `pip install -e .` funciona a la primera; si falla, revisar qué framework de deep learning usa exactamente el repo (no está confirmado en el README si es PyTorch o TensorFlow/Keras) y instalar la versión de esa librería compatible con el CUDA de la imagen elegida.
- Costo estimado total (GPU + tiempo de entrenamiento): **~$50-150 USD**, según el roadmap — validar contra el tiempo real una vez que se corra, porque no hay dato de horas de entrenamiento confirmado en el README del repo.

---

## 3. Setup del entorno

```bash
git clone https://github.com/MLSTRUCT/MLSTRUCT-FP.git
git clone https://github.com/MLSTRUCT/MLStructFP_benchmarks.git
cd MLStructFP_benchmarks

conda create -n mlstructfp python=3.8 -y
conda activate mlstructfp
pip install -e .
pip install notebook==7.0.7
# Si falla por CUDA/versión de librería DL: revisar requirements.txt / setup.py
# del repo y fijar manualmente la versión compatible con la GPU alquilada.
```

Descomprimir el .zip del dataset (obtenido en el paso 1) en la ruta que espere `create_data.ipynb` — revisar el propio notebook al abrirlo, porque el README no documenta la ruta exacta esperada.

---

## 4. Correr el pipeline

1. **`create_data.ipynb`** — arma el dataset de entrenamiento a partir de los objetos Floor/Wall crudos: aplica crops, rotaciones y escalas custom, y genera los patches de 256px que usa el modelo de referencia (`no_rot_256_50`, sugiere input de 256px).
2. **`fp_unet.ipynb`** — entrena el U-Net de segmentación de muros sobre esos patches.

No hay hiperparámetros documentados en el README (batch size, learning rate, épocas, loss) — están definidos dentro del propio notebook `fp_unet.ipynb`; hay que abrirlo y leerlos ahí antes de lanzar el entrenamiento completo, no asumir valores por defecto sin revisar.

---

## 5. Target de calidad y qué hacer con el resultado

- **Referencia publicada** (mismo equipo, `IA_Analisis_Planos_Arquitectonicos.txt`): IoU promedio 0.77, IoU moda 0.90. Errores principales reportados: muros no ortogonales y estilos de dibujo particulares — esperar que esos casos sigan siendo débiles también en la réplica.
- **Peso pre-entrenado disponible**: el propio repo linkea a Google Drive el modelo ya entrenado (`no_rot_256_50`). Antes de gastar en entrenar desde cero, vale la pena bajar ese checkpoint y probarlo directo contra 1-2 planos chilenos reales del proyecto (ej. el mismo caso Plaza Pedro de Valdivia usado para validar P1) — si el modelo pre-entrenado ya rinde bien sobre planos chilenos, el entrenamiento completo puede no ser necesario, o solo hace falta un fine-tuning corto en vez de entrenar desde cero.
- Una vez entrenado (o validado el checkpoint existente), el output (máscara de segmentación de muros → polígonos → anchos/áreas reales en m² con la escala declarada) se integra al JSON que ya arma el notebook base de Colab (Celda 4/4c), como fuente adicional o de contraste para el ancho de muros — no reemplaza a OpenCV ni a DINO+SAM2, los complementa.

---

## Siguiente paso recomendado (antes de gastar en GPU)

Bajar el checkpoint pre-entrenado (`no_rot_256_50`) y correrlo sobre 1-2 planos chilenos de prueba ya existentes en el proyecto. Es gratis (no requiere entrenar) y da una primera señal de si el modelo de Pizarro generaliza a los planos reales de ArchiCheck antes de decidir si vale la pena el entrenamiento completo.
