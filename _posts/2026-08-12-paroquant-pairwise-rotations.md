---
title: "ParoQuant: pairwise rotations that survive deployment"
subtitle: "From learned Givens rotations to an INT4 TensorRT pipeline—and what my reduced-calibration experiment actually showed."
date: 2026-08-12 16:00:00 +0700
permalink: /blog/paroquant-pairwise-rotations/
tags: [ParoQuant, TensorRT, Experiment]
learning_order: 9
paper_year: "2025"
learning_stage: Efficient rotation
---

Rotation-based quantization improves accuracy by spreading outliers across channels. The deployment problem is that a dense learned rotation can cost enough to erase the latency saved by INT4.

ParoQuant narrows the transformation to independent channel pairs. Each pair uses a learned Givens rotation plus channel-wise scaling, giving the quantizer a better local distribution while preserving enough structure for a lightweight GPU implementation.

I ported the method, packed real INT4 weights, built TensorRT plugins, and ran a reduced-calibration experiment on Qwen2.5-1.5B. This note separates the paper’s claim from my own evidence.

## A rotation small enough to execute

For channels `i` and `j`, a Givens rotation is:

```text
[x'i]   [ cos θ   sin θ] [xi]
[x'j] = [-sin θ   cos θ] [xj]
```

It preserves the pair’s norm while redistributing magnitude. If one channel is an outlier and the other is small, an appropriate angle makes their ranges more balanced before group-wise INT4 quantization.

ParoQuant selects independent pairs so no channel appears in two rotations within the same stage. All pairs can therefore run in parallel without write conflicts. Multiple stages increase expressiveness while retaining a sparse, predictable dataflow.

Channel-wise scaling follows the rotations to further equalize the local dynamic range. During build time, weight transformations are folded and quantized. During runtime, the inverse activation-side transformation is executed immediately before the packed INT4 linear operation.

## Why it differs from a dense learned rotation

A dense `d × d` matrix mixes every channel with every other channel. It can be expressive and expensive. Pairwise rotations use only two-channel operations and a compact set of angles.

This co-design matters because quantization quality and inference speed are not separable. A method that wins in fake-quant evaluation but requires a large FP16 matrix multiply before every INT4 GEMM is not an efficient inference method.

The ParoQuant paper reports an average `2.4%` accuracy improvement over AWQ on reasoning tasks with less than `10%` runtime overhead. The motivation is especially strong for reasoning models, where small per-token errors can accumulate through a long chain of thought.

## My reduced-calibration experiment

I validated Qwen2.5-1.5B with `K=8` rotation stages. Because of hardware limits, my recipe used 16 training samples and four validation samples at sequence length 256. The paper’s full recipe uses substantially more data and longer sequences, so this is a mechanism check—not a fair reproduction of its headline benchmark.

| Method | WikiText-2 PPL | C4 PPL |
|---|---:|---:|
| FP16 baseline | 10.80 | 16.55 |
| ParoQuant, K=8 | 11.39 | 17.33 |
| Delta | +0.59 | +0.78 |

Reducing the depth to `K=2` produced a worse WikiText-2 delta of `+1.29`, matching the paper’s qualitative ablation: additional independent rotation stages improve the transformed representation up to the tested range.

I also compared against an earlier AWQ run at INT4 and group size 128:

| Method | Δ WikiText-2 PPL | Δ C4 PPL | Calibration recipe |
|---|---:|---:|---|
| AWQ | +0.87 | +1.19 | 128 samples, length 512 |
| ParoQuant | +0.59 | +0.78 | 16 samples, length 256 |

ParoQuant looked better despite using less calibration data. The recipes are different, so I treat that as an encouraging signal—not a ranking. A controlled comparison must use the same samples, sequence lengths, evaluator, seeds, and kernel path.

## From fake quantization to a real TensorRT engine

The deployment pipeline quantized 196 linear layers and exported one rotation operator plus one group-wise INT4 GEMM operator for each layer.

```text
calibrate and learn pairs
  → transform and pack INT4 weights
  → export ONNX rotation + INT4 GEMM nodes
  → resolve both nodes as TensorRT plugins
  → build engine
  → run autoregressive generation
```

The engine built successfully and generated coherent text. On the same setup, decode reached `207.1 tok/s`, compared with `214.8 tok/s` for AWQ and `195.8 tok/s` for GPTQ. The comparison is most useful as an overhead check: the pairwise rotation did not destroy the benefit of the low-bit path.

## What is proven—and what is next

The current experiment establishes:

- The learned pairwise transformation behaves in the expected direction as `K` changes.
- Real INT4 packing and the rotation/GEMM plugin chain work end to end.
- Runtime overhead is small enough to preserve competitive decode throughput.

It does not yet establish that ParoQuant improves a deployed VLA policy. The next step is to integrate it into the language/VLM backbone of a real policy, keep action-sensitive modules at higher precision, and evaluate closed-loop task success.

That distinction is important. A coherent language sample proves the engine is not numerically broken. It does not prove that a robot will execute stable actions.

_Read the original [ParoQuant paper](https://arxiv.org/abs/2511.10645) and [reference implementation](https://github.com/z-lab/paroquant)._
