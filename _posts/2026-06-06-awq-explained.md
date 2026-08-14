---
title: "AWQ: protect what activations reveal"
subtitle: "An engineering explanation of salient channels, INT4 weight-only quantization, and why the runtime matters."
date: 2026-06-06
permalink: /blog/awq-explained/
tags: [Quantization, LLM, INT4]
learning_order: 6
paper_year: "2023"
learning_stage: Salience aware
visual_type: awq
paper_url: "https://arxiv.org/abs/2306.00978"
visual_title: "From activation saliency to regular W4A16"
visual_alt: "Interactive AWQ diagram showing activation statistics, channel saliency, alpha search, equivalent scaling, and uniform INT4 weights"
visual_caption: "AWQ uses activation magnitude to derive per-input-channel scales, searches their strength, applies an equivalent transform, then quantizes every scaled weight in one regular low-bit format."
visual_steps: ["Observe activations", "Search scaling", "Quantize all weights"]
---

AWQ is a post-training, weight-only quantization method designed to compress language and vision-language models to INT4 or INT3 without retraining. Its central observation is that weights do not matter equally—and activation statistics tell us which channels are most sensitive.

## Why weight-only quantization fits decoding

Autoregressive generation at small batch sizes is often memory-bandwidth-bound. For every new token, the accelerator must read a large weight matrix while the activation vector is comparatively small.

Reducing weights from FP16 to INT4 cuts their raw storage by roughly four times. That reduces the dominant memory traffic while keeping activations in FP16, avoiding the harder activation-quantization problem.

This is the `W4A16` pattern: 4-bit weights, 16-bit activations.

## Salient weights are activation-aware

Suppose a quantized weight has an error `e`. Its contribution to output error is approximately `e × x`, where `x` is the activation that uses it. The same weight error matters far more when its channel has a large activation magnitude.

That is why ranking weights only by their own magnitude is incomplete. AWQ collects a small calibration set, records activation statistics, and identifies channels where quantization error would be amplified.

The paper first tests this hypothesis by keeping only 0.1–1% of activation-selected weight channels in FP16. That experiment sharply improves perplexity, but it is evidence for the saliency signal—not the final AWQ format. Storing those exceptions in FP16 would create an irregular mixed-precision layout that is difficult to accelerate.

## Scaling instead of mixed precision

AWQ protects an important input channel by scaling its matching weight column up before quantization and scaling that activation channel down. For a linear layer `Y = WX`, define:

`W′ = W · diag(s)` and `X′ = diag(s)⁻¹ · X`

The transformations cancel before quantization: `W′X′ = WX`. AWQ changes the ranges seen by the quantizer, not the original full-precision function.

After quantization, a scaled salient weight generally has lower effective rounding error. If the group quantization step changes little (`Δ′ ≈ Δ`), the paper’s analysis gives an error ratio of approximately `1/s`. The full matrix can still be packed into one uniform INT4 or INT3 representation.

The scale cannot grow without limit. An oversized channel can expand the range of its quantization group and make every other weight coarser. AWQ restricts the search to `s = sX^α`, where `sX` is the average activation magnitude per input channel, then grid-searches `α ∈ [0, 1]` to minimize layer-output error after quantization. This needs neither backpropagation nor weight reconstruction.

## Why the engine is part of the method

Compression alone does not guarantee speed. Packed 4-bit weights must be loaded, unpacked, dequantized, and multiplied efficiently. TinyChat—the runtime paired with the AWQ work—turns lower memory traffic into actual latency improvements through optimized kernels and operator fusion.

This is a useful discipline for any quantization project: report model size, quality, and measured runtime. A theoretically smaller model that falls back to slow kernels is not an optimization.

## AWQ versus SmoothQuant

AWQ is strongest when decoding is memory-bound. It reduces weight traffic and leaves activations in FP16.

SmoothQuant targets W8A8 and is attractive when prefill or batched inference is compute-bound, or when activation and KV-cache memory matter. The methods solve different bottlenecks and can even be applied to different modules in the same system.

For edge VLA deployment, I would consider AWQ for large memory-bound language or action-decoder blocks, while preserving sensitive visual and control layers at a higher precision. The right answer should come from layerwise error analysis and a closed-loop task evaluation—not from bit width alone.

_Read the original [AWQ paper](https://arxiv.org/abs/2306.00978)._
