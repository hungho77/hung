---
title: "SpinQuant: rotate before you round"
subtitle: "Why learned rotations tame activation outliers and make W4A4KV4 much less destructive than naive low-bit quantization."
date: 2026-08-12 17:00:00 +0700
permalink: /blog/spinquant-learned-rotations/
tags: [SpinQuant, Rotation, W4A4KV4]
---

Low-bit quantization is hardest when a few channels carry extreme values. One scale must cover those outliers, leaving the rest of the tensor with a coarse grid. SpinQuant changes the coordinate system before rounding so the same information is distributed more evenly.

The key is rotational invariance: an orthogonal rotation can be inserted into a transformer and canceled elsewhere, leaving full-precision outputs unchanged. Quantization is not rotation-invariant, however. Some equivalent coordinate systems are much easier to represent in four bits than others.

## Outliers are a basis problem

Suppose most activation channels have magnitude near one while a few exceed one hundred. Per-tensor four-bit activation quantization must accommodate the outliers, and ordinary channels collapse into only a handful of levels.

An orthogonal matrix preserves vector norms but redistributes energy across coordinates. After rotation, a concentrated outlier can become several moderate values. The model is mathematically equivalent before quantization, but the quantized approximation improves because the dynamic range is flatter.

Random rotations already help. SpinQuant’s important observation is that they do not help equally. Across 100 random rotations, the paper found up to a 13-point spread in zero-shot accuracy. That variance turns rotation selection into a learnable optimization problem.

## Four rotation locations

SpinQuant uses complementary transformations through the transformer:

- **Residual-stream rotation:** folded into adjacent weights, so it adds no standalone runtime operator.
- **Per-head attention rotation:** also mergeable into attention projection weights.
- **Online attention rotation:** a Hadamard transform reduces Q/K and KV-cache outliers around attention.
- **Online FFN rotation:** another Hadamard transform smooths intermediate MLP activations.

Mergeable rotations are paid at build time. Online rotations remain in the execution graph and need a fast Hadamard transform. The paper reports that optimized transforms keep the overhead small relative to the gains from lower-precision compute and memory.

## Learning on an orthogonal manifold

A normal optimizer can move a rotation matrix away from orthogonality, breaking the exact equivalence that makes the transformation safe. SpinQuant optimizes on the Stiefel manifold using a Cayley-transform update, which preserves orthogonality.

The learning objective runs fake quantization through calibration samples and adjusts the rotations to minimize reconstruction error. It does not retrain the full model weights. The result is a layer-aware coordinate system designed for the target quantization grid.

## Why W4A4KV4 is the interesting test

Four-bit weights alone are comparatively forgiving. Simultaneously quantizing weights, activations, and KV cache is much harder because activation outliers and recurrent cache error interact.

For LLaMA-2 7B, the paper reports:

| Method | Zero-shot average at W4A4KV4 |
|---|---:|
| FP16 | 66.9% |
| SmoothQuant | 39.0% |
| GPTQ | 36.8% |
| SpinQuant without online Hadamard | 56.0% |
| SpinQuant with Hadamard | 64.0% |

SpinQuant reduced the gap to FP16 to `2.9 points`. The paper also reports that learned rotations outperformed random rotation methods, especially on harder-to-quantize LLaMA-3 models.

The numbers should not be read as a universal ranking of every quantizer. They demonstrate that when activation and cache precision become the bottleneck, changing the basis can matter more than changing the rounding rule.

## Deployment implications

A rotation method is only useful when its runtime path is explicit:

```text
offline:
  learn rotations → fold mergeable transforms → quantize weights

online:
  load packed low-bit weights
  → run fused/fast Hadamard transforms where required
  → execute low-bit GEMM and cache operations
```

If the runtime lacks a fast transform, the quality gain may come with unacceptable latency. If it lacks W4A4 or KV4 kernels, a beautiful calibration result remains a simulated result.

## How I would use it in a VLA

The language or multimodal backbone is the first candidate. It contains the large transformer blocks and the activation outliers SpinQuant targets.

I would not immediately rotate and quantize the entire action path. A diffusion action head and final projection can amplify small numerical differences into control changes. My first experiment would keep those modules in FP16/BF16 while applying SpinQuant to the backbone, then measure:

- Visual-language task quality and action error.
- KV-cache memory and long-context stability.
- Policy latency at the real observation and action horizon.
- Closed-loop success and recovery behavior.
- Transform overhead on the target GPU.

SpinQuant is a useful reminder that quantization error is not an immutable property of the model. Sometimes the representation—not the information—is what makes four bits difficult.

_Read the original [SpinQuant paper](https://arxiv.org/abs/2405.16406)._
