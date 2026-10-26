const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReducedMotion && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => entries.forEach(({isIntersecting, target}) => {
    if (isIntersecting) { target.classList.add('visible'); observer.unobserve(target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));

// Hero v2: tilte 3D da janela + blobs em parallax conforme o scroll.
(function () {
  const win = document.getElementById('dv-win');
  const blobs = ['dv-b1', 'dv-b2', 'dv-b3'].map((id) => document.getElementById(id));
  if (!win || blobs.every((blob) => !blob) || prefersReducedMotion) return;
  let raf = 0;
  function update() {
    const y = window.scrollY;
    const p = Math.min(y / 600, 1);
    if (win) {
      win.style.transform =
        'translateY(' + (-y * 0.08) + 'px) rotateX(' + (2.5 + p * 8) + 'deg) rotateY(' + (-1 * (1 - p)) + 'deg) skewX(' + (4.3 * (1 - p)) + 'deg) rotate(' + (-1.5 * (1 - p)) + 'deg)';
    }
    if (blobs[0]) blobs[0].style.transform = 'translateY(' + (y * 0.35) + 'px) rotate(-12deg)';
    if (blobs[1]) blobs[1].style.transform = 'translateY(' + (y * 0.2) + 'px) rotate(-17deg)';
    if (blobs[2]) blobs[2].style.transform = 'translateY(' + (y * 0.5) + 'px) rotate(-9deg)';
  }
  window.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(update);
  }, { passive: true });
  update();
})();

// Background da hero vivo: o IntersectionObserver manuten body.hero-live
// enquanto a hero está em viewport (cf. regras .dv-b* em landing.css, que
// pausam a animação CSS fora dela). Também avisa a intro para congelar a
// flutuação GSAP do .dv-stage quando a hero não está visível.
(function () {
  const hero = document.querySelector('.dv-hero');
  if (!hero || prefersReducedMotion || !('IntersectionObserver' in window)) return;
  let inView = true;
  function apply() {
    const live = inView && !document.hidden;
    document.body.classList.toggle('hero-live', live);
    window.dispatchEvent(new CustomEvent('dv-hero', { detail: { live: live } }));
  }
  new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    apply();
  }, { threshold: 0.08 }).observe(hero);
  document.addEventListener('visibilitychange', apply);
  apply();
})();

// Intro do hero com GSAP: entrada em cascata (nav → copy → estágio) e
// flutuação sutil contínua da janela. Sem GSAP (CDN fora) ou com
// prefers-reduced-motion → remove o estado inicial e mostra tudo direto.
(function () {
  const root = document.documentElement;
  if (!document.querySelector('.dv-stage')) return; // páginas sem hero v2
  const SEL = '.dv-nav, .dv-h1, .dv-sub, .dv-cta, .dv-stats, .dv-bg i, .dv-stage';
  const CLEAR = '.dv-nav, .dv-h1, .dv-sub, .dv-cta, .dv-stats, .dv-stage';
  function showAll() {
    root.classList.remove('js-hero');
    document.querySelectorAll(SEL).forEach((el) => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
      el.style.removeProperty('visibility');
    });
  }
  // Parâmetro de diagnóstico/screenshot: ?intro=off libera o conteúdo na hora.
  if (new URLSearchParams(location.search).get('intro') === 'off') { showAll(); return; }
  // Rede de segurança: se nada animar em 3,5s, libera o conteúdo.
  let safety = 0;
  let floatTween = null;
  try {
    if (prefersReducedMotion || !window.gsap) { showAll(); return; }
    safety = setTimeout(showAll, 3500);
    function startFloat() {
      floatTween = gsap.to('.dv-stage', { y: -8, duration: 6.5, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 0.4 });
    }
    // Fora da hero (ou aba oculta) congela a flutuação; volta, retoma.
    window.addEventListener('dv-hero', (event) => {
      if (event.detail.live) startFloat();
      else if (floatTween) { floatTween.kill(); floatTween = null; }
    });
    function play() {
      const ease = 'power3.out';
      const speed = new URLSearchParams(location.search).get('intro') === 'speed' ? 12 : 1;
      const tl = gsap.timeline({
        onComplete: () => {
          clearTimeout(safety);
          root.classList.remove('js-hero');
          gsap.set(CLEAR, { clearProps: 'all' });
          startFloat();
        },
      })
        .fromTo('.dv-nav', { y: -14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.7, ease })
        .fromTo('.dv-h1', { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, ease }, 0.08)
        .fromTo('.dv-sub', { y: 22, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, ease }, 0.18)
        .fromTo('.dv-cta', { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, ease }, 0.28)
        .fromTo('.dv-stats', { y: 18, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.9, ease }, 0.36)
        .fromTo('.dv-bg i', { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.6, ease: 'power2.out', stagger: 0.12 }, 0.1)
        .fromTo('.dv-stage', { y: 64, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 1.25, ease: 'power4.out' }, 0.32);
      if (speed !== 1) tl.timeScale(speed);
    }
    // Espera curta pelas fontes (cap 600ms) para a animação não correr
    // atrás do primeiro paint em conexões lentas.
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 600))]).then(play);
  } catch (err) {
    clearTimeout(safety);
    showAll();
  }
})();
