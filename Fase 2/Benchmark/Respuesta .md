 no_rot_256_50: Image shape (256, 256, 1)
Model has changed, printing difference between architectures
Architecture diff:
	--- 

	+++ 

	@@ -1,31 +1,44 @@

	 {
	-  "class_name": "Model",
	+  "module": "keras.src.models.functional",
	+  "class_name": "Functional",
	   "config": {
	     "name": "layer_0",
	+    "trainable": true,
	     "layers": [
	       {
	-        "name": "layer_2",
	+        "module": "keras.layers",
	         "class_name": "InputLayer",
	         "config": {
	-          "batch_input_shape": [
	+          "batch_shape": [
	             null,
	             256,
	             256,
	             1
	           ],
	-          "dtype": "float32",
	+          "dtype": "layer_40",
	           "sparse": false,
	-          "name": "layer_2"
	-        },
	+          "ragged": false,
	+          "name": "layer_2",
	+          "optional": false
	+        },
	+        "registered_name": null,
	+        "name": "layer_2",
	         "inbound_nodes": []
	       },
	       {
	-        "name": "layer_3",
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_3",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_4",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 64,
	           "kernel_size": [
	             3,
	@@ -41,20 +54,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -62,24 +77,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_2",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            256,
	+            256,
	+            1
	+          ]
	+        },
	         "name": "layer_4",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    256,
	+                    256,
	+                    1
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_2",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_4",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_5",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 64,
	           "kernel_size": [
	             3,
	@@ -95,20 +141,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -116,24 +164,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_3",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            256,
	+            256,
	+            64
	+          ]
	+        },
	         "name": "layer_5",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    256,
	+                    256,
	+                    64
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_4",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "MaxPooling2D",
	         "config": {
	-          "name": "layer_5",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_6",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "pool_size": [
	             2,
	             2
	@@ -145,24 +224,47 @@

	           ],
	           "data_format": "channels_last"
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_4",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	         "name": "layer_6",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    256,
	+                    256,
	+                    64
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_5",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_6",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_7",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 128,
	           "kernel_size": [
	             3,
	@@ -178,20 +280,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -199,24 +303,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_5",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            128,
	+            128,
	+            64
	+          ]
	+        },
	         "name": "layer_7",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    128,
	+                    128,
	+                    64
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_6",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_7",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_8",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 128,
	           "kernel_size": [
	             3,
	@@ -232,20 +367,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -253,24 +390,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_6",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            128,
	+            128,
	+            128
	+          ]
	+        },
	         "name": "layer_8",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    128,
	+                    128,
	+                    128
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_7",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "MaxPooling2D",
	         "config": {
	-          "name": "layer_8",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_9",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "pool_size": [
	             2,
	             2
	@@ -282,24 +450,47 @@

	           ],
	           "data_format": "channels_last"
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_7",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	         "name": "layer_9",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    128,
	+                    128,
	+                    128
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_8",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_9",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_10",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 256,
	           "kernel_size": [
	             3,
	@@ -315,20 +506,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -336,24 +529,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_8",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            64,
	+            64,
	+            128
	+          ]
	+        },
	         "name": "layer_10",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    64,
	+                    64,
	+                    128
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_9",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_10",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_11",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 256,
	           "kernel_size": [
	             3,
	@@ -369,20 +593,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -390,24 +616,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_9",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            64,
	+            64,
	+            256
	+          ]
	+        },
	         "name": "layer_11",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    64,
	+                    64,
	+                    256
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_10",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "MaxPooling2D",
	         "config": {
	-          "name": "layer_11",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_12",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "pool_size": [
	             2,
	             2
	@@ -419,24 +676,47 @@

	           ],
	           "data_format": "channels_last"
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_10",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	         "name": "layer_12",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    64,
	+                    64,
	+                    256
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_11",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_12",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_13",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 512,
	           "kernel_size": [
	             3,
	@@ -452,20 +732,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -473,24 +755,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_11",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            32,
	+            32,
	+            256
	+          ]
	+        },
	         "name": "layer_13",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    32,
	+                    32,
	+                    256
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_12",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_13",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_14",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 512,
	           "kernel_size": [
	             3,
	@@ -506,20 +819,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -527,46 +842,102 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_12",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            32,
	+            32,
	+            512
	+          ]
	+        },
	         "name": "layer_14",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    32,
	+                    32,
	+                    512
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_13",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Dropout",
	         "config": {
	-          "name": "layer_14",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_15",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "rate": 0.5,
	-          "noise_shape": null,
	-          "seed": null
	-        },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_13",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+          "seed": null,
	+          "noise_shape": null
	+        },
	+        "registered_name": null,
	         "name": "layer_15",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    32,
	+                    32,
	+                    512
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_14",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {
	+              "training": false
	+            }
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "MaxPooling2D",
	         "config": {
	-          "name": "layer_15",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_16",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "pool_size": [
	             2,
	             2
	@@ -578,24 +949,47 @@

	           ],
	           "data_format": "channels_last"
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_14",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	         "name": "layer_16",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    32,
	+                    32,
	+                    512
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_15",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_16",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_17",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 1024,
	           "kernel_size": [
	             3,
	@@ -611,20 +1005,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -632,24 +1028,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_15",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            16,
	+            16,
	+            512
	+          ]
	+        },
	         "name": "layer_17",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    16,
	+                    16,
	+                    512
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_16",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_17",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_18",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 1024,
	           "kernel_size": [
	             3,
	@@ -665,20 +1092,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -686,46 +1115,102 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_16",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            16,
	+            16,
	+            1024
	+          ]
	+        },
	         "name": "layer_18",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    16,
	+                    16,
	+                    1024
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_17",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Dropout",
	         "config": {
	-          "name": "layer_18",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_19",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "rate": 0.5,
	-          "noise_shape": null,
	-          "seed": null
	-        },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_17",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+          "seed": null,
	+          "noise_shape": null
	+        },
	+        "registered_name": null,
	         "name": "layer_19",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    16,
	+                    16,
	+                    1024
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_18",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {
	+              "training": false
	+            }
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "UpSampling2D",
	         "config": {
	-          "name": "layer_19",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_20",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "size": [
	             2,
	             2
	@@ -733,24 +1218,55 @@

	           "data_format": "channels_last",
	           "interpolation": "nearest"
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_18",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            16,
	+            16,
	+            1024
	+          ]
	+        },
	         "name": "layer_20",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    16,
	+                    16,
	+                    1024
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_19",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_20",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_21",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 512,
	           "kernel_size": [
	             2,
	@@ -766,20 +1282,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -787,50 +1305,133 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            32,
	+            32,
	+            1024
	+          ]
	+        },
	+        "name": "layer_21",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    32,
	+                    32,
	+                    1024
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_20",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	+        "class_name": "Concatenate",
	+        "config": {
	+          "name": "layer_22",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	+          "axis": 3
	+        },
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	             [
	-              "layer_19",
	-              0,
	-              0,
	-              {}
	+              null,
	+              32,
	+              32,
	+              512
	+            ],
	+            [
	+              null,
	+              32,
	+              32,
	+              512
	             ]
	           ]
	-        ]
	-      },
	-      {
	-        "name": "layer_21",
	-        "class_name": "Concatenate",
	-        "config": {
	-          "name": "layer_21",
	-          "trainable": true,
	-          "dtype": "float32",
	-          "axis": 3
	-        },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_14",
	-              0,
	-              0,
	-              {}
	-            ],
	-            [
	-              "layer_20",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        },
	         "name": "layer_22",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              [
	+                {
	+                  "class_name": "__keras_tensor__",
	+                  "config": {
	+                    "shape": [
	+                      null,
	+                      32,
	+                      32,
	+                      512
	+                    ],
	+                    "dtype": "layer_40",
	+                    "keras_history": [
	+                      "layer_15",
	+                      0,
	+                      0
	+                    ]
	+                  }
	+                },
	+                {
	+                  "class_name": "__keras_tensor__",
	+                  "config": {
	+                    "shape": [
	+                      null,
	+                      32,
	+                      32,
	+                      512
	+                    ],
	+                    "dtype": "layer_40",
	+                    "keras_history": [
	+                      "layer_21",
	+                      0,
	+                      0
	+                    ]
	+                  }
	+                }
	+              ]
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_22",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_23",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 512,
	           "kernel_size": [
	             3,
	@@ -846,20 +1447,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -867,24 +1470,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_21",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            32,
	+            32,
	+            1024
	+          ]
	+        },
	         "name": "layer_23",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    32,
	+                    32,
	+                    1024
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_22",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_23",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_24",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 512,
	           "kernel_size": [
	             3,
	@@ -900,20 +1534,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -921,24 +1557,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_22",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            32,
	+            32,
	+            512
	+          ]
	+        },
	         "name": "layer_24",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    32,
	+                    32,
	+                    512
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_23",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "UpSampling2D",
	         "config": {
	-          "name": "layer_24",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_25",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "size": [
	             2,
	             2
	@@ -946,24 +1613,55 @@

	           "data_format": "channels_last",
	           "interpolation": "nearest"
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_23",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            32,
	+            32,
	+            512
	+          ]
	+        },
	         "name": "layer_25",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    32,
	+                    32,
	+                    512
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_24",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_25",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_26",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 256,
	           "kernel_size": [
	             2,
	@@ -979,20 +1677,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1000,50 +1700,133 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            64,
	+            64,
	+            512
	+          ]
	+        },
	+        "name": "layer_26",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    64,
	+                    64,
	+                    512
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_25",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	+        "class_name": "Concatenate",
	+        "config": {
	+          "name": "layer_27",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	+          "axis": 3
	+        },
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	             [
	-              "layer_24",
	-              0,
	-              0,
	-              {}
	+              null,
	+              64,
	+              64,
	+              256
	+            ],
	+            [
	+              null,
	+              64,
	+              64,
	+              256
	             ]
	           ]
	-        ]
	-      },
	-      {
	-        "name": "layer_26",
	-        "class_name": "Concatenate",
	-        "config": {
	-          "name": "layer_26",
	-          "trainable": true,
	-          "dtype": "float32",
	-          "axis": 3
	-        },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_10",
	-              0,
	-              0,
	-              {}
	-            ],
	-            [
	-              "layer_25",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        },
	         "name": "layer_27",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              [
	+                {
	+                  "class_name": "__keras_tensor__",
	+                  "config": {
	+                    "shape": [
	+                      null,
	+                      64,
	+                      64,
	+                      256
	+                    ],
	+                    "dtype": "layer_40",
	+                    "keras_history": [
	+                      "layer_11",
	+                      0,
	+                      0
	+                    ]
	+                  }
	+                },
	+                {
	+                  "class_name": "__keras_tensor__",
	+                  "config": {
	+                    "shape": [
	+                      null,
	+                      64,
	+                      64,
	+                      256
	+                    ],
	+                    "dtype": "layer_40",
	+                    "keras_history": [
	+                      "layer_26",
	+                      0,
	+                      0
	+                    ]
	+                  }
	+                }
	+              ]
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_27",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_28",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 256,
	           "kernel_size": [
	             3,
	@@ -1059,20 +1842,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1080,24 +1865,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_26",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            64,
	+            64,
	+            512
	+          ]
	+        },
	         "name": "layer_28",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    64,
	+                    64,
	+                    512
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_27",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_28",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_29",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 256,
	           "kernel_size": [
	             3,
	@@ -1113,20 +1929,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1134,24 +1952,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_27",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            64,
	+            64,
	+            256
	+          ]
	+        },
	         "name": "layer_29",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    64,
	+                    64,
	+                    256
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_28",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "UpSampling2D",
	         "config": {
	-          "name": "layer_29",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_30",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "size": [
	             2,
	             2
	@@ -1159,24 +2008,55 @@

	           "data_format": "channels_last",
	           "interpolation": "nearest"
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_28",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            64,
	+            64,
	+            256
	+          ]
	+        },
	         "name": "layer_30",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    64,
	+                    64,
	+                    256
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_29",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_30",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_31",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 128,
	           "kernel_size": [
	             2,
	@@ -1192,20 +2072,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1213,50 +2095,133 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            128,
	+            128,
	+            256
	+          ]
	+        },
	+        "name": "layer_31",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    128,
	+                    128,
	+                    256
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_30",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	+        "class_name": "Concatenate",
	+        "config": {
	+          "name": "layer_32",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	+          "axis": 3
	+        },
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	             [
	-              "layer_29",
	-              0,
	-              0,
	-              {}
	+              null,
	+              128,
	+              128,
	+              128
	+            ],
	+            [
	+              null,
	+              128,
	+              128,
	+              128
	             ]
	           ]
	-        ]
	-      },
	-      {
	-        "name": "layer_31",
	-        "class_name": "Concatenate",
	-        "config": {
	-          "name": "layer_31",
	-          "trainable": true,
	-          "dtype": "float32",
	-          "axis": 3
	-        },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_7",
	-              0,
	-              0,
	-              {}
	-            ],
	-            [
	-              "layer_30",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        },
	         "name": "layer_32",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              [
	+                {
	+                  "class_name": "__keras_tensor__",
	+                  "config": {
	+                    "shape": [
	+                      null,
	+                      128,
	+                      128,
	+                      128
	+                    ],
	+                    "dtype": "layer_40",
	+                    "keras_history": [
	+                      "layer_8",
	+                      0,
	+                      0
	+                    ]
	+                  }
	+                },
	+                {
	+                  "class_name": "__keras_tensor__",
	+                  "config": {
	+                    "shape": [
	+                      null,
	+                      128,
	+                      128,
	+                      128
	+                    ],
	+                    "dtype": "layer_40",
	+                    "keras_history": [
	+                      "layer_31",
	+                      0,
	+                      0
	+                    ]
	+                  }
	+                }
	+              ]
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_32",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_33",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 128,
	           "kernel_size": [
	             3,
	@@ -1272,20 +2237,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1293,24 +2260,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_31",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            128,
	+            128,
	+            256
	+          ]
	+        },
	         "name": "layer_33",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    128,
	+                    128,
	+                    256
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_32",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_33",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_34",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 128,
	           "kernel_size": [
	             3,
	@@ -1326,20 +2324,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1347,24 +2347,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_32",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            128,
	+            128,
	+            128
	+          ]
	+        },
	         "name": "layer_34",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    128,
	+                    128,
	+                    128
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_33",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "UpSampling2D",
	         "config": {
	-          "name": "layer_34",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_35",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "size": [
	             2,
	             2
	@@ -1372,24 +2403,55 @@

	           "data_format": "channels_last",
	           "interpolation": "nearest"
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_33",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            128,
	+            128,
	+            128
	+          ]
	+        },
	         "name": "layer_35",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    128,
	+                    128,
	+                    128
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_34",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_35",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_36",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 64,
	           "kernel_size": [
	             2,
	@@ -1405,20 +2467,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1426,50 +2490,133 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            256,
	+            256,
	+            128
	+          ]
	+        },
	+        "name": "layer_36",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    256,
	+                    256,
	+                    128
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_35",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	+        "class_name": "Concatenate",
	+        "config": {
	+          "name": "layer_37",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	+          "axis": 3
	+        },
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	             [
	-              "layer_34",
	-              0,
	-              0,
	-              {}
	+              null,
	+              256,
	+              256,
	+              64
	+            ],
	+            [
	+              null,
	+              256,
	+              256,
	+              64
	             ]
	           ]
	-        ]
	-      },
	-      {
	-        "name": "layer_36",
	-        "class_name": "Concatenate",
	-        "config": {
	-          "name": "layer_36",
	-          "trainable": true,
	-          "dtype": "float32",
	-          "axis": 3
	-        },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_4",
	-              0,
	-              0,
	-              {}
	-            ],
	-            [
	-              "layer_35",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        },
	         "name": "layer_37",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              [
	+                {
	+                  "class_name": "__keras_tensor__",
	+                  "config": {
	+                    "shape": [
	+                      null,
	+                      256,
	+                      256,
	+                      64
	+                    ],
	+                    "dtype": "layer_40",
	+                    "keras_history": [
	+                      "layer_5",
	+                      0,
	+                      0
	+                    ]
	+                  }
	+                },
	+                {
	+                  "class_name": "__keras_tensor__",
	+                  "config": {
	+                    "shape": [
	+                      null,
	+                      256,
	+                      256,
	+                      64
	+                    ],
	+                    "dtype": "layer_40",
	+                    "keras_history": [
	+                      "layer_36",
	+                      0,
	+                      0
	+                    ]
	+                  }
	+                }
	+              ]
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_37",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_38",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 64,
	           "kernel_size": [
	             3,
	@@ -1485,20 +2632,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1506,24 +2655,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_36",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            256,
	+            256,
	+            128
	+          ]
	+        },
	         "name": "layer_38",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    256,
	+                    256,
	+                    128
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_37",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_38",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_39",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 64,
	           "kernel_size": [
	             3,
	@@ -1539,20 +2719,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "relu",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 2.0,
	-              "mode": "fan_in",
	-              "distribution": "normal",
	+            "module": "keras.initializers",
	+            "class_name": "HeNormal",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1560,24 +2742,55 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_37",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	-        ]
	-      },
	-      {
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            256,
	+            256,
	+            64
	+          ]
	+        },
	         "name": "layer_39",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    256,
	+                    256,
	+                    64
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_38",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	+        ]
	+      },
	+      {
	+        "module": "keras.layers",
	         "class_name": "Conv2D",
	         "config": {
	-          "name": "layer_39",
	-          "trainable": true,
	-          "dtype": "float32",
	+          "name": "layer_40",
	+          "trainable": true,
	+          "dtype": {
	+            "module": "keras",
	+            "class_name": "DTypePolicy",
	+            "config": {
	+              "name": "layer_40"
	+            },
	+            "registered_name": null
	+          },
	           "filters": 1,
	           "kernel_size": [
	             1,
	@@ -1593,20 +2806,22 @@

	             1,
	             1
	           ],
	+          "groups": 1,
	           "activation": "sigmoid",
	           "use_bias": true,
	           "kernel_initializer": {
	-            "class_name": "VarianceScaling",
	-            "config": {
	-              "scale": 1.0,
	-              "mode": "fan_avg",
	-              "distribution": "uniform",
	+            "module": "keras.initializers",
	+            "class_name": "GlorotUniform",
	+            "config": {
	               "seed": null
	-            }
	+            },
	+            "registered_name": null
	           },
	           "bias_initializer": {
	+            "module": "keras.initializers",
	             "class_name": "Zeros",
	-            "config": {}
	+            "config": {},
	+            "registered_name": null
	           },
	           "kernel_regularizer": null,
	           "bias_regularizer": null,
	@@ -1614,33 +2829,94 @@

	           "kernel_constraint": null,
	           "bias_constraint": null
	         },
	-        "inbound_nodes": [
	-          [
	-            [
	-              "layer_38",
	-              0,
	-              0,
	-              {}
	-            ]
	-          ]
	+        "registered_name": null,
	+        "build_config": {
	+          "input_shape": [
	+            null,
	+            256,
	+            256,
	+            64
	+          ]
	+        },
	+        "name": "layer_40",
	+        "inbound_nodes": [
	+          {
	+            "args": [
	+              {
	+                "class_name": "__keras_tensor__",
	+                "config": {
	+                  "shape": [
	+                    null,
	+                    256,
	+                    256,
	+                    64
	+                  ],
	+                  "dtype": "layer_40",
	+                  "keras_history": [
	+                    "layer_39",
	+                    0,
	+                    0
	+                  ]
	+                }
	+              }
	+            ],
	+            "kwargs": {}
	+          }
	         ]
	       }
	     ],
	     "input_layers": [
	-      [
	-        "layer_2",
	-        0,
	-        0
	-      ]
	+      "layer_2",
	+      0,
	+      0
	     ],
	     "output_layers": [
	-      [
	-        "layer_39",
	-        0,
	-        0
	-      ]
	+      "layer_40",
	+      0,
	+      0
	     ]
	   },
	-  "keras_version": "2.3.1",
	-  "backend": "tensorflow"
	+  "registered_name": "Functional",
	+  "build_config": {
	+    "input_shape": null
	+  },
	+  "compile_config": {
	+    "optimizer": {
	+      "module": null,
	+      "class_name": "_AdamCompat",
	+      "config": {
	+        "name": "layer_40",
	+        "learning_rate": 9.999999747378752e-05,
	+        "weight_decay": null,
	+        "clipnorm": null,
	+        "global_clipnorm": null,
	+        "clipvalue": null,
	+        "use_ema": false,
	+        "ema_momentum": 0.99,
	+        "ema_overwrite_frequency": null,
	+        "loss_scale_factor": null,
	+        "gradient_accumulation_steps": null,
	+        "beta_1": 0.9,
	+        "beta_2": 0.999,
	+        "epsilon": 1e-07,
	+        "amsgrad": false
	+      },
	+      "registered_name": "_AdamCompat"
	+    },
	+    "loss": "binary_crossentropy",
	+    "loss_weights": null,
	+    "metrics": [
	+      {
	+        "module": "builtins",
	+        "class_name": "function",
	+        "config": "iou",
	+        "registered_name": "function"
	+      },
	+      "accuracy"
	+    ],
	+    "weighted_metrics": null,
	+    "run_eagerly": false,
	+    "steps_per_execution": 1,
	+    "jit_compile": true
	+  }
	 }
---------------------------------------------------------------------------
AssertionError                            Traceback (most recent call last)
/tmp/ipykernel_714/481789217.py in <cell line: 0>()
     17 model = UNETFloorPhotoModel(data=None, name='no_rot_256_50', image_shape=(256, 256, 1))
     18 SESSION_PATH = '/content/checkpoint_no_rot_256_50/model_no_rot_256_50'
---> 19 model.load_session(SESSION_PATH)
     20 print('Sesion cargada OK')

/content/MLStructFP_benchmarks/MLStructFP_benchmarks/ml/model/core/_model.py in load_session(self, filename, override_model, override_callbacks, check_hash)
   2219                     for line in arch_diffl:
   2220                         self._print('\t' + line)
-> 2221                     assert model_equal, 'Model hash changed'
   2222                 else:
   2223                     _err = 'Hash model changed but the architectures are the same, session ' \

AssertionError: Model hash changed