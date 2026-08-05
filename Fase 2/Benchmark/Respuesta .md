/content/Raster2Seq
/usr/local/lib/python3.12/dist-packages/torchvision/models/_utils.py:208: UserWarning: The parameter 'pretrained' is deprecated since 0.13 and may be removed in the future, please use 'weights' instead.
  warnings.warn(
/usr/local/lib/python3.12/dist-packages/torchvision/models/_utils.py:223: UserWarning: Arguments other than a weight enum or `None` for 'weights' are deprecated since 0.13 and may be removed in the future. The current behavior is equivalent to passing `weights=ResNet50_Weights.IMAGENET1K_V1`. You can also use `weights=ResNet50_Weights.DEFAULT` to get the most up-to-date weights.
  warnings.warn(msg)
Downloading: "https://download.pytorch.org/models/resnet50-0676ba61.pth" to /root/.cache/torch/hub/checkpoints/resnet50-0676ba61.pth
100% 97.8M/97.8M [00:00<00:00, 161MB/s]
number of params: 16771089
Downloading bytes:           |  0.00B            
Reconstructing (incomplete total...): |          |  0.00B /  0.00B            

Fetching 2 files:   0% 0/2 [00:00<?, ?it/s]
Reconstructing (incomplete total...):   0% 0.00/1.45G [00:00<?, ?B/s]         Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.

Reconstructing (incomplete total...):   0% 0.00/1.45G [00:00<?, ?B/s]
Downloading bytes:  19% 269M/1.45G [00:03<00:08, 142MB/s, 22.2MB/s  ]
Downloading bytes:  46% 664M/1.45G [00:05<00:03, 232MB/s, 51.6MB/s  ]
Downloading bytes:  67% 970M/1.45G [00:06<00:01, 362MB/s, 74.1MB/s  ]
Reconstructing (incomplete total...):  54% 786M/1.45G [00:06<00:04, 142MB/s, 59.3MB/s  ]
Downloading bytes:  70% 1.01G/1.45G [00:06<00:01, 305MB/s, 77.7MB/s  ]
Downloading bytes:  73% 1.06G/1.45G [00:06<00:01, 243MB/s, 80.3MB/s  ]
Reconstructing (incomplete total...):  77% 1.12G/1.45G [00:06<00:01, 243MB/s, 82.9MB/s  ]
Reconstructing (incomplete total...):  86% 1.25G/1.45G [00:06<00:00, 323MB/s, 89.0MB/s  ]
Reconstructing (incomplete total...):  94% 1.37G/1.45G [00:07<00:00, 344MB/s, 98.9MB/s  ]
Reconstructing (incomplete total...): 100% 1.45G/1.45G [00:07<00:00, 351MB/s,  108MB/s  ]

Fetching 2 files: 100% 2/2 [00:07<00:00,  3.62s/it]
Download complete: 100% 1.08G/1.08G [00:07<00:00, 243MB/s, 80.4MB/s  ]
Download complete: 100% 1.08G/1.08G [00:07<00:00, 140MB/s, 80.4MB/s  ]
Reconstruction complete: 100% 1.45G/1.45G [00:07<00:00, 188MB/s,  112MB/s  ]
Traceback (most recent call last):
  File "/content/Raster2Seq/predict.py", line 526, in <module>
    main(args)
  File "/content/Raster2Seq/predict.py", line 287, in main
    checkpoint = torch.load(args.checkpoint, map_location="cpu")
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/local/lib/python3.12/dist-packages/torch/serialization.py", line 1578, in load
    raise pickle.UnpicklingError(_get_wo_message(str(e))) from None
_pickle.UnpicklingError: Weights only load failed. This file can still be loaded, to do so you have two options, do those steps only if you trust the source of the checkpoint. 
	(1) In PyTorch 2.6, we changed the default value of the `weights_only` argument in `torch.load` from `False` to `True`. Re-running `torch.load` with `weights_only` set to `False` will likely succeed, but it can result in arbitrary code execution. Do it only if you got the file from a trusted source.
	(2) Alternatively, to load with `weights_only=True` please check the recommended steps in the following error message.
	WeightsUnpickler error: Unsupported global: GLOBAL argparse.Namespace was not an allowed global by default. Please use `torch.serialization.add_safe_globals([argparse.Namespace])` or the `torch.serialization.safe_globals([argparse.Namespace])` context manager to allowlist this global if you trust this class/function.

Check the documentation of torch.load to learn more about types accepted by default with weights_only https://pytorch.org/docs/stable/generated/torch.load.html.
Archivos generados:
