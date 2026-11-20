import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ==========================================================
// DOM & THREE.JS SETUP
// ==========================================================
const container = document.getElementById('canvas-container');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  36,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 5.0);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// HDRI Environment for realistic specular reflections on plastic, metal & glass
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const roomEnv = new RoomEnvironment();
scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;

// ==========================================================
// LENIS SMOOTH MOMENTUM SCROLL & GSAP SETUP
// ==========================================================
if (typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined') {
  window.gsap.registerPlugin(window.ScrollTrigger);
}

let lenis = null;
if (typeof window.Lenis !== 'undefined' && !prefersReducedMotion) {
  lenis = new window.Lenis({
    duration: 1.25,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    touchMultiplier: 1.5,
    infinite: false
  });
  window.lenis = lenis;

  lenis.on('scroll', (e) => {
    targetScrollVelocity = e.velocity || 0;
    updateScroll();
  });

  if (window.ScrollTrigger) {
    lenis.on('scroll', window.ScrollTrigger.update);
  }
}

// Smooth scroll to anchor clicks via Lenis
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener('click', (e) => {
    const targetId = anchor.getAttribute('href');
    if (!targetId || targetId === '#') return;
    const targetEl = document.querySelector(targetId);
    if (targetEl && lenis) {
      e.preventDefault();
      const offset = targetId === '#faq' ? -70 : -20;
      lenis.scrollTo(targetEl, { offset, duration: 1.3 });
    }
  });
});

// Dynamic scroll inertia & kinetic velocity reactions
let currentScrollVelocity = 0;
let targetScrollVelocity = 0;
let currentScrollPitch = 0;
let currentScrollBank = 0;
let currentScrollRoll = 0;
let lastScrollY = window.scrollY;
let lastScrollTime = performance.now();

// Interactive mouse parallax tilt
let targetMousePitch = 0;
let targetMouseYaw = 0;
let currentMousePitch = 0;
let currentMouseYaw = 0;

window.addEventListener('pointermove', (e) => {
  if (isDragging) return;
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  targetMouseYaw = nx * 0.16;
  targetMousePitch = -ny * 0.12;
}, { passive: true });

// GSAP interactive flourish rotation
const flourishState = { y: 0 };

// ==========================================================
// STUDIO LIGHTING
// ==========================================================
const ambientLight = new THREE.AmbientLight(0xfff6ee, 1.4);
scene.add(ambientLight);

// Key light illuminating front face and contours
const mainKeyLight = new THREE.DirectionalLight(0xffffff, 3.8);
mainKeyLight.position.set(2.0, 3.5, 4.5);
scene.add(mainKeyLight);

// Secondary soft fill light from opposite side
const fillLight = new THREE.DirectionalLight(0xd4e2ff, 2.2);
fillLight.position.set(-3.0, 1.5, 4.0);
scene.add(fillLight);

// High-angle rim highlighting triggers and top edge
const topRimLight = new THREE.DirectionalLight(0xffffff, 2.5);
topRimLight.position.set(0, 5.0, 1.0);
scene.add(topRimLight);

// Brand warm ember backlight/rim from right rear
const orangeBacklight = new THREE.DirectionalLight(0xff6b1a, 6.0);
orangeBacklight.position.set(4.5, -2.5, -1.5);
scene.add(orangeBacklight);

// Brand crimson rim from left rear
const crimsonRim = new THREE.DirectionalLight(0xdc2626, 4.5);
crimsonRim.position.set(-4.5, -2.0, -1.5);
scene.add(crimsonRim);

// Rear separation light
const rearSilhouette = new THREE.DirectionalLight(0xffedd5, 1.8);
rearSilhouette.position.set(0, 2.0, -4.0);
scene.add(rearSilhouette);

// Warm ember point light under the grips
const warmPointLight = new THREE.PointLight(0xff6b1a, 4.0, 8);
warmPointLight.position.set(1.2, -1.0, 1.5);
scene.add(warmPointLight);

// ==========================================================
// MODEL HIERARCHY
// ==========================================================
const rootGroup = new THREE.Group();
const userRotationGroup = new THREE.Group();
const idleFloatGroup = new THREE.Group();
const modelOrientationGroup = new THREE.Group();

// Orientation for Controller.obj:
// In Controller.obj: X = width, Y = front-to-back, Z = height.
// Rotated 90 deg around X and scale.z = -1 maps:
//   OBJ X -> screen X (Right)
//   OBJ Z -> screen Y (Up)
//   OBJ Y -> screen Z (Front / towards camera)
modelOrientationGroup.rotation.x = Math.PI / 2;
modelOrientationGroup.scale.set(1, 1, -1);

idleFloatGroup.add(modelOrientationGroup);
userRotationGroup.add(idleFloatGroup);
rootGroup.add(userRotationGroup);
scene.add(rootGroup);

let baseModelScale = 1.0;
let loadedModel = null;

// ==========================================================
// MATERIALS (GENUINE HARDWARE FINISHES)
// ==========================================================
const materials = {
  // Main controller shell (Obsidian default: premium matte carbon composite)
  bodyMatte: new THREE.MeshStandardMaterial({
    color: 0x1e222a,
    roughness: 0.38,
    metalness: 0.16,
    side: THREE.DoubleSide
  }),
  // Contrast center panel & accent fascia
  bodyGloss: new THREE.MeshStandardMaterial({
    color: 0x13161d,
    roughness: 0.24,
    metalness: 0.32,
    side: THREE.DoubleSide
  }),
  // Touchpad surface (satin feel)
  touchpad: new THREE.MeshStandardMaterial({
    color: 0x181b23,
    roughness: 0.32,
    metalness: 0.20,
    side: THREE.DoubleSide
  }),
  // Touchpad luminous LED accent light
  touchpadGlow: new THREE.MeshStandardMaterial({
    color: 0x0099ff,
    emissive: 0x00b4ff,
    emissiveIntensity: 2.2,
    roughness: 0.15,
    metalness: 0.2,
    side: THREE.DoubleSide
  }),
  // Precision machined D-pad
  dpad: new THREE.MeshStandardMaterial({
    color: 0x242a36,
    roughness: 0.20,
    metalness: 0.85,
    side: THREE.DoubleSide
  }),
  // Crisp D-pad directional arrow faces
  dpadFace: new THREE.MeshStandardMaterial({
    color: 0x323a4b,
    roughness: 0.18,
    metalness: 0.70,
    side: THREE.DoubleSide
  }),
  // Action button bezels
  buttonBezel: new THREE.MeshStandardMaterial({
    color: 0x14171e,
    roughness: 0.30,
    metalness: 0.50,
    side: THREE.DoubleSide
  }),
  // Action buttons (A=Green, B=Red, X=Blue, Y=Yellow)
  buttonA: new THREE.MeshStandardMaterial({
    color: 0x143525,
    emissive: 0x10b981,
    emissiveIntensity: 0.50,
    roughness: 0.18,
    metalness: 0.35,
    side: THREE.DoubleSide
  }),
  buttonB: new THREE.MeshStandardMaterial({
    color: 0x3a151e,
    emissive: 0xf43f5e,
    emissiveIntensity: 0.50,
    roughness: 0.18,
    metalness: 0.35,
    side: THREE.DoubleSide
  }),
  buttonX: new THREE.MeshStandardMaterial({
    color: 0x112840,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.50,
    roughness: 0.18,
    metalness: 0.35,
    side: THREE.DoubleSide
  }),
  buttonY: new THREE.MeshStandardMaterial({
    color: 0x3a2a12,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.50,
    roughness: 0.18,
    metalness: 0.35,
    side: THREE.DoubleSide
  }),
  // PlayStation fallbacks
  buttonTriangle: new THREE.MeshStandardMaterial({
    color: 0x1d222c,
    emissive: 0x10b981,
    emissiveIntensity: 0.45,
    roughness: 0.18,
    metalness: 0.35,
    side: THREE.DoubleSide
  }),
  buttonCircle: new THREE.MeshStandardMaterial({
    color: 0x1d222c,
    emissive: 0xf43f5e,
    emissiveIntensity: 0.45,
    roughness: 0.18,
    metalness: 0.35,
    side: THREE.DoubleSide
  }),
  buttonCross: new THREE.MeshStandardMaterial({
    color: 0x1d222c,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.45,
    roughness: 0.18,
    metalness: 0.35,
    side: THREE.DoubleSide
  }),
  buttonSquare: new THREE.MeshStandardMaterial({
    color: 0x1d222c,
    emissive: 0xe879f9,
    emissiveIntensity: 0.45,
    roughness: 0.18,
    metalness: 0.35,
    side: THREE.DoubleSide
  }),
  // Xbox Guide / Jewel button
  xboxButton: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xff6b1a,
    emissiveIntensity: 0.90,
    roughness: 0.14,
    metalness: 0.92,
    side: THREE.DoubleSide
  }),
  psButton: new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xff6b1a,
    emissiveIntensity: 0.85,
    roughness: 0.14,
    metalness: 0.92,
    side: THREE.DoubleSide
  }),
  // Thumbstick grippy rubber caps
  analogStickRubber: new THREE.MeshStandardMaterial({
    color: 0x151820,
    roughness: 0.78,
    metalness: 0.06,
    side: THREE.DoubleSide
  }),
  // Polished chamfered metal accent rings on gimbals
  analogStickMetal: new THREE.MeshStandardMaterial({
    color: 0xd0d7e4,
    roughness: 0.14,
    metalness: 0.96,
    side: THREE.DoubleSide
  }),
  // Ergonomic textured grip handles
  gripTexture: new THREE.MeshStandardMaterial({
    color: 0x181a21,
    roughness: 0.58,
    metalness: 0.12,
    side: THREE.DoubleSide
  }),
  // Bumpers & triggers
  bumpers: new THREE.MeshStandardMaterial({
    color: 0x20242f,
    roughness: 0.22,
    metalness: 0.75,
    side: THREE.DoubleSide
  }),
  // Chrome metal hardware ports
  metalChrome: new THREE.MeshStandardMaterial({
    color: 0xd8dde8,
    roughness: 0.12,
    metalness: 0.96,
    side: THREE.DoubleSide
  }),
  transparentCaps: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.75,
    opacity: 0.90,
    transparent: true,
    roughness: 0.08,
    ior: 1.5,
    side: THREE.DoubleSide
  })
};

