---
title: "VLA-Perf: cách suy nghĩ về inference của VLA"
subtitle: "Bản đồ thực hành về compute, memory, network và action-generation bottleneck trong hệ Vision-Language-Action."
date: 2026-08-11
permalink: /vi/blog/vla-perf-inference-performance/
lang: vi
translation_url: /blog/vla-perf-inference-performance/
tags: [VLA, Robotics, Performance]
learning_order: 10
paper_year: "Ứng dụng"
learning_stage: Thiết kế hệ thống
visual_type: vla
paper_url: "https://arxiv.org/abs/2602.18397"
visual_title: "Mô hình hóa control timeline—không phải một pipeline chung chung"
visual_alt: "VLA-Perf tương tác về synchronous timeline, roofline, component latency, action knob và asynchronous overlap"
visual_caption: "Khớp control loop với camera cadence, mô hình hóa giới hạn của từng operator, tách component latency và phân biệt throughput overlap với end-to-end response time."
---

Vision-Language-Action không phải một workload duy nhất. Vision encoder biến camera frame thành token, language backbone suy luận từ observation và instruction, action expert biến context thành control. Mỗi giai đoạn có thể chạm một giới hạn phần cứng khác nhau.

## VLA-Perf mô hình hóa gì

VLA-Perf mở rộng analytical performance model để ước lượng latency từ architecture và đặc tính phần cứng: peak compute, memory bandwidth và interconnect. Với mỗi operator, roofline bound chọn chi phí lớn hơn giữa compute và memory; placement từ xa thêm:

`Tnetwork = NetLat + Bytes / NetBW`

Component latency là tổng operator latency, còn end-to-end latency phải đặt trong control timeline.

## Bài toán ba giai đoạn

Vision encoder xử lý nhiều image token và có thể nhạy với bandwidth hoặc resolution. VLM backbone giống transformer inference: prefill thường compute-heavy, context dài tăng attention cost và KV pressure. Action expert có thể autoregressive hoặc diffusion/flow matching; số denoising step quyết định số lần forward model.

Figure 6 của paper cho thấy trong cấu hình B100 được đo:

- Denoising step tăng `10 → 50` làm action latency tăng `5×`.
- Action chunk tăng `50 → 250` chỉ làm action latency tăng khoảng `40%` vì expert memory-bound.

Tức giảm số lần lặp model có thể quan trọng hơn giảm số action token.

## On-device, server hay split

On-device cho communication latency ổn định và giữ sensor data cục bộ, nhưng bị giới hạn memory/power. Cloud có compute lớn hơn nhưng jitter nguy hiểm cho control loop. Split deployment có thể gửi feature thay vì raw image, nhưng phải tính serialization, bandwidth, tail latency và failure behavior.

## Synchronous và asynchronous

Synchronous loop chờ inference xong rồi mới execute action horizon. Asynchronous serving chồng upload/inference của command tiếp theo lên việc execute chunk hiện tại, tăng throughput và che network latency.

Nhưng overlap không giảm end-to-end response latency; action mới được condition trên observation cũ hơn. Staleness và control stability phải được đánh giá riêng.

## Thứ tự tối ưu

1. Định nghĩa camera rate, policy rate và latency budget.
2. Profile vision, VLM và action expert riêng.
3. Xác định compute-, memory- hay network-bound trên đúng thiết bị.
4. Tối ưu component đang sở hữu end-to-end latency.
5. Đánh giá P99, jitter và closed-loop behavior.

Mục tiêu không phải operator nhanh nhất mà là control loop đáng tin cậy nhất trong ngân sách thật.
