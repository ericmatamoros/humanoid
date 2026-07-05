// motion.js — cinematic interaction layer for Humanoid.
// Resilient by design: heavy libraries (GSAP / Lenis) are loaded defensively.
// If a CDN import fails, the vanilla layer (reveals, cursor, magnetic, counters,
// preloader) still runs and the page is never left blocked.

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(pointer: fine)").matches;
const html = document.documentElement;

/* -- Defensive library loading ------------------------------------------- */
let gsap = null;
let ScrollTrigger = null;
let Lenis = null;

if (!reduce) {
  try {
    const mod = await import("gsap");
    gsap = mod.gsap || mod.default || null;
  } catch (e) {
    gsap = null;
  }
  try {
    const mod = await import("gsap/ScrollTrigger");
    ScrollTrigger = mod.ScrollTrigger || mod.default || null;
    if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  } catch (e) {
    ScrollTrigger = null;
  }
  try {
    const mod = await import("lenis");
    Lenis = mod.default || mod.Lenis || null;
  } catch (e) {
    Lenis = null;
  }
}

/* -- Preloader ------------------------------------------------------------ */
function runPreloader(done) {
  const el = document.getElementById("preloader");
  const fill = document.getElementById("preloaderFill");
  const count = document.getElementById("preloaderCount");

  if (!el || reduce) {
    html.classList.add("is-ready");
    done();
    return;
  }

  const duration = 1100;
  let start = null;

  function frame(ts) {
    if (start === null) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - p, 3);
    const pct = Math.round(eased * 100);
    if (fill) fill.style.width = pct + "%";
    if (count) count.textContent = pct + "%";
    if (p < 1) {
      requestAnimationFrame(frame);
    } else {
      el.classList.add("is-done");
      html.classList.add("is-ready");
      done();
    }
  }
  requestAnimationFrame(frame);
}

/* -- Wordmark split + reveal --------------------------------------------- */
function splitWordmark() {
  const title = document.querySelector("[data-splittext]");
  if (!title) return;
  const text = title.textContent;
  title.textContent = "";
  const chars = [];
  for (const ch of text) {
    const span = document.createElement("span");
    span.className = ch === " " ? "char space" : "char";
    span.textContent = ch === " " ? " " : ch;
    title.appendChild(span);
    chars.push(span);
  }
  return chars;
}

function animateHeroIntro() {
  const chars = splitWordmark();
  if (!chars || !chars.length) return;

  if (gsap && !reduce) {
    gsap.set(chars, { yPercent: 120, opacity: 0 });
    gsap.to(chars, {
      yPercent: 0,
      opacity: 1,
      duration: 0.85,
      ease: "power4.out",
      stagger: 0.05,
    });
    // one-shot glitch flourish
    gsap.fromTo(
      ".hero-title",
      { skewX: 6, filter: "blur(4px)" },
      { skewX: 0, filter: "blur(0px)", duration: 0.6, ease: "power2.out", delay: 0.2 },
    );
  }
}

/* -- Reveal on scroll (vanilla, GSAP-independent) ------------------------- */
function setupReveals() {
  if (reduce) return;
  html.classList.add("reveal-ready");

  const items = document.querySelectorAll("[data-reveal]");
  // stagger delay by position within its reveal group
  document.querySelectorAll("[data-reveal-group]").forEach((group) => {
    group.querySelectorAll("[data-reveal]").forEach((el, i) => {
      el.style.transitionDelay = Math.min(i * 80, 480) + "ms";
    });
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
  );
  items.forEach((el) => io.observe(el));

  // A view that starts hidden won't trigger the observer when it becomes
  // visible, so force-reveal the newly-active view's items on tab switch.
  document.addEventListener("viewchange", (e) => {
    const view = document.getElementById(`${e.detail}View`);
    if (!view) return;
    view.querySelectorAll("[data-reveal]").forEach((el) => {
      io.unobserve(el);
      el.classList.add("is-in");
    });
  });
}

/* -- Count-up ------------------------------------------------------------- */
function setupCounters() {
  const els = document.querySelectorAll("[data-count]");
  if (!els.length) return;

  const run = (el) => {
    const target = parseInt(el.dataset.count, 10) || 0;
    if (reduce) {
      el.textContent = target.toLocaleString();
      return;
    }
    const duration = 1400;
    let start = null;
    const step = (ts) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          run(entry.target);
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.6 },
  );
  els.forEach((el) => io.observe(el));
}

