---
title: "SpinQuant: xoay trước khi làm tròn"
subtitle: "Learned rotation giảm activation outlier và làm W4A4KV4 ít phá hủy hơn naive low-bit quantization như thế nào."
date: 2026-08-12 17:00:00 +0700
permalink: /vi/blog/spinquant-learned-rotations/
lang: vi
translation_url: /blog/spinquant-learned-rotations/
tags: [SpinQuant, Rotation, W4A4KV4]
learning_order: 8
paper_year: "2024"
learning_stage: Learned rotation
visual_type: spin
paper_url: "https://arxiv.org/abs/2405.16406"
visual_title: "Học basis thân thiện với quantization mà không đổi FP model"
visual_alt: "SpinQuant tương tác về outlier redistribution, orthogonal invariance, Cayley optimization và R1 đến R4"
visual_caption: "Rotation phân tán outlier, triệt tiêu trong full precision và được học trên Stiefel manifold; R1/R2 được absorb còn R3/R4 chạy online cho W4A4KV4."
---

Low-bit quantization khó nhất khi một số channel mang giá trị cực lớn. Một scale phải bao phủ outlier đó, khiến phần còn lại chỉ dùng được grid thô. SpinQuant đổi hệ tọa độ trước khi rounding để cùng thông tin được phân bố đều hơn.

## Outlier là bài toán basis

Với orthogonal matrix `R`, rotation giữ norm và có `RᵀR = I`. Có thể chèn `R` và `Rᵀ` vào network để full-precision function không đổi, nhưng distribution của activation và weight trong basis mới lại dễ quantize hơn.

Random rotation thường giảm kurtosis, nhưng paper quan sát chênh lệch accuracy tới 13 điểm giữa các random draw ở W4A4. Vì vậy SpinQuant học rotation thay vì chấp nhận một basis ngẫu nhiên.

## Bốn vị trí rotation

- **R1:** residual stream, được absorb vào weight.
- **R2:** head-wise giữa V và output projection, cũng absorb được.
- **R3:** KV cache, dùng Hadamard transform online.
- **R4:** FFN activation, dùng transform online nhanh.

R1/R2 không thêm matrix multiplication lúc runtime. R3/R4 phải chạy online vì tensor động, nên cần transform có cấu trúc và chi phí thấp.

## Học trên orthogonal manifold

SpinQuant giữ weight gốc cố định và tối ưu rotation để giảm loss của quantized network. Cayley update giữ `R` trên Stiefel manifold, tức vẫn orthogonal sau mỗi bước. Đây là điều kiện để equivalent transformation hợp lệ.

## Vì sao W4A4KV4 là phép thử quan trọng

Quantize đồng thời weight, activation và KV cache khó hơn weight-only rất nhiều.

| Phương pháp | Zero-shot average ở W4A4KV4 |
|---|---:|
| FP16 | 66.9% |
| SmoothQuant | 39.0% |
| GPTQ | 36.8% |
| SpinQuant không online Hadamard | 56.0% |
| SpinQuant với Hadamard | 64.0% |

Kết quả cho thấy rotation đúng basis có thể đóng phần lớn khoảng cách accuracy.

## Ý nghĩa triển khai

Model cuối phải merge đúng R1/R2, chạy R3/R4 hiệu quả, serialize low-bit scale đúng và dùng kernel W4A4KV4 thật. Với VLA, mình sẽ ưu tiên rotate VLM backbone, đánh giá riêng vision token và KV cache, rồi giữ action head ở precision cao cho đến khi closed-loop metric ổn định.
