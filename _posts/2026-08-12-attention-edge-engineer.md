---
title: "Attention, viewed from the edge"
subtitle: "The Transformer shape flow, why training parallelizes, and where autoregressive inference becomes a memory and latency problem."
date: 2026-08-12 19:00:00 +0700
permalink: /blog/attention-from-the-edge/
lang: en
translation_url: /vi/blog/attention-from-the-edge/
tags: [Transformer, Attention, Edge AI]
learning_order: 2
paper_year: "2017"
learning_stage: Foundation
visual_type: attention
paper_url: "https://arxiv.org/abs/1706.03762"
visual_title: "Scaled dot-product attention, then multi-head"
visual_alt: "Interactive redraw of Transformer Figure 2 showing Q K V projections, scaled masked scores, row softmax, weighted value mixing, and multi-head concatenation"
visual_caption: "Following Figure 2 and Equation 1: project Q/K/V, scale and mask QKᵀ, normalize each row, mix V, then concatenate independent heads through Wᴼ."
visual_steps: ["Project Q · K · V", "Scale and mask scores", "Normalize", "Mix values", "Join heads"]
---

The most important systems consequence of *Attention Is All You Need* is not that recurrence disappeared. It is that sequence modeling became dominated by matrix operations that accelerators can parallelize—until autoregressive inference puts a sequential loop back around the model.

Understanding that transition helps explain most modern optimization work: FlashAttention, KV caching, quantization, speculative decoding, and the performance behavior of VLM and VLA backbones.

## The shape flow

For hidden states `X ∈ R^(n × d_model)`, learned projections produce queries, keys, and values:

`Q = XW_Q`, `K = XW_K`, `V = XW_V`

Scaled dot-product attention is:

`Attention(Q, K, V) = softmax(QKᵀ / √d_k)V`

The `QKᵀ` matrix contains a compatibility score for every query-key pair. Softmax turns each row into weights, and multiplication by `V` produces a weighted sum of value vectors.

The division by `√d_k` prevents dot products from growing with the head dimension. Without it, softmax enters a saturated regime where probabilities become extremely sharp and gradients become poorly conditioned.

Multi-head attention repeats this process in smaller learned subspaces, concatenates the head outputs, then projects them back to `d_model`. The benefit is not merely more capacity: different heads can express different relationships without forcing one attention distribution to carry every role.

## Why training became parallel

During teacher-forced training, the target sequence is already known. A causal mask prevents each position from reading future tokens, but all positions can still be evaluated in one pass.

That turns sequence processing into large GEMMs and batched attention operations. The original Transformer Big reached `28.4 BLEU` on WMT 2014 English–German and `41.8 BLEU` on English–French after training for 3.5 days on eight P100 GPUs.

Inference changes the schedule:

```text
prefill:  process the prompt in parallel
decode:   generate token 1
          append token 1
          generate token 2
          append token 2
          ...
```

The model is parallel inside each decode step, but token steps remain sequential. At batch one, linear layers often resemble matrix-vector operations. Their arithmetic intensity is low, so reading weights and KV-cache data can dominate the work.

## KV cache trades compute for memory traffic

Without a cache, each decode step recomputes keys and values for the entire prefix. KV caching stores previous keys and values so only the new token’s projections are calculated.

This removes repeated compute but creates a growing memory structure. Cache size scales with layers, sequence length, KV heads, head dimension, and dtype. Long-context inference can therefore become limited by cache capacity or bandwidth even after model weights are compressed.

The optimization question shifts with the phase:

| Phase | Common bottleneck | Useful directions |
|---|---|---|
| Vision or text prefill | Compute and attention memory | FP8/INT8, fused kernels, FlashAttention, token reduction |
| Batch-one decode | Weight and cache bandwidth | INT4/FP4 weights, cache quantization, fused decoding kernels |
| Long context | Quadratic attention and KV capacity | Efficient attention, fewer tokens, grouped-query attention, lower-bit cache |

## What this means for VLM and VLA

A VLM turns images into additional tokens. Higher camera resolution or more views can increase prefill cost before the first action is produced. A VLA then adds an action generator that may be autoregressive, diffusion-based, or flow-matching.

The complete loop is closer to:

```text
camera → vision tokens → multimodal attention → action generation → control
```

Each stage can prefer a different optimization. The vision encoder may be activation- or memory-bound. The language backbone may have expensive prefill followed by bandwidth-bound decode. The action head may be small but numerically sensitive.

This is why a model-wide “convert everything to INT4” recipe is rarely correct. The Transformer exposes many equivalent mathematical transformations, but deployment quality depends on where those transformations land in the graph and whether the runtime has the right kernels.

## My practical optimization map

1. Measure visual token count, prompt length, and action horizon separately.
2. Profile prefill and decode as distinct workloads.
3. Track weight memory and KV-cache memory independently.
4. Quantize the large backbone before the final action path.
5. Validate end-to-end control-loop latency, not only tokens per second.
6. Keep dynamic shapes and fallback operators visible in the profiler.

The Transformer made sequence models accelerator-friendly. Edge engineering is the work of preserving that advantage when memory, power, and a real-time control loop become part of the architecture.

_Read the original paper: [Attention Is All You Need](https://arxiv.org/abs/1706.03762)._
