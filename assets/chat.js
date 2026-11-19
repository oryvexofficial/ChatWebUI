/* ==========================================================================
   یونیکالکت چت مینی · رابط کاربری گفتگو (Vanilla JS خالص - بدون React/JSX)
   ساخته شده توسط موویکسو (Muvixo)
   ========================================================================== */
(function () {
  'use strict';

  const IS_PAGES = document.documentElement.getAttribute('data-api') === 'pages';
  const PAGES_ROOT = document.documentElement.getAttribute('data-root') || '../';
  const STORAGE_KEY = 'chatwebui_threads_v1';
  const UI_KEY = 'chatwebui_ui_v1';
  const DEFAULT_KEY = 'sk-uc-7222f6a12db36a017b3e3d6ac8a6dc26';
  const MAX_TEXT = 8000;
  const MAX_HISTORY_TURNS = 16;
  const MAX_TA_H = 200;
  const REQUEST_TIMEOUT_MS = 180000;

  const STEPS = ['خواندن پیام', 'مرور گفتگو', 'فکر کردن', 'نوشتن پاسخ'];
  const PROMPTS = [
    'امروز چطور کمکت کنم؟',
    'چه کمکی از دستم برمیاد؟',
    'بگو چی لازم داری',
    'آماده‌ام، چی تو ذهنته؟',
    'بریم سراغ یه کار جدید',
    'چه چیزی رو باهم بنویسیم؟',
    'چه سوالی داری؟',
    'بگو تا کمکت کنم',
    'امروز رو با چی شروع کنیم؟',
    'منتظر پیامتم…'
  ];

  const ICONS = {
    check: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
    x: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
    alert: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>',
    info: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>',
    copy: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>',
    refresh: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>',
    trash: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><path d="M10 11v6M14 11v6"></path></svg>',
    chevron: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>',
    msg: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>',
    search: '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>'
  };

  const PETAL_MARK_HTML =
    '<svg class="pg-mark intro" viewBox="0 0 24 24" aria-hidden="true">' +
    '<g transform="rotate(0 12 12)"><path class="pt" d="M12 1.5c1.9 0 2.6 2.1 1.9 4.1l-.9 2.5c-.35.95-1.65.95-2 0l-.9-2.5C9.4 3.6 10.1 1.5 12 1.5z" style="--k:0"></path></g>' +
    '<g transform="rotate(60 12 12)"><path class="pt" d="M12 1.5c1.9 0 2.6 2.1 1.9 4.1l-.9 2.5c-.35.95-1.65.95-2 0l-.9-2.5C9.4 3.6 10.1 1.5 12 1.5z" style="--k:1"></path></g>' +
    '<g transform="rotate(120 12 12)"><path class="pt" d="M12 1.5c1.9 0 2.6 2.1 1.9 4.1l-.9 2.5c-.35.95-1.65.95-2 0l-.9-2.5C9.4 3.6 10.1 1.5 12 1.5z" style="--k:2"></path></g>' +
    '<g transform="rotate(180 12 12)"><path class="pt" d="M12 1.5c1.9 0 2.6 2.1 1.9 4.1l-.9 2.5c-.35.95-1.65.95-2 0l-.9-2.5C9.4 3.6 10.1 1.5 12 1.5z" style="--k:3"></path></g>' +
    '<g transform="rotate(240 12 12)"><path class="pt" d="M12 1.5c1.9 0 2.6 2.1 1.9 4.1l-.9 2.5c-.35.95-1.65.95-2 0l-.9-2.5C9.4 3.6 10.1 1.5 12 1.5z" style="--k:4"></path></g>' +
    '<g transform="rotate(300 12 12)"><path class="pt" d="M12 1.5c1.9 0 2.6 2.1 1.9 4.1l-.9 2.5c-.35.95-1.65.95-2 0l-.9-2.5C9.4 3.6 10.1 1.5 12 1.5z" style="--k:5"></path></g>' +
    '<circle class="core" cx="12" cy="12" r="2.1"></circle>' +
    '</svg>';

  /* ---------- توابع کمکی پایه ---------- */
  function setHidden(node, flag) {
    if (!node) return;
    if (flag) {
      node.setAttribute("hidden", "");
      node.hidden = true;
      node.style.display = "none";
    } else {
      node.removeAttribute("hidden");
      node.hidden = false;
      node.style.display = "";
    }
  }
  function openAnimated(node) {
    if (!node) return;
    if (node._closeTimer) { clearTimeout(node._closeTimer); node._closeTimer = 0; }
    node.classList.remove("closing");
    setHidden(node, false);
    void node.offsetWidth;
  }
  function closeAnimated(node, delay) {
    if (!node || node.hidden || node.classList.contains("closing")) return;
    if (node._closeTimer) clearTimeout(node._closeTimer);
    node.classList.add("closing");
    node._closeTimer = setTimeout(function () {
      node.classList.remove("closing");
      setHidden(node, true);
      node._closeTimer = 0;
    }, delay || 210);
  }

  function fa(n) {
    return typeof n === 'number' ? n.toLocaleString('fa-IR') : String(n || '');
  }

  function secs(ms) {
    return (Math.max(0, ms) / 1000).toLocaleString('fa-IR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripMarkdown(s) {
    return String(s || '')
      .replace(/```[a-zA-Z0-9_+#.-]*\n?/g, '')
      .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
      .replace(/\$([^$\n]+)\$/g, '$1')
      .replace(/[*_`~=#>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function newId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function textDir(s) {
    const str = String(s || '');
    const rtlMatch = str.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/);
    const ltrMatch = str.match(/[A-Za-z]/);
    if (!rtlMatch && ltrMatch) return 'ltr';
    if (rtlMatch && !ltrMatch) return 'rtl';
    if (rtlMatch && ltrMatch) {
      return rtlMatch.index <= ltrMatch.index ? 'rtl' : 'ltr';
    }
    return 'rtl';
  }

  function relTime(ts) {
    if (!ts) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return 'همین الان';
    const min = Math.floor(diffSec / 60);
    if (min < 60) return fa(min) + ' دقیقه پیش';
    const hr = Math.floor(min / 60);
    if (hr < 24) return fa(hr) + ' ساعت پیش';
    const day = Math.floor(hr / 24);
    return fa(day) + ' روز پیش';
  }

  async function copyText(str) {
    const text = String(str || '');
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

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ---------- موتور رندر مارک‌داون و فرمول ریاضی پیشرفته (Vanilla JS) ---------- */
  const TEX_RULES = [
    [/\\(?:d|t)?frac\{([^{}]*)\}\{([^{}]*)\}/g, '<span class="m-frac"><span class="m-num">$1</span><span class="m-den">$2</span></span>'],
    [/\\sqrt\[([^\]]+)\]\{([^{}]*)\}/g, '<span class="m-root"><sup>$1</sup>√<span class="m-rad">$2</span></span>'],
    [/\\sqrt\{([^{}]*)\}/g, '<span class="m-root">√<span class="m-rad">$1</span></span>'],
    [/\\vec\{([^{}]*)\}/g, '<span class="m-vec">$1</span>'],
    [/\\hat\{([^{}]*)\}/g, '<span class="m-hat">$1</span>'],
    [/\\overline\{([^{}]*)\}|\\bar\{([^{}]*)\}/g, '<span class="m-bar">$1$2</span>'],
    [/\\int/g, '∫'], [/\\iint/g, '∬'], [/\\oint/g, '∮'], [/\\sum/g, '∑'], [/\\prod/g, '∏'], [/\\infty/g, '∞'],
    [/\\pi/g, 'π'], [/\\alpha/g, 'α'], [/\\beta/g, 'β'], [/\\gamma/g, 'γ'], [/\\Gamma/g, 'Γ'],
    [/\\delta/g, 'δ'], [/\\Delta/g, 'Δ'], [/\\epsilon|\\varepsilon/g, 'ε'], [/\\zeta/g, 'ζ'], [/\\eta/g, 'η'],
    [/\\theta|\\vartheta/g, 'θ'], [/\\Theta/g, 'Θ'], [/\\lambda/g, 'λ'], [/\\Lambda/g, 'Λ'], [/\\mu/g, 'μ'],
    [/\\nu/g, 'ν'], [/\\xi/g, 'ξ'], [/\\rho/g, 'ρ'], [/\\sigma/g, 'σ'], [/\\Sigma/g, 'Σ'], [/\\tau/g, 'τ'],
    [/\\phi|\\varphi/g, 'φ'], [/\\Phi/g, 'Φ'], [/\\chi/g, 'χ'], [/\\psi/g, 'ψ'], [/\\Psi/g, 'Ψ'],
    [/\\omega/g, 'ω'], [/\\Omega/g, 'Ω'],
    [/\\times/g, '×'], [/\\cdot|\\bullet/g, '·'], [/\\div/g, '÷'], [/\\pm/g, '±'], [/\\mp/g, '∓'],
    [/\\leq?|\\leqslant/g, '≤'], [/\\geq?|\\geqslant/g, '≥'], [/\\neq|\\ne/g, '≠'], [/\\approx/g, '≈'],
    [/\\equiv/g, '≡'], [/\\sim/g, '∼'], [/\\propto/g, '∝'], [/\\ll/g, '≪'], [/\\gg/g, '≫'],
    [/\\leftrightarrow|\\iff/g, '⇔'], [/\\Rightarrow|\\implies/g, '⇒'], [/\\Leftarrow/g, '⇐'],
    [/\\to|\\rightarrow/g, '→'], [/\\leftarrow/g, '←'], [/\\mapsto/g, '↦'],
    [/\\in/g, '∈'], [/\\notin/g, '∉'], [/\\subset/g, '⊂'], [/\\subseteq/g, '⊆'], [/\\cup/g, '∪'], [/\\cap/g, '∩'],
    [/\\emptyset|\\varnothing/g, '∅'], [/\\forall/g, '∀'], [/\\exists/g, '∃'], [/\\neg|\\lnot/g, '¬'],
    [/\\land|\\wedge/g, '∧'], [/\\lor|\\vee/g, '∨'], [/\\therefore/g, '∴'], [/\\because/g, '∵'],
    [/\\partial/g, '∂'], [/\\nabla/g, '∇'], [/\\degree|\^\\circ/g, '°'], [/\\angle/g, '∠'], [/\\perp/g, '⊥'], [/\\parallel/g, '∥'],
    [/\\mathbb\{R\}/g, 'ℝ'], [/\\mathbb\{N\}/g, 'ℕ'], [/\\mathbb\{Z\}/g, 'ℤ'], [/\\mathbb\{Q\}/g, 'ℚ'], [/\\mathbb\{C\}/g, 'ℂ'],
    [/\\(?:sin|cos|tan|cot|sec|csc|log|ln|exp|lim|max|min|det|gcd|mod)/g, function (m) { return '<span class="m-fn">' + m.slice(1) + '</span>'; }],
    [/\\,|\\;|\\:|\\!|\\quad|\\qquad/g, ' '],
    [/\\left|\\right/g, ''],
    [/\\(?:text|mathrm|mathbf|operatorname|textrm)\{([^{}]*)\}/g, '<span class="m-txt">$1</span>']
  ];

  function formatTexHtml(rawExpr) {
    let t = escapeHtml(String(rawExpr || '').trim());
    // Matrices (pmatrix / bmatrix / vmatrix)
    t = t.replace(/\\begin\{([pbv]?)matrix\}([\s\S]*?)\\end\{\1matrix\}/g, function (_, kind, body) {
      const rows = body.trim().split(/\\\\/).map(function (r) {
        const cols = r.split('&').map(function (c) { return '<td>' + formatTexHtml(c) + '</td>'; }).join('');
        return '<tr>' + cols + '</tr>';
      }).join('');
      const cls = kind === 'b' ? 'm-mat m-mat-b' : kind === 'v' ? 'm-mat m-mat-v' : 'm-mat m-mat-p';
      return '<span class="' + cls + '"><table><tbody>' + rows + '</tbody></table></span>';
    });
    // Repeat fraction/root replacement twice to handle one level of nesting
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < TEX_RULES.length; i++) {
        t = t.replace(TEX_RULES[i][0], TEX_RULES[i][1]);
      }
    }
    // Superscripts & subscripts
    t = t.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
    t = t.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');
    t = t.replace(/\^([A-Za-z0-9+\-*])/g, '<sup>$1</sup>');
    t = t.replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>');
    return t.replace(/[{}]/g, '');
  }

  function highlightCode(rawCode, lang) {
    const l = String(lang || '').toLowerCase();
    let s = escapeHtml(rawCode);
    if (!l || l === 'text' || l === 'txt' || l === 'متن' || l === 'plain') return s;
    const tokens = [];
    const stash = function (html) {
      const id = tokens.length;
      tokens.push(html);
      return '\uE010HL' + id + '\uE011';
    };
    s = s.replace(/(&quot;(?:\\.|[^&]|&(?!quot;))*?&quot;|&#39;(?:\\.|[^&]|&(?!#39;))*?&#39;|`[^`]*`)/g, function (m) {
      return stash('<span class="hl-str">' + m + '</span>');
    });
    s = s.replace(/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, function (m) {
      return stash('<span class="hl-com">' + m + '</span>');
    });
    s = s.replace(/\b(function|return|const|let|var|if|else|for|while|switch|case|break|continue|async|await|try|catch|finally|throw|new|class|extends|import|from|export|default|def|elif|pass|with|as|lambda|yield|True|False|None|true|false|null|undefined|SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|ORDER|BY|GROUP|LIMIT|curl|sudo|git|npm|pip|python|python3|bash|sh)\b/g, '<span class="hl-kw">$1</span>');
    s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="hl-num">$1</span>');
    return s.replace(/\uE010HL(\d+)\uE011/g, function (_, idx) { return tokens[+idx] || ''; });
  }

  function renderInlineMarkdown(escapedText, mathTokens, codeTokens) {
    let s = escapedText;
    // Inline code `...`
    s = s.replace(/`([^`\n]+)`/g, function (_, code) {
      const idx = codeTokens.length;
      codeTokens.push('<code class="inline-code">' + code + '</code>');
      return '\uE002CODE' + idx + '\uE003';
    });
    // Inline math $...$ or \(...\)
    s = s.replace(/\\\(([\s\S]+?)\\\)|(^|[^\\$\w])\$([^\s$][^$\n]*?)\$(?!\$)/g, function (_, p1, pre, p2) {
      const expr = p1 != null ? p1 : p2;
      const idx = mathTokens.length;
      mathTokens.push('<span class="math" dir="ltr">' + formatTexHtml(expr) + '</span>');
      return (pre || '') + '\uE000MATH' + idx + '\uE001';
    });
    // Links [label](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Highlight ==...==
    s = s.replace(/==([^=\n]+)==/g, '<mark class="md-mark">$1</mark>');
    // Keyboard keys [[Ctrl+K]]
    s = s.replace(/\[\[([^\]\n]{1,24})\]\]/g, '<kbd class="kbd md-kbd">$1</kbd>');
    // Bold **...** or __...__
    s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, function (_, a, b) { return '<strong>' + (a || b) + '</strong>'; });
    // Italic *...*
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    // Strikethrough ~~...~~
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Restore tokens
    s = s.replace(/\uE000MATH(\d+)\uE001/g, function (_, i) { return mathTokens[+i] || ''; });
    s = s.replace(/\uE002CODE(\d+)\uE003/g, function (_, i) { return codeTokens[+i] || ''; });
    return s;
  }

  function renderMarkdown(rawText) {
    const src = String(rawText || '');
    if (!src.trim()) return '';

    const blocks = [];
    const mathTokens = [];
    const codeTokens = [];

    // ۱. استخراج بلوک‌های کد (بسته و حتی نیمه‌باز حین استریم)
    let working = src.replace(/```([a-zA-Z0-9_+#.-]*)\n?([\s\S]*?)(?:```|$)/g, function (full, lang, code) {
      const cleanCode = code.replace(/\n$/, '');
      const idx = blocks.length;
      const encoded = encodeURIComponent(cleanCode);
      const lineCount = cleanCode ? cleanCode.split('\n').length : 0;
      blocks.push(
        '<div class="code-block">' +
          '<div class="code-head">' +
            '<span class="code-lang-wrap"><span class="code-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="code-lang">' + escapeHtml(lang || 'متن') + '</span>' + (lineCount > 1 ? '<span class="code-lines">' + fa(lineCount) + ' خط</span>' : '') + '</span>' +
            '<button type="button" class="code-copy" data-copy-encoded="' + encoded + '">' +
              ICONS.copy + '<span>کپی</span>' +
            '</button>' +
          '</div>' +
          '<pre dir="ltr"><code>' + highlightCode(cleanCode, lang) + '</code></pre>' +
        '</div>'
      );
      return '\n\n@@BLOCK_' + idx + '@@\n\n';
    });

    // ۲. استخراج فرمول‌های ریاضی بلوکی $$...$$ یا \[...\]
    working = working.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, function (_, m1, m2) {
      const expr = (m1 != null ? m1 : m2).trim();
      const idx = blocks.length;
      const encoded = encodeURIComponent(expr);
      blocks.push(
        '<div class="math-card">' +
          '<div class="math-head">' +
            '<span class="math-badge">فرمول ریاضی</span>' +
            '<button type="button" class="code-copy" data-copy-encoded="' + encoded + '">' + ICONS.copy + '<span>کپی LaTeX</span></button>' +
          '</div>' +
          '<div class="math math-block" dir="ltr">' + formatTexHtml(expr) + '</div>' +
        '</div>'
      );
      return '\n\n@@BLOCK_' + idx + '@@\n\n';
    });

    // ۳. پردازش خط‌به‌خط پاراگراف‌ها، کال‌اوت‌ها، لیست‌ها، چک‌لیست‌ها، جدول‌ها، خط جداکننده و عناوین
    const lines = working.split(/\r?\n/);
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) {
        i++;
        continue;
      }

      const bm = /^@@BLOCK_(\d+)@@$/.exec(trimmed);
      if (bm) {
        out.push(blocks[+bm[1]]);
        i++;
        continue;
      }

      if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
        out.push('<hr>');
        i++;
        continue;
      }

      const hm = /^(#{1,4})\s+(.+)$/.exec(trimmed);
      if (hm) {
        const level = Math.min(4, hm[1].length);
        out.push('<h' + level + '>' + renderInlineMarkdown(escapeHtml(hm[2]), mathTokens, codeTokens) + '</h' + level + '>');
        i++;
        continue;
      }

      if (trimmed.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
        const parseRow = function (r) {
          return r.trim().replace(/^\||\|$/g, '').split('|').map(function (c) {
            return renderInlineMarkdown(escapeHtml(c.trim()), mathTokens, codeTokens);
          });
        };
        const headers = parseRow(trimmed);
        i += 2;
        const rowsHtml = [];
        while (i < lines.length && lines[i].trim().includes('|')) {
          const cells = parseRow(lines[i]);
          rowsHtml.push('<tr>' + cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>');
          i++;
        }
        out.push(
          '<div class="md-table"><table><thead><tr>' +
          headers.map(function (h) { return '<th>' + h + '</th>'; }).join('') +
          '</tr></thead><tbody>' + rowsHtml.join('') + '</tbody></table></div>'
        );
        continue;
      }

      if (trimmed.startsWith('>')) {
        const rawQLines = [];
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          rawQLines.push(lines[i].trim().replace(/^>\s?/, ''));
          i++;
        }
        const calloutMatch = /^\[!(NOTE|TIP|WARNING|IMPORTANT|INFO|نکته|هشدار)\]\s*(.*)$/i.exec(rawQLines[0] || '');
        if (calloutMatch) {
          const kindRaw = calloutMatch[1].toUpperCase();
          const kindMap = {
            NOTE: ['info', 'نکته'],
            INFO: ['info', 'اطلاعات'],
            'نکته': ['info', 'نکته'],
            TIP: ['tip', 'پیشنهاد'],
            IMPORTANT: ['tip', 'مهم'],
            WARNING: ['warn', 'هشدار'],
            'هشدار': ['warn', 'هشدار']
          };
          const meta = kindMap[kindRaw] || ['info', 'نکته'];
          const bodyLines = [];
          if (calloutMatch[2]) bodyLines.push(renderInlineMarkdown(escapeHtml(calloutMatch[2]), mathTokens, codeTokens));
          for (let q = 1; q < rawQLines.length; q++) {
            bodyLines.push(renderInlineMarkdown(escapeHtml(rawQLines[q]), mathTokens, codeTokens));
          }
          out.push(
            '<div class="callout c-' + meta[0] + '">' +
              '<div class="callout-title">' + (meta[0] === 'warn' ? ICONS.alert : ICONS.info) + '<span>' + meta[1] + '</span></div>' +
              '<div class="callout-body">' + bodyLines.join('<br>') + '</div>' +
            '</div>'
          );
        } else {
          const qHtml = rawQLines.map(function (ql) { return renderInlineMarkdown(escapeHtml(ql), mathTokens, codeTokens); });
          out.push('<blockquote><p>' + qHtml.join('<br>') + '</p></blockquote>');
        }
        continue;
      }

      if (/^[-*]\s+\[[ xX]\]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*]\s+\[[ xX]\]\s+/.test(lines[i].trim())) {
          const mTask = /^[-*]\s+\[([ xX])\]\s+(.+)$/.exec(lines[i].trim());
          const done = mTask && mTask[1].toLowerCase() === 'x';
          const label = mTask ? mTask[2] : '';
          items.push(
            '<li class="task-item' + (done ? ' done' : '') + '">' +
              '<span class="task-box" aria-hidden="true">' + (done ? ICONS.check : '') + '</span>' +
              '<span>' + renderInlineMarkdown(escapeHtml(label), mathTokens, codeTokens) + '</span>' +
            '</li>'
          );
          i++;
        }
        out.push('<ul class="task-list">' + items.join('') + '</ul>');
        continue;
      }

      if (/^[-*•]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim()) && !/^[-*]\s+\[[ xX]\]\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^[-*•]\s+/, '');
          items.push('<li>' + renderInlineMarkdown(escapeHtml(itemText), mathTokens, codeTokens) + '</li>');
          i++;
        }
        out.push('<ul>' + items.join('') + '</ul>');
        continue;
      }

      if (/^(\d+|[۰-۹]+)[.)]\s+/.test(trimmed)) {
        const items = [];
        while (i < lines.length && /^(\d+|[۰-۹]+)[.)]\s+/.test(lines[i].trim())) {
          const itemText = lines[i].trim().replace(/^(\d+|[۰-۹]+)[.)]\s+/, '');
          items.push('<li>' + renderInlineMarkdown(escapeHtml(itemText), mathTokens, codeTokens) + '</li>');
          i++;
        }
        out.push('<ol>' + items.join('') + '</ol>');
        continue;
      }

      const pLines = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^@@BLOCK_\d+@@$/.test(lines[i].trim()) &&
        !/^(?:---+|\*\*\*+|___+)$/.test(lines[i].trim()) &&
        !/^(#{1,4})\s+/.test(lines[i].trim()) &&
        !/^[-*•]\s+/.test(lines[i].trim()) &&
        !/^(\d+|[۰-۹]+)[.)]\s+/.test(lines[i].trim()) &&
        !lines[i].trim().startsWith('>')
      ) {
        pLines.push(renderInlineMarkdown(escapeHtml(lines[i].trim()), mathTokens, codeTokens));
        i++;
      }
      if (pLines.length) {
        out.push('<p>' + pLines.join('<br>') + '</p>');
      }
    }

    return out.join('');
  }

  /* ---------- وضعیت برنامه (State) ---------- */
  const state = {
    threads: [],
    activeId: null,
    freshId: null,
    enteringThreadId: null,
    fmtOpen: false,
    previewOpen: false,
    busy: false,
    aborted: false,
    ctrl: null,
    collapsed: false,
    mobileOpen: false,
    searchQuery: '',
    searchSel: 0,
    searchItems: [],
    apiBase: '',
    remoteStatus: '',
    publicKey: DEFAULT_KEY,
    health: {
      cls: 'warn',
      label: 'در حال اتصال…',
      model: 'یونیکالکت چت مینی'
    }
  };

  /* ---------- ارجاع به عناصر DOM ---------- */
  const el = {
    app: document.getElementById('app'),
    main: document.getElementById('chat-main'),
    body: document.getElementById('chat-body'),
    heroArea: document.getElementById('hero-area'),
    heroGreeting: document.getElementById('hero-greeting'),
    heroPrompt: document.getElementById('hero-prompt'),
    scroller: document.getElementById('chat-scroller'),
    stream: document.getElementById('chat-stream'),
    sbThreads: document.getElementById('sb-threads'),
    sbBackdrop: document.getElementById('sb-backdrop'),
    composerArea: document.querySelector('.composer-area'),
    composer: document.getElementById('composer'),
    composerFmt: document.getElementById('composer-fmt'),
    composerPreview: document.getElementById('composer-preview'),
    btnFmtToggle: document.getElementById('btn-fmt-toggle'),
    btnPreviewToggle: document.getElementById('btn-preview-toggle'),
    taWrap: document.getElementById('ta-wrap'),
    taPh: document.getElementById('ta-ph'),
    input: document.getElementById('chat-input'),
    counter: document.getElementById('char-counter'),
    sendBtn: document.getElementById('btn-send'),
    sendIcoArrow: document.getElementById('send-ico-arrow'),
    sendIcoStop: document.getElementById('send-ico-stop'),
    starterChips: document.getElementById('starter-chips'),
    searchModal: document.getElementById('search-modal'),
    searchInput: document.getElementById('search-input'),
    searchClear: document.getElementById('btn-search-clear'),
    searchLabel: document.getElementById('search-label'),
    searchResults: document.getElementById('search-results'),
    settingsModal: document.getElementById('settings-modal'),
    modalPubKey: document.getElementById('modal-pub-key'),
    modalRouterUrl: document.getElementById('modal-router-url'),
    confirmModal: document.getElementById('confirm-modal'),
    toastHost: document.getElementById('toast-host')
  };

  /* ---------- اعلان‌ها (Toast) ---------- */
  function showToast(text, opts) {
    if (!el.toastHost) return;
    const o = opts || {};
    const type = o.type || (/(خطا|نشد|نیست|آفلاین)/.test(text) ? 'error' : /(صبر کنید|طولانی|متوقف|خالی)/.test(text) ? 'warn' : 'success');
    const ms = o.ms || (o.action ? 5000 : 2600);
    const toast = document.createElement('div');
    toast.className = 'toast t-' + type;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML =
      '<span class="toast-ic">' + (ICONS[type === 'error' ? 'x' : type === 'warn' ? 'alert' : type === 'info' ? 'info' : 'check']) + '</span>' +
      '<span class="toast-text">' + escapeHtml(text) + '</span>' +
      (o.action ? '<button class="toast-act" type="button">' + escapeHtml(o.action.label) + '</button>' : '') +
      '<button class="toast-x" type="button" aria-label="بستن">' + ICONS.x + '</button>' +
      '<span class="toast-bar" style="animation-duration:' + ms + 'ms"></span>';

    const removeToast = function () {
      if (!toast.parentNode || toast.classList.contains('closing')) return;
      toast.classList.add('closing');
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 200);
    };
    const timer = setTimeout(removeToast, ms);
    toast.querySelector('.toast-x').addEventListener('click', function () {
      clearTimeout(timer);
      removeToast();
    });
    if (o.action) {
      toast.querySelector('.toast-act').addEventListener('click', function () {
        clearTimeout(timer);
        o.action.onClick();
        removeToast();
      });
    }
    el.toastHost.insertBefore(toast, el.toastHost.firstChild);
  }

  /* ---------- مدیریت حافظه مرورگر (Threads) ---------- */
  function loadThreads() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        state.threads = parsed.filter(function (t) { return t && t.id && Array.isArray(t.messages); });
      }
    } catch (e) {
      state.threads = [];
    }
    try {
      const ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      state.collapsed = !!(ui.collapsed && window.innerWidth >= 768);
    } catch (e) {}
  }

  function saveThreads() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.threads));
    } catch (e) {
      showToast('حافظه مرورگر پر است؛ گفتگوهای قدیمی را پاک کنید');
    }
  }

  function groupThreadsByDate(threads) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekStart = todayStart - 7 * 86400000;

    const groups = [
      ['امروز', []],
      ['دیروز', []],
      ['۷ روز گذشته', []],
      ['قدیمی‌تر', []]
    ];

    threads.forEach(function (t) {
      const ts = t.updatedAt || t.createdAt || 0;
      if (ts >= todayStart) groups[0][1].push(t);
      else if (ts >= yesterdayStart) groups[1][1].push(t);
      else if (ts >= weekStart) groups[2][1].push(t);
      else groups[3][1].push(t);
    });

    return groups.filter(function (g) { return g[1].length > 0; });
  }

  function getActiveThread() {
    if (!state.activeId) return null;
    return state.threads.find(function (t) { return t.id === state.activeId; }) || null;
  }

  /* ---------- رندر نوار کناری (Sidebar Threads) ---------- */
  function renderSidebar() {
    if (!el.sbThreads) return;
    const sorted = state.threads.slice().sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    if (!sorted.length) {
      el.sbThreads.innerHTML = '<div class="sb-empty">هنوز گفتگویی ثبت نشده است</div>';
      return;
    }

    const groups = groupThreadsByDate(sorted);
    let html = '';
    groups.forEach(function (grp) {
      const label = grp[0];
      const items = grp[1];
      html += '<div class="sb-group"><div class="sb-group-label">' + escapeHtml(label) + '</div>';
      items.forEach(function (t) {
        const isActive = t.id === state.activeId;
        const isEntering = t.id === state.enteringThreadId;
        html +=
          '<div class="thread-row' + (isEntering ? ' entering' : '') + '">' +
            '<div class="thread' + (isActive ? ' active' : '') + '" role="button" tabindex="0" data-thread-id="' + escapeHtml(t.id) + '">' +
              (isActive ? '<span class="thread-ink"></span>' : '') +
              '<span class="t-left"><span class="t-dot dot-chat"></span><span class="t-title" dir="auto">' + escapeHtml(t.title || 'گفتگوی جدید') + '</span></span>' +
              '<button class="t-del" type="button" data-del-thread="' + escapeHtml(t.id) + '" title="حذف" aria-label="حذف گفتگو">' + ICONS.trash + '</button>' +
            '</div>' +
          '</div>';
      });
      html += '</div>';
    });

    el.sbThreads.innerHTML = html;
    state.enteringThreadId = null;

    el.sbThreads.querySelectorAll('[data-thread-id]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('[data-del-thread]')) return;
        selectThread(row.getAttribute('data-thread-id'));
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectThread(row.getAttribute('data-thread-id'));
        }
      });
    });

    el.sbThreads.querySelectorAll('[data-del-thread]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteThread(btn.getAttribute('data-del-thread'));
      });
    });
  }

  /* ---------- رندر مراحل فکر کردن (ThoughtLine & Steps) ---------- */
  function renderStepListHtml(steps) {
    let itemsHtml = '';
    steps.forEach(function (s) {
      const st = s.state || 'done';
      let ic = '<span class="st-ic wait"></span>';
      if (st === 'done') ic = '<span class="st-ic done">' + ICONS.check + '</span>';
      else if (st === 'error') ic = '<span class="st-ic error">' + ICONS.x + '</span>';
      else if (st === 'active') ic = '<span class="st-ic active"><i></i></span>';

      itemsHtml +=
        '<li class="think-step ' + st + '">' +
          ic +
          '<span class="st-body">' +
            '<span class="st-label">' + escapeHtml(s.label) + '</span>' +
            (s.detail ? '<span class="st-detail" dir="auto">' + escapeHtml(s.detail) + '</span>' : '') +
          '</span>' +
          (typeof s.ms === 'number' && st !== 'wait' ? '<span class="st-time mono">' + secs(s.ms) + 'ث</span>' : '') +
        '</li>';
    });
    return '<ol class="think-steps live">' + itemsHtml + '</ol>';
  }

  function renderThoughtLineHtml(ms, steps) {
    if (typeof ms !== 'number') return '';
    const hasSteps = Array.isArray(steps) && steps.length > 0;
    return (
      '<div class="thought" data-thought-box>' +
        '<button type="button" class="thought-line" data-thought-toggle ' + (hasSteps ? 'aria-expanded="false"' : 'disabled') + '>' +
          PETAL_MARK_HTML +
          '<span>' + secs(ms) + ' ثانیه فکر کرد</span>' +
          (hasSteps ? '<span class="thought-count">· ' + fa(steps.length) + ' مرحله</span>' : '') +
          (hasSteps ? '<span class="thinking-chev">' + ICONS.chevron + '</span>' : '') +
        '</button>' +
        (hasSteps ? '<div class="thought-steps-wrap" hidden>' + renderStepListHtml(steps) + '</div>' : '') +
      '</div>'
    );
  }

  /* ---------- رندر پیام‌های گفتگو ---------- */
  function scrollToBottom(force) {
    if (!el.scroller) return;
    if (force || el.scroller.scrollHeight - el.scroller.scrollTop - el.scroller.clientHeight < 180) {
      el.scroller.scrollTop = el.scroller.scrollHeight;
    }
  }

  function updateWelcomeState() {
    const active = getActiveThread();
    const isWelcome = !state.busy && (!active || !active.messages.length);
    const prevWasWelcome = el.body ? el.body.classList.contains('is-welcome') : isWelcome;
    const beforeTop = (el.composerArea && prevWasWelcome !== isWelcome) ? el.composerArea.getBoundingClientRect().top : null;
    if (el.main) el.main.classList.toggle('welcome', isWelcome);
    if (el.body) el.body.classList.toggle('is-welcome', isWelcome);
    setHidden(el.heroArea, !isWelcome);
    setHidden(el.scroller, isWelcome);
    setHidden(el.starterChips, !isWelcome);
    if (beforeTop !== null && el.composerArea) {
      const afterTop = el.composerArea.getBoundingClientRect().top;
      const dy = beforeTop - afterTop;
      if (Math.abs(dy) > 4) {
        el.composerArea.style.transition = 'none';
        el.composerArea.style.transform = 'translateY(' + dy + 'px)';
        void el.composerArea.offsetHeight;
        el.composerArea.style.transition = 'transform .42s cubic-bezier(.22, 1, .36, 1)';
        el.composerArea.style.transform = 'translateY(0)';
        setTimeout(function () {
          if (el.composerArea) {
            el.composerArea.style.transition = '';
            el.composerArea.style.transform = '';
          }
        }, 440);
      }
    }
  }

  function renderMessages() {
    updateWelcomeState();
    if (!el.stream) return;
    const active = getActiveThread();
    if (!active || !active.messages.length) {
      el.stream.innerHTML = '';
      return;
    }

    let html = '';
    active.messages.forEach(function (m) {
      const uDir = textDir(m.text);
      const isFresh = m.id === state.freshId;
      html +=
        '<div class="turn' + (isFresh ? ' fresh' : '') + '" data-msg-id="' + escapeHtml(m.id) + '">' +
          '<div class="msg user">' +
            '<div class="ubox">' +
              '<div class="bubble md user-md" dir="' + uDir + '">' + renderMarkdown(m.text) + '</div>' +
              '<div class="uacts">' +
                '<button class="icon-btn sm" type="button" data-copy-user="' + escapeHtml(m.id) + '" title="کپی متن" aria-label="کپی متن">' + ICONS.copy + '</button>' +
                '<button class="icon-btn sm" type="button" data-redo-msg="' + escapeHtml(m.id) + '" title="ارسال دوباره" aria-label="ارسال دوباره">' + ICONS.refresh + '</button>' +
              '</div>' +
            '</div>' +
          '</div>';

      if (!m.reply) {
        html +=
          '<div class="msg bot">' +
            '<div class="bot-body">' +
              renderThoughtLineHtml(m.thinkingMs, m.steps) +
              '<div class="err-line"><span class="err-icon">' + ICONS.alert + '</span><span class="err-text">' + escapeHtml(m.error || 'خطا در دریافت پاسخ') + '</span></div>' +
              '<div class="actions">' +
                '<button class="icon-btn sm" type="button" data-redo-msg="' + escapeHtml(m.id) + '" title="تلاش مجدد" aria-label="تلاش مجدد">' + ICONS.refresh + '</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      } else {
        const bDir = textDir(m.reply);
        html +=
          '<div class="msg bot">' +
            '<div class="bot-body">' +
              renderThoughtLineHtml(m.thinkingMs, m.steps) +
              '<div class="md" dir="' + bDir + '">' + renderMarkdown(m.reply) + '</div>' +
              '<div class="actions">' +
                '<button class="icon-btn sm" type="button" data-copy-bot="' + escapeHtml(m.id) + '" title="کپی پاسخ" aria-label="کپی پاسخ">' + ICONS.copy + '</button>' +
                '<button class="icon-btn sm" type="button" data-redo-msg="' + escapeHtml(m.id) + '" title="پاسخ دوباره" aria-label="پاسخ دوباره">' + ICONS.refresh + '</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      }

      html += '</div>';
    });

    el.stream.innerHTML = html;
    bindStreamEvents();
    requestAnimationFrame(function () { scrollToBottom(true); });
  }

  function bindStreamEvents() {
    if (!el.stream) return;
    const active = getActiveThread();

    el.stream.querySelectorAll('[data-thought-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const box = btn.closest('[data-thought-box]');
        const wrap = box ? box.querySelector('.thought-steps-wrap') : null;
        if (!box || !wrap) return;
        const isOpen = box.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        if (isOpen) openAnimated(wrap);
        else closeAnimated(wrap, 210);
      });
    });

    el.stream.querySelectorAll('[data-copy-user]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!active) return;
        const m = active.messages.find(function (x) { return x.id === btn.getAttribute('data-copy-user'); });
        if (m) copyText(m.text).then(function () { showToast('متن کپی شد'); });
      });
    });

    el.stream.querySelectorAll('[data-copy-bot]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!active) return;
        const m = active.messages.find(function (x) { return x.id === btn.getAttribute('data-copy-bot'); });
        if (m && m.reply) copyText(m.reply).then(function () { showToast('پاسخ کپی شد'); });
      });
    });

    el.stream.querySelectorAll('[data-redo-msg]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        redoMessage(btn.getAttribute('data-redo-msg'));
      });
    });

    el.stream.querySelectorAll('[data-copy-encoded]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const code = decodeURIComponent(btn.getAttribute('data-copy-encoded') || '');
        copyText(code).then(function () {
          const sp = btn.querySelector('span');
          if (sp) sp.textContent = 'کپی شد';
          showToast('کد کپی شد');
          setTimeout(function () { if (sp) sp.textContent = 'کپی'; }, 1400);
        });
      });
    });
  }

  /* ---------- کادر ورودی پیام (Composer) و تغییر اندازه خودکار ---------- */
  let _composerRaf = 0;
  function scheduleComposerSize() {
    if (_composerRaf) return;
    _composerRaf = requestAnimationFrame(function () {
      _composerRaf = 0;
      syncComposerSize(false);
    });
  }
  function syncComposerSize(instant) {
    if (!el.input || !el.taWrap) return;
    const val = el.input.value;
    const dir = textDir(val);
    el.input.dir = dir;

    el.input.style.height = 'auto';
    const contentH = el.input.scrollHeight;
    const h = val ? Math.max(Math.min(contentH, MAX_TA_H), 28) : 28;

    el.input.style.height = h + 'px';
    if (instant) {
      el.taWrap.style.transition = 'none';
      el.taWrap.style.height = h + 'px';
      void el.taWrap.offsetHeight;
      el.taWrap.style.transition = '';
    } else {
      el.taWrap.style.height = h + 'px';
    }
    el.input.style.overflowY = contentH > MAX_TA_H ? 'auto' : 'hidden';

    if (el.taPh) el.taPh.classList.toggle('off', val.length > 0);
    if (el.counter) {
      if (val.length > 200) {
        setHidden(el.counter, false);
        el.counter.textContent = fa(val.length) + ' / ' + fa(MAX_TEXT);
      } else {
        setHidden(el.counter, true);
      }
    }
    updateComposerPreview();
    updateSendButtonState();
  }

  function updateComposerPreview() {
    if (!el.composerPreview || !state.previewOpen || !el.input) return;
    const raw = el.input.value;
    if (!raw.trim()) {
      el.composerPreview.dir = 'rtl';
      el.composerPreview.innerHTML = '<span class="composer-preview-empty">پیش‌نمایش زنده مارک‌داون، کد و فرمول ریاضی اینجا نمایش داده می‌شود…</span>';
      return;
    }
    el.composerPreview.dir = textDir(raw);
    el.composerPreview.innerHTML = renderMarkdown(raw);
  }

  function updateSendButtonState() {
    if (!el.sendBtn || !el.input) return;
    const canSend = /\S/.test(el.input.value);
    const active = state.busy || canSend;
    el.sendBtn.disabled = !active;
    el.sendBtn.classList.toggle('busy', state.busy);
    el.sendBtn.classList.toggle('on', active);
    el.sendBtn.title = state.busy ? 'توقف' : 'ارسال';
    el.sendBtn.setAttribute('aria-label', state.busy ? 'توقف' : 'ارسال');
    setHidden(el.sendIcoArrow, state.busy);
    setHidden(el.sendIcoStop, !state.busy);
    if (el.composer) { el.composer.classList.toggle('busy', state.busy); el.composer.classList.toggle('ink-border', state.busy); }
  }

  function clearComposer() {
    if (!el.input) return;
    el.input.value = '';
    syncComposerSize(true);
  }

  /* ---------- تشخیص آدرس سرور و وضعیت سلامت ---------- */
  async function resolveApiBase() {
    if (!IS_PAGES) return '';
    if (state.apiBase) return state.apiBase;
    const bust = '?t=' + Date.now();
    try {
      const r = await fetch(PAGES_ROOT + 'api/links.json' + bust, { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d) {
          if (d.public_api_key) state.publicKey = d.public_api_key;
          if (d.status) state.remoteStatus = d.status;
          if (d.base_url) {
            state.apiBase = String(d.base_url).replace(/\/+$/, '');
            return state.apiBase;
          }
        }
      }
    } catch (e) {}
    try {
      const r2 = await fetch(PAGES_ROOT + 'assets/status.json' + bust, { cache: 'no-store' });
      if (r2.ok) {
        const s = await r2.json();
        if (s) {
          if (s.public_api_key) state.publicKey = s.public_api_key;
          if (s.status) state.remoteStatus = s.status;
          if (s.url_payload) {
            state.apiBase = atob(s.url_payload).replace(/\/+$/, '');
            return state.apiBase;
          }
        }
      }
    } catch (e) {}
    return '';
  }

  function applyHealthUI() {
    document.querySelectorAll('[data-health-dot]').forEach(function (dot) {
      dot.className = 'sdot ' + state.health.cls;
    });
    document.querySelectorAll('[data-health-label]').forEach(function (lbl) {
      lbl.textContent = state.health.label;
    });
    if (el.modalPubKey) el.modalPubKey.textContent = state.publicKey || DEFAULT_KEY;
    if (el.modalRouterUrl) {
      const base = state.apiBase || (!IS_PAGES ? location.origin : 'https://YOUR-LINK.trycloudflare.com');
      el.modalRouterUrl.textContent = base + '/v1';
    }
    document.querySelectorAll('[data-swagger-link]').forEach(function (a) {
      a.href = (state.apiBase || '') + '/docs';
    });
  }

  async function checkHealth() {
    try {
      const base = await resolveApiBase();
      if (IS_PAGES && !base) {
        state.health = state.remoteStatus === 'starting' ? { cls: 'warn', label: 'در حال راه‌اندازی سرور…', model: 'یونیکالکت چت مینی' } : { cls: 'bad', label: 'سرویس آفلاین است', model: 'یونیکالکت چت مینی' };
        applyHealthUI();
        return;
      }
      try {
        const rk = await fetch(base + '/api/v1/key', { cache: 'no-store' });
        if (rk.ok) {
          const dk = await rk.json();
          if (dk && dk.public_api_key) state.publicKey = dk.public_api_key;
          if (dk && dk.base_url && !state.apiBase && IS_PAGES) state.apiBase = dk.base_url.replace(/\/+$/, '');
        }
      } catch (e) {}

      const r = await fetch(base + '/health', { cache: 'no-store' });
      const d = await r.json();
      if (d && d.public_api_key) state.publicKey = d.public_api_key;
      state.health = d && d.status === 'ok'
        ? { cls: 'ok', label: 'آماده', model: 'یونیکالکت چت مینی' }
        : { cls: 'warn', label: 'مدل در حال بارگذاری…', model: 'یونیکالکت چت مینی' };
    } catch (e) {
      state.health = { cls: 'bad', label: 'سرور در دسترس نیست', model: 'یونیکالکت چت مینی' };
    }
    applyHealthUI();
  }

  /* ---------- ارسال پیام و استریم زنده SSE ---------- */
  function buildHistory(thread) {
    const flat = [];
    thread.messages
      .filter(function (m) { return !m.error && m.reply; })
      .slice(-MAX_HISTORY_TURNS)
      .forEach(function (m) {
        flat.push({ role: 'user', content: m.text });
        flat.push({ role: 'assistant', content: m.reply });
      });
    return flat;
  }

  function buildChatSteps(text, histTurns, timings, reply, error) {
    const s = function (ms) { return ms > 0 ? Math.round(ms) : undefined; };
    const words = (reply || '').trim().split(/\s+/).filter(Boolean).length;
    const steps = [
      { label: STEPS[0], detail: fa(Array.from(text).length) + ' نویسه', ms: s(timings.d0) },
      { label: STEPS[1], detail: histTurns ? fa(histTurns) + ' پیام قبلی در حافظه' : 'گفتگوی تازه', ms: s(timings.d1) },
      {
        label: STEPS[2],
        detail: timings.first ? 'اولین واژه پس از ' + secs(timings.first - timings.t0) + ' ثانیه' : 'پاسخی نرسید',
        ms: s((timings.first || timings.end) - timings.m2),
        state: timings.first ? 'done' : 'error'
      }
    ];
    if (timings.first) {
      steps.push({
        label: STEPS[3],
        detail: fa(words) + ' واژه' + (error ? ' · ارتباط قطع شد' : ''),
        ms: s(timings.end - timings.first),
        state: error ? 'error' : 'done'
      });
    } else if (error) {
      steps.push({ label: 'خطا', detail: error, state: 'error' });
    }
    return steps;
  }

  async function sendMessage(rawText, fromInput) {
    const text = String(rawText || '').trim();
    if (!text || state.busy) return;
    if (text.length > MAX_TEXT) {
      showToast('پیام طولانی است (حداکثر ' + fa(MAX_TEXT) + ' نویسه)');
      return;
    }

    const ctrl = new AbortController();
    state.ctrl = ctrl;
    state.aborted = false;
    state.busy = true;
    if (fromInput) clearComposer();
    updateSendButtonState();

    let thread = getActiveThread();
    let createdNew = false;
    if (!thread) {
      const oneLine = text.replace(/\s+/g, ' ');
      thread = {
        id: newId('th'),
        title: (stripMarkdown(oneLine) || oneLine).slice(0, 40) + ((stripMarkdown(oneLine) || oneLine).length > 40 ? '…' : ''),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      state.threads.unshift(thread);
      state.activeId = thread.id;
      state.enteringThreadId = thread.id;
      createdNew = true;
      saveThreads();
      renderSidebar();
    }

    const history = buildHistory(thread);
    renderMessages();
    updateWelcomeState();

    // ایجاد ردیف پیام در حال پردازش (Pending Turn)
    const pendingTurn = document.createElement('div');
    pendingTurn.className = 'turn pending';
    const uDir = textDir(text);
    const charDetail = fa(Array.from(text).length) + ' نویسه';
    const histDetail = history.length ? fa(history.length / 2) + ' پیام قبلی در حافظه' : 'گفتگوی تازه';

    pendingTurn.innerHTML =
      '<div class="msg user"><div class="ubox"><div class="bubble md user-md" dir="' + uDir + '">' + renderMarkdown(text) + '</div></div></div>' +
      '<div class="msg bot"><div class="bot-body" id="pending-bot-body">' +
        '<div class="thinking-block" id="pending-thinking" role="status" aria-live="polite">' +
          '<button type="button" class="thinking-head" aria-expanded="true">' +
            PETAL_MARK_HTML +
            '<span class="thinking-label shiny" id="pending-phase-lbl">' + STEPS[0] + '</span>' +
            '<span class="thinking-time mono" id="pending-time" hidden>۰ ثانیه</span>' +
            '<span class="thinking-chev" style="transform:rotate(180deg)">' + ICONS.chevron + '</span>' +
          '</button>' +
          '<div id="pending-steps-box" class="thought-steps-wrap"></div>' +
        '</div>' +
        '<div class="writing-line" id="pending-writing" hidden><span class="shiny">در حال نوشتن پاسخ</span></div>' +
        '<div class="md live" id="pending-md" hidden dir="rtl"></div>' +
      '</div></div>';

    el.stream.appendChild(pendingTurn);
    pendingTurn.querySelectorAll('[data-copy-encoded]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const code = decodeURIComponent(btn.getAttribute('data-copy-encoded') || '');
        copyText(code).then(function () {
          const sp = btn.querySelector('span');
          if (sp) sp.textContent = 'کپی شد';
          showToast('کد کپی شد');
          setTimeout(function () { if (sp) sp.textContent = 'کپی'; }, 1400);
        });
      });
    });
    scrollToBottom(true);

    const t0 = performance.now();
    const timings = { t0: t0, d0: 180, d1: 220, m2: t0 + 400, first: 0, end: 0 };
    let phaseIdx = 0;

    const stepsBox = document.getElementById('pending-steps-box');
    const pendingThinking = document.getElementById('pending-thinking');
    if (pendingThinking) {
      pendingThinking.classList.add('open');
      const pHead = pendingThinking.querySelector('.thinking-head');
      if (pHead && stepsBox) {
        pHead.addEventListener('click', function () {
          const isOpen = pendingThinking.classList.toggle('open');
          pHead.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
          if (isOpen) openAnimated(stepsBox);
          else closeAnimated(stepsBox, 210);
        });
      }
    }
    const phaseLbl = document.getElementById('pending-phase-lbl');
    const timeLbl = document.getElementById('pending-time');
    const thinkingEl = document.getElementById('pending-thinking');
    const writingEl = document.getElementById('pending-writing');
    const mdEl = document.getElementById('pending-md');

    function updatePendingThinkingUI() {
      if (!stepsBox || timings.first) return;
      const now = performance.now();
      const elapsedSec = Math.floor((now - t0) / 1000);
      if (timeLbl && elapsedSec >= 1) {
        setHidden(timeLbl, false);
        timeLbl.textContent = fa(elapsedSec) + ' ثانیه';
      }
      if (phaseLbl) phaseLbl.textContent = STEPS[phaseIdx];
      const liveSteps = [
        { label: STEPS[0], detail: charDetail, state: phaseIdx > 0 ? 'done' : 'active', ms: phaseIdx > 0 ? timings.d0 : now - t0 },
        { label: STEPS[1], detail: histDetail, state: phaseIdx > 1 ? 'done' : phaseIdx === 1 ? 'active' : 'wait', ms: phaseIdx > 1 ? timings.d1 : phaseIdx === 1 ? now - (t0 + timings.d0) : undefined },
        { label: STEPS[2], detail: '', state: phaseIdx === 2 ? 'active' : 'wait', ms: phaseIdx === 2 ? now - timings.m2 : undefined },
        { label: STEPS[3], detail: '', state: 'wait' }
      ];
      stepsBox.innerHTML = renderStepListHtml(liveSteps);
    }

    updatePendingThinkingUI();
    const phaseTimer1 = setTimeout(function () { phaseIdx = 1; updatePendingThinkingUI(); }, 180);
    const phaseTimer2 = setTimeout(function () { phaseIdx = 2; updatePendingThinkingUI(); }, 400);
    const clockInterval = setInterval(updatePendingThinkingUI, 200);
    const timeoutId = setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS);

    let reply = '';
    let displayedReply = '';
    let streamQueue = '';
    let streamRaf = 0;
    let error = null;

    function flushStreamFrame(forceAll) {
      if (!streamQueue.length) return;
      if (forceAll) {
        displayedReply += streamQueue;
        streamQueue = '';
      } else {
        const chars = Array.from(streamQueue);
        const step = Math.max(2, Math.min(20, Math.ceil(chars.length / 7)));
        displayedReply += chars.slice(0, step).join('');
        streamQueue = chars.slice(step).join('');
      }
      if (mdEl) {
        mdEl.dir = textDir(displayedReply);
        mdEl.innerHTML = renderMarkdown(displayedReply) + '<span class="stream-dot"></span>';
      }
      scrollToBottom(false);
    }

    function scheduleStreamPump() {
      if (streamRaf) return;
      streamRaf = requestAnimationFrame(function () {
        streamRaf = 0;
        flushStreamFrame(false);
        if (streamQueue.length && !state.aborted) {
          scheduleStreamPump();
        }
      });
    }

    try {
      const base = await resolveApiBase();
      const headers = { 'Content-Type': 'application/json' };
      const urlTok = new URLSearchParams(location.search).get('token');
      if (urlTok) headers['X-Panel-Token'] = urlTok;
      if (state.publicKey) headers['X-API-Key'] = state.publicKey;

      const r = await fetch(base + '/api/chat/stream', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ message: text, history: history }),
        signal: ctrl.signal
      });

      if (!r.ok || !r.body) {
        let msg = 'پاسخ نامعتبر از سرور (HTTP ' + r.status + ')';
        try {
          const j = await r.json();
          if (j && j.error) msg = typeof j.error === 'string' ? j.error : (j.error.message || msg);
        } catch (e) {}
        error = msg;
      } else {
        const reader = r.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        outer: while (true) {
          const res = await reader.read();
          if (res.done) break;
          buf += decoder.decode(res.value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 2);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (payload === '[DONE]') break outer;
            let obj = null;
            try { obj = JSON.parse(payload); } catch (e) { continue; }
            if (obj && typeof obj.t === 'string' && obj.t) {
              if (!timings.first) {
                timings.first = performance.now();
                setHidden(thinkingEl, true);
                setHidden(writingEl, false);
                setHidden(mdEl, false);
              }
              reply += obj.t;
              streamQueue += obj.t;
              scheduleStreamPump();
            } else if (obj && obj.error) {
              error = typeof obj.error === 'string' ? obj.error : (obj.error.message || 'خطا در دریافت پاسخ');
              break outer;
            }
          }
        }
        if (streamQueue.length && !state.aborted) {
          await new Promise(function (resolve) {
            const finishStart = performance.now();
            function drainTail() {
              if (!streamQueue.length || state.aborted || performance.now() - finishStart > 320) {
                flushStreamFrame(true);
                resolve();
                return;
              }
              flushStreamFrame(false);
              requestAnimationFrame(drainTail);
            }
            requestAnimationFrame(drainTail);
          });
        }
      }
    } catch (e) {
      if (!state.aborted && !reply) {
        error = e && e.name === 'AbortError' ? 'زمان پاسخ‌گویی سرور تمام شد' : 'ارتباط با سرور برقرار نشد';
      } else if (!state.aborted) {
        error = 'ارتباط وسط پاسخ قطع شد';
      }
      checkHealth();
    } finally {
      if (streamRaf) { cancelAnimationFrame(streamRaf); streamRaf = 0; }
      clearTimeout(phaseTimer1);
      clearTimeout(phaseTimer2);
      clearInterval(clockInterval);
      clearTimeout(timeoutId);
    }

    timings.end = performance.now();

    if (state.aborted && !reply) {
      if (pendingTurn.parentNode) pendingTurn.parentNode.removeChild(pendingTurn);
      if (createdNew && !thread.messages.length) {
        state.threads = state.threads.filter(function (t) { return t.id !== thread.id; });
        state.activeId = null;
        saveThreads();
        renderSidebar();
      }
      if (fromInput && el.input && !el.input.value) {
        el.input.value = text;
        syncComposerSize(true);
      }
      state.busy = false;
      state.ctrl = null;
      updateSendButtonState();
      updateWelcomeState();
      showToast('ارسال متوقف شد');
      return;
    }

    const ok = !!reply;
    const msgObj = {
      id: newId('msg'),
      text: text,
      ts: Date.now(),
      reply: ok ? reply : null,
      error: ok ? null : (error || 'پاسخی از سرور دریافت نشد'),
      thinkingMs: Math.round((timings.first || timings.end) - timings.t0),
      steps: buildChatSteps(text, history.length / 2, timings, reply, ok ? (state.aborted ? 'متوقف شد' : error) : error)
    };

    thread.messages.push(msgObj);
    thread.updatedAt = Date.now();
    state.freshId = msgObj.id;
    saveThreads();

    state.busy = false;
    state.ctrl = null;
    updateSendButtonState();
    renderSidebar();
    renderMessages();
    if (el.input) el.input.focus();
  }

  function stopStreaming() {
    if (!state.busy) return;
    state.aborted = true;
    try {
      if (state.ctrl) state.ctrl.abort();
    } catch (e) {}
  }

  /* ---------- عملیات گفتگوها ---------- */
  function startNewThread() {
    if (state.busy) {
      showToast('صبر کنید تا پاسخ فعلی تمام شود');
      return;
    }
    state.activeId = null;
    state.freshId = null;
    state.mobileOpen = false;
    applyLayoutClasses();
    renderSidebar();
    renderMessages();
    rotateHeroPrompt();
    if (el.input) el.input.focus();
  }

  function selectThread(id) {
    if (state.busy) {
      showToast('صبر کنید تا پاسخ فعلی تمام شود');
      return;
    }
    state.mobileOpen = false;
    applyLayoutClasses();
    if (state.activeId !== id) {
      state.freshId = null;
      state.activeId = id;
      renderSidebar();
      renderMessages();
    }
  }

  function deleteThread(id) {
    if (state.busy && id === state.activeId) {
      showToast('صبر کنید تا پاسخ فعلی تمام شود');
      return;
    }
    const idx = state.threads.findIndex(function (t) { return t.id === id; });
    if (idx === -1) return;
    const row = el.sbThreads ? el.sbThreads.querySelector('[data-thread-id="' + id + '"]') : null;
    const wrapRow = row ? row.closest('.thread-row') : null;
    if (wrapRow && wrapRow.classList.contains('closing')) return;

    const finalizeDelete = function () {
      const curIdx = state.threads.findIndex(function (t) { return t.id === id; });
      if (curIdx === -1) return;
      const removed = state.threads[curIdx];
      const wasActive = id === state.activeId;
      state.threads.splice(curIdx, 1);
      if (wasActive) state.activeId = null;
      saveThreads();
      renderSidebar();
      renderMessages();

      showToast('گفتگو حذف شد', {
        type: 'info',
        action: {
          label: 'بازگردانی',
          onClick: function () {
            state.enteringThreadId = removed.id;
            state.threads.splice(curIdx, 0, removed);
            if (wasActive) state.activeId = removed.id;
            saveThreads();
            renderSidebar();
            renderMessages();
          }
        }
      });
    };

    if (wrapRow) {
      wrapRow.classList.add('closing');
      setTimeout(finalizeDelete, 220);
      return;
    }
    finalizeDelete();
  }

  function redoMessage(msgId) {
    if (state.busy) {
      showToast('صبر کنید تا پاسخ فعلی تمام شود');
      return;
    }
    const active = getActiveThread();
    if (!active) return;
    const msg = active.messages.find(function (m) { return m.id === msgId; });
    if (!msg) return;
    active.messages = active.messages.filter(function (m) { return m.id !== msgId; });
    active.updatedAt = Date.now();
    saveThreads();
    renderMessages();
    setTimeout(function () {
      sendMessage(msg.text, false);
    }, 30);
  }

  function exportActiveThread() {
    const active = getActiveThread();
    if (!active) {
      showToast('گفتگویی برای خروجی انتخاب نشده');
      return;
    }
    downloadJson('unicollect_chat_' + active.id + '.json', active);
    showToast('فایل JSON دانلود شد');
  }

  /* ---------- نوار کناری و طرح‌بندی (Sidebar & Layout) ---------- */
  function applyLayoutClasses() {
    if (!el.app) return;
    el.app.classList.toggle('collapsed', state.collapsed);
    el.app.classList.toggle('mobile-open', state.mobileOpen);
  }

  function toggleSidebar() {
    if (window.innerWidth < 768) {
      state.mobileOpen = !state.mobileOpen;
    } else {
      state.collapsed = !state.collapsed;
      try {
        localStorage.setItem(UI_KEY, JSON.stringify({ collapsed: state.collapsed }));
      } catch (e) {}
    }
    applyLayoutClasses();
  }

  /* ---------- خوش‌آمدگویی (Hero Greeting) ---------- */
  function getGreetingByHour() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'صبحت بخیر';
    if (h >= 12 && h < 16) return 'ظهرت بخیر';
    if (h >= 16 && h < 19) return 'عصرت بخیر';
    return 'شبت بخیر';
  }

  function rotateHeroPrompt() {
    if (el.heroGreeting) el.heroGreeting.textContent = getGreetingByHour();
    if (el.heroPrompt) {
      const p = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
      el.heroPrompt.textContent = p;
    }
  }

  /* ---------- مودال جستجو (Search Modal) ---------- */
  function highlightText(text, q) {
    const str = String(text || '');
    if (!q) return escapeHtml(str);
    const low = str.toLowerCase();
    let pos = 0;
    let i;
    let out = '';
    while ((i = low.indexOf(q, pos)) !== -1) {
      out += escapeHtml(str.slice(pos, i)) + '<mark>' + escapeHtml(str.slice(i, i + q.length)) + '</mark>';
      pos = i + q.length;
    }
    out += escapeHtml(str.slice(pos));
    return out;
  }

  function openSearchModal() {
    state.mobileOpen = false;
    applyLayoutClasses();
    if (!el.searchModal) return;
    openAnimated(el.searchModal);
    state.searchQuery = '';
    state.searchSel = 0;
    if (el.searchInput) {
      el.searchInput.value = '';
      setTimeout(function () { el.searchInput.focus(); }, 30);
    }
    renderSearchResults();
  }

  function closeSearchModal() {
    closeAnimated(el.searchModal);
  }

  function renderSearchResults() {
    if (!el.searchResults || !el.searchLabel) return;
    const q = state.searchQuery.toLowerCase().trim();
    setHidden(el.searchClear, !q);

    const sorted = state.threads.slice().sort(function (a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    const items = [];
    if (!q) {
      sorted.slice(0, 20).forEach(function (t) {
        const last = t.messages[t.messages.length - 1];
        const snip = last ? (last.text + ' ' + (last.reply || '')).slice(0, 90) : '';
        items.push({ t: t, snippet: snip });
      });
    } else {
      for (let i = 0; i < sorted.length; i++) {
        const t = sorted[i];
        const inTitle = (t.title || '').toLowerCase().includes(q);
        const hit = t.messages.find(function (m) {
          return ((m.text || '') + ' ' + (m.reply || '')).toLowerCase().includes(q);
        });
        if (inTitle || hit) {
          const snip = hit ? (hit.text + ' ' + (hit.reply || '')).slice(0, 100) : ((t.messages[0] && t.messages[0].text) || '');
          items.push({ t: t, snippet: snip });
        }
        if (items.length >= 50) break;
      }
    }

    state.searchItems = items;
    if (state.searchSel >= items.length) state.searchSel = 0;

    el.searchLabel.textContent = items.length ? (q ? fa(items.length) + ' نتیجه' : 'گفتگوهای اخیر') : '';

    if (!items.length) {
      el.searchResults.innerHTML =
        '<div class="search-empty">' + (q ? ICONS.search : ICONS.msg) +
        '<span>' + (q ? 'گفتگویی با این عبارت پیدا نشد' : 'هنوز گفتگویی ثبت نشده است') + '</span></div>';
      return;
    }

    let html = '';
    items.forEach(function (item, idx) {
      const t = item.t;
      const isSel = idx === state.searchSel;
      html +=
        '<button type="button" role="option" aria-selected="' + (isSel ? 'true' : 'false') + '" ' +
          'class="search-item' + (isSel ? ' sel' : '') + (t.id === state.activeId ? ' current' : '') + '" ' +
          'data-search-pick="' + escapeHtml(t.id) + '" data-search-idx="' + idx + '">' +
          (isSel ? '<span class="search-sel"></span>' : '') +
          '<span class="si-ico">' + ICONS.msg + '<span class="t-dot dot-chat"></span></span>' +
          '<span class="si-text">' +
            '<span class="si-title" dir="auto">' + highlightText(t.title || 'گفتگوی جدید', q) + '</span>' +
            '<span class="si-snip" dir="auto">' + highlightText((item.snippet || '').replace(/\s+/g, ' '), q) + '</span>' +
          '</span>' +
          '<span class="si-time">' + escapeHtml(relTime(t.updatedAt || t.createdAt)) + '</span>' +
        '</button>';
    });
    el.searchResults.innerHTML = html;

    el.searchResults.querySelectorAll('[data-search-pick]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const id = btn.getAttribute('data-search-pick');
        closeSearchModal();
        selectThread(id);
      });
    });
  }

  /* ---------- مودال تنظیمات و حذف همه گفتگوها ---------- */
  function openSettingsModal() {
    state.mobileOpen = false;
    applyLayoutClasses();
    applyHealthUI();
    openAnimated(el.settingsModal);
  }

  function closeSettingsModal() {
    closeAnimated(el.settingsModal);
  }

  function askClearAllThreads() {
    if (state.busy) {
      showToast('صبر کنید تا پاسخ فعلی تمام شود');
      return;
    }
    if (!state.threads.length) {
      showToast('تاریخچه از قبل خالی است', { type: 'info' });
      return;
    }
    openAnimated(el.confirmModal);
  }

  /* ---------- اتصال رویدادها (Event Listeners) ---------- */
  function bindEvents() {
    const on = function (id, evt, fn) {
      const node = document.getElementById(id);
      if (node) node.addEventListener(evt, fn);
    };

    on('btn-logo-new', 'click', startNewThread);
    on('btn-new-chat', 'click', startNewThread);
    on('btn-tb-new', 'click', startNewThread);
    on('btn-sb-toggle', 'click', toggleSidebar);
    on('btn-tb-sidebar', 'click', toggleSidebar);
    on('sb-backdrop', 'click', function () {
      state.mobileOpen = false;
      applyLayoutClasses();
    });

    on('btn-open-search', 'click', openSearchModal);
    on('btn-tb-search', 'click', openSearchModal);
    on('btn-open-settings', 'click', openSettingsModal);
    on('btn-profile-settings', 'click', openSettingsModal);
    on('btn-status-pill', 'click', openSettingsModal);
    on('btn-settings-close', 'click', closeSettingsModal);
    on('btn-settings-ok', 'click', closeSettingsModal);
    on('btn-tb-export', 'click', exportActiveThread);

    on('btn-copy-modal-key', 'click', function () {
      copyText(state.publicKey || DEFAULT_KEY).then(function (ok) {
        if (ok) showToast('کلید عمومی API کپی شد');
      });
    });

    on('btn-copy-modal-router', 'click', function () {
      const txt = el.modalRouterUrl ? el.modalRouterUrl.textContent : '/v1';
      copyText(txt).then(function (ok) {
        if (ok) showToast('آدرس روتر کپی شد');
      });
    });

    on('btn-clear-all', 'click', askClearAllThreads);
    on('btn-confirm-no', 'click', function () {
      closeAnimated(el.confirmModal);
    });
    on('btn-confirm-yes', 'click', function () {
      state.threads = [];
      state.activeId = null;
      saveThreads();
      closeAnimated(el.confirmModal);
      closeSettingsModal();
      renderSidebar();
      renderMessages();
      showToast('تاریخچه پاک شد');
    });

    if (el.settingsModal) {
      el.settingsModal.addEventListener('mousedown', function (e) {
        if (e.target === el.settingsModal) closeSettingsModal();
      });
    }
    if (el.searchModal) {
      el.searchModal.addEventListener('mousedown', function (e) {
        if (e.target === el.searchModal) closeSearchModal();
      });
    }
    if (el.confirmModal) {
      el.confirmModal.addEventListener('mousedown', function (e) {
        if (e.target === el.confirmModal) closeAnimated(el.confirmModal);
      });
    }

    if (el.searchInput) {
      el.searchInput.addEventListener('input', function () {
        state.searchQuery = el.searchInput.value;
        state.searchSel = 0;
        renderSearchResults();
      });
      el.searchInput.addEventListener('keydown', function (e) {
        const len = state.searchItems.length;
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          if (!len) return;
          state.searchSel = (state.searchSel + (e.key === 'ArrowDown' ? 1 : -1) + len) % len;
          renderSearchResults();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const item = state.searchItems[state.searchSel];
          if (item) {
            closeSearchModal();
            selectThread(item.t.id);
          }
        }
      });
    }
    on('btn-search-clear', 'click', function () {
      if (!el.searchInput) return;
      el.searchInput.value = '';
      state.searchQuery = '';
      state.searchSel = 0;
      renderSearchResults();
      el.searchInput.focus();
    });

    // کادر ورودی پیام (Composer)
    if (el.input) {
      el.input.addEventListener('input', function () {
        scheduleComposerSize();
      });
      el.input.addEventListener('focus', function () {
        if (el.composer) el.composer.classList.add('focused');
      });
      el.input.addEventListener('blur', function () {
        if (el.composer) el.composer.classList.remove('focused');
      });
      el.input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          if (!state.busy) sendMessage(el.input.value, true);
        }
      });
    }

    if (el.sendBtn) {
      el.sendBtn.addEventListener('click', function () {
        if (state.busy) stopStreaming();
        else if (el.input) sendMessage(el.input.value, true);
      });
    }

    on('btn-paste', 'click', async function () {
      try {
        const clip = await navigator.clipboard.readText();
        if (!clip || !el.input) return;
        const start = el.input.selectionStart || 0;
        const end = el.input.selectionEnd || 0;
        const val = el.input.value;
        const room = MAX_TEXT - (val.length - (end - start));
        const chunk = clip.slice(0, Math.max(0, room));
        if (!chunk) {
          showToast('به حداکثر طول پیام رسیده‌اید');
          return;
        }
        el.input.setRangeText(chunk, start, end, 'end');
        syncComposerSize(false);
        el.input.focus();
      } catch (e) {
        showToast('دسترسی به کلیپ‌بورد ممکن نیست');
      }
    });

    on('btn-fmt-toggle', 'click', function () {
      state.fmtOpen = !state.fmtOpen;
      if (el.btnFmtToggle) {
        el.btnFmtToggle.classList.toggle('on', state.fmtOpen);
        el.btnFmtToggle.setAttribute('aria-pressed', state.fmtOpen ? 'true' : 'false');
      }
      if (state.fmtOpen) openAnimated(el.composerFmt);
      else closeAnimated(el.composerFmt, 190);
    });

    on('btn-preview-toggle', 'click', function () {
      state.previewOpen = !state.previewOpen;
      if (el.btnPreviewToggle) {
        el.btnPreviewToggle.classList.toggle('on', state.previewOpen);
        el.btnPreviewToggle.setAttribute('aria-pressed', state.previewOpen ? 'true' : 'false');
      }
      if (state.previewOpen) {
        updateComposerPreview();
        openAnimated(el.composerPreview);
      } else {
        closeAnimated(el.composerPreview, 190);
      }
    });

    document.querySelectorAll('[data-fmt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!el.input) return;
        const kind = btn.getAttribute('data-fmt');
        const s = el.input.selectionStart || 0;
        const e = el.input.selectionEnd || 0;
        const sel = el.input.value.slice(s, e);
        const templates = {
          bold: ['**', '**', 'متن ضخیم'],
          italic: ['*', '*', 'متن مورب'],
          mark: ['==', '==', 'متن مهم'],
          code: ['`', '`', 'code'],
          codeblock: ['```text\n', '\n```', 'متن یا کد'],
          math: ['$$\n', '\n$$', '\\frac{a}{b} = c'],
          callout: ['> [!NOTE] ', '', 'نکته‌ی مهم'],
          task: ['- [ ] ', '', 'عنوان کار']
        };
        const t = templates[kind];
        if (!t) return;
        const body = sel || t[2];
        const inserted = t[0] + body + t[1];
        el.input.setRangeText(inserted, s, e, 'select');
        el.input.setSelectionRange(s + t[0].length, s + t[0].length + body.length);
        syncComposerSize(false);
        el.input.focus();
      });
    });

    // پیشنهادهای شروع گفتگو (Starter Chips)
    document.querySelectorAll('[data-starter]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        const prompt = chip.getAttribute('data-starter');
        if (prompt) sendMessage(prompt, false);
      });
    });

    // میانبرهای صفحه‌کلید
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        startNewThread();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        closeSettingsModal();
        if (el.searchModal && !el.searchModal.hidden) closeSearchModal();
        else openSearchModal();
        return;
      }
      if (e.key === 'Escape') {
        if (el.confirmModal && !el.confirmModal.hidden) {
          closeAnimated(el.confirmModal);
          return;
        }
        if (el.searchModal && !el.searchModal.hidden) {
          closeSearchModal();
          return;
        }
        if (el.settingsModal && !el.settingsModal.hidden) {
          closeSettingsModal();
          return;
        }
        if (state.mobileOpen) {
          state.mobileOpen = false;
          applyLayoutClasses();
        }
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768 && state.mobileOpen) {
        state.mobileOpen = false;
        applyLayoutClasses();
      }
    }, { passive: true });
  }

  /* ---------- راه‌اندازی اولیه ---------- */
  function init() {
    setHidden(el.searchModal, true);
    setHidden(el.settingsModal, true);
    setHidden(el.confirmModal, true);
    loadThreads();
    applyLayoutClasses();
    rotateHeroPrompt();
    renderSidebar();
    renderMessages();
    syncComposerSize(true);
    bindEvents();
    checkHealth();
    setInterval(function () {
      if (!document.hidden) checkHealth();
    }, 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
