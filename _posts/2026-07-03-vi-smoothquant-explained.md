---
title: "SmoothQuant: chuyển phần khó sang offline"
subtitle: "Vì sao activation outlier phá W8A8 ngây thơ và equivalent scaling khôi phục đường INT8 hiệu quả."
date: 2026-07-03
permalink: /vi/blog/smoothquant-explained/
lang: vi
translation_url: /blog/smoothquant-explained/
tags: [Quantization, LLM, W8A8]
learning_order: 4
paper_year: "2022"
learning_stage: Quantize activation
visual_type: smoothquant
paper_url: "https://arxiv.org/abs/2211.10438"
visual_title: "Activation khó → tensor W8A8 cân bằng"
visual_alt: "SmoothQuant tương tác chuyển outlier activation sang weight trong khi giữ nguyên XW"
visual_caption: "Theo Figure 2: giảm activation outlier bằng scale per-channel offline, chuyển variance sang weight vẫn dễ quantize và giữ XW chính xác."
---

Weight-only quantization giảm model size nhưng không mở được đường matrix multiplication hoàn toàn INT8. SmoothQuant nhắm tới **W8A8**: cả weight và activation đều INT8, giúp Tensor Core tăng tốc prefill và batched inference đồng thời giảm activation memory.

## Vì sao activation outlier phá INT8 ngây thơ

Trong nhiều LLM, một số input channel có magnitude lớn hơn phần còn lại rất nhiều. Nếu một activation tensor dùng chung một scale, outlier quyết định toàn bộ range. Phần lớn giá trị nhỏ bị ép vào rất ít level hiệu dụng và rounding error tăng mạnh.

Weight thường phẳng hơn và dễ quantize hơn. SmoothQuant tận dụng sự bất cân bằng này.

## Equivalent transformation

Với per-channel scale `s`:

`X̂ = X · diag(s)⁻¹`

`Ŵ = diag(s) · W`

Do đó:

`X̂Ŵ = X · diag(s)⁻¹ · diag(s) · W = XW`

Full-precision function không đổi. Activation outlier được giảm, còn weight hấp thụ variance. Scale được calibration và fuse offline vào operator liền kề nên runtime không cần thêm một scaling kernel cho activation.

## Alpha điều khiển điểm đánh đổi

SmoothQuant chọn scale theo magnitude của activation và weight:

`sⱼ = max|Xⱼ|ᵅ / max|Wⱼ|¹⁻ᵅ`

`α` lớn chuyển nhiều độ khó hơn từ activation sang weight. `α` nhỏ bảo vệ weight nhiều hơn. Điểm tốt phải được chọn theo model và calibration set, không phải một hằng số phổ quát.

## Giá trị trong production

SmoothQuant hữu ích khi runtime có kernel W8A8 thật. Nếu graph vẫn dequantize về FP16 trước GEMM, checkpoint INT8 không tạo ra lợi ích latency mong muốn. Cần xác minh operator fusion, scale placement, fallback và end-to-end throughput.

Với VLA, mình sẽ calibration vision và language path riêng, giữ action head ở precision cao ban đầu, đo hidden-state drift cùng action error, rồi mới mở rộng W8A8 sang các module nhạy cảm. Mục tiêu là biến activation “khó” thành tensor dùng level INT8 hiệu quả mà không thay đổi hành vi full precision.
