---
title: "GPTQ: quantizing with second-order information"
subtitle: "How Hessian-aware error compensation, lazy updates, and Cholesky reformulation made 3–4 bit LLM quantization practical."
date: 2026-08-12 18:00:00 +0700
permalink: /blog/gptq-second-order-quantization/
lang: en
translation_url: /vi/blog/gptq-second-order-quantization/
tags: [GPTQ, INT4, LLM]
learning_order: 5
paper_year: "2022"
learning_stage: Weight quantization
visual_type: gptq
paper_url: "https://arxiv.org/abs/2210.17323"
visual_title: "Inside GPTQ: one column, one block, then one lazy update"
visual_alt: "Interactive redraw of GPTQ Figure 2 showing a Cholesky inverse Hessian beside a weight matrix with quantized columns, the active block, current column, and remaining updated weights"
visual_caption: "Following Figure 2 and Algorithm 1: GPTQ quantizes columns in a shared order, compensates recursively inside a B-column block, then updates every remaining column once with the accumulated block error."
visual_steps: ["Read the Hessian", "Quantize a column", "Update the block", "Apply the lazy update"]
---

Round-to-nearest treats every weight error as independent. GPTQ asks a better question: after quantizing one column across all output rows, how should the remaining full-precision columns move so the layer output stays close to the original?

That second-order view is what allowed GPTQ to quantize models as large as 175 billion parameters to three or four bits in a few GPU hours, with much smaller quality loss than naive rounding.

## The objective is layer output, not weight distance

For a linear layer with weight matrix `W` and calibration inputs `X`, GPTQ minimizes:

`||WX - ŴX||²`

Two weight matrices can be equally close in Euclidean distance and produce very different output error if the input channels have different statistics. The calibration activations encode that sensitivity.

The Hessian of the layer objective is proportional to:

`H = 2XXᵀ`

If a channel is frequently active or strongly correlated with others, an error in that column matters more. GPTQ quantizes columns sequentially, measures each quantization error, and uses inverse-Hessian information to compensate the remaining columns.

## Why the original second-order method did not scale

Optimal Brain Quantization provided the mathematical basis, but a direct implementation repeatedly updated a large inverse Hessian. For transformer dimensions in the thousands, that creates prohibitive cubic work and enormous memory traffic.

GPTQ introduced three practical changes.

### 1. Arbitrary-order insight

The method avoids expensive greedy weight selection and processes columns in a fixed order. This reduces the dominant complexity enough to make large layers tractable without giving up the error-compensation principle.

### 2. Lazy batch updates

Updating the full trailing matrix after every column produces many small bandwidth-heavy operations. GPTQ processes a block locally, accumulates the correction, then applies one large update to the remaining matrix.

The total arithmetic is similar, but the schedule changes from many vector operations to fewer GEMMs. That is a classic systems optimization: reorganize the same mathematics into operations the GPU can execute efficiently.

### 3. Cholesky reformulation

Repeated rank-one modifications of `H⁻¹` can accumulate numerical error and destroy positive definiteness. GPTQ adds dampening and computes a Cholesky factor once, then reads the required rows during quantization.

A common dampening choice is around one percent of the average Hessian diagonal. This stabilizes poorly observed directions without requiring a full retraining loop.

## Group-wise quantization

Per-row asymmetric quantization gives each output neuron its own scale and zero point. Group-wise quantization goes further by assigning scales to smaller blocks of input channels.

At group size 128, a four-bit weight has modest metadata overhead while adapting better to local ranges. Smaller groups generally reduce error but increase scale traffic and constrain kernel layout. The best group size is therefore another accuracy–runtime trade-off, not a free parameter.

## What the original results established

The paper reported that OPT-175B could be quantized on one A100 in roughly `4.2 hours`; BLOOM-176B took about `3.8 hours`. It also reported end-to-end speedups around `3.25×` on A100 and `4.5×` on A6000 with specialized kernels.

The important claim is not that every modern model will reproduce those exact numbers. It is that second-order PTQ can scale to very large models without gradient training, while retaining usable three- and four-bit accuracy.

GPTQ remains weight-only. Activations stay at FP16/BF16 in the common `W4A16` path. Runtime speed comes primarily from moving fewer weight bytes and using a kernel that can unpack and dequantize them efficiently.

## Calibration for a multimodal or VLA backbone

Generic text calibration is not enough when the transformer receives visual tokens or robot state. The Hessian is estimated from layer inputs; if those inputs do not represent deployment, the compensation is optimized for the wrong distribution.

For a VLA, I would collect calibration trajectories containing:

- Real image preprocessing and representative visual scenes.
- The actual instruction style and prompt template.
- Robot state tokens and temporal context.
- Both successful trajectories and difficult edge cases.
- The same action-token or diffusion conditioning path used at runtime.

I would quantize the language/VLM backbone block by block, allowing later blocks to observe activations already affected by earlier quantized blocks. The final action projection stays in higher precision until closed-loop validation proves otherwise.

## GPTQ in the method landscape

- **RTN** is simpler but ignores input sensitivity and can fail badly below eight bits.
- **AWQ** uses activation statistics to protect salient weight channels with scaling.
- **SmoothQuant** targets activation outliers and a W8A8 execution path.
- **SpinQuant and ParoQuant** transform the representation with rotations before quantization.

These are not interchangeable labels. They optimize different error sources and rely on different runtime paths.

GPTQ’s enduring lesson is broader than one algorithm: compression improves when the calibration data tells us which errors the deployed model can actually tolerate.

_Read the original [GPTQ paper](https://arxiv.org/abs/2210.17323) and [reference implementation](https://github.com/IST-DASLab/gptq)._
