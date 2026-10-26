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
