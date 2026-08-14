document.addEventListener('DOMContentLoaded', () => {
  const isVietnamese = document.documentElement.lang.toLowerCase().startsWith('vi');

  try {
    const preferredLanguage = window.localStorage.getItem('portfolio-language');
    const preferredLink = document.querySelector(`[data-language-choice="${preferredLanguage}"]`);
    const isLanguageLanding = Boolean(document.querySelector('.hero, .blog-page'));
    if (isLanguageLanding && preferredLink && !preferredLink.classList.contains('is-active')) {
      window.location.replace(preferredLink.href);
      return;
    }
  } catch (_) { /* Preference storage is optional. */ }

  document.querySelectorAll('[data-language-choice]').forEach((link) => {
    const rememberLanguage = () => {
      try { window.localStorage.setItem('portfolio-language', link.dataset.languageChoice); } catch (_) { /* Preference storage is optional. */ }
    };
    link.addEventListener('click', rememberLanguage);
    link.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') rememberLanguage();
    });
  });

  document.querySelectorAll('a[href]').forEach((link) => {
    const url = new URL(link.getAttribute('href'), window.location.href);
    const isExternal = ['http:', 'https:'].includes(url.protocol) && url.hostname !== window.location.hostname;
    if (isExternal) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  });

  const menuButton = document.querySelector('.menu-button');
  const nav = document.querySelector('.site-header nav');
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!open));
    nav?.classList.toggle('open', !open);
  });

  document.querySelectorAll('[data-stagger]').forEach((element) => {
    const order = Math.min(Number(element.dataset.stagger) || 0, 8);
    element.style.transitionDelay = `${order * 42}ms`;
    element.addEventListener('transitionend', () => {
      element.style.transitionDelay = '0ms';
    }, { once: true });
  });

  const visualExplanations = {
    'quant-map': [
      { selector: '.qm-real', kicker: 'INPUT REPRESENTATION', title: 'Start with a real-valued tensor', description: 'The original tensor can contain many distinct floating-point values over a wide dynamic range. Quantization will preserve only a finite set of representable values.', impact: 'The observed distribution determines which scale and granularity can preserve useful information.' },
      { selector: '.qm-operator', motionSelector: '.qm-real, .qm-operator, .qm-codes', kicker: 'QUANTIZATION FUNCTION', title: 'Scale, clip, then round into codes', description: 'A scale normalizes x, clipping limits it to the target format, and rounding selects the nearest representable code. Dequantization multiplies the stored code by its scale.', impact: 'Every value outside the chosen range clips; every value between two codes incurs rounding error.' },
      { selector: '.qm-codes', kicker: 'OUTPUT REPRESENTATION', title: 'Interpret each code through its scale', description: 'The stored entries are finite codebook indices—not standalone real values. For symmetric integer quantization, the approximation is reconstructed as x̂ = s·xq; asymmetric formats also apply a zero point.', impact: 'Codes, scale, zero point, and scale granularity must travel together. Without that metadata, the packed tensor cannot reproduce the intended values.' },
      { selector: '.qm-formats', kicker: 'FORMAT IS PART OF THE METHOD', title: 'Bit width does not define one quantizer', description: 'INT8 and INT4 use uniform integer levels, while FP8 and NVFP4 use floating-point codebooks. TensorRT also assigns different scale granularities and activation support to each format.', impact: 'Two four-bit formats can have different range, metadata, kernels, and accuracy behavior.' },
      { selector: '.qm-contract', kicker: 'EXPLICIT QUANTIZATION', title: 'Q/DQ nodes encode the precision contract', description: 'In TensorRT explicit quantization, Quantize and Dequantize nodes state where conversion occurs and carry the scales that define the low-precision tensor.', impact: 'The engine should preserve this declared arithmetic intent instead of opportunistically changing precision.' },
      { selector: '.qm-kernel-gate', kicker: 'DEPLOYMENT GATE', title: 'Compression becomes speed only through a native path', description: 'Packed storage, operator support, and a matching low-precision kernel must all exist for the selected model shape and target GPU.', impact: 'Checkpoint size is not latency. Benchmark the built engine and verify that no expensive fallback erased the expected gain.' }
    ],
    attention: [
      { selector: '.attn-projections', kicker: 'FIGURE 2 · PROJECTIONS', title: 'Project the same token states into Q, K, and V', description: 'Learned matrices create queries, keys, and values from X. Q asks what to retrieve, K provides addresses, and V carries the content to combine.', impact: 'During decoding only the newest query is new; prior keys and values are read from the KV cache.' },
      { selector: '.attn-score', motionSelector: '.attn-projections, .attn-score', kicker: 'EQUATION 1 · COMPATIBILITY', title: 'Compute scaled query–key scores', description: 'QKᵀ forms one score for every query–key pair and division by √dₖ prevents large dot products from saturating softmax. A causal decoder masks future positions to −∞.', impact: 'The score matrix grows quadratically during full-sequence attention, while decode repeatedly reads an expanding key cache.' },
      { selector: '.attn-softmax', kicker: 'EQUATION 1 · NORMALIZATION', title: 'Normalize each score row into retrieval weights', description: 'Softmax turns one query’s scores into non-negative probabilities that sum to one. Larger entries receive more influence without changing value dimensionality.', impact: 'Fused attention avoids writing the full probability matrix to external memory.' },
      { selector: '.attn-value-mix', motionSelector: '.attn-softmax, .attn-value-mix', kicker: 'FIGURE 2 · WEIGHTED SUM', title: 'Use the probabilities to mix values', description: 'Each probability multiplies the matching value vector, and their sum becomes the context for that query.', impact: 'The values are payloads, not addresses; this is why both K and V must be cached for autoregressive reuse.' },
      { selector: '.attn-heads', kicker: 'MULTI-HEAD ATTENTION', title: 'Run several lower-dimensional attention heads in parallel', description: 'Each head uses its own Q, K, and V projections. Their outputs are concatenated and transformed by WO, matching the right side of Figure 2.', impact: 'Multiple heads expose parallel matrix work while allowing different representation subspaces to retrieve different relationships.' }
    ],
    int8: [
      { selector: '.i8-histogram', kicker: 'FIGURE 2 · CALIBRATION', title: 'Collect the real activation distribution', description: 'PTQ runs representative samples and builds activation histograms. The long low-density tails are real values, but preserving all of them may waste most INT8 codes.', impact: 'Calibration data must cover production inputs; otherwise the chosen range solves the wrong distribution.' },
      { selector: '.i8-range-choice', motionSelector: '.i8-histogram, .i8-range-choice', kicker: 'CALIBRATION POLICY', title: 'Trade clipping error for finer rounding resolution', description: 'Max calibration keeps every observed value but produces coarse steps. Entropy or percentile calibration clips a controlled tail so common values receive a denser grid.', impact: 'The paper finds no universal best activation calibration method across architectures.' },
      { selector: '.i8-affine', kicker: 'EQUATIONS 4–5', title: 'Map the selected real range onto signed INT8', description: 'Scale s and zero-point z transform each real value, then clipping and rounding produce a code in [−128,127]. Dequantization returns an approximation x̂, not the original x.', impact: 'INT8 has 256 codes; calibration decides where those codes are spent.' },
      { selector: '.i8-granularity', kicker: 'SECTION 3.2 · GRANULARITY', title: 'Share scales only where the kernel can factor them out', description: 'Per-tensor quantization uses one scale for an entire tensor. Per-channel weights use separate scales along an output dimension and better follow unequal channel ranges.', impact: 'Granularity can recover accuracy with little compute overhead, but scale layout must match integer matrix multiplication.' },
      { selector: '.i8-recovery', kicker: 'FIGURE 5 · RECOMMENDED WORKFLOW', title: 'Escalate only when calibrated PTQ is insufficient', description: 'Start with calibrated PTQ, identify sensitive layers, leave a small subset in floating point when useful, and use QAT only when simpler recovery methods fail.', impact: 'The paper treats INT8 as an empirical workflow, not a one-click dtype conversion.' }
    ],
    smoothquant: [
      { selector: '.sq-before', kicker: 'BEFORE · HARD', title: 'Activation outliers waste the INT8 range', description: 'A few input channels have magnitudes far above the rest. Per-tensor activation quantization must cover those peaks, so most values receive very few effective levels.', impact: 'The outlier channel—not the average value—sets the activation scale and causes large rounding error.' },
      { selector: '.sq-transform', motionSelector: '.sq-before, .sq-transform, .sq-after, .sq-weight-path', kicker: 'OFFLINE TRANSFORMATION', title: 'Migrate scale variance from X to W', description: 'For every input channel j, SmoothQuant divides Xⱼ by sⱼ and multiplies the matching weight row Wⱼ by sⱼ. The animation moves difficulty from the hard activation chart into weights.', impact: 'With α = 0.5, sⱼ balances the maximum magnitudes of the corresponding activation and weight channels.' },
      { selector: '.sq-after', kicker: 'AFTER · EASY', title: 'Smoothed activations use INT8 levels evenly', description: 'After X̂ = X · diag(s)⁻¹, the activation outlier is suppressed and channel ranges become comparable. The chart transitions from the original hard distribution to the smoothed one.', impact: 'Static per-tensor or per-token activation quantization now wastes far fewer codes on rare peaks.' },
      { selector: '.sq-weight-path', kicker: 'WEIGHT SIDE', title: 'Adjusted weights absorb the variance', description: 'Ŵ = diag(s) · W carries the inverse scale, so some weight channels grow. The original flat distribution becomes more varied but remains quantizable.', impact: 'Weights start from a flat, quantization-friendly distribution; hardware-efficient per-output-channel weight scales provide additional tolerance.' },
      { selector: '.sq-equivalence', kicker: 'INVARIANT', title: 'The linear layer is unchanged', description: 'X̂Ŵ = (X · diag(s)⁻¹)(diag(s) · W) = XW. SmoothQuant changes tensor ranges, not the full-precision function.', impact: 'The smoothing factors are calibrated and fused into previous operations offline, so runtime receives smooth activations without an extra scaling kernel.' }
    ],
    gptq: [
      { selector: '.gptq-objective', kicker: 'OBJECTIVE · EQUATION 1', title: 'Preserve the layer output on calibration data', description: 'GPTQ searches for quantized weights Q that minimize ‖WX − QX‖². The calibration inputs X determine which weight errors affect the layer output.', impact: 'GPTQ is data-aware: it does not minimize raw distance between W and Q in isolation.' },
      { selector: '.gptq-hessian', kicker: 'SECOND ORDER · STEP 3', title: 'Precompute stable inverse-Hessian information', description: 'From the damped H = 2XXᵀ + λI, GPTQ computes a Cholesky form of H⁻¹ once. The highlighted row supplies the correction direction for the current column.', impact: 'This avoids repeatedly downdating and inverting H⁻¹, which becomes numerically unstable at billion-parameter scale.' },
      { selector: '.gptq-current-col, .gptq-quantize-step', motionSelector: '.gptq-hessian, .gptq-current-col, .gptq-quantize-step', kicker: 'CURRENT COLUMN · ALGORITHM 1', title: 'Quantize one full column in the shared order', description: 'GPTQ rounds W[:,j] for every output row at once, records the scaled residual eⱼ = (W[:,j] − Q[:,j]) / Rⱼⱼ, and uses the same column order for all rows.', impact: 'Unlike OBQ, GPTQ does not perform a separate greedy weight order per row. The shared order makes the Hessian work reusable.' },
      { selector: '.gptq-active-block, .gptq-local-step', motionSelector: '.gptq-active-block, .gptq-local-step', kicker: 'LAZY BATCHING · INSIDE B', title: 'Compensate recursively inside the active block', description: 'After quantizing column j, its residual updates only the later columns j:B inside the outlined block. The next rounding decision therefore sees the compensation it actually depends on.', impact: 'GPTQ keeps these sequential updates local to a B-column window; the paper uses B = 128.' },
      { selector: '.gptq-remaining, .gptq-global-step', motionSelector: '.gptq-remaining, .gptq-global-step', kicker: 'LAZY BATCHING · GLOBAL', title: 'Update all remaining weights once per block', description: 'When the active block is complete, GPTQ stacks its residuals in E and applies W[:,B:] ← W[:,B:] − ER[B,B:] to every remaining column.', impact: 'One matrix operation replaces many bandwidth-heavy vector updates, which is the key practical speedup of lazy batching.' }
    ],
    awq: [
      { selector: '.awq-activation-stats', kicker: 'ACTIVATION AWARENESS · FIGURE 2', title: 'Measure which input channels carry large features', description: 'AWQ caches a small calibration set and computes the average activation magnitude sₓ,c for every input channel. The tall bars are channels whose features repeatedly arrive at larger magnitude.', impact: 'A weight error contributes roughly error × activation to the output, so activation magnitude is a stronger saliency signal than weight magnitude alone.' },
      { selector: '.awq-salient-map', motionSelector: '.awq-activation-stats, .awq-channel-link, .awq-salient-map', kicker: 'SALIENCY MAP · FIGURE 2', title: 'Map activation saliency to the matching weight columns', description: 'Each input channel Xc multiplies the same-index column W[:,c]. High-magnitude activation channels therefore reveal which weight columns deserve more protection.', impact: 'The paper’s 0.1–1% FP16 result is a diagnostic experiment proving this saliency signal. Keeping those weights FP16 is not the final AWQ representation.' },
      { selector: '.awq-alpha-search', kicker: 'GRID SEARCH · EQUATIONS 4–5', title: 'Choose how aggressively to protect salient channels', description: 'AWQ restricts the per-channel scale to s = sₓ^α and quickly searches α from 0 to 1. It selects α* that minimizes the layer-output difference after fake quantization.', impact: 'More scaling reduces salient-channel error, but too much can enlarge a group’s quantization step Δ and increase error for non-salient weights.' },
      { selector: '.awq-scale-transform', motionSelector: '.awq-salient-map, .awq-scale-transform', kicker: 'ERROR ANALYSIS · EQUATIONS 2–3', title: 'Scale weights up and activations down', description: 'AWQ forms W′ = W·diag(s) and X′ = diag(s)⁻¹X. These factors cancel before quantization, so W′X′ = WX; the original full-precision linear layer is unchanged.', impact: 'When scaling does not significantly change the group step (Δ′ ≈ Δ), a salient weight’s effective quantization error falls by about 1/s.' },
      { selector: '.awq-uniform-output', motionSelector: '.awq-scale-transform, .awq-uniform-output', kicker: 'DEPLOYMENT · WEIGHT ONLY', title: 'Quantize every scaled weight into one regular low-bit format', description: 'After the offline scaling search, Q(W′) is stored uniformly in INT4 while activations remain FP16. The inverse activation scale is fused into an adjacent operator where possible.', impact: 'No FP16 exception mask or mixed-precision GEMM is required, preserving the regular packed layout needed by an efficient W4A16 kernel.' }
    ],
    lut: [
      { selector: '.lut-bcq', kicker: 'SECTION 2.3 · WEIGHT FORMAT', title: 'Represent each weight vector as binary planes', description: 'BCQ approximates a weight vector with a weighted sum of binary vectors. The extended form adds bias z, allowing both non-uniform and uniform low-bit quantization to use the same computation pattern.', impact: 'The α scales and bit planes are the representation consumed by LUT-GEMM; they are not reconstructed into an FP16 matrix first.' },
      { selector: '.lut-activation', kicker: 'SECTION 3.1 · ACTIVATION CHUNK', title: 'Split the full-precision activation into μ-value subvectors', description: 'For each activation subvector, LUT-GEMM enumerates all possible signed sums induced by μ binary weights. The illustration uses μ=4, so one table has 2⁴ entries.', impact: 'Larger μ reduces lookups but doubles table size for every extra activation value.' },
      { selector: '.lut-build', motionSelector: '.lut-activation, .lut-build', kicker: 'SECTION 3.1 · PRECOMPUTE', title: 'Build partial dot products once per activation chunk', description: 'Every table entry is a dot product between the activation subvector and one ±1 sign pattern. Those values can be reused across many output rows.', impact: 'Table construction must be amortized; otherwise a small layer can spend more time building the LUT than it saves.' },
      { selector: '.lut-address', motionSelector: '.lut-bcq, .lut-build, .lut-address', kicker: 'FIGURE 2 · RETRIEVAL', title: 'Concatenate μ weight bits and use them as the lookup key', description: 'A packed pattern such as 1011 directly selects its precomputed partial sum. Retrieval replaces the arithmetic that would otherwise unpack and multiply individual low-bit weights.', impact: 'The kernel computes from compressed bit planes without materializing a dequantized weight vector.' },
      { selector: '.lut-reduce', kicker: 'SECTION 3.1 · REDUCTION', title: 'Accumulate lookups, then apply scales and bias', description: 'Partial sums are accumulated across activation chunks and binary planes, multiplied by the corresponding α values, and corrected by the optional bias term.', impact: 'Real latency depends on LUT locality, shared memory, synchronization, scale traffic, and occupancy—not only the reduced arithmetic count.' }
    ],
    spin: [
      { selector: '.spin-distributions', kicker: 'FIGURES 2–3 · OUTLIERS', title: 'Rotation redistributes energy across channels', description: 'Before rotation, a few activation channels contain extreme values and drive kurtosis far above a Gaussian distribution. Multiplying by an orthogonal R spreads those values across coordinates.', impact: 'Tensor-wise and token-wise quantizers can use their limited range more evenly after the outlier channels are removed.' },
      { selector: '.spin-equivalence', motionSelector: '.spin-distributions, .spin-equivalence', kicker: 'FIGURE 1 · INVARIANCE', title: 'Insert R and Rᵀ as a canceling pair', description: 'Because R is orthogonal, RᵀR=I. SpinQuant rotates the residual stream and applies the inverse before nonlinear structure, preserving the full-precision transformer function.', impact: 'The rotation changes quantization error without changing the unquantized model.' },
      { selector: '.spin-search', kicker: 'FIGURE 4 · LEARNED ROTATION', title: 'Optimize the basis instead of accepting a random draw', description: 'The paper observes up to a 13-point accuracy spread among random W4A4 rotations. SpinQuant minimizes quantized-network loss while Cayley updates keep R on the orthogonal Stiefel manifold.', impact: 'Random rotations reduce outliers statistically, but learned rotations consistently choose a better quantized network.' },
      { selector: '.spin-locations', kicker: 'FIGURE 1 · FOUR LOCATIONS', title: 'Use absorbed and online rotations for different tensors', description: 'R1 rotates the residual stream and R2 acts head-wise between V and O projections; both are absorbed into weights. R3 and R4 are online Hadamard transforms for KV cache and FFN activations.', impact: 'W4A4KV4 needs online outlier control, but those transforms must remain cheap enough to preserve latency gains.' },
      { selector: '.spin-result', kicker: 'DEPLOYMENT TARGET', title: 'Quantize weights, activations, and KV cache after learning the basis', description: 'The final target is not merely a rotated point cloud: it is an executable W4A4KV4 network whose merged rotations, online transforms, and low-bit kernels are all accounted for.', impact: 'SpinQuant’s value comes from closing the large accuracy gap of simultaneous low-bit weight, activation, and cache quantization.' }
    ],
    paro: [
      { selector: '.paro-balance', kicker: 'FIGURE 1 · CHANNEL SCALE', title: 'First equalize the average channel magnitudes', description: 'Channel-wise scaling suppresses isolated outlier channels across the matrix before rotations address pair-level geometry.', impact: 'Scaling provides global range control that one sparse set of pair rotations cannot express alone.' },
      { selector: '.paro-pairs', kicker: 'DEFINITION 1 · INDEPENDENT PAIRS', title: 'Pair channels without allowing overlap inside one stage', description: 'Every channel appears in at most one pair. Because the pairs are disjoint, their Givens rotations commute operationally and can run without read–write dependencies.', impact: 'All pairs in one stage can execute in parallel and align naturally with independent quantization groups.' },
      { selector: '.paro-givens', motionSelector: '.paro-pairs, .paro-givens', kicker: 'EQUATIONS 3–5 · GIVENS UPDATE', title: 'Rotate only two rows with one learned angle', description: 'A Givens transform mixes rows i and j using sinθ and cosθ while preserving their joint norm. The inverse activation transform reverses the sequence and negates each angle.', impact: 'Two vectorized multiply–add updates replace an expensive dense matrix multiplication.' },
      { selector: '.paro-series', kicker: 'EQUATION 8 · SERIES', title: 'Stack independent stages to recover expressive power', description: 'One independent rotation contains only n/2 angles. ParoQuant applies several stages with different disjoint pairs, then combines them with channel-wise scaling.', impact: 'Increasing K expands the set of reachable transforms while every individual stage remains parallel.' },
      { selector: '.paro-kernel', kicker: 'FIGURE 3 · FUSED EXECUTION', title: 'Parallelize across tokens, groups, and pairs', description: 'The fused CUDA transform assigns work independently across token rows, channel groups, and pair rotations, keeping small group data in shared memory and parameters in registers.', impact: 'The runtime transform must preserve the benefit of the following packed INT4 GEMM; fake-quant accuracy alone is insufficient.' }
    ],
    vla: [
      { selector: '.vperf-timeline', kicker: 'FIGURE 2 · CONTROL TIMELINE', title: 'Fit perception, inference, and execution into the camera cadence', description: 'A synchronous VLA receives a frame, runs vision, VLM, and action prediction, then executes only an action horizon before the next inference.', impact: 'The relevant target is the closed-loop response budget—typically tens of milliseconds—not isolated model throughput.' },
      { selector: '.vperf-roofline', kicker: 'EQUATIONS 2–4 · PERFORMANCE MODEL', title: 'Model every operator from compute, memory, and communication limits', description: 'VLA-Perf sums operator latencies for each component. A roofline bound chooses the dominant local cost, while remote placement adds fixed network latency plus bytes divided by bandwidth.', impact: 'The same model can move from compute-bound to memory-bound or network-bound when hardware and placement change.' },
      { selector: '.vperf-breakdown', motionSelector: '.vperf-roofline, .vperf-breakdown', kicker: 'COMPONENT DECOMPOSITION', title: 'Attribute latency to vision, VLM, and action prediction separately', description: 'Vision and the VLM process many tokens and can expose substantial parallel compute; a smaller action expert can still be memory-bound because it operates on fewer tokens.', impact: 'Optimize the component and resource that own end-to-end latency on the target device.' },
      { selector: '.vperf-knobs', kicker: 'FIGURE 6 · ACTION EXPERT', title: 'Denoising steps and action chunk size do not cost the same', description: 'Five times more denoising steps requires five times more action-expert forward passes. Five times more action tokens adds only about 40% action latency in the paper’s memory-bound B100 setting.', impact: 'Reducing repeated model passes can matter much more than shortening the generated chunk.' },
      { selector: '.vperf-async', kicker: 'SECTION 4.9 · ASYNCHRONY', title: 'Overlap inference with execution to improve throughput', description: 'Asynchronous serving can upload and infer the next command while the robot executes the previous chunk, especially hiding slower wireless or cloud communication.', impact: 'Overlap increases throughput but does not reduce end-to-end latency; actions are conditioned on older observations, so staleness and control stability must be evaluated.' }
    ],
    debug: [
      { selector: '.dbg-symptom', kicker: 'SYMPTOM IS NOT A DIAGNOSIS', title: 'A successful engine build can still produce nonsense', description: 'Graph conversion only proves that TensorRT accepted a representation. Fused code, packed weights, checkpoint mapping, and runtime buffers can each be numerically wrong.', impact: 'The same garbled tokens appeared for four independent causes, so final text cannot identify the failing subsystem.' },
      { selector: '.dbg-first-divergence', kicker: 'LOCALIZATION', title: 'Compare tensors until the first numerical divergence', description: 'Walk forward from the framework reference through export and TensorRT intermediates. The first collapsed cosine narrows the search before later layers amplify the error.', impact: 'Issue #151 isolated a correct V projection followed by a corrupted V cache, ruling out the weights and GEMM themselves.' },
      { selector: '.dbg-cases', kicker: 'FOUR FIXES · FOUR CAUSES', title: 'Separate compiler, quantizer, and exporter failures', description: 'The investigation found FP16 Myelin fusion, NVFP4 CASK epilogue fusion, asymmetric AWQ zero-point folding, and unmatched InternLM2 checkpoint keys.', impact: 'Each cause requires a different fix; bundling them under one workaround would hide regressions and sacrifice unrelated optimizations.' },
      { selector: '.dbg-ab', motionSelector: '.dbg-first-divergence, .dbg-ab', kicker: 'CONTROLLED A/B', title: 'Hold the graph and data fixed while changing one decision', description: 'Marking only the V projection as an additional graph output changed its cache cosine from about 0.015 to about 1.0 without changing weights, inputs, or operator parameters.', impact: 'That surprising materialization test points to tensor lifetime, reuse, or generated fusion behavior rather than model math.' },
      { selector: '.dbg-proof', kicker: 'VERIFICATION BAR', title: 'Require tensor, output, and performance evidence', description: 'A complete fix restores intermediate agreement, correct generation, and acceptable latency; repository-maintainer confirmation provides an independent review signal for the upstream change.', impact: 'A workaround is not complete if it only makes one prompt readable or silently disables the optimized path.' }
    ]
  };

  const visualTranslationsVi = {
    'quant-map': [
      { kicker: 'BIỂU DIỄN ĐẦU VÀO', title: 'Bắt đầu từ tensor giá trị thực', description: 'Tensor gốc chứa nhiều giá trị floating-point trên một dynamic range rộng; quantization chỉ giữ một tập giá trị biểu diễn hữu hạn.', impact: 'Distribution quan sát được quyết định scale và granularity nào giữ lại thông tin hữu ích.' },
      { kicker: 'HÀM QUANTIZATION', title: 'Scale, clip rồi round thành code', description: 'Scale chuẩn hóa x, clipping giới hạn range và rounding chọn code gần nhất; dequantization dùng scale để tạo giá trị xấp xỉ.', impact: 'Giá trị ngoài range bị clip, còn giá trị nằm giữa hai code chịu rounding error.' },
      { kicker: 'BIỂU DIỄN ĐẦU RA', title: 'Đọc mỗi code cùng với scale của nó', description: 'Các entry được lưu là chỉ số codebook, không phải giá trị thực độc lập; symmetric quantization khôi phục gần đúng bằng x̂ = s·xq.', impact: 'Code, scale, zero point và granularity phải đi cùng nhau để tensor packed có ý nghĩa.' },
      { kicker: 'FORMAT LÀ MỘT PHẦN PHƯƠNG PHÁP', title: 'Bit width không xác định một quantizer duy nhất', description: 'INT8/INT4 dùng level integer đều, còn FP8/NVFP4 dùng floating-point codebook cùng scale scheme khác nhau.', impact: 'Hai format 4-bit có thể khác range, metadata, kernel và accuracy.' },
      { kicker: 'EXPLICIT QUANTIZATION', title: 'Q/DQ node mã hóa hợp đồng precision', description: 'Trong TensorRT, Quantize và Dequantize node chỉ rõ nơi conversion xảy ra và mang scale của low-precision tensor.', impact: 'Engine cần giữ arithmetic intent này thay vì tự ý đổi precision.' },
      { kicker: 'CỔNG TRIỂN KHAI', title: 'Compression chỉ thành tốc độ khi có native path', description: 'Packed storage, operator support và low-precision kernel phù hợp phải cùng tồn tại trên GPU đích.', impact: 'Checkpoint size không phải latency; phải benchmark engine và kiểm tra fallback.' }
    ],
    attention: [
      { kicker: 'FIGURE 2 · PROJECTION', title: 'Project cùng token state thành Q, K và V', description: 'Các ma trận học được tạo query, key và value từ X: Q hỏi cần lấy gì, K cung cấp địa chỉ, V mang nội dung.', impact: 'Khi decode chỉ query mới thay đổi; key/value cũ được đọc từ KV cache.' },
      { kicker: 'EQUATION 1 · ĐỘ TƯƠNG HỢP', title: 'Tính scaled query–key score', description: 'QKᵀ tạo score cho từng cặp, chia √dₖ giữ softmax ổn định và causal mask chặn vị trí tương lai.', impact: 'Full attention tăng bậc hai theo sequence; decode liên tục đọc key cache dài dần.' },
      { kicker: 'EQUATION 1 · CHUẨN HÓA', title: 'Đổi từng hàng score thành retrieval weight', description: 'Softmax biến score của một query thành probability không âm có tổng bằng một.', impact: 'Fused attention tránh ghi toàn bộ probability matrix ra external memory.' },
      { kicker: 'FIGURE 2 · WEIGHTED SUM', title: 'Dùng probability để trộn value', description: 'Mỗi probability nhân value tương ứng và tổng của chúng trở thành context cho query.', impact: 'Value là payload, không phải address; vì vậy decode phải cache cả K và V.' },
      { kicker: 'MULTI-HEAD ATTENTION', title: 'Chạy nhiều attention head song song', description: 'Mỗi head có projection Q/K/V riêng; output được concat rồi biến đổi qua Wᴼ.', impact: 'Các head học quan hệ ở subspace khác nhau và vẫn ánh xạ tốt lên matrix hardware.' }
    ],
    int8: [
      { kicker: 'FIGURE 2 · CALIBRATION', title: 'Thu thập distribution activation thật', description: 'PTQ chạy sample đại diện và tạo histogram; tail hiếm có thể làm lãng phí phần lớn INT8 code.', impact: 'Calibration data phải giống production, nếu không range được tối ưu cho distribution sai.' },
      { kicker: 'CHÍNH SÁCH CALIBRATION', title: 'Đổi một ít clipping lấy rounding resolution tốt hơn', description: 'Max giữ mọi giá trị nhưng bước lượng tử thô; entropy/percentile cắt tail có kiểm soát để common value dùng grid dày hơn.', impact: 'Không có calibration method tốt nhất cho mọi architecture.' },
      { kicker: 'EQUATION 4–5', title: 'Ánh xạ range đã chọn vào signed INT8', description: 'Scale và zero point biến đổi real value rồi clip/round thành code trong [−128,127]; dequant chỉ tạo xấp xỉ.', impact: 'INT8 có 256 code và calibration quyết định chúng được dùng ở đâu.' },
      { kicker: 'SECTION 3.2 · GRANULARITY', title: 'Chỉ chia sẻ scale nơi kernel factor được', description: 'Per-tensor dùng một scale; per-channel weight dùng scale riêng để theo range khác nhau giữa channel.', impact: 'Granularity tăng accuracy nhưng layout scale phải khớp integer matrix multiplication.' },
      { kicker: 'FIGURE 5 · WORKFLOW', title: 'Chỉ nâng mức can thiệp khi PTQ chưa đủ', description: 'Bắt đầu bằng PTQ, tìm layer nhạy cảm, giữ một phần floating point và chỉ dùng QAT khi cần.', impact: 'INT8 là workflow thực nghiệm, không phải đổi dtype bằng một nút.' }
    ],
    smoothquant: [
      { kicker: 'TRƯỚC · KHÓ', title: 'Activation outlier làm lãng phí range INT8', description: 'Một số channel lớn bất thường buộc per-tensor scale bao phủ peak, khiến common value còn rất ít level hiệu dụng.', impact: 'Outlier—not average—quyết định scale và gây rounding error.' },
      { kicker: 'BIẾN ĐỔI OFFLINE', title: 'Chuyển scale variance từ X sang W', description: 'SmoothQuant chia Xⱼ cho sⱼ và nhân weight row tương ứng với sⱼ, chuyển độ khó khỏi activation.', impact: 'α điều khiển cách cân bằng magnitude giữa activation và weight.' },
      { kicker: 'SAU · DỄ', title: 'Activation đã làm mượt dùng level INT8 đều hơn', description: 'Sau X̂ = X·diag(s)⁻¹, outlier giảm và range giữa các channel trở nên tương đương.', impact: 'Static activation quantization lãng phí ít code hơn cho peak hiếm.' },
      { kicker: 'PHÍA WEIGHT', title: 'Weight đã chỉnh hấp thụ variance', description: 'Ŵ = diag(s)·W mang inverse scale nên một số weight channel lớn lên nhưng vẫn dễ quantize.', impact: 'Per-output-channel weight scale tạo thêm khả năng chịu variance.' },
      { kicker: 'BẤT BIẾN', title: 'Linear layer không thay đổi', description: 'X̂Ŵ = (X·diag(s)⁻¹)(diag(s)·W) = XW.', impact: 'Scale được fuse offline nên runtime nhận activation mượt mà không cần scaling kernel mới.' }
    ],
    gptq: [
      { kicker: 'OBJECTIVE · EQUATION 1', title: 'Giữ output layer trên calibration data', description: 'GPTQ tìm Q giảm ‖WX−QX‖²; calibration input X quyết định weight error nào thực sự ảnh hưởng output.', impact: 'GPTQ data-aware, không chỉ giảm khoảng cách W và Q.' },
      { kicker: 'BẬC HAI · STEP 3', title: 'Tính trước inverse-Hessian ổn định', description: 'Từ H đã damping, GPTQ tính Cholesky form của H⁻¹ một lần để lấy hướng correction.', impact: 'Tránh downdate/invert lặp lại vốn không ổn định ở quy mô tỷ parameter.' },
      { kicker: 'CỘT HIỆN TẠI · ALGORITHM 1', title: 'Quantize một cột đầy đủ theo thứ tự chung', description: 'GPTQ round W[:,j] cho mọi output row, ghi residual đã scale và dùng cùng column order.', impact: 'Hessian work được tái sử dụng thay vì greedy order riêng cho từng row.' },
      { kicker: 'LAZY BATCHING · TRONG B', title: 'Bù lỗi tuần tự trong active block', description: 'Residual của cột j cập nhật các cột sau trong block trước quyết định rounding kế tiếp.', impact: 'Update tuần tự chỉ nằm trong cửa sổ B cột; paper dùng B=128.' },
      { kicker: 'LAZY BATCHING · TOÀN CỤC', title: 'Cập nhật phần weight còn lại một lần mỗi block', description: 'Khi block xong, GPTQ dùng accumulated error E cập nhật mọi cột còn lại bằng một matrix operation.', impact: 'Thay nhiều vector update tốn bandwidth bằng GEMM hiệu quả.' }
    ],
    awq: [
      { kicker: 'ACTIVATION AWARENESS · FIGURE 2', title: 'Đo input channel nào mang feature lớn', description: 'AWQ tính average activation magnitude cho từng channel từ calibration set nhỏ.', impact: 'Weight error nhân activation nên activation magnitude là saliency signal mạnh.' },
      { kicker: 'SALIENCY MAP · FIGURE 2', title: 'Ánh xạ activation saliency vào weight column', description: 'Input channel Xc nhân đúng weight column W[:,c], vì vậy channel activation lớn chỉ ra weight cần bảo vệ.', impact: 'Thí nghiệm giữ 0.1–1% FP16 chứng minh signal, không phải format AWQ cuối.' },
      { kicker: 'GRID SEARCH · EQUATION 4–5', title: 'Chọn mức bảo vệ salient channel', description: 'AWQ giới hạn scale thành s=sₓ^α và tìm α giảm layer-output difference sau fake quantization.', impact: 'Scaling quá mạnh có thể tăng group step và làm weight không salient sai hơn.' },
      { kicker: 'PHÂN TÍCH SAI SỐ · EQUATION 2–3', title: 'Scale weight lên và activation xuống', description: 'W′=W·diag(s), X′=diag(s)⁻¹X nên W′X′=WX trong full precision.', impact: 'Salient weight lớn hơn chịu effective quantization error nhỏ hơn.' },
      { kicker: 'TRIỂN KHAI · WEIGHT ONLY', title: 'Quantize mọi scaled weight vào cùng format', description: 'Sau search, toàn bộ Q(W′) được lưu INT4 còn activation FP16; inverse scale được fuse khi có thể.', impact: 'Không cần FP16 exception mask, giữ packed layout cho W4A16 kernel.' }
    ],
    lut: [
      { kicker: 'SECTION 2.3 · WEIGHT FORMAT', title: 'Biểu diễn weight vector bằng binary plane', description: 'BCQ xấp xỉ weight bằng tổng binary vector có scale và bias tùy chọn.', impact: 'Kernel dùng trực tiếp bit plane và α, không tái dựng FP16 matrix.' },
      { kicker: 'SECTION 3.1 · ACTIVATION CHUNK', title: 'Chia activation thành subvector dài μ', description: 'Mỗi chunk tạo mọi signed sum có thể; μ=4 tương ứng bảng 2⁴ entry.', impact: 'μ lớn giảm lookup nhưng table size gấp đôi mỗi khi tăng một phần tử.' },
      { kicker: 'SECTION 3.1 · TÍNH TRƯỚC', title: 'Tạo partial dot product một lần mỗi chunk', description: 'Mỗi table entry là dot product giữa activation subvector và một sign pattern ±1.', impact: 'Table construction phải được amortize để không nuốt lợi ích.' },
      { kicker: 'FIGURE 2 · RETRIEVAL', title: 'Ghép μ bit làm lookup key', description: 'Pattern packed như 1011 chọn trực tiếp partial sum đã tính.', impact: 'Kernel tính từ compressed bit plane mà không materialize dequantized weight.' },
      { kicker: 'SECTION 3.1 · REDUCTION', title: 'Cộng lookup rồi áp scale và bias', description: 'Partial sum được cộng qua chunk/plane, nhân α và sửa bằng bias.', impact: 'Latency thật phụ thuộc LUT locality, shared memory, synchronization và occupancy.' }
    ],
    spin: [
      { kicker: 'FIGURE 2–3 · OUTLIER', title: 'Rotation phân tán năng lượng qua channel', description: 'Orthogonal R trải extreme value ra nhiều coordinate và giảm kurtosis.', impact: 'Quantizer dùng range hữu hạn đều hơn sau khi outlier channel biến mất.' },
      { kicker: 'FIGURE 1 · BẤT BIẾN', title: 'Chèn R và Rᵀ như một cặp triệt tiêu', description: 'Vì RᵀR=I, full-precision transformer function được giữ nguyên.', impact: 'Rotation thay đổi quantization error mà không đổi unquantized model.' },
      { kicker: 'FIGURE 4 · LEARNED ROTATION', title: 'Tối ưu basis thay vì dùng random draw', description: 'SpinQuant giảm quantized loss trong khi Cayley update giữ R orthogonal.', impact: 'Learned rotation tránh chênh lệch accuracy lớn giữa random rotation.' },
      { kicker: 'FIGURE 1 · BỐN VỊ TRÍ', title: 'Dùng absorbed và online rotation đúng chỗ', description: 'R1/R2 absorb vào weight; R3/R4 là online Hadamard cho KV cache và FFN activation.', impact: 'Online transform phải đủ rẻ để giữ lợi ích latency.' },
      { kicker: 'MỤC TIÊU TRIỂN KHAI', title: 'Quantize W, A và KV sau khi học basis', description: 'Đích cuối là network W4A4KV4 thực thi được với merged rotation và low-bit kernel.', impact: 'Giá trị của SpinQuant là thu hẹp gap accuracy khi quantize đồng thời ba tensor class.' }
    ],
    paro: [
      { kicker: 'FIGURE 1 · CHANNEL SCALE', title: 'Cân bằng magnitude trung bình giữa channel', description: 'Channel-wise scaling giảm isolated outlier trước khi pair rotation xử lý geometry cục bộ.', impact: 'Scale cung cấp range control toàn cục mà một stage pair rotation không có.' },
      { kicker: 'DEFINITION 1 · CẶP ĐỘC LẬP', title: 'Ghép channel không overlap trong một stage', description: 'Mỗi channel xuất hiện tối đa một lần nên mọi Givens pair chạy song song không dependency.', impact: 'Pair độc lập phù hợp với quantization group và GPU parallelism.' },
      { kicker: 'EQUATION 3–5 · GIVENS', title: 'Xoay đúng hai row bằng một angle học được', description: 'Givens transform trộn row i,j bằng sinθ/cosθ và giữ joint norm.', impact: 'Hai vectorized update thay dense matrix multiplication.' },
      { kicker: 'EQUATION 8 · CHUỖI', title: 'Xếp nhiều stage để lấy lại expressiveness', description: 'ParoQuant dùng nhiều pairing rời nhau rồi kết hợp channel-wise scaling.', impact: 'Tăng K mở rộng transform có thể đạt được trong khi từng stage vẫn song song.' },
      { kicker: 'FIGURE 3 · FUSED EXECUTION', title: 'Song song hóa theo token, group và pair', description: 'CUDA transform phân việc độc lập và giữ data nhỏ trong shared memory/register.', impact: 'Runtime transform phải giữ được lợi ích của packed INT4 GEMM phía sau.' }
    ],
    vla: [
      { kicker: 'FIGURE 2 · CONTROL TIMELINE', title: 'Khớp perception, inference và execution vào camera cadence', description: 'VLA đồng bộ nhận frame, chạy vision/VLM/action rồi execute một horizon trước inference tiếp theo.', impact: 'Mục tiêu là closed-loop response budget, không phải throughput model riêng lẻ.' },
      { kicker: 'EQUATION 2–4 · PERFORMANCE MODEL', title: 'Mô hình hóa compute, memory và network limit', description: 'VLA-Perf cộng operator latency; roofline lấy local cost lớn nhất và placement từ xa thêm network latency.', impact: 'Cùng model có thể đổi bottleneck khi hardware hoặc placement thay đổi.' },
      { kicker: 'PHÂN RÃ COMPONENT', title: 'Tách latency cho vision, VLM và action', description: 'Mỗi component có token count và arithmetic intensity khác nhau.', impact: 'Chỉ tối ưu component đang sở hữu end-to-end latency trên thiết bị đích.' },
      { kicker: 'FIGURE 6 · ACTION EXPERT', title: 'Denoising step và action chunk không có cùng chi phí', description: 'Tăng step 5× cần 5× forward pass; tăng token 5× chỉ thêm khoảng 40% trong cấu hình memory-bound của paper.', impact: 'Giảm model iteration có thể quan trọng hơn rút ngắn action chunk.' },
      { kicker: 'SECTION 4.9 · BẤT ĐỒNG BỘ', title: 'Overlap inference với execution để tăng throughput', description: 'Hệ async suy luận command mới khi robot đang execute chunk trước.', impact: 'Throughput tăng nhưng action dùng observation cũ hơn; phải đánh giá staleness và stability.' }
    ],
    debug: [
      { kicker: 'SYMPTOM KHÔNG PHẢI DIAGNOSIS', title: 'Engine build thành công vẫn có thể sinh output rác', description: 'Conversion chỉ chứng minh TensorRT chấp nhận graph; fusion, packed weight, mapping hoặc buffer vẫn có thể sai số.', impact: 'Bốn root cause tạo cùng garbled token nên final text không chỉ ra subsystem lỗi.' },
      { kicker: 'ĐỊNH VỊ', title: 'So tensor cho đến divergence đầu tiên', description: 'Đi từ framework reference qua export và TensorRT intermediate; dừng ở cosine collapse sớm nhất.', impact: 'Issue #151 thấy V projection đúng nhưng V cache sai, loại trừ weight và GEMM.' },
      { kicker: 'BỐN FIX · BỐN NGUYÊN NHÂN', title: 'Tách lỗi compiler, quantizer và exporter', description: 'Các lỗi gồm Myelin FP16, CASK NVFP4, AWQ zero-point folding và checkpoint key không match.', impact: 'Mỗi nguyên nhân cần fix khác nhau; workaround rộng sẽ che regression.' },
      { kicker: 'A/B CÓ KIỂM SOÁT', title: 'Giữ graph/data cố định và chỉ đổi một quyết định', description: 'Chỉ expose V projection làm cache cosine tăng từ khoảng .015 lên 1.0.', impact: 'Materialization test chỉ vào tensor lifetime, reuse hoặc generated fusion thay vì model math.' },
      { kicker: 'NGƯỠNG XÁC MINH', title: 'Yêu cầu bằng chứng tensor, output và hiệu năng', description: 'Fix hoàn chỉnh phải khôi phục intermediate agreement, generation đúng và latency chấp nhận được.', impact: 'Workaround chưa hoàn chỉnh nếu chỉ làm một prompt đọc được hoặc tắt optimized path.' }
    ]
  };

  if (isVietnamese) {
    Object.entries(visualTranslationsVi).forEach(([kind, translations]) => {
      visualExplanations[kind]?.forEach((entry, index) => Object.assign(entry, translations[index] || {}));
    });
  }

  document.querySelectorAll('[data-article-visual]').forEach((visual) => {
    const entries = visualExplanations[visual.dataset.visualKind] || [];
    const groups = [...visual.querySelectorAll('[data-visual-step]')];
    const inspector = visual.querySelector('[data-visual-inspector]');
    const kicker = inspector?.querySelector('[data-inspector-kicker]');
    const title = inspector?.querySelector('[data-inspector-title]');
    const description = inspector?.querySelector('[data-inspector-description]');
    const impact = inspector?.querySelector('[data-inspector-impact]');
    const status = visual.querySelector('[data-visual-status]');
    const inspectorClose = visual.querySelector('[data-inspector-close]');

    const clearSelection = () => {
      clearTimeout(visual.explainTimer);
      visual.classList.remove('has-selection');
      inspector?.classList.remove('dock-top');
      groups.forEach((group) => group.classList.remove('is-related'));
      visual.querySelectorAll('.explainable').forEach((element) => {
        element.classList.remove('is-selected', 'is-explaining');
        element.setAttribute('aria-pressed', 'false');
      });
      visual.querySelectorAll('.is-explaining').forEach((element) => element.classList.remove('is-explaining'));
      inspector?.classList.remove('is-updating');
      if (status) status.textContent = isVietnamese ? 'Chưa chọn thành phần' : 'No component selected';
    };

    const selectEntry = (entry, index) => {
      const viewportPosition = { x: window.scrollX, y: window.scrollY };
      clearTimeout(visual.explainTimer);
      visual.classList.add('has-selection');
      groups.forEach((group) => group.classList.remove('is-related'));
      visual.querySelectorAll('.is-explaining').forEach((element) => element.classList.remove('is-explaining'));
      visual.querySelectorAll('.explainable').forEach((element) => {
        element.classList.remove('is-selected', 'is-explaining');
        element.setAttribute('aria-pressed', 'false');
      });
      entry.elements.forEach((element) => {
        element.classList.add('is-selected');
        element.setAttribute('aria-pressed', 'true');
        element.closest('[data-visual-step]')?.classList.add('is-related');
      });
      entry.motionElements.forEach((element) => element.closest('[data-visual-step]')?.classList.add('is-related'));
      void visual.offsetWidth;
      entry.motionElements.forEach((element) => element.classList.add('is-explaining'));
      inspector?.classList.remove('is-updating');
      void inspector?.offsetWidth;
      inspector?.classList.add('is-updating');
      if (kicker) kicker.textContent = entry.kicker;
      if (title) title.textContent = entry.title;
      if (description) description.textContent = entry.description;
      if (impact) impact.textContent = entry.impact;
      if (status) status.textContent = `${isVietnamese ? 'Đã chọn' : 'Selected'} ${String(index + 1).padStart(2, '0')} / ${String(entries.length).padStart(2, '0')} · ${entry.title}`;
      const selectedBounds = entry.elements[0]?.getBoundingClientRect();
      inspector?.classList.toggle('dock-top', Boolean(selectedBounds && selectedBounds.top + selectedBounds.height / 2 > window.innerHeight / 2));
      const keepViewportStable = () => {
        if (Math.abs(window.scrollY - viewportPosition.y) < 1 && Math.abs(window.scrollX - viewportPosition.x) < 1) return;
        const previousBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        window.scrollTo(viewportPosition.x, viewportPosition.y);
        document.documentElement.style.scrollBehavior = previousBehavior;
      };
      keepViewportStable();
      window.requestAnimationFrame(keepViewportStable);
      window.setTimeout(keepViewportStable, 80);
      visual.explainTimer = window.setTimeout(() => {
        entry.motionElements.forEach((element) => element.classList.remove('is-explaining'));
      }, 2800);
    };

    entries.forEach((entry, index) => {
      entry.elements = [...visual.querySelectorAll(entry.selector)];
      entry.motionElements = entry.motionSelector ? [...visual.querySelectorAll(entry.motionSelector)] : entry.elements;
      entry.elements.forEach((element) => {
        element.classList.add('explainable');
        element.tabIndex = 0;
        element.setAttribute('role', 'button');
        element.setAttribute('aria-pressed', 'false');
        element.setAttribute('aria-label', `${isVietnamese ? 'Giải thích' : 'Explain'} ${entry.title}`);
        element.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          selectEntry(entry, index);
        });
        element.addEventListener('keydown', (event) => {
          if (!['Enter', ' '].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          selectEntry(entry, index);
        });
      });
    });

    inspectorClose?.addEventListener('click', clearSelection);
    visual.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && visual.classList.contains('has-selection')) clearSelection();
    });
    const visualVisibility = new IntersectionObserver(([entry]) => {
      visual.classList.toggle('is-in-view', entry.isIntersecting);
    }, { threshold: .05 });
    visualVisibility.observe(visual);
  });

  const postPage = document.querySelector('[data-post-page]');
  const postContent = document.querySelector('[data-post-content]');
  if (postPage && postContent) {
    const words = postContent.innerText.trim().split(/\s+/).filter(Boolean).length;
    const headings = [...postContent.querySelectorAll('h2')];
    const readMinutes = Math.max(1, Math.ceil(words / 220));
    const minuteOutput = postPage.querySelector('[data-read-minutes]');
    const sectionOutput = postPage.querySelector('[data-section-count]');
    if (minuteOutput) minuteOutput.textContent = readMinutes;
    if (sectionOutput) sectionOutput.textContent = headings.length;

    const usedIds = new Set();
    const slugify = (text, index) => {
      const base = text.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-') || `section-${index + 1}`;
      let slug = base;
      let suffix = 2;
      while (usedIds.has(slug) || document.getElementById(slug)) slug = `${base}-${suffix++}`;
      usedIds.add(slug);
      return slug;
    };

    const toc = postPage.querySelector('[data-post-toc]');
    headings.forEach((heading, index) => {
      if (!heading.id) heading.id = slugify(heading.textContent, index);
      if (!toc) return;
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.dataset.index = String(index + 1).padStart(2, '0');
      link.textContent = heading.textContent;
      link.setAttribute('aria-label', `Section ${index + 1}: ${heading.textContent}`);
      toc.append(link);
    });

    postContent.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.classList.contains('post-table-shell')) return;
      const shell = document.createElement('div');
      shell.className = 'post-table-shell';
      table.parentNode.insertBefore(shell, table);
      shell.append(table);
    });

    postContent.querySelectorAll(':scope > h2, :scope > blockquote, :scope > .post-table-shell, :scope > ul, :scope > ol').forEach((element) => {
      element.classList.add('article-reveal');
    });

    const progressBar = document.querySelector('[data-reading-progress]');
    const mapBar = postPage.querySelector('[data-map-progress]');
    const mapPercent = postPage.querySelector('[data-map-percent]');
    const updateReadingProgress = () => {
      const start = postContent.getBoundingClientRect().top + window.scrollY - window.innerHeight * .22;
      const distance = Math.max(1, postContent.offsetHeight - window.innerHeight * .55);
      const progress = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
      const percentage = `${Math.round(progress * 100)}%`;
      if (progressBar) progressBar.style.width = percentage;
      if (mapBar) mapBar.style.width = percentage;
      if (mapPercent) mapPercent.textContent = percentage;
    };

    let readingFrame = null;
    window.addEventListener('scroll', () => {
      if (readingFrame !== null) return;
      readingFrame = window.requestAnimationFrame(() => {
        updateReadingProgress();
        readingFrame = null;
      });
    }, { passive: true });
    window.addEventListener('resize', updateReadingProgress, { passive: true });
    window.addEventListener('pageshow', updateReadingProgress);
    updateReadingProgress();

    if (toc && headings.length) {
      const tocLinks = [...toc.querySelectorAll('a')];
      const activateSection = (id) => {
        tocLinks.forEach((link) => {
          const active = link.getAttribute('href') === `#${id}`;
          link.classList.toggle('is-active', active);
          if (active) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      };
      activateSection(headings[0].id);
      const sectionObserver = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) activateSection(visible[0].target.id);
      }, { rootMargin: '-18% 0px -68% 0px', threshold: 0 });
      headings.forEach((heading) => sectionObserver.observe(heading));
    }
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal, .article-reveal').forEach((element) => observer.observe(element));

  const glow = document.querySelector('.page-glow');
  window.addEventListener('pointermove', (event) => {
    if (!glow) return;
    glow.style.setProperty('--x', `${event.clientX}px`);
    glow.style.setProperty('--y', `${event.clientY}px`);
  }, { passive: true });

  const topButton = document.querySelector('[data-scroll-top]');
  const updateTopButton = () => {
    if (!topButton) return;
    const isVisible = window.scrollY > 180;
    topButton.classList.toggle('is-visible', isVisible);
    topButton.setAttribute('aria-hidden', String(!isVisible));
    topButton.tabIndex = isVisible ? 0 : -1;
  };

  let topButtonFrame = null;
  window.addEventListener('scroll', () => {
    if (topButtonFrame !== null) return;
    topButtonFrame = window.requestAnimationFrame(() => {
      updateTopButton();
      topButtonFrame = null;
    });
  }, { passive: true });
  window.addEventListener('pageshow', updateTopButton);
  window.addEventListener('load', updateTopButton);
  updateTopButton();

  topButton?.addEventListener('click', () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  const lab = document.querySelector('[data-precision-lab]');
  if (lab) {
    const datasets = {
      rtx: {
        context: 'Qwen3-ASR-1.7B · vLLM · RTX 5090',
        defaultMethod: 'fp8',
        methods: [
          { id: 'bf16', name: 'BF16', detail: 'BASELINE', memory: 3.87, rtf: 0.0190, throughput: 15.42, throughputUnit: 'req/s', wer: 7.34, summary: 'Reference precision and accuracy, with the largest memory footprint.', summaryVi: 'Precision và accuracy tham chiếu, đồng thời dùng nhiều bộ nhớ nhất.' },
          { id: 'fp8', name: 'FP8', detail: 'W8A8', memory: 2.55, rtf: 0.0152, throughput: 19.37, throughputUnit: 'req/s', wer: 7.60, summary: 'The strongest throughput result with 34% less memory and a small WER change.', summaryVi: 'Thông lượng tốt nhất, giảm 34% bộ nhớ với thay đổi WER nhỏ.' },
          { id: 'nvfp4', name: 'NVFP4', detail: '4-BIT', memory: 1.99, rtf: 0.0186, throughput: 15.77, throughputUnit: 'req/s', wer: 10.73, summary: 'The smallest footprint, trading more recognition accuracy for memory efficiency.', summaryVi: 'Dung lượng nhỏ nhất, đổi một phần accuracy nhận dạng lấy hiệu quả bộ nhớ.' }
        ]
      },
      jetson: {
        context: 'Qwen3-ASR-1.7B · TensorRT Edge-LLM · Jetson Orin Nano 8GB',
        defaultMethod: 'int4-awq',
        methods: [
          { id: 'int8-sq', name: 'INT8 SmoothQuant', detail: 'W8A8', memory: 4.2, rtf: 0.2190, throughput: 1.29, throughputUnit: 'samples/s', wer: 9.07, summary: 'INT8 activations and weights for a production-friendly Tensor Core path.', summaryVi: 'Activation và weight INT8 cho đường Tensor Core thân thiện với production.' },
          { id: 'int4-awq', name: 'INT4 AWQ', detail: 'W4A16', memory: 3.3, rtf: 0.1641, throughput: 1.72, throughputUnit: 'samples/s', wer: 8.69, summary: 'Lower memory, lower RTF, higher throughput, and slightly better WER in this edge run.', summaryVi: 'Bộ nhớ và RTF thấp hơn, throughput cao hơn, WER tốt hơn nhẹ trong lần chạy edge này.' }
        ]
      }
    };

    const methodRoot = lab.querySelector('.lab-methods');
    const platformButtons = [...lab.querySelectorAll('[data-platform]')];
    const output = {
      name: lab.querySelector('[data-lab-name]'),
      summary: lab.querySelector('[data-lab-summary]'),
      context: lab.querySelector('[data-lab-context]'),
      memory: lab.querySelector('[data-metric-memory]'),
      rtf: lab.querySelector('[data-metric-rtf]'),
      throughput: lab.querySelector('[data-metric-throughput]'),
      wer: lab.querySelector('[data-metric-wer]'),
      memoryBar: lab.querySelector('[data-bar-memory]'),
      rtfBar: lab.querySelector('[data-bar-rtf]'),
      throughputBar: lab.querySelector('[data-bar-throughput]'),
      werBar: lab.querySelector('[data-bar-wer]')
    };

    let activePlatform = 'rtx';

    const percent = (value, values) => {
      const max = Math.max(...values);
      return `${Math.max(10, (value / max) * 100)}%`;
    };

    const updateReadout = (method) => {
      const methods = datasets[activePlatform].methods;
      output.name.textContent = method.name;
      output.summary.textContent = isVietnamese ? method.summaryVi : method.summary;
      output.context.textContent = datasets[activePlatform].context;
      output.memory.textContent = `${method.memory.toFixed(method.memory % 1 ? 2 : 0)} GB`;
      output.rtf.textContent = method.rtf.toFixed(4);
      output.throughput.textContent = `${method.throughput.toFixed(2)} ${method.throughputUnit}`;
      output.wer.textContent = `${method.wer.toFixed(2)}%`;
      output.memoryBar.style.width = percent(method.memory, methods.map((item) => item.memory));
      output.rtfBar.style.width = percent(method.rtf, methods.map((item) => item.rtf));
      output.throughputBar.style.width = percent(method.throughput, methods.map((item) => item.throughput));
      output.werBar.style.width = percent(method.wer, methods.map((item) => item.wer));
      methodRoot.querySelectorAll('.lab-method').forEach((button) => {
        const selected = button.dataset.method === method.id;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    };

    const renderMethods = () => {
      const data = datasets[activePlatform];
      methodRoot.replaceChildren(...data.methods.map((method) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lab-method';
        button.dataset.method = method.id;
        button.setAttribute('aria-pressed', 'false');
        button.innerHTML = `<span>${method.name}</span><small>${method.detail}</small>`;
        button.addEventListener('click', () => updateReadout(method));
        return button;
      }));
      updateReadout(data.methods.find((method) => method.id === data.defaultMethod));
    };

    platformButtons.forEach((button) => {
      button.addEventListener('click', () => {
        activePlatform = button.dataset.platform;
        platformButtons.forEach((item) => {
          const selected = item === button;
          item.classList.toggle('is-active', selected);
          item.setAttribute('aria-selected', String(selected));
        });
        renderMethods();
      });
    });

    renderMethods();
  }
});