const bodyMaterials = [];

function assignMaterials(obj) {
  obj.traverse((child) => {
    if (!child.isMesh) return;

    child.castShadow = true;
    child.receiveShadow = true;

    // Critical: Compute vertex normals so Three.js PBR lighting illuminates the mesh cleanly!
    if (child.geometry) {
      child.geometry.computeVertexNormals();
    }

    const name = (child.name || '').toLowerCase();
    let base;

    const isControllerShell =
      name.includes('front_panel') ||
      name.includes('rear_panel') ||
      name.includes('battery') ||
      name.includes('left_3') ||
      name.includes('right_3') ||
      name.includes('controller main shell') ||
      name.includes('ergonomic handle');

    if (name.includes('left_3') || name.includes('right_3')) {
      base = materials.gripTexture;
    } else if (isControllerShell) {
      base = materials.bodyMatte;
    } else if (name.includes('grip microtexture')) {
      base = materials.gripTexture;
    } else if (name.includes('blue touchpad light strip')) {
      base = materials.touchpadGlow;
    } else if (name.includes('touchpad')) {
      base = materials.touchpad;
    } else if (name.includes('central black control panel')) {
      base = materials.bodyGloss;
    } else if (name === 'left' || name === 'right' || name.includes('analog') || name.includes('stick')) {
      base = materials.analogStickRubber;
    } else if (name === 'cap_1' || name === 'cap_2' || name.includes('inner ring') || name.includes('cap inset')) {
      base = materials.analogStickMetal;
    } else if (name.includes('d-pad') && name.includes('face')) {
      base = materials.dpadFace;
    } else if (name.includes('dpad') || name.includes('d-pad')) {
      base = materials.dpad;
    } else if (name === 'a' || name === 'a_top' || name.startsWith('a_top')) {
      base = materials.buttonA;
    } else if (name === 'a_base') {
      base = materials.buttonBezel;
    } else if (name === 'b' || name === 'b_top' || name.startsWith('b_top')) {
      base = materials.buttonB;
    } else if (name === 'b_base') {
      base = materials.buttonBezel;
    } else if (name === 'x' || name === 'x_top' || name.startsWith('x_top')) {
      base = materials.buttonX;
    } else if (name === 'xbase' || name === 'x_base') {
      base = materials.buttonBezel;
    } else if (name === 'y' || name === 'y_top' || name.startsWith('y_top')) {
      base = materials.buttonY;
    } else if (name === 'y_base') {
      base = materials.buttonBezel;
    } else if (name.includes('xbox') || name.includes('ps button')) {
      base = materials.xboxButton;
    } else if (name.includes('triangle')) {
      base = materials.buttonTriangle;
    } else if (name.includes('circle')) {
      base = materials.buttonCircle;
    } else if (name.includes('cross')) {
      base = materials.buttonCross;
    } else if (name.includes('square')) {
      base = materials.buttonSquare;
    } else if (name.includes('left_1') || name.includes('right_1') || name.includes('left_2') || name.includes('right_2') || name.includes('shoulder') || name.includes('bumper') || name.includes('trigger') || name.includes('top_part') || name.includes('top_button')) {
      base = materials.bumpers;
    } else if (name.includes('port') || name.includes('metal') || name === 'ending') {
      base = materials.metalChrome;
    } else if (name.includes('transparent')) {
      base = materials.transparentCaps;
    } else {
      base = materials.bodyGloss;
    }

    const mat = base.clone();

    if (isControllerShell) {
      bodyMaterials.push(mat);
    }

    child.material = mat;
  });
}

// ==========================================================
// LOADER MANAGEMENT — SMOOTH COUNTER & CINEMATIC PACING
// ==========================================================
let currentDisplayPercent = 0;
let targetDisplayPercent = 15;
let counterRafId = null;
let loaderHidden = false;
let modelReadyToExit = false;
const loaderStartTime = performance.now();
const MINIMUM_LOADER_DURATION_MS = 2400; // Guarantees a luxurious, cinematic pacing

function stepLoaderCounter() {
  if (currentDisplayPercent < targetDisplayPercent) {
    const diff = targetDisplayPercent - currentDisplayPercent;
    // Ultra-smooth easing step
    const step = Math.max(1, Math.ceil(diff * 0.08));
    currentDisplayPercent = Math.min(targetDisplayPercent, currentDisplayPercent + step);

    const bigNum = document.getElementById('loader-big-num');
    const fill = document.getElementById('loader-bar-fill');
    const loaderRoot = document.getElementById('loader');

    if (bigNum) {
      bigNum.textContent = currentDisplayPercent < 10 ? `0${currentDisplayPercent}` : `${currentDisplayPercent}`;
    }
    if (fill) {
      fill.style.width = `${currentDisplayPercent}%`;
    }
    if (loaderRoot) {
      loaderRoot.setAttribute('aria-valuenow', currentDisplayPercent);
    }
  }

  if (currentDisplayPercent < targetDisplayPercent) {
    counterRafId = requestAnimationFrame(stepLoaderCounter);
  } else {
    counterRafId = null;
    if (currentDisplayPercent >= 100 && modelReadyToExit && !loaderHidden) {
      performLoaderExit();
    }
  }
}

function updateLoadingProgress(percent, statusText) {
  targetDisplayPercent = Math.min(100, Math.max(0, Math.round(percent)));
  const status = document.getElementById('loader-status');
  if (status && statusText) {
    status.textContent = statusText;
  }

  if (!counterRafId) {
    counterRafId = requestAnimationFrame(stepLoaderCounter);
  }
}

function performLoaderExit() {
  if (loaderHidden) return;
  loaderHidden = true;

  const loaders = document.querySelectorAll('.loader, .app-loader, #loader, #app-loader');
  loaders.forEach(el => el.classList.add('is-exiting'));

  setTimeout(() => {
    loaders.forEach(el => {
      el.classList.add('hidden');
    });

    document.body.classList.add('is-ready');

    setTimeout(() => {
      loaders.forEach(el => {
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      });
    }, 900);
  }, 600);
}

function hideLoader() {
  modelReadyToExit = true;
  targetDisplayPercent = 100;

  if (!counterRafId) {
    counterRafId = requestAnimationFrame(stepLoaderCounter);
  }

  const elapsed = performance.now() - loaderStartTime;
  const remaining = Math.max(0, MINIMUM_LOADER_DURATION_MS - elapsed);

  setTimeout(() => {
    targetDisplayPercent = 100;
    if (!counterRafId) {
      counterRafId = requestAnimationFrame(stepLoaderCounter);
    }
    // Give time to glide to 100%
    setTimeout(() => {
      performLoaderExit();
    }, 450);
  }, remaining);
}

