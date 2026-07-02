const video = document.querySelector("#video");
const canvas = document.querySelector("#mirror");
const ctx = canvas.getContext("2d", { alpha: false });
const startPanel = document.querySelector("#startPanel");
const startButton = document.querySelector("#startButton");
const statusEl = document.querySelector("#status");

const LOOP_MS = 22000;
const TRACKING_INTERVAL_MS = 34;
const SILICONE = {
  fill: "rgba(157, 190, 207, 0.48)",
  edge: "rgba(198, 231, 243, 0.72)",
  shadow: "rgba(51, 93, 115, 0.3)",
  shine: "rgba(247, 253, 255, 0.84)",
};

let faceMesh;
let lastLandmarks = null;
let trackingBusy = false;
let lastTrackingAt = 0;
let streamStartedAt = 0;
let canvasWidth = 0;
let canvasHeight = 0;
let cover = { x: 0, y: 0, w: 0, h: 0 };
let tempCanvas;
let tempCtx;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;

function setStatus(message) {
  statusEl.textContent = message;
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);

  if (canvasWidth === width && canvasHeight === height) return;

  canvasWidth = width;
  canvasHeight = height;
  canvas.width = width;
  canvas.height = height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  tempCanvas = document.createElement("canvas");
  tempCanvas.width = width;
  tempCanvas.height = height;
  tempCtx = tempCanvas.getContext("2d", { alpha: true });
}

function updateCover() {
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.max(canvasWidth / vw, canvasHeight / vh);
  const w = vw * scale;
  const h = vh * scale;
  cover = {
    x: (canvasWidth - w) * 0.5,
    y: (canvasHeight - h) * 0.5,
    w,
    h,
  };
}

function landmarkPoint(landmark) {
  return {
    x: cover.x + (1 - landmark.x) * cover.w,
    y: cover.y + landmark.y * cover.h,
  };
}

function drawMirroredVideo(targetCtx = ctx) {
  targetCtx.save();
  targetCtx.translate(canvasWidth, 0);
  targetCtx.scale(-1, 1);
  targetCtx.drawImage(video, cover.x, cover.y, cover.w, cover.h);
  targetCtx.restore();
}

