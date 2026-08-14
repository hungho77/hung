---
title: "INT8 không dựa vào kinh nghiệm truyền miệng"
subtitle: "Range mapping, calibration, partial quantization và workflow production cho mô hình edge cần giữ accuracy."
date: 2026-08-12 20:00:00 +0700
permalink: /vi/blog/integer-quantization-int8/
lang: vi
translation_url: /blog/integer-quantization-int8/
tags: [INT8, Calibration, Edge AI]
learning_order: 3
paper_year: "2020"
learning_stage: Nền tảng
visual_type: int8
paper_url: "https://arxiv.org/abs/2004.09602"
visual_title: "Histogram → range → integer grid → phục hồi"
visual_alt: "Workflow INT8 tương tác về histogram, clipping, affine mapping, scale granularity và phục hồi accuracy"
visual_caption: "Đo activation đại diện, chọn điểm đánh đổi clipping–resolution, ánh xạ sang signed INT8, chọn scale granularity và chỉ tăng mức can thiệp ở layer nhạy cảm."
---

INT8 đủ trưởng thành để trông có vẻ đơn giản: chọn range, ánh xạ floating-point vào 256 level rồi để accelerator chạy nhanh hơn. Hầu hết deployment thất bại ở những chi tiết bị câu đó che đi.

## Range điều khiển hai loại sai số

Với affine quantization:

`xq = clip(round(sx + z), −128, 127)`

`x̂ = (xq − z) / s`

Range quá rộng tránh clipping nhưng dành quá nhiều code cho vùng ít xuất hiện. Range hẹp cho common value độ phân giải tốt hơn nhưng cắt tail. Calibration bằng max, entropy hoặc percentile là cách quyết định điểm đánh đổi này từ dữ liệu đại diện.

Không có calibration method tốt nhất cho mọi architecture. Histogram chỉ có ý nghĩa nếu sample giống production preprocessing, lighting, prompt, sensor state và failure case.

## Weight và activation cần cách xử lý khác nhau

Weight cố định và thường có thể dùng scale per-channel. Activation thay đổi theo input nên thường bắt đầu bằng per-tensor scale đã calibration; per-token linh hoạt hơn nhưng thêm runtime work.

| Thành phần | Lựa chọn khởi đầu |
|---|---|
| Conv / Linear weight | Symmetric INT8, per-channel hoặc per-column |
| Activation | Symmetric INT8, per-tensor, đã calibration |
| Phép toán nhạy số | FP16/BF16 |
| Action projection cuối | Giữ FP16 trước |

## PTQ trước QAT

Workflow hợp lý là:

1. Xây FP16/BF16 baseline trên đúng thiết bị.
2. Chạy PTQ với calibration data đại diện.
3. Đo layer-wise drift và end-to-end output.
4. Giữ một số layer nhạy cảm ở floating point.
5. Chỉ dùng QAT nếu mixed precision/PTQ vẫn không đạt quality gate.

QAT tốn data, compute và thời gian huấn luyện. Nó không nên là phản xạ đầu tiên khi một layer đơn lẻ gây regression.

## Edge robotics cần evaluation chặt hơn

Accuracy offline không đủ. Quantization có thể làm action jitter tăng dù average error nhỏ, làm confidence calibration lệch hoặc thay đổi rare recovery behavior. Hãy đo latency P50/P99, memory, power, thermal throttling, action error, success rate và safety event.

INT8 là một workflow thực nghiệm. Dtype chỉ là điểm bắt đầu; calibration distribution, granularity, operator coverage và regression gate mới quyết định deployment thành công.
