---
title: "INT8 without folklore"
subtitle: "Range mapping, calibration, partial quantization, and a production workflow for models that must remain accurate at the edge."
date: 2026-08-12 20:00:00 +0700
permalink: /blog/integer-quantization-int8/
tags: [INT8, Calibration, Edge AI]
learning_order: 3
paper_year: "2020"
learning_stage: Foundation
visual_type: int8
paper_url: "https://arxiv.org/abs/2004.09602"
visual_title: "Histogram → range → integer grid → recovery"
visual_alt: "Interactive INT8 workflow showing calibration histograms, clipping policies, affine mapping, scale granularity, and accuracy recovery"
visual_caption: "Following the paper’s PTQ workflow: measure representative activations, choose the clipping–resolution trade-off, map to signed INT8, select scale granularity, then escalate only where sensitivity requires it."
visual_steps: ["Collect a histogram", "Choose a range", "Map to INT8", "Choose scales", "Recover accuracy"]
---

INT8 is mature enough to look easy. Pick a range, map floating-point values into 256 levels, and let the accelerator run faster. Most failed deployments happen in the details hidden by that sentence.

The paper *Integer Quantization for Deep Learning Inference: Principles and Empirical Evaluation* is valuable because it treats quantization as a workflow rather than a single formula. Across vision, speech, and language models, the authors kept accuracy within one percent of floating-point baselines by combining sensible scale choices, calibration, partial quantization, and QAT when needed.

## The range controls both errors

An affine quantizer maps a real interval `[α, β]` to an integer interval `[q_min, q_max]` using a scale and zero point. Two errors compete:

- **Rounding error:** a wide range produces large steps, so nearby values collapse together.
- **Clipping error:** a narrow range gives finer steps but saturates the tails.

Max calibration avoids clipping by covering the largest observed value. It is simple and fragile when a single outlier determines the scale. Percentile calibration intentionally discards a tiny tail—such as the top `0.01%`—to improve resolution for the majority of values. Entropy or KL calibration searches for a range whose quantized distribution best preserves the original information.

There is no universally correct calibrator. The right choice is empirical and often layer-specific.

## Weights and activations want different treatment

Weights are fixed after training and usually benefit from per-output-channel scales. Batch-normalization folding can create very different ranges across channels, making one global weight scale particularly wasteful.

Activations change with each input. Per-tensor activation scales are easier for high-throughput kernels, but outliers can make them inaccurate. This is where calibration quality, SmoothQuant-style transformations, or selective higher precision becomes important.

A useful initial recipe is:

| Component | Starting choice |
|---|---|
| Conv / Linear weights | Symmetric INT8, per-channel or per-column |
| Activations | Symmetric INT8, per-tensor, calibrated |
| Numerically sensitive operations | FP16/BF16 |
| Final regression or action projection | FP16 first |

## PTQ before QAT

Post-training quantization is cheap, reproducible, and should be the first attempt. Collect representative activations, derive scales, quantize compute-heavy operators, then measure accuracy and runtime.

If full INT8 misses the target, do not immediately retrain the entire model. Run sensitivity analysis:

1. Quantize one layer or block at a time.
2. Measure the quality change.
3. Rank layers by sensitivity.
4. Restore the smallest high-impact set to FP16.
5. Rebuild and benchmark the mixed-precision graph.

This frames partial quantization as an optimization problem: maximize INT8 coverage subject to an allowed quality loss.

QAT is the next step when PTQ and mixed precision cannot recover quality. Fake-quantization nodes simulate rounding and clipping during fine-tuning, while the straight-through estimator passes an approximate gradient through the non-differentiable rounding operation. Starting QAT from the best calibrated PTQ model usually gives a better initialization than beginning with arbitrary ranges.

## Why edge robotics needs a stricter evaluation

For image classification, top-1 accuracy may be enough. A robot policy can preserve average action error while producing occasional spikes that destabilize control.

I would evaluate an INT8 VLA at three levels:

- **Numerical:** feature cosine similarity, action error, saturation, and per-layer drift.
- **Runtime:** end-to-end latency, tail latency, memory, power, and CPU fallback.
- **Behavioral:** task success, recovery, collision, action smoothness, and safety events.

The calibration set must also include the real deployment distribution. For a VLA, that means the actual camera crop and normalization, representative language commands, robot states, and long-horizon trajectories—not a generic image folder.

## A reusable deployment workflow

```text
FP16/BF16 baseline
  → quantize Conv / Linear / MatMul
  → per-channel weight scales
  → test max, percentile, and entropy activation calibration
  → evaluate quality and runtime
  → sensitivity analysis
  → mixed INT8/FP16 graph
  → optional QAT
  → package explicit quantization metadata
  → validate on target hardware
```

The last line is essential. INT8 only improves latency when the exported operators, data layout, and accelerator agree. A graph with unsupported quantized operators can fall back, insert conversion overhead, or fail to build.

INT8 is not old technology. It is the best place to learn the discipline that every lower-precision format still requires: calibrate with representative data, preserve sensitive paths, and measure the deployed system.

_Read the original paper: [Integer Quantization for Deep Learning Inference](https://arxiv.org/abs/2004.09602)._
