---
title: "LUT-GEMM: low-bit weights without reconstructing them"
subtitle: "How binary-coded weights become lookup-table indices—and when that changes decode latency rather than only checkpoint size."
date: 2026-08-12 15:00:00 +0700
permalink: /blog/lut-gemm-no-dequantization/
tags: [CUDA, LUT-GEMM, Kernel]
learning_order: 7
paper_year: "2022"
learning_stage: Kernel design
visual_type: lut
paper_url: "https://arxiv.org/abs/2206.09557"
visual_title: "Use packed bits as lookup addresses"
visual_alt: "Animated LUT GEMM diagram using packed low bit weights as indices into a lookup table before accumulation"
visual_caption: "Instead of reconstructing every low-bit weight, LUT-GEMM uses its binary code as an address and accumulates precomputed products."
visual_steps: ["Read packed bits", "Lookup products", "Accumulate directly"]
---

Most weight-only quantization follows a compromise: store weights in three or four bits, then unpack and dequantize them inside the matrix kernel before multiplying by FP16 activations.

That reduces memory traffic, which is valuable for autoregressive decoding, but it still pays a reconstruction tax. LUT-GEMM asks whether the low-bit representation can participate in the computation directly.

Its answer is to turn packed weight bits into lookup-table addresses.

## Why decoding is the right workload

During prompt prefill, a weight matrix is reused across many token rows. Arithmetic intensity can be high enough for tensor-core GEMMs to work efficiently.

At batch-one decode, each linear layer is closer to a large matrix-vector product:

`y = Wx`

Every new token streams nearly the full weight matrix while doing relatively little work per byte. The operation is often memory-bandwidth-bound. Moving weights from FP16 to INT4 can reduce raw weight traffic by roughly four times, but conventional W4A16 kernels still unpack nibbles, apply scales and zero points, and form higher-precision values before accumulation.

LUT-GEMM replaces that sequence with a representation designed for lookup and accumulation.

## Binary-Coding Quantization

Binary-Coding Quantization approximates a weight vector as a weighted sum of binary vectors:

`ŵ = Σ α_i b_i`, where `b_i ∈ {-1, +1}^n`

The dot product becomes:

`ŵ · x = Σ α_i (b_i · x)`

A binary dot product contains only signed sums of activation values. If an activation chunk has length `μ`, there are only `2^μ` possible sign patterns.

For `μ = 3`, every binary weight chunk selects one of eight sums:

```text
000 → -x0 -x1 -x2
001 → +x0 -x1 -x2
010 → -x0 +x1 -x2
...
111 → +x0 +x1 +x2
```

Build those sums once, store them in a lookup table, and reuse them for many output rows.

With `μ = 8`, one packed byte naturally represents one of 256 patterns. The weight byte is no longer unpacked into eight FP16 values. It is used directly as `LUT[key]`.

## The compute transformation

For a binary matrix `B` and activation vector `x`, split `x` into chunks. For each chunk `c`, precompute:

`LUT_c[k] = dot(pattern(k), x_c)`

Then an output row becomes:

`(Bx)_r = Σ_c LUT_c[key(r, c)]`

For `q` binary planes, repeat the lookup for each plane and combine results with learned scales. Extended BCQ also supports an additive bias term, which can represent asymmetric uniform quantization without reconstructing every individual weight.

This last point makes LUT-GEMM compatible in principle with codes produced by methods such as GPTQ or AWQ: uniform low-bit values can be mapped into binary planes plus scales and a correction term.

## Complexity is not latency

The approximate compute ratio relative to dense matvec is `q / μ` once lookup-table construction is amortized over enough output rows. With three bit planes and `μ = 8`, the idealized computational reduction is about `8 / 3 = 2.67×`.

Wall-clock latency also includes:

- Activation loads and table construction.
- Shared-memory capacity and bank conflicts.
- Packed-weight and scale loads.
- Synchronization and output reduction.
- Register pressure and occupancy.
- Kernel-launch and small-matrix overhead.

A larger `μ` reduces the number of lookups but doubles table size for every additional bit. The best configuration is a hardware and shape decision.

## What the paper measured

For the first FFN projection of OPT-175B on an A100, the paper reports:

| Kernel | Precision | Latency | Speedup vs FP16 cuBLAS |
|---|---|---:|---:|
| cuBLAS | FP16 | 0.7256 ms | 1.00× |
| AWQ | INT4 / FP16 | 0.3238 ms | 2.24× |
| LUT-GEMM | INT4 / FP16 | 0.2688 ms | 2.70× |
| LUT-GEMM | INT3 / FP16 | 0.2250 ms | 3.22× |

The paper’s end-to-end OPT-175B experiment reports a `2.1×` token-generation latency improvement for three-bit LUT-GEMM on one GPU relative to OPTQ.

These results belong to specific large matrix shapes on A100. They are evidence that avoiding dequantization can matter, not a guarantee for every layer or edge device.

## Group size changes the memory equation

Smaller quantization groups use more local scales and usually improve accuracy. They also add scale metadata and more complicated indexing.

For FP16 scales, the rough relative scale overhead is `16 / g`, where `g` is the group size:

| Group size | Approximate scale overhead |
|---:|---:|
| 32 | 50% |
| 64 | 25% |
| 128 | 12.5% |
| 256 | 6.25% |

This is why bit width alone is an incomplete compression metric. A three-bit format with very small groups may not save much more memory than a four-bit format with larger groups.

## A production implementation path

I would separate the work into four gates:

1. **Correctness:** reproduce BCQ conversion and LUT matvec against a dense reference.
2. **Microbenchmark:** compare custom CUDA against cuBLAS and an established W4A16 kernel across real VLA backbone shapes.
3. **Kernel tuning:** optimize packing, shared-memory layout, vectorized loads, table generation, and occupancy.
4. **End to end:** integrate through an ONNX/TensorRT plugin and measure policy latency, memory, power, and action quality.

The strongest candidates are large decoder linear layers at low batch size. Small projections, convolution-heavy vision encoders, and large-batch prefill may not amortize LUT construction or may already use highly efficient tensor-core paths.

LUT-GEMM is interesting because it moves quantization from storage into algorithm design. Instead of asking how quickly a kernel can undo compression, it asks how to compute in the compressed representation itself.

_Read the original [LUT-GEMM paper](https://arxiv.org/abs/2206.09557) and [reference CUDA implementation](https://github.com/naver-aics/lut-gemm)._
