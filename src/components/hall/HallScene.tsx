import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  CONDUCTOR_SIZE,
  HallPhase,
  HallTelemetry,
  MAGNET_N_Z,
  MAGNET_S_Z,
  MAGNET_SIZE,
  Z0,
  hallVoltage,
} from './constants';

interface HallSceneProps {
  currentI: number;
  magneticB: number;
  /** 霍尔效应模拟开关（开启后 I/B 锁定，进入三阶段演化） */
  simEnabled: boolean;
  /** 磁场反转开关（磁极互换、磁感线反向、偏转与积累极性反转） */
  fieldReversed: boolean;
  /** 周期性上报实时物理量（约 4Hz） */
  onTelemetry: (t: HallTelemetry) => void;
}

interface FieldLine {
  curve: THREE.QuadraticBezierCurve3;
  group: THREE.Group;
  tubeMat: THREE.MeshBasicMaterial;
  particle: THREE.Mesh;
  particleMat: THREE.MeshBasicMaterial;
}

/** 电子独立运动状态机：idle 空闲 → enter 进入 → early 洛伦兹主导 → adjust 电场调整 → steady 稳态 → exit 离场销毁 */
type ElectronState = 'idle' | 'enter' | 'early' | 'adjust' | 'steady' | 'exit';

interface Electron {
  /** 独立 ID（发射时分配，全局递增） */
  id: number;
  state: ElectronState;
  x: number;
  y: number;
  z: number;
  /** 独立漂移速度（±10% 个体差异） */
  vx: number;
  vy: number;
  /** 入板后时长（enter 渐入用） */
  age: number;
  stuck: boolean;
  stuckT: number;
  trailAcc: number;
}

interface SurfaceMark {
  x: number;
  z: number;
  thresh: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const E_POOL = 28; // 独立 Mesh 电子池（满档 5 个/秒 × 存活 ~4 s + 吸附余量）
const TRAIL_PTS = 22; // 轨迹残影采样点数（颜色梯度固定，位置逐帧推进）
const TRAIL_STEP = 0.064; // 轨迹采样间隔（秒，降速 50%）
const ENTER_T = 0.45; // 进入阶段时长（偏转渐入：轨迹由直线渐变圆弧）
const FIELD_EARLY_MAX = 0.35; // 电场比例阈值：洛伦兹主导期 → 电场调整期
const FIELD_STEADY_MIN = 0.9; // 电场比例阈值：调整期 → 稳态漂移
const EXIT_X = -2.6; // 出板滑行终点（离开导体并销毁）
const SIDE_MARKS = 24;
const MARK_XS = [-1.55, -0.93, -0.31, 0.31, 0.93, 1.55];
const MARK_ZS = [-0.5, -0.17, 0.17, 0.5];
const T_PHASE2 = 4.4; // 开始积累电荷的模拟时刻（降速 50%）
const T_STEADY = 22; // 进入稳态的模拟时刻（降速 50%）
const Y_WALL = 0.93; // 电子可吸附的侧壁位置

/** 磁感线布点（内圈优先，随 BB 增多） */
const FIELD_POSITIONS: Array<[number, number]> = [
  [1.4, 0.7],
  [-1.4, 0.7],
  [1.4, -0.7],
  [-1.4, -0.7],
  [0, 1.35],
  [0, -1.35],
  [2.6, 0],
  [-2.6, 0],
  [2.6, 1.3],
  [-2.6, 1.3],
  [2.6, -1.3],
  [-2.6, -1.3],
];

interface TextSpriteOptions {
  color?: string;
  fontSize?: number;
  borderColor?: string;
  bg?: string;
  scaleK?: number;
}

/** 用 Canvas 生成始终面向相机的文字标签（蓝图标注风格） */
function makeTextSprite(text: string, opts: TextSpriteOptions = {}): THREE.Sprite {
  const fontSize = opts.fontSize ?? 48;
  const color = opts.color ?? '#ffffff';
  const scaleK = opts.scaleK ?? 0.009;
  const pad = 16;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Sprite(new THREE.SpriteMaterial());
  const font = `bold ${fontSize}px 'Source Han Mono SC', 'PingFang SC', 'Microsoft YaHei', monospace`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = fontSize + pad * 2;
  const dpr = 2;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  ctx.font = font;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, w, h);
  }
  if (opts.borderColor) {
    ctx.strokeStyle = opts.borderColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w * scaleK, h * scaleK, 1);
  return sprite;
}

