---
title: "Four bugs, one symptom: garbled Edge-LLM output"
subtitle: "How I separated TensorRT fusion bugs, lossy AWQ repacking, and a silent InternVL3 export failure on NVIDIA edge hardware."
date: 2026-08-10
permalink: /blog/debugging-tensorrt-edge-llm/
tags: [TensorRT, Jetson, Debugging]
---

An engine that builds successfully and generates nonsense looks like one bug. In this case it was four independent defects: two TensorRT 10.13 fusion problems, one incorrect AWQ zero-point transformation, and one unsupported InternLM2 checkpoint layout that silently exported random weights.

I reproduced and isolated the failures on Jetson Thor with TensorRT Edge-LLM. The fixes and their before/after validation are collected in my [`fixes/garbled-output`](https://github.com/hungho77/TensorRT-Edge-LLM/tree/fixes/garbled-output) branch.

## 1. FP16 horizontal fully-connected fusion

The FP16 failure came from Myelin horizontal fully-connected fusion. `gate_proj` and `up_proj` share the same layer-normalization output, which creates a fusion opportunity. On TensorRT 10.13 and `sm_110`, that fused path produced corrupted output.

The runtime already had a workaround to disable `fc_h_fusion`, but its version gate started at TensorRT 10.15. Widening that gate fixed both text and vision-language generation on 10.13. The same Qwen2.5-0.5B engine changed from gibberish to “The capital of France is Paris.”

This diagnosis was discussed in NVIDIA issues [#151](https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/151) and [#105](https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/105). Other users reproduced the fix, and an NVIDIA maintainer confirmed it would be applied in a following release.

## 2. NVFP4 CASK epilogue fusion

NVFP4 looked identical but had a different cause. Disabling the Myelin fusion did nothing because quantize/dequantize nodes break that graph pattern.

The decisive variable was CASK epilogue fusion. Generation became corrupt as soon as two or more epilogues were fused into one NVFP4 GEMM. Capping the fusion at one epilogue restored correct output. Comparing tactic pools showed that this was generated epilogue code—not tactic selection.

That distinction matters. A workaround that happens to change tactics may hide the bug without identifying it, while a targeted fusion limit preserves the rest of the optimization space.

## 3. Asymmetric INT4 AWQ zero-points

The AWQ path folded asymmetric zero-points into 4-bit weight nibbles and then clamped them to `[0, 15]`. This is only lossless when the group zero-point is exactly 8. Real checkpoints contain many groups away from 8, so the largest-magnitude weights were clipped—the weights AWQ is specifically trying to protect.

I kept the existing GEMM kernel and moved the zero-point difference into an exact runtime correction term. On the tested projection, cosine similarity against correct AWQ dequantization improved to `1.00000000`, with only FP16 rounding residue.

## 4. InternVL3-9B exported random weights

InternVL3-9B uses an InternLM2 text backbone, while other supported InternVL3 variants use a different parameter layout. The loader matched none of the text checkpoint keys, but export still returned success and produced a complete ONNX graph initialized with random weights.

The fix converts fused `wqkv`, MLP, normalization, embedding, and output tensors into the layout expected by the exporter. The conversion was checked bit-for-bit against the InternLM2 reference mapping before building the full engine.

## What made the debugging expensive

All four failures ended with the same visible symptom. The useful strategy was to hold the graph constant and change one compiler or representation decision at a time: fusion thresholds, version gates, weight algebra, then checkpoint-key coverage.

The broader lesson is that “garbled output” is not a diagnosis. In optimized inference stacks, it can mean a compiler miscompile, a lossy quantization transform, an unsupported model layout, or even a wrong chat template. The shortest path is to find the earliest layer where correctness diverges—and verify each proposed fix with both output quality and performance measurements.

Read the complete investigation, patches, and benchmark tables in [`FIXES.md`](https://github.com/hungho77/TensorRT-Edge-LLM/blob/fixes/garbled-output/FIXES.md).
