import { OneshotModule } from "./oneshot/module.js";
import { TrackingModule } from "./tracking/module.js";

export class EvaluationModule {
  /** One-shot batch evaluation of a JSONL dataset with Ragas metrics. */
  public readonly oneshot: OneshotModule;

  /** Continuous tracking of a production RAG — track CRUD + dashboard reads. */
  public readonly tracking: TrackingModule;

  constructor(args: {
    baseUrl: string;
    token: string;
    timeoutS: number;
    pollIntervalS: number;
    pollMaxIntervalS: number;
  }) {
    this.oneshot = new OneshotModule(args);
    this.tracking = new TrackingModule({
      baseUrl: args.baseUrl,
      token: args.token,
      timeoutS: args.timeoutS,
    });
  }
}
