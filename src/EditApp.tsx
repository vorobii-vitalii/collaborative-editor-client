import React, { useEffect, useState } from "react";
import "./App.css";
import { RSocket } from "rsocket-core";
import { WebsocketClientTransport } from "rsocket-websocket-client";
import { RSocketConnector } from "rsocket-core/dist/RSocketConnector";
import { ClientOptions } from "rsocket-websocket-client/dist/WebsocketClientTransport";
import { EditorMainView } from "./EditorMainView";
import { RSocketImpl } from "./RSocketImpl";
import { ClassicWebSocket } from "./ClassicWebSocket";
import {DocumentContext} from "./DocumentContext";

const options = { host: "localhost", port: 8002 };
const WS_URL = "ws://localhost:10000/documents";

const MIME_TYPE = "text/plain";

const uuidGenerator = () => crypto.randomUUID();
const documentContext = new DocumentContext();

const RSocketEditApp = () => {
  window.Buffer = window.Buffer || require("buffer").Buffer;

  const [socket, setSocket] = useState<RSocket>();

  useEffect(() => {
    const transportOptions: ClientOptions = {
      url: `ws://${options.host}:${options.port}`,
      wsCreator: url => {
        console.log("Creating WS connection...");
        const webSocket = new WebSocket(url);
        webSocket.binaryType = "arraybuffer";
        return webSocket;
      }
    };
    const setupOptions = {
      dataMimeType: MIME_TYPE,
      metadataMimeType: MIME_TYPE
    };
    const transport = new WebsocketClientTransport(transportOptions);
    const connector: RSocketConnector = new RSocketConnector({
      setup: setupOptions,
      transport: transport
    });
    connector.connect().then(v => {
      console.log("RSocket connection established!");
      setSocket(v);
    });
  }, []);

  if (!socket) {
    return <p>Loading...</p>;
  }
  return <EditorMainView socket={new RSocketImpl(socket)} idGenerator={uuidGenerator} documentContext={documentContext} />;
};

const WebSocketEditApp = () => {
  return <EditorMainView socket={new ClassicWebSocket(WS_URL)} idGenerator={uuidGenerator} documentContext={documentContext} />;
};

const isWS = true;

function EditApp() {
  if (isWS) {
    return <WebSocketEditApp />;
  }
  return <RSocketEditApp />;
}

export default EditApp;