/* -- Custom cursor -------------------------------------------------------- */
function setupCursor() {
  if (!finePointer || reduce) return;
  const cursor = document.getElementById("cursor");
  if (!cursor) return;
  const dot = cursor.querySelector(".cursor-dot");
  const ring = cursor.querySelector(".cursor-ring");
  document.body.classList.add("has-cursor");

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let rx = mx;
  let ry = my;

  window.addEventListener("pointermove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
  });

  const loop = () => {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const hot = 'a, button, .carousel-card, [data-tilt], input, textarea';
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest(hot)) cursor.classList.add("is-hot");
  });
  document.addEventListener("pointerout", (e) => {
    if (e.target.closest(hot)) cursor.classList.remove("is-hot");
  });
}

/* -- Magnetic buttons ----------------------------------------------------- */
function setupMagnetic() {
  if (!finePointer || reduce) return;
  document.querySelectorAll(".magnetic").forEach((el) => {
    const strength = 0.35;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) * strength;
      const y = (e.clientY - (r.top + r.height / 2)) * strength;
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  });
}

/* -- Tilt ----------------------------------------------------------------- */
function setupTilt() {
  if (!finePointer || reduce) return;
  document.querySelectorAll("[data-tilt]").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(700px) rotateX(${-py * 7}deg) rotateY(${px * 9}deg) translateZ(0)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  });
}

/* -- Oversized headline drift (GSAP + ScrollTrigger) ----------------------- */
function setupHeadlineDrift() {
  if (!gsap || !ScrollTrigger || reduce) return;

  const drift = (selector, xPercent) => {
    document.querySelectorAll(selector).forEach((el) => {
      gsap.to(el, {
        xPercent,
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top bottom",
          end: "bottom top",
          scrub: 0.6,
        },
      });
    });
  };

  drift("[data-drift]", -6);
  drift("[data-drift-right]", 4);
}

/* -- Scroll cue + hero fade ----------------------------------------------- */
function setupScrollReactions() {
  const cue = document.querySelector(".scroll-cue");
  const fx = document.querySelector(".hero-fx");
  const hero = document.querySelector(".hero");

  const onScroll = (y) => {
    if (cue) cue.classList.toggle("is-hidden", y > 60);
    if (fx && hero) {
      const h = hero.offsetHeight || window.innerHeight;
      fx.style.opacity = String(Math.max(0, 1 - (y / h) * 1.4));
    }
  };
  onScroll(window.scrollY);
  return onScroll;
}

/* -- Smooth scroll (Lenis) ------------------------------------------------ */
function setupSmoothScroll(onScroll) {
  if (!Lenis || reduce) {
    window.addEventListener("scroll", () => onScroll(window.scrollY), { passive: true });
    setupAnchors(null);
    return;
  }
  const lenis = new Lenis({ duration: 1.1, smoothWheel: true });

  lenis.on("scroll", (e) => {
    onScroll(e.animatedScroll ?? window.scrollY);
    if (ScrollTrigger) ScrollTrigger.update();
  });

  if (gsap) {
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (time) => {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }
  setupAnchors(lenis);
}

function setupAnchors(lenis) {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -20 });
      else target.scrollIntoView({ behavior: "smooth" });
    });
  });
}

/* -- Boot ----------------------------------------------------------------- */
function boot() {
  const onScroll = setupScrollReactions();
  setupReveals();
  setupCounters();
  setupCursor();
  setupMagnetic();
  setupTilt();
  setupSmoothScroll(onScroll);
  animateHeroIntro();
  setupHeadlineDrift();
}

runPreloader(boot);
