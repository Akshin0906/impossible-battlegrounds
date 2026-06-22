import {
  Activity,
  Bug,
  Camera,
  Copy,
  Download,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  SkipForward,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
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

type Screen = "setup" | "loading" | "playback" | "report";

type LoadingState = {
  step: string;
  progress: number;
};

const roleLabels: Record<DeploymentRole, string> = {
  front: "Front",
  support: "Support",
  flank: "Flank",
};

const distanceOptions = [10, 25, 50, 100, 200, 300, 500];

const createSeed = (): string => {
  const array = new Uint32Array(2);
  crypto.getRandomValues(array);
  return `${array[0]!.toString(16)}${array[1]!.toString(16)}`;
};

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
    id: `${armyId}-${unitTypeId}-${Date.now().toString(36)}`,
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
    <section className="panel army-panel" aria-label={`Army ${armyId}`}>
      <div className="panel-title">
        <h2>Army {armyId}</h2>
        <span>{totalForArmy(army)} units</span>
      </div>
      <div className="squad-list">
        {army.squads.map((squad, index) => {
          const unit = registry.unitMap.get(squad.unitTypeId)!;
          const allowedLoadouts = unit.allowedLoadouts.map((id) => registry.loadoutMap.get(id)!);
          const currentLoadout = registry.loadoutMap.get(squad.loadoutId)!;
          return (
            <article className="squad-row" key={squad.id}>
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
              <div className="toggle-strip">
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
              <div className="role-strip" role="group" aria-label="Deployment role">
                {Object.entries(roleLabels).map(([role, label]) => (
                  <button
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
                  title="Duplicate squad"
                  type="button"
                  onClick={() =>
                    onChange({
                      squads: [...army.squads, { ...squad, id: `${squad.id}-copy-${index}` }],
                    })
                  }
                >
                  <Copy size={16} />
                </button>
                <button
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
  return (
    <main className="setup-layout">
      <header className="app-header">
        <div>
          <h1>Impossible Battlegrounds</h1>
          <p>Evidence-informed deterministic sandbox battles.</p>
        </div>
        <div className="identity-pill">
          <Activity size={16} />
          v1 simulation
        </div>
      </header>
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
      <section className="panel setup-controls">
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
              value={setup.seed}
              onChange={(event) => setSetup({ ...setup, seed: event.target.value })}
            />
          </label>
          <button
            title="Randomize seed"
            type="button"
            onClick={() => setSetup({ ...setup, seed: createSeed() })}
          >
            <Shuffle size={18} />
          </button>
        </div>
        <div className="odds-row">
          <strong>{odds}</strong>
          {warning && <span className="warning">{warning}</span>}
          {diagnostics.length > 0 && <span className="warning">{diagnostics[0]}</span>}
        </div>
        <button
          className="primary start-button"
          disabled={diagnostics.length > 0}
          type="button"
          onClick={onStart}
        >
          <Play size={18} />
          Start battle
        </button>
      </section>
    </main>
  );
};

const LoadingScreen = ({ loading }: { loading: LoadingState }) => (
  <main className="loading-screen">
    <section className="panel loading-panel">
      <h1>Precomputing battle</h1>
      <p>{loading.step}</p>
      <div className="progress-bar" aria-label="Simulation progress">
        <div style={{ width: `${Math.round(loading.progress * 100)}%` }} />
      </div>
      <span>{Math.round(loading.progress * 100)}%</span>
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
      developerMode,
    });
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, [developerMode, onSelectUnit, registry, result, sceneRef]);
  useEffect(() => {
    sceneRef.current?.setTime(time);
  }, [sceneRef, time]);
  useEffect(() => {
    sceneRef.current?.setDeveloperMode(developerMode);
  }, [developerMode, sceneRef]);
  return <canvas aria-label="3D battle playback" ref={canvasRef} />;
};

const PlaybackScreen = ({
  registry,
  result,
  onReport,
  onBackToSetup,
  developerMode,
  setDeveloperMode,
}: {
  registry: ContentRegistry;
  result: BattleResult;
  onReport: () => void;
  onBackToSetup: () => void;
  developerMode: boolean;
  setDeveloperMode: (enabled: boolean) => void;
}) => {
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState(result.timeline.unitIds[0]);
  const sceneRef = useRef<BattleScene | null>(null);
  const lastFrame = useRef<number | undefined>(undefined);

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
        <div className="panel playback-panel">
          <div className="time-row">
            <strong>{formatTime(time)}</strong>
            <span>{formatTime(result.timeline.duration)}</span>
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
          <div className="icon-row">
            <button
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
              title="Reset camera"
              type="button"
              onClick={() => sceneRef.current?.resetCamera()}
            >
              <RotateCcw size={18} />
            </button>
            <button title="Capture screenshot" type="button" onClick={capture}>
              <Camera size={18} />
            </button>
            <button title="Download screenshot" type="button" onClick={capture}>
              <Download size={18} />
            </button>
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
        <section className="panel">
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
                {Math.round(selected.health)} / {selectedDefinition.baseHealth}
              </dd>
              <dt>Morale</dt>
              <dd>{Math.round(selected.morale)} / 100</dd>
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

const ReportScreen = ({ result, onBack }: { result: BattleResult; onBack: () => void }) => (
  <main className="report-layout">
    <header className="app-header">
      <div>
        <h1>Battle report</h1>
        <p>
          {summarizeOutcome(result.report)}: {result.outcome.reason}
        </p>
      </div>
      <button className="secondary" type="button" onClick={onBack}>
        Return to setup
      </button>
    </header>
    <section className="report-grid">
      <article className="panel">
        <h2>Summary</h2>
        <dl>
          <dt>Winner</dt>
          <dd>{summarizeOutcome(result.report)}</dd>
          <dt>Battle duration</dt>
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
          <article className="panel" key={armyId}>
            <h2>Army {armyId}</h2>
            <dl>
              <dt>Starting units</dt>
              <dd>{army.startingUnits}</dd>
              <dt>Survivors</dt>
              <dd>{army.survivors}</dd>
              <dt>Dead</dt>
              <dd>{army.dead}</dd>
              <dt>Wounded</dt>
              <dd>{army.wounded}</dd>
              <dt>Routed</dt>
              <dd>{army.routed}</dd>
              <dt>Downed</dt>
              <dd>{army.downed}</dd>
            </dl>
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
        <h2>Ammo</h2>
        <div className="ammo-grid">
          {(["A", "B"] as const).map((armyId) => (
            <div key={armyId}>
              <h3>Army {armyId}</h3>
              {result.report.armies[armyId].ammo.length === 0 ? (
                <p>No ranged ammunition recorded.</p>
              ) : (
                result.report.armies[armyId].ammo.map((entry) => (
                  <p key={entry.weaponId}>
                    {entry.displayName}: {entry.shotsFired} shots, {entry.hits} hits,{" "}
                    {entry.hitRate}% hit rate, {entry.ammoRemaining} remaining, {entry.reloads}{" "}
                    reloads, {entry.explosivesUsed} explosives, {entry.friendlyCasualties} friendly
                    casualties
                  </p>
                ))
              )}
            </div>
          ))}
        </div>
      </article>
      <article className="panel wide">
        <h2>Morale</h2>
        <p>Units routed: {result.report.morale.unitsRouted}</p>
        <p>Formation breaks: {result.report.morale.formationBreaks}</p>
        <p>Fear effects: {result.report.morale.fearEvents}</p>
        <p>
          First rout:{" "}
          {result.report.morale.firstRout
            ? `${result.report.morale.firstRout.squadId} at ${formatTime(result.report.morale.firstRout.time)}`
            : "None"}
        </p>
        <p>
          Army morale collapse:{" "}
          {result.report.morale.armyCollapse
            ? `Army ${result.report.morale.armyCollapse.armyId} at ${formatTime(result.report.morale.armyCollapse.time)}`
            : "None"}
        </p>
      </article>
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
    </section>
  </main>
);

export const App = () => {
  const registry = useMemo(() => loadContentRegistry(), []);
  const [setup, setSetup] = useState<BattleSetupDraft>(() => createDefaultSetup(registry));
  const [screen, setScreen] = useState<Screen>("setup");
  const [loading, setLoading] = useState<LoadingState>({
    step: "Preparing terrain...",
    progress: 0,
  });
  const [result, setResult] = useState<BattleResult | null>(null);
  const [developerMode, setDeveloperMode] = useState(
    () => new URLSearchParams(window.location.search).get("dev") === "true",
  );
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "`" || event.key === "~") {
        setDeveloperMode((enabled) => !enabled);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const startBattle = () => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../workers/simulationWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    setLoading({ step: "Preparing terrain...", progress: 0.04 });
    setScreen("loading");
    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) {
        return;
      }
      if (response.type === "progress") {
        setLoading({ step: response.step, progress: response.progress });
      }
      if (response.type === "result") {
        const finish = () => {
          setResult(response.result);
          setScreen("playback");
          worker.terminate();
          workerRef.current = null;
        };
        const elapsed = performance.now() - startedAt;
        window.setTimeout(finish, Math.max(0, 450 - elapsed));
      }
      if (response.type === "validation_failure" || response.type === "runtime_failure") {
        setLoading({
          step: `${response.message} ${response.type === "validation_failure" ? response.diagnostics.join(" ") : response.developerDetail}`,
          progress: 1,
        });
      }
    };
    const request: SimulationWorkerRequest = {
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: "start_simulation",
      requestId,
      setup: cloneSetup(setup),
    };
    worker.postMessage(request);
  };

  useEffect(() => () => workerRef.current?.terminate(), []);

  if (screen === "loading") {
    return <LoadingScreen loading={loading} />;
  }
  if (screen === "playback" && result) {
    return (
      <PlaybackScreen
        registry={registry}
        result={result}
        onReport={() => setScreen("report")}
        onBackToSetup={() => setScreen("setup")}
        developerMode={developerMode}
        setDeveloperMode={setDeveloperMode}
      />
    );
  }
  if (screen === "report" && result) {
    return <ReportScreen result={result} onBack={() => setScreen("setup")} />;
  }
  return (
    <SetupScreen registry={registry} setup={setup} setSetup={setSetup} onStart={startBattle} />
  );
};
