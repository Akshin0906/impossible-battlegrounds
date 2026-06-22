import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { BattleResult, UnitDefinition } from "../domain/battle";
import type { ContentRegistry } from "../domain/content";
import { allUnitStatesAt } from "./timelinePlayer";

type SceneOptions = {
  onSelectUnit: (unitId: string) => void;
  developerMode: boolean;
};

type RenderableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

type ResourceTracker = {
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  textures: Set<object>;
};

const color = (value: string): THREE.Color => new THREE.Color(value);

const isTexture = (value: unknown): value is THREE.Texture => value instanceof THREE.Texture;

const polishedMesh = (
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
): THREE.Mesh => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export class BattleScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2000);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly unitGroups = new Map<string, THREE.Group>();
  private readonly effectGroup = new THREE.Group();
  private readonly debugGroup = new THREE.Group();
  private readonly shotMaterial = new THREE.LineBasicMaterial({ color: "#facc15" });
  private readonly explosionGeometry = new THREE.SphereGeometry(3.5, 10, 6);
  private readonly explosionMaterial = new THREE.MeshBasicMaterial({
    color: "#f97316",
    transparent: true,
    opacity: 0.42,
  });
  private readonly bloodGeometry = new THREE.CircleGeometry(1, 10);
  private readonly bloodMaterial = new THREE.MeshBasicMaterial({
    color: "#7f1d1d",
    transparent: true,
    opacity: 0.62,
  });
  private readonly shotEffectPool: Array<
    THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  > = [];
  private readonly explosionEffectPool: Array<
    THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  > = [];
  private readonly bloodEffectPool: Array<
    THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  > = [];
  private readonly resizeObserver: ResizeObserver;
  private animationFrame = 0;
  private currentTime = 0;
  private contextLost = false;
  private developerMode: boolean;
  private disposed = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly result: BattleResult,
    private readonly registry: ContentRegistry,
    private readonly options: SceneOptions,
  ) {
    this.developerMode = options.developerMode;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3));
    this.renderer.setClearColor("#dbeafe");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, 0);
    this.scene.add(this.effectGroup);
    this.scene.add(this.debugGroup);
    this.configureScene();
    this.createTerrain();
    this.createUnits();
    canvas.addEventListener("pointerdown", this.handlePointer);
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.resize();
    this.resetCamera();
    this.animate();
  }

  setDeveloperMode(enabled: boolean): void {
    this.developerMode = enabled;
    this.debugGroup.visible = enabled;
  }

  setTime(time: number): void {
    this.currentTime = time;
    this.syncUnits(time);
    this.syncEffects(time);
  }

  captureScreenshot(): string {
    if (!this.contextLost) {
      this.renderer.render(this.scene, this.camera);
    }
    return this.canvas.toDataURL("image/png");
  }

  resetCamera(): void {
    const terrain = this.result.runtimeTerrain.definition;
    const baseDistance = Math.max(105, terrain.size.z * 0.34, terrain.size.x * 0.22);
    const narrowViewportBoost =
      this.camera.aspect < 1 ? Math.min(2.1, 1.18 / Math.max(this.camera.aspect, 0.55)) : 1;
    const distance = baseDistance * narrowViewportBoost;
    this.camera.position.set(0, distance, distance);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.canvas.removeEventListener("pointerdown", this.handlePointer);
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeGpuResources();
    this.scene.clear();
    this.unitGroups.clear();
    this.effectGroup.clear();
    this.debugGroup.clear();
    this.shotEffectPool.length = 0;
    this.explosionEffectPool.length = 0;
    this.bloodEffectPool.length = 0;
    this.renderer.dispose();
  }

  private configureScene(): void {
    this.scene.fog = new THREE.Fog("#dbeafe", 420, 900);
    const ambient = new THREE.HemisphereLight("#f8fafc", "#64748b", 1.45);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight("#ffffff", 2.7);
    sun.position.set(-80, 160, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -320;
    sun.shadow.camera.right = 320;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 460;
    this.scene.add(sun);
  }

  private createTerrain(): void {
    const terrain = this.result.runtimeTerrain.definition;
    const groundMaterial = new THREE.MeshStandardMaterial({
      color:
        terrain.id === "forest"
          ? "#3f6212"
          : terrain.id === "urban_blocks"
            ? "#737373"
            : terrain.id === "rocky_hills"
              ? "#78716c"
              : "#65a30d",
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(terrain.size.x, terrain.size.z, 16, 16),
      groundMaterial,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.name = "battlefield-ground";
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(
      Math.max(terrain.size.x, terrain.size.z),
      24,
      "#475569",
      "#94a3b8",
    );
    grid.position.y = 0.03;
    this.scene.add(grid);

    for (const obstacle of this.result.runtimeTerrain.obstacles) {
      if (obstacle.kind === "tree") {
        const trunk = polishedMesh(
          new THREE.CylinderGeometry(0.5, 0.7, obstacle.size.y, 10),
          new THREE.MeshStandardMaterial({ color: "#713f12" }),
        );
        trunk.position.set(obstacle.position.x, obstacle.size.y / 2, obstacle.position.z);
        const canopy = polishedMesh(
          new THREE.ConeGeometry(obstacle.size.x * 1.8, obstacle.size.y * 0.7, 12),
          new THREE.MeshStandardMaterial({ color: "#14532d" }),
        );
        canopy.position.set(obstacle.position.x, obstacle.size.y * 0.92, obstacle.position.z);
        this.scene.add(trunk, canopy);
      } else {
        const material = new THREE.MeshStandardMaterial({
          color: obstacle.kind === "building" ? "#525252" : "#57534e",
          roughness: 0.85,
        });
        const mesh = polishedMesh(
          new THREE.BoxGeometry(obstacle.size.x, obstacle.size.y, obstacle.size.z),
          material,
        );
        mesh.position.set(obstacle.position.x, obstacle.size.y / 2, obstacle.position.z);
        mesh.name = obstacle.id;
        this.scene.add(mesh);
      }
    }
  }

  private createUnits(): void {
    for (const meta of this.result.timeline.unitMeta) {
      const definition = this.registry.unitMap.get(meta.unitTypeId)!;
      const group = this.createUnitGroup(definition);
      group.userData.unitId = meta.id;
      group.traverse((child) => {
        child.userData.unitId = meta.id;
      });
      this.unitGroups.set(meta.id, group);
      this.scene.add(group);
    }
    this.syncUnits(0);
  }

  private createUnitGroup(definition: UnitDefinition): THREE.Group {
    const group = new THREE.Group();
    const primary = new THREE.MeshStandardMaterial({
      color: color(definition.visual.primaryColor),
      roughness: 0.62,
      metalness:
        definition.category === "modern" || definition.category === "fiction" ? 0.12 : 0.02,
    });
    const secondary = new THREE.MeshStandardMaterial({
      color: color(definition.visual.secondaryColor),
      roughness: 0.58,
      metalness: definition.category === "fiction" ? 0.2 : 0.04,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: color(definition.visual.accentColor),
      emissive:
        definition.category === "fiction"
          ? color(definition.visual.accentColor).multiplyScalar(0.18)
          : "#000000",
      roughness: 0.42,
      metalness:
        definition.category === "fiction" || definition.category === "modern" ? 0.28 : 0.06,
    });
    const scale = definition.size;
    if (definition.visual.archetype === "quadruped" || definition.visual.archetype === "elephant") {
      const isElephant = definition.visual.archetype === "elephant";
      const body = polishedMesh(
        new THREE.CapsuleGeometry(
          scale * (isElephant ? 0.46 : 0.36),
          scale * (isElephant ? 1.55 : 1.1),
          8,
          14,
        ),
        primary,
      );
      body.rotation.z = Math.PI / 2;
      body.position.y = scale * (isElephant ? 0.95 : 0.76);
      const head = polishedMesh(
        new THREE.IcosahedronGeometry(scale * (isElephant ? 0.38 : 0.32), 1),
        secondary,
      );
      head.scale.set(1.12, 0.9, 0.92);
      head.position.set(scale * (isElephant ? 1.15 : 1.02), scale * (isElephant ? 1.1 : 0.92), 0);
      group.add(body, head);
      for (const x of [-0.55, 0.55]) {
        for (const z of [-0.28, 0.28]) {
          const leg = polishedMesh(
            new THREE.CapsuleGeometry(
              scale * (isElephant ? 0.1 : 0.07),
              scale * (isElephant ? 0.58 : 0.42),
              5,
              8,
            ),
            secondary,
          );
          leg.position.set(x * scale, scale * (isElephant ? 0.38 : 0.32), z * scale);
          group.add(leg);
        }
      }
      if (isElephant) {
        const trunk = polishedMesh(
          new THREE.CylinderGeometry(scale * 0.08, scale * 0.14, scale * 1.0, 10),
          secondary,
        );
        trunk.rotation.z = Math.PI / 2.8;
        trunk.position.set(scale * 1.45, scale * 0.55, 0);
        const leftTusk = polishedMesh(
          new THREE.ConeGeometry(scale * 0.035, scale * 0.45, 8),
          accent,
        );
        const rightTusk = polishedMesh(
          new THREE.ConeGeometry(scale * 0.035, scale * 0.45, 8),
          accent,
        );
        leftTusk.rotation.z = -Math.PI / 2.6;
        rightTusk.rotation.z = -Math.PI / 2.6;
        leftTusk.position.set(scale * 1.55, scale * 0.95, scale * 0.18);
        rightTusk.position.set(scale * 1.55, scale * 0.95, scale * -0.18);
        const leftEar = polishedMesh(new THREE.CircleGeometry(scale * 0.28, 16), secondary);
        const rightEar = polishedMesh(new THREE.CircleGeometry(scale * 0.28, 16), secondary);
        leftEar.rotation.y = Math.PI / 2;
        rightEar.rotation.y = Math.PI / 2;
        leftEar.position.set(scale * 0.94, scale * 1.14, scale * 0.34);
        rightEar.position.set(scale * 0.94, scale * 1.14, scale * -0.34);
        group.add(trunk, leftTusk, rightTusk, leftEar, rightEar);
      } else {
        const snout = polishedMesh(
          new THREE.ConeGeometry(scale * 0.16, scale * 0.36, 10),
          secondary,
        );
        snout.rotation.z = -Math.PI / 2;
        snout.position.set(scale * 1.28, scale * 0.88, 0);
        const tail = polishedMesh(
          new THREE.CylinderGeometry(scale * 0.025, scale * 0.04, scale * 0.45, 8),
          accent,
        );
        tail.rotation.z = Math.PI / 2.4;
        tail.position.set(scale * -1.08, scale * 0.82, 0);
        group.add(snout, tail);
      }
      group.userData.visualScale = isElephant ? 1.08 : 1.22;
      return group;
    }

    const body = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.34, scale * 0.95, 8, 16),
      primary,
    );
    body.position.y = scale * 1.05;
    const head = polishedMesh(new THREE.IcosahedronGeometry(scale * 0.28, 1), secondary);
    head.position.y = scale * 1.78;
    const helmet = polishedMesh(
      new THREE.SphereGeometry(scale * 0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      accent,
    );
    helmet.position.y = scale * 1.86;
    const torsoPlate = polishedMesh(
      new THREE.BoxGeometry(scale * 0.52, scale * 0.46, scale * 0.18),
      secondary,
    );
    torsoPlate.position.set(0, scale * 1.12, scale * 0.08);
    const weapon = polishedMesh(
      new THREE.BoxGeometry(scale * 0.07, scale * 0.07, scale * 1.15),
      accent,
    );
    weapon.position.set(scale * 0.48, scale * 1.18, scale * 0.26);
    weapon.rotation.y = Math.PI / 2;
    const leftArm = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.055, scale * 0.48, 5, 8),
      secondary,
    );
    const rightArm = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.055, scale * 0.48, 5, 8),
      secondary,
    );
    leftArm.rotation.z = -0.38;
    rightArm.rotation.z = 0.38;
    leftArm.position.set(scale * -0.38, scale * 1.14, 0);
    rightArm.position.set(scale * 0.38, scale * 1.14, 0);
    const leftLeg = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.07, scale * 0.55, 5, 8),
      secondary,
    );
    const rightLeg = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.07, scale * 0.55, 5, 8),
      secondary,
    );
    leftLeg.position.set(scale * -0.15, scale * 0.38, 0);
    rightLeg.position.set(scale * 0.15, scale * 0.38, 0);
    group.add(body, torsoPlate, head, helmet, weapon, leftArm, rightArm, leftLeg, rightLeg);
    if (definition.traits.includes("shield_user")) {
      const shield = polishedMesh(
        new THREE.CylinderGeometry(scale * 0.34, scale * 0.34, scale * 0.08, 18),
        secondary,
      );
      shield.rotation.x = Math.PI / 2;
      shield.position.set(scale * -0.42, scale * 1.14, scale * 0.26);
      group.add(shield);
    }
    if (definition.visual.archetype === "powered_armor") {
      const wingL = polishedMesh(
        new THREE.BoxGeometry(scale * 0.12, scale * 0.38, scale * 0.9),
        accent,
      );
      const wingR = wingL.clone();
      wingL.position.set(0, scale * 1.2, scale * 0.5);
      wingR.position.set(0, scale * 1.2, scale * -0.5);
      const shoulderL = polishedMesh(
        new THREE.BoxGeometry(scale * 0.24, scale * 0.18, scale * 0.32),
        accent,
      );
      const shoulderR = shoulderL.clone();
      shoulderL.position.set(scale * -0.36, scale * 1.42, scale * 0.1);
      shoulderR.position.set(scale * 0.36, scale * 1.42, scale * 0.1);
      group.add(wingL, wingR, shoulderL, shoulderR);
    }
    if (definition.visual.archetype === "warlord") {
      const cloak = polishedMesh(
        new THREE.ConeGeometry(scale * 0.55, scale * 1.15, 18, 1, true),
        primary,
      );
      cloak.position.set(0, scale * 0.84, scale * -0.18);
      cloak.rotation.x = Math.PI;
      const bladeGlow = polishedMesh(
        new THREE.CylinderGeometry(scale * 0.025, scale * 0.035, scale * 1.25, 10),
        accent,
      );
      bladeGlow.rotation.z = Math.PI / 2;
      bladeGlow.position.set(scale * 0.72, scale * 1.2, scale * 0.34);
      group.add(cloak, bladeGlow);
    }
    if (definition.visual.archetype === "android") {
      const visor = polishedMesh(
        new THREE.BoxGeometry(scale * 0.32, scale * 0.05, scale * 0.08),
        accent,
      );
      visor.position.set(0, scale * 1.82, scale * 0.26);
      group.add(visor);
    }
    group.userData.visualScale = definition.category === "fiction" ? 1.25 : 1.35;
    return group;
  }

  private syncUnits(time: number): void {
    for (const state of allUnitStatesAt(this.result, time)) {
      const group = this.unitGroups.get(state.id);
      if (!group) {
        continue;
      }
      group.position.set(state.position.x, state.position.y, state.position.z);
      group.rotation.y = state.rotationY;
      const visualScale =
        typeof group.userData.visualScale === "number" ? group.userData.visualScale : 1;
      group.scale.setScalar((state.healthState === "dead" ? 0.86 : 1) * visualScale);
      group.rotation.z =
        state.healthState === "dead" || state.healthState === "downed" ? Math.PI / 2 : 0;
    }
  }

  private syncEffects(time: number): void {
    let shotEffectCount = 0;
    let explosionEffectCount = 0;
    let bloodEffectCount = 0;
    this.effectGroup.clear();
    const recent = this.result.timeline.events.filter(
      (event) => event.time <= time && time - event.time < 0.35,
    );
    for (const event of recent) {
      if (event.type === "shot_fired" && event.actorUnitId && event.targetUnitId) {
        const actor = this.unitGroups.get(event.actorUnitId);
        const target = this.unitGroups.get(event.targetUnitId);
        if (actor && target) {
          const line = this.getShotEffect(shotEffectCount);
          this.updateShotEffect(
            line,
            actor.position.x,
            actor.position.y + 1.2,
            actor.position.z,
            target.position.x,
            target.position.y + 1.0,
            target.position.z,
          );
          this.effectGroup.add(line);
          shotEffectCount += 1;
        }
      }
      if (event.type === "explosion" && event.position) {
        const blast = this.getExplosionEffect(explosionEffectCount);
        blast.position.set(event.position.x, event.position.y + 1.6, event.position.z);
        this.effectGroup.add(blast);
        explosionEffectCount += 1;
      }
    }
    const bloodEvents = this.result.timeline.events.filter(
      (event) =>
        event.time <= time &&
        (event.type === "death" || event.type === "wound" || event.type === "unit_down") &&
        event.position,
    );
    for (const event of bloodEvents.slice(-180)) {
      const pool = this.getBloodEffect(bloodEffectCount);
      const radius = event.type === "wound" ? 0.55 : 1.05;
      pool.scale.set(radius, radius, radius);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(event.position!.x, 0.04, event.position!.z);
      this.effectGroup.add(pool);
      bloodEffectCount += 1;
    }
  }

  private getShotEffect(index: number): THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> {
    const pooled = this.shotEffectPool[index];
    if (pooled) {
      return pooled;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, this.shotMaterial);
    line.frustumCulled = false;
    this.shotEffectPool.push(line);
    return line;
  }

  private updateShotEffect(
    line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>,
    fromX: number,
    fromY: number,
    fromZ: number,
    toX: number,
    toY: number,
    toZ: number,
  ): void {
    const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
    positions.setXYZ(0, fromX, fromY, fromZ);
    positions.setXYZ(1, toX, toY, toZ);
    positions.needsUpdate = true;
  }

  private getExplosionEffect(
    index: number,
  ): THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
    const pooled = this.explosionEffectPool[index];
    if (pooled) {
      return pooled;
    }
    const blast = new THREE.Mesh(this.explosionGeometry, this.explosionMaterial);
    this.explosionEffectPool.push(blast);
    return blast;
  }

  private getBloodEffect(index: number): THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> {
    const pooled = this.bloodEffectPool[index];
    if (pooled) {
      return pooled;
    }
    const pool = new THREE.Mesh(this.bloodGeometry, this.bloodMaterial);
    this.bloodEffectPool.push(pool);
    return pool;
  }

  private readonly handlePointer = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects([...this.unitGroups.values()], true);
    const unitId = intersects[0]?.object.userData.unitId as string | undefined;
    if (unitId) {
      this.options.onSelectUnit(unitId);
    }
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  };

  private readonly handleContextRestored = (): void => {
    if (this.disposed) {
      return;
    }
    this.contextLost = false;
    this.resize();
    this.syncUnits(this.currentTime);
    this.syncEffects(this.currentTime);
    if (this.animationFrame === 0) {
      this.animate();
    }
  };

  private resize(): void {
    const parent = this.canvas.parentElement;
    const width = Math.max(320, parent?.clientWidth ?? this.canvas.clientWidth);
    const height = Math.max(280, parent?.clientHeight ?? this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private animate = (): void => {
    if (this.disposed || this.contextLost) {
      this.animationFrame = 0;
      return;
    }
    this.controls.update();
    this.debugGroup.visible = this.developerMode;
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private disposeGpuResources(): void {
    const resources: ResourceTracker = {
      geometries: new Set(),
      materials: new Set(),
      textures: new Set(),
    };
    this.disposeObjectResources(this.scene, resources);
    for (const effect of [
      ...this.shotEffectPool,
      ...this.explosionEffectPool,
      ...this.bloodEffectPool,
    ]) {
      this.disposeObjectResources(effect, resources);
    }
    this.disposeGeometry(this.explosionGeometry, resources);
    this.disposeGeometry(this.bloodGeometry, resources);
    this.disposeMaterial(this.shotMaterial, resources);
    this.disposeMaterial(this.explosionMaterial, resources);
    this.disposeMaterial(this.bloodMaterial, resources);
  }

  private disposeObjectResources(root: THREE.Object3D, resources: ResourceTracker): void {
    root.traverse((object) => {
      const renderable = object as RenderableObject;
      if (renderable.geometry) {
        this.disposeGeometry(renderable.geometry, resources);
      }
      if (Array.isArray(renderable.material)) {
        for (const material of renderable.material) {
          this.disposeMaterial(material, resources);
        }
      } else if (renderable.material) {
        this.disposeMaterial(renderable.material, resources);
      }
    });
  }

  private disposeGeometry(geometry: THREE.BufferGeometry, resources: ResourceTracker): void {
    if (resources.geometries.has(geometry)) {
      return;
    }
    resources.geometries.add(geometry);
    geometry.dispose();
  }

  private disposeMaterial(material: THREE.Material, resources: ResourceTracker): void {
    if (resources.materials.has(material)) {
      return;
    }
    resources.materials.add(material);
    for (const value of Object.values(material) as unknown[]) {
      this.disposeTextureValue(value, resources);
    }
    if (material instanceof THREE.ShaderMaterial) {
      for (const uniform of Object.values(material.uniforms)) {
        this.disposeTextureValue(uniform.value, resources);
      }
    }
    material.dispose();
  }

  private disposeTextureValue(value: unknown, resources: ResourceTracker): void {
    if (isTexture(value)) {
      if (!resources.textures.has(value)) {
        resources.textures.add(value);
        value.dispose();
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        this.disposeTextureValue(item, resources);
      }
    }
  }
}