function facePath(points) {
  const oval = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
    400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
    54, 103, 67, 109,
  ];

  ctx.beginPath();
  oval.forEach((index, i) => {
    const point = landmarkPoint(points[index]);
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function addLandmarkLoop(points, indices, scale = 1) {
  const mapped = indices.map((index) => landmarkPoint(points[index]));
  const center = mapped.reduce(
    (sum, point) => ({ x: sum.x + point.x / mapped.length, y: sum.y + point.y / mapped.length }),
    { x: 0, y: 0 },
  );

  mapped.forEach((source, i) => {
    const point = {
      x: center.x + (source.x - center.x) * scale,
      y: center.y + (source.y - center.y) * scale,
    };
    if (i === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function siliconeMaskPath(points, featureOpening = 1, shellScale = 1) {
  const oval = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
    400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
    54, 103, 67, 109,
  ];
  const leftEye = [33, 160, 158, 133, 153, 144];
  const rightEye = [362, 385, 387, 263, 373, 380];
  const mouth = [61, 185, 40, 39, 0, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181];

  ctx.beginPath();
  addLandmarkLoop(points, oval, shellScale);
  addLandmarkLoop(points, leftEye, featureOpening);
  addLandmarkLoop(points, rightEye, featureOpening);
  addLandmarkLoop(points, mouth, featureOpening);
}

function getFaceBounds(points) {
  const indices = [10, 152, 234, 454, 127, 356, 93, 323];
  const mapped = indices.map((index) => landmarkPoint(points[index]));
  return mapped.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
}

function drawBeautyPass(points, amount) {
  if (amount <= 0.01) return;

  const bounds = getFaceBounds(points);
  const faceW = bounds.maxX - bounds.minX;
  const faceH = bounds.maxY - bounds.minY;

  tempCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  tempCtx.filter = `blur(${mix(3, 12, amount)}px) saturate(${mix(1, 1.08, amount)})`;
  drawMirroredVideo(tempCtx);
  tempCtx.filter = "none";

  ctx.save();
  facePath(points);
  ctx.clip();
  ctx.globalAlpha = 0.22 * amount;
  ctx.drawImage(tempCanvas, 0, 0);

  // A very light symmetry suggestion: blend a mirrored half of the face into the original.
  ctx.globalAlpha = 0.055 * amount;
  ctx.translate(bounds.minX + faceW, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(
    canvas,
    bounds.minX,
    bounds.minY,
    faceW * 0.5,
    faceH,
    0,
    bounds.minY,
    faceW * 0.5,
    faceH,
  );
  ctx.restore();

  drawEyeMagnification(points, amount);
  drawSoftFaceHighlights(points, amount);
}

function drawEyeMagnification(points, amount) {
  const eyes = [
    { center: 468, outer: 33, inner: 133, top: 159, bottom: 145 },
    { center: 473, outer: 362, inner: 263, top: 386, bottom: 374 },
  ];

  eyes.forEach((eye) => {
    const center = landmarkPoint(points[eye.center] || points[eye.top]);
    const outer = landmarkPoint(points[eye.outer]);
    const inner = landmarkPoint(points[eye.inner]);
    const top = landmarkPoint(points[eye.top]);
    const bottom = landmarkPoint(points[eye.bottom]);
    const w = Math.max(Math.abs(outer.x - inner.x) * 1.78, 34);
    const h = Math.max(Math.abs(bottom.y - top.y) * 4.2, 28);
    const scale = mix(1, 1.1, amount);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(center.x, center.y, w * 0.44 * scale, h * 0.44 * scale, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.5 * amount;
    ctx.drawImage(
      canvas,
      center.x - w * 0.5,
      center.y - h * 0.5,
      w,
      h,
      center.x - (w * scale) * 0.5,
      center.y - (h * scale) * 0.5,
      w * scale,
      h * scale,
    );
    ctx.restore();
  });
}

function drawSoftFaceHighlights(points, amount) {
  const forehead = landmarkPoint(points[10]);
  const chin = landmarkPoint(points[152]);
  const left = landmarkPoint(points[234]);
  const right = landmarkPoint(points[454]);
  const cx = (left.x + right.x) * 0.5;
  const cy = (forehead.y + chin.y) * 0.48;
  const radiusX = Math.abs(right.x - left.x) * 0.48;
  const radiusY = Math.abs(chin.y - forehead.y) * 0.43;

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(radiusX, radiusY));
  glow.addColorStop(0, `rgba(230, 247, 249, ${0.18 * amount})`);
  glow.addColorStop(0.58, `rgba(176, 205, 212, ${0.06 * amount})`);
  glow.addColorStop(1, "rgba(176, 205, 212, 0)");

  ctx.save();
  facePath(points);
  ctx.clip();
  ctx.fillStyle = glow;
  ctx.fillRect(cx - radiusX, cy - radiusY, radiusX * 2, radiusY * 2);
  ctx.restore();
}

function drawSiliconeMask(points, formAmount, meltAmount, fadeAmount, time) {
  if (formAmount <= 0.01) return;

  const bounds = getFaceBounds(points);
  const leftCheek = landmarkPoint(points[234]);
  const rightCheek = landmarkPoint(points[454]);
  const forehead = landmarkPoint(points[10]);
  const chin = landmarkPoint(points[152]);
  const centerX = (leftCheek.x + rightCheek.x) * 0.5;
  const thickness = smoothstep(0.04, 0.96, formAmount);
  const maskAlpha = thickness * (1 - fadeAmount);
  const featureOpening = mix(1, 0.035, smoothstep(0.18, 0.9, thickness));
  const shellScale = mix(1.005, 1.035, thickness);
  const dropDistance = meltAmount * (bounds.maxY - bounds.minY) * 0.95;

  drawHomogenizedFace(points, bounds, thickness, fadeAmount);

  ctx.save();
  siliconeMaskPath(points, featureOpening, shellScale);
  ctx.clip("evenodd");
  ctx.globalAlpha = maskAlpha;

  const gradient = ctx.createLinearGradient(0, forehead.y, 0, chin.y + dropDistance);
  gradient.addColorStop(0, "rgba(194, 220, 231, 0.58)");
  gradient.addColorStop(0.34, SILICONE.fill);
  gradient.addColorStop(0.72, "rgba(126, 169, 190, 0.5)");
  gradient.addColorStop(1, "rgba(101, 148, 173, 0.42)");
  ctx.fillStyle = gradient;
  ctx.fillRect(bounds.minX - 30, bounds.minY - 30, bounds.maxX - bounds.minX + 60, bounds.maxY - bounds.minY + 70);

  // Translucent volume: a cool center and slightly denser gel around the face rim.
  const volume = ctx.createRadialGradient(
    centerX,
    forehead.y + (chin.y - forehead.y) * 0.42,
    0,
    centerX,
    forehead.y + (chin.y - forehead.y) * 0.46,
    Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * 0.62,
  );
  volume.addColorStop(0, "rgba(225, 241, 247, 0.2)");
  volume.addColorStop(0.58, "rgba(150, 190, 209, 0.12)");
  volume.addColorStop(1, "rgba(68, 119, 146, 0.32)");
  ctx.fillStyle = volume;
  ctx.fillRect(bounds.minX - 30, bounds.minY - 30, bounds.maxX - bounds.minX + 60, bounds.maxY - bounds.minY + 70);

  ctx.globalCompositeOperation = "screen";
  drawGloss(points, maskAlpha, meltAmount, time);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  drawSiliconeEdge(points, maskAlpha, featureOpening, shellScale);
  drawDrips(points, maskAlpha, meltAmount, time, dropDistance);
}

function drawHomogenizedFace(points, bounds, thickness, fadeAmount) {
  if (thickness <= 0.01) return;

  const faceW = bounds.maxX - bounds.minX;
  const faceH = bounds.maxY - bounds.minY;
  const blur = mix(2, 24, thickness);

  tempCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  tempCtx.filter = `blur(${blur}px) saturate(${mix(1, 0.62, thickness)}) contrast(${mix(1, 0.82, thickness)})`;
  drawMirroredVideo(tempCtx);
  tempCtx.filter = "none";

  ctx.save();
  facePath(points);
  ctx.clip();
  ctx.globalAlpha = smoothstep(0.08, 0.9, thickness) * 0.72 * (1 - fadeAmount);
  ctx.drawImage(
    tempCanvas,
    bounds.minX - faceW * 0.08,
    bounds.minY - faceH * 0.06,
    faceW * 1.16,
    faceH * 1.12,
    bounds.minX - faceW * 0.04,
    bounds.minY - faceH * 0.03,
    faceW * 1.08,
    faceH * 1.06,
  );

  // A milky veil progressively suppresses individual skin and feature contrast.
  ctx.globalAlpha = smoothstep(0.24, 1, thickness) * 0.22 * (1 - fadeAmount);
  ctx.fillStyle = "rgb(178, 207, 220)";
  ctx.fillRect(bounds.minX, bounds.minY, faceW, faceH);
  ctx.restore();
}

function drawGloss(points, alpha, meltAmount, time) {
  const a = alpha * (0.94 - meltAmount * 0.2);
  const strokes = [
    [109, 10, 338, 10],
    [127, 168, 197, 9],
    [356, 417, 427, 10],
    [6, 197, 5, 7],
    [58, 172, 136, 8],
    [288, 397, 365, 7],
    [152, 148, 176, 9],
  ];

  ctx.lineCap = "round";
  strokes.forEach((stroke, i) => {
    const shimmer = 0.72 + Math.sin(time * 0.0017 + i * 1.8) * 0.2;
    ctx.strokeStyle = `rgba(247, 253, 255, ${a * shimmer})`;
    ctx.lineWidth = stroke[3] * (canvasWidth / 1440);
    ctx.shadowColor = SILICONE.shine;
    ctx.shadowBlur = stroke[3] * 1.8;
    ctx.beginPath();
    stroke.slice(0, 3).forEach((index, pointIndex) => {
      const point = landmarkPoint(points[index]);
      if (pointIndex === 0) ctx.moveTo(point.x, point.y);
      else ctx.quadraticCurveTo(point.x, point.y, point.x + (pointIndex - 1) * 8, point.y);
    });
    ctx.stroke();
  });

  const forehead = landmarkPoint(points[10]);
  const nose = landmarkPoint(points[4]);
  const cheek = landmarkPoint(points[50]);
  const softSpots = [
    [forehead.x - 18, forehead.y + 54, 32, 18],
    [nose.x - 9, nose.y - 38, 10, 52],
    [cheek.x, cheek.y, 25, 16],
  ];
  softSpots.forEach(([x, y, rx, ry], i) => {
    ctx.fillStyle = `rgba(250, 254, 255, ${a * (0.16 + i * 0.03)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx * (canvasWidth / 1440), ry * (canvasWidth / 1440), -0.25, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawSiliconeEdge(points, alpha, featureOpening, shellScale) {
  ctx.save();
  ctx.globalAlpha = alpha;
  siliconeMaskPath(points, featureOpening, shellScale);
  ctx.strokeStyle = SILICONE.edge;
  ctx.lineWidth = Math.max(1.5, canvasWidth / 720);
  ctx.shadowColor = SILICONE.shadow;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();
}

function drawDrips(points, alpha, meltAmount, time, dropDistance) {
  if (meltAmount <= 0.01) return;

  const anchors = [172, 136, 150, 176, 148, 152, 377, 400, 378, 379, 365, 397];
  ctx.save();
  ctx.globalAlpha = alpha * smoothstep(0.03, 0.42, meltAmount);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  anchors.forEach((index, i) => {
    const p = landmarkPoint(points[index]);
    const wave = Math.sin(time * 0.001 + i * 1.73) * 0.5 + 0.5;
    const stagger = (i % 5) / 5;
    const localMelt = clamp((meltAmount - stagger * 0.16) / 0.84);
    const length = dropDistance * localMelt * mix(0.28, 0.9, wave);
    const width = mix(5, 15, wave) * (canvasWidth / 1440);
    const xDrift = Math.sin(time * 0.0014 + i) * 10 * localMelt;

    if (length < 2) return;

    const grad = ctx.createLinearGradient(p.x, p.y, p.x + xDrift, p.y + length);
    grad.addColorStop(0, "rgba(181, 214, 227, 0.72)");
    grad.addColorStop(0.65, "rgba(131, 176, 198, 0.52)");
    grad.addColorStop(1, "rgba(102, 151, 177, 0.24)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 2);
    ctx.bezierCurveTo(
      p.x + xDrift * 0.4,
      p.y + length * 0.32,
      p.x - xDrift * 0.1,
      p.y + length * 0.7,
      p.x + xDrift,
      p.y + length,
    );
    ctx.stroke();

    ctx.fillStyle = "rgba(205, 232, 241, 0.48)";
    ctx.beginPath();
    ctx.ellipse(p.x + xDrift, p.y + length, width * 0.48, width * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawAtmosphere(time, progress) {
  const pulse = 0.5 + Math.sin(time * 0.0008) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.05 + pulse * 0.035 + progress.silicone * 0.06;
  ctx.fillStyle = "#9ec8d6";
  for (let i = 0; i < 7; i += 1) {
    const y = ((time * 0.012 + i * 173) % canvasHeight) | 0;
    ctx.fillRect(0, y, canvasWidth, Math.max(1, canvasHeight * 0.001));
  }
  ctx.restore();
}

function progressFor(time) {
  const elapsed = (time - streamStartedAt) % LOOP_MS;
  const normal = 1 - smoothstep(1200, 4200, elapsed);
  const beautyIn = smoothstep(3400, 7600, elapsed);
  const siliconeIn = smoothstep(7600, 12400, elapsed);
  const melt = smoothstep(12200, 17700, elapsed);
  const fade = smoothstep(17800, 21400, elapsed);
  const beauty = beautyIn * (1 - smoothstep(10000, 15300, elapsed)) * (1 - fade);
  const silicone = siliconeIn * (1 - fade);

  return { normal, beauty, silicone, melt, fade };
}

async function trackFace(time) {
  if (!faceMesh || trackingBusy || time - lastTrackingAt < TRACKING_INTERVAL_MS) return;

  trackingBusy = true;
  lastTrackingAt = time;
  try {
    await faceMesh.send({ image: video });
  } catch (error) {
    console.warn("Face tracking failed:", error);
  } finally {
    trackingBusy = false;
  }
}

function render(time) {
  resizeCanvas();
  updateCover();

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  drawMirroredVideo();

  const progress = progressFor(time);
  if (lastLandmarks) {
    drawBeautyPass(lastLandmarks, progress.beauty);
    drawSiliconeMask(lastLandmarks, progress.silicone, progress.melt, progress.fade, time);
  }

  drawAtmosphere(time, progress);
  trackFace(time);
  requestAnimationFrame(render);
}

function setupFaceMesh() {
  faceMesh = new FaceMesh({
    locateFile: (file) => `vendor/mediapipe-face-mesh/${file}`,
  });

  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.62,
    minTrackingConfidence: 0.62,
  });

  faceMesh.onResults((results) => {
    lastLandmarks = results.multiFaceLandmarks?.[0] || null;
    if (lastLandmarks) setStatus("Gesicht erkannt");
    else setStatus("Suche Gesicht");
  });
}

async function startInstallation() {
  startButton.disabled = true;
  setStatus("Kamera wird gestartet");

  if (typeof FaceMesh === "undefined") {
    setStatus("FaceMesh konnte nicht geladen werden. Bitte lokale Projektdateien pruefen.");
    startButton.disabled = false;
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: "user",
      },
      audio: false,
    });

    video.srcObject = stream;
    await video.play();

    setupFaceMesh();
    streamStartedAt = performance.now();
    startPanel.classList.add("is-hidden");
    setStatus("Suche Gesicht");
    requestAnimationFrame(render);
  } catch (error) {
    console.error(error);
    setStatus("Kamera nicht verfuegbar oder Berechtigung abgelehnt.");
    startButton.disabled = false;
  }
}

window.addEventListener("resize", resizeCanvas);
startButton.addEventListener("click", startInstallation);
resizeCanvas();