// Guaranteed fail-safe: hide loader after max 5.5 seconds
setTimeout(() => {
  hideLoader();
}, 5500);

// Kick off initial counter tick
stepLoaderCounter();

// ==========================================================
// MOUNT MODEL
// ==========================================================
function mountModel(model) {
  loadedModel = model;

  const bbox = new THREE.Box3().setFromObject(model);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());

  model.position.x = -center.x;
  model.position.y = -center.y;
  model.position.z = -center.z;

  const maxDim = Math.max(size.x, size.y, size.z);
  const targetSize = 2.45;
  baseModelScale = maxDim > 0 ? targetSize / maxDim : 1;
  rootGroup.scale.setScalar(baseModelScale);

  modelOrientationGroup.add(model);

  buildExplodeParts(model);

  updateLoadingProgress(100, '38 MODULES ASSEMBLED');
  setTimeout(() => {
    hideLoader();
    rebuildScrollGeometry();
    updateScroll();
  }, 220);
}

// ==========================================================
// MODEL LOADERS (CONTROLLER.OBJ & CONTROLLER.MTL)
// ==========================================================
const objLoader = new OBJLoader();
const mtlLoader = new MTLLoader();

updateLoadingProgress(28, 'READING HARDWARE SPECS...');
loadControllerObj();

function loadControllerObj() {
  updateLoadingProgress(50, 'LOADING PRECISION MESHES...');
  mtlLoader.load(
    './Controller.mtl',
    (mtl) => {
      mtl.preload();
      objLoader.setMaterials(mtl);
      objLoader.load(
        './Controller.obj',
        (obj) => {
          assignMaterials(obj);
          mountModel(obj);
        },
        (xhr) => {
          if (xhr.lengthComputable && xhr.total > 0) {
            const p = Math.round(50 + (xhr.loaded / xhr.total) * 45);
            updateLoadingProgress(p, `STREAMING 3D MESHES ${p}%`);
          }
        },
        (err) => {
          console.warn('MTL load warning, loading OBJ directly:', err);
          loadObjDirect();
        }
      );
    },
    undefined,
    () => loadObjDirect()
  );
}

function loadObjDirect() {
  objLoader.load(
    './Controller.obj',
    (obj) => {
      assignMaterials(obj);
      mountModel(obj);
    },
    (xhr) => {
      if (xhr.lengthComputable && xhr.total > 0) {
        const p = Math.round(50 + (xhr.loaded / xhr.total) * 45);
        updateLoadingProgress(p, `STREAMING 3D MESHES ${p}%`);
      }
    },
    (err) => {
      console.error('Failed to load Controller.obj:', err);
      hideLoader();
    }
  );
}

// ==========================================================
// EXPLODED VIEW — PART VECTORS (CONTROLLER.OBJ LOCAL SPACE)
// Screen axes under modelOrientationGroup:
//   OBJ X -> screen X (Right)
//   OBJ Z -> screen Y (Up)
//   OBJ Y -> screen Z (Front / towards camera)
// ==========================================================
const explodeParts = [];

function explodeSpec(name) {
  // Main shell panels
  if (name === 'front_panel') return { dir: [0, 1.0, 0.12], dist: 3.5 };
  if (name === 'rear_panel') return { dir: [0, -1.0, -0.16], dist: 3.5 };
  if (name.includes('battery')) return { dir: [0, -1.0, 0.25], dist: 4.5 };

  // Ergonomic grip side panels
  if (name === 'left_3') return { dir: [-1.0, 0.35, -0.15], dist: 4.0 };
  if (name === 'right_3') return { dir: [1.0, 0.35, -0.15], dist: 4.0 };

  // Analog sticks
  if (name === 'left') return { dir: [-0.65, 0.85, 0.40], dist: 4.8 };
  if (name === 'right') return { dir: [0.55, 0.85, -0.20], dist: 4.8 };
  if (name === 'cap_1' || name === 'cap_2') return { dir: [0, 0.90, 0.20], dist: 5.2 };

  // D-pad
  if (name === 'dpad') return { dir: [-0.60, 0.80, -0.35], dist: 5.0 };

  // Action buttons (A, B, X, Y)
  if (name === 'a' || name.startsWith('a_')) return { dir: [0.70, 0.80, -0.25], dist: 5.0 };
  if (name === 'b' || name.startsWith('b_')) return { dir: [0.95, 0.80, 0.05], dist: 5.5 };
  if (name === 'x' || name.startsWith('x_') || name === 'xbase') return { dir: [0.60, 0.80, 0.12], dist: 5.0 };
  if (name === 'y' || name.startsWith('y_')) return { dir: [0.72, 0.80, 0.40], dist: 5.5 };
  if (name.includes('front_buttons')) return { dir: [0, 0.85, 0.25], dist: 5.0 };

  // Center & Xbox jewel buttons
  if (name.includes('xbox') || name === 'home' || name === 'share') {
    return { dir: [0, 0.80, 0.50], dist: 4.5 };
  }

  // Bumpers & triggers
  if (name === 'left_1' || name === 'left_2') return { dir: [-0.68, -0.20, 1.0], dist: 4.5 };
  if (name === 'right_1' || name === 'right_2') return { dir: [0.68, -0.20, 1.0], dist: 4.5 };
  if (name.includes('trigger_and_shoulder')) return { dir: [0, -0.15, 1.0], dist: 4.5 };

  // Ports and upper assembly
  if (name === 'top_part' || name === 'top_button') return { dir: [0, 0.30, 1.0], dist: 4.2 };
  if (name.includes('port') || name === 'ending') return { dir: [0, -0.30, 1.0], dist: 4.0 };

  return null;
}

function buildExplodeParts(model) {
  explodeParts.length = 0;

  model.traverse((child) => {
    if (!child.isObject3D || child === model) return;
    const name = (child.name || '').toLowerCase();
    const spec = explodeSpec(name);
    if (!spec) return;

    const dir = new THREE.Vector3(
      spec.dir[0],
      spec.dir[1],
      spec.dir[2]
    ).normalize();

    explodeParts.push({
      obj: child,
      origin: child.position.clone(),
      direction: dir,
      distance: spec.dist
    });
  });
}

// ==========================================================
// SCROLL POSES — 3D CHOREOGRAPHY PER SECTION
// Expressive, dynamic multi-axis rotations showcasing every contour
// ==========================================================
const POSE_DEFS = {
  hero: {
    x: 0.00, y: -0.92, scale: 1.25,
    rx: -0.25, ry: 0.00, rz: 0.00, explode: 0
  },
  heroReveal: {
    x: 0.00, y: 0.00, scale: 1.22,
    rx: -0.06, ry: -0.20, rz: 0.02, explode: 0
  },
  overview: {
    x: 0.18, y: -0.05, scale: 1.15,
    rx: 0.18, ry: -0.95, rz: -0.08, explode: 0
  },
  features: {
    x: 0.08, y: -0.02, scale: 1.22,
    rx: 0.12, ry: -0.25, rz: 0.14, explode: 0
  },
  anatomy: {
    x: 0.00, y: 0.00, scale: 0.92,
    rx: 0.04, ry: 0.00, rz: 0.00, explode: 1
  },
  specs: {
    x: 0.00, y: -0.02, scale: 1.45,
    rx: 0.14, ry: -0.15, rz: 0.04, explode: 0
  },
  colorways: {
    x: 0.80, y: 0.02, scale: 0.88,
    rx: -0.10, ry: 0.52, rz: 0.04, explode: 0
  },
  buy: {
    x: 0.80, y: 0.02, scale: 0.88,
    rx: -0.10, ry: 0.52, rz: 0.04, explode: 0
  },
  platform: {
    x: 0.80, y: 0.02, scale: 0.88,
    rx: -0.10, ry: 0.52, rz: 0.04, explode: 0
  },
  faq: {
    x: 0.80, y: 0.02, scale: 0.88,
    rx: -0.10, ry: 0.52, rz: 0.04, explode: 0
  }
};

const POSE_KEYS = ['hero', 'overview', 'features', 'anatomy', 'specs', 'colorways', 'buy', 'platform', 'faq'];
const SECTION_NAMES = ['Hero', 'Architecture', 'Vision', 'Anatomy', 'Hardware', 'Colorways', 'Pre-order', 'Platform', 'FAQ'];

const sectionEls = {};
POSE_KEYS.forEach((key) => {
  sectionEls[key] = document.getElementById(key);
});

