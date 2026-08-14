---
title: "TensorRT Edge-LLM: bốn bản sửa từ thí nghiệm có kiểm soát"
subtitle: "Cách mình tách lỗi compiler fusion, AWQ repacking mất mát và export InternVL3 âm thầm—rồi xác minh từng bản sửa trên NVIDIA edge hardware."
date: 2026-08-11 20:00:00 +0700
permalink: /vi/blog/debugging-tensorrt-edge-llm/
lang: vi
translation_url: /blog/debugging-tensorrt-edge-llm/
tags: [TensorRT, Jetson, Debugging]
learning_order: 11
paper_year: "Production"
learning_stage: Debugging
visual_type: debug
paper_url: "https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/151"
visual_title: "Tìm tensor sai đầu tiên, rồi chỉ đổi một biến"
visual_alt: "Bản đồ debugging TensorRT Edge-LLM về symptom, first divergence, bốn root cause, A/B test và verification"
visual_caption: "Build thành công không phải bằng chứng numerical correctness. Tensor comparison tìm first divergence; A/B test tách bốn nguyên nhân và fix được xác minh mà không che regression hiệu năng."
---

Một engine build thành công nhưng sinh output vô nghĩa trông giống một bug. Trường hợp này thực ra là bốn defect độc lập: hai lỗi fusion TensorRT 10.13, một phép biến đổi AWQ zero point không chính xác và một layout checkpoint InternLM2 không được hỗ trợ nhưng âm thầm export random weight.

> “The proposed fix will be applied in the next release.” — [`nvluxiaoz`](https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/151#issuecomment-5149783645), maintainer repository NVIDIA

## Phương pháp thí nghiệm

Nguyên tắc là không chẩn đoán từ final token. Mình so tensor theo chuỗi PyTorch → export → TensorRT layer → KV cache/logit và dừng ở divergence đầu tiên. Sau đó giữ graph, weight, input cố định và chỉ đổi một compiler hoặc representation decision.

| Precision / model | Root cause | Thay đổi có kiểm soát | Xác minh |
|---|---|---|---|
| FP16 | Myelin `fc_h_fusion` version gate | Tắt fusion bị miscompile trên TRT 10.13/10.14 | Text/image đúng; NVIDIA chấp nhận fix |
| NVFP4 | CASK fuse từ hai epilogue | Giới hạn fusion còn một epilogue | Cùng graph/tactic pool, output từ rác thành đúng |
| INT4 AWQ | Zero point bất đối xứng bị fold và clamp | Thêm runtime correction chính xác | Cosine similarity `1.00000000` |
| InternVL3-9B | InternLM2 key không match | Convert decoder sang layout hỗ trợ | Projection mapping bit-exact và generation đúng |

## 1. FP16 horizontal fully-connected fusion

FP16 output sai chỉ trên TensorRT version mới. Disable `fc_h_fusion` cho version bị ảnh hưởng khôi phục generation, chỉ ra lỗi nằm ở generated fusion chứ không phải model weight.

## 2. NVFP4 CASK epilogue fusion

NVFP4 path hỏng khi CASK fuse nhiều epilogue. Giới hạn fusion ở một epilogue giữ tactic chính nhưng loại bỏ combination gây sai số, tốt hơn việc tắt toàn bộ optimized path.

## 3. Asymmetric INT4 AWQ zero point

Fold zero point vào weight rồi clamp là phép biến đổi mất mát. Correction term phải được biểu diễn chính xác ở runtime. Sau khi sửa, reconstructed weight đạt cosine 1.0 thay vì chỉ “trông gần đúng”.

## 4. InternVL3-9B export random weight

Checkpoint key không match nhưng exporter không fail hard, để module dùng random initialization. Mapping decoder sang layout được hỗ trợ và kiểm tra projection bit-exact loại bỏ lỗi silent corruption.

## Điều làm debugging tốn thời gian

Bốn lỗi có cùng symptom: garbled generation. Workaround rộng như tắt mọi fusion có thể che nguyên nhân và làm mất hiệu năng. Verification hoàn chỉnh cần ba bằng chứng: intermediate tensor agreement, output đúng và latency không regression. Maintainer confirmation là tín hiệu review độc lập, nhưng causal A/B test mới là phần quyết định.

Liên quan: [issue #151](https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/151) và [issue #105](https://github.com/NVIDIA/TensorRT-Edge-LLM/issues/105#issuecomment-5235852406).
