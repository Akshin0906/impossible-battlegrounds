import { loadContentRegistry } from "../domain/content";
import { normalizeBattleSetup, validateBattleSetupDraft } from "../simulation/normalizeSetup";
import { simulateBattle } from "../simulation/simulateBattle";
import {
  WORKER_PROTOCOL_VERSION,
  type SimulationWorkerRequest,
  type SimulationWorkerResponse,
} from "./workerProtocol";

type SimulationWorkerPostMessage = (response: SimulationWorkerResponse) => void;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const requestIdFor = (request: unknown): string => {
  if (!isRecord(request) || typeof request.requestId !== "string") {
    return "unknown-request";
  }
  return request.requestId;
};

const describeIncompatibleRequest = (request: unknown): string => {
  if (!isRecord(request)) {
    return "Worker request was not an object.";
  }
  if (request.protocolVersion !== WORKER_PROTOCOL_VERSION) {
    return `Expected protocol ${WORKER_PROTOCOL_VERSION}, received ${String(
      request.protocolVersion,
    )}.`;
  }
  if (request.type !== "start_simulation") {
    return `Expected request type start_simulation, received ${String(request.type)}.`;
  }
  if (typeof request.requestId !== "string") {
    return "Worker request did not include a string requestId.";
  }
  return "Worker request was missing simulation setup data.";
};

const isSimulationWorkerRequest = (request: unknown): request is SimulationWorkerRequest =>
  isRecord(request) &&
  request.protocolVersion === WORKER_PROTOCOL_VERSION &&
  request.type === "start_simulation" &&
  typeof request.requestId === "string" &&
  "setup" in request;

const incompatibleRequest = (request: unknown, emit: SimulationWorkerPostMessage): void => {
  const response: SimulationWorkerResponse = {
    protocolVersion: WORKER_PROTOCOL_VERSION,
    type: "incompatible_request",
    requestId: requestIdFor(request),
    message: "The simulation worker rejected an incompatible request.",
    developerDetail: describeIncompatibleRequest(request),
  };
  emit(response);
};

export const handleSimulationWorkerRequest = (
  request: unknown,
  emit: SimulationWorkerPostMessage,
): boolean => {
  if (!isSimulationWorkerRequest(request)) {
    incompatibleRequest(request, emit);
    return true;
  }
  try {
    progress(emit, request.requestId, "Preparing terrain...", 0.08);
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
      emit(response);
      return true;
    }
    progress(emit, request.requestId, "Spawning armies...", 0.2);
    const normalized = normalizeBattleSetup(request.setup, registry);
    progress(emit, request.requestId, "Calculating navigation and line of sight...", 0.34);
    progress(emit, request.requestId, "Simulating battle...", 0.52);
    const result = simulateBattle(normalized, registry);
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
  self.onmessage = (event: MessageEvent<unknown>) => {
    handleSimulationWorkerRequest(event.data, (response) => self.postMessage(response));
  };
}

export {};