const notes = Array.from(document.querySelectorAll('.anatomy-note'));
const anatomyFill = document.getElementById('anatomy-fill');
const anatomyStep = document.getElementById('anatomy-step');
const railNumber = document.getElementById('rail-number');
const railLabel = document.getElementById('rail-label');
const railThumb = document.getElementById('rail-thumb');
const railTrack = document.querySelector('.rail-track');
const railEl = document.getElementById('scroll-rail');

const navLinks = Array.from(document.querySelectorAll('.link-item[data-section], .mobile-nav-link[data-section]'));
const notchNav = document.getElementById('notch-nav');
const navMenuToggle = document.querySelector('.nav-menu-toggle');
const mobileNavMenu = document.getElementById('mobile-nav-menu');
const heroTopBlock = document.getElementById('hero-top-block');
const heroBottomBlock = document.getElementById('hero-bottom-block');

function setMobileNav(open) {
  if (!notchNav || !navMenuToggle || !mobileNavMenu) return;
  notchNav.classList.toggle('is-menu-open', open);
  navMenuToggle.setAttribute('aria-expanded', String(open));
  navMenuToggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  mobileNavMenu.setAttribute('aria-hidden', String(!open));
}

if (navMenuToggle) {
  navMenuToggle.addEventListener('click', () => setMobileNav(!notchNav.classList.contains('is-menu-open')));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMobileNav(false);
  });
  document.addEventListener('click', (event) => {
    if (notchNav && !notchNav.contains(event.target)) setMobileNav(false);
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 860) setMobileNav(false);
  });
}

document.querySelectorAll('.mobile-nav-link').forEach((link) => {
  link.addEventListener('click', () => setMobileNav(false));
});

let anchors = [];
let maxScroll = 1;
let railTrackHeight = 120;
let anatomyStart = 0;
let anatomyRange = 1;

const currentPose = { ...POSE_DEFS.hero };
let targetPose = { ...POSE_DEFS.hero };
let currentAnatomySpin = 0;
let targetAnatomySpin = 0;

// ==========================================================
// SCROLL GEOMETRY & SAMPLING
// ==========================================================
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function lerpPose(a, b, t) {
  const out = {};
  Object.keys(a).forEach((key) => {
    out[key] = a[key] + (b[key] - a[key]) * t;
  });
  return out;
}

function rebuildScrollGeometry() {
  const vh = window.innerHeight;
  const scrollY = window.scrollY;

  anchors = POSE_KEYS.map((key) => {
    const el = sectionEls[key];
    if (!el) return 0;
    const top = el.getBoundingClientRect().top + scrollY;
    return Math.max(0, top + el.offsetHeight * 0.5 - vh * 0.5);
  });

  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i] < anchors[i - 1]) anchors[i] = anchors[i - 1];
  }

  const anatomyEl = sectionEls.anatomy;
  if (anatomyEl) {
    anatomyStart = anatomyEl.getBoundingClientRect().top + scrollY;
    anatomyRange = Math.max(1, anatomyEl.offsetHeight - vh);
  }

  maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);

  if (railTrack) {
    railTrackHeight = railTrack.clientHeight || 120;
  }
}

function samplePose(y) {
  if (!anchors.length) return { ...POSE_DEFS.hero };

  // Three-stage hero interaction:
  // 1. Stage 1 (0 to anchors[1] * 0.38): Hero copy scrolls up and vanishes, controller moves from bottom to screen center and clears blur.
  // 2. Stage 2 (anchors[1] * 0.38 to anchors[1] * 0.68): Dedicated Solo 3D Showcase stage. Controller floats cleanly in center alone.
  // 3. Stage 3 (anchors[1] * 0.68 to anchors[1]): Controller rotates and glides gracefully into Section 02 (Overview / Architecture).
  const overviewAnchor = anchors[1] || (window.innerHeight * 0.85);
  const stage1End = overviewAnchor * 0.38;
  const stage2End = overviewAnchor * 0.68;

  if (y <= 0) {
    return { ...POSE_DEFS.hero };
  } else if (y < stage1End) {
    const t = smoothstep(y / stage1End);
    return lerpPose(POSE_DEFS.hero, POSE_DEFS.heroReveal, t);
  } else if (y < stage2End) {
    return { ...POSE_DEFS.heroReveal };
  } else if (y < overviewAnchor) {
    const t = smoothstep((y - stage2End) / (overviewAnchor - stage2End));
    return lerpPose(POSE_DEFS.heroReveal, POSE_DEFS.overview, t);
  }

  for (let i = 1; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];

    if (y < b) {
      const span = Math.max(1, b - a);
      const t = smoothstep((y - a) / span);
      return lerpPose(POSE_DEFS[POSE_KEYS[i]], POSE_DEFS[POSE_KEYS[i + 1]], t);
    }
  }

  return { ...POSE_DEFS[POSE_KEYS[POSE_KEYS.length - 1]] };
}

function updateScroll() {
  const y = window.scrollY;

  // Track velocity fallback for non-Lenis gestures
  const now = performance.now();
  const dtScroll = Math.max(1, now - lastScrollTime);
  const dy = y - lastScrollY;
  if (!lenis) {
    targetScrollVelocity = (dy / dtScroll) * 16;
  }
  lastScrollY = y;
  lastScrollTime = now;

  // ---- 3D pose from section anchors
  const pose = samplePose(y);

  // ---- Anatomy exploded-view progress (drives parts + annotations)
  const ap = clamp((y - anatomyStart) / anatomyRange, 0, 1);
  const nearAnatomy =
    y > anatomyStart - window.innerHeight * 0.25 &&
    y < anatomyStart + anatomyRange + window.innerHeight * 0.25;

  if (nearAnatomy) {
    const rise = smoothstep((ap - 0.02) / 0.34);
    const fall = smoothstep((ap - 0.80) / 0.18);
    pose.explode = rise * (1 - fall);
    targetAnatomySpin = Math.sin(Math.PI * ap) * 0.48;
  } else {
    targetAnatomySpin = 0;
  }

  targetPose = pose;

  // ---- Anatomy annotations, counter, progress fill
  let activeNotes = 0;
  notes.forEach((note, i) => {
    const on = nearAnatomy && ap > 0.10 + i * 0.11 && ap < 0.985;
    note.classList.toggle('is-on', on);
    if (on) activeNotes++;
  });

  if (anatomyStep) {
    anatomyStep.textContent = String(activeNotes).padStart(2, '0');
  }
  if (anatomyFill) {
    anatomyFill.style.transform = `scaleX(${nearAnatomy ? ap : 0})`;
  }

  // ---- Active section: nav highlight + progress rail
  const center = y + window.innerHeight * 0.45;
  let index = 0;

  POSE_KEYS.forEach((key, i) => {
    const el = sectionEls[key];
    if (!el) return;
    const top = el.getBoundingClientRect().top + y;
    if (center >= top && center < top + el.offsetHeight) {
      index = i;
    }
  });

  navLinks.forEach((link) => {
    const isCurrent = link.dataset.section === POSE_KEYS[index];
    link.classList.toggle('is-current', isCurrent);
  });

  if (railNumber) railNumber.textContent = String(index + 1).padStart(2, '0');
  if (railLabel) railLabel.textContent = SECTION_NAMES[index];

  if (railThumb) {
    const progress = clamp(y / maxScroll, 0, 1);
    const travel = Math.max(0, railTrackHeight - (railThumb.offsetHeight || 38));
    railThumb.style.transform = `translateY(${progress * travel}px)`;
  }

  if (railEl) {
    railEl.style.opacity = index >= POSE_KEYS.length - 1 ? '0' : '1';
  }

  // ---- Hero scroll dynamic transitions (Content scroll up/fade/blur & 3D canvas reveal)
  const vh = window.innerHeight;
  const heroProgress = clamp(y / (vh * 0.35), 0, 1);

  if (heroTopBlock) {
    const heroTranslateY = -heroProgress * 140;
    const heroOpacity = Math.max(0, 1 - heroProgress * 1.45);
    const heroBlur = heroProgress * 12;
    heroTopBlock.style.setProperty('--hero-content-y', `${heroTranslateY.toFixed(1)}px`);
    heroTopBlock.style.setProperty('--hero-content-opacity', heroOpacity.toFixed(3));
    heroTopBlock.style.setProperty('--hero-content-blur', `${heroBlur.toFixed(1)}px`);
    heroTopBlock.style.pointerEvents = heroOpacity <= 0.05 ? 'none' : 'auto';
  }

  if (heroBottomBlock) {
    const footOpacity = Math.max(0, 1 - heroProgress * 2.8);
    heroBottomBlock.style.setProperty('--hero-foot-opacity', footOpacity.toFixed(3));
    heroBottomBlock.style.pointerEvents = footOpacity <= 0.05 ? 'none' : 'auto';
  }

  // Canvas blur effect: heavily blurred initially in Hero bottom-center, smoothly unblurs as user scrolls
  const canvasBlurPx = Math.max(0, (1 - heroProgress) * 16);
  if (container) {
    container.style.setProperty('--canvas-blur', `${canvasBlurPx.toFixed(1)}px`);
  }

  // ---- Hide 3D object past Finish 05 (Colorways) section
  // Subsequent sections (Pre-order, Platform, FAQ, Footer) have their own dedicated backgrounds
  const colorwaysEl = sectionEls.colorways;
  const containerEl = document.getElementById('canvas-container');
  const warmFieldEl = document.getElementById('hero-warm-field');

  if (colorwaysEl && containerEl) {
    const colorwaysRect = colorwaysEl.getBoundingClientRect();
    const vh = window.innerHeight;

    // As finish (colorways) scrolls off top (entering buy / pre-order), smoothly fade out the 3D canvas & warm field
    const fadeThreshold = vh * 0.40;
    if (colorwaysRect.bottom < fadeThreshold) {
      const fadeDist = vh * 0.35;
      const progressPastColorways = clamp((fadeThreshold - colorwaysRect.bottom) / fadeDist, 0, 1);
      const opacity = 1 - progressPastColorways;
      const opacityStr = opacity.toFixed(3);
      containerEl.style.opacity = opacityStr;
      containerEl.style.pointerEvents = opacity <= 0.05 ? 'none' : 'auto';
      if (warmFieldEl) {
        warmFieldEl.style.opacity = opacityStr;
      }
      if (rootGroup) {
        rootGroup.visible = opacity > 0.005;
      }
    } else {
      containerEl.style.opacity = '1';
      containerEl.style.pointerEvents = 'auto';
      if (warmFieldEl) {
        warmFieldEl.style.opacity = '1';
      }
      if (rootGroup) {
        rootGroup.visible = true;
      }
    }
  }
}

