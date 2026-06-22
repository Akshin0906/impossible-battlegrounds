import { loadContentRegistry } from "../domain/content";
import { normalizeBattleSetup, validateBattleSetupDraft } from "../simulation/normalizeSetup";
import { simulateBattle } from "../simulation/simulateBattle";
import {
  WORKER_PROTOCOL_VERSION,
  type SimulationWorkerRequest,
  type SimulationWorkerResponse,
} from "./workerProtocol";

type SimulationWorkerPostMessage = (response: SimulationWorkerResponse) => void;

export type SimulationWorkerDependencies = {
  loadContentRegistry: typeof loadContentRegistry;
  validateBattleSetupDraft: typeof validateBattleSetupDraft;
  normalizeBattleSetup: typeof normalizeBattleSetup;
  simulateBattle: typeof simulateBattle;
};

const defaultDependencies: SimulationWorkerDependencies = {
  loadContentRegistry,
  validateBattleSetupDraft,
  normalizeBattleSetup,
  simulateBattle,
};

const progress = (
  emit: SimulationWorkerPostMessage,
  requestId: string,
  step: string,
  progressValue: number,
): void => {
  const response: SimulationWorkerResponse = {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    type: "progress",
    requestId,
    step,
    progress: progressValue,
  };
  emit(response);
};

export const handleSimulationWorkerRequest = (
  request: SimulationWorkerRequest,
  emit: SimulationWorkerPostMessage,
  dependencies: SimulationWorkerDependencies = defaultDependencies,
): boolean => {
  if (request.protocolVersion !== WORKER_PROTOCOL_VERSION || request.type !== "start_simulation") {
    return false;
  }
  try {
    progress(emit, request.requestId, "Preparing terrain...", 0.08);
    const registry = dependencies.loadContentRegistry();
    const diagnostics = dependencies.validateBattleSetupDraft(request.setup, registry);
    if (diagnostics.length > 0) {
      const response: SimulationWorkerResponse = {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: "validation_failure",
        requestId: request.requestId,
        message: "Battle setup is invalid.",
        diagnostics,
      };
      emit(response);
      return true;
    }
    progress(emit, request.requestId, "Spawning armies...", 0.2);
    const normalized = dependencies.normalizeBattleSetup(request.setup, registry);
    progress(emit, request.requestId, "Calculating navigation and line of sight...", 0.34);
    progress(emit, request.requestId, "Simulating battle...", 0.52);
    const result = dependencies.simulateBattle(normalized, registry);
    progress(emit, request.requestId, "Packing playback timeline...", 0.86);
    progress(emit, request.requestId, "Generating report...", 0.96);
    const response: SimulationWorkerResponse = {
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: "result",
      requestId: request.requestId,
      result,
    };
    emit(response);
  } catch (error) {
    const response: SimulationWorkerResponse = {
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: "runtime_failure",
      requestId: request.requestId,
      message: "Simulation failed before a battle result could be produced.",
      developerDetail:
        error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
          : String(error),
    };
    emit(response);
  }
  return true;
};

if (typeof self !== "undefined") {
  self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
    handleSimulationWorkerRequest(event.data, (response) => self.postMessage(response));
  };
}

export {};
