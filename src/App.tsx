import React, { useEffect, useState } from "react";
import "./App.css";
import { RSocket } from "rsocket-core";
import { WebsocketClientTransport } from "rsocket-websocket-client";
import { RSocketConnector } from "rsocket-core/dist/RSocketConnector";
import { ClientOptions } from "rsocket-websocket-client/dist/WebsocketClientTransport";
import { EditorMainView } from "./EditorMainView";

const options = { host: "localhost", port: 8002 };

const KEEP_ALIVE = 1000000;
const LIFE_TIME = 100000;
const MIME_TYPE = "text/plain";

function App() {
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
      keepAlive: KEEP_ALIVE,
      lifetime: LIFE_TIME,
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
  return <EditorMainView socket={socket} />;
}

export default App;
