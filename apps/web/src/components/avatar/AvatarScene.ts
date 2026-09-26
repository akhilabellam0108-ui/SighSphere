/**
 * The 3D signing avatar (three.js).
 *
 * The character is built from simple smooth shapes — head with a face, torso, sleeved arms,
 * and fully articulated hands (every finger joint) — and is posed every frame directly from
 * a Rig (lib/avatarRig.ts). Because the rig comes from real tracked signing, finger and arm
 * positions are reproduced exactly rather than approximated by a canned animation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import type { Rig, Vec3 } from '../../lib/avatarRig.js';

export type AvatarView = 'front' | 'angle' | 'hands';

const COLORS = {
  skin: 0xc98f6b,
  shirt: 0x5b7470,
  hair: 0x2a2320,
  eye: 0x1b1b1b,
  lip: 0xa35f55,
  brow: 0x2a2320,
};

/** Bones of a MediaPipe hand: [from, to]. */
const HAND_BONES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [17, 18], [18, 19], [19, 20],
];
/** Finger radius per bone (thumb, index, middle, ring, pinky), tapering to the tip. */
function boneRadius(from: number): number {
  const finger = from === 0 || from <= 3 ? 0 : Math.floor((from - 5) / 4) + 1;
  const base = [0.034, 0.029, 0.03, 0.028, 0.024][finger] ?? 0.028;
  const segment = from === 0 ? 0 : from <= 4 ? from - 1 : (from - 5) % 4;
  return base * (1 - segment * 0.1);
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function v(p: Vec3): THREE.Vector3 {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

export class AvatarScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private controls: OrbitControls;
  private resizeObserver: ResizeObserver;
  private cylinder = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  private sphere = new THREE.SphereGeometry(1, 24, 18);
  private materials: Record<keyof typeof COLORS, THREE.MeshStandardMaterial>;
  private segments = new Map<string, THREE.Mesh>();
  private joints = new Map<string, THREE.Mesh>();
  private palms: Record<'left' | 'right', THREE.Mesh>;
  private torso: THREE.Mesh;
  private head = new THREE.Group();
  private cameraTarget = new THREE.Vector3(0, -0.15, 0);
  private cameraGoal: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private frame = 0;
  private dirty = true;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(this.renderer.domElement);

    this.materials = Object.fromEntries(
      Object.entries(COLORS).map(([key, color]) => [
        key,
        new THREE.MeshStandardMaterial({ color, roughness: key === 'eye' ? 0.3 : 0.62, metalness: 0 }),
      ]),
    ) as Record<keyof typeof COLORS, THREE.MeshStandardMaterial>;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f86, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2.5, 3, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfeee9, 0.6);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);

    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1, 8, 24), this.materials.shirt);
    this.scene.add(this.torso);
    this.buildHead();
    this.palms = {
      left: new THREE.Mesh(new THREE.BufferGeometry(), this.materials.skin),
      right: new THREE.Mesh(new THREE.BufferGeometry(), this.materials.skin),
    };
    this.scene.add(this.palms.left, this.palms.right);

    this.camera.position.set(0, 0.05, 6.4);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.cameraTarget);
    this.controls.enablePan = false;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 8;
    this.controls.minPolarAngle = Math.PI * 0.25;
    this.controls.maxPolarAngle = Math.PI * 0.7;
    this.controls.minAzimuthAngle = -Math.PI * 0.6;
    this.controls.maxAzimuthAngle = Math.PI * 0.6;
    this.controls.addEventListener('change', () => {
      this.dirty = true;
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.loop();
  }

  private buildHead(): void {
    const { skin, hair, eye, lip, brow } = this.materials;
    const face = new THREE.Mesh(this.sphere, skin);
    face.scale.set(0.29, 0.36, 0.31);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), hair);
    hairCap.scale.set(0.31, 0.37, 0.33);
    hairCap.position.set(0, 0.03, -0.02);
    hairCap.rotation.x = -0.25;
    const ears = [-1, 1].map((s) => {
      const ear = new THREE.Mesh(this.sphere, skin);
      ear.scale.set(0.04, 0.07, 0.035);
      ear.position.set(s * 0.29, 0, -0.02);
      return ear;
    });
    const eyes = [-1, 1].map((s) => {
      const e = new THREE.Mesh(this.sphere, eye);
      e.scale.setScalar(0.03);
      e.position.set(s * 0.1, 0.05, 0.27);
      return e;
    });
    const brows = [-1, 1].map((s) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.02), brow);
      b.position.set(s * 0.1, 0.12, 0.275);
      b.rotation.z = s * -0.08;
      return b;
    });
    const nose = new THREE.Mesh(this.sphere, skin);
    nose.scale.set(0.035, 0.05, 0.04);
    nose.position.set(0, -0.02, 0.305);
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20, Math.PI), lip);
    mouth.position.set(0, -0.13, 0.27);
    mouth.rotation.set(0.15, 0, Math.PI);
    this.head.add(face, hairCap, ...ears, ...eyes, ...brows, nose, mouth);
    this.scene.add(this.head);
  }

  private segment(name: string, a: Vec3, b: Vec3, radius: number, material: THREE.Material): void {
    let mesh = this.segments.get(name);
    if (!mesh) {
      mesh = new THREE.Mesh(this.cylinder, material);
      this.segments.set(name, mesh);
      this.scene.add(mesh);
    }
    tmpA.set(a[0], a[1], a[2]);
    tmpB.set(b[0], b[1], b[2]);
    tmpDir.subVectors(tmpB, tmpA);
    const length = tmpDir.length();
    mesh.position.addVectors(tmpA, tmpB).multiplyScalar(0.5);
    mesh.scale.set(radius, Math.max(length, 1e-4), radius);
    if (length > 1e-6) mesh.quaternion.setFromUnitVectors(UP, tmpDir.normalize());
  }

  private joint(name: string, p: Vec3, radius: number, material: THREE.Material): void {
    let mesh = this.joints.get(name);
    if (!mesh) {
      mesh = new THREE.Mesh(this.sphere, material);
      this.joints.set(name, mesh);
      this.scene.add(mesh);
    }
    mesh.position.set(p[0], p[1], p[2]);
    mesh.scale.setScalar(radius);
  }

  private hand(side: 'left' | 'right', points: Vec3[], wristFrom: Vec3): void {
    const skin = this.materials.skin;
    // Forearm runs into the hand's own wrist point — the precise anchor.
    const wrist = points[0] ?? wristFrom;
    this.segment(`${side}-forearm`, wristFrom, wrist, 0.075, skin);
    this.joint(`${side}-wrist`, wrist, 0.07, skin);
    for (const [from, to] of HAND_BONES) {
      const a = points[from];
      const b = points[to];
      if (!a || !b) continue;
      const r = boneRadius(from);
      this.segment(`${side}-bone-${from}-${to}`, a, b, r, skin);
      this.joint(`${side}-joint-${to}`, b, r * (to % 4 === 0 && to > 0 ? 0.95 : 1.02), skin);
    }
    // Palm: a solid slab through the wrist and knuckles, thickened along its normal.
    const ids = [0, 1, 2, 5, 9, 13, 17];
    const base = ids.map((i) => v(points[i] ?? wrist));
    const n = new THREE.Vector3()
      .subVectors(base[3] as THREE.Vector3, base[0] as THREE.Vector3)
      .cross(new THREE.Vector3().subVectors(base[6] as THREE.Vector3, base[0] as THREE.Vector3))
      .normalize()
      .multiplyScalar(0.032);
    const cloud = base.flatMap((p) => [p.clone().add(n), p.clone().sub(n)]);
    try {
      const geometry = new ConvexGeometry(cloud);
      this.palms[side].geometry.dispose();
      this.palms[side].geometry = geometry;
    } catch {
      /* degenerate palm (hand edge-on): keep last shape */
    }
  }

  setRig(rig: Rig): void {
    const { shirt, skin } = this.materials;
    const midShoulder: Vec3 = [
      (rig.leftShoulder[0] + rig.rightShoulder[0]) / 2,
      (rig.leftShoulder[1] + rig.rightShoulder[1]) / 2,
      (rig.leftShoulder[2] + rig.rightShoulder[2]) / 2,
    ];
    const midHip: Vec3 = [(rig.leftHip[0] + rig.rightHip[0]) / 2, (rig.leftHip[1] + rig.rightHip[1]) / 2, (rig.leftHip[2] + rig.rightHip[2]) / 2];

    // Torso: capsule from hips to just below the shoulders, as wide as the shoulders.
    const top = v(midShoulder).add(new THREE.Vector3(0, -0.12, 0));
    const bottom = v(midHip);
    const dir = new THREE.Vector3().subVectors(top, bottom);
    const height = dir.length();
    const width = Math.hypot(rig.leftShoulder[0] - rig.rightShoulder[0], rig.leftShoulder[1] - rig.rightShoulder[1]);
    this.torso.position.addVectors(top, bottom).multiplyScalar(0.5);
    this.torso.scale.set(Math.max(0.6, width * 1.4), Math.max(0.2, height / 1.6), 0.75);
    this.torso.quaternion.setFromUnitVectors(UP, dir.normalize());
    // Tilt with the shoulder line so leaning and shrugging read correctly.
    const roll = Math.atan2(rig.leftShoulder[1] - rig.rightShoulder[1], rig.leftShoulder[0] - rig.rightShoulder[0]);
    this.torso.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), roll * 0.6);

    this.segment('shoulders', rig.leftShoulder, rig.rightShoulder, 0.13, shirt);
    this.joint('left-shoulder', rig.leftShoulder, 0.14, shirt);
    this.joint('right-shoulder', rig.rightShoulder, 0.14, shirt);
    this.segment('neck', midShoulder, [rig.head.center[0], rig.head.center[1] - 0.25, rig.head.center[2]], 0.09, skin);

    this.head.position.set(rig.head.center[0], rig.head.center[1], rig.head.center[2]);
    this.head.rotation.set(rig.head.pitch, rig.head.yaw, rig.head.roll, 'YXZ');

    for (const side of ['left', 'right'] as const) {
      const shoulder = side === 'left' ? rig.leftShoulder : rig.rightShoulder;
      const elbow = side === 'left' ? rig.leftElbow : rig.rightElbow;
      const hand = side === 'left' ? rig.leftHand : rig.rightHand;
      this.segment(`${side}-upperarm`, shoulder, elbow, 0.1, shirt);
      this.joint(`${side}-elbow`, elbow, 0.085, shirt);
      this.hand(side, hand, elbow);
    }
    this.dirty = true;
  }

  setView(view: AvatarView): void {
    // Signing happens in the space between the waist and just above the head.
    let target = new THREE.Vector3(0, -0.15, 0);
    let position = new THREE.Vector3(0, 0.05, 6.4);
    if (view === 'angle') position = new THREE.Vector3(3.9, 0.35, 5.1);
    if (view === 'hands') {
      target = new THREE.Vector3(0, 0.05, 0.2);
      position = new THREE.Vector3(0, 0.15, 3.9);
    }
    this.cameraGoal = { position, target };
  }

  private resize(): void {
    const width = this.host.clientWidth || 1;
    const height = this.host.clientHeight || 1;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private loop = (): void => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.cameraGoal) {
      this.camera.position.lerp(this.cameraGoal.position, 0.12);
      this.controls.target.lerp(this.cameraGoal.target, 0.12);
      if (this.camera.position.distanceTo(this.cameraGoal.position) < 0.01) this.cameraGoal = null;
      this.dirty = true;
    }
    this.controls.update();
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry !== this.cylinder && object.geometry !== this.sphere) object.geometry.dispose();
    });
    this.cylinder.dispose();
    this.sphere.dispose();
    Object.values(this.materials).forEach((material) => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
