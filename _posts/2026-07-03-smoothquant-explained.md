---
title: "SmoothQuant: moving the hard part offline"
subtitle: "Why activation outliers break naive W8A8 quantization, and how equivalent scaling restores an efficient INT8 path."
date: 2026-07-03
permalink: /blog/smoothquant-explained/
tags: [Quantization, LLM, W8A8]
---

Weight-only quantization reduces model size, but it does not unlock a fully INT8 matrix-multiplication path. SmoothQuant targets **W8A8**: INT8 weights and INT8 activations, so Tensor Cores can accelerate both prefill and batched inference while activation memory also shrinks.

The difficulty is that LLM weights are usually easy to quantize and activations are not.

## Why activation outliers break naive INT8

Uniform symmetric INT8 quantization chooses a scale from the largest absolute value in a tensor. If one activation channel reaches 100 while most channels stay near 1, the outlier determines the step size for everyone.

Normal channels then use only a few effective quantization levels. Small differences collapse to zero or the same integer, destroying information even though INT8 theoretically provides 256 values.

These outliers are also structured. They tend to appear in consistent hidden channels across many tokens. Per-token scaling therefore does not remove the problem: every token still contains the same outlier dimensions. Per-input-channel activation scaling would help numerically, but it is incompatible with an efficient standard INT8 GEMM because that scale sits on the reduction dimension.

## The equivalent transformation

For a linear layer `Y = XW`, SmoothQuant introduces a per-input-channel scale `s`:

`Y = (X / s) · (sW)`

Before quantization, the output is exactly unchanged. Channels with large activation outliers are divided by a larger scale, flattening the activation range. The corresponding weight rows are multiplied by the same scale.

In other words, SmoothQuant migrates quantization difficulty from activations into weights. This works because weights begin with a much more quantization-friendly distribution and can absorb some additional range.

The scaling is computed once from a small calibration set and folded into nearby model parameters. Runtime then sees regular INT8 operations rather than a branchy mixed-precision decomposition.

## Alpha controls the trade-off

The hyperparameter `α` determines how aggressively difficulty moves from activations to weights.

- A lower `α` protects weights and leaves more activation variation.
- A higher `α` smooths activations more aggressively but makes weights harder to quantize.

There is no universal best value. Architecture, layer type, and calibration data all matter. For multimodal models, calibration must include representative images; text-only calibration can produce incorrect scales in the visual pathway.

## Why this is useful in production

SmoothQuant avoids the runtime overhead of methods that detect outliers, split the matrix multiplication into INT8 and FP16 paths, then combine the results. Its transformation is offline, so serving keeps a single hardware-friendly INT8 path.

The original experiments showed near-FP16 quality across OPT, BLOOM, GLM, LLaMA, Falcon, Mistral, and Mixtral families. Production implementations reported roughly 1.3–1.5× speedups in several tested settings and approximately half the weight memory. For very large models, fitting on half as many GPUs can be more valuable than a small latency improvement.

## How I apply the idea to edge VLA

For a VLA, I would not quantize every module identically. SmoothQuant is attractive for a transformer backbone with INT8 Tensor Core support. A diffusion action head may prefer weight-only AWQ if memory bandwidth dominates. The vision-language bridge deserves its own calibration and error checks.

Evaluation should include action-level behavior—not only perplexity. I look for action MAE against the FP16 baseline, maximum spikes over time, closed-loop task success, and end-to-end latency under the real sensor pipeline.

SmoothQuant’s lasting lesson is architectural: move expensive complexity out of the runtime path whenever an algebraically equivalent offline transformation can do the same job.

_Read the original [SmoothQuant paper](https://arxiv.org/abs/2211.10438)._
