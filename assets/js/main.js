document.addEventListener('DOMContentLoaded', () => {
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
      { selector: '.quant-spectrum', kicker: 'REPRESENTATION', title: 'Continuous floating-point values', description: 'Floating point stores a wide dynamic range with sign, exponent, and mantissa. Nearby weights can remain numerically distinct.', impact: 'This preserves accuracy, but every decode step must move more weight bytes from memory.' },
      { selector: '.visual-transfer', kicker: 'TRANSFORMATION', title: 'Scale, round, and clip', description: 'A scale maps the floating-point range onto integer codes: q = clip(round(x / s) + z). Values between codes are rounded; values outside the range are clipped.', impact: 'The scale is not bookkeeping. It decides which information survives quantization.' },
      { selector: '.quant-grid', kicker: 'REPRESENTATION', title: 'Packed low-bit codes', description: 'The model now stores discrete codes rather than arbitrary real values. INT4 gives sixteen possible codes per quantization group.', impact: 'Memory falls only when the codes are actually packed instead of stored in a larger container.' },
      { selector: '.visual-result', kicker: 'RUNTIME', title: 'A matching kernel closes the loop', description: 'Compression becomes speed only when the inference kernel reads the packed dtype and performs the correct scale or dequantization work efficiently.', impact: 'A smaller checkpoint without a native kernel can save disk space while adding latency.' }
    ],
    attention: [
      { selector: '.token-stream', kicker: 'INPUT', title: 'Token states X', description: 'Each token enters attention as a d_model-dimensional hidden vector. The whole sequence is processed together during training or prefill.', impact: 'Sequence length controls both the score-matrix size and KV-cache growth.' },
      { selector: '.qkv-stack span:nth-child(1)', kicker: 'PROJECTION', title: 'Query: what this token needs', description: 'The query vector describes the information the current token is trying to retrieve from the sequence.', impact: 'At decode time, the newest query is compared with every cached key.' },
      { selector: '.qkv-stack span:nth-child(2)', kicker: 'PROJECTION', title: 'Key: what each token offers', description: 'Keys act like learned addresses. Their dot product with a query determines how relevant each source token is.', impact: 'Cached keys avoid recomputation, but consume memory proportional to context length.' },
      { selector: '.qkv-stack span:nth-child(3)', kicker: 'PROJECTION', title: 'Value: the payload to retrieve', description: 'Values carry the information that will be mixed after the attention weights are known.', impact: 'Values form the other half of the KV cache and often dominate long-context traffic.' },
      { selector: '.attention-matrix', kicker: 'COMPUTE', title: 'Scaled attention scores', description: 'QKᵀ / √dₖ creates one compatibility score for each query–key pair. Softmax turns each row into a normalized retrieval distribution.', impact: 'Materializing this n × n matrix is why naive attention becomes expensive at long sequence lengths.' },
      { selector: '.attention-transfer', kicker: 'REDUCTION', title: 'Weighted value mixture', description: 'The softmax probabilities weight the value vectors, then reduce them into one context vector per query.', impact: 'Efficient attention kernels fuse this path to avoid repeatedly writing the score matrix to memory.' },
      { selector: '.context-token', kicker: 'OUTPUT', title: 'Context-aware token', description: 'The output contains the original token’s newly retrieved context and continues through the output projection and residual path.', impact: 'During autoregressive decoding, this result produces one step before the next token can begin.' }
    ],
    int8: [
      { selector: '.range-chart', kicker: 'CALIBRATION', title: 'Observed tensor distribution', description: 'Calibration records representative activation ranges instead of assuming every possible value is equally likely.', impact: 'Unrepresentative calibration data produces ranges that fail on real prompts, images, or robot trajectories.' },
      { selector: '.visual-transfer', kicker: 'CALIBRATION', title: 'Choose the quantization range', description: 'A narrow range gives fine steps but clips outliers. A wide range preserves outliers but increases rounding error for common values.', impact: 'INT8 accuracy is largely a controlled trade-off between clipping and rounding error.' },
      { selector: '.int8-ladder', kicker: 'REPRESENTATION', title: 'Map values onto the INT8 grid', description: 'Scale and zero-point map real values to integer levels. Per-channel weight scales usually follow each output channel more closely than one tensor-wide scale.', impact: 'Granularity often matters as much as the nominal eight-bit dtype.' },
      { selector: '.visual-result', kicker: 'LIMIT', title: '256 representable codes', description: 'Signed INT8 provides 256 discrete codes. The scale determines how those codes cover the original real-valued range.', impact: 'The useful question is not “does INT8 work?” but which tensors, scales, and kernels make it work.' }
    ],
    smoothquant: [
      { selector: '.sq-before', kicker: 'BEFORE · HARD', title: 'Activation outliers waste the INT8 range', description: 'A few input channels have magnitudes far above the rest. Per-tensor activation quantization must cover those peaks, so most values receive very few effective levels.', impact: 'The outlier channel—not the average value—sets the activation scale and causes large rounding error.' },
      { selector: '.sq-transform', motionSelector: '.sq-before, .sq-transform, .sq-after, .sq-weight-path', kicker: 'OFFLINE TRANSFORMATION', title: 'Migrate scale variance from X to W', description: 'For every input channel j, SmoothQuant divides Xⱼ by sⱼ and multiplies the matching weight row Wⱼ by sⱼ. The animation moves difficulty from the hard activation chart into weights.', impact: 'With α = 0.5, sⱼ balances the maximum magnitudes of the corresponding activation and weight channels.' },
      { selector: '.sq-after', kicker: 'AFTER · EASY', title: 'Smoothed activations use INT8 levels evenly', description: 'After X̂ = X · diag(s)⁻¹, the activation outlier is suppressed and channel ranges become comparable. The chart transitions from the original hard distribution to the smoothed one.', impact: 'Static per-tensor or per-token activation quantization now wastes far fewer codes on rare peaks.' },
      { selector: '.sq-weight-path', kicker: 'WEIGHT SIDE', title: 'Adjusted weights absorb the variance', description: 'Ŵ = diag(s) · W carries the inverse scale, so some weight channels grow. The original flat distribution becomes more varied but remains quantizable.', impact: 'Weights start from a flat, quantization-friendly distribution; hardware-efficient per-output-channel weight scales provide additional tolerance.' },
      { selector: '.sq-equivalence', kicker: 'INVARIANT', title: 'The linear layer is unchanged', description: 'X̂Ŵ = (X · diag(s)⁻¹)(diag(s) · W) = XW. SmoothQuant changes tensor ranges, not the full-precision function.', impact: 'The smoothing factors are calibrated and fused into previous operations offline, so runtime receives smooth activations without an extra scaling kernel.' }
    ],
    gptq: [
      { selector: '.gptq-grid:not(.corrected)', kicker: 'INPUT', title: 'A block of full-precision weights', description: 'GPTQ processes a layer in blocks so the reconstruction problem remains tractable on large models.', impact: 'The objective is to preserve layer outputs on calibration activations, not minimize raw weight distance.' },
      { selector: '.gptq-arrow', kicker: 'GREEDY STEP', title: 'Quantize one column', description: 'GPTQ commits a subset of weights to low-bit values, then measures the output error introduced by that decision.', impact: 'A naive greedy update would leave this error behind and compound it across the block.' },
      { selector: '.error-wave', kicker: 'SECOND ORDER', title: 'Redistribute error with curvature', description: 'Inverse-Hessian information estimates which remaining weights can compensate for the committed quantization error.', impact: 'Sensitive directions receive smaller disturbance than directions the calibration data considers redundant.' },
      { selector: '.corrected', kicker: 'OUTPUT', title: 'Compensated low-bit block', description: 'The remaining weights are updated before their own quantization step, preserving the block’s response more closely.', impact: 'This sequential dependency improves accuracy but makes GPTQ an offline weight-only method.' }
    ],
    awq: [
      { selector: '.activation-probe', kicker: 'CALIBRATION', title: 'Activations reveal sensitive channels', description: 'AWQ observes which weight channels repeatedly receive large activation magnitudes on calibration samples.', impact: 'Sensitivity is inferred from how weights are used, not from weight magnitude alone.' },
      { selector: '.channel-bank', kicker: 'SEARCH', title: 'Search channel-wise scaling', description: 'A small scaling search reduces quantization error around salient channels while keeping a regular weight-only representation.', impact: 'Regular structure is easier to map onto production kernels than arbitrary mixed precision.' },
      { selector: '.awq-shield', kicker: 'PROTECTION', title: 'Protect the salient one percent', description: 'A small fraction of channels can dominate output quality. AWQ scales them before quantization rather than storing them at a separate dtype.', impact: 'Protecting the right channels preserves accuracy without destroying kernel regularity.' },
      { selector: '.visual-result', kicker: 'RUNTIME', title: 'W4A16 weight-only execution', description: 'Weights are packed to four bits while activations remain FP16 or BF16. The kernel dequantizes weights close to the matrix operation.', impact: 'This targets bandwidth-bound decoding, where moving weights is often more expensive than arithmetic.' }
    ],
    lut: [
      { selector: '.bit-packets', kicker: 'STORAGE', title: 'Bit-packed weight codes', description: 'Binary-coded quantization represents each low-bit weight using a small combination of basis values.', impact: 'Packed codes reduce weight traffic, the dominant cost in batch-one decoding.' },
      { selector: '.visual-transfer:nth-of-type(2)', kicker: 'ADDRESSING', title: 'Use codes as table addresses', description: 'Instead of reconstructing every weight, the packed bit pattern selects a precomputed partial result.', impact: 'The lookup replaces repeated dequantization arithmetic with indexed access.' },
      { selector: '.lookup-table', kicker: 'PRECOMPUTE', title: 'Lookup table of partial products', description: 'Small combinations of activations and basis values are computed once and stored in a table for reuse.', impact: 'The table is useful only while its access pattern remains cheaper than conventional multiply–accumulate.' },
      { selector: '.visual-transfer:nth-of-type(4)', kicker: 'REDUCTION', title: 'Accumulate selected entries', description: 'Each packed code retrieves the corresponding table entry; selected partial products are accumulated into the output.', impact: 'Performance depends on lookup locality, packing overhead, and the target GPU architecture.' },
      { selector: '.lut-output', kicker: 'OUTPUT', title: 'GEMM without reconstructing weights', description: 'The output is formed directly from table entries, so a separate dequantized weight tensor is never materialized.', impact: 'Avoiding reconstruction is the central systems claim of LUT-GEMM.' }
    ],
    spin: [
      { selector: '.rotation-space.before', kicker: 'PROBLEM', title: 'Outliers aligned with unlucky axes', description: 'Quantization acts along coordinate axes. A few large coordinates can stretch the range even when the information itself is not inherently sparse.', impact: 'The same model can be easy or hard to quantize depending on its basis.' },
      { selector: '.rotation-operator', kicker: 'TRANSFORMATION', title: 'Learn an orthogonal rotation', description: 'SpinQuant learns a rotation that redistributes energy while preserving the full-precision function through equivalent transformations.', impact: 'Orthogonality preserves geometry while changing which values the quantizer sees.' },
      { selector: '.rotation-space.after', kicker: 'RESULT', title: 'Balanced coordinates', description: 'After rotation, extreme values are spread across dimensions and the per-tensor range is used more evenly.', impact: 'Weights, activations, and KV cache can survive aggressive W4A4KV4 quantization more reliably.' },
      { selector: '.visual-callout', kicker: 'DEPLOYMENT', title: 'The rotation must be executable', description: 'A mathematically good basis is not enough: rotations must be fused, absorbed into weights, or implemented with acceptable overhead.', impact: 'End-to-end latency decides whether the quantization method is actually useful.' }
    ],
    paro: [
      { selector: '.pair-bank', kicker: 'STRUCTURE', title: 'Split channels into pairs', description: 'ParoQuant partitions channels into independent two-dimensional subspaces rather than learning one dense rotation.', impact: 'Local structure sharply reduces calibration and execution complexity.' },
      { selector: '.pair-rotations', kicker: 'TRANSFORMATION', title: 'Apply a 2 × 2 Givens rotation', description: 'Each pair learns one angle θ that redistributes its two channel magnitudes before quantization.', impact: 'A small rotation can tame local outliers while remaining cheap enough to integrate into kernels.' },
      { selector: '.int4-lanes', kicker: 'LAYOUT', title: 'Keep regular INT4 lanes', description: 'Independent pair rotations preserve a predictable packed layout for low-bit execution.', impact: 'Hardware-friendly regularity matters more than fake-quantized accuracy alone.' },
      { selector: '.visual-result', kicker: 'TRADE-OFF', title: 'Structured flexibility', description: 'Pairwise rotations are less expressive than a dense transform, but far easier to calibrate and deploy.', impact: 'The method trades a little mathematical freedom for a realistic path to TensorRT execution.' }
    ],
    vla: [
      { selector: '.vla-pipeline > div:nth-of-type(1)', kicker: 'INPUT', title: 'Camera and sensor input', description: 'Images arrive at a fixed control cadence and must be decoded, normalized, and transferred before model inference begins.', impact: 'Input resolution and camera count determine the token workload before the VLA sees a single instruction.' },
      { selector: '.vla-pipeline > div:nth-of-type(2)', kicker: 'VISION', title: 'Vision encoder', description: 'The encoder converts pixels into visual tokens. High resolution can create hundreds or thousands of tokens per frame.', impact: 'Token reduction here lowers downstream attention cost, KV-cache size, and latency together.' },
      { selector: '.vla-pipeline > div:nth-of-type(3)', kicker: 'REASONING', title: 'Vision-language backbone', description: 'The backbone combines visual tokens with language and state context to produce task-aware hidden representations.', impact: 'Prefill is compute-heavy; autoregressive decoding is often weight- and cache-bandwidth bound.' },
      { selector: '.vla-pipeline > div:nth-of-type(4)', kicker: 'CONTROL', title: 'Action head', description: 'The action head converts model state into discrete actions, trajectories, or continuous robot controls.', impact: 'Even a small head must meet the control-loop deadline and preserve temporal stability.' },
      { selector: '.bottleneck-meter', kicker: 'MEASUREMENT', title: 'The bottleneck moves', description: 'Vision, language, and action stages have different shapes, batch sizes, and hardware utilization. Their shares change with the workload.', impact: 'Optimize measured stage latency rather than the operator that is currently fashionable.' },
      { selector: '.visual-callout', kicker: 'SYSTEM RULE', title: 'Optimize the critical path', description: 'End-to-end control latency includes preprocessing, transfers, model stages, synchronization, and postprocessing.', impact: 'A faster model kernel is irrelevant if another stage still determines the robot’s response time.' }
    ],
    debug: [
      { selector: '.debug-graph', kicker: 'SYMPTOM', title: 'A valid engine emits garbled tokens', description: 'Build success proves graph conversion completed; it does not prove that fused code, packed weights, or exported parameters are correct.', impact: 'One visible symptom can hide several independent defects.' },
      { selector: '.debug-branches i:nth-child(1), .debug-probes span:nth-child(1)', kicker: 'FIX 01 · MYELIN', title: 'Horizontal FC fusion miscompile', description: 'On TensorRT 10.13 and sm_110, fusing gate_proj and up_proj corrupted FP16 output. Disabling that exact fusion restored correct generation.', impact: 'NVIDIA’s maintainer confirmed the proposed version-gate fix would be applied in a later release.' },
      { selector: '.debug-branches i:nth-child(2), .debug-probes span:nth-child(2)', kicker: 'FIX 02 · CASK', title: 'NVFP4 epilogue fusion', description: 'NVFP4 became corrupt when CASK fused two or more epilogues into one GEMM. Limiting fusion to one preserved the same tactic pool and fixed output.', impact: 'The controlled change isolated generated epilogue code instead of merely swapping tactics.' },
      { selector: '.debug-branches i:nth-child(3), .debug-probes span:nth-child(3)', kicker: 'FIX 03 · AWQ', title: 'Lossy asymmetric zero-points', description: 'Folding zero-points into four-bit nibbles and clamping to [0, 15] clipped important weights whenever a group zero-point was not eight.', impact: 'An exact runtime correction restored cosine similarity to 1.00000000 apart from FP16 rounding.' },
      { selector: '.debug-branches i:nth-child(4), .debug-probes span:nth-child(4)', kicker: 'FIX 04 · EXPORT', title: 'Random InternVL3 text weights', description: 'The exporter silently matched none of the InternLM2 keys, then produced a complete ONNX graph initialized with random parameters.', impact: 'Bit-exact checkpoint mapping must be verified before debugging the runtime engine.' },
      { selector: '.debug-output', kicker: 'METHOD', title: 'Isolate, patch, verify', description: 'Change one variable, reproduce the correction, then validate at tensor, logits, and generated-output levels.', impact: 'Controlled experiments turn “TensorRT is broken” into a precise, reviewable fix.' }
    ]
  };

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
      inspector?.classList.remove('is-updating');
      if (status) status.textContent = 'No component selected';
    };

    const selectEntry = (entry, index) => {
      const viewportPosition = { x: window.scrollX, y: window.scrollY };
      clearTimeout(visual.explainTimer);
      visual.classList.add('has-selection');
      groups.forEach((group) => group.classList.remove('is-related'));
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
      if (status) status.textContent = `Selected ${String(index + 1).padStart(2, '0')} / ${String(entries.length).padStart(2, '0')} · ${entry.title}`;
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
        element.setAttribute('aria-label', `Explain ${entry.title}`);
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
          { id: 'bf16', name: 'BF16', detail: 'BASELINE', memory: 3.87, rtf: 0.0190, throughput: 15.42, throughputUnit: 'req/s', wer: 7.34, summary: 'Reference precision and accuracy, with the largest memory footprint.' },
          { id: 'fp8', name: 'FP8', detail: 'W8A8', memory: 2.55, rtf: 0.0152, throughput: 19.37, throughputUnit: 'req/s', wer: 7.60, summary: 'The strongest throughput result with 34% less memory and a small WER change.' },
          { id: 'nvfp4', name: 'NVFP4', detail: '4-BIT', memory: 1.99, rtf: 0.0186, throughput: 15.77, throughputUnit: 'req/s', wer: 10.73, summary: 'The smallest footprint, trading more recognition accuracy for memory efficiency.' }
        ]
      },
      jetson: {
        context: 'Qwen3-ASR-1.7B · TensorRT Edge-LLM · Jetson Orin Nano 8GB',
        defaultMethod: 'int4-awq',
        methods: [
          { id: 'int8-sq', name: 'INT8 SmoothQuant', detail: 'W8A8', memory: 4.2, rtf: 0.2190, throughput: 1.29, throughputUnit: 'samples/s', wer: 9.07, summary: 'INT8 activations and weights for a production-friendly Tensor Core path.' },
          { id: 'int4-awq', name: 'INT4 AWQ', detail: 'W4A16', memory: 3.3, rtf: 0.1641, throughput: 1.72, throughputUnit: 'samples/s', wer: 8.69, summary: 'Lower memory, lower RTF, higher throughput, and slightly better WER in this edge run.' }
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
      output.summary.textContent = method.summary;
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
