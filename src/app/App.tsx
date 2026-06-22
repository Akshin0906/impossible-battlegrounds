import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bug,
  Camera,
  CheckCircle2,
  Copy,
  Crosshair,
  Gauge,
  MapIcon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Shield,
  Shuffle,
  SkipForward,
  Swords,
  Trash2,
} from "lucide-react";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  ArmyDraft,
  ArmyId,
  BattleResult,
  BattleSetupDraft,
  DeploymentRole,
  SquadDraft,
} from "../domain/battle";
import { loadContentRegistry, type ContentRegistry } from "../domain/content";
import { DAMAGE_CAUSE_LABEL, formatTime, summarizeOutcome } from "../domain/report";
import { BattleScene } from "../render/BattleScene";
import { unitStateAt } from "../render/timelinePlayer";
import {
  createDefaultSetup,
  performanceWarningForCount,
  totalUnitsInDraft,
  validateBattleSetupDraft,
} from "../simulation/normalizeSetup";
import { estimateVagueOdds } from "../simulation/odds";
import {
  WORKER_PROTOCOL_VERSION,
  type SimulationWorkerRequest,
  type SimulationWorkerResponse,
} from "../workers/workerProtocol";
import "../styles/main.css";

type Screen = "setup" | "loading" | "playback" | "report" | "error";

type LoadingState = {
  step: string;
  progress: number;
};

type SimulationError = {
  title: string;
  message: string;
  diagnostics: string[];
  developerDetail?: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

const SIMULATION_TIMEOUT_MS = 60_000;

const roleLabels: Record<DeploymentRole, string> = {
  front: "Front",
  support: "Support",
  flank: "Flank",
};

const distanceOptions = [10, 25, 50, 100, 200, 300, 500];

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const createSeed = (): string => {
  const array = new Uint32Array(2);
  crypto.getRandomValues(array);
  return `${array[0]!.toString(16)}${array[1]!.toString(16)}`;
};

const createSquadId = (armyId: ArmyId, unitTypeId: string): string =>
  `${armyId}-${unitTypeId}-${crypto.randomUUID()}`;

const cloneSetup = (setup: BattleSetupDraft): BattleSetupDraft =>
  JSON.parse(JSON.stringify(setup)) as BattleSetupDraft;

const totalForArmy = (army: ArmyDraft): number =>
  army.squads.reduce((total, squad) => total + squad.count, 0);

const defaultSquadForUnit = (
  registry: ContentRegistry,
  unitTypeId: string,
  armyId: ArmyId,
): SquadDraft => {
  const unit = registry.unitMap.get(unitTypeId)!;
  const loadout = registry.loadoutMap.get(unit.allowedLoadouts[0]!)!;
  return {
    id: createSquadId(armyId, unitTypeId),
    unitTypeId,
    count: unit.category === "fiction" ? 1 : unit.category === "animal" ? 5 : 10,
    loadoutId: loadout.id,
    formationId: unit.allowedFormations[0]!,
    deploymentRole: unit.defaultDeploymentRole,
    toggles: { ...loadout.toggles },
  };
};

const updateSquadForUnit = (
  registry: ContentRegistry,
  squad: SquadDraft,
  unitTypeId: string,
): SquadDraft => {
  const unit = registry.unitMap.get(unitTypeId)!;
  const loadout = registry.loadoutMap.get(unit.allowedLoadouts[0]!)!;
  return {
    ...squad,
    unitTypeId,
    loadoutId: loadout.id,
    formationId: unit.allowedFormations[0]!,
    deploymentRole: unit.defaultDeploymentRole,
    toggles: { ...loadout.toggles },
  };
};

const applyLoadout = (
  registry: ContentRegistry,
  squad: SquadDraft,
  loadoutId: string,
): SquadDraft => {
  const loadout = registry.loadoutMap.get(loadoutId)!;
  return { ...squad, loadoutId, toggles: { ...loadout.toggles } };
};

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (!navigator.clipboard) {
    throw new Error("Clipboard API is unavailable.");
  }
  await navigator.clipboard.writeText(text);
};

const squadDiagnostics = (registry: ContentRegistry, squad: SquadDraft): string[] => {
  const diagnostics: string[] = [];
  const unit = registry.unitMap.get(squad.unitTypeId);
  if (!unit) {
    diagnostics.push(`Unknown unit '${squad.unitTypeId}'`);
    return diagnostics;
  }
  if (!Number.isInteger(squad.count) || squad.count < 1 || squad.count > 2000) {
    diagnostics.push(`${unit.displayName} count must be between 1 and 2000`);
  }
  if (!unit.allowedLoadouts.includes(squad.loadoutId)) {
    diagnostics.push(`${unit.displayName} cannot use loadout '${squad.loadoutId}'`);
  }
  if (!unit.allowedFormations.includes(squad.formationId)) {
    diagnostics.push(`${unit.displayName} cannot use formation '${squad.formationId}'`);
  }
  if (!["front", "support", "flank"].includes(squad.deploymentRole)) {
    diagnostics.push(`${unit.displayName} has invalid deployment role '${squad.deploymentRole}'`);
  }
  return diagnostics;
};

