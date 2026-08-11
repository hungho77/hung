---
title: "TensorRT Edge-LLM: four fixes from controlled experiments"
subtitle: "How I separated compiler fusion bugs, lossy AWQ repacking, and a silent InternVL3 export failure—and verified each fix on NVIDIA edge hardware."
date: 2026-08-11 20:00:00 +0700
permalink: /blog/debugging-tensorrt-edge-llm/
tags: [TensorRT, Jetson, Debugging]
---

An engine that builds successfully and generates nonsense looks like one bug. In this case it was four independent defects: two TensorRT 10.13 fusion problems, one incorrect AWQ zero-point transformation, and one unsupported InternLM2 checkpoint layout that silently exported random weights.

I reproduced and isolated the failures on Jetson Thor with TensorRT Edge-LLM. The fixes and their before/after validation are collected in my [`fixes/garbled-output`](https://github.com/hungho77/TensorRT-Edge-LLM/tree/fixes/garbled-output) branch.

> “The proposed fix will be applied in the next release.” — [`nvluxiaoz`](https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/151#issuecomment-5149783645), NVIDIA repository maintainer

The investigation connects directly to NVIDIA issue [#151](https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/151) and my consolidated experiment report in [issue #105](https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/105#issuecomment-5235852406).

## Experimental method

All four defects produced the same user-visible result: a clean engine build followed by nonsensical generation. I treated correctness as the dependent variable and changed one factor at a time:

- Keep the exported ONNX and prompts fixed while changing compiler fusion flags.
- Compare fusion thresholds rather than swapping kernels, models, or checkpoints together.
- Validate quantization transforms algebraically before rebuilding the full engine.
- Compare exported checkpoint tensors against the original weights before blaming runtime execution.

The main environment was Jetson Thor (`sm_110`), JetPack 7.1, and TensorRT 10.13.3.9. Platform-specific findings are labeled separately from representation bugs that affect any GPU.

| Precision / model | Root cause | Controlled change | Verification |
|---|---|---|---|
| FP16 | Myelin `fc_h_fusion` version gate | Disable the miscompiled fusion on TRT 10.13/10.14 | Correct text and image generation; NVIDIA accepted the fix |
| NVFP4 | CASK fusing two or more epilogues | Cap NVFP4 epilogue fusion at one | Same graph and tactic pool; output changes from garbage to correct |
| INT4 AWQ | Asymmetric zero-points folded and clamped | Add an exact runtime correction term | Cosine similarity improves to `1.00000000` |
| InternVL3-9B | InternLM2 keys silently unmatched | Convert the decoder to the supported layout | Bit-exact projection mapping and correct full-engine generation |

## 1. FP16 horizontal fully-connected fusion

The FP16 failure came from Myelin horizontal fully-connected fusion. `gate_proj` and `up_proj` share the same layer-normalization output, which creates a fusion opportunity. On TensorRT 10.13 and `sm_110`, that fused path produced corrupted output.

The runtime already had a workaround to disable `fc_h_fusion`, but its version gate started at TensorRT 10.15. Widening that gate fixed both text and vision-language generation on 10.13. The same Qwen2.5-0.5B engine changed from gibberish to “The capital of France is Paris.”

Other users reproduced the fix in NVIDIA issues #151 and #105. The maintainer then confirmed that the proposed change would be triggered in NVIDIA’s internal development flow rather than requiring an external merge request.

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