/** +x 方向箭头（电流方向） */
function makeArrowX(shaftLen: number, headLen: number, radius: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, shaftLen, 10), mat);
  shaft.rotation.z = -Math.PI / 2;
  shaft.position.x = shaftLen / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.3, headLen, 12), mat);
  head.rotation.z = -Math.PI / 2;
  head.position.x = shaftLen + headLen / 2;
  g.add(shaft, head);
  return g;
}

/** +y 方向箭头（洛伦兹力 / 霍尔电场方向） */
function makeArrowY(shaftLen: number, headLen: number, radius: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, shaftLen, 10), mat);
  shaft.position.y = shaftLen / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.6, headLen, 12), mat);
  head.position.y = shaftLen + headLen / 2;
  g.add(shaft, head);
  return g;
}

/** 坐标轴（白线 + 锥头 + 字母标签） */
function makeAxis(from: THREE.Vector3, to: THREE.Vector3, label: string): THREE.Group {
  const g = new THREE.Group();
  const dir = to.clone().sub(from);
  const len = dir.length();
  dir.normalize();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len - 0.16, 8), mat);
  shaft.position.copy(from).addScaledVector(dir, (len - 0.16) / 2);
  shaft.quaternion.setFromUnitVectors(UP, dir);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 10), mat);
  tip.position.copy(from).addScaledVector(dir, len - 0.09);
  tip.quaternion.setFromUnitVectors(UP, dir);
  const labelSprite = makeTextSprite(label, { fontSize: 34, scaleK: 0.008 });
  labelSprite.position.copy(from).addScaledVector(dir, len + 0.24);
  g.add(shaft, tip, labelSprite);
  return g;
}

/** 生成一侧表面电荷标记的洗牌布局（出现顺序自然） */
function buildMarkLayout(): SurfaceMark[] {
  const marks: SurfaceMark[] = [];
  for (const x of MARK_XS) {
    for (const z of MARK_ZS) {
      marks.push({ x, z, thresh: 0 });
    }
  }
  for (let i = marks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = marks[i];
    marks[i] = marks[j];
    marks[j] = tmp;
  }
  for (let i = 0; i < marks.length; i++) {
    marks[i].thresh = i / marks.length;
  }
  return marks;
}

/** 表面积累电荷比例曲线：0 →（阶段2 逐渐积累）→ 稳态 1 */
function chargeCurve(t: number): number {
  if (t < T_PHASE2) return 0;
  if (t < 12) return THREE.MathUtils.smoothstep(t, T_PHASE2, 12) * 0.6;
  if (t < T_STEADY) return 0.6 + THREE.MathUtils.smoothstep(t, 12, T_STEADY) * 0.4;
  return 1;
}

/**
 * 三维霍尔效应实验场景（z 轴竖直向上）。
 * 动态演化模型：电子流（q=-e）→ 洛伦兹力偏转（圆弧）→ 侧壁电荷积累
 * → 霍尔电场形成（摆线过渡）→ 电场力抵消洛伦兹力（稳态直线）。
 */
