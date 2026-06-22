import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  BattleResult,
  TerrainDefinition,
  TerrainObstacle,
  UnitDefinition,
} from "../domain/battle";
import type { ContentRegistry } from "../domain/content";
import { terrainHeightAt } from "../simulation/terrain";
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

type UnitMaterials = {
  primary: THREE.MeshStandardMaterial;
  secondary: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  energy: THREE.MeshStandardMaterial;
};

type TerrainTextureSpec = {
  base: string;
  accents: string[];
  bumpBase: string;
  seed: number;
};

const TERRAIN_TEXTURE_SIZE = 512;

const terrainTextureSpecs: Record<string, TerrainTextureSpec> = {
  open_field: {
    base: "#5f8f39",
    accents: ["#78a84a", "#3f6f2c", "#8b6f35", "#d8c27a"],
    bumpBase: "#9f9f9f",
    seed: 12713,
  },
  forest: {
    base: "#24451f",
    accents: ["#376c2a", "#172f18", "#6b4f27", "#8b6b35"],
    bumpBase: "#868686",
    seed: 28349,
  },
  urban_blocks: {
    base: "#656565",
    accents: ["#4b5563", "#9ca3af", "#27272a", "#d4d4d8"],
    bumpBase: "#949494",
    seed: 39461,
  },
  rocky_hills: {
    base: "#766f63",
    accents: ["#9a8f7e", "#57534e", "#b6ad9b", "#4b5563"],
    bumpBase: "#8c8c8c",
    seed: 51973,
  },
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

const seededRandom = (initialSeed: number): (() => number) => {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
};

const material = (
  value: string,
  options: {
    roughness?: number;
    metalness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    transparent?: boolean;
    opacity?: number;
  } = {},
): THREE.MeshStandardMaterial => {
  const parameters: THREE.MeshStandardMaterialParameters = {
    color: color(value),
    roughness: options.roughness ?? 0.66,
    metalness: options.metalness ?? 0.04,
    emissive: options.emissive ? color(options.emissive) : "#000000",
    emissiveIntensity: options.emissiveIntensity ?? 0,
  };
  if (options.transparent !== undefined) {
    parameters.transparent = options.transparent;
  }
  if (options.opacity !== undefined) {
    parameters.opacity = options.opacity;
  }
  return new THREE.MeshStandardMaterial(parameters);
};

const createBattlefieldTexture = (
  terrainId: string,
  kind: "color" | "bump",
): THREE.CanvasTexture => {
  const spec = terrainTextureSpecs[terrainId] ?? terrainTextureSpecs.open_field;
  const canvas = document.createElement("canvas");
  canvas.width = TERRAIN_TEXTURE_SIZE;
  canvas.height = TERRAIN_TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const random = seededRandom(spec.seed + (kind === "bump" ? 877 : 0));
  context.fillStyle = kind === "bump" ? spec.bumpBase : spec.base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const drawScatter = (count: number, maxRadius: number): void => {
    for (let index = 0; index < count; index += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const radius = 1 + random() * maxRadius;
      context.globalAlpha = 0.12 + random() * 0.28;
      context.fillStyle =
        kind === "bump"
          ? `rgb(${95 + random() * 80}, ${95 + random() * 80}, ${95 + random() * 80})`
          : spec.accents[index % spec.accents.length]!;
      context.beginPath();
      context.ellipse(x, y, radius * (1.2 + random()), radius, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  };

  if (terrainId === "urban_blocks") {
    context.lineWidth = kind === "bump" ? 2 : 1;
    for (let offset = 0; offset <= canvas.width; offset += 64) {
      context.globalAlpha = 0.3;
      context.strokeStyle = kind === "bump" ? "#777777" : "#3f3f46";
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + random() * 8 - 4, canvas.height);
      context.moveTo(0, offset);
      context.lineTo(canvas.width, offset + random() * 8 - 4);
      context.stroke();
    }
    drawScatter(520, 5);
    for (let index = 0; index < 36; index += 1) {
      context.globalAlpha = kind === "bump" ? 0.28 : 0.46;
      context.strokeStyle = kind === "bump" ? "#5e5e5e" : "#27272a";
      context.lineWidth = 1 + random() * 2;
      context.beginPath();
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      context.moveTo(x, y);
      context.bezierCurveTo(
        x + random() * 42 - 21,
        y + random() * 30 - 15,
        x + random() * 74 - 37,
        y + random() * 52 - 26,
        x + random() * 100 - 50,
        y + random() * 82 - 41,
      );
      context.stroke();
    }
  } else if (terrainId === "rocky_hills") {
    drawScatter(720, 9);
    for (let index = 0; index < 34; index += 1) {
      context.globalAlpha = kind === "bump" ? 0.34 : 0.28;
      context.strokeStyle =
        kind === "bump" ? "#b5b5b5" : spec.accents[index % spec.accents.length]!;
      context.lineWidth = 1 + random() * 3;
      context.beginPath();
      const y = random() * canvas.height;
      context.moveTo(0, y);
      for (let x = 0; x <= canvas.width; x += 64) {
        context.lineTo(x, y + Math.sin((x + index * 17) * 0.024) * (8 + random() * 7));
      }
      context.stroke();
    }
  } else if (terrainId === "forest") {
    drawScatter(1600, 5);
    for (let index = 0; index < 96; index += 1) {
      context.globalAlpha = kind === "bump" ? 0.24 : 0.2;
      context.strokeStyle = kind === "bump" ? "#656565" : "#3f2f18";
      context.lineWidth = 2 + random() * 5;
      context.beginPath();
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      context.moveTo(x, y);
      context.lineTo(x + random() * 60 - 30, y + random() * 44 - 22);
      context.stroke();
    }
  } else {
    drawScatter(1100, 7);
    for (let index = 0; index < 120; index += 1) {
      context.globalAlpha = kind === "bump" ? 0.18 : 0.22;
      context.strokeStyle = kind === "bump" ? "#b5b5b5" : spec.accents[index % 2]!;
      context.lineWidth = 1 + random() * 2;
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + random() * 22 - 11, y + 6 + random() * 18);
      context.stroke();
    }
  }

  context.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = kind === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
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
    const ground = new THREE.Mesh(
      this.createGroundGeometry(terrain),
      this.createGroundMaterial(terrain),
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
    grid.position.y = 0.08;
    const gridMaterials: THREE.Material[] = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    for (const gridMaterial of gridMaterials) {
      gridMaterial.transparent = true;
      gridMaterial.opacity = terrain.id === "urban_blocks" ? 0.12 : 0.08;
      gridMaterial.depthWrite = false;
    }
    this.scene.add(grid);

    if (terrain.id === "urban_blocks") {
      this.addUrbanRoads(terrain);
    }

    for (const obstacle of this.result.runtimeTerrain.obstacles) {
      if (obstacle.kind === "tree") {
        this.addTreeObstacle(obstacle);
      } else if (obstacle.kind === "building") {
        this.addBuildingObstacle(obstacle);
      } else {
        this.addRockObstacle(obstacle);
      }
    }
  }

  private createGroundMaterial(terrain: TerrainDefinition): THREE.MeshStandardMaterial {
    const map = createBattlefieldTexture(terrain.id, "color");
    const bumpMap = createBattlefieldTexture(terrain.id, "bump");
    const repeatX = Math.max(4, terrain.size.x / 92);
    const repeatZ = Math.max(3, terrain.size.z / 92);
    map.repeat.set(repeatX, repeatZ);
    bumpMap.repeat.set(repeatX, repeatZ);
    map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    bumpMap.anisotropy = map.anisotropy;
    return new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map,
      bumpMap,
      bumpScale: terrain.id === "rocky_hills" ? 0.48 : terrain.id === "urban_blocks" ? 0.09 : 0.22,
      roughness: terrain.id === "urban_blocks" ? 0.82 : 0.94,
      metalness: 0,
    });
  }

  private createGroundGeometry(terrain: TerrainDefinition): THREE.PlaneGeometry {
    const geometry = new THREE.PlaneGeometry(terrain.size.x, terrain.size.z, 64, 64);
    if (terrain.id !== "rocky_hills") {
      return geometry;
    }

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const worldX = positions.getX(index);
      const worldZ = -positions.getY(index);
      positions.setZ(index, terrainHeightAt(terrain, worldX, worldZ));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  private addUrbanRoads(terrain: TerrainDefinition): void {
    const asphalt = material("#27272a", { roughness: 0.88 });
    const lane = material("#f8fafc", { roughness: 0.76 });
    const roadWidth = 16;
    const roadY = 0.075;
    const horizontalRoadZ = [-80, 0, 80];
    const verticalRoadX = [-135, -45, 45, 135];

    const addRoad = (width: number, depth: number, x: number, z: number): void => {
      const road = polishedMesh(new THREE.PlaneGeometry(width, depth), asphalt);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, roadY, z);
      road.receiveShadow = true;
      this.scene.add(road);
    };

    for (const z of horizontalRoadZ) {
      addRoad(terrain.size.x, roadWidth, 0, z);
      for (let x = -terrain.size.x / 2 + 24; x < terrain.size.x / 2; x += 44) {
        const stripe = polishedMesh(new THREE.PlaneGeometry(14, 1.1), lane);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(x, roadY + 0.01, z);
        this.scene.add(stripe);
      }
    }

    for (const x of verticalRoadX) {
      addRoad(roadWidth, terrain.size.z, x, 0);
      for (let z = -terrain.size.z / 2 + 24; z < terrain.size.z / 2; z += 44) {
        const stripe = polishedMesh(new THREE.PlaneGeometry(1.1, 14), lane);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(x, roadY + 0.012, z);
        this.scene.add(stripe);
      }
    }
  }

  private addTreeObstacle(obstacle: TerrainObstacle): void {
    const trunkMaterial = material("#5b3416", { roughness: 0.86 });
    const barkBandMaterial = material("#2f1d0f", { roughness: 0.9 });
    const canopyMaterial = material("#14532d", { roughness: 0.78 });
    const highlightMaterial = material("#2f7d32", { roughness: 0.82 });

    const trunk = polishedMesh(
      new THREE.CylinderGeometry(
        obstacle.size.x * 0.16,
        obstacle.size.x * 0.22,
        obstacle.size.y,
        8,
      ),
      trunkMaterial,
    );
    trunk.position.set(obstacle.position.x, obstacle.size.y / 2, obstacle.position.z);
    trunk.name = obstacle.id;
    this.scene.add(trunk);

    for (let index = 0; index < 3; index += 1) {
      const band = polishedMesh(
        new THREE.TorusGeometry(obstacle.size.x * 0.19, 0.025, 5, 10),
        barkBandMaterial,
      );
      band.rotation.x = Math.PI / 2;
      band.position.set(
        obstacle.position.x,
        obstacle.size.y * (0.26 + index * 0.19),
        obstacle.position.z,
      );
      this.scene.add(band);
    }

    for (let layer = 0; layer < 3; layer += 1) {
      const canopy = polishedMesh(
        new THREE.ConeGeometry(obstacle.size.x * (1.4 - layer * 0.22), obstacle.size.y * 0.46, 12),
        layer === 1 ? highlightMaterial : canopyMaterial,
      );
      canopy.position.set(
        obstacle.position.x,
        obstacle.size.y * (0.72 + layer * 0.16),
        obstacle.position.z,
      );
      this.scene.add(canopy);
    }
  }

  private addBuildingObstacle(obstacle: TerrainObstacle): void {
    const concrete = material("#525252", { roughness: 0.78 });
    const roofMaterial = material("#27272a", { roughness: 0.7 });
    const windowMaterial = material("#bae6fd", {
      roughness: 0.22,
      metalness: 0.05,
      emissive: "#38bdf8",
      emissiveIntensity: 0.08,
    });
    const building = polishedMesh(
      new THREE.BoxGeometry(obstacle.size.x, obstacle.size.y, obstacle.size.z),
      concrete,
    );
    building.position.set(obstacle.position.x, obstacle.size.y / 2, obstacle.position.z);
    building.name = obstacle.id;
    this.scene.add(building);

    const roof = polishedMesh(
      new THREE.BoxGeometry(obstacle.size.x + 1.6, 0.55, obstacle.size.z + 1.6),
      roofMaterial,
    );
    roof.position.set(obstacle.position.x, obstacle.size.y + 0.3, obstacle.position.z);
    this.scene.add(roof);

    const rows = Math.max(2, Math.floor(obstacle.size.y / 7));
    const frontBackColumns = Math.max(2, Math.floor(obstacle.size.x / 8));
    const sideColumns = Math.max(2, Math.floor(obstacle.size.z / 8));
    this.addWindowGrid(
      obstacle,
      windowMaterial,
      rows,
      frontBackColumns,
      "front",
      obstacle.size.z / 2 + 0.035,
    );
    this.addWindowGrid(
      obstacle,
      windowMaterial,
      rows,
      frontBackColumns,
      "back",
      -obstacle.size.z / 2 - 0.035,
    );
    this.addWindowGrid(
      obstacle,
      windowMaterial,
      rows,
      sideColumns,
      "right",
      obstacle.size.x / 2 + 0.035,
    );
    this.addWindowGrid(
      obstacle,
      windowMaterial,
      rows,
      sideColumns,
      "left",
      -obstacle.size.x / 2 - 0.035,
    );
  }

  private addWindowGrid(
    obstacle: TerrainObstacle,
    windowMaterial: THREE.MeshStandardMaterial,
    rows: number,
    columns: number,
    side: "front" | "back" | "left" | "right",
    offset: number,
  ): void {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const windowMesh = polishedMesh(new THREE.PlaneGeometry(2.2, 1.4), windowMaterial);
        const y = 3.4 + row * 5.2;
        const fraction = columns === 1 ? 0.5 : column / (columns - 1);
        if (side === "front" || side === "back") {
          const x =
            obstacle.position.x - obstacle.size.x * 0.36 + fraction * obstacle.size.x * 0.72;
          const z = obstacle.position.z + offset;
          windowMesh.position.set(x, y, z);
          if (side === "back") {
            windowMesh.rotation.y = Math.PI;
          }
        } else {
          const x = obstacle.position.x + offset;
          const z =
            obstacle.position.z - obstacle.size.z * 0.36 + fraction * obstacle.size.z * 0.72;
          windowMesh.position.set(x, y, z);
          windowMesh.rotation.y = side === "right" ? Math.PI / 2 : -Math.PI / 2;
        }
        this.scene.add(windowMesh);
      }
    }
  }

  private addRockObstacle(obstacle: TerrainObstacle): void {
    const rockMaterial = material(obstacle.id.startsWith("field") ? "#706a5e" : "#57534e", {
      roughness: 0.92,
    });
    const highlightMaterial = material("#a8a29e", { roughness: 0.88 });
    const rock = polishedMesh(new THREE.DodecahedronGeometry(1, 0), rockMaterial);
    rock.scale.set(obstacle.size.x * 0.55, obstacle.size.y * 0.5, obstacle.size.z * 0.55);
    rock.rotation.set(obstacle.size.x * 0.09, obstacle.size.z * 0.07, obstacle.size.y * 0.04);
    rock.position.set(
      obstacle.position.x,
      obstacle.position.y + obstacle.size.y / 2,
      obstacle.position.z,
    );
    rock.name = obstacle.id;
    this.scene.add(rock);

    const cap = polishedMesh(new THREE.TetrahedronGeometry(0.5, 0), highlightMaterial);
    cap.scale.set(obstacle.size.x * 0.35, obstacle.size.y * 0.2, obstacle.size.z * 0.28);
    cap.rotation.set(-0.5, 0.2, 0.4);
    cap.position.set(
      obstacle.position.x - obstacle.size.x * 0.12,
      obstacle.position.y + obstacle.size.y * 0.78,
      obstacle.position.z + obstacle.size.z * 0.08,
    );
    this.scene.add(cap);
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
    const materials = this.createUnitMaterials(definition);
    const group = new THREE.Group();

    if (definition.id === "roman_legionary") {
      return this.createRomanLegionary(group, definition, materials);
    }
    if (definition.id === "medieval_knight") {
      return this.createMedievalKnight(group, definition, materials);
    }
    if (definition.id === "samurai") {
      return this.createSamurai(group, definition, materials);
    }
    if (definition.category === "modern") {
      return this.createModernInfantry(group, definition, materials);
    }
    if (definition.id === "wolf") {
      return this.createWolf(group, definition, materials);
    }
    if (definition.id === "grizzly_bear") {
      return this.createGrizzlyBear(group, definition, materials);
    }
    if (definition.id === "african_elephant") {
      return this.createElephant(group, definition, materials);
    }
    if (definition.visual.archetype === "warlord") {
      return this.createWarlord(group, definition, materials);
    }
    if (definition.visual.archetype === "powered_armor") {
      return this.createPoweredArmor(group, definition, materials);
    }
    if (definition.visual.archetype === "android") {
      return this.createAndroid(group, definition, materials);
    }

    this.addHumanoidBase(group, definition.size, materials);
    group.userData.visualScale = 1.32;
    return group;
  }

  private createUnitMaterials(definition: UnitDefinition): UnitMaterials {
    const fiction = definition.category === "fiction";
    const modern = definition.category === "modern";
    return {
      primary: material(definition.visual.primaryColor, {
        roughness: fiction ? 0.44 : 0.66,
        metalness: modern || fiction ? 0.16 : 0.02,
      }),
      secondary: material(definition.visual.secondaryColor, {
        roughness: fiction ? 0.4 : 0.58,
        metalness: fiction ? 0.24 : 0.06,
      }),
      accent: material(definition.visual.accentColor, {
        roughness: fiction ? 0.32 : 0.48,
        metalness: fiction || modern ? 0.34 : 0.08,
      }),
      dark: material("#111827", { roughness: 0.62, metalness: modern || fiction ? 0.22 : 0.04 }),
      light: material("#f8fafc", { roughness: 0.5, metalness: 0.04 }),
      leather: material("#5c3a1f", { roughness: 0.72 }),
      metal: material("#cbd5e1", { roughness: 0.34, metalness: 0.55 }),
      energy: material(definition.visual.accentColor, {
        roughness: 0.18,
        metalness: 0.08,
        emissive: definition.visual.accentColor,
        emissiveIntensity: fiction ? 0.7 : 0.2,
      }),
    };
  }

  private addHumanoidBase(
    group: THREE.Group,
    scale: number,
    materials: UnitMaterials,
    options: { armored?: boolean; helmetMaterial?: THREE.MeshStandardMaterial } = {},
  ): void {
    const body = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.25, scale * 0.72, 8, 14),
      materials.primary,
    );
    body.position.y = scale * 1.04;
    const chest = polishedMesh(
      new THREE.BoxGeometry(scale * 0.48, scale * 0.42, scale * 0.2),
      options.armored ? materials.metal : materials.secondary,
    );
    chest.position.set(0, scale * 1.12, scale * 0.06);
    const head = polishedMesh(new THREE.IcosahedronGeometry(scale * 0.22, 1), materials.light);
    head.position.y = scale * 1.68;
    const helmet = polishedMesh(
      new THREE.SphereGeometry(scale * 0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      options.helmetMaterial ?? materials.secondary,
    );
    helmet.position.y = scale * 1.78;
    const leftArm = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.045, scale * 0.44, 5, 8),
      materials.secondary,
    );
    const rightArm = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.045, scale * 0.44, 5, 8),
      materials.secondary,
    );
    leftArm.rotation.z = -0.36;
    rightArm.rotation.z = 0.36;
    leftArm.position.set(scale * -0.35, scale * 1.13, 0);
    rightArm.position.set(scale * 0.35, scale * 1.13, 0);
    const leftLeg = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.06, scale * 0.54, 5, 8),
      materials.dark,
    );
    const rightLeg = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.06, scale * 0.54, 5, 8),
      materials.dark,
    );
    leftLeg.position.set(scale * -0.14, scale * 0.38, 0);
    rightLeg.position.set(scale * 0.14, scale * 0.38, 0);
    group.add(body, chest, head, helmet, leftArm, rightArm, leftLeg, rightLeg);
  }

  private createRomanLegionary(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    this.addHumanoidBase(group, scale, materials, { helmetMaterial: materials.metal });
    const shieldX = scale * -0.44;
    const shieldY = scale * 1.08;
    const shieldZ = scale * 0.34;
    const scutum = polishedMesh(
      new THREE.BoxGeometry(scale * 0.44, scale * 0.78, scale * 0.075),
      materials.primary,
    );
    scutum.position.set(shieldX, shieldY, shieldZ);
    const topTrim = polishedMesh(
      new THREE.BoxGeometry(scale * 0.48, scale * 0.055, scale * 0.085),
      materials.accent,
    );
    const bottomTrim = topTrim.clone();
    topTrim.position.set(shieldX, shieldY + scale * 0.38, shieldZ + scale * 0.01);
    bottomTrim.position.set(shieldX, shieldY - scale * 0.38, shieldZ + scale * 0.01);
    const leftTrim = polishedMesh(
      new THREE.BoxGeometry(scale * 0.055, scale * 0.78, scale * 0.085),
      materials.accent,
    );
    const rightTrim = leftTrim.clone();
    leftTrim.position.set(shieldX - scale * 0.22, shieldY, shieldZ + scale * 0.01);
    rightTrim.position.set(shieldX + scale * 0.22, shieldY, shieldZ + scale * 0.01);
    const boss = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.08, scale * 0.08, scale * 0.045, 14),
      materials.metal,
    );
    boss.rotation.x = Math.PI / 2;
    boss.position.set(shieldX, shieldY, shieldZ + scale * 0.065);
    const crest = polishedMesh(
      new THREE.BoxGeometry(scale * 0.12, scale * 0.18, scale * 0.58),
      materials.primary,
    );
    crest.position.set(0, scale * 1.98, 0);
    const gladius = polishedMesh(
      new THREE.BoxGeometry(scale * 0.05, scale * 0.48, scale * 0.035),
      materials.metal,
    );
    gladius.rotation.z = -0.34;
    gladius.position.set(scale * 0.42, scale * 1.05, scale * 0.34);
    const pilum = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.018, scale * 0.018, scale * 1.35, 8),
      materials.leather,
    );
    pilum.rotation.z = Math.PI / 2.2;
    pilum.position.set(scale * 0.12, scale * 1.36, scale * -0.3);
    group.add(scutum, topTrim, bottomTrim, leftTrim, rightTrim, boss, crest, gladius, pilum);
    group.userData.visualScale = 1.3;
    return group;
  }

  private createMedievalKnight(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    this.addHumanoidBase(group, scale, materials, {
      armored: true,
      helmetMaterial: materials.metal,
    });
    const helm = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.2, scale * 0.23, scale * 0.32, 14),
      materials.metal,
    );
    helm.position.y = scale * 1.68;
    const visor = polishedMesh(
      new THREE.BoxGeometry(scale * 0.28, scale * 0.055, scale * 0.06),
      materials.dark,
    );
    visor.position.set(0, scale * 1.72, scale * 0.22);
    const leftShoulder = polishedMesh(
      new THREE.BoxGeometry(scale * 0.22, scale * 0.14, scale * 0.3),
      materials.metal,
    );
    const rightShoulder = leftShoulder.clone();
    leftShoulder.position.set(scale * -0.34, scale * 1.36, scale * 0.04);
    rightShoulder.position.set(scale * 0.34, scale * 1.36, scale * 0.04);
    const kiteShield = this.createKiteShield(scale, materials.accent);
    kiteShield.position.set(scale * -0.44, scale * 1.06, scale * 0.31);
    const swordBlade = polishedMesh(
      new THREE.BoxGeometry(scale * 0.045, scale * 0.82, scale * 0.035),
      materials.metal,
    );
    swordBlade.rotation.z = -0.5;
    swordBlade.position.set(scale * 0.52, scale * 1.14, scale * 0.34);
    const swordGuard = polishedMesh(
      new THREE.BoxGeometry(scale * 0.22, scale * 0.035, scale * 0.05),
      materials.accent,
    );
    swordGuard.rotation.z = -0.5;
    swordGuard.position.set(scale * 0.35, scale * 0.84, scale * 0.34);
    const lance = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.018, scale * 0.022, scale * 1.65, 8),
      materials.leather,
    );
    lance.rotation.z = Math.PI / 2.8;
    lance.position.set(scale * 0.35, scale * 1.46, scale * -0.2);
    group.add(helm, visor, leftShoulder, rightShoulder, kiteShield, swordBlade, swordGuard, lance);
    group.userData.visualScale = 1.25;
    return group;
  }

  private createSamurai(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    this.addHumanoidBase(group, scale, materials, { helmetMaterial: materials.dark });
    for (let row = 0; row < 4; row += 1) {
      const plate = polishedMesh(
        new THREE.BoxGeometry(scale * 0.54, scale * 0.055, scale * 0.24),
        row % 2 === 0 ? materials.secondary : materials.primary,
      );
      plate.position.set(0, scale * (1.28 - row * 0.1), scale * 0.12);
      group.add(plate);
    }
    const kabutoCrest = polishedMesh(
      new THREE.ConeGeometry(scale * 0.055, scale * 0.38, 8),
      materials.accent,
    );
    kabutoCrest.rotation.z = Math.PI;
    kabutoCrest.position.set(0, scale * 1.98, scale * 0.02);
    const leftHorn = polishedMesh(
      new THREE.ConeGeometry(scale * 0.035, scale * 0.32, 8),
      materials.accent,
    );
    const rightHorn = polishedMesh(
      new THREE.ConeGeometry(scale * 0.035, scale * 0.32, 8),
      materials.accent,
    );
    leftHorn.rotation.z = -0.78;
    rightHorn.rotation.z = 0.78;
    leftHorn.position.set(scale * -0.18, scale * 1.92, 0);
    rightHorn.position.set(scale * 0.18, scale * 1.92, 0);
    const shoulderLeft = polishedMesh(
      new THREE.BoxGeometry(scale * 0.24, scale * 0.1, scale * 0.28),
      materials.secondary,
    );
    const shoulderRight = shoulderLeft.clone();
    shoulderLeft.position.set(scale * -0.36, scale * 1.28, scale * 0.05);
    shoulderRight.position.set(scale * 0.36, scale * 1.28, scale * 0.05);
    const blade = polishedMesh(
      new THREE.BoxGeometry(scale * 0.035, scale * 0.72, scale * 0.025),
      materials.metal,
    );
    blade.rotation.z = -0.72;
    blade.position.set(scale * 0.48, scale * 1.12, scale * 0.34);
    const handle = polishedMesh(
      new THREE.BoxGeometry(scale * 0.055, scale * 0.28, scale * 0.04),
      materials.dark,
    );
    handle.rotation.z = -0.72;
    handle.position.set(scale * 0.24, scale * 0.84, scale * 0.34);
    const sash = polishedMesh(
      new THREE.BoxGeometry(scale * 0.58, scale * 0.08, scale * 0.26),
      materials.accent,
    );
    sash.position.set(0, scale * 0.94, scale * 0.04);
    group.add(kabutoCrest, leftHorn, rightHorn, shoulderLeft, shoulderRight, blade, handle, sash);
    group.userData.visualScale = 1.28;
    return group;
  }

  private createModernInfantry(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    this.addHumanoidBase(group, scale, materials, {
      armored: true,
      helmetMaterial: materials.primary,
    });
    const vest = polishedMesh(
      new THREE.BoxGeometry(scale * 0.52, scale * 0.44, scale * 0.24),
      materials.secondary,
    );
    vest.position.set(0, scale * 1.12, scale * 0.1);
    const helmetBand = polishedMesh(
      new THREE.BoxGeometry(scale * 0.34, scale * 0.05, scale * 0.12),
      materials.dark,
    );
    helmetBand.position.set(0, scale * 1.78, scale * 0.18);
    const rifle = polishedMesh(
      new THREE.BoxGeometry(scale * 0.92, scale * 0.06, scale * 0.065),
      materials.dark,
    );
    rifle.position.set(scale * 0.34, scale * 1.08, scale * 0.42);
    rifle.rotation.z = -0.08;
    const barrel = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.018, scale * 0.018, scale * 0.38, 8),
      materials.dark,
    );
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(scale * 0.9, scale * 1.08, scale * 0.42);
    const backpack = polishedMesh(
      new THREE.BoxGeometry(scale * 0.36, scale * 0.44, scale * 0.18),
      materials.dark,
    );
    backpack.position.set(0, scale * 1.12, scale * -0.2);
    const pouchLeft = polishedMesh(
      new THREE.BoxGeometry(scale * 0.13, scale * 0.12, scale * 0.08),
      materials.leather,
    );
    const pouchRight = pouchLeft.clone();
    pouchLeft.position.set(scale * -0.17, scale * 0.98, scale * 0.24);
    pouchRight.position.set(scale * 0.17, scale * 0.98, scale * 0.24);
    group.add(vest, helmetBand, rifle, barrel, backpack, pouchLeft, pouchRight);

    if (definition.id === "special_operations_soldier") {
      const visor = polishedMesh(
        new THREE.BoxGeometry(scale * 0.3, scale * 0.07, scale * 0.08),
        materials.energy,
      );
      visor.position.set(0, scale * 1.73, scale * 0.23);
      const leftTube = polishedMesh(
        new THREE.CylinderGeometry(scale * 0.025, scale * 0.025, scale * 0.22, 8),
        materials.dark,
      );
      const rightTube = leftTube.clone();
      leftTube.rotation.x = Math.PI / 2;
      rightTube.rotation.x = Math.PI / 2;
      leftTube.position.set(scale * -0.06, scale * 1.82, scale * 0.32);
      rightTube.position.set(scale * 0.06, scale * 1.82, scale * 0.32);
      const suppressor = polishedMesh(
        new THREE.CylinderGeometry(scale * 0.022, scale * 0.022, scale * 0.34, 8),
        materials.dark,
      );
      suppressor.rotation.z = Math.PI / 2;
      suppressor.position.set(scale * 1.13, scale * 1.08, scale * 0.42);
      group.add(visor, leftTube, rightTube, suppressor);
    } else if (definition.id === "us_marine") {
      const shoulderPatch = polishedMesh(
        new THREE.BoxGeometry(scale * 0.08, scale * 0.11, scale * 0.04),
        materials.accent,
      );
      shoulderPatch.position.set(scale * 0.39, scale * 1.28, scale * 0.08);
      group.add(shoulderPatch);
    }

    group.userData.visualScale = 1.28;
    return group;
  }

  private createWolf(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    const body = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.18, scale * 0.9, 8, 12),
      materials.primary,
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = scale * 0.58;
    const chest = polishedMesh(new THREE.IcosahedronGeometry(scale * 0.2, 1), materials.secondary);
    chest.scale.set(1.15, 0.9, 0.8);
    chest.position.set(scale * 0.45, scale * 0.62, 0);
    const head = polishedMesh(new THREE.IcosahedronGeometry(scale * 0.2, 1), materials.primary);
    head.scale.set(1.05, 0.82, 0.78);
    head.position.set(scale * 0.78, scale * 0.78, 0);
    const snout = polishedMesh(
      new THREE.ConeGeometry(scale * 0.08, scale * 0.24, 8),
      materials.secondary,
    );
    snout.rotation.z = -Math.PI / 2;
    snout.position.set(scale * 0.97, scale * 0.76, 0);
    const leftEar = polishedMesh(
      new THREE.ConeGeometry(scale * 0.045, scale * 0.18, 8),
      materials.dark,
    );
    const rightEar = leftEar.clone();
    leftEar.position.set(scale * 0.72, scale * 0.98, scale * 0.08);
    rightEar.position.set(scale * 0.72, scale * 0.98, scale * -0.08);
    for (const x of [-0.42, 0.32]) {
      for (const z of [-0.12, 0.12]) {
        const leg = polishedMesh(
          new THREE.CapsuleGeometry(scale * 0.035, scale * 0.34, 5, 8),
          materials.dark,
        );
        leg.position.set(scale * x, scale * 0.26, scale * z);
        group.add(leg);
      }
    }
    const tail = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.035, scale * 0.055, scale * 0.48, 8),
      materials.primary,
    );
    tail.rotation.z = Math.PI / 2.7;
    tail.position.set(scale * -0.72, scale * 0.72, 0);
    group.add(body, chest, head, snout, leftEar, rightEar, tail);
    group.userData.visualScale = 1.35;
    return group;
  }

  private createGrizzlyBear(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    const body = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.28, scale * 0.9, 8, 12),
      materials.primary,
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = scale * 0.66;
    const shoulderHump = polishedMesh(
      new THREE.IcosahedronGeometry(scale * 0.34, 1),
      materials.secondary,
    );
    shoulderHump.scale.set(1.08, 0.72, 0.82);
    shoulderHump.position.set(scale * 0.18, scale * 0.92, 0);
    const head = polishedMesh(new THREE.IcosahedronGeometry(scale * 0.24, 1), materials.primary);
    head.scale.set(1.08, 0.92, 0.88);
    head.position.set(scale * 0.78, scale * 0.78, 0);
    const muzzle = polishedMesh(
      new THREE.ConeGeometry(scale * 0.11, scale * 0.28, 10),
      materials.secondary,
    );
    muzzle.rotation.z = -Math.PI / 2;
    muzzle.position.set(scale * 1.0, scale * 0.74, 0);
    const leftEar = polishedMesh(new THREE.SphereGeometry(scale * 0.075, 8, 6), materials.dark);
    const rightEar = leftEar.clone();
    leftEar.position.set(scale * 0.68, scale * 0.99, scale * 0.16);
    rightEar.position.set(scale * 0.68, scale * 0.99, scale * -0.16);
    for (const x of [-0.42, 0.32]) {
      for (const z of [-0.16, 0.16]) {
        const paw = polishedMesh(
          new THREE.CapsuleGeometry(scale * 0.07, scale * 0.42, 5, 8),
          materials.dark,
        );
        paw.position.set(scale * x, scale * 0.28, scale * z);
        group.add(paw);
      }
    }
    group.add(body, shoulderHump, head, muzzle, leftEar, rightEar);
    group.userData.visualScale = 1.12;
    return group;
  }

  private createElephant(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    const body = polishedMesh(
      new THREE.CapsuleGeometry(scale * 0.34, scale * 1.24, 10, 14),
      materials.primary,
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = scale * 0.74;
    const head = polishedMesh(new THREE.SphereGeometry(scale * 0.32, 16, 12), materials.secondary);
    head.scale.set(1.08, 0.95, 0.9);
    head.position.set(scale * 0.88, scale * 0.88, 0);
    for (const x of [-0.38, 0.42]) {
      for (const z of [-0.24, 0.24]) {
        const leg = polishedMesh(
          new THREE.CylinderGeometry(scale * 0.09, scale * 0.11, scale * 0.66, 10),
          materials.secondary,
        );
        leg.position.set(scale * x, scale * 0.32, scale * z);
        group.add(leg);
      }
    }
    const trunk = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.055, scale * 0.095, scale * 0.84, 12),
      materials.secondary,
    );
    trunk.rotation.z = Math.PI / 3.2;
    trunk.position.set(scale * 1.1, scale * 0.53, 0);
    const leftTusk = polishedMesh(
      new THREE.ConeGeometry(scale * 0.028, scale * 0.42, 10),
      materials.light,
    );
    const rightTusk = leftTusk.clone();
    leftTusk.rotation.z = -Math.PI / 2.4;
    rightTusk.rotation.z = -Math.PI / 2.4;
    leftTusk.position.set(scale * 1.16, scale * 0.8, scale * 0.14);
    rightTusk.position.set(scale * 1.16, scale * 0.8, scale * -0.14);
    const leftEar = polishedMesh(new THREE.CircleGeometry(scale * 0.24, 18), materials.primary);
    const rightEar = leftEar.clone();
    leftEar.rotation.y = Math.PI / 2;
    rightEar.rotation.y = Math.PI / 2;
    leftEar.position.set(scale * 0.68, scale * 0.92, scale * 0.32);
    rightEar.position.set(scale * 0.68, scale * 0.92, scale * -0.32);
    const tail = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.018, scale * 0.028, scale * 0.42, 8),
      materials.dark,
    );
    tail.rotation.z = Math.PI / 2.5;
    tail.position.set(scale * -0.82, scale * 0.7, 0);
    group.add(body, head, trunk, leftTusk, rightTusk, leftEar, rightEar, tail);
    group.userData.visualScale = 1.08;
    return group;
  }

  private createWarlord(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    this.addHumanoidBase(group, scale, materials, {
      armored: true,
      helmetMaterial: materials.dark,
    });
    const cloak = polishedMesh(
      new THREE.ConeGeometry(scale * 0.58, scale * 1.25, 18, 1, true),
      materials.secondary,
    );
    cloak.position.set(0, scale * 0.84, scale * -0.18);
    cloak.rotation.x = Math.PI;
    const hood = polishedMesh(
      new THREE.ConeGeometry(scale * 0.28, scale * 0.42, 14),
      materials.dark,
    );
    hood.position.y = scale * 1.84;
    const blade = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.025, scale * 0.035, scale * 1.25, 10),
      materials.energy,
    );
    blade.rotation.z = Math.PI / 2;
    blade.position.set(scale * 0.7, scale * 1.2, scale * 0.36);
    const aura = polishedMesh(
      new THREE.TorusGeometry(scale * 0.62, scale * 0.018, 8, 36),
      materials.energy,
    );
    aura.rotation.x = Math.PI / 2;
    aura.position.y = scale * 0.05;
    group.add(cloak, hood, blade, aura);
    group.userData.visualScale = 1.28;
    return group;
  }

  private createPoweredArmor(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    const torso = polishedMesh(
      new THREE.BoxGeometry(scale * 0.58, scale * 0.8, scale * 0.36),
      materials.primary,
    );
    torso.position.y = scale * 1.08;
    const helmet = polishedMesh(
      new THREE.BoxGeometry(scale * 0.34, scale * 0.32, scale * 0.3),
      materials.primary,
    );
    helmet.position.y = scale * 1.68;
    const faceplate = polishedMesh(
      new THREE.BoxGeometry(scale * 0.24, scale * 0.07, scale * 0.045),
      materials.energy,
    );
    faceplate.position.set(0, scale * 1.7, scale * 0.18);
    for (const x of [-0.42, 0.42]) {
      const shoulder = polishedMesh(
        new THREE.BoxGeometry(scale * 0.28, scale * 0.2, scale * 0.42),
        materials.accent,
      );
      shoulder.position.set(scale * x, scale * 1.38, 0);
      const arm = polishedMesh(
        new THREE.BoxGeometry(scale * 0.16, scale * 0.58, scale * 0.18),
        materials.primary,
      );
      arm.position.set(scale * x, scale * 0.95, scale * 0.02);
      const repulsor = polishedMesh(
        new THREE.SphereGeometry(scale * 0.06, 10, 8),
        materials.energy,
      );
      repulsor.position.set(scale * x, scale * 0.68, scale * 0.11);
      group.add(shoulder, arm, repulsor);
    }
    for (const x of [-0.17, 0.17]) {
      const leg = polishedMesh(
        new THREE.BoxGeometry(scale * 0.16, scale * 0.68, scale * 0.2),
        materials.primary,
      );
      leg.position.set(scale * x, scale * 0.34, 0);
      group.add(leg);
    }
    const jetpack = polishedMesh(
      new THREE.BoxGeometry(scale * 0.38, scale * 0.62, scale * 0.16),
      materials.dark,
    );
    jetpack.position.set(0, scale * 1.08, scale * -0.3);
    const leftWing = polishedMesh(
      new THREE.BoxGeometry(scale * 0.11, scale * 0.42, scale * 0.86),
      materials.accent,
    );
    const rightWing = leftWing.clone();
    leftWing.position.set(scale * -0.3, scale * 1.14, scale * -0.48);
    rightWing.position.set(scale * 0.3, scale * 1.14, scale * -0.48);
    const missilePod = polishedMesh(
      new THREE.BoxGeometry(scale * 0.46, scale * 0.12, scale * 0.18),
      materials.dark,
    );
    missilePod.position.set(0, scale * 1.55, scale * -0.18);
    group.add(torso, helmet, faceplate, jetpack, leftWing, rightWing, missilePod);
    group.userData.visualScale = 1.18;
    return group;
  }

  private createAndroid(
    group: THREE.Group,
    definition: UnitDefinition,
    materials: UnitMaterials,
  ): THREE.Group {
    const scale = definition.size;
    const torso = polishedMesh(
      new THREE.BoxGeometry(scale * 0.42, scale * 0.7, scale * 0.24),
      materials.primary,
    );
    torso.position.y = scale * 1.08;
    const head = polishedMesh(
      new THREE.BoxGeometry(scale * 0.28, scale * 0.24, scale * 0.24),
      materials.primary,
    );
    head.position.y = scale * 1.62;
    const visor = polishedMesh(
      new THREE.BoxGeometry(scale * 0.24, scale * 0.05, scale * 0.045),
      materials.energy,
    );
    visor.position.set(0, scale * 1.62, scale * 0.15);
    for (const x of [-0.32, 0.32]) {
      const upperArm = polishedMesh(
        new THREE.CylinderGeometry(scale * 0.045, scale * 0.045, scale * 0.42, 8),
        materials.secondary,
      );
      upperArm.rotation.z = x < 0 ? -0.22 : 0.22;
      upperArm.position.set(scale * x, scale * 1.12, 0);
      const leg = polishedMesh(
        new THREE.CylinderGeometry(scale * 0.06, scale * 0.055, scale * 0.58, 8),
        materials.secondary,
      );
      leg.position.set(scale * (x * 0.42), scale * 0.36, 0);
      group.add(upperArm, leg);
    }
    const antenna = polishedMesh(
      new THREE.CylinderGeometry(scale * 0.01, scale * 0.012, scale * 0.34, 6),
      materials.energy,
    );
    antenna.position.set(scale * 0.12, scale * 1.88, 0);
    const rifle = polishedMesh(
      new THREE.BoxGeometry(scale * 0.82, scale * 0.055, scale * 0.055),
      materials.dark,
    );
    rifle.position.set(scale * 0.36, scale * 1.05, scale * 0.34);
    group.add(torso, head, visor, antenna, rifle);
    group.userData.visualScale = 1.3;
    return group;
  }

  private createKiteShield(scale: number, shieldMaterial: THREE.MeshStandardMaterial): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, scale * 0.45);
    shape.lineTo(scale * 0.28, scale * 0.14);
    shape.lineTo(scale * 0.2, scale * -0.34);
    shape.lineTo(0, scale * -0.52);
    shape.lineTo(scale * -0.2, scale * -0.34);
    shape.lineTo(scale * -0.28, scale * 0.14);
    shape.lineTo(0, scale * 0.45);
    const shield = polishedMesh(new THREE.ShapeGeometry(shape), shieldMaterial);
    return shield;
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
