/content/Raster2Seq/models/ops
running build
running build_py
creating build/lib.linux-x86_64-cpython-312/functions
copying functions/__init__.py -> build/lib.linux-x86_64-cpython-312/functions
copying functions/ms_deform_attn_func.py -> build/lib.linux-x86_64-cpython-312/functions
creating build/lib.linux-x86_64-cpython-312/modules
copying modules/__init__.py -> build/lib.linux-x86_64-cpython-312/modules
copying modules/ms_deform_attn.py -> build/lib.linux-x86_64-cpython-312/modules
running build_ext
W0805 19:06:35.415000 30517 torch/utils/cpp_extension.py:680] Attempted to use ninja as the BuildExtension backend but we could not find ninja.. Falling back to using the slow distutils backend.
building 'MultiScaleDeformableAttention' extension
creating build/temp.linux-x86_64-cpython-312/content/Raster2Seq/models/ops/src/cpu
creating build/temp.linux-x86_64-cpython-312/content/Raster2Seq/models/ops/src/cuda
x86_64-linux-gnu-g++ -fno-strict-overflow -Wsign-compare -DNDEBUG -g -O2 -Wall -g -fstack-protector-strong -Wformat -Werror=format-security -g -fwrapv -O2 -fPIC -DWITH_CUDA -I/content/Raster2Seq/models/ops/src -I/usr/local/lib/python3.12/dist-packages/torch/include -I/usr/local/lib/python3.12/dist-packages/torch/include/torch/csrc/api/include -I/usr/local/cuda/include -I/usr/include/python3.12 -c /content/Raster2Seq/models/ops/src/cpu/ms_deform_attn_cpu.cpp -o build/temp.linux-x86_64-cpython-312/content/Raster2Seq/models/ops/src/cpu/ms_deform_attn_cpu.o -DTORCH_API_INCLUDE_EXTENSION_H -DTORCH_EXTENSION_NAME=MultiScaleDeformableAttention -std=c++17
/usr/local/cuda/bin/nvcc -DWITH_CUDA -I/content/Raster2Seq/models/ops/src -I/usr/local/lib/python3.12/dist-packages/torch/include -I/usr/local/lib/python3.12/dist-packages/torch/include/torch/csrc/api/include -I/usr/local/cuda/include -I/usr/include/python3.12 -c /content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu -o build/temp.linux-x86_64-cpython-312/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.o -D__CUDA_NO_HALF_OPERATORS__ -D__CUDA_NO_HALF_CONVERSIONS__ -D__CUDA_NO_BFLOAT16_CONVERSIONS__ -D__CUDA_NO_HALF2_OPERATORS__ --expt-relaxed-constexpr --compiler-options '-fPIC' -DCUDA_HAS_FP16=1 -D__CUDA_NO_HALF_OPERATORS__ -D__CUDA_NO_HALF_CONVERSIONS__ -D__CUDA_NO_HALF2_OPERATORS__ -DTORCH_API_INCLUDE_EXTENSION_H -DTORCH_EXTENSION_NAME=MultiScaleDeformableAttention -gencode=arch=compute_75,code=compute_75 -gencode=arch=compute_75,code=sm_75 -std=c++17
/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu(34): error: expression must have class type but it has type "c10::ScalarType"
      do { ::c10::detail::deprecated_AT_ASSERTM(); if (!(value.scalar_type().is_cuda())) { ::c10::detail::torchInternalAssertFail( __func__, "/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu", static_cast<uint32_t>(34), "value.scalar_type().is_cuda()" " INTERNAL ASSERT FAILED at " "\"/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu\"" ":" "34" ", please report a bug to PyTorch. ", c10::str("value must be a CUDA tensor")); }; } while (false);
                                                         ^

/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu(100): error: expression must have class type but it has type "c10::ScalarType"
      do { ::c10::detail::deprecated_AT_ASSERTM(); if (!(value.scalar_type().is_cuda())) { ::c10::detail::torchInternalAssertFail( __func__, "/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu", static_cast<uint32_t>(100), "value.scalar_type().is_cuda()" " INTERNAL ASSERT FAILED at " "\"/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu\"" ":" "100" ", please report a bug to PyTorch. ", c10::str("value must be a CUDA tensor")); }; } while (false);
                                                         ^

2 errors detected in the compilation of "/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu".
error: command '/usr/local/cuda/bin/nvcc' failed with exit code 2
