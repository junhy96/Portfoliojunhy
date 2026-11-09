/**
 * MorphStage — WebGL 이미지 모핑 전환
 *
 * 두 이미지를 노이즈 기반 변위(displacement)로 휘게 만들면서
 * 유기적인 경계로 녹아들듯 교차시킵니다. 전환 도중 새 이미지를 요청하면
 * 현재 화면을 스냅샷으로 떠서 끊김 없이 다음 모핑으로 이어집니다.
 * 모든 이미지는 셰이더에서 모노톤으로 색보정(+비네팅, 필름 그레인)됩니다.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform vec2 uRes;
uniform vec2 uSize0;
uniform vec2 uSize1;
uniform float uFocus0;
uniform float uFocus1;
uniform float uSnap0;
uniform float uProgress;
uniform float uTime;
uniform vec2 uMouse;
uniform float uGrade;
uniform float uMotion;
uniform float uStrength;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
vec2 cover(vec2 uv, vec2 size, float focus) {
  float rs = uRes.x / uRes.y;
  float ri = size.x / size.y;
  vec2 s = rs < ri ? vec2(rs / ri, 1.0) : vec2(1.0, ri / rs);
  return uv * s + (1.0 - s) * vec2(focus, 0.5);
}

void main() {
  vec2 uv = vUv;
  float p = uProgress;
  float t = uTime * uMotion;
  vec2 par = (uMouse - 0.5) * 0.014 * uMotion;

  // 흐름장(flow field): 모핑 시 픽셀이 흘러가는 방향
  vec2 flow = vec2(
    fbm(uv * 2.2 + vec2(1.7, 9.2) + t * 0.035),
    fbm(uv * 2.2 + vec2(8.3, 2.8) - t * 0.035)
  ) - 0.5;
  float n = fbm(uv * 2.6 + flow * 1.6 + t * 0.02);

  float w = uStrength;
  float bell = sin(p * 3.14159265);
  vec2 ua = uv + flow * p * w;
  vec2 ub = uv - flow * (1.0 - p) * w;
  ua = (ua - 0.5) * (1.0 - 0.06 * p) + 0.5;
  ub = (ub - 0.5) * (1.0 + 0.06 * (1.0 - p)) + 0.5;

  float z = 1.0 - 0.02 * uMotion;
  vec2 ta = uSnap0 > 0.5 ? ua : cover((ua - 0.5) * z + 0.5 + par, uSize0, uFocus0);
  vec2 tb = cover((ub - 0.5) * z + 0.5 + par, uSize1, uFocus1);

  // 전환 중 살짝 번지는 느낌 (가로 방향 3탭 블러)
  float blur = bell * 0.004;
  vec3 a = (texture2D(uTex0, ta).rgb * 2.0 + texture2D(uTex0, ta + vec2(blur, 0.0)).rgb + texture2D(uTex0, ta - vec2(blur, 0.0)).rgb) * 0.25;
  vec3 b = (texture2D(uTex1, tb).rgb * 2.0 + texture2D(uTex1, tb + vec2(blur, 0.0)).rgb + texture2D(uTex1, tb - vec2(blur, 0.0)).rgb) * 0.25;

  float edge = p * 1.6 - 0.3;
  float m = smoothstep(n - 0.17, n + 0.17, edge);
  vec3 col = mix(a, b, m);
  col += (1.0 - abs(m * 2.0 - 1.0)) * 0.05 * bell;   // 경계의 은은한 빛

  if (uGrade > 0.5) {
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, 0.06);                    // 모노톤
    col = (col - 0.5) * 1.08 + 0.5;                   // 대비
    col = pow(max(col, 0.0), vec3(1.05));
    vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    col *= mix(0.48, 1.0, smoothstep(1.2, 0.25, length(q)));   // 비네팅
    col += (hash(vUv * uRes + fract(uTime * 7.0) * 91.7) - 0.5) * 0.045; // 그레인
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class MorphStage {
  static supported(canvas) {
    try {
      return !!(canvas.getContext('webgl', { antialias: false }) || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  }

  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false }));
    this.cache = new Map();
    this.mouse = [0.5, 0.5];
    this.mouseTarget = [0.5, 0.5];
    this.motion = reduceMotion ? 0 : 1;
    this.start = performance.now();

    const prog = (this.prog = gl.createProgram());
    [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(([type, src]) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    });
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    ['uTex0', 'uTex1', 'uRes', 'uSize0', 'uSize1', 'uFocus0', 'uFocus1', 'uSnap0', 'uProgress', 'uTime', 'uMouse', 'uGrade', 'uMotion', 'uStrength'].forEach(
      (n) => (this.u[n] = gl.getUniformLocation(prog, n))
    );
    gl.uniform1i(this.u.uTex0, 0);
    gl.uniform1i(this.u.uTex1, 1);

    // 빈 텍스처 (로딩 전)
    this.blank = { tex: this._makeTex(null, 1, 1), w: 1, h: 1 };
    this.from = { ...this.blank, focus: 0.5, snap: false };
    this.to = { ...this.blank, focus: 0.5 };
    this.progress = 0;
    this.anim = null;
    this.currentSrc = null;
    this.requested = null;

    // 스냅샷용 프레임버퍼 2개 (핑퐁)
    this.snaps = [this._makeFbo(), this._makeFbo()];
    this.snapIndex = 0;

    this._resize = this._resize.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();

    window.addEventListener('pointermove', (e) => {
      this.mouseTarget = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];
    });

    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      this._tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  _makeTex(source, w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (source) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(w * h * 4).fill(10));
    }
    return tex;
  }

  _makeFbo() {
    const gl = this.gl;
    const tex = this._makeTex(null, 1, 1);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w: 1, h: 1 };
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    const gl = this.gl;
    this.snaps.forEach((s) => {
      gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      s.w = w;
      s.h = h;
    });
  }

  /** 이미지를 텍스처로 로드 (최대 2048px로 축소, 캐시) */
  load(src) {
    if (!src) return Promise.resolve(this.blank);
    if (this.cache.has(src)) return this.cache.get(src);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const max = 2048;
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ tex: this._makeTex(c, w, h), w, h });
      };
      img.onerror = () => resolve(this.blank);
      img.src = src;
    });
    this.cache.set(src, p);
    return p;
  }

  preload(srcs) {
    srcs.filter(Boolean).forEach((s) => this.load(s));
  }

  /** src 이미지로 모핑 전환 */
  async show(src, focus = 0.5, { duration = 1500, strength = 0.32, instant = false } = {}) {
    const key = src + '|' + focus;
    this.requested = key;
    const t = await this.load(src);
    if (this.requested !== key) return; // 더 최신 요청이 있음
    if (this.currentSrc === key) return;
    this.currentSrc = key;

    if (instant || (!this.anim && this.from.tex === this.blank.tex)) {
      this.from = { ...t, focus, snap: false };
      this.to = { ...t, focus };
      this.progress = 0;
      this.anim = null;
      return;
    }
    if (this.anim) this._snapshot(); // 전환 중이면 현재 화면을 시작점으로

    this.to = { ...t, focus };
    this.strength = strength;
    this.anim = { start: performance.now(), duration: reduceMotion ? 500 : duration };
    this.progress = 0;
  }

  _snapshot() {
    const gl = this.gl;
    const s = this.snaps[this.snapIndex];
    if (this.from.tex === s.tex) {
      this.snapIndex ^= 1;
      return this._snapshot();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.fb);
    gl.viewport(0, 0, s.w, s.h);
    this._draw(performance.now(), false);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.from = { tex: s.tex, w: s.w, h: s.h, focus: 0.5, snap: true };
    this.snapIndex ^= 1;
  }

  _draw(now, grade) {
    const gl = this.gl;
    const u = this.u;
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.from.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.to.tex);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.uSize0, this.from.w, this.from.h);
    gl.uniform2f(u.uSize1, this.to.w, this.to.h);
    gl.uniform1f(u.uFocus0, this.from.focus);
    gl.uniform1f(u.uFocus1, this.to.focus);
    gl.uniform1f(u.uSnap0, this.from.snap ? 1 : 0);
    gl.uniform1f(u.uProgress, this.progress);
    gl.uniform1f(u.uTime, (now - this.start) / 1000);
    gl.uniform2f(u.uMouse, this.mouse[0], this.mouse[1]);
    gl.uniform1f(u.uGrade, grade ? 1 : 0);
    gl.uniform1f(u.uMotion, this.motion);
    gl.uniform1f(u.uStrength, this.strength || 0.32);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  _tick(now) {
    if (this.anim) {
      const t = Math.min(1, (now - this.anim.start) / this.anim.duration);
      this.progress = easeInOut(t);
      if (t >= 1) {
        this.from = { ...this.to, snap: false };
        this.progress = 0;
        this.anim = null;
      }
    }
    this.mouse[0] += (this.mouseTarget[0] - this.mouse[0]) * 0.04;
    this.mouse[1] += (this.mouseTarget[1] - this.mouse[1]) * 0.04;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this._draw(now, true);
  }
}

/** WebGL 미지원 환경용 — 블러 크로스페이드 */
export class FallbackStage {
  constructor(container) {
    this.el = container;
    this.imgs = [document.createElement('img'), document.createElement('img')];
    this.imgs.forEach((i) => {
      i.alt = '';
      i.style.opacity = 0;
      container.appendChild(i);
    });
    this.front = 0;
    this.current = null;
  }
  preload(srcs) {
    srcs.filter(Boolean).forEach((s) => (new Image().src = s));
  }
  show(src, focus = 0.5) {
    if (!src || src === this.current) return;
    this.current = src;
    const next = this.imgs[this.front ^ 1];
    const prev = this.imgs[this.front];
    next.src = src;
    next.style.objectPosition = `${focus * 100}% 50%`;
    next.style.transform = 'scale(1.06)';
    next.style.filter = 'grayscale(1) blur(12px)';
    requestAnimationFrame(() => {
      next.style.opacity = 1;
      next.style.transform = 'scale(1)';
      next.style.filter = 'grayscale(1) contrast(1.05) brightness(.85)';
      prev.style.opacity = 0;
      prev.style.filter = 'grayscale(1) blur(12px)';
    });
    this.front ^= 1;
  }
}