window.addEventListener('scroll', updateScroll, { passive: true });

// ==========================================================
// INTERACTIVE POINTER DRAG
// ==========================================================
let targetUserYaw = 0;
let currentUserYaw = 0;
let targetUserPitch = 0;
let currentUserPitch = 0;

let isDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;
let velYaw = 0;
let velPitch = 0;

container.addEventListener('pointerdown', (e) => {
  isDragging = true;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;
  velYaw = 0;
  velPitch = 0;
  container.classList.add('grabbing');
  try {
    container.setPointerCapture(e.pointerId);
  } catch (err) {}
});

container.addEventListener('pointermove', (e) => {
  if (!isDragging) return;

  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  // Let vertical touch gestures scroll the page instead of tilting.
  if (e.pointerType === 'touch' && Math.abs(dy) > Math.abs(dx) * 1.4) return;

  const sensitivity = 0.0065;
  const dYaw = dx * sensitivity;
  const dPitch = dy * sensitivity;

  targetUserYaw += dYaw;
  targetUserPitch += dPitch;

  velYaw = dYaw;
  velPitch = dPitch;
});

function endDrag(e) {
  if (!isDragging) return;
  isDragging = false;
  container.classList.remove('grabbing');
  try {
    container.releasePointerCapture(e.pointerId);
  } catch (err) {}
}

container.addEventListener('pointerup', endDrag);
container.addEventListener('pointercancel', endDrag);

// ==========================================================
// COLORWAYS
// ==========================================================
const COLORWAYS = {
  obsidian: {
    body: '#1e222a',
    accent: '#ff6b1a',
    desc: 'Obsidian — matte carbon shell with warm ember lighting.'
  },
  ember: {
    body: '#3d1a10',
    accent: '#ff8a3d',
    desc: 'Ember — smoked copper shell with a live ember glow.'
  },
  glacier: {
    body: '#dce3ed',
    accent: '#7cc4ff',
    desc: 'Glacier — cool alloy shell with an ice-blue backlight.'
  }
};

const bodyColorTarget = new THREE.Color(COLORWAYS.obsidian.body);
const accentColorTarget = new THREE.Color(COLORWAYS.obsidian.accent);
const accentColorCurrent = new THREE.Color(COLORWAYS.obsidian.accent);

const swatches = Array.from(document.querySelectorAll('.swatch'));
const colorwayDesc = document.getElementById('colorway-desc');