const DiagnosticsList = ({
  diagnostics,
  id,
  compact = false,
}: {
  diagnostics: string[];
  id?: string;
  compact?: boolean;
}) => {
  if (diagnostics.length === 0) {
    return null;
  }
  return (
    <div
      className={compact ? "diagnostics diagnostics-compact" : "diagnostics"}
      id={id}
      role="alert"
    >
      <AlertTriangle size={16} />
      <ul>
        {diagnostics.map((diagnostic) => (
          <li key={diagnostic}>{diagnostic}</li>
        ))}
      </ul>
    </div>
  );
};

const CopySeedButton = ({
  seed,
  iconOnly = false,
  className,
}: {
  seed: string;
  iconOnly?: boolean;
  className?: string;
}) => {
  const [status, setStatus] = useState("");
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (timeoutRef.current !== undefined) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const handleCopy = async () => {
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
    }
    try {
      await copyTextToClipboard(seed);
      setStatus("Seed copied");
    } catch {
      setStatus("Copy failed");
    }
    timeoutRef.current = window.setTimeout(() => {
      setStatus("");
      timeoutRef.current = undefined;
    }, 2200);
  };

  return (
    <span className="copy-seed-control">
      <button
        aria-label={`Copy seed ${seed}`}
        className={className}
        title="Copy seed"
        type="button"
        onClick={() => {
          void handleCopy();
        }}
      >
        <Copy size={16} />
        {!iconOnly && <span>Copy seed</span>}
      </button>
      <span aria-live="polite" className="copy-status" role="status">
        {status}
      </span>
    </span>
  );
};

const SummaryTile = ({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: string;
}) => (
  <div className={tone ? `summary-tile ${tone}` : "summary-tile"}>
    <span className="summary-icon">{icon}</span>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const AppFatalErrorScreen = ({
  error,
  errorInfo,
  onRetry,
}: {
  error: Error;
  errorInfo: ErrorInfo | null;
  onRetry: () => void;
}) => (
  <main className="error-screen">
    <section aria-live="assertive" className="panel error-panel" role="alert">
      <AlertTriangle size={28} />
      <div>
        <p className="eyebrow">Application error</p>
        <h1>Something broke before the battle could continue.</h1>
        <p>{error.message}</p>
        {errorInfo && (
          <details>
            <summary>Developer details</summary>
            <pre>{errorInfo.componentStack}</pre>
          </details>
        )}
        <button className="primary" type="button" onClick={onRetry}>
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    </section>
  </main>
);

class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Pick<AppErrorBoundaryState, "error"> {
    return { error };
  }

  componentDidCatch(_error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
  }

  private readonly retry = () => {
    this.setState({ error: null, errorInfo: null });
  };

  render() {
    if (this.state.error) {
      return (
        <AppFatalErrorScreen
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.retry}
        />
      );
    }
    return this.props.children;
  }
}

