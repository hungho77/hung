---
title: "GPTQ: quantize bằng thông tin bậc hai"
subtitle: "Hessian-aware error compensation, lazy update và Cholesky giúp quantization LLM 3–4 bit trở nên thực tế như thế nào."
date: 2026-08-12 18:00:00 +0700
permalink: /vi/blog/gptq-second-order-quantization/
lang: vi
translation_url: /blog/gptq-second-order-quantization/
tags: [GPTQ, INT4, LLM]
learning_order: 5
paper_year: "2022"
learning_stage: Quantize weight
visual_type: gptq
paper_url: "https://arxiv.org/abs/2210.17323"
visual_title: "Bên trong GPTQ: một cột, một block, một lazy update"
visual_alt: "GPTQ tương tác với inverse Hessian Cholesky, cột đang quantize, active block và global update"
visual_caption: "Theo Figure 2 và Algorithm 1: GPTQ quantize các cột theo cùng thứ tự, bù lỗi tuần tự trong block B cột rồi cập nhật phần còn lại một lần bằng accumulated error."
---

Round-to-nearest xem sai số của từng weight là độc lập. GPTQ đặt câu hỏi tốt hơn: sau khi quantize một cột trên tất cả output row, các cột full-precision còn lại nên dịch chuyển thế nào để output của layer gần bản gốc nhất?

## Objective là output của layer

GPTQ tối ưu:

`min ‖WX − QX‖²`

`X` là calibration input của layer. Vì vậy một thay đổi weight nhỏ nhưng tác động mạnh lên output sẽ quan trọng hơn một sai số weight lớn ở hướng ít được activation sử dụng. Hessian xấp xỉ `H = 2XXᵀ + λI` mô tả coupling này.

## Vì sao phương pháp bậc hai ban đầu khó scale

Optimal Brain Quantization chọn weight greedily và downdate inverse Hessian sau từng quyết định. Với hàng tỷ parameter, thứ tự riêng cho từng row và rất nhiều update nhỏ làm memory traffic cùng numerical instability trở nên không thực tế.

GPTQ có ba thay đổi chính.

### 1. Một thứ tự cột dùng chung

Thay vì chọn weight order riêng cho mỗi output row, GPTQ quantize toàn bộ `W[:,j]` cùng lúc. Hessian work được tái sử dụng giữa các row.

### 2. Lazy batch update

Trong block `B` cột, lỗi của cột hiện tại chỉ cập nhật các cột phía sau trong block để quyết định rounding tiếp theo vẫn thấy compensation cần thiết. Khi block hoàn thành, accumulated error `E` cập nhật toàn bộ cột còn lại bằng một matrix operation:

`W[:,B:] ← W[:,B:] − E R[B,B:]`

Điều này thay hàng loạt vector update bandwidth-heavy bằng GEMM hiệu quả.

### 3. Cholesky reformulation

GPTQ tính Cholesky form của inverse Hessian đã damping một lần, tránh downdate lặp lại và ổn định hơn ở quy mô LLM.

## Group-wise quantization

Scale riêng cho group nhỏ cải thiện fidelity nhưng tăng metadata và có thể làm kernel kém hiệu quả. Group size phải được chọn cùng packed layout và runtime, không chỉ dựa trên perplexity.

## Calibration cho VLM/VLA

Calibration set cần chứa đúng preprocessing, visual token distribution, instruction và robot state. Mình sẽ đo reconstruction error theo layer, output drift và action metric; giữ vision projection, norm hoặc action head ở precision cao nếu cần.

GPTQ mạnh khi weight-only compression là mục tiêu và layer output có thể đại diện tốt bằng calibration data. Nó không tự đảm bảo speedup: artifact cuối vẫn cần packed INT4 kernel phù hợp trên thiết bị đích.
