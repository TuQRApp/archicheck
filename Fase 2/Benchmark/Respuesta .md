/content/Raster2Seq/models/ops
running build
running build_py
copying functions/__init__.py -> build/lib.linux-x86_64-cpython-312/functions
copying functions/ms_deform_attn_func.py -> build/lib.linux-x86_64-cpython-312/functions
copying modules/__init__.py -> build/lib.linux-x86_64-cpython-312/modules
copying modules/ms_deform_attn.py -> build/lib.linux-x86_64-cpython-312/modules
running build_ext
W0805 19:03:06.669000 29593 torch/utils/cpp_extension.py:680] Attempted to use ninja as the BuildExtension backend but we could not find ninja.. Falling back to using the slow distutils backend.
building 'MultiScaleDeformableAttention' extension
x86_64-linux-gnu-g++ -fno-strict-overflow -Wsign-compare -DNDEBUG -g -O2 -Wall -g -fstack-protector-strong -Wformat -Werror=format-security -g -fwrapv -O2 -fPIC -DWITH_CUDA -I/content/Raster2Seq/models/ops/src -I/usr/local/lib/python3.12/dist-packages/torch/include -I/usr/local/lib/python3.12/dist-packages/torch/include/torch/csrc/api/include -I/usr/local/cuda/include -I/usr/include/python3.12 -c /content/Raster2Seq/models/ops/src/cpu/ms_deform_attn_cpu.cpp -o build/temp.linux-x86_64-cpython-312/content/Raster2Seq/models/ops/src/cpu/ms_deform_attn_cpu.o -DTORCH_API_INCLUDE_EXTENSION_H -DTORCH_EXTENSION_NAME=MultiScaleDeformableAttention -std=c++17
/usr/local/cuda/bin/nvcc -DWITH_CUDA -I/content/Raster2Seq/models/ops/src -I/usr/local/lib/python3.12/dist-packages/torch/include -I/usr/local/lib/python3.12/dist-packages/torch/include/torch/csrc/api/include -I/usr/local/cuda/include -I/usr/include/python3.12 -c /content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu -o build/temp.linux-x86_64-cpython-312/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.o -D__CUDA_NO_HALF_OPERATORS__ -D__CUDA_NO_HALF_CONVERSIONS__ -D__CUDA_NO_BFLOAT16_CONVERSIONS__ -D__CUDA_NO_HALF2_OPERATORS__ --expt-relaxed-constexpr --compiler-options '-fPIC' -DCUDA_HAS_FP16=1 -D__CUDA_NO_HALF_OPERATORS__ -D__CUDA_NO_HALF_CONVERSIONS__ -D__CUDA_NO_HALF2_OPERATORS__ -DTORCH_API_INCLUDE_EXTENSION_H -DTORCH_EXTENSION_NAME=MultiScaleDeformableAttention -gencode=arch=compute_75,code=compute_75 -gencode=arch=compute_75,code=sm_75 -std=c++17
/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu(64): error: no suitable conversion function from "const at::DeprecatedTypeProperties" to "c10::ScalarType" exists
          [&] { const auto& the_type = value.type(); constexpr const char* at_dispatch_name = "ms_deform_attn_forward_cuda"; torch::headeronly::ScalarType _st = ::detail::scalar_type(the_type); ;
                                                                                                                                                                                       ^

/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu(134): error: no suitable conversion function from "const at::DeprecatedTypeProperties" to "c10::ScalarType" exists
          [&] { const auto& the_type = value.type(); constexpr const char* at_dispatch_name = "ms_deform_attn_backward_cuda"; torch::headeronly::ScalarType _st = ::detail::scalar_type(the_type); ;
                                                                                                                                                                                        ^

2 errors detected in the compilation of "/content/Raster2Seq/models/ops/src/cuda/ms_deform_attn_cuda.cu".
error: command '/usr/local/cuda/bin/nvcc' failed with exit code 2
