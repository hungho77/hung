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

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));

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
