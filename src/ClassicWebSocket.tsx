import {
  AbstractSocket,
  ApplyChange,
  ConnectBaseMessage
} from "./AbstractSocket";
import { decode, encode } from "@msgpack/msgpack";

export interface Message {
  responseType: "ON_CONNECT" | "CHANGES" | "NACK" | "ACK";
  payload: any;
}

export class ClassicWebSocket implements AbstractSocket {
  private socket: WebSocket;
  private changeApplyHandlers: Map<
    string,
    (success: boolean) => void
  > = new Map<string, (success: boolean) => void>();
  private connectBaseMessagesHandler?: (
    msg: ConnectBaseMessage
  ) => void = undefined;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.binaryType = "arraybuffer";
    this.socket.onmessage = message => {
      const eventPayload = decode(message.data) as Message;
      if (
        eventPayload.responseType === "ON_CONNECT" ||
        eventPayload.responseType === "CHANGES"
      ) {
        if (this.connectBaseMessagesHandler) {
          this.connectBaseMessagesHandler(eventPayload as ConnectBaseMessage);
        }
      } else if (
        eventPayload.responseType === "ACK" ||
        eventPayload.responseType === "NACK"
      ) {
        const isSuccess = eventPayload.responseType === "ACK";
        const changeId = eventPayload.payload as string;
        const handler =
          this.changeApplyHandlers && this.changeApplyHandlers.get(changeId);
        handler && handler(isSuccess);
      } else {
        console.log("Ignoring message!");
      }
    };
  }

  connect(
    batchSize: number,
    onReceive: (msg: ConnectBaseMessage) => void
  ): void {
    this.socket.onopen = () => {
      this.socket.send(
        encode({
          type: "CONNECT",
          batchSize: batchSize
        })
      );
      this.connectBaseMessagesHandler = onReceive;
    };
  }

  applyChanges(
    changeId: string,
    changesToApply: Array<ApplyChange>,
    onApplied: (success: boolean) => void
  ): void {
    this.socket.send(
      encode({
        type: "CHANGES",
        payload: changesToApply,
        changeId: changeId
      })
    );
    this.changeApplyHandlers.set(changeId, success => {
      onApplied(success);
      this.changeApplyHandlers.delete(changeId);
    });
  }
}