const ArmyPanel = ({
  registry,
  armyId,
  army,
  onChange,
}: {
  registry: ContentRegistry;
  armyId: ArmyId;
  army: ArmyDraft;
  onChange: (army: ArmyDraft) => void;
}) => {
  const updateSquad = (index: number, next: SquadDraft) => {
    onChange({
      squads: army.squads.map((squad, squadIndex) => (squadIndex === index ? next : squad)),
    });
  };
  const addSquad = () => {
    onChange({
      squads: [...army.squads, defaultSquadForUnit(registry, registry.units[0]!.id, armyId)],
    });
  };
  return (
    <section
      className={`panel army-panel army-${armyId.toLowerCase()}`}
      aria-label={`Army ${armyId}`}
    >
      <div className="army-header">
        <div className="army-mark" aria-hidden="true">
          {armyId}
        </div>
        <div>
          <p className="eyebrow army-eyebrow">Deployment</p>
          <h2>Army {armyId}</h2>
        </div>
        <span className="unit-count-badge">{totalForArmy(army)} units</span>
      </div>
      <div className="squad-list">
        {army.squads.map((squad, index) => {
          const unit = registry.unitMap.get(squad.unitTypeId)!;
          const allowedLoadouts = unit.allowedLoadouts.map((id) => registry.loadoutMap.get(id)!);
          const currentLoadout = registry.loadoutMap.get(squad.loadoutId)!;
          const rowDiagnostics = squadDiagnostics(registry, squad);
          const diagnosticId = `${squad.id}-diagnostics`;
          return (
            <article
              aria-describedby={rowDiagnostics.length > 0 ? diagnosticId : undefined}
              aria-invalid={rowDiagnostics.length > 0 ? true : undefined}
              className={rowDiagnostics.length > 0 ? "squad-row has-diagnostics" : "squad-row"}
              key={squad.id}
            >
              <div className="squad-header">
                <div>
                  <span className="squad-index">Squad {index + 1}</span>
                  <strong>{unit.displayName}</strong>
                </div>
                <span className="role-badge">{roleLabels[squad.deploymentRole]}</span>
              </div>
              <div className="squad-main">
                <label>
                  <span>Unit</span>
                  <select
                    value={squad.unitTypeId}
                    onChange={(event) =>
                      updateSquad(index, updateSquadForUnit(registry, squad, event.target.value))
                    }
                  >
                    {registry.units.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Count</span>
                  <input
                    aria-invalid={
                      !Number.isInteger(squad.count) || squad.count < 1 || squad.count > 2000
                        ? true
                        : undefined
                    }
                    min={1}
                    max={2000}
                    type="number"
                    value={squad.count}
                    onChange={(event) =>
                      updateSquad(index, {
                        ...squad,
                        count: Math.max(1, Number(event.target.value)),
                      })
                    }
                  />
                </label>
              </div>
              <div className="squad-grid">
                <label>
                  <span>Loadout</span>
                  <select
                    aria-invalid={!unit.allowedLoadouts.includes(squad.loadoutId) || undefined}
                    value={squad.loadoutId}
                    onChange={(event) =>
                      updateSquad(index, applyLoadout(registry, squad, event.target.value))
                    }
                  >
                    {allowedLoadouts.map((loadout) => (
                      <option key={loadout.id} value={loadout.id}>
                        {loadout.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Formation</span>
                  <select
                    aria-invalid={!unit.allowedFormations.includes(squad.formationId) || undefined}
                    value={squad.formationId}
                    onChange={(event) =>
                      updateSquad(index, { ...squad, formationId: event.target.value })
                    }
                  >
                    {unit.allowedFormations.map((formationId) => (
                      <option key={formationId} value={formationId}>
                        {registry.formationMap.get(formationId)!.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="toggle-strip" aria-label="Loadout modifiers">
                {Object.entries(currentLoadout.toggles).map(([key, value]) => {
                  if (typeof value === "boolean") {
                    return (
                      <label className="check" key={key}>
                        <input
                          type="checkbox"
                          checked={squad.toggles[key] === true}
                          onChange={(event) =>
                            updateSquad(index, {
                              ...squad,
                              toggles: { ...squad.toggles, [key]: event.target.checked },
                            })
                          }
                        />
                        <span>{key}</span>
                      </label>
                    );
                  }
                  const options = currentLoadout.toggleOptions?.[key] ?? [value];
                  const selectedToggleValue =
                    typeof squad.toggles[key] === "string" ? squad.toggles[key] : value;
                  return (
                    <label className="mini-select" key={key}>
                      <span>{key}</span>
                      <select
                        value={selectedToggleValue}
                        onChange={(event) =>
                          updateSquad(index, {
                            ...squad,
                            toggles: { ...squad.toggles, [key]: event.target.value },
                          })
                        }
                      >
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
              <div
                className="role-strip segmented-control"
                role="group"
                aria-label="Deployment role"
              >
                {Object.entries(roleLabels).map(([role, label]) => (
                  <button
                    aria-pressed={squad.deploymentRole === role}
                    className={squad.deploymentRole === role ? "selected" : ""}
                    key={role}
                    type="button"
                    onClick={() =>
                      updateSquad(index, { ...squad, deploymentRole: role as DeploymentRole })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="squad-actions">
                <button
                  aria-label={`Duplicate squad ${index + 1} for Army ${armyId}`}
                  title="Duplicate squad"
                  type="button"
                  onClick={() =>
                    onChange({
                      squads: [
                        ...army.squads,
                        { ...squad, id: createSquadId(armyId, squad.unitTypeId) },
                      ],
                    })
                  }
                >
                  <Copy size={16} />
                </button>
                <button
                  aria-label={`Remove squad ${index + 1} from Army ${armyId}`}
                  title="Remove squad"
                  type="button"
                  onClick={() =>
                    onChange({
                      squads: army.squads.filter((_, squadIndex) => squadIndex !== index),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <DiagnosticsList compact diagnostics={rowDiagnostics} id={diagnosticId} />
            </article>
          );
        })}
      </div>
      <button className="secondary action-wide" type="button" onClick={addSquad}>
        <Plus size={16} />
        Add squad
      </button>
    </section>
  );
};

const SetupScreen = ({
  registry,
  setup,
  setSetup,
  onStart,
}: {
  registry: ContentRegistry;
  setup: BattleSetupDraft;
  setSetup: (setup: BattleSetupDraft) => void;
  onStart: () => void;
}) => {
  const diagnostics = validateBattleSetupDraft(setup, registry);
  const odds = diagnostics.length === 0 ? estimateVagueOdds(setup, registry) : "Invalid setup";
  const warning = performanceWarningForCount(totalUnitsInDraft(setup));
  const diagnosticsId = "setup-validation-diagnostics";
  return (
    <main className="setup-layout">
      <header className="app-header command-header">
        <div className="header-copy">
          <p className="eyebrow header-eyebrow">
            <Swords size={14} />
            Simulator console
          </p>
          <h1>Impossible Battlegrounds</h1>
          <p>Evidence-informed deterministic sandbox battles.</p>
        </div>
        <div className="command-visual" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="identity-pill">
          <Activity size={16} />
          v1 simulation
        </div>
      </header>
      <section className="mission-summary" aria-label="Battle summary">
        <SummaryTile
          icon={<Shield size={18} />}
          label="Army A"
          tone="army-a"
          value={`${totalForArmy(setup.armyA)} units`}
        />
        <SummaryTile
          icon={<Crosshair size={18} />}
          label="Army B"
          tone="army-b"
          value={`${totalForArmy(setup.armyB)} units`}
        />
        <SummaryTile
          icon={<MapIcon size={18} />}
          label="Terrain"
          value={registry.terrainMap.get(setup.terrainId)?.displayName ?? "Unknown"}
        />
        <SummaryTile icon={<Gauge size={18} />} label="Forecast" tone="forecast" value={odds} />
      </section>
      <div className="armies-grid">
        <ArmyPanel
          registry={registry}
          armyId="A"
          army={setup.armyA}
          onChange={(armyA) => setSetup({ ...setup, armyA })}
        />
        <ArmyPanel
          registry={registry}
          armyId="B"
          army={setup.armyB}
          onChange={(armyB) => setSetup({ ...setup, armyB })}
        />
      </div>
      <section className="panel setup-controls command-panel">
        <div className="setup-controls-header">
          <div>
            <p className="eyebrow">Scenario</p>
            <h2>Mission parameters</h2>
          </div>
          <strong className="odds-pill">{odds}</strong>
        </div>
        <div className="setup-control-grid">
          <label>
            <span>Terrain</span>
            <select
              value={setup.terrainId}
              onChange={(event) => setSetup({ ...setup, terrainId: event.target.value })}
            >
              {registry.terrains.map((terrain) => (
                <option key={terrain.id} value={terrain.id}>
                  {terrain.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Starting distance</span>
            <select
              value={setup.startingDistance}
              onChange={(event) =>
                setSetup({ ...setup, startingDistance: Number(event.target.value) })
              }
            >
              {distanceOptions.map((distance) => (
                <option key={distance} value={distance}>
                  {distance} meters
                </option>
              ))}
            </select>
          </label>
          <label className="seed-label">
            <span>Seed</span>
            <input
              aria-describedby={diagnostics.length > 0 ? diagnosticsId : undefined}
              aria-invalid={!setup.seed.trim() ? true : undefined}
              value={setup.seed}
              onChange={(event) => setSetup({ ...setup, seed: event.target.value })}
            />
          </label>
          <button
            aria-label="Randomize seed"
            title="Randomize seed"
            type="button"
            onClick={() => setSetup({ ...setup, seed: createSeed() })}
          >
            <Shuffle size={18} />
          </button>
          <CopySeedButton className="seed-copy-button" iconOnly seed={setup.seed} />
        </div>
        <div aria-live="polite" className="odds-row">
          {warning && <span className="warning">{warning}</span>}
        </div>
        <DiagnosticsList diagnostics={diagnostics} id={diagnosticsId} />
        <button
          className="primary start-button"
          disabled={diagnostics.length > 0}
          type="button"
          onClick={() => onStart()}
        >
          <Play size={18} />
          Start battle
        </button>
      </section>
    </main>
  );
};

const LoadingScreen = ({ loading }: { loading: LoadingState }) => {
  const progressPercent = Math.round(loading.progress * 100);
  return (
    <main aria-busy="true" className="loading-screen">
      <section aria-live="polite" className="panel loading-panel" role="status">
        <h1>Precomputing battle</h1>
        <p>{loading.step}</p>
        <div
          aria-label="Simulation progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progressPercent}
          aria-valuetext={`${progressPercent}%`}
          className="progress-bar"
          role="progressbar"
        >
          <div style={{ width: `${progressPercent}%` }} />
        </div>
        <span>{progressPercent}%</span>
      </section>
    </main>
  );
};

const SimulationErrorScreen = ({
  error,
  onRetry,
  onBack,
}: {
  error: SimulationError;
  onRetry: () => void;
  onBack: () => void;
}) => (
  <main className="error-screen">
    <section aria-live="assertive" className="panel error-panel" role="alert">
      <AlertTriangle size={28} />
      <div>
        <p className="eyebrow">Simulation error</p>
        <h1>{error.title}</h1>
        <p>{error.message}</p>
        <DiagnosticsList diagnostics={error.diagnostics} />
        {error.developerDetail && (
          <details>
            <summary>Developer details</summary>
            <pre>{error.developerDetail}</pre>
          </details>
        )}
        <div className="error-actions">
          <button className="primary" type="button" onClick={onRetry}>
            <RefreshCw size={16} />
            Retry
          </button>
          <button className="secondary" type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Back to setup
          </button>
        </div>
      </div>
    </section>
  </main>
);

const BattleCanvas = ({
  result,
  registry,
  time,
  developerMode,
  onSelectUnit,
  sceneRef,
}: {
  result: BattleResult;
  registry: ContentRegistry;
  time: number;
  developerMode: boolean;
  onSelectUnit: (id: string) => void;
  sceneRef: RefObject<BattleScene | null>;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!canvasRef.current) {
      return undefined;
    }
    const scene = new BattleScene(canvasRef.current, result, registry, {
      onSelectUnit,
      developerMode: false,
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [onSelectUnit, registry, result, sceneRef]);
  useEffect(() => {
    sceneRef.current?.setTime(time);
  }, [sceneRef, time]);
  useEffect(() => {
    sceneRef.current?.setDeveloperMode(developerMode);
  }, [developerMode, sceneRef]);
  return (
    <canvas
      aria-describedby="battle-controls-hint"
      aria-label="3D battle playback"
      ref={canvasRef}
      tabIndex={0}
    />
  );
};

const PlaybackScreen = ({
  registry,
  result,
  onReport,
  onBackToSetup,
  onRerun,
  onRunNewSeed,
  developerMode,
  setDeveloperMode,
}: {
  registry: ContentRegistry;
  result: BattleResult;
  onReport: () => void;
  onBackToSetup: () => void;
  onRerun: () => void;
  onRunNewSeed: () => void;
  developerMode: boolean;
  setDeveloperMode: (enabled: boolean) => void;
}) => {
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [selectedUnitId, setSelectedUnitId] = useState(result.timeline.unitIds[0]);
  const sceneRef = useRef<BattleScene | null>(null);
  const lastFrame = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      if (media.matches) {
        setPlaying(false);
      }
    };
    syncMotionPreference();
    media.addEventListener("change", syncMotionPreference);
    return () => media.removeEventListener("change", syncMotionPreference);
  }, []);

  useEffect(() => {
    let frame = 0;
    const tick = (now: number) => {
      if (playing) {
        const previous = lastFrame.current ?? now;
        const delta = (now - previous) / 1000;
        setTime((current) => Math.min(result.timeline.duration, current + delta * speed));
        lastFrame.current = now;
      } else {
        lastFrame.current = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, result.timeline.duration, speed]);

  useEffect(() => {
    if (time >= result.timeline.duration) {
      setPlaying(false);
    }
  }, [result.timeline.duration, time]);

  const selected = selectedUnitId ? unitStateAt(result, selectedUnitId, time) : undefined;
  const selectedFinal = selectedUnitId
    ? result.finalUnits.find((unit) => unit.id === selectedUnitId)
    : undefined;
  const selectedDefinition = selected ? registry.unitMap.get(selected.unitTypeId) : undefined;
  const alerts = result.timeline.events
    .filter((event) => event.type === "major_alert" && event.time <= time)
    .slice(-5)
    .reverse();
  const isComplete = time >= result.timeline.duration;

  const capture = () => {
    const dataUrl = sceneRef.current?.captureScreenshot();
    if (!dataUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `impossible-battlegrounds-${result.resultHash}.png`;
    link.click();
  };

  const replay = () => {
    lastFrame.current = undefined;
    setTime(0);
    setPlaying(true);
  };

  return (
    <main className="battle-layout">
      <section className="battle-stage">
        <BattleCanvas
          result={result}
          registry={registry}
          time={time}
          developerMode={developerMode}
          onSelectUnit={setSelectedUnitId}
          sceneRef={sceneRef}
        />
        <div className="stage-hint" id="battle-controls-hint">
          Live 3D battlefield
        </div>
        {isComplete && (
          <div aria-live="polite" className="completion-banner" role="status">
            <CheckCircle2 size={18} />
            <div>
              <strong>Battle complete</strong>
              <span>{summarizeOutcome(result.report)}</span>
            </div>
            <button className="secondary" type="button" onClick={replay}>
              <RotateCcw size={16} />
              Replay
            </button>
            <button className="primary" type="button" onClick={onReport}>
              Report
            </button>
          </div>
        )}
        {developerMode && (
          <div className="dev-overlay">
            <Bug size={16} />
            <span>Seed {result.normalizedSetup.seed}</span>
            <span>Tick {Math.round(time / 0.2)}</span>
            <span>Hash {result.resultHash}</span>
            <span>{selectedUnitId}</span>
          </div>
        )}
      </section>
      <aside className="battle-sidebar">
        <div className="panel playback-panel control-panel">
          <div className="panel-title playback-title">
            <div>
              <p className="eyebrow">Playback</p>
              <h2>Timeline</h2>
            </div>
            <span className="duration-pill">
              {formatTime(time)} / {formatTime(result.timeline.duration)}
            </span>
          </div>
          <input
            aria-label="Timeline"
            max={result.timeline.duration}
            min={0}
            step={0.1}
            type="range"
            value={time}
            onChange={(event) => setTime(Number(event.target.value))}
          />
          <div className="icon-row playback-toolbar">
            <button
              aria-label={playing ? "Pause playback" : "Play playback"}
              title={playing ? "Pause" : "Play"}
              type="button"
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            {[0.25, 1, 2, 4].map((value) => (
              <button
                className={speed === value ? "selected" : ""}
                key={value}
                type="button"
                onClick={() => {
                  setSpeed(value);
                  setPlaying(true);
                }}
              >
                {value}x
              </button>
            ))}
            <button
              aria-label="Reset camera"
              title="Reset camera"
              type="button"
              onClick={() => sceneRef.current?.resetCamera()}
            >
              <RotateCcw size={18} />
            </button>
            <button
              aria-label="Capture screenshot"
              title="Capture screenshot"
              type="button"
              onClick={capture}
            >
              <Camera size={18} />
            </button>
          </div>
          <div className="run-controls command-actions">
            <button className="secondary" type="button" onClick={replay}>
              <RotateCcw size={16} />
              Replay
            </button>
            <button className="secondary" type="button" onClick={onRerun}>
              <RefreshCw size={16} />
              Re-run
            </button>
            <button className="secondary" type="button" onClick={onRunNewSeed}>
              <Shuffle size={16} />
              New seed
            </button>
            <CopySeedButton seed={result.report.seed} />
          </div>
          <button className="primary action-wide" type="button" onClick={onReport}>
            <SkipForward size={16} />
            Skip to report
          </button>
          <button className="secondary action-wide" type="button" onClick={onBackToSetup}>
            Return to setup
          </button>
          <label className="check dev-toggle">
            <input
              checked={developerMode}
              type="checkbox"
              onChange={(event) => setDeveloperMode(event.target.checked)}
            />
            <span>Developer mode</span>
          </label>
        </div>
        <section className="panel alerts-panel">
          <h2>Major alerts</h2>
          <div className="alert-list">
            {alerts.length === 0 ? (
              <p>No major alerts yet.</p>
            ) : (
              alerts.map((alert) => <p key={`${alert.time}-${alert.message}`}>{alert.message}</p>)
            )}
          </div>
        </section>
        <section className="panel inspection-panel">
          <h2>Unit inspection</h2>
          {selected && selectedDefinition && (
            <dl>
              <dt>Unit</dt>
              <dd>{selectedDefinition.displayName}</dd>
              <dt>Army</dt>
              <dd>{selected.armyId}</dd>
              <dt>Squad</dt>
              <dd>{selected.squadId}</dd>
              <dt>Status</dt>
              <dd>
                {selected.healthState}, {selected.moraleState}
              </dd>
              <dt>Health</dt>
              <dd>
                <progress
                  aria-label="Selected unit health"
                  className="unit-progress health-progress"
                  max={selectedDefinition.baseHealth}
                  value={selected.health}
                />
                {Math.round(selected.health)} / {selectedDefinition.baseHealth}
              </dd>
              <dt>Morale</dt>
              <dd>
                <progress
                  aria-label="Selected unit morale"
                  className="unit-progress morale-progress"
                  max={100}
                  value={selected.morale}
                />
                {Math.round(selected.morale)} / 100
              </dd>
              <dt>Ammo</dt>
              <dd>
                {selectedFinal
                  ? Object.entries(selectedFinal.ammo)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(", ") || "None"
                  : "None"}
              </dd>
              <dt>Weapon</dt>
              <dd>{selectedFinal?.currentWeaponId ?? "Unknown"}</dd>
              <dt>Wounds</dt>
              <dd>
                {selectedFinal?.wounds
                  .map((wound) => `${wound.location} ${wound.severity}`)
                  .join(", ") || "None"}
              </dd>
              <dt>Action</dt>
              <dd>{selected.currentAction}</dd>
              <dt>Formation</dt>
              <dd>
                {selected.formationId} ({Math.round(selected.formationCohesion)} cohesion)
              </dd>
            </dl>
          )}
        </section>
      </aside>
    </main>
  );
};

const ReportScreen = ({
  result,
  onBack,
  onReplay,
  onRunNewSeed,
}: {
  result: BattleResult;
  onBack: () => void;
  onReplay: () => void;
  onRunNewSeed: () => void;
}) => {
  const outcomeLabel = summarizeOutcome(result.report);
  return (
    <main className="report-layout">
      <header className="app-header report-header command-header">
        <div>
          <p className="eyebrow">Battle complete</p>
          <h1>Battle report</h1>
          <p>
            {outcomeLabel}: {result.outcome.reason}
          </p>
        </div>
        <div className="report-actions">
          <button className="secondary" type="button" onClick={onReplay}>
            <RotateCcw size={16} />
            Watch replay
          </button>
          <button className="secondary" type="button" onClick={onRunNewSeed}>
            <Shuffle size={16} />
            New seed
          </button>
          <CopySeedButton seed={result.report.seed} />
          <button className="secondary" type="button" onClick={onBack}>
            <ArrowLeft size={16} />
            Setup
          </button>
        </div>
      </header>
      <section aria-label="Battle report sections" className="report-grid">
        <article className="panel report-hero wide">
          <div>
            <p className="eyebrow">Outcome</p>
            <h2>{outcomeLabel}</h2>
            <p>{result.outcome.reason}</p>
          </div>
          <div className="stat-grid">
            <div>
              <span>Total units</span>
              <strong>{result.report.totalStartingUnits}</strong>
            </div>
            <div>
              <span>Survivors</span>
              <strong>{result.report.totalSurvivors}</strong>
            </div>
            <div>
              <span>Dead</span>
              <strong>{result.report.totalDead}</strong>
            </div>
            <div>
              <span>Wounded</span>
              <strong>{result.report.totalWounded}</strong>
            </div>
            <div>
              <span>Routed</span>
              <strong>{result.report.totalRouted}</strong>
            </div>
          </div>
        </article>
        <article className="panel">
          <h2>Run details</h2>
          <dl>
            <dt>Duration</dt>
            <dd>{formatTime(result.report.duration)}</dd>
            <dt>Terrain</dt>
            <dd>{result.report.terrain}</dd>
            <dt>Starting distance</dt>
            <dd>{result.report.startingDistance} meters</dd>
            <dt>Seed</dt>
            <dd>{result.report.seed}</dd>
            <dt>Result hash</dt>
            <dd>{result.resultHash}</dd>
            <dt>Simulation version</dt>
            <dd>{result.report.simulationVersion}</dd>
            <dt>Content version</dt>
            <dd>{result.report.contentVersion}</dd>
          </dl>
        </article>
        {(["A", "B"] as const).map((armyId) => {
          const army = result.report.armies[armyId];
          return (
            <article className="panel army-report" key={armyId}>
              <h2>Army {armyId}</h2>
              <div className="stat-grid compact-stats">
                <div>
                  <span>Start</span>
                  <strong>{army.startingUnits}</strong>
                </div>
                <div>
                  <span>Survive</span>
                  <strong>{army.survivors}</strong>
                </div>
                <div>
                  <span>Dead</span>
                  <strong>{army.dead}</strong>
                </div>
                <div>
                  <span>Wounded</span>
                  <strong>{army.wounded}</strong>
                </div>
                <div>
                  <span>Routed</span>
                  <strong>{army.routed}</strong>
                </div>
                <div>
                  <span>Downed</span>
                  <strong>{army.downed}</strong>
                </div>
              </div>
              <h3>Casualties by cause</h3>
              <ul className="compact-list">
                {Object.entries(army.casualtiesByCause).map(([cause, count]) => (
                  <li key={cause}>
                    <span>{DAMAGE_CAUSE_LABEL[cause as keyof typeof DAMAGE_CAUSE_LABEL]}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
        <article className="panel wide">
          <h2>Key contributing factors</h2>
          <ul className="factor-list">
            {result.report.keyFactors.map((factor) => (
              <li key={factor.label}>
                <strong>
                  {factor.label}: {factor.value}
                </strong>
                <span>{factor.evidence}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel wide">
          <h2>Ammunition</h2>
          <div className="ammo-grid">
            {(["A", "B"] as const).map((armyId) => (
              <div key={armyId}>
                <h3>Army {armyId}</h3>
                {result.report.armies[armyId].ammo.length === 0 ? (
                  <p>No ranged ammunition recorded.</p>
                ) : (
                  <ul className="ammo-list">
                    {result.report.armies[armyId].ammo.map((entry) => (
                      <li key={entry.weaponId}>
                        <strong>{entry.displayName}</strong>
                        <span>
                          {entry.shotsFired} shots, {entry.hits} hits, {entry.hitRate}% hit rate
                        </span>
                        <span>
                          {entry.ammoRemaining} remaining, {entry.reloads} reloads,{" "}
                          {entry.explosivesUsed} explosives, {entry.friendlyCasualties} friendly
                          casualties
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <h2>Morale</h2>
          <dl>
            <dt>Units routed</dt>
            <dd>{result.report.morale.unitsRouted}</dd>
            <dt>Formation breaks</dt>
            <dd>{result.report.morale.formationBreaks}</dd>
            <dt>Fear effects</dt>
            <dd>{result.report.morale.fearEvents}</dd>
            <dt>First rout</dt>
            <dd>
              {result.report.morale.firstRout
                ? `${result.report.morale.firstRout.squadId} at ${formatTime(result.report.morale.firstRout.time)}`
                : "None"}
            </dd>
            <dt>Army collapse</dt>
            <dd>
              {result.report.morale.armyCollapse
                ? `Army ${result.report.morale.armyCollapse.armyId} at ${formatTime(result.report.morale.armyCollapse.time)}`
                : "None"}
            </dd>
          </dl>
        </article>
        <article className="panel">
          <h2>Model metrics</h2>
          <dl>
            {Object.entries(result.report.metrics).map(([key, value]) => (
              <div className="metric-row" key={key}>
                <dt>{key.replace(/([A-Z])/g, " $1").trim()}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </article>
        {result.warnings.length > 0 && (
          <article className="panel wide">
            <h2>Runtime warnings</h2>
            <DiagnosticsList diagnostics={result.warnings} />
          </article>
        )}
      </section>
    </main>
  );
};

const BattleApp = () => {
  const registry = useMemo(() => loadContentRegistry(), []);
  const [setup, setSetup] = useState<BattleSetupDraft>(() => createDefaultSetup(registry));
  const [screen, setScreen] = useState<Screen>("setup");
  const [loading, setLoading] = useState<LoadingState>({
    step: "Preparing terrain...",
    progress: 0,
  });
  const [result, setResult] = useState<BattleResult | null>(null);
  const [simulationError, setSimulationError] = useState<SimulationError | null>(null);
  const [developerMode, setDeveloperMode] = useState(
    () => new URLSearchParams(window.location.search).get("dev") === "true",
  );
  const workerRef = useRef<Worker | null>(null);
  const activeRequestRef = useRef<string | null>(null);
  const workerTimeoutRef = useRef<number | undefined>(undefined);
  const resultTransitionTimeoutRef = useRef<number | undefined>(undefined);

  const clearSimulationTimers = useCallback(() => {
    if (workerTimeoutRef.current !== undefined) {
      window.clearTimeout(workerTimeoutRef.current);
      workerTimeoutRef.current = undefined;
    }
    if (resultTransitionTimeoutRef.current !== undefined) {
      window.clearTimeout(resultTransitionTimeoutRef.current);
      resultTransitionTimeoutRef.current = undefined;
    }
  }, []);

  const stopActiveSimulation = useCallback(() => {
    clearSimulationTimers();
    workerRef.current?.terminate();
    workerRef.current = null;
    activeRequestRef.current = null;
  }, [clearSimulationTimers]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "`" || event.key === "~") {
        setDeveloperMode((enabled) => !enabled);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const startBattle = useCallback(
    (draftOverride?: BattleSetupDraft) => {
      const draft = draftOverride ?? setup;
      stopActiveSimulation();
      setResult(null);
      setSimulationError(null);
      setLoading({ step: "Preparing terrain...", progress: 0.04 });
      setScreen("loading");

      const worker = new Worker(new URL("../workers/simulationWorker.ts", import.meta.url), {
        type: "module",
      });
      workerRef.current = worker;
      const requestId = crypto.randomUUID();
      activeRequestRef.current = requestId;
      const startedAt = performance.now();

      const isActiveWorker = () =>
        activeRequestRef.current === requestId && workerRef.current === worker;

      const releaseWorker = () => {
        if (workerRef.current === worker) {
          worker.terminate();
          workerRef.current = null;
        }
      };

      const failSimulation = (error: SimulationError) => {
        if (activeRequestRef.current !== requestId) {
          return;
        }
        clearSimulationTimers();
        releaseWorker();
        activeRequestRef.current = null;
        setSimulationError(error);
        setScreen("error");
      };

      workerTimeoutRef.current = window.setTimeout(() => {
        failSimulation({
          title: "Simulation timed out",
          message: "The worker did not finish in time, so it was stopped cleanly.",
          diagnostics: [
            "Try reducing unit counts or simplifying the battle, then run the simulation again.",
          ],
        });
      }, SIMULATION_TIMEOUT_MS);

      worker.onerror = (event) => {
        event.preventDefault();
        failSimulation({
          title: "Worker crashed",
          message: "The simulation worker reported an uncaught error.",
          diagnostics: [event.message],
          developerDetail: `${event.filename}:${event.lineno}:${event.colno}`,
        });
      };

      worker.onmessageerror = () => {
        failSimulation({
          title: "Worker response could not be read",
          message: "The simulation worker returned a message the app could not deserialize.",
          diagnostics: ["No battle result was accepted from the worker."],
        });
      };

      worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
        const response = event.data;
        if (!isActiveWorker() || response.requestId !== requestId) {
          return;
        }
        if (response.protocolVersion !== WORKER_PROTOCOL_VERSION) {
          failSimulation({
            title: "Worker protocol mismatch",
            message: "The simulation worker and app shell are speaking different protocols.",
            diagnostics: [`Expected protocol ${WORKER_PROTOCOL_VERSION}.`],
          });
          return;
        }
        if (response.type === "progress") {
          setLoading({ step: response.step, progress: response.progress });
          return;
        }
        if (response.type === "result") {
          if (workerTimeoutRef.current !== undefined) {
            window.clearTimeout(workerTimeoutRef.current);
            workerTimeoutRef.current = undefined;
          }
          releaseWorker();
          const finish = () => {
            if (activeRequestRef.current !== requestId) {
              return;
            }
            resultTransitionTimeoutRef.current = undefined;
            activeRequestRef.current = null;
            setResult(response.result);
            setScreen("playback");
          };
          const elapsed = performance.now() - startedAt;
          resultTransitionTimeoutRef.current = window.setTimeout(
            finish,
            Math.max(0, 450 - elapsed),
          );
          return;
        }
        if (response.type === "validation_failure") {
          failSimulation({
            title: "Battle setup is invalid",
            message: response.message,
            diagnostics: response.diagnostics,
          });
          return;
        }
        failSimulation({
          title: "Simulation failed",
          message: response.message,
          diagnostics: ["The worker stopped before producing a battle result."],
          developerDetail: response.developerDetail,
        });
      };

      const request: SimulationWorkerRequest = {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: "start_simulation",
        requestId,
        setup: cloneSetup(draft),
      };
      worker.postMessage(request);
    },
    [clearSimulationTimers, setup, stopActiveSimulation],
  );

  const runNewSeed = useCallback(() => {
    const nextSetup = { ...cloneSetup(setup), seed: createSeed() };
    setSetup(nextSetup);
    startBattle(nextSetup);
  }, [setup, startBattle]);

  const backToSetup = useCallback(() => {
    stopActiveSimulation();
    setSimulationError(null);
    setScreen("setup");
  }, [stopActiveSimulation]);

  useEffect(() => stopActiveSimulation, [stopActiveSimulation]);

  if (screen === "loading") {
    return <LoadingScreen loading={loading} />;
  }
  if (screen === "error" && simulationError) {
    return (
      <SimulationErrorScreen
        error={simulationError}
        onBack={backToSetup}
        onRetry={() => startBattle()}
      />
    );
  }
  if (screen === "playback" && result) {
    return (
      <PlaybackScreen
        registry={registry}
        result={result}
        onReport={() => setScreen("report")}
        onBackToSetup={backToSetup}
        onRerun={() => startBattle()}
        onRunNewSeed={runNewSeed}
        developerMode={developerMode}
        setDeveloperMode={setDeveloperMode}
      />
    );
  }
  if (screen === "report" && result) {
    return (
      <ReportScreen
        result={result}
        onBack={backToSetup}
        onReplay={() => setScreen("playback")}
        onRunNewSeed={runNewSeed}
      />
    );
  }
  return (
    <SetupScreen registry={registry} setup={setup} setSetup={setSetup} onStart={startBattle} />
  );
};

export const App = () => (
  <AppErrorBoundary>
    <BattleApp />
  </AppErrorBoundary>
);
