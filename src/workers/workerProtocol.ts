import type { BattleResult, BattleSetupDraft } from "../domain/battle";

export const WORKER_PROTOCOL_VERSION = 1;

export type SimulationWorkerRequest = {
  protocolVersion: typeof WORKER_PROTOCOL_VERSION;
  type: "start_simulation";
  requestId: string;
  setup: BattleSetupDraft;
};

export type SimulationWorkerResponse =
  | {
      protocolVersion: typeof WORKER_PROTOCOL_VERSION;
      type: "progress";
      requestId: string;
      step: string;
      progress: number;
    }
  | {
      protocolVersion: typeof WORKER_PROTOCOL_VERSION;
      type: "result";
      requestId: string;
      result: BattleResult;
    }
  | {
      protocolVersion: typeof WORKER_PROTOCOL_VERSION;
      type: "validation_failure";
      requestId: string;
      message: string;
      diagnostics: string[];
    }
  | {
      protocolVersion: typeof WORKER_PROTOCOL_VERSION;
      type: "runtime_failure";
      requestId: string;
      message: string;
      developerDetail: string;
    };
