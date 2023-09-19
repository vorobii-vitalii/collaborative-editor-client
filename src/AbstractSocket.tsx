export interface ConnectBaseMessage {
  responseType: "ON_CONNECT" | "CHANGES";
  payload: any;
}

export interface ApplyChange {
  charId: string;
  parentCharId?: string;
  isRight?: boolean;
  disambiguator?: number;
  character?: string;
}

export interface ConnectedMessagePayload {
  connectionId: string;
}

export interface Change {
  charId: string;
  parentCharId?: string;
  isRight: boolean;
  disambiguator: number;
  character: string;
}

export interface ChangesPayload {
  changes: Array<Change>;
  isEndOfStream: boolean;
  source: string;
}

export interface AbstractSocket {
  connect(
    batchSize: number,
    onReceive: (msg: ConnectBaseMessage) => void
  ): void;

  applyChanges(
    changeId: string,
    changesToApply: Array<ApplyChange>,
    onApplied: (success: boolean) => void
  ): void;
}
