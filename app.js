/**
 * HandPuzzle — app.js
 * Real-time gesture-controlled jigsaw puzzle using MediaPipe Hands
 *
 * Architecture:
 *  - HandTracker   → MediaPipe pipeline, pinch detection
 *  - PuzzlePiece   → Individual piece state & collision detection
 *  - PuzzleBoard   → Piece grid generation, render loop, snap logic
 *  - UIController  → DOM updates, controls, status, toast
 *  - App           → Top-level orchestration
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const PINCH_THRESHOLD   = 0.065;  // Normalised landmark distance for pinch detection
const SNAP_THRESHOLD    = 40;     // Pixels - how close to correct slot triggers snap
const LERP_FACTOR       = 0.18;   // Smoothing factor for piece movement (0–1)
const PIECE_BORDER      = 3;      // Pixels gap between pieces on board
const TARGET_ALPHA      = 0.25;   // Opacity of the "ghost" slot outline
const PIECE_SHADOW      = 12;     // Drop-shadow blur for dragging piece

// Built-in gradient image generators (canvas-painted, no external images needed)
const BUILT_IN_IMAGES = {
  1: { label: 'Mountain', draw: drawMountain },
  2: { label: 'Sunset',   draw: drawSunset   },
  3: { label: 'Ocean',    draw: drawOcean    },
};

/* ═══════════════════════════════════════════════════════════
   BUILT-IN IMAGE PAINTERS
   Canvas-painted scenes - no external image dependencies
═══════════════════════════════════════════════════════════ */

function drawMountain(ctx, w, h) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.65);
  sky.addColorStop(0, '#1a1060');
  sky.addColorStop(0.5, '#3d5afc');
  sky.addColorStop(1, '#7fd6f5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 80; i++) {
    const sx = Math.random() * w;
    const sy = Math.random() * h * 0.4;
    const sr = Math.random() * 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
  }

  // Background mountains (dark blue)
  ctx.fillStyle = '#1e2a8a';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.7);
  ctx.lineTo(w * 0.15, h * 0.35);
  ctx.lineTo(w * 0.3, h * 0.55);
  ctx.lineTo(w * 0.45, h * 0.28);
  ctx.lineTo(w * 0.65, h * 0.52);
  ctx.lineTo(w * 0.8, h * 0.32);
  ctx.lineTo(w, h * 0.5);
  ctx.lineTo(w, h * 0.7);
  ctx.closePath(); ctx.fill();

  // Foreground mountain
  const mtn = ctx.createLinearGradient(0, h * 0.15, 0, h * 0.7);
  mtn.addColorStop(0, '#ecf0f1');
  mtn.addColorStop(0.35, '#bdc3c7');
  mtn.addColorStop(1, '#526170');
  ctx.fillStyle = mtn;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w * 0.2, h * 0.7);
  ctx.lineTo(w * 0.5, h * 0.17);
  ctx.lineTo(w * 0.8, h * 0.7);
  ctx.lineTo(w, h);
  ctx.closePath(); ctx.fill();

  // Snow cap
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.17);
  ctx.lineTo(w * 0.4, h * 0.38);
  ctx.lineTo(w * 0.6, h * 0.38);
  ctx.closePath(); ctx.fill();

  // Ground / pine trees silhouette
  ctx.fillStyle = '#1a2e1a';
  ctx.fillRect(0, h * 0.82, w, h * 0.18);
  for (let i = 0; i < 14; i++) {
    const tx = (w / 14) * i + (w / 28);
    const th = h * 0.12 + Math.random() * h * 0.06;
    ctx.beginPath();
    ctx.moveTo(tx, h * 0.82 - th);
    ctx.lineTo(tx - w * 0.025, h * 0.82);
    ctx.lineTo(tx + w * 0.025, h * 0.82);
    ctx.closePath(); ctx.fill();
  }
}

