---
title: "LUT-GEMM: weight low-bit không cần tái dựng"
subtitle: "Binary-coded weight trở thành lookup-table index như thế nào—và khi nào điều đó thực sự giảm decode latency."
date: 2026-08-12 15:00:00 +0700
permalink: /vi/blog/lut-gemm-no-dequantization/
lang: vi
translation_url: /blog/lut-gemm-no-dequantization/
tags: [CUDA, LUT-GEMM, Kernel]
learning_order: 7
paper_year: "2022"
learning_stage: Thiết kế kernel
visual_type: lut
paper_url: "https://arxiv.org/abs/2206.09557"
visual_title: "Tạo 2^μ partial sum, rồi để packed bit chọn"
visual_alt: "LUT-GEMM tương tác về BCQ bit plane, activation chunk, table construction, bit addressing và reduction"
visual_caption: "Phân rã weight thành binary plane, tính trước mọi signed sum cho chunk μ activation, dùng packed bit làm địa chỉ rồi reduce với scale và bias—không tái dựng FP16 weight."
---

Phần lớn weight-only quantization lưu weight ở 3–4 bit rồi unpack và dequantize bên trong matrix kernel trước khi nhân với FP16 activation. LUT-GEMM thay đổi phép tính: low-bit code trở thành địa chỉ vào bảng partial dot product đã tính từ activation.

## Vì sao decode là workload phù hợp

Autoregressive decode ở batch nhỏ thường bandwidth-bound. Weight phải được đọc cho mỗi token, trong khi số phép toán trên mỗi byte thấp. Nén weight và tránh tái dựng FP16 có thể giảm cả traffic lẫn arithmetic overhead.

## Binary-Coding Quantization

BCQ xấp xỉ weight vector bằng tổng các binary plane:

`Ŵ = α₀B₀ + α₁B₁ + … + z`

Mỗi `Bᵢ` chứa giá trị ±1; `αᵢ` là scale và `z` là bias tùy chọn. Representation này hỗ trợ cả non-uniform và uniform low-bit quantization.

## Biến đổi phép tính

Activation được chia thành subvector dài `μ`. Với mỗi chunk, kernel tạo `2^μ` signed partial sum—mọi tổ hợp dấu có thể của binary weight. Nếu `μ=4`, bảng có 16 entry.

Một pattern packed như `1011` trực tiếp chọn entry tương ứng. Kernel lặp lookup qua các chunk và bit plane, cộng kết quả rồi áp `α` cùng bias. Không có FP16 weight vector nào được materialize.

## Complexity không đồng nghĩa latency

Lookup giảm phép nhân nhưng thêm table construction, shared-memory traffic, synchronization và address computation. Lợi ích phụ thuộc layer shape, `μ`, occupancy và khả năng tái sử dụng LUT.

Paper báo cáo cho một cấu hình kernel:

| Kernel | Precision | Latency | Speedup so với FP16 cuBLAS |
|---|---:|---:|---:|
| cuBLAS | FP16 | 0.7256 ms | 1.00× |
| AWQ | INT4 / FP16 | 0.3238 ms | 2.24× |
| LUT-GEMM | INT4 / FP16 | 0.2688 ms | 2.70× |
| LUT-GEMM | INT3 / FP16 | 0.2250 ms | 3.22× |

Đây không phải speedup phổ quát; cần đo đúng GPU và shape.

## Group size và production path

Group nhỏ cải thiện fidelity nhưng scale overhead lớn hơn. Một implementation thực tế cần xác minh bit packing, coalesced load, LUT locality, epilogue fusion, numerical parity và end-to-end decode latency. LUT-GEMM đáng quan tâm vì nó thiết kế compute quanh compressed representation, thay vì xem dequantization là chi phí không tránh được.
