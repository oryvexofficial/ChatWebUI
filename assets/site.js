/* ==========================================================================
   یونیکالکت چت مینی · اسکریپت صفحات سایت و مستندات (Vanilla JS خالص - بدون React/JSX)
   ساخته شده توسط موویکسو (Muvixo)
   ========================================================================== */
(function () {
  'use strict';

  const ROOT_PREFIX = document.body.getAttribute('data-root') || '';
  const DEFAULT_KEY = 'sk-uc-7222f6a12db36a017b3e3d6ac8a6dc26';
  const SPRING_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

  const ICONS = {
    check: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
    x: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
    alert: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>',
    info: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>'
  };

  const state = {
    status: 'offline',
    baseUrl: '',
    publicKey: DEFAULT_KEY,
    modelName: 'یونیکالکت چت مینی',
    routerModelId: 'unicollect-chat-mini'
  };

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------- بازخورد تیک کپی (Copy Checkmark Feedback) ---------- */
  function flashCopyFeedback(btn, doneLabel) {
    if (!btn) return;
    if (btn._copyTimer) clearTimeout(btn._copyTimer);
    if (!btn._origHtml) btn._origHtml = btn.innerHTML;
    const svg = btn.querySelector('svg.ic');
    const sp = btn.querySelector('span');
    if (svg) svg.outerHTML = ICONS.check;
    if (sp && doneLabel) sp.textContent = doneLabel;
    btn.classList.add('is-copied');
    btn._copyTimer = setTimeout(function () {
      btn.classList.remove('is-copied');
      if (btn._origHtml) btn.innerHTML = btn._origHtml;
      btn._copyTimer = 0;
    }, 1500);
  }

  /* ---------- اعلان (Toast IN + OUT) ---------- */
  function showToast(text, type) {
    const host = document.getElementById('toast-host');
    if (!host) return;
    const kind = type || 'success';
    const ms = 2600;
    const iconKey = kind === 'error' ? 'x' : kind === 'warn' ? 'alert' : kind === 'info' ? 'info' : 'check';
    const t = document.createElement('div');
    t.className = 'toast t-' + kind;
    t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    t.innerHTML =
      '<span class="toast-ic">' + ICONS[iconKey] + '</span>' +
      '<span class="toast-text"></span>' +
      '<button class="toast-x" type="button" aria-label="بستن">' + ICONS.x + '</button>' +
      '<span class="toast-bar" style="animation-duration:' + ms + 'ms"></span>';
    t.querySelector('.toast-text').textContent = text;
    const removeToast = function () {
      if (!t.parentNode || t.classList.contains('closing')) return;
      t.classList.add('closing');
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, prefersReducedMotion() ? 10 : 190);
    };
    const timer = setTimeout(removeToast, ms);
    t.querySelector('.toast-x').addEventListener('click', function () {
      clearTimeout(timer);
      removeToast();
    });
    host.insertBefore(t, host.firstChild);
  }

  /* ---------- کپی در کلیپ‌بورد ---------- */
  async function copyText(str) {
    const text = String(str || '').trim();
    if (!text) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- به‌روزرسانی وضعیت زنده، آدرس روتر و کلید عمومی ---------- */
  function applyLiveState() {
    const isOnline = state.status === 'online' && !!state.baseUrl;
    const isStarting = state.status === 'starting';
    const dotClass = isOnline ? 'ok' : isStarting ? 'warn' : 'bad';
    const labelText = isOnline ? 'آنلاین · آماده' : isStarting ? 'در حال راه‌اندازی…' : 'آفلاین';
    const displayUrl = state.baseUrl || 'https://YOUR-LINK.trycloudflare.com';

    document.querySelectorAll('[data-live-dot]').forEach(function (el) {
      el.className = 'dot ' + dotClass;
    });
    document.querySelectorAll('[data-live-label]').forEach(function (el) {
      el.textContent = labelText;
    });
    document.querySelectorAll('[data-live-key]').forEach(function (el) {
      el.textContent = state.publicKey || DEFAULT_KEY;
    });
    document.querySelectorAll('[data-live-url]').forEach(function (el) {
      el.textContent = displayUrl;
    });
    document.querySelectorAll('[data-swagger-link]').forEach(function (el) {
      el.href = (state.baseUrl || '') + '/docs';
    });
    document.querySelectorAll('[data-live-panel-link]').forEach(function (el) {
      if (state.baseUrl) {
        el.href = state.baseUrl;
        el.removeAttribute('aria-disabled');
      }
    });
    const keyInput = document.getElementById('console-key');
    if (keyInput && (!keyInput.value || keyInput.value === DEFAULT_KEY)) {
      keyInput.value = state.publicKey || DEFAULT_KEY;
    }
  }

  async function fetchLiveStatus() {
    const bust = '?t=' + Date.now();
    // ۱. اگر روی خود سرور FastAPI هستیم، مستقیم از /api/v1/key بخوانیم
    if (location.protocol.startsWith('http') && !location.hostname.endsWith('github.io')) {
      try {
        const r = await fetch('/api/v1/key' + bust, { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          state.status = 'online';
          state.baseUrl = (d.base_url || location.origin).replace(/\/+$/, '');
          if (d.public_api_key) state.publicKey = d.public_api_key;
          applyLiveState();
          return;
        }
      } catch (e) {}
    }

    // ۲. خواندن از api/links.json و assets/status.json (مخصوص GitHub Pages)
    try {
      const r = await fetch(ROOT_PREFIX + 'api/links.json' + bust, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d) {
          if (d.public_api_key) state.publicKey = d.public_api_key;
          if (d.base_url) state.baseUrl = String(d.base_url).replace(/\/+$/, '');
          if (d.status) state.status = d.status;
          else if (state.baseUrl) state.status = 'online';
        }
      }
    } catch (e) {}

    try {
      const r2 = await fetch(ROOT_PREFIX + 'assets/status.json' + bust, { cache: 'no-store' });
      if (r2.ok) {
        const s = await r2.json();
        if (s) {
          if (s.public_api_key) state.publicKey = s.public_api_key;
          if (s.status) state.status = s.status;
          if (!state.baseUrl && s.url_payload) {
            try {
              state.baseUrl = atob(s.url_payload).replace(/\/+$/, '');
            } catch (e) {}
          }
        }
      }
    } catch (e) {}

    applyLiveState();
  }

  /* ---------- تب‌های کد (curl / Python / JavaScript) ---------- */
  function initCodeTabs() {
    document.querySelectorAll('[data-code-tabs]').forEach(function (box) {
      const tabs = box.querySelectorAll('[data-tab-btn]');
      const panels = box.querySelectorAll('[data-tab-panel]');
      tabs.forEach(function (btn) {
        btn.addEventListener('click', function () {
          const targetIdx = btn.getAttribute('data-tab-btn');
          tabs.forEach(function (t) {
            t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
          });
          panels.forEach(function (p) {
            if (p.getAttribute('data-tab-panel') === targetIdx) {
              p.removeAttribute('hidden');
              p.style.display = '';
            } else {
              p.setAttribute('hidden', '');
              p.style.display = 'none';
            }
          });
        });
      });

      const copyBtn = box.querySelector('[data-copy-code]');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          const activePanel = box.querySelector('[data-tab-panel]:not([hidden])') || box.querySelector('pre');
          if (!activePanel) return;
          copyText(activePanel.innerText || activePanel.textContent).then(function (ok) {
            if (!ok) return;
            flashCopyFeedback(copyBtn, 'کپی شد');
            showToast('کد در کلیپ‌بورد کپی شد');
          });
        });
      }
    });
  }

  /* ---------- دکمه‌های کپی کلید عمومی و آدرس‌های روتر ---------- */
  function initCopyButtons() {
    document.querySelectorAll('[data-copy-target="live-key"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyText(state.publicKey || DEFAULT_KEY).then(function (ok) {
          if (ok) {
            flashCopyFeedback(btn, 'کپی شد');
            showToast('کلید عمومی API کپی شد');
          }
        });
      });
    });

    document.querySelectorAll('[data-copy-selector]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const sel = btn.getAttribute('data-copy-selector');
        const target = sel ? document.querySelector(sel) : null;
        if (!target) return;
        copyText(target.innerText || target.textContent).then(function (ok) {
          if (ok) {
            flashCopyFeedback(btn, 'کپی شد');
            showToast('آدرس در کلیپ‌بورد کپی شد');
          }
        });
      });
    });

    document.querySelectorAll('[data-copy-anchor]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const id = btn.getAttribute('data-copy-anchor');
        const url = location.origin + location.pathname + '#' + id;
        copyText(url).then(function (ok) {
          if (ok) {
            flashCopyFeedback(btn);
            showToast('لینک مسیر کپی شد');
          }
        });
      });
    });
  }

  /* ---------- موبایل TOC (IN + OUT) ---------- */
  function closeTocAnimated() {
    const tocEl = document.querySelector('.toc');
    const tocToggle = document.querySelector('[data-toc-toggle]');
    if (!tocEl || !tocEl.classList.contains('open') || tocEl.classList.contains('closing')) return;
    tocEl.classList.remove('open');
    if (tocToggle) tocToggle.setAttribute('aria-expanded', 'false');
    if (prefersReducedMotion()) return;
    tocEl.classList.add('closing');
    setTimeout(function () {
      tocEl.classList.remove('closing');
    }, 190);
  }

  /* ---------- آکاردئون مسیرهای API با انیمیشن ارتفاع (IN + OUT) و TOC ---------- */
  function initApiDocsPage() {
    const detailsList = Array.from(document.querySelectorAll('details.ep'));
    const countEl = document.getElementById('ep-open-count');

    function updateCount() {
      if (!countEl || !detailsList.length) return;
      const openCount = detailsList.filter(function (d) { return d.open && !d.classList.contains('closing'); }).length;
      countEl.textContent = openCount.toLocaleString('fa-IR') + ' / ' + detailsList.length.toLocaleString('fa-IR') + ' باز';
      detailsList.forEach(function (d) {
        d.classList.toggle('is-open', d.open && !d.classList.contains('closing'));
      });
    }

    function openAccordionSmooth(d) {
      if (!d) return;
      if (d._accTimer) { clearTimeout(d._accTimer); d._accTimer = 0; }
      d.classList.remove('closing');
      if (d.open) { updateCount(); return; }
      const inner = d.querySelector('.ep-inner');
      d.open = true;
      d.classList.add('is-open');
      updateCount();
      if (!inner || prefersReducedMotion()) return;
      const targetH = inner.scrollHeight;
      inner.style.overflow = 'hidden';
      inner.style.height = '0px';
      inner.style.opacity = '0';
      inner.style.transform = 'translateY(-5px)';
      inner.style.transition = 'none';
      void inner.offsetHeight;
      inner.style.transition = 'height 240ms ' + SPRING_EASE + ', opacity 200ms ease, transform 240ms ' + SPRING_EASE;
      inner.style.height = targetH + 'px';
      inner.style.opacity = '1';
      inner.style.transform = 'translateY(0)';
      d._accTimer = setTimeout(function () {
        inner.style.height = '';
        inner.style.overflow = '';
        inner.style.opacity = '';
        inner.style.transform = '';
        inner.style.transition = '';
        d._accTimer = 0;
      }, 250);
    }

    function closeAccordionSmooth(d) {
      if (!d || !d.open) return;
      if (d._accTimer) { clearTimeout(d._accTimer); d._accTimer = 0; }
      const inner = d.querySelector('.ep-inner');
      if (!inner || prefersReducedMotion()) {
        d.classList.remove('closing', 'is-open');
        d.open = false;
        updateCount();
        return;
      }
      const startH = inner.getBoundingClientRect().height || inner.scrollHeight;
      d.classList.add('closing');
      d.classList.remove('is-open');
      updateCount();
      inner.style.overflow = 'hidden';
      inner.style.height = startH + 'px';
      inner.style.opacity = '1';
      inner.style.transform = 'translateY(0)';
      inner.style.transition = 'none';
      void inner.offsetHeight;
      inner.style.transition = 'height 210ms ' + SPRING_EASE + ', opacity 180ms ease, transform 210ms ' + SPRING_EASE;
      inner.style.height = '0px';
      inner.style.opacity = '0';
      inner.style.transform = 'translateY(-5px)';
      d._accTimer = setTimeout(function () {
        d.classList.remove('closing');
        d.open = false;
        inner.style.height = '';
        inner.style.overflow = '';
        inner.style.opacity = '';
        inner.style.transform = '';
        inner.style.transition = '';
        d._accTimer = 0;
        updateCount();
      }, 220);
    }

    detailsList.forEach(function (d) {
      const sum = d.querySelector('summary');
      if (sum) {
        sum.addEventListener('click', function (e) {
          if (e.target && e.target.closest('[data-copy-anchor]')) return;
          e.preventDefault();
          if (d.open && !d.classList.contains('closing')) {
            closeAccordionSmooth(d);
          } else {
            openAccordionSmooth(d);
          }
        });
      }
    });
    updateCount();

    document.querySelectorAll('[data-ep-all]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const mode = btn.getAttribute('data-ep-all');
        detailsList.forEach(function (d) {
          if (mode === 'open') openAccordionSmooth(d);
          else closeAccordionSmooth(d);
        });
      });
    });

    // دکمه «امتحان در کنسول» در هر مسیر
    const consoleSec = document.getElementById('console');
    const epSelect = document.getElementById('console-ep');
    const bodyTa = document.getElementById('console-body');

    document.querySelectorAll('.try-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const m = btn.getAttribute('data-try-method') || 'GET';
        const p = btn.getAttribute('data-try-path') || '/api/v1/chat';
        const b = btn.getAttribute('data-try-body') || '';
        if (epSelect) {
          const val = m + '|' + p;
          for (let i = 0; i < epSelect.options.length; i++) {
            if (epSelect.options[i].value === val) {
              epSelect.selectedIndex = i;
              break;
            }
          }
          epSelect.dispatchEvent(new Event('change'));
        }
        if (bodyTa && b) {
          bodyTa.value = b;
        }
        if (consoleSec) {
          consoleSec.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
        }
      });
    });

    // کنسول آزمایش زنده API
    const sendBtn = document.getElementById('console-send');
    const curlBtn = document.getElementById('console-curl');
    const keyInp = document.getElementById('console-key');
    const outBox = document.getElementById('console-out');
    const statusEl = document.getElementById('console-status');
    const resPre = document.getElementById('console-res');
    const copyOutBtn = document.getElementById('console-copy-out');

    const defaultBodies = {
      'POST|/api/v1/chat': '{\n  "message": "سلام! ۵۲ ضربدر ۹۵ چند می‌شود؟"\n}',
      'POST|/v1/chat/completions': '{\n  "model": "unicollect-chat-mini",\n  "messages": [\n    { "role": "user", "content": "سلام! خوبی؟" }\n  ]\n}',
      'POST|/api/v1/generate': '{\n  "prompt": "یک جمله‌ی کوتاه انگیزشی بگو"\n}'
    };

    if (epSelect && bodyTa) {
      epSelect.addEventListener('change', function () {
        const val = epSelect.value;
        const parts = val.split('|');
        if (parts[0] === 'GET') {
          bodyTa.style.display = 'none';
        } else {
          bodyTa.style.display = '';
          if (defaultBodies[val]) bodyTa.value = defaultBodies[val];
        }
      });
    }

    if (curlBtn && epSelect) {
      curlBtn.addEventListener('click', function () {
        const parts = epSelect.value.split('|');
        const method = parts[0];
        const path = parts[1];
        const base = state.baseUrl || (location.hostname.endsWith('github.io') ? 'https://YOUR-LINK.trycloudflare.com' : location.origin);
        const key = (keyInp && keyInp.value.trim()) || state.publicKey || DEFAULT_KEY;
        let cmd = 'curl -X ' + method + ' "' + base + path + '"';
        if (key) {
          cmd += ' \\\n  -H "Authorization: Bearer ' + key + '"';
        }
        if (method === 'POST' && bodyTa && bodyTa.value.trim()) {
          cmd += ' \\\n  -H "Content-Type: application/json" \\\n  -d \'' + bodyTa.value.trim() + '\'';
        }
        copyText(cmd).then(function (ok) {
          if (ok) {
            flashCopyFeedback(curlBtn, 'کپی شد');
            showToast('دستور curl کپی شد');
          }
        });
      });
    }

    async function runConsoleRequest() {
      if (!epSelect || !outBox || !resPre || !statusEl) return;
      const parts = epSelect.value.split('|');
      const method = parts[0];
      const path = parts[1];
      const base = state.baseUrl || '';
      if (location.hostname.endsWith('github.io') && !base) {
        outBox.removeAttribute('hidden');
        outBox.style.display = '';
        statusEl.textContent = 'سرویس آفلاین است';
        resPre.textContent = 'در حال حاضر آدرس تونل زنده‌ای در api/links.json ثبت نشده است.';
        return;
      }
      const key = (keyInp && keyInp.value.trim()) || state.publicKey || DEFAULT_KEY;
      const headers = {};
      if (key) {
        headers['X-API-Key'] = key;
        headers['Authorization'] = 'Bearer ' + key;
      }
      const opts = { method: method, headers: headers };
      if (method === 'POST') {
        headers['Content-Type'] = 'application/json';
        opts.body = bodyTa ? bodyTa.value : '{}';
      }
      outBox.removeAttribute('hidden');
      outBox.style.display = '';
      statusEl.textContent = 'در حال ارسال درخواست…';
      resPre.textContent = '…';
      const t0 = performance.now();
      try {
        const r = await fetch(base + path, opts);
        const dt = Math.round(performance.now() - t0);
        const txt = await r.text();
        let pretty = txt;
        try {
          pretty = JSON.stringify(JSON.parse(txt), null, 2);
        } catch (e) {}
        statusEl.textContent = 'HTTP ' + r.status + ' · ' + dt + ' ms';
        resPre.textContent = pretty;
      } catch (err) {
        statusEl.textContent = 'خطا در برقراری ارتباط';
        resPre.textContent = String(err && err.message ? err.message : err);
      }
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', runConsoleRequest);
    }
    if (bodyTa) {
      bodyTa.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          runConsoleRequest();
        }
      });
    }
    if (copyOutBtn && resPre) {
      copyOutBtn.addEventListener('click', function () {
        copyText(resPre.textContent).then(function (ok) {
          if (ok) {
            flashCopyFeedback(copyOutBtn, 'کپی شد');
            showToast('پاسخ کپی شد');
          }
        });
      });
    }

    // موبایل TOC
    const tocToggle = document.querySelector('[data-toc-toggle]');
    const tocEl = document.querySelector('.toc');
    if (tocToggle && tocEl) {
      tocToggle.addEventListener('click', function () {
        if (tocEl.classList.contains('open')) {
          closeTocAnimated();
        } else {
          tocEl.classList.remove('closing');
          tocEl.classList.add('open');
          tocToggle.setAttribute('aria-expanded', 'true');
        }
      });
      document.addEventListener('click', function (e) {
        if (tocEl.classList.contains('open') && !tocEl.contains(e.target)) {
          closeTocAnimated();
        }
      });
    }
    document.querySelectorAll('[data-toc-link]').forEach(function (a) {
      a.addEventListener('click', function () {
        const id = a.getAttribute('data-toc-link');
        const target = id ? document.getElementById(id) : null;
        if (target && target.tagName === 'DETAILS') {
          openAccordionSmooth(target);
        }
        closeTocAnimated();
      });
    });
  }

  /* ---------- منوی موبایل، اسکرول هدر و دکمه بازگشت به بالا ---------- */
  function initNavigationAndScroll() {
    const drawer = document.getElementById('drawer');
    document.querySelectorAll('[data-drawer-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!drawer) return;
        if (drawer._closeTimer) { clearTimeout(drawer._closeTimer); drawer._closeTimer = 0; }
        drawer.classList.remove('closing');
        drawer.removeAttribute('hidden');
        drawer.style.display = '';
      });
    });
    function closeDrawerAnimated() {
      if (!drawer || drawer.hasAttribute('hidden') || drawer.classList.contains('closing')) return;
      if (prefersReducedMotion()) {
        drawer.classList.remove('closing');
        drawer.setAttribute('hidden', '');
        drawer.style.display = 'none';
        return;
      }
      drawer.classList.add('closing');
      drawer._closeTimer = setTimeout(function () {
        drawer.classList.remove('closing');
        drawer.setAttribute('hidden', '');
        drawer.style.display = 'none';
        drawer._closeTimer = 0;
      }, 190);
    }
    document.querySelectorAll('[data-drawer-close]').forEach(function (btn) {
      btn.addEventListener('click', closeDrawerAnimated);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeDrawerAnimated();
        closeTocAnimated();
      }
    });

    const topHeader = document.getElementById('top');
    const progress = document.getElementById('top-progress');
    window.addEventListener('scroll', function () {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (topHeader) {
        if (y > 16) topHeader.setAttribute('data-scrolled', 'true');
        else topHeader.removeAttribute('data-scrolled');
      }
      if (progress) {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const ratio = Math.min(1, Math.max(0, y / max));
        progress.style.transform = 'scaleX(' + ratio.toFixed(3) + ')';
      }
    }, { passive: true });

    document.querySelectorAll('[data-to-top]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      });
    });
  }

  /* ---------- افکت‌های تعاملی (Tilt، Spotlight، Scroll-line، TOC Scroll-Spy، Scroll-Reveal) ---------- */
  function initInteractiveFX() {
    const canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (canHover && !prefersReducedMotion()) {
      document.querySelectorAll('.tilt').forEach(function (card) {
        card.addEventListener('mousemove', function (e) {
          const r = card.getBoundingClientRect();
          const x = (e.clientX - r.left) / Math.max(1, r.width) - 0.5;
          const y = (e.clientY - r.top) / Math.max(1, r.height) - 0.5;
          card.style.transform = 'perspective(1100px) rotateX(' + (-y * 8).toFixed(2) + 'deg) rotateY(' + (x * 8).toFixed(2) + 'deg)';
        });
        card.addEventListener('mouseleave', function () {
          card.style.transform = 'perspective(1100px)';
        });
      });

      document.querySelectorAll('.spotlight').forEach(function (box) {
        box.addEventListener('mousemove', function (e) {
          const r = box.getBoundingClientRect();
          box.style.setProperty('--mx', (e.clientX - r.left) + 'px');
          box.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
      });
    }

    const scrollBar = document.getElementById('scroll-line-bar');
    const stepsWrap = document.querySelector('.steps-wrap');
    if (scrollBar && stepsWrap) {
      const updateStepsLine = function () {
        const r = stepsWrap.getBoundingClientRect();
        const vh = window.innerHeight || 800;
        const pct = Math.min(1, Math.max(0.08, (vh * 0.65 - r.top) / Math.max(1, r.height)));
        scrollBar.style.transform = 'scaleY(' + pct.toFixed(3) + ')';
      };
      window.addEventListener('scroll', updateStepsLine, { passive: true });
      updateStepsLine();
    }

    const tocLinks = Array.from(document.querySelectorAll('[data-toc-link]'));
    const tocCur = document.getElementById('toc-cur');
    if (tocLinks.length) {
      const sections = tocLinks.map(function (a) {
        return { link: a, id: a.getAttribute('data-toc-link'), el: document.getElementById(a.getAttribute('data-toc-link')) };
      }).filter(function (x) { return !!x.el; });

      const onScrollSpy = function () {
        let current = sections[0];
        const y = window.scrollY + 140;
        for (let i = 0; i < sections.length; i++) {
          const top = sections[i].el.getBoundingClientRect().top + window.scrollY;
          if (top <= y) current = sections[i];
        }
        if (current) {
          tocLinks.forEach(function (a) { a.classList.toggle('active', a === current.link); });
          if (tocCur) tocCur.textContent = current.id;
        }
      };
      window.addEventListener('scroll', onScrollSpy, { passive: true });
    }

    // GPU-accelerated scroll-reveal with subtle sibling stagger
    const reveals = Array.from(document.querySelectorAll('.reveal:not(.in)'));
    if (reveals.length) {
      if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
        reveals.forEach(function (r) { r.classList.add('in'); });
      } else {
        document.documentElement.classList.add('js');
        reveals.forEach(function (r) {
          if (!r.style.getPropertyValue('--rd') && r.parentElement) {
            const sibs = Array.from(r.parentElement.children).filter(function (c) { return c.classList.contains('reveal'); });
            if (sibs.length > 1) {
              const idx = sibs.indexOf(r);
              r.style.setProperty('--rd', Math.min(idx * 55, 220) + 'ms');
            }
          }
        });
        const io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              io.unobserve(entry.target);
            }
          });
        }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
        reveals.forEach(function (r) { io.observe(r); });
      }
    }
  }

  /* ---------- راه‌اندازی اولیه ---------- */
  function init() {
    initNavigationAndScroll();
    initCodeTabs();
    initCopyButtons();
    initApiDocsPage();
    initInteractiveFX();
    fetchLiveStatus();
    setInterval(function () {
      if (!document.hidden) fetchLiveStatus();
    }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