function setColorway(key) {
  const cfg = COLORWAYS[key];
  if (!cfg) return;

  bodyColorTarget.set(cfg.body);
  accentColorTarget.set(cfg.accent);

  document.documentElement.style.setProperty('--accent-orange', cfg.accent);

  if (colorwayDesc) colorwayDesc.textContent = cfg.desc;

  swatches.forEach((swatch) => {
    const active = swatch.dataset.colorway === key;
    swatch.classList.toggle('is-active', active);
    swatch.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  // GSAP 360-degree spin flourish on finish selection
  if (window.gsap && !prefersReducedMotion) {
    window.gsap.to(flourishState, {
      y: flourishState.y + Math.PI * 2,
      duration: 1.25,
      ease: 'power2.out',
      overwrite: 'auto'
    });
  } else {
    targetUserYaw += 0.45;
  }
}

swatches.forEach((swatch) => {
  swatch.addEventListener('click', () => setColorway(swatch.dataset.colorway));
});

// ==========================================================
// PLATFORM CONTINUOUS CAROUSEL & INTERACTIVE CARDS
// ==========================================================
const platformTrack = document.getElementById('platform-track');
const platformWrap = document.querySelector('.platform-carousel-wrap');
const platformPrev = document.getElementById('platform-prev');
const platformNext = document.getElementById('platform-next');
const platformSection = document.getElementById('platform');

if (platformTrack && platformWrap) {
  const initialCards = Array.from(platformTrack.querySelectorAll('.platform-card'));
  const originalCount = initialCards.length;

  // Clone 2 duplicate sets to create a seamless infinite 3-set sequence [Set 1][Set 2][Set 3]
  if (originalCount > 0) {
    for (let s = 0; s < 2; s++) {
      initialCards.forEach((card) => {
        const clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('tabindex', '-1');
        clone.classList.add('is-clone');
        clone.classList.add('is-in');
        platformTrack.appendChild(clone);
      });
    }
  }

  // Ensure all cards start clean
  platformTrack.querySelectorAll('.platform-card').forEach((card) => {
    card.classList.remove('is-active');
  });

  // Dimensional metrics
  let setWidth = 0;
  let step = 340;

  function measurePlatformTrack() {
    const allCards = platformTrack.querySelectorAll('.platform-card');
    if (allCards.length > originalCount) {
      setWidth = allCards[originalCount].offsetLeft - allCards[0].offsetLeft;
      if (allCards.length > 1) {
        step = allCards[1].offsetLeft - allCards[0].offsetLeft;
      }
    }
  }

  measurePlatformTrack();
  window.addEventListener('resize', measurePlatformTrack);
  window.addEventListener('load', measurePlatformTrack);
  setTimeout(measurePlatformTrack, 250);

  // Animation & Physics State
  let currentX = 0;
  let targetX = 0;
  const baseSpeed = 42; // Continuous glide: ~42px/sec (calm, high-end velocity)
  let currentSpeed = baseSpeed;
  let isHovered = false;
  let isDragging = false;
  let startPointerX = 0;
  let lastPointerX = 0;
  let lastPointerTime = 0;
  let dragStartCurrentX = 0;
  let hasDragged = false;
  let dragThresholdPassed = false;
  let velocity = 0; // px/sec for inertia
  let isSectionVisible = true;
  let lastFrameTime = performance.now();

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Hover detection: gently decelerate to pause so user can inspect cards
  const setHovered = (val) => {
    isHovered = val;
  };

  platformWrap.addEventListener('pointerenter', () => setHovered(true));
  platformWrap.addEventListener('pointerleave', () => {
    if (!isDragging) setHovered(false);
  });

  if (platformPrev) {
    platformPrev.addEventListener('pointerenter', () => setHovered(true));
    platformPrev.addEventListener('pointerleave', () => { if (!isDragging) setHovered(false); });
    platformPrev.addEventListener('click', (e) => {
      e.preventDefault();
      velocity = 0;
      targetX -= step;
    });
  }

  if (platformNext) {
    platformNext.addEventListener('pointerenter', () => setHovered(true));
    platformNext.addEventListener('pointerleave', () => { if (!isDragging) setHovered(false); });
    platformNext.addEventListener('click', (e) => {
      e.preventDefault();
      velocity = 0;
      targetX += step;
    });
  }

  // Pointer drag & touch gestures
  platformWrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDragging = true;
    hasDragged = false;
    dragThresholdPassed = false;
    startPointerX = e.clientX;
    lastPointerX = e.clientX;
    lastPointerTime = performance.now();
    dragStartCurrentX = currentX;
    velocity = 0;
    platformWrap.classList.add('is-dragging');
    if (platformWrap.setPointerCapture) {
      try { platformWrap.setPointerCapture(e.pointerId); } catch (_) {}
    }
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startPointerX;
    if (!dragThresholdPassed && Math.abs(dx) > 5) {
      dragThresholdPassed = true;
      hasDragged = true;
    }
    if (dragThresholdPassed) {
      const now = performance.now();
      const dt = (now - lastPointerTime) / 1000;
      if (dt > 0.008) {
        velocity = -((e.clientX - lastPointerX) / dt);
        lastPointerX = e.clientX;
        lastPointerTime = now;
      }
      currentX = dragStartCurrentX - dx;
      targetX = currentX;
    }
  });

  const onPointerUp = (e) => {
    if (!isDragging) return;
    isDragging = false;
    platformWrap.classList.remove('is-dragging');
    if (platformWrap.releasePointerCapture && e.pointerId !== undefined) {
      try { platformWrap.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    // Clamp release velocity
    const maxV = 1800;
    velocity = Math.max(-maxV, Math.min(maxV, velocity));
    targetX = currentX;

    setTimeout(() => {
      hasDragged = false;
      if (!platformWrap.matches(':hover')) {
        isHovered = false;
      }
    }, 60);
  };

  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // Card click interaction (active state toggle)
  platformTrack.addEventListener('click', (e) => {
    if (hasDragged) {
      e.preventDefault();
      return;
    }
    const card = e.target.closest('.platform-card');
    if (!card) return;
    const wasActive = card.classList.contains('is-active');
    platformTrack.querySelectorAll('.platform-card').forEach((c) => c.classList.remove('is-active'));
    if (!wasActive) card.classList.add('is-active');
  });

  // Keyboard navigation & accessibility
  platformWrap.setAttribute('tabindex', '0');
  platformWrap.setAttribute('role', 'region');
  platformWrap.setAttribute('aria-label', 'Nexus Platform Hardware Carousel');

  platformWrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      velocity = 0;
      targetX -= step;
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      velocity = 0;
      targetX += step;
    }
  });

  initialCards.forEach((card) => {
    card.addEventListener('focus', () => {
      isHovered = true;
      const wrapRect = platformWrap.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const delta = (cardRect.left + cardRect.width / 2) - (wrapRect.left + wrapRect.width / 2);
      targetX += delta;
    });
    card.addEventListener('blur', () => {
      isHovered = false;
    });
  });

  // RAF Continuous Animation Loop
  function tickCarousel(now) {
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    if (isSectionVisible && setWidth > 0) {
      if (isDragging) {
        // Direct manipulation active
      } else if (Math.abs(velocity) > 15) {
        // Release momentum with exponential friction decay
        currentX += velocity * dt;
        targetX = currentX;
        velocity *= Math.pow(0.88, dt * 60);
      } else {
        velocity = 0;
        // Smooth continuous auto-glide
        const targetSpeed = (isHovered || prefersReduced) ? 0 : baseSpeed;
        currentSpeed += (targetSpeed - currentSpeed) * (1 - Math.exp(-6 * dt));
        targetX += currentSpeed * dt;
        // Exponential smoothing towards targetX (for arrow clicks & smooth settles)
        currentX += (targetX - currentX) * (1 - Math.exp(-12 * dt));
      }

      // Mathematical Seamless Infinite Wrap
      while (targetX >= setWidth) {
        targetX -= setWidth;
        currentX -= setWidth;
        if (isDragging) dragStartCurrentX -= setWidth;
      }
      while (targetX < 0) {
        targetX += setWidth;
        currentX += setWidth;
        if (isDragging) dragStartCurrentX -= setWidth;
      }

      const renderX = ((currentX % setWidth) + setWidth) % setWidth;
      platformTrack.style.transform = `translate3d(${-renderX}px, 0, 0)`;
    }

    requestAnimationFrame(tickCarousel);
  }

  requestAnimationFrame(tickCarousel);

  // Performance: Pause RAF loop when Section 07 is not in viewport
  if ('IntersectionObserver' in window && platformSection) {
    const platformObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        isSectionVisible = entry.isIntersecting;
        if (entry.isIntersecting) {
          lastFrameTime = performance.now();
          platformTrack.querySelectorAll('.platform-card').forEach((c) => c.classList.add('is-in'));
        }
      });
    }, { threshold: 0.05 });
    platformObserver.observe(platformSection);
  }
}

// ==========================================================
// PRICING / FIRST PROJECT DISCOUNT TOGGLE
// ==========================================================
const pricingToggle = document.getElementById('pricing-discount-toggle');
if (pricingToggle) {
  pricingToggle.addEventListener('change', () => {
    const isDiscounted = pricingToggle.checked;
    const priceEls = document.querySelectorAll('.pricing-card-price-val[data-base]');
    priceEls.forEach((el) => {
      const base = el.getAttribute('data-base');
      const discount = el.getAttribute('data-discount');
      const val = isDiscounted ? discount : base;
      if (val) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-4px)';
        setTimeout(() => {
          el.textContent = `$${Number(val).toLocaleString()}`;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        }, 140);
      }
    });
  });
}

// ==========================================================
// OUR APPROACH / DINO SCORE COUNTER & TRIGGER FORCE SIMULATOR
// ==========================================================
const dinoScoreEl = document.getElementById('dino-score');
if (dinoScoreEl) {
  let score = 58;
  setInterval(() => {
    score = (score + 1) % 100000;
    dinoScoreEl.textContent = String(score).padStart(5, '0');
  }, 120);
}

const triggerValEl = document.getElementById('trigger-val');
if (triggerValEl) {
  let baseN = 7.2;
  setInterval(() => {
    const jitter = (Math.sin(Date.now() * 0.003) * 1.8 + Math.random() * 0.4).toFixed(1);
    const force = Math.max(2.4, (baseN + parseFloat(jitter))).toFixed(1);
    triggerValEl.textContent = `${force} N`;
  }, 320);
}

// ==========================================================
// FAQ ACCORDION — ONE OPEN AT A TIME
// ==========================================================
const faqItems = Array.from(document.querySelectorAll('.faq-item'));
faqItems.forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    faqItems.forEach((other) => {
      if (other !== item && other.open) other.open = false;
    });
  });
});

// ==========================================================
// SCROLL REVEAL (Cinematic Blur-to-Focus Observer)
// ==========================================================
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-in');
    } else if (entry.boundingClientRect.top > 0) {
      // Re-arms reveal when scrolled back up above the section
      entry.target.classList.remove('is-in');
    }
  });
}, {
  threshold: 0.15,
  rootMargin: '0px 0px -40px 0px'
});

document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

// ==========================================================
// RESPONSIVE RESIZE
// ==========================================================
function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);

  updateNotchGeometry();
  rebuildScrollGeometry();
  updateScroll();
}
window.addEventListener('resize', onResize);
window.addEventListener('load', () => {
  rebuildScrollGeometry();
  updateScroll();
});

function updateNotchGeometry() {
  const notchNav = document.getElementById('notch-nav');
  const svg = document.getElementById('notch-svg');
  const fillPath = document.getElementById('notch-fill-path');
  const strokePath = document.getElementById('notch-stroke-path');
  const clipPath = document.getElementById('notch-clip-path');

  if (!notchNav || !svg || !fillPath || !strokePath) return;

  const w = notchNav.offsetWidth || 600;
  const h = notchNav.offsetHeight || 64;
  const isMobile = window.innerWidth <= 768;
  const r = isMobile ? 12 : 15;
  const c = 0.5522847;

  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const p1 = `M 0 0 C ${(r * c).toFixed(2)} 0, ${r} ${(r * (1 - c)).toFixed(2)}, ${r} ${r}`;
  const p2 = `L ${r} ${h - r}`;
  const p3 = `C ${r} ${(h - r + r * c).toFixed(2)}, ${(r + r * (1 - c)).toFixed(2)} ${h}, ${r * 2} ${h}`;
  const p4 = `L ${w - r * 2} ${h}`;
  const p5 = `C ${(w - r - r * (1 - c)).toFixed(2)} ${h}, ${w - r} ${(h - r + r * c).toFixed(2)}, ${w - r} ${h - r}`;
  const p6 = `L ${w - r} ${r}`;
  const p7 = `C ${w - r} ${(r * (1 - c)).toFixed(2)}, ${(w - r * c).toFixed(2)} 0, ${w} 0`;

  const strokeD = `${p1} ${p2} ${p3} ${p4} ${p5} ${p6} ${p7}`;
  const fillD = `${strokeD} Z`;

  fillPath.setAttribute('d', fillD);
  strokePath.setAttribute('d', strokeD);
  if (clipPath) clipPath.setAttribute('d', fillD);
}

