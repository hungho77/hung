---
title: "ParoQuant: pairwise rotation sống được trong deployment"
subtitle: "Từ learned Givens rotation đến pipeline TensorRT INT4—và thí nghiệm reduced-calibration của mình thực sự chứng minh điều gì."
date: 2026-08-12 16:00:00 +0700
permalink: /vi/blog/paroquant-pairwise-rotations/
lang: vi
translation_url: /blog/paroquant-pairwise-rotations/
tags: [ParoQuant, TensorRT, Experiment]
learning_order: 9
paper_year: "2025"
learning_stage: Rotation hiệu quả
visual_type: paro
paper_url: "https://arxiv.org/abs/2511.10645"
visual_title: "Scale channel, xoay cặp rời nhau, fuse runtime"
visual_alt: "ParoQuant tương tác về channel balancing, independent pair, Givens equation, rotation stage và fused CUDA"
visual_caption: "Channel scaling kiểm soát range toàn cục, Givens pair rời nhau căn chỉnh giá trị cục bộ, nhiều stage phục hồi expressiveness và fused kernel song song hóa token, group, pair."
---

Rotation-based quantization cải thiện accuracy bằng cách phân tán outlier qua channel. Vấn đề triển khai là dense learned rotation có thể tốn đủ nhiều để xóa lợi ích latency của INT4.

## Rotation đủ nhỏ để thực thi

ParoQuant dùng Givens rotation `2×2`. Với một cặp channel `(i,j)`:

`w′ᵢ = cosθ·wᵢ − sinθ·wⱼ`

`w′ⱼ = sinθ·wᵢ + cosθ·wⱼ`

Phép biến đổi giữ norm của cặp và chỉ cần hai vectorized multiply-add update. Trong một stage, mỗi channel xuất hiện tối đa một lần, nên các cặp rời nhau có thể chạy song song mà không có read–write dependency.

## Khác dense learned rotation

Một stage độc lập chỉ có khoảng `n/2` angle nên ít expressive hơn dense matrix. ParoQuant bù bằng cách xếp nhiều stage với pairing khác nhau, kết hợp channel-wise scale để cân bằng magnitude toàn cục. Inverse activation transform đảo thứ tự stage và đổi dấu angle.

## Thí nghiệm reduced-calibration của mình

Với recipe nhỏ hơn paper—16 sample, sequence length 256—kết quả của mình là:

| Phương pháp | WikiText-2 PPL | C4 PPL |
|---|---:|---:|
| FP16 baseline | 10.80 | 16.55 |
| ParoQuant, K=8 | 11.39 | 17.33 |
| Delta | +0.59 | +0.78 |

So với AWQ recipe 128 sample, length 512 trong cùng ghi chú, delta của ParoQuant nhỏ hơn:

| Phương pháp | Δ WikiText-2 | Δ C4 | Calibration |
|---|---:|---:|---|
| AWQ | +0.87 | +1.19 | 128 × 512 |
| ParoQuant | +0.59 | +0.78 | 16 × 256 |

Đây là kết quả thực nghiệm hữu ích, không phải kết luận rằng ParoQuant luôn tốt hơn AWQ; budget calibration và implementation khác nhau.

## Từ fake quantization đến TensorRT engine

Pipeline production cần fuse rotation với activation path, giữ parameter trong register/shared memory, song song hóa token–group–pair và đưa output trực tiếp vào packed INT4 GEMM. Cần đo accuracy sau serialization, kernel latency và end-to-end throughput.

Thí nghiệm đã chứng minh learned pairwise transform giữ quality tốt trong budget nhỏ. Bước tiếp theo là chứng minh fused runtime không tiêu hết speedup INT4.
