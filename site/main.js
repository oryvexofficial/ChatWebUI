(function () {
  'use strict';
  var d = document;
  var root = d.documentElement;
  root.classList.add('js');

  /* Persisted dark/light theme toggle (defaults to dark) */
  try {
    var savedTheme = localStorage.getItem('oryvex-site-theme');
    if (savedTheme === 'light') {
      root.classList.add('light');
    }
  } catch (_) {}

  var themeBtn = d.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var isLight = root.classList.toggle('light');
      try {
        localStorage.setItem('oryvex-site-theme', isLight ? 'light' : 'dark');
      } catch (_) {}
    });
  }

  /* Route finder */
  var picks = {
    open: [
      'Auto',
      'Let OryvexVPN test WireGuard first, then MASQUE, MASQUE² and Gool automatically. Switch to Bypass if you only need direct packet reshaping.'
    ],
    dpi: [
      'MASQUE, then Tor',
      'MASQUE wraps traffic in HTTP/2 or HTTP/3 TLS sessions. If connections still drop, switch to Tor with bridges.'
    ],
    blocked: [
      'Tor with bridges or Bypass',
      'Bridges hide Tor handshakes on heavily filtered networks, while Bypass reshapes initial packets for supported services.'
    ],
    mozilla: [
      'Fox with your own Cloudflare relay',
      'Deploy the bundled Cloudflare Worker relay from Fox settings so Fox account authentication and location updates can reach Mozilla.'
    ]
  };

  var ans = d.querySelector('.answer');
  var t = d.getElementById('ans-title');
  var b = d.getElementById('ans-body');

  [].forEach.call(d.querySelectorAll('[data-pick]'), function (btn) {
    btn.addEventListener('click', function () {
      [].forEach.call(d.querySelectorAll('[data-pick]'), function (o) {
        var on = o === btn;
        o.classList.toggle('on', on);
        o.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      var p = picks[btn.getAttribute('data-pick')];
      if (p && t && b) {
        t.textContent = p[0];
        b.textContent = p[1];
      }
      if (ans) {
        ans.classList.remove('swap');
        void ans.offsetWidth;
        ans.classList.add('swap');
      }
    });
  });

  /* Close mobile menu after navigation or Escape */
  [].forEach.call(d.querySelectorAll('.mobile-nav a'), function (a) {
    a.addEventListener('click', function () {
      var m = d.querySelector('.mobile-nav');
      if (m) m.removeAttribute('open');
    });
  });

  d.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var m = d.querySelector('.mobile-nav[open]');
      if (m) {
        m.removeAttribute('open');
        var s = m.querySelector('summary');
        if (s) s.focus();
      }
    }
  });
})();
