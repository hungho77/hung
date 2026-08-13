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

  document.querySelectorAll('[data-article-visual]').forEach((visual) => {
    const button = visual.querySelector('[data-visual-toggle]');
    const label = button?.querySelector('span');
    const canvas = visual.querySelector('.visual-canvas');
    const phaseButtons = [...visual.querySelectorAll('[data-visual-phase]')];
    button?.addEventListener('click', () => {
      const paused = visual.classList.toggle('is-paused');
      button.setAttribute('aria-pressed', String(paused));
      button.setAttribute('aria-label', paused ? 'Play concept animation' : 'Pause concept animation');
      if (label) label.textContent = paused ? 'Play motion' : 'Pause motion';
    });
    phaseButtons.forEach((phaseButton) => {
      phaseButton.addEventListener('click', () => {
        const phase = phaseButton.dataset.visualPhase;
        const groups = [...visual.querySelectorAll('[data-visual-step]')];
        if (phase === 'all') {
          canvas?.removeAttribute('data-phase');
          groups.forEach((group) => {
            group.style.removeProperty('opacity');
            group.style.removeProperty('filter');
          });
        } else {
          canvas?.setAttribute('data-phase', phase);
          groups.forEach((group) => {
            const active = group.dataset.visualStep === phase;
            group.style.setProperty('opacity', active ? '1' : '.16', 'important');
            group.style.filter = active ? 'none' : 'saturate(.45)';
          });
        }
        phaseButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === phaseButton)));
      });
    });
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
