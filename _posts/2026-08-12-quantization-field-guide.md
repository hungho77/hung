---
title: "Quantization is a systems decision"
subtitle: "A practical field guide to INT8, INT4, FP8, NVFP4, and the measurements that decide whether lower precision is actually better."
date: 2026-08-12 21:00:00 +0700
permalink: /blog/quantization-field-guide/
lang: en
translation_url: /vi/blog/quantization-field-guide/
tags: [Quantization, Edge AI, VLA]
learning_order: 1
paper_year: "Start here"
learning_stage: Orientation
visual_type: quant-map
paper_url: "https://docs.nvidia.com/deeplearning/tensorrt/10.x.x/inference-library/work-quantized-types.html"
visual_title: "Real tensor → codebook → Q/DQ contract → native kernel"
visual_alt: "Interactive TensorRT quantization map comparing integer and floating-point codebooks, explicit Q/DQ nodes, and the requirements for native low-precision execution"
visual_caption: "A dtype names only part of the contract. Select each block to follow values into a codebook, compare scale schemes, inspect explicit Q/DQ placement, and test whether a native kernel turns compression into latency."
visual_steps: ["Map real values", "Interpret stored codes", "Compare formats", "Read Q/DQ", "Verify the kernel"]
---

Quantization is usually introduced as a conversion from floating-point values to fewer bits. That definition is mathematically correct and operationally incomplete.

In deployment, quantization is a contract between five things: the model, calibration data, serialized artifact, runtime, and hardware kernel. A checkpoint can be four times smaller and still run no faster. A benchmark can show lower perplexity and still produce worse robot actions. A GPU can advertise FP4 while the selected operator silently falls back to a higher-precision path.

The useful question is therefore not “Which bit width is best?” It is:

> Which representation removes the current bottleneck while keeping the behavior that matters?

## The basic mapping

For symmetric integer quantization, a real value `x` is mapped using a scale `s`:

`q = clamp(round(x / s), q_min, q_max)`

`x̂ = q × s`

The error comes from rounding values onto a discrete grid and clipping values outside the representable range. A larger range protects outliers but gives ordinary values coarser steps. A smaller range improves resolution but clips more aggressively.

Asymmetric quantization adds a zero point. It can represent shifted distributions more efficiently, but the extra correction complicates kernels. That complication is not theoretical: an incorrect asymmetric zero-point transformation was one of the defects I found while debugging TensorRT Edge-LLM.

## Granularity is as important as dtype

The scale can be shared by an entire tensor, one channel, one token, or a small block.

| Granularity | Strength | Cost |
|---|---|---|
| Per-tensor | Minimal metadata and simple kernels | One outlier can waste most quantization levels |
| Per-channel | Strong fit for linear or convolution weights | More scale values and layout constraints |
| Per-token | Adapts to changing activation ranges | Scales must be calculated at runtime |
| Per-block | Balances local fidelity and metadata | Requires a compatible packed layout and kernel |

This is why “4-bit” does not describe a complete format. Group size, scale dtype, symmetry, packing order, and excluded layers can change both model size and accuracy.

## Weight-only and weight-plus-activation solve different problems

`W4A16` stores weights in four bits while keeping activations at FP16 or BF16. It is a strong fit for batch-one autoregressive decoding, where every token streams a large weight matrix and memory bandwidth dominates. The runtime still has to unpack or dequantize weights unless it has a more specialized execution path.

`W8A8`, FP8, and FP4 paths also reduce activation traffic and can use lower-precision matrix engines. They become attractive for prefill, larger batches, and compute-heavy transformer blocks. They are harder to calibrate because activation outliers are dynamic and model-dependent.

The practical distinction is:

- Use **weight-only** methods when model capacity and decode bandwidth are the problem.
- Use **weight-and-activation** methods when the runtime can execute the lower precision directly and compute or activation traffic dominates.

## A hardware-aware starting point

I use hardware support to narrow the search space before calibrating anything.

| Target | First serious candidates |
|---|---|
| Jetson Orin / Ampere | FP16 baseline, TensorRT INT8, W4A16 only with a proven kernel |
| H100 / H200 | FP8 for transformer compute, weight-only INT4 where decode is bandwidth-bound |
| Blackwell | FP8 plus NVFP4 or MXFP4 experiments with explicit block scaling |
| Qualcomm / ARM NPU | INT8 through QNN/SNPE/ONNX Runtime, with operator-coverage checks |
| CPU | Backend-specific dynamic INT8 or weight-only packing, measured at batch one |

Current TensorRT documentation describes INT4 as weight-only with per-block scales, while NVFP4 uses FP4 values and block scaling. Those capabilities matter only when the graph contains the right quantize/dequantize semantics and the target has a supported kernel.

## Quantizing a VLA module by module

A Vision-Language-Action policy is not one homogeneous transformer. It contains a vision encoder, language or multimodal backbone, projector, state/action encoders, and often a diffusion or autoregressive action head.

My default order is:

1. Establish an FP16 or BF16 end-to-end baseline on the target device.
2. Quantize the largest language/VLM backbone first.
3. Validate hidden-state drift, action error, and end-to-end latency.
4. Quantize the vision encoder separately with representative camera data.
5. Keep the action head and final action projection in higher precision until closed-loop behavior is stable.
6. Use mixed precision or QAT only where PTQ fails a measured quality gate.

Calibration data must reproduce the deployment distribution: camera preprocessing, instructions, robot state, lighting, object pose, easy trajectories, and failure-prone cases. Random web images are not a calibration set for a physical policy.

## The regression gate

I do not consider a quantized VLA ready because it loads and produces finite numbers. It should pass four levels of checks:

- **Artifact:** correct dtype metadata, scale shapes, packing, and deterministic loading.
- **Model:** layer drift, action L1/L2 error, logit or distribution change.
- **System:** P50/P99 latency, memory, power, thermal stability, and fallback rate.
- **Robot:** success rate, collision rate, recovery, smoothness, and safety-stop behavior.

Quantization is successful only when it improves the constrained system—not when the filename contains `int4`.

## A compact decision tree

```text
Model does not fit?
  → Start with weight-only INT4/FP4 on the largest backbone.

Decode is bandwidth-bound?
  → Verify a packed low-bit kernel on the target device.

Prefill or batched compute dominates?
  → Evaluate INT8/FP8/NVFP4 activation paths.

Action quality moves?
  → Restore sensitive heads to FP16/BF16, improve calibration, or use QAT.

Latency does not improve?
  → Inspect kernel selection, graph fallbacks, and dequantization overhead.
```

The bit width is the visible part. The real engineering lives in everything around it.

_References: [NVIDIA TensorRT quantized types](https://docs.nvidia.com/deeplearning/tensorrt/10.x.x/inference-library/work-quantized-types.html), [TensorRT quantization schemes](https://docs.nvidia.com/deeplearning/tensorrt/latest/inference-library/quantized-types-schemes.html), and [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html)._