function drawSunset(ctx, w, h) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0f0c29');
  sky.addColorStop(0.4, '#302b63');
  sky.addColorStop(0.65, '#d4445e');
  sky.addColorStop(0.8, '#f97316');
  sky.addColorStop(1, '#fbbf24');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Sun
  const sunGrad = ctx.createRadialGradient(w * 0.5, h * 0.58, 0, w * 0.5, h * 0.58, w * 0.12);
  sunGrad.addColorStop(0, '#fff7ed');
  sunGrad.addColorStop(0.5, '#fde68a');
  sunGrad.addColorStop(1, 'rgba(251,191,36,0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, w, h);

  // Sun disk
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.58, w * 0.055, 0, Math.PI * 2);
  ctx.fill();

  // Clouds
  function cloud(cx, cy, size) {
    ctx.fillStyle = 'rgba(255,180,100,0.45)';
    [[0,0,1],[-.7,0.3,.7],[.7,0.2,.7],[-.4,-.4,.5],[.4,-.35,.55]].forEach(([dx, dy, sc]) => {
      ctx.beginPath();
      ctx.arc(cx + dx * size, cy + dy * size, size * sc, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  cloud(w * 0.18, h * 0.32, 35);
  cloud(w * 0.78, h * 0.28, 28);
  cloud(w * 0.55, h * 0.22, 20);

  // Ocean
  const ocean = ctx.createLinearGradient(0, h * 0.6, 0, h);
  ocean.addColorStop(0, '#1e3a5f');
  ocean.addColorStop(1, '#0a1929');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);

  // Sun reflection on water
  const ref = ctx.createLinearGradient(w * 0.3, h * 0.6, w * 0.7, h);
  ref.addColorStop(0, 'rgba(253,230,138,0.4)');
  ref.addColorStop(1, 'rgba(253,230,138,0)');
  ctx.fillStyle = ref;
  ctx.beginPath();
  ctx.moveTo(w * 0.45, h * 0.6);
  ctx.lineTo(w * 0.35, h);
  ctx.lineTo(w * 0.65, h);
  ctx.lineTo(w * 0.55, h * 0.6);
  ctx.closePath(); ctx.fill();

  // Horizon line
  ctx.strokeStyle = 'rgba(255,200,100,0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.6);
  ctx.lineTo(w, h * 0.6);
  ctx.stroke();
}

function drawOcean(ctx, w, h) {
  // Deep sea background
  const sea = ctx.createLinearGradient(0, 0, 0, h);
  sea.addColorStop(0, '#006994');
  sea.addColorStop(0.4, '#004a6f');
  sea.addColorStop(1, '#001a2e');
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, w, h);

  // Light rays from surface
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const rx = (w / 8) * i + w * 0.06;
    const grad = ctx.createLinearGradient(rx, 0, rx + w * 0.04, h * 0.7);
    grad.addColorStop(0, 'rgba(100,220,255,0.18)');
    grad.addColorStop(1, 'rgba(100,220,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(rx - w * 0.02, 0);
    ctx.lineTo(rx + w * 0.02, 0);
    ctx.lineTo(rx + w * 0.06, h * 0.7);
    ctx.lineTo(rx - w * 0.02, h * 0.7);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // Coral reef floor
  ctx.fillStyle = '#7c3a1e';
  ctx.fillRect(0, h * 0.8, w, h * 0.2);

  // Corals
  function coral(cx, cy, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    const branches = [[0,-1],[-.3,-.9],[.3,-.9],[-.5,-.7],[.5,-.7]];
    branches.forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + dx * 20, cy + dy * 30);
      ctx.stroke();
      // Tips
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx + dx * 20, cy + dy * 30, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  coral(w * 0.1, h * 0.82, '#ff6b6b');
  coral(w * 0.3, h * 0.85, '#ffd93d');
  coral(w * 0.55, h * 0.80, '#ff6b9d');
  coral(w * 0.75, h * 0.84, '#6bcfff');
  coral(w * 0.9, h * 0.81, '#ff6b6b');

  // Fish
  function fish(fx, fy, color, size = 1) {
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.beginPath();
    ctx.ellipse(0, 0, 18 * size, 9 * size, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tail
    ctx.beginPath();
    ctx.moveTo(-14 * size, 0);
    ctx.lineTo(-22 * size, -8 * size);
    ctx.lineTo(-22 * size, 8 * size);
    ctx.closePath(); ctx.fill();
    // Eye
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(10 * size, -2 * size, 3 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(11 * size, -2 * size, 1.5 * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  fish(w * 0.2, h * 0.3, '#ff8c42');
  fish(w * 0.6, h * 0.45, '#ffdd00', 0.8);
  fish(w * 0.75, h * 0.25, '#4ecdc4', 1.2);
  fish(w * 0.4, h * 0.6, '#ff6b6b', 0.7);

  // Bubbles
  ctx.strokeStyle = 'rgba(150,230,255,0.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 20; i++) {
    const bx = Math.random() * w;
    const by = Math.random() * h * 0.7;
    const br = 2 + Math.random() * 6;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ═══════════════════════════════════════════════════════════
   PUZZLE PIECE CLASS
═══════════════════════════════════════════════════════════ */
class PuzzlePiece {
  /**
   * @param {object} opts
   * @param {number} opts.id         - Unique index
   * @param {number} opts.col        - Column in grid
   * @param {number} opts.row        - Row in grid
   * @param {number} opts.gridN      - Grid size (N×N)
   * @param {number} opts.srcX       - Source x on full image
   * @param {number} opts.srcY       - Source y on full image
   * @param {number} opts.srcW       - Source width on full image
   * @param {number} opts.srcH       - Source height on full image
   * @param {number} opts.x          - Current board x position
   * @param {number} opts.y          - Current board y position
   * @param {number} opts.width      - Rendered width
   * @param {number} opts.height     - Rendered height
   * @param {number} opts.targetX    - Correct board x position
   * @param {number} opts.targetY    - Correct board y position
   * @param {ImageBitmap} opts.image - Source image bitmap
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.isDragging  = false;
    this.isLocked    = false;
    // Smooth movement targets
    this._renderX    = opts.x;
    this._renderY    = opts.y;
  }

  /** Returns true if the given point is inside this piece's bounding box */
  containsPoint(px, py) {
    return (
      px >= this._renderX &&
      px <= this._renderX + this.width &&
      py >= this._renderY &&
      py <= this._renderY + this.height
    );
  }

  /** Lerp render position toward logical position */
  updateRenderPos() {
    this._renderX += (this.x - this._renderX) * LERP_FACTOR;
    this._renderY += (this.y - this._renderY) * LERP_FACTOR;
  }

  /** How close (px) is the piece to its correct slot? */
  distanceToTarget() {
    const dx = this.x + this.width  / 2 - (this.targetX + this.width  / 2);
    const dy = this.y + this.height / 2 - (this.targetY + this.height / 2);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Snap the piece to its target slot */
  snapToTarget() {
    this.x = this.targetX;
    this.y = this.targetY;
    this._renderX = this.targetX;
    this._renderY = this.targetY;
    this.isLocked    = true;
    this.isDragging  = false;
  }

  /**
   * Draw this piece onto a canvas context
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement}        srcCanvas  - The full puzzle image canvas
   * @param {boolean}                  showTarget - Whether to draw ghost slot
   */
  draw(ctx, srcCanvas, showTarget) {
    const rx = this._renderX;
    const ry = this._renderY;

    // Draw ghost target slot
    if (showTarget && !this.isLocked) {
      ctx.save();
      ctx.globalAlpha = TARGET_ALPHA;
      ctx.strokeStyle = '#6a90fd';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(
        this.targetX + 2,
        this.targetY + 2,
        this.width - 4,
        this.height - 4
      );
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#6a90fd';
      ctx.fillRect(this.targetX, this.targetY, this.width, this.height);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    if (this.isLocked) {
      // Locked: draw with a subtle green border
      ctx.save();
      ctx.shadowColor = 'rgba(34,197,94,0.4)';
      ctx.shadowBlur  = 8;
      ctx.drawImage(
        srcCanvas,
        this.srcX, this.srcY, this.srcW, this.srcH,
        rx, ry, this.width, this.height
      );
      ctx.restore();

      // Green lock border
      ctx.save();
      ctx.strokeStyle = 'rgba(34,197,94,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx + 1, ry + 1, this.width - 2, this.height - 2);
      ctx.restore();
    } else if (this.isDragging) {
      // Dragging: elevated with shadow
      ctx.save();
      ctx.shadowColor = 'rgba(106,144,253,0.5)';
      ctx.shadowBlur  = PIECE_SHADOW;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(
        srcCanvas,
        this.srcX, this.srcY, this.srcW, this.srcH,
        rx, ry, this.width, this.height
      );
      ctx.restore();

      // Blue drag border
      ctx.save();
      ctx.strokeStyle = '#6a90fd';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(rx + 1, ry + 1, this.width - 2, this.height - 2);
      ctx.restore();
    } else {
      // Idle piece
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur  = 6;
      ctx.drawImage(
        srcCanvas,
        this.srcX, this.srcY, this.srcW, this.srcH,
        rx, ry, this.width, this.height
      );
      ctx.restore();

      // Subtle border
      ctx.save();
      ctx.strokeStyle = 'rgba(48,54,61,0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, this.width, this.height);
      ctx.restore();
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   PUZZLE BOARD
═══════════════════════════════════════════════════════════ */
class PuzzleBoard {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.pieces  = [];
    this.gridN   = 2;
    this.srcCanvas = null;  // Offscreen canvas with the full image
    this.showTargets = false;
    this.onPieceSnapped = null;
    this.onComplete     = null;
  }

  /** Load and paint a built-in or custom image then generate pieces */
  async loadImage(drawFn) {
    const size = 600;
    const src  = document.createElement('canvas');
    src.width  = size;
    src.height = size;
    const sctx = src.getContext('2d');

    if (typeof drawFn === 'function') {
      drawFn(sctx, size, size);
    } else if (drawFn instanceof HTMLImageElement || drawFn instanceof ImageBitmap) {
      sctx.drawImage(drawFn, 0, 0, size, size);
    }
    this.srcCanvas = src;
    this.generatePieces();
  }

  /** Split srcCanvas into N×N puzzle pieces, shuffle positions */
  generatePieces() {
    const N        = this.gridN;
    const boardW   = this.canvas.width;
    const boardH   = this.canvas.height;
    const pieceW   = Math.floor(boardW / N);
    const pieceH   = Math.floor(boardH / N);
    const srcSize  = this.srcCanvas.width;
    const srcPieceW = Math.floor(srcSize / N);
    const srcPieceH = Math.floor(srcSize / N);

    this.pieces = [];

    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const id      = row * N + col;
        const targetX = col * pieceW + PIECE_BORDER;
        const targetY = row * pieceH + PIECE_BORDER;
        const w       = pieceW - PIECE_BORDER * 2;
        const h       = pieceH - PIECE_BORDER * 2;

        // Random starting position (scattered across board)
        const randX = PIECE_BORDER + Math.random() * (boardW - w - PIECE_BORDER * 2);
        const randY = PIECE_BORDER + Math.random() * (boardH - h - PIECE_BORDER * 2);

        this.pieces.push(new PuzzlePiece({
          id,
          col, row,
          gridN: N,
          srcX: col * srcPieceW,
          srcY: row * srcPieceH,
          srcW: srcPieceW,
          srcH: srcPieceH,
          x: randX,
          y: randY,
          width:   w,
          height:  h,
          targetX: targetX + PIECE_BORDER,
          targetY: targetY + PIECE_BORDER,
        }));
      }
    }
  }

  /** Shuffle (re-randomise) current pieces */
  shuffle() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    for (const p of this.pieces) {
      if (!p.isLocked) {
        p.x = PIECE_BORDER + Math.random() * (W - p.width  - PIECE_BORDER * 2);
        p.y = PIECE_BORDER + Math.random() * (H - p.height - PIECE_BORDER * 2);
        p._renderX = p.x;
        p._renderY = p.y;
      }
    }
  }

  /** Reset all pieces to locked (preview mode) */
  previewSolve() {
    for (const p of this.pieces) {
      p.x = p.targetX;
      p.y = p.targetY;
      p._renderX = p.targetX;
      p._renderY = p.targetY;
    }
  }

  /**
   * Try to grab a piece at board coordinates (bx, by).
   * Returns the grabbed piece or null.
   */
  tryGrab(bx, by) {
    // Check pieces in reverse order (top-most first)
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i];
      if (!p.isLocked && p.containsPoint(bx, by)) {
        p.isDragging = true;
        // Move to end of array so it renders on top
        this.pieces.splice(i, 1);
        this.pieces.push(p);
        return p;
      }
    }
    return null;
  }

  /** Move the dragged piece to (bx, by), centred on the pinch point */
  moveDragged(piece, bx, by) {
    piece.x = bx - piece.width  / 2;
    piece.y = by - piece.height / 2;
  }

  /**
   * Release the dragged piece.
   * If it's within SNAP_THRESHOLD of target, snap it.
   */
  release(piece) {
    piece.isDragging = false;
    if (piece.distanceToTarget() < SNAP_THRESHOLD) {
      piece.snapToTarget();
      if (this.onPieceSnapped) this.onPieceSnapped(piece);
      if (this.isComplete() && this.onComplete) this.onComplete();
    }
  }

  /** True if all pieces are locked */
  isComplete() {
    return this.pieces.every(p => p.isLocked);
  }

  /** Count locked pieces */
  lockedCount() {
    return this.pieces.filter(p => p.isLocked).length;
  }

  /** Render one frame */
  render() {
    const ctx = this.ctx;
    const W   = this.canvas.width;
    const H   = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (!this.srcCanvas) return;

    // Update smooth positions and draw each piece
    for (const piece of this.pieces) {
      piece.updateRenderPos();
      piece.draw(ctx, this.srcCanvas, this.showTargets);
    }
  }

  /** Resize canvas to fit its container */
  resize(width, height) {
    this.canvas.width  = width;
    this.canvas.height = height;
  }
}

/* ═══════════════════════════════════════════════════════════
   HAND TRACKER  (MediaPipe Hands)
═══════════════════════════════════════════════════════════ */
class HandTracker {
  constructor(videoEl, overlayCanvas) {
    this.video         = videoEl;
    this.overlayCanvas = overlayCanvas;
    this.overlayCtx    = overlayCanvas.getContext('2d');
    this.hands         = null;
    this.camera        = null;

    // Current state (set on each MediaPipe results callback)
    this.currentLandmarks  = null;
    this.isPinching_       = false;
    this.pinchX            = 0;   // Pixel coords in overlay space
    this.pinchY            = 0;
    this.pinchDist         = 1;

    // Callbacks set by App
    this.onHandDetected   = null;
    this.onHandLost       = null;
    this.onPinchStart     = null;
    this.onPinchEnd       = null;
    this.onPinchMove      = null;
  }

  /** Calculate Euclidean distance between two normalised landmarks */
  static euclidean(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Determine if landmarks represent a pinch gesture.
   * Uses landmark 4 (thumb tip) and landmark 8 (index tip).
   */
  isPinching(landmarks) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const dist     = HandTracker.euclidean(thumbTip, indexTip);
    this.pinchDist = dist;
    return dist < PINCH_THRESHOLD;
  }

  /** Convert normalised [0–1] coords to canvas pixel coords */
  toPixel(normX, normY, canvasW, canvasH) {
    // Video is mirrored with CSS, so we mirror x
    return {
      x: (1 - normX) * canvasW,
      y: normY * canvasH,
    };
  }

  /** Initialise MediaPipe Hands and webcam */
  async init() {
    // Wait for MediaPipe to be available globally
    await this._waitForMediaPipe();

    this.hands = new window.Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    this.hands.setOptions({
      maxNumHands:            1,
      modelComplexity:        1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence:  0.7,
    });

    this.hands.onResults((results) => this._onResults(results));

    // Start Camera utility
    this.camera = new window.Camera(this.video, {
      onFrame: async () => {
        await this.hands.send({ image: this.video });
      },
      width:  640,
      height: 480,
    });

    await this.camera.start();
  }

  _waitForMediaPipe() {
    return new Promise((resolve) => {
      const check = () => {
        if (window.Hands && window.Camera && window.drawConnectors) {
          resolve();
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  _onResults(results) {
    const canvas = this.overlayCanvas;
    const ctx    = this.overlayCtx;
    const W      = canvas.width;
    const H      = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.currentLandmarks = null;
      const wasTracking = this.isPinching_;
      this.isPinching_  = false;
      if (wasTracking && this.onPinchEnd) this.onPinchEnd();
      if (this.onHandLost) this.onHandLost();
      return;
    }

    const landmarks = results.multiHandLandmarks[0];
    this.currentLandmarks = landmarks;

    // Draw hand landmarks
    if (window.drawConnectors && window.HAND_CONNECTIONS) {
      window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
        color: 'rgba(106,144,253,0.6)',
        lineWidth: 2,
      });
    }
    if (window.drawLandmarks) {
      window.drawLandmarks(ctx, landmarks, {
        color: '#4166f5',
        fillColor: 'rgba(106,144,253,0.8)',
        lineWidth: 1,
        radius: 4,
      });
    }

    // Pinch check
    const pinching = this.isPinching(landmarks);
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const midX     = (thumbTip.x + indexTip.x) / 2;
    const midY     = (thumbTip.y + indexTip.y) / 2;
    const px       = this.toPixel(midX, midY, W, H);
    this.pinchX    = px.x;
    this.pinchY    = px.y;

    // Highlight fingertip landmarks
    ctx.save();
    ctx.fillStyle = pinching ? '#f59e0b' : '#4ade80';
    for (const lm of [thumbTip, indexTip]) {
      const p = this.toPixel(lm.x, lm.y, W, H);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Draw line between thumb and index
    const thumbPx = this.toPixel(thumbTip.x, thumbTip.y, W, H);
    const indexPx = this.toPixel(indexTip.x, indexTip.y, W, H);
    ctx.save();
    ctx.strokeStyle = pinching ? '#f59e0b' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth   = pinching ? 3 : 1.5;
    ctx.setLineDash(pinching ? [] : [4, 3]);
    ctx.beginPath();
    ctx.moveTo(thumbPx.x, thumbPx.y);
    ctx.lineTo(indexPx.x, indexPx.y);
    ctx.stroke();
    ctx.restore();

    // Callbacks
    if (this.onHandDetected) this.onHandDetected(landmarks);

    if (pinching && !this.isPinching_) {
      this.isPinching_ = true;
      if (this.onPinchStart) this.onPinchStart(px.x, px.y);
    } else if (!pinching && this.isPinching_) {
      this.isPinching_ = false;
      if (this.onPinchEnd) this.onPinchEnd();
    } else if (pinching && this.isPinching_) {
      if (this.onPinchMove) this.onPinchMove(px.x, px.y);
    }
  }

  stop() {
    if (this.camera) this.camera.stop();
  }
}

/* ═══════════════════════════════════════════════════════════
   UI CONTROLLER
═══════════════════════════════════════════════════════════ */
class UIController {
  constructor() {
    this.$statusPill   = document.getElementById('status-pill');
    this.$statusText   = document.getElementById('status-text');
    this.$fpsCounter   = document.getElementById('fps-counter');
    this.$progressFill = document.getElementById('progress-fill');
    this.$progressLabel= document.getElementById('progress-label');
    this.$lockedBadge  = document.getElementById('locked-badge');
    this.$infoHand     = document.getElementById('info-hand-text');
    this.$infoPinch    = document.getElementById('info-pinch-text');
    this.$infoPiece    = document.getElementById('info-piece-text');
    this.$toast        = document.getElementById('toast');
    this.$toastIcon    = document.getElementById('toast-icon');
    this.$toastText    = document.getElementById('toast-text');
    this.$pinchIndicator = document.getElementById('pinch-indicator');
    this.$camPlaceholder = document.getElementById('cam-placeholder');
    this.$completionOverlay = document.getElementById('completion-overlay');
    this._toastTimer   = null;
  }

  setStatus(state, text) {
    const pill = this.$statusPill;
    pill.className = `status-pill status-${state}`;
    this.$statusText.textContent = text;
  }

  setFPS(fps) {
    this.$fpsCounter.textContent = fps;
  }

  setProgress(locked, total) {
    const pct = total > 0 ? (locked / total) * 100 : 0;
    this.$progressFill.style.width = pct + '%';
    this.$progressLabel.textContent = `${locked} / ${total} pieces`;
    this.$lockedBadge.textContent   = `${locked} locked`;
  }

  setHandInfo({ hand, pinch, piece }) {
    if (hand  !== undefined) this.$infoHand.textContent  = hand;
    if (pinch !== undefined) this.$infoPinch.textContent = pinch;
    if (piece !== undefined) this.$infoPiece.textContent = piece;
  }

  showPinchIndicator(x, y) {
    const el = this.$pinchIndicator;
    el.classList.remove('hidden');
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
  }

  hidePinchIndicator() {
    this.$pinchIndicator.classList.add('hidden');
  }

  hideCameraPlaceholder() {
    this.$camPlaceholder.classList.add('hidden');
  }

  showCompletionOverlay() {
    this.$completionOverlay.classList.remove('hidden');
  }

  hideCompletionOverlay() {
    this.$completionOverlay.classList.add('hidden');
  }

  toast(icon, text, duration = 3000) {
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this.$toastIcon.textContent = icon;
    this.$toastText.textContent = text;
    this.$toast.classList.remove('hidden');
    this._toastTimer = setTimeout(() => {
      this.$toast.classList.add('hidden');
    }, duration);
  }
}

/* ═══════════════════════════════════════════════════════════
   APP — Top-level Orchestration
═══════════════════════════════════════════════════════════ */
class App {
  constructor() {
    // DOM elements
    this.videoEl         = document.getElementById('video');
    this.landmarkCanvas  = document.getElementById('landmark-canvas');
    this.puzzleCanvas    = document.getElementById('puzzle-canvas');
    this.puzzleWrapper   = document.getElementById('puzzle-wrapper');

    // Subsystems
    this.ui      = new UIController();
    this.tracker = new HandTracker(this.videoEl, this.landmarkCanvas);
    this.board   = new PuzzleBoard(this.puzzleCanvas);

    // App state
    this.currentGridN   = 2;
    this.currentImageId = 1;
    this.activePiece    = null;
    this.isPreviewMode  = false;

    // RAF / FPS tracking
    this._rafId       = null;
    this._lastFrame   = 0;
    this._frameCount  = 0;
    this._fpsTimer    = 0;
    this._fps         = 0;

    this._init();
  }

  async _init() {
    this._setupBoardSize();
    this._bindControls();
    this._bindTrackerCallbacks();

    // Board callbacks
    this.board.onPieceSnapped = (piece) => {
      const locked = this.board.lockedCount();
      const total  = this.board.pieces.length;
      this.ui.setProgress(locked, total);
      this.ui.toast('✅', `Piece ${piece.id + 1} locked! (${locked}/${total})`);
      this.ui.setStatus('active', `${locked}/${total} pieces locked`);
    };
    this.board.onComplete = () => {
      this.ui.showCompletionOverlay();
      this.ui.setStatus('active', 'Puzzle complete!');
      this.ui.toast('🎉', 'You solved the puzzle with your hands!', 5000);
    };

    // Load initial image and start
    await this._loadAndStartGame();

    // Start render loop
    this._rafId = requestAnimationFrame((ts) => this._loop(ts));

    // Start camera with a slight delay for DOM settle
    setTimeout(() => this._startCamera(), 300);
  }

  _setupBoardSize() {
    const wrapper = this.puzzleWrapper;
    const w = wrapper.clientWidth  || 500;
    const h = wrapper.clientHeight || 500;
    const size = Math.min(w, h, 560);
    this.board.resize(size, size);
    this.puzzleCanvas.style.width  = size + 'px';
    this.puzzleCanvas.style.height = size + 'px';
  }

  async _loadAndStartGame() {
    this.ui.hideCompletionOverlay();
    this.board.gridN = this.currentGridN;

    const imgDef = BUILT_IN_IMAGES[this.currentImageId];
    if (imgDef) {
      await this.board.loadImage(imgDef.draw);
    }

    const total = this.board.pieces.length;
    this.ui.setProgress(0, total);
    this.ui.toast('🧩', `${total}-piece puzzle started. Use pinch to drag!`);
    this.ui.setStatus('active', 'Camera active — show your hand');
  }

  async _startCamera() {
    this.ui.setStatus('idle', 'Starting camera…');
    try {
      await this.tracker.init();
      this.ui.hideCameraPlaceholder();
      this.ui.setStatus('active', 'Camera active — show your hand');
      this.ui.toast('📷', 'Camera ready! Show your hand to start.');

      // Sync overlay canvas size with video
      this.videoEl.addEventListener('loadedmetadata', () => {
        this.landmarkCanvas.width  = this.videoEl.videoWidth  || 640;
        this.landmarkCanvas.height = this.videoEl.videoHeight || 480;
      });
    } catch (err) {
      console.error('Camera error:', err);
      this.ui.setStatus('idle', 'Camera permission denied');
      this.ui.toast('❌', 'Camera access denied. Click "Enable Camera" to retry.');
    }
  }

  _bindTrackerCallbacks() {
    this.tracker.onHandDetected = (landmarks) => {
      this.ui.setStatus('hand', 'Hand detected');
      this.ui.setHandInfo({ hand: 'Detected' });
    };

    this.tracker.onHandLost = () => {
      if (this.activePiece) {
        this.board.release(this.activePiece);
        this.activePiece = null;
      }
      this.ui.setStatus('active', 'No hand — show your hand');
      this.ui.setHandInfo({ hand: 'None', pinch: 'Open', piece: 'None' });
      this.ui.hidePinchIndicator();
    };

    this.tracker.onPinchStart = (px, py) => {
      // Map overlay coords → puzzle board coords
      const { bx, by } = this._overlayToBoardCoords(px, py);
      this.activePiece  = this.board.tryGrab(bx, by);
      this.ui.setStatus('pinch', this.activePiece ? 'Grabbing piece!' : 'Pinching');
      this.ui.setHandInfo({
        pinch: 'Pinching',
        piece: this.activePiece ? `Piece #${this.activePiece.id + 1}` : 'None',
      });
      this.ui.showPinchIndicator(px, py);
    };

    this.tracker.onPinchMove = (px, py) => {
      this.ui.showPinchIndicator(px, py);
      if (this.activePiece) {
        const { bx, by } = this._overlayToBoardCoords(px, py);
        this.board.moveDragged(this.activePiece, bx, by);
      }
    };

    this.tracker.onPinchEnd = () => {
      if (this.activePiece) {
        this.board.release(this.activePiece);
        this.activePiece = null;
      }
      this.ui.setStatus('hand', 'Hand detected');
      this.ui.setHandInfo({ pinch: 'Open', piece: 'None' });
      this.ui.hidePinchIndicator();
    };
  }

  /**
   * Convert overlay canvas coordinates (px, py) to puzzle board canvas coords.
   * The overlay is the camera feed dimensions, the board is its own canvas size.
   */
  _overlayToBoardCoords(px, py) {
    const oc = this.landmarkCanvas;
    const pc = this.puzzleCanvas;
    const pcrect = pc.getBoundingClientRect();
    const ocrect = this.videoEl.getBoundingClientRect();

    // Normalise to [0,1] in overlay space
    const nx = px / (oc.width  || 640);
    const ny = py / (oc.height || 480);

    // Scale to puzzle canvas
    const bx = nx * pc.width;
    const by = ny * pc.height;
    return { bx, by };
  }

  _bindControls() {
    // Grid size buttons
    document.querySelectorAll('.grid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.grid-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentGridN = parseInt(btn.dataset.grid, 10);
        this._loadAndStartGame();
      });
    });

    // Image buttons
    document.querySelectorAll('.img-btn[data-img]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.img-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentImageId = parseInt(btn.dataset.img, 10);
        this._loadAndStartGame();
      });
    });

    // File upload
    document.getElementById('img-upload').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          this.currentImageId = null; // custom
          document.querySelectorAll('.img-btn').forEach(b => b.classList.remove('active'));
          this.board.gridN = this.currentGridN;
          this.board.loadImage(img).then(() => {
            const total = this.board.pieces.length;
            this.ui.hideCompletionOverlay();
            this.ui.setProgress(0, total);
            this.ui.toast('📷', 'Custom image loaded!');
          });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    // Shuffle
    document.getElementById('btn-shuffle').addEventListener('click', () => {
      this.board.shuffle();
      this.ui.toast('🔀', 'Pieces shuffled!');
    });

    // Preview toggle
    document.getElementById('btn-preview').addEventListener('click', () => {
      this.isPreviewMode = !this.isPreviewMode;
      this.board.showTargets = this.isPreviewMode;
      document.getElementById('btn-preview').textContent =
        this.isPreviewMode ? 'Hide Hints' : 'Preview';
    });

    // New Game (from completion overlay)
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this._loadAndStartGame();
    });

    // Enable Camera button
    document.getElementById('btn-start-cam').addEventListener('click', () => {
      this._startCamera();
    });

    // Resize handler
    window.addEventListener('resize', () => {
      this._setupBoardSize();
    });
  }

  /** Main render loop — requestAnimationFrame */
  _loop(timestamp) {
    // FPS tracking
    this._frameCount++;
    const elapsed = timestamp - this._fpsTimer;
    if (elapsed >= 1000) {
      this._fps = Math.round(this._frameCount * 1000 / elapsed);
      this.ui.setFPS(this._fps);
      this._frameCount = 0;
      this._fpsTimer   = timestamp;
    }

    // Render puzzle board
    this.board.render();

    this._rafId = requestAnimationFrame((ts) => this._loop(ts));
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this.tracker.stop();
  }
}

/* ═══════════════════════════════════════════════════════════
   BOOTSTRAP
═══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  window._app = new App();
});