export default function HallScene({
  currentI,
  magneticB,
  simEnabled,
  fieldReversed,
  onTelemetry,
}: HallSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const paramsRef = useRef({ currentI, magneticB, simEnabled, fieldReversed, onTelemetry });
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    paramsRef.current = { currentI, magneticB, simEnabled, fieldReversed, onTelemetry };
  }, [currentI, magneticB, simEnabled, fieldReversed, onTelemetry]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    // 关键：禁止画布上的浏览器手势（滚动/缩放），否则 iPhone 拖拽 3D 会同时滚动页面导致"拖不动"
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    // iOS Safari 内存回收会触发 WebGL 上下文丢失：暂停渲染，恢复后重启，避免黑屏
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      cancelAnimationFrame(rafId);
    };
    const onContextRestored = () => {
      animate();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0f1e2f, 20, 45);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.up.set(0, 0, 1);
    camera.position.set(7.5, 4.2, 8.0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.22, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.5;
    controls.maxDistance = 26;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
    });

    // 光照：环境光 + 主光(投影) + 补光 + 轮廓光
    scene.add(new THREE.AmbientLight(0xbcd4ff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(6, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.bias = -0.0001;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x7fa8ff, 0.45);
    fill.position.set(-7, 5, 6);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.3);
    rim.position.set(-3, 6, -8);
    scene.add(rim);

    // 蓝图风格地面网格 + 阴影承接面
    const grid = new THREE.GridHelper(26, 26, 0x3d7fd9, 0x24486e);
    grid.position.y = -2.6;
    const gridMat = grid.material as THREE.LineBasicMaterial;
    gridMat.transparent = true;
    gridMat.opacity = 0.35;
    scene.add(grid);
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.3 }),
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -2.58;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // 装置组：用户坐标(x,y 水平, z 竖直) → Three.js(y 向上)
    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2;
    scene.add(world);

    const edgeMat = (opacity: number) =>
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity });
    const addEdges = (mesh: THREE.Mesh, opacity: number) => {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat(opacity));
      mesh.add(edges);
    };

    // 永久磁铁：上 N（红）/ 下 S（蓝），磁场反转时平滑互换位置
    const magnetGeo = new THREE.BoxGeometry(...MAGNET_SIZE);
    const nMagnet = new THREE.Mesh(
      magnetGeo,
      new THREE.MeshStandardMaterial({
        color: 0xd63b3b,
        metalness: 0.45,
        roughness: 0.4,
        transparent: true,
        opacity: 0.18, // 虚化：只留淡淡实体影，视觉重点让给电子与磁场
      }),
    );
    nMagnet.position.set(0, 0, MAGNET_N_Z);
    addEdges(nMagnet, 0.6); // 保留清晰轮廓线
    const sMagnet = new THREE.Mesh(
      magnetGeo,
      new THREE.MeshStandardMaterial({
        color: 0x1e5fd0,
        metalness: 0.45,
        roughness: 0.4,
        transparent: true,
        opacity: 0.18, // 虚化：只留淡淡实体影
      }),
    );
    sMagnet.position.set(0, 0, MAGNET_S_Z);
    addEdges(sMagnet, 0.6);
    world.add(nMagnet, sMagnet);

    // 磁极标签挂到各自磁铁上，随磁铁位置互换自动跟随
    const nLabel = makeTextSprite('N极', { borderColor: '#ff6b6b', bg: 'rgba(8,20,40,0.75)' });
    nLabel.position.set(0, -2.35, 0);
    nMagnet.add(nLabel);
    const sLabel = makeTextSprite('S极', { borderColor: '#5b9bff', bg: 'rgba(8,20,40,0.75)' });
    sLabel.position.set(0, -2.35, 0);
    sMagnet.add(sLabel);

    // 半透明金属导体薄板
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(...CONDUCTOR_SIZE),
      new THREE.MeshPhysicalMaterial({
        color: 0x9ec8e8,
        metalness: 0.85,
        roughness: 0.22,
        transparent: true,
        opacity: 0.4,
      }),
    );
    plate.position.set(0, 0, Z0);
    plate.castShadow = true;
    addEdges(plate, 0.5);
    world.add(plate);

    // 常规文字标签
    const addLabel = (text: string, pos: [number, number, number], opts: TextSpriteOptions = {}) => {
      const sprite = makeTextSprite(text, opts);
      sprite.position.set(...pos);
      world.add(sprite);
      return sprite;
    };
    addLabel('载流导体', [0, -1.4, 1.0], { borderColor: '#4fc3f7', fontSize: 40 });
    addLabel('电流 I', [2.45, -0.9, 0.32], { fontSize: 40 });
    addLabel('磁场 B', [-3.05, 1.75, 0.5], { fontSize: 40 });

    // 坐标轴（x / y / z，白线）
    const O = new THREE.Vector3(-3.6, -2.6, -1.3);
    world.add(makeAxis(O, new THREE.Vector3(-0.6, -2.6, -1.3), 'x'));
    world.add(makeAxis(O, new THREE.Vector3(-3.6, -0.2, -1.3), 'y'));
    world.add(makeAxis(O, new THREE.Vector3(-3.6, -2.6, 1.0), 'z'));

    // 磁感线根组：磁场反转时 scale.z 由 1 平滑过渡到 -1（方向镜像翻转）
    const fieldRoot = new THREE.Group();
    world.add(fieldRoot);
    const fieldLines: FieldLine[] = [];
    const particleGeo = new THREE.SphereGeometry(0.03, 12, 12);
    for (const [fx, fy] of FIELD_POSITIONS) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(fx, fy, 1.12),
        new THREE.Vector3(fx * 1.06, fy * 1.06, Z0),
        new THREE.Vector3(fx, fy, -0.67),
      );
      const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x4fc3f7,
        transparent: true,
        opacity: 0.75,
      });
      const group = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.016, 8, false), tubeMat);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 12), tubeMat);
      const tipPos = curve.getPoint(0.96);
      const tipTan = curve.getTangent(0.96).normalize();
      cone.position.copy(tipPos);
      cone.quaternion.setFromUnitVectors(UP, tipTan);
      group.add(tube, cone);
      const particleMat = new THREE.MeshBasicMaterial({
        color: 0x8fd8ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const particle = new THREE.Mesh(particleGeo, particleMat);
      fieldRoot.add(group, particle);
      fieldLines.push({ curve, group, tubeMat, particle, particleMat });
    }

    // 电流方向箭头（+x，随 I 增亮；开启模拟后方向不变）
    const currentMat = new THREE.MeshStandardMaterial({
      color: 0xbfd9ff,
      emissive: 0xdfefff,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.6,
    });
    for (const y of [-0.55, 0.55]) {
      const arrow = makeArrowX(1.35, 0.35, 0.03, currentMat);
      arrow.position.set(0.05, y, 0.98);
      world.add(arrow);
    }

    // 电子束系统（白色电子 q=-e：独立 Mesh 球体，不透明、固定尺寸，桌面/移动端均稳定显示）
    const electronGeo = new THREE.SphereGeometry(0.055, 14, 14);
    const electronMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: false, opacity: 1 });
    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const trailBase = new THREE.Color(0xffd54f); // 亮金黄残影（明显区别于浅蓝导体与青色磁感线）
    const electrons: Electron[] = [];
    const eMeshes: THREE.Mesh[] = [];
    const eLines: THREE.Line[] = [];
    const eTrailGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < E_POOL; i++) {
      const mesh = new THREE.Mesh(electronGeo, electronMat);
      mesh.frustumCulled = false;
      mesh.visible = false;
      world.add(mesh);
      eMeshes.push(mesh);
      // 轨迹残影线：位置逐点推进，颜色梯度固定（头亮尾暗，不闪烁）
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(TRAIL_PTS * 3);
      const col = new Float32Array(TRAIL_PTS * 3);
      for (let k = 0; k < TRAIL_PTS; k++) {
        const f = ((k + 1) / TRAIL_PTS) ** 1.5;
        col[k * 3] = trailBase.r * f;
        col[k * 3 + 1] = trailBase.g * f;
        col[k * 3 + 2] = trailBase.b * f;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(geo, trailMat);
      line.frustumCulled = false;
      line.visible = false;
      world.add(line);
      eLines.push(line);
      eTrailGeos.push(geo);
      electrons.push({
        id: 0,
        state: 'idle',
        x: 0,
        y: 0,
        z: Z0,
        vx: 0,
        vy: 0,
        age: 0,
        stuck: false,
        stuckT: 0,
        trailAcc: 0,
      });
    }

    // 表面积累电荷：负电荷组（默认 +y 侧）/ 正电荷组（默认 −y 侧），反转时整组平滑滑动互换
    const markGeo = new THREE.SphereGeometry(0.05, 10, 10);
    const negMat = new THREE.MeshBasicMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.95 });
    const posMat = new THREE.MeshBasicMaterial({ color: 0xff8a65, transparent: true, opacity: 0.95 });
    const negGroup = new THREE.Group();
    negGroup.position.set(0, 0.97, 0);
    const negMesh = new THREE.InstancedMesh(markGeo, negMat, SIDE_MARKS);
    negMesh.frustumCulled = false;
    negGroup.add(negMesh);
    const negLabel = makeTextSprite('−', { color: '#dff1ff', fontSize: 44, scaleK: 0.007 });
    negLabel.position.set(1.78, 0, 0.22);
    negGroup.add(negLabel);
    const posGroup = new THREE.Group();
    posGroup.position.set(0, -0.97, 0);
    const posMesh = new THREE.InstancedMesh(markGeo, posMat, SIDE_MARKS);
    posMesh.frustumCulled = false;
    posGroup.add(posMesh);
    const posLabel = makeTextSprite('+', { color: '#ffab91', fontSize: 44, scaleK: 0.007 });
    posLabel.position.set(1.78, 0, 0.22);
    posGroup.add(posLabel);
    world.add(negGroup, posGroup);
    const negMarks = buildMarkLayout();
    const posMarks = buildMarkLayout();
    const negLabelMat = negLabel.material as THREE.SpriteMaterial;
    const posLabelMat = posLabel.material as THREE.SpriteMaterial;

    // 霍尔电场 E_H 箭头（指向负电荷侧，随电场形成渐显；反转时平滑转向）
    const ehMat = new THREE.MeshBasicMaterial({
      color: 0x69f0ae,
      transparent: true,
      opacity: 0,
    });
    const ehGroup = new THREE.Group();
    ehGroup.position.set(0, -0.3, 0.98);
    const ehArrowA = makeArrowY(0.55, 0.2, 0.028, ehMat);
    ehArrowA.position.x = -1.1;
    const ehArrowB = makeArrowY(0.55, 0.2, 0.028, ehMat);
    ehArrowB.position.x = 1.1;
    const ehLabel = makeTextSprite('E_H', { color: '#69f0ae', fontSize: 30, scaleK: 0.006 });
    ehLabel.position.set(0, 0.72, 0);
    ehGroup.add(ehArrowA, ehArrowB, ehLabel);
    world.add(ehGroup);

    // 洛伦兹力 F 示意箭头（电子受力方向：默认 +y，反转后 −y，稳态时渐隐）
    const forceMat = new THREE.MeshBasicMaterial({
      color: 0xff7043,
      transparent: true,
      opacity: 0,
    });
    const fGroup = new THREE.Group();
    fGroup.position.set(-1.5, 0, 0.98);
    const fArrow = makeArrowY(0.5, 0.18, 0.03, forceMat);
    const fLabel = makeTextSprite('F', { color: '#ffab91', fontSize: 30, scaleK: 0.006 });
    fLabel.position.set(0.18, 0.62, 0);
    fGroup.add(fArrow, fLabel);
    world.add(fGroup);

    // ─── 动画循环：动态霍尔效应演化 ───
    const clock = new THREE.Clock();
    const tmpV = new THREE.Vector3();
    const dummy = new THREE.Object3D();
    let simTime = 0; // 模拟开启后的演化时钟（关闭即归零，重开从头演化）
    let chargeLevel = 0; // 表面积累电荷比例（0~1，平滑增减）
    let flipMix = 0; // 磁场反转进度（0 默认 / 1 反转，双向平滑）
    let ehRot = 0; // E_H 箭头朝向（0 = +y，π = −y）
    let fRot = 0; // F 箭头朝向
    let teleAcc = 0;
    let lastPhase: HallPhase = 0;
    let rafId = 0;
    let spawnClock = 0; // 电子束发射时钟（全局单点调度，杜绝批次齐发）
    let nextSpawn = 0.3; // 下一枚电子的发射时刻
    let idSeq = 0; // 电子独立 ID 序列

    /** 发射一枚电子：+X 入口平面内 y/z 均匀随机，速度带 ±10% 个体差异，轨迹缓存独立重置 */
    const launch = (e: Electron, geo: THREE.BufferGeometry, vxBase: number) => {
      e.id = ++idSeq;
      e.state = 'enter';
      e.x = 2.0; // 入口：透明导体 +X 方向表面
      e.y = (Math.random() * 2 - 1) * 0.82; // 入口 y 均匀随机
      e.z = Z0 + (Math.random() * 2 - 1) * 0.57; // 入口 z 均匀随机（板厚 ±0.667 内）
      e.vx = vxBase * (0.9 + Math.random() * 0.2); // 独立漂移速度（±10% 个体差异）
      e.vy = 0;
      e.age = 0;
      e.stuck = false;
      e.stuckT = 0;
      e.trailAcc = 0;
      geo.setDrawRange(0, 0); // 独立轨迹缓存重置
    };

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const I = paramsRef.current.currentI;
      const B = paramsRef.current.magneticB;
      const simOn = paramsRef.current.simEnabled;
      const reversed = paramsRef.current.fieldReversed;

      // 演化时钟与全局平滑量
      if (simOn) simTime += dt;
      else simTime = 0;
      const chargeTarget = simOn
        ? chargeCurve(simTime) *
          THREE.MathUtils.smoothstep(B, 0, 0.5) *
          THREE.MathUtils.smoothstep(I, 0, 0.5) // B 或 I 为 0 时无偏转、无积累（读数与视觉同步归零）
        : 0;
      chargeLevel = THREE.MathUtils.damp(chargeLevel, chargeTarget, 1.5, dt);
      const eFieldNow = chargeLevel * 0.98; // 霍尔电场强度比例（随积累电荷建立）
      const lorentzOn = simOn ? THREE.MathUtils.smoothstep(simTime, 0, 2.4) : 0; // 偏转力渐入（降速 50%）
      flipMix = THREE.MathUtils.damp(flipMix, reversed ? 1 : 0, 1.6, dt);
      const fieldSign = 1 - 2 * flipMix; // +1：电子偏 +y；−1：偏 −y（教学可视化约定）
      const vx = 0.4 + 0.8 * (I / 10); // 电子漂移速率（随电流 I，降速 50%）

      // 磁铁位置互换（N ↔ S 上下对调，平滑滑动）
      nMagnet.position.z = THREE.MathUtils.damp(
        nMagnet.position.z,
        reversed ? MAGNET_S_Z : MAGNET_N_Z,
        1.75,
        dt,
      );
      sMagnet.position.z = THREE.MathUtils.damp(
        sMagnet.position.z,
        reversed ? MAGNET_N_Z : MAGNET_S_Z,
        1.75,
        dt,
      );

      // 磁感线：数量 / 亮度 / 粗细随 BB 联动；根组 scale.z 过零翻转实现方向反向
      fieldRoot.scale.z = fieldSign;
      const flipFade = Math.min(1, Math.abs(fieldSign) * 1.6);
      const count = Math.round(2 + (B / 10) * 10);
      const lineOpacity = (0.25 + 0.65 * (B / 10)) * flipFade;
      const s = 0.7 + 0.6 * (B / 10);
      for (let i = 0; i < fieldLines.length; i++) {
        const fl = fieldLines[i];
        const vis = i < count && flipFade > 0.12;
        fl.group.visible = vis;
        fl.particle.visible = vis;
        if (vis) {
          fl.tubeMat.opacity = lineOpacity;
          fl.group.scale.set(s, s, 1);
          const t = (elapsed * (0.125 + 0.25 * (B / 10)) + i / fieldLines.length) % 1;
          fl.curve.getPoint(t, tmpV);
          fl.particle.position.copy(tmpV);
          fl.particleMat.opacity = (0.4 + 0.6 * (B / 10)) * flipFade;
        }
      }

      // 电流箭头亮度
      currentMat.opacity = 0.3 + 0.7 * (I / 10);

      // 电子束全局调度器：速率随电流联动（满档 5 个/秒），窄抖动均匀间隔 → 恒定流密度，无批次爆发
      const omega = 2.0 * (B / 10); // 回旋角频率（教学标度，随 B 增强）
      const rate = Math.max(0, 0.5 * I); // 平均生成速率（个/秒）
      spawnClock += dt;
      if (rate <= 0) {
        nextSpawn = spawnClock + 0.4; // I=0：无电流，无电子流
      } else {
        let guard = 0;
        while (spawnClock >= nextSpawn && guard < 3) {
          const idx = electrons.findIndex((el) => el.state === 'idle');
          if (idx < 0) {
            nextSpawn = spawnClock + 0.05; // 池满：推迟单枚，绝不爆发
            break;
          }
          launch(electrons[idx], eTrailGeos[idx], vx);
          nextSpawn += (1 / rate) * (0.75 + 0.5 * Math.random()); // 均值 1/rate 的窄抖动间隔
          guard += 1;
        }
      }
      for (let i = 0; i < electrons.length; i++) {
        const e = electrons[i];
        const mesh = eMeshes[i];
        const geo = eTrailGeos[i];
        if (e.state === 'idle') {
          mesh.visible = false;
          eLines[i].visible = false;
          continue;
        }
        if (e.stuck) {
          // 撞壁吸附（无反弹）：短暂停留后收缩消隐，转化为表面积累电荷，随后销毁回池
          e.stuckT += dt;
          mesh.scale.setScalar(Math.max(0.05, 1 - e.stuckT / 0.9));
          if (e.stuckT > 0.9) {
            e.state = 'idle';
            mesh.visible = false;
            eLines[i].visible = false;
            continue;
          }
        } else {
          mesh.scale.setScalar(1);
          e.age += dt;
          // 独立状态机迁移（按电场建立程度，电子各自推进）
          if (e.state === 'enter' && e.age > ENTER_T) {
            e.state = eFieldNow < FIELD_EARLY_MAX ? 'early' : eFieldNow < FIELD_STEADY_MIN ? 'adjust' : 'steady';
          } else if (e.state === 'early' && eFieldNow >= FIELD_EARLY_MAX) {
            e.state = 'adjust';
          } else if ((e.state === 'adjust' || e.state === 'enter') && eFieldNow >= FIELD_STEADY_MIN) {
            e.state = 'steady';
          }
          // 连续运动方程（状态只渐变权重，无跳变断点）：
          // enter 渐入（接近直线）→ early 洛伦兹主导（圆弧偏转）→ adjust 电场抵消（偏转渐弱）
          // → steady 合力≈0，vy 衰减归零、y 保持各自入口 → 平行直线漂移，束流随机分布不汇聚
          const enterRamp = e.state === 'enter' ? Math.min(1, e.age / ENTER_T) : 1;
          const deflect = simOn ? enterRamp * lorentzOn * (1 - eFieldNow) : 0; // 电场比例抵消洛伦兹权重
          const dampK = simOn ? eFieldNow * 1.5 : 1.5; // vy 衰减（位置不回中心，杜绝汇聚）
          const sp = Math.hypot(e.vx, e.vy) || 1e-6;
          const aMag = omega * sp * deflect * fieldSign; // 垂直于速度 → 连续圆弧，随 fieldSign 反向
          const ax = (-e.vy / sp) * aMag;
          const ay = (e.vx / sp) * aMag;
          e.vy += ay * dt;
          e.vy *= Math.max(0, 1 - dampK * dt);
          e.vx = THREE.MathUtils.clamp(e.vx + ax * dt, 0.05, 3);
          e.y = THREE.MathUtils.clamp(e.y + e.vy * dt, -Y_WALL, Y_WALL);
          e.x -= e.vx * dt;
          // 侧壁吸附（仅偏转期，撞点随电场增强整体向 −x 迁移；稳态电子直线穿过，无撞墙反弹）
          if (
            simOn &&
            Math.abs(e.y) >= Y_WALL - 1e-4 &&
            eFieldNow < 0.85 &&
            e.state !== 'steady' &&
            e.state !== 'exit'
          ) {
            e.stuck = true;
            e.stuckT = 0;
          } else if (e.state !== 'exit' && e.x < -2.05) {
            e.state = 'exit'; // 出板：短滑行后销毁
          }
          if (e.state === 'exit' && e.x < EXIT_X) {
            e.state = 'idle'; // 离开导体并销毁
            mesh.visible = false;
            eLines[i].visible = false;
            continue;
          }
        }
        mesh.visible = true; // 到达此处必为活跃电子（idle 路径均已 continue 回收）
        mesh.position.set(e.x, e.y, e.z);
        // 独立轨迹残影：固定间隔采样，逐点增长至满后整体左移（连续平滑、不闪烁、不跳跃）
        if (!e.stuck) {
          e.trailAcc += dt;
          if (e.trailAcc >= TRAIL_STEP) {
            e.trailAcc = 0;
            const posAttr = geo.attributes.position as THREE.BufferAttribute;
            const arr = posAttr.array as Float32Array;
            let n = geo.drawRange.count;
            if (n < TRAIL_PTS) {
              arr[n * 3] = e.x;
              arr[n * 3 + 1] = e.y;
              arr[n * 3 + 2] = e.z;
              n += 1;
            } else {
              arr.copyWithin(0, 3);
              arr[(TRAIL_PTS - 1) * 3] = e.x;
              arr[(TRAIL_PTS - 1) * 3 + 1] = e.y;
              arr[(TRAIL_PTS - 1) * 3 + 2] = e.z;
            }
            geo.setDrawRange(0, n);
            posAttr.needsUpdate = true;
          }
        }
        eLines[i].visible = geo.drawRange.count > 1;
      }

      // 表面积累电荷标记（数量随 chargeLevel 连续出现，反转时整组滑动互换侧壁）
      negGroup.position.y = THREE.MathUtils.damp(
        negGroup.position.y,
        reversed ? -0.97 : 0.97,
        1.5,
        dt,
      );
      posGroup.position.y = THREE.MathUtils.damp(
        posGroup.position.y,
        reversed ? 0.97 : -0.97,
        1.5,
        dt,
      );
      for (let i = 0; i < SIDE_MARKS; i++) {
        const nm = negMarks[i];
        const pm = posMarks[i];
        const ns = THREE.MathUtils.smoothstep(chargeLevel, nm.thresh, nm.thresh + 0.12);
        dummy.position.set(nm.x, 0, nm.z);
        dummy.scale.setScalar(ns);
        dummy.updateMatrix();
        negMesh.setMatrixAt(i, dummy.matrix);
        const ps = THREE.MathUtils.smoothstep(chargeLevel, pm.thresh, pm.thresh + 0.12);
        dummy.position.set(pm.x, 0, pm.z);
        dummy.scale.setScalar(ps);
        dummy.updateMatrix();
        posMesh.setMatrixAt(i, dummy.matrix);
      }
      negMesh.instanceMatrix.needsUpdate = true;
      posMesh.instanceMatrix.needsUpdate = true;
      negLabelMat.opacity = Math.min(1, chargeLevel * 2.5);
      posLabelMat.opacity = Math.min(1, chargeLevel * 2.5);

      // 霍尔电场 E_H 箭头：随电场渐显，反转时平滑转向
      ehRot = THREE.MathUtils.damp(ehRot, reversed ? Math.PI : 0, 1.5, dt);
      ehGroup.rotation.z = ehRot;
      ehGroup.visible = eFieldNow > 0.02;
      ehMat.opacity = 0.9 * eFieldNow;
      ehGroup.scale.set(1, 0.4 + 0.6 * eFieldNow, 1);

      // 洛伦兹力 F 箭头：偏转期可见，稳态（力平衡）渐隐
      fRot = THREE.MathUtils.damp(fRot, reversed ? Math.PI : 0, 1.5, dt);
      fGroup.rotation.z = fRot;
      const fStrength = simOn ? lorentzOn * (1 - eFieldNow) * (0.25 + 0.75 * (B / 10)) : 0;
      fGroup.visible = fStrength > 0.02;
      forceMat.opacity = 0.95 * fStrength;
      fGroup.scale.set(1, 0.35 + 0.65 * fStrength, 1);

      // 周期上报实时物理量
      const phase: HallPhase = !simOn ? 0 : simTime < T_PHASE2 ? 1 : simTime < T_STEADY ? 2 : 3;
      teleAcc += dt;
      if (teleAcc > 0.25 || phase !== lastPhase) {
        teleAcc = 0;
        lastPhase = phase;
        const vHFull = hallVoltage(I, B);
        const vNow = vHFull * eFieldNow * fieldSign; // 反转后 V_H 实际变号（平滑过零，非文字翻转）
        paramsRef.current.onTelemetry({
          phase,
          vH: vNow,
          eh: vNow / 2,
          q: chargeLevel * 2 * vHFull,
        });
      }

      controls.update();
      renderer.render(scene, camera);
    };

    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost, false);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored, false);
      ro.disconnect();
      controls.dispose();
      const disposeMaterial = (m: THREE.Material) => {
        const withMap = m as THREE.Material & { map?: THREE.Texture | null };
        withMap.map?.dispose();
        m.dispose();
      };
      scene.traverse((obj) => {
        const o = obj as THREE.Mesh | THREE.Line | THREE.Points | THREE.Sprite;
        if (o.geometry) o.geometry.dispose();
        const mat = (o as { material?: THREE.Material | THREE.Material[] }).material;
        if (Array.isArray(mat)) {
          for (const m of mat) disposeMaterial(m);
        } else if (mat) {
          disposeMaterial(mat);
        }
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="bp-card blueprint-grid relative h-[56vh] w-full min-w-0 overflow-hidden bg-card md:h-full md:min-h-[560px]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3">
        <p className="tech-label bg-background/70 px-2 py-1 text-xs text-muted-foreground">
          FIG 1.1 — 三维实验装置
        </p>
        <p className="tech-label hidden bg-background/70 px-2 py-1 text-xs text-muted-foreground md:block">
          SCALE 1:1 · SI
        </p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-background/70 px-2 py-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-destructive" />
            N极
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-primary" />
            S极
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-foreground" />
            电子 e⁻
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-info" />
            磁感线 B
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-full bg-accent" />
            积累电荷
          </span>
        </div>
        <p className="tech-label hidden bg-background/70 px-2 py-1 text-xs text-muted-foreground md:block">
          鼠标拖动旋转 · 滚轮缩放
        </p>
      </div>
      {webglFailed && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
          当前环境不支持 WebGL，无法渲染三维场景。
        </div>
      )}
    </div>
  );
}
