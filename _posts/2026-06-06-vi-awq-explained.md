---
title: "AWQ: bảo vệ điều activation tiết lộ"
subtitle: "Giải thích kỹ thuật về salient channel, INT4 weight-only quantization và vì sao runtime quan trọng."
date: 2026-06-06
permalink: /vi/blog/awq-explained/
lang: vi
translation_url: /blog/awq-explained/
tags: [Quantization, LLM, INT4]
learning_order: 6
paper_year: "2023"
learning_stage: Nhận biết salience
visual_type: awq
paper_url: "https://arxiv.org/abs/2306.00978"
visual_title: "Từ activation saliency đến W4A16 đều đặn"
visual_alt: "AWQ tương tác về activation statistics, channel saliency, alpha search, equivalent scaling và INT4 weight"
visual_caption: "AWQ dùng activation magnitude để suy ra scale per-input-channel, tìm mức scaling tốt nhất, áp equivalent transform rồi quantize toàn bộ weight vào cùng low-bit format."
---

AWQ là post-training weight-only quantization cho LLM và VLM ở INT4/INT3 mà không cần retraining. Quan sát trung tâm là weight không quan trọng như nhau—và activation statistics cho biết channel nào nhạy cảm nhất.

## Vì sao weight-only hợp với decoding

Ở batch-one autoregressive decoding, mỗi token đọc phần lớn weight của model nhưng thực hiện GEMM nhỏ. Workload thường memory-bandwidth-bound. Nén weight xuống 4 bit giảm traffic và model footprint, trong khi activation vẫn FP16/BF16.

Speedup chỉ xuất hiện khi runtime đọc packed weight trực tiếp bằng kernel W4A16. Nếu unpack/dequantize tạo overhead lớn hoặc graph fallback, model nhỏ hơn chưa chắc nhanh hơn.

## Salient weight được tìm bằng activation

Sai số output của một weight gần đúng tỷ lệ với `weight error × activation`. Vì vậy magnitude của activation channel là tín hiệu saliency mạnh hơn chỉ nhìn magnitude của weight.

AWQ dùng một calibration set nhỏ để tính thống kê activation theo input channel. Những channel activation lớn chỉ chiếm khoảng nhỏ nhưng có thể chi phối output quality. Kết quả giữ 0.1–1% weight ở FP16 trong paper là thí nghiệm chẩn đoán saliency, không phải representation cuối cùng.

## Scaling thay vì mixed precision

AWQ tạo equivalent transform:

`W′ = W · diag(s)`

`X′ = diag(s)⁻¹ · X`

Do đó `W′X′ = WX`. Scale `s = sₓ^α` được tìm nhanh với `α ∈ [0,1]` để giảm layer-output error sau fake quantization. Scaling làm salient weight lớn hơn trước rounding, trong khi inverse scale ở activation triệt tiêu trong full precision.

Sau search, **tất cả** scaled weight vẫn được lưu trong cùng format INT4 đều đặn. Không cần FP16 exception mask hay mixed-precision GEMM, nên packed layout vẫn phù hợp với kernel hiệu quả.

## Engine là một phần của phương pháp

Đánh giá AWQ phải tách ba lớp:

- Fake-quant accuracy: scaling có bảo vệ output không?
- Artifact: group size, scale và packing có đúng không?
- Runtime: kernel có tiêu thụ trực tiếp representation đó không?

AWQ khác SmoothQuant ở mục tiêu: AWQ giữ activation precision cao và tối ưu decode bandwidth; SmoothQuant làm activation dễ quantize để chạy W8A8. Chọn phương pháp theo bottleneck, không theo tên thuật toán.