updateNotchGeometry();
rebuildScrollGeometry();
updateScroll();

// ==========================================================
// DEBUG / QA BRIDGE (used for layout verification)
// ==========================================================
window.__nexus = {
  THREE,
  scene,
  camera,
  rootGroup,
  updateScroll,
  rebuildScrollGeometry,
  get anchors() {
    return [...anchors];
  },
  get anatomyInfo() {
    return { start: anatomyStart, range: anatomyRange };
  },
  get model() {
    return loadedModel;
  },
  get pose() {
    return { ...currentPose };
  },
  get target() {
    return { ...targetPose };
  },
  snap() {
    Object.keys(targetPose).forEach((key) => {
      currentPose[key] = targetPose[key];
    });
    currentAnatomySpin = targetAnatomySpin;
    applyScenePose(0);
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    return this.projectModel();
  },
  projectModel() {
    if (!loadedModel) return null;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(loadedModel);
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z)
    ];

    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;

    corners.forEach((v) => {
      v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
      left = Math.min(left, sx);
      right = Math.max(right, sx);
      top = Math.min(top, sy);
      bottom = Math.max(bottom, sy);
    });

    return {
      left: +left.toFixed(1),
      right: +right.toFixed(1),
      top: +top.toFixed(1),
      bottom: +bottom.toFixed(1),
      width: +(right - left).toFixed(1),
      height: +(bottom - top).toFixed(1),
      viewport: [window.innerWidth, window.innerHeight],
      scrollY: window.scrollY
    };
  }
};

// ==========================================================
// RENDER & ANIMATION LOOP
// ==========================================================
const clock = new THREE.Clock();
const isMobileViewport = () => window.innerWidth <= 900;
let lastLoopScrollY = -1;

function animate(timestamp) {
  requestAnimationFrame(animate);

  if (lenis && timestamp) {
    lenis.raf(timestamp);
  }

  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsedTime = clock.elapsedTime;
  const damp = prefersReducedMotion ? 1 : 1 - Math.exp(-6.5 * dt);

  // Smoothly damp scroll velocity
  currentScrollVelocity += (targetScrollVelocity - currentScrollVelocity) * (1 - Math.exp(-9.0 * dt));
  targetScrollVelocity *= Math.exp(-5.0 * dt);

  // Dynamic scroll inertia reactions (banking, pitch, roll)
  if (!prefersReducedMotion) {
    const velClamped = Math.max(-80, Math.min(80, currentScrollVelocity));
    const targetPitch = -velClamped * 0.0035; // tilts forward on scroll down
    const targetBank = -velClamped * 0.0018;  // subtle bank into the scroll direction
    const targetRoll = -velClamped * 0.0024;  // subtle roll

    currentScrollPitch += (targetPitch - currentScrollPitch) * (1 - Math.exp(-7.0 * dt));
    currentScrollBank += (targetBank - currentScrollBank) * (1 - Math.exp(-7.0 * dt));
    currentScrollRoll += (targetRoll - currentScrollRoll) * (1 - Math.exp(-7.0 * dt));
  }

  // Smooth mouse parallax
  currentMouseYaw += (targetMouseYaw - currentMouseYaw) * (1 - Math.exp(-5.0 * dt));
  currentMousePitch += (targetMousePitch - currentMousePitch) * (1 - Math.exp(-5.0 * dt));

  // Fallback for missed scroll events (also keeps poses in sync on restore)
  if (window.scrollY !== lastLoopScrollY) {
    lastLoopScrollY = window.scrollY;
    updateScroll();
  }

  // ---- Pointer inertia
  if (!isDragging) {
    if (Math.abs(velYaw) > 0.0001) {
      targetUserYaw += velYaw;
      velYaw *= 0.90;
    }
    if (Math.abs(velPitch) > 0.0001) {
      targetUserPitch += velPitch;
      velPitch *= 0.90;
    }
  }

  currentUserYaw += (targetUserYaw - currentUserYaw) * 0.1;
  currentUserPitch += (targetUserPitch - currentUserPitch) * 0.1;
  currentAnatomySpin += (targetAnatomySpin - currentAnatomySpin) * damp;

  // ---- Damped scroll pose
  for (const key of Object.keys(targetPose)) {
    currentPose[key] += (targetPose[key] - currentPose[key]) * damp;
  }

  applyScenePose(elapsedTime);

  // ---- Colorway body tint
  for (const mat of bodyMaterials) {
    mat.color.lerp(bodyColorTarget, prefersReducedMotion ? 1 : 0.05);
  }

  // ---- Accent lighting
  accentColorCurrent.lerp(accentColorTarget, prefersReducedMotion ? 1 : 0.05);
  orangeBacklight.color.copy(accentColorCurrent);
  warmPointLight.color.copy(accentColorCurrent);

  orangeBacklight.position.x = 5.0 + Math.sin(elapsedTime * 0.4) * 0.35;
  orangeBacklight.position.y = -3.5 + Math.cos(elapsedTime * 0.32) * 0.25;

  const pulseFactor = 0.96 + Math.sin(elapsedTime * 2.2) * 0.06;
  orangeBacklight.intensity = 6.6 * pulseFactor;

  renderer.render(scene, camera);
}

function applyScenePose(elapsedTime) {
  const mobile = isMobileViewport();
  const poseX = mobile ? currentPose.x * 0.14 : currentPose.x;
  const poseY = currentPose.y + (mobile ? 0.22 : 0);
  const poseScale = currentPose.scale * (mobile ? Math.min(0.56, Math.max(0.42, (window.innerWidth / 560) * 0.82)) : 1);

  rootGroup.position.set(poseX, poseY, 0);
  if (loadedModel) {
    rootGroup.scale.setScalar(baseModelScale * poseScale);
  }

  userRotationGroup.rotation.y =
    currentPose.ry +
    currentUserYaw +
    currentAnatomySpin +
    currentMouseYaw +
    currentScrollRoll +
    flourishState.y;

  userRotationGroup.rotation.x =
    currentPose.rx +
    currentUserPitch +
    currentMousePitch +
    currentScrollPitch;

  userRotationGroup.rotation.z =
    currentPose.rz +
    currentScrollBank;

  // ---- Exploded parts
  for (const part of explodeParts) {
    const d = part.distance * currentPose.explode;
    part.obj.position
      .copy(part.origin)
      .addScaledVector(part.direction, d);
  }

  // ---- Camera
  camera.position.set(0, 0, 5.0);
  camera.lookAt(0, 0, 0);
  if (Math.abs(camera.fov - 36) > 0.01) {
    camera.fov = 36;
    camera.updateProjectionMatrix();
  }

  // ---- Dynamic natural floating motion
  idleFloatGroup.position.y = Math.sin(elapsedTime * 1.2) * 0.020;
  idleFloatGroup.rotation.z = Math.sin(elapsedTime * 0.8) * 0.012;
  idleFloatGroup.rotation.x = Math.cos(elapsedTime * 0.9) * 0.010;
}

animate();

// Safety net: never leave content hidden if model loading stalls
setTimeout(() => {
  document.body.classList.add('is-ready');
  rebuildScrollGeometry();
  updateScroll();
}, 7000);

// ==========================================================
// BESPOKE NEXUS VECTOR ARROW CURSOR CONTROLLER
// ==========================================================
const nexusCursor = document.getElementById('nexus-cursor');
const cursorArrowWrap = document.getElementById('cursor-arrow-wrap');
const cursorHalo = document.getElementById('cursor-halo');
const cursorBadge = document.getElementById('cursor-badge');

