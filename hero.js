// hero.js — WebGL atmosphere behind the light blueprint hero.
// The character asset is a 2D PNG, so WebGL here is the *environment*: a drifting
// field of dark grayscale particles with sparse orange accent points, rendered
// with normal blending so they read on the light #E4E4E4 background. Falls back
// silently to the pure-CSS hero when WebGL is unavailable or the user prefers
// reduced motion.

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglSupported() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch (e) {
    return false;
  }
}

const canvas = document.getElementById("heroCanvas");

if (canvas && !reduce && webglSupported()) {
  initHero(canvas).catch(() => {
    /* CSS fallback (gradient + grid + halo) already covers the hero. */
  });
}

async function initHero(canvas) {
  const THREE = await import("three");

  const hero = canvas.parentElement.parentElement; // .hero
  let width = canvas.clientWidth || window.innerWidth;
  let height = canvas.clientHeight || window.innerHeight;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.z = 26;

  const group = new THREE.Group();
  scene.add(group);

  // --- Particle field ---
  const COUNT = window.innerWidth < 640 ? 1400 : 2800;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const orange = new THREE.Color(0xff7120);
  const gray = new THREE.Color(0x636363);
  const dark = new THREE.Color(0x1b1b1b);

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3;
    // distribute in a wide, shallow-ish volume
    const r = 6 + Math.pow(Math.random(), 0.6) * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.7;
    positions[i3 + 2] = r * Math.cos(phi) * 0.7;

    const t = Math.random();
    const c = t < 0.5 ? dark : t < 0.88 ? gray : orange;
    colors[i3] = c.r;
    colors[i3 + 1] = c.g;
    colors[i3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  group.add(points);

  // --- Wireframe core (technical focal structure behind the humanoid) ---
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(4.4, 1),
    new THREE.MeshBasicMaterial({
      color: 0x1b1b1b,
      wireframe: true,
      transparent: true,
      opacity: 0.1,
      blending: THREE.NormalBlending,
      depthWrite: false,
    }),
  );
  core.position.set(6, 2, -4);
  group.add(core);

  // --- Mouse parallax ---
  let targetX = 0;
  let targetY = 0;
  window.addEventListener(
    "pointermove",
    (e) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 0.6;
      targetY = (e.clientY / window.innerHeight - 0.5) * 0.4;
    },
    { passive: true },
  );

  // --- Resize ---
  function resize() {
    width = hero.clientWidth || window.innerWidth;
    height = hero.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  window.addEventListener("resize", resize);
  resize();

  // --- Visibility / off-screen pause ---
  let onScreen = true;
  const io = new IntersectionObserver(
    (entries) => {
      onScreen = entries[0].isIntersecting;
    },
    { threshold: 0 },
  );
  io.observe(hero);

  // --- Loop ---
  const clock = new THREE.Clock();
  let live = false;

  function frame() {
    requestAnimationFrame(frame);
    if (!onScreen || document.hidden) return;

    const t = clock.getElapsedTime();
    group.rotation.y = t * 0.04;
    group.rotation.x = Math.sin(t * 0.15) * 0.06;
    core.rotation.y = t * 0.12;
    core.rotation.x = t * 0.08;

    camera.position.x += (targetX * 6 - camera.position.x) * 0.04;
    camera.position.y += (-targetY * 5 - camera.position.y) * 0.04;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);

    if (!live) {
      live = true;
      canvas.classList.add("is-live");
    }
  }
  frame();
}
