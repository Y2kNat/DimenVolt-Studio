const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReducedMotion && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => entries.forEach(({isIntersecting, target}) => {
    if (isIntersecting) { target.classList.add('visible'); observer.unobserve(target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