if (nexusCursor && cursorArrowWrap && cursorHalo && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let haloX = mouseX;
  let haloY = mouseY;
  let isVisible = false;
  let isDown = false;
  let currentMode = 'default'; // 'default' | 'hover' | '3d'
  let currentBadgeText = '';

  // Velocity tracking for natural kinetic banking
  let lastMouseX = mouseX;
  let lastMouseY = mouseY;
  let smoothedVx = 0;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!isVisible) {
      isVisible = true;
      nexusCursor.classList.add('is-visible');
      haloX = mouseX;
      haloY = mouseY;
    }

    const target = e.target;
    if (!target) return;

    const interactiveEl = target.closest(
      'a, button, summary, input, .platform-card, .swatch, .buy-btn, .hero-btn, .platform-arrow-btn, .platform-carousel-wrap, [role="button"]'
    );

    const colorwaysEl = sectionEls?.colorways;
    const isAboveFinish = colorwaysEl ? colorwaysEl.getBoundingClientRect().bottom > window.innerHeight * 0.2 : true;
    const isOver3D = !interactiveEl && isAboveFinish && target.closest('#canvas-container, .hero-frame, .anatomy-sticky, .section-inner');

    if (interactiveEl) {
      if (currentMode !== 'hover') {
        currentMode = 'hover';
        nexusCursor.classList.add('is-hover');
        nexusCursor.classList.remove('is-3d');
      }

      if (interactiveEl.closest('.platform-card')) {
        currentBadgeText = 'EXPLORE';
      } else if (interactiveEl.closest('.swatch')) {
        currentBadgeText = 'COLORWAY';
      } else if (interactiveEl.closest('.pricing-btn')) {
        currentBadgeText = 'DISCUSS';
      } else if (interactiveEl.closest('.pricing-switch, .pricing-toggle-wrap')) {
        currentBadgeText = 'TOGGLE';
      } else if (interactiveEl.closest('.buy-btn, [href="#buy"]')) {
        currentBadgeText = 'PRICING';
      } else if (interactiveEl.closest('.platform-arrow-btn')) {
        currentBadgeText = 'SCROLL';
      } else if (interactiveEl.closest('.platform-carousel-wrap')) {
        currentBadgeText = 'DRAG';
      } else if (interactiveEl.closest('.sundown-nav-link')) {
        currentBadgeText = 'VIEW';
      } else if (interactiveEl.closest('.sundown-submit-btn')) {
        currentBadgeText = 'JOIN';
      } else {
        currentBadgeText = 'SELECT';
      }

      if (cursorBadge) {
        cursorBadge.textContent = currentBadgeText;
        cursorBadge.classList.add('is-visible');
      }
    } else if (isOver3D) {
      if (currentMode !== '3d') {
        currentMode = '3d';
        nexusCursor.classList.add('is-3d');
        nexusCursor.classList.remove('is-hover');
      }
      if (cursorBadge) {
        cursorBadge.textContent = '360° DRAG';
        cursorBadge.classList.add('is-visible');
      }
    } else {
      if (currentMode !== 'default') {
        currentMode = 'default';
        nexusCursor.classList.remove('is-hover', 'is-3d');
      }
      if (cursorBadge) {
        cursorBadge.classList.remove('is-visible');
      }
    }
  }, { passive: true });

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    isDown = true;
    nexusCursor.classList.add('is-down');
    if (currentMode === '3d' && cursorBadge) {
      cursorBadge.textContent = 'ROTATING';
    }
  });

  window.addEventListener('pointerup', () => {
    isDown = false;
    nexusCursor.classList.remove('is-down');
    if (cursorBadge) {
      if (currentMode === '3d') {
        cursorBadge.textContent = '360° DRAG';
      } else if (currentMode === 'hover') {
        cursorBadge.textContent = currentBadgeText || 'SELECT';
      }
    }
  });

  document.addEventListener('mouseleave', () => {
    isVisible = false;
    nexusCursor.classList.remove('is-visible');
  });

  document.addEventListener('mouseenter', () => {
    isVisible = true;
    nexusCursor.classList.add('is-visible');
  });

  function updateCursorFrame() {
    // 1. Organic banking tilt based on horizontal velocity
    const vx = mouseX - lastMouseX;
    smoothedVx += (vx - smoothedVx) * 0.18;
    lastMouseX = mouseX;
    lastMouseY = mouseY;

    const tilt = Math.min(Math.max(smoothedVx * 0.7, -14), 14);

    // Instant tip tracking (zero latency) with subtle dynamic tilt
    cursorArrowWrap.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) rotate(${tilt.toFixed(2)}deg)`;

    // 2. Trailing ambient fluid aura
    haloX += (mouseX - haloX) * 0.20;
    haloY += (mouseY - haloY) * 0.20;
    cursorHalo.style.transform = `translate3d(${haloX}px, ${haloY}px, 0)`;

    requestAnimationFrame(updateCursorFrame);
  }

  requestAnimationFrame(updateCursorFrame);
}

// ==========================================================
// SUNDOWN FOOTER: LIVE DIGITAL CLOCK & NEWSLETTER
// ==========================================================
function initSundownFooter() {
  const footerEl = document.getElementById('footer');
  const cursorGlowEl = document.getElementById('sundown-cursor-glow');

  // Keep the effect local to the footer, so it reads as an ambient light pool
  // rather than competing with the site-wide custom cursor.
  if (
    footerEl &&
    cursorGlowEl &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    let targetX = 0;
    let targetY = 0;
    let glowX = 0;
    let glowY = 0;
    let isGlowVisible = false;
    let framePending = false;

    const renderGlow = () => {
      framePending = false;
      glowX += (targetX - glowX) * 0.16;
      glowY += (targetY - glowY) * 0.16;
      cursorGlowEl.style.transform = `translate3d(${glowX}px, ${glowY}px, 0) translate3d(-50%, -50%, 0) scale(1)`;

      if (isGlowVisible && (Math.abs(targetX - glowX) > 0.1 || Math.abs(targetY - glowY) > 0.1)) {
        framePending = true;
        requestAnimationFrame(renderGlow);
      }
    };

    footerEl.addEventListener('pointerenter', (event) => {
      const rect = footerEl.getBoundingClientRect();
      targetX = glowX = event.clientX - rect.left;
      targetY = glowY = event.clientY - rect.top;
      isGlowVisible = true;
      footerEl.classList.add('is-pointer-active');
      cursorGlowEl.style.transform = `translate3d(${glowX}px, ${glowY}px, 0) translate3d(-50%, -50%, 0) scale(1)`;
    });

    footerEl.addEventListener('pointermove', (event) => {
      const rect = footerEl.getBoundingClientRect();
      targetX = event.clientX - rect.left;
      targetY = event.clientY - rect.top;
      if (!framePending) {
        framePending = true;
        requestAnimationFrame(renderGlow);
      }
    }, { passive: true });

    footerEl.addEventListener('pointerleave', () => {
      isGlowVisible = false;
      footerEl.classList.remove('is-pointer-active');
    });
  }

  const clockEl = document.getElementById('footer-live-clock');
  if (clockEl) {
    function tickClock() {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }
    tickClock();
    setInterval(tickClock, 1000);
  }

  const form = document.getElementById('sundown-form');
  const statusEl = document.getElementById('sundown-status');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = form.querySelector('.sundown-email-input');
      if (input && input.value) {
        input.value = '';
        if (statusEl) {
          statusEl.textContent = "✓ You're on the list. Updates and firmware drops locked in.";
          setTimeout(() => {
            statusEl.textContent = '';
          }, 4500);
        }
      }
    });
  }
}

initSundownFooter();

// ==========================================================
// FAQ MINIMAL CARD STACK ACCORDION
// ==========================================================
function initFaqAccordion() {
  const items = Array.from(document.querySelectorAll('.faq-stack-item'));
  if (!items.length) return;

  items.forEach((item) => {
    const trigger = item.querySelector('.faq-stack-trigger');
    if (!trigger) return;

    trigger.addEventListener('click', () => {
      const isOpen = item.classList.contains('is-open');

      // Close all other items for a clean single-accordion focus
      items.forEach((other) => {
        if (other !== item && other.classList.contains('is-open')) {
          other.classList.remove('is-open');
          const otherTrigger = other.querySelector('.faq-stack-trigger');
          if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle clicked item
      item.classList.toggle('is-open', !isOpen);
      trigger.setAttribute('aria-expanded', String(!isOpen));

      // Refresh layout geometry after height change
      if (typeof rebuildScrollGeometry === 'function') {
        setTimeout(rebuildScrollGeometry, 360);
      }
    });
  });
}

initFaqAccordion();
