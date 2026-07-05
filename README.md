# Humanoid

Static mint website for the Humanoid NFT collection.

Serve the folder over HTTP to view it — e.g. `npm run dev` (vercel dev), `npx serve .`, or `python -m http.server`, then open `localhost`. A server is required because the cinematic layer (`hero.js` WebGL scene, `motion.js` scroll/interaction) loads as ES modules and pulls three.js / GSAP / Lenis from a CDN; opening `index.html` directly from `file://` won't run them (the page still degrades gracefully, but with no motion).

The whitelist form unlocks after connecting an injected EVM wallet such as MetaMask.

## Motion / graphics

- `hero.js` — three.js particle-field hero backdrop (behind the dark hero). Falls back to a pure-CSS gradient when WebGL is unavailable or the user prefers reduced motion.
- `motion.js` — Lenis smooth scroll, GSAP wordmark intro, IntersectionObserver reveals, custom cursor, magnetic buttons, count-ups, tilt, and the preloader.
- Everything respects `prefers-reduced-motion` and never blocks the page if a CDN import fails.
- `assets/humanoid-hero.{png,webp}` is a transparent cutout of the hero figure (background removed) so it composites onto the dark hero; the original mint-background art is retained for the carousel.
