---
title: "Quantization là một quyết định hệ thống"
subtitle: "Hướng dẫn thực hành về INT8, INT4, FP8, NVFP4 và cách đo xem precision thấp hơn có thực sự tốt hơn hay không."
date: 2026-08-12 21:00:00 +0700
permalink: /vi/blog/quantization-field-guide/
lang: vi
translation_url: /blog/quantization-field-guide/
tags: [Quantization, Edge AI, VLA]
learning_order: 1
paper_year: "Bắt đầu"
learning_stage: Định hướng
visual_type: quant-map
paper_url: "https://docs.nvidia.com/deeplearning/tensorrt/10.x.x/inference-library/work-quantized-types.html"
visual_title: "Tensor thực → codebook → hợp đồng Q/DQ → native kernel"
visual_alt: "Bản đồ TensorRT quantization tương tác về codebook, Q/DQ và đường thực thi low precision"
visual_caption: "Dtype chỉ là một phần của hợp đồng. Hãy chọn từng block để theo dõi giá trị đi vào codebook, so sánh scale scheme, đọc vị trí Q/DQ và kiểm tra native kernel."
---

Quantization thường được mô tả là chuyển giá trị floating-point sang ít bit hơn. Định nghĩa đó đúng về toán học nhưng chưa đủ cho triển khai. Trong production, quantization là hợp đồng giữa mô hình, calibration data, artifact đã serialize, runtime và kernel phần cứng.

Một checkpoint nhỏ hơn bốn lần vẫn có thể không nhanh hơn. Một benchmark perplexity tốt hơn vẫn có thể tạo action kém hơn trên robot. Câu hỏi hữu ích là:

> Biểu diễn nào loại bỏ bottleneck hiện tại mà vẫn giữ được hành vi quan trọng?

## Phép ánh xạ cơ bản

Với symmetric integer quantization:

`q = clamp(round(x / s), q_min, q_max)`

`x̂ = q × s`

Sai số đến từ rounding và clipping. Range rộng bảo vệ outlier nhưng làm bước lượng tử của phần lớn giá trị thô hơn; range hẹp tăng độ phân giải nhưng cắt nhiều giá trị hơn. Asymmetric quantization thêm zero point để mô tả distribution lệch, đổi lại kernel phức tạp hơn.

## Granularity quan trọng ngang dtype

| Granularity | Điểm mạnh | Chi phí |
|---|---|---|
| Per-tensor | Ít metadata, kernel đơn giản | Một outlier có thể lãng phí hầu hết level |
| Per-channel | Phù hợp weight của Linear/Conv | Nhiều scale và ràng buộc layout hơn |
| Per-token | Thích nghi với activation động | Phải tính scale lúc runtime |
| Per-block | Cân bằng fidelity và metadata | Cần packed layout và kernel tương thích |

Vì vậy “4-bit” chưa mô tả đầy đủ một format. Group size, scale dtype, symmetry, packing order và layer bị loại trừ đều ảnh hưởng size, accuracy và latency.

## Weight-only và weight-plus-activation

`W4A16` lưu weight ở 4 bit nhưng giữ activation FP16/BF16. Nó hợp với batch-one autoregressive decoding, nơi mỗi token phải đọc một ma trận weight lớn và memory bandwidth chiếm ưu thế.

`W8A8`, FP8 và FP4 còn giảm activation traffic và có thể dùng low-precision matrix engine. Chúng hấp dẫn hơn cho prefill, batch lớn hoặc block compute-bound, nhưng calibration khó hơn vì activation outlier thay đổi theo input.

## Chọn theo phần cứng

| Thiết bị | Điểm bắt đầu hợp lý |
|---|---|
| Jetson Orin / Ampere | FP16 baseline, TensorRT INT8, W4A16 khi có kernel đã chứng minh |
| H100 / H200 | FP8 cho transformer compute, INT4 weight-only cho decode bandwidth-bound |
| Blackwell | FP8 cùng NVFP4/MXFP4 với block scaling rõ ràng |
| Qualcomm / ARM NPU | INT8 qua QNN/SNPE/ONNX Runtime và kiểm tra operator coverage |
| CPU | Dynamic INT8 hoặc weight-only packing theo backend, đo ở batch one |

## Quantize VLA theo module

Không nên áp một precision policy cho toàn bộ VLA. Hãy quantize VLM backbone trước, đánh giá hidden-state drift và action error, sau đó mới xử lý vision encoder bằng camera data đại diện. Action head và projection cuối nên giữ FP16/BF16 cho đến khi closed-loop behavior ổn định.

## Regression gate

Một VLA quantized chỉ sẵn sàng khi vượt qua bốn lớp kiểm tra:

- **Artifact:** dtype metadata, scale shape, packing và loading đúng.
- **Model:** layer drift, action L1/L2 và thay đổi logits.
- **System:** P50/P99 latency, memory, power, thermal và fallback rate.
- **Robot:** success rate, collision, recovery, smoothness và safety stop.

Bit width là phần dễ nhìn thấy. Phần kỹ thuật thực sự nằm ở mọi thứ bao quanh nó.

_Tham khảo: [NVIDIA TensorRT quantized types](https://docs.nvidia.com/deeplearning/tensorrt/10.x.x/inference-library/work-quantized-types.html) và [TensorRT quantization schemes](https://docs.nvidia.com/deeplearning/tensorrt/latest/inference-library/quantized-types-schemes.html)._
