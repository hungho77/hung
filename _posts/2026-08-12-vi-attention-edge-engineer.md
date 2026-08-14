---
title: "Attention dưới góc nhìn edge"
subtitle: "Shape flow của Transformer, vì sao training song song được và nơi autoregressive inference trở thành bài toán memory cùng latency."
date: 2026-08-12 19:00:00 +0700
permalink: /vi/blog/attention-from-the-edge/
lang: vi
translation_url: /blog/attention-from-the-edge/
tags: [Transformer, Attention, Edge AI]
learning_order: 2
paper_year: "2017"
learning_stage: Nền tảng
visual_type: attention
paper_url: "https://arxiv.org/abs/1706.03762"
visual_title: "Scaled dot-product attention, sau đó multi-head"
visual_alt: "Minh họa tương tác Q K V, scaled score, mask, softmax, value mixing và multi-head"
visual_caption: "Theo Figure 2 và Equation 1: project Q/K/V, scale và mask QKᵀ, chuẩn hóa từng hàng, trộn V rồi nối các head qua Wᴼ."
---

Hệ quả hệ thống quan trọng nhất của *Attention Is All You Need* không chỉ là loại bỏ recurrence. Sequence modeling được chuyển thành các phép toán ma trận mà accelerator có thể chạy song song—cho đến khi autoregressive inference đặt lại một vòng lặp tuần tự quanh mô hình.

## Shape flow

Với input `X ∈ Rⁿˣᵈ`, mỗi attention head tạo:

`Q = XWQ`, `K = XWK`, `V = XWV`

Sau đó:

`Attention(Q,K,V) = softmax(QKᵀ / √dₖ)V`

`QKᵀ` tạo ma trận quan hệ giữa mọi query và key. Chia cho `√dₖ` giữ dot product trong vùng softmax ổn định. Causal mask đặt các vị trí tương lai thành `−∞`. Cuối cùng probability của mỗi hàng trộn các value vector.

Multi-head attention lặp quá trình này trong nhiều subspace, nối output và project qua `Wᴼ`.

## Vì sao training song song được

Trong training, toàn bộ token của sequence đã có sẵn. Q, K, V của mọi vị trí có thể được tính bằng GEMM lớn; score matrix cũng được xử lý song song. GPU phù hợp với workload này hơn RNN tuần tự.

Decode lại khác. Token tiếp theo phụ thuộc token vừa sinh, nên mô hình phải chạy từng bước. Mỗi bước chỉ tạo một query mới nhưng cần đọc lại key và value của toàn bộ context trước đó.

## KV cache đổi compute lấy memory traffic

Không có cache, decode phải tính lại K và V cho toàn bộ prefix. KV cache lưu chúng một lần, giảm compute nhưng làm memory capacity và bandwidth tăng theo context length, layer count, head count và head dimension.

| Giai đoạn | Bottleneck thường gặp | Hướng tối ưu |
|---|---|---|
| Vision/text prefill | Compute và attention memory | FP8/INT8, fused kernel, FlashAttention, giảm token |
| Batch-one decode | Weight và cache bandwidth | INT4/FP4 weight, cache quantization, fused decode |
| Long context | Attention bậc hai và KV capacity | Efficient attention, GQA, ít token, cache bit thấp |

## Ý nghĩa cho VLM và VLA

Image encoder có thể tạo hàng trăm hoặc hàng nghìn visual token. Chúng làm prefill nặng hơn và tăng KV cache của language backbone. Với VLA, action generation còn thêm vòng lặp latency bên ngoài model.

Thứ tự tối ưu thực tế của mình là: đo prefill và decode riêng; kiểm tra tỷ lệ thời gian ở attention/GEMM; giảm visual token trước khi sửa kernel; quantize weight khi decode bandwidth-bound; quantize KV cache khi context capacity trở thành giới hạn; và luôn đo end-to-end control latency thay vì chỉ tokens/s.
