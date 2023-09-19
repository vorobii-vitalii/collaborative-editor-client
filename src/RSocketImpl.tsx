import {
  AbstractSocket,
  ApplyChange,
  ConnectBaseMessage
} from "./AbstractSocket";
import { RSocket } from "rsocket-core";
import { Buffer } from "buffer";
import { decode, encode } from "@msgpack/msgpack";

const INITIAL_REQUEST = 100;

export class RSocketImpl implements AbstractSocket {
  private socket: RSocket;

  constructor(rsocket: RSocket) {
    this.socket = rsocket;
  }

  applyChanges(
    changeId: string,
    changesToApply: Array<ApplyChange>,
    onApplied: (success: boolean) => void
  ): void {
    this.socket.requestStream(
      {
        data: Buffer.from(
          encode({
            type: "CHANGES",
            payload: changesToApply,
            changeId: changeId
          })
        )
      },
      INITIAL_REQUEST,
      {
        onNext(payload, isComplete) {
          const buffer = payload.data;
          console.log(`Apply changes response ${buffer}`);
          // TODO: Check if ACK/NACK
          onApplied(true);
        },
        onError(error) {
          console.error("Error", error);
          onApplied(false);
        },
        onComplete() {},
        onExtension(extendedType, content, canBeIgnored) {}
      }
    );
  }

  connect(
    batchSize: number,
    onReceive: (msg: ConnectBaseMessage) => void
  ): void {
    const connectMessage = Buffer.from(
      encode({
        type: "CONNECT",
        batchSize: batchSize
      })
    );
    this.socket.requestStream({ data: connectMessage }, INITIAL_REQUEST, {
      onNext(payload, isComplete) {
        const buffer = payload.data;
        if (!buffer) {
          console.warn("Skipping response message with null payload..");
          return;
        }
        const decodedMessage = decode(new Uint8Array(buffer));
        const message = decodedMessage as ConnectBaseMessage;
        onReceive(message);
      },
      onError(error) {
        console.error("Error", error);
      },
      onComplete() {},
      onExtension(extendedType, content, canBeIgnored) {}
    });
  }
}
