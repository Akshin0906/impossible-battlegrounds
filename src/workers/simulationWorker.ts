import { loadContentRegistry } from "../domain/content";
import { normalizeBattleSetup, validateBattleSetupDraft } from "../simulation/normalizeSetup";
import { simulateBattle } from "../simulation/simulateBattle";
import {
  WORKER_PROTOCOL_VERSION,
  type SimulationWorkerRequest,
  type SimulationWorkerResponse,
} from "./workerProtocol";

const progress = (requestId: string, step: string, progressValue: number): void => {
  const response: SimulationWorkerResponse = {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    type: "progress",
    requestId,
    step,
    progress: progressValue,
  };
  self.postMessage(response);
};

self.onmessage = (event: MessageEvent<SimulationWorkerRequest>) => {
  const request = event.data;
  if (request.protocolVersion !== WORKER_PROTOCOL_VERSION || request.type !== "start_simulation") {
    return;
  }
  try {
    progress(request.requestId, "Preparing terrain...", 0.08);
    const registry = loadContentRegistry();
    const diagnostics = validateBattleSetupDraft(request.setup, registry);
    if (diagnostics.length > 0) {
      const response: SimulationWorkerResponse = {
        protocolVersion: WORKER_PROTOCOL_VERSION,
        type: "validation_failure",
        requestId: request.requestId,
        message: "Battle setup is invalid.",
        diagnostics,
      };
      self.postMessage(response);
      return;
    }
    progress(request.requestId, "Spawning armies...", 0.2);
    const normalized = normalizeBattleSetup(request.setup, registry);
    progress(request.requestId, "Calculating navigation and line of sight...", 0.34);
    progress(request.requestId, "Simulating battle...", 0.52);
    const result = simulateBattle(normalized, registry);
    progress(request.requestId, "Packing playback timeline...", 0.86);
    progress(request.requestId, "Generating report...", 0.96);
    const response: SimulationWorkerResponse = {
      protocolVersion: WORKER_PROTOCOL_VERSION,
      type: "result",
      requestId: request.requestId,
      result,
    };
    self.postMessage(response);
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
    self.postMessage(response);
  }
};

export {};
