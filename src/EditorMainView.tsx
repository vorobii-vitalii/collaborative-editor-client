import React, { useEffect, useState } from "react";
import { decode, encode } from "@msgpack/msgpack";
import { Buffer } from "buffer";
// @ts-ignore
import pako from "pako";
import { ContentState, Editor, EditorState } from "draft-js";
import {
  diff_match_patch,
  DIFF_DELETE,
  DIFF_EQUAL,
  DIFF_INSERT
} from "diff-match-patch";
import {
  AbstractSocket,
  ApplyChange,
  ChangesPayload,
  ConnectedMessagePayload
} from "./AbstractSocket";
import { CharDetails } from "./CharDetails";
import { Path } from "./Path";
import { EQUAL, GREATER } from "./constants";
import {DocumentContext} from "./DocumentContext";

interface EditorMainProps {
  socket: AbstractSocket;
}

const BATCH_SIZE = 1000;
const documentContext = new DocumentContext();

export function EditorMainView(props: EditorMainProps) {
  const socket = props.socket;
  const [connectionId, setConnectionId] = useState<String>();
  const [isLoaded, setLoaded] = useState(false);
  const [previousContent, setPreviousContent] = useState("");

  const generateUniqueId = () => {
    return crypto.randomUUID();
  };

  const getDisambiguator = () => Number(connectionId!!);

  const onDocumentChangesBatch = (changes: ChangesPayload) => {
    if (changes.isEndOfStream) {
      setLoaded(true);
    }
    for (const change of changes.changes) {
      documentContext.applyExternalChange(change);
    }
    setPreviousContent(documentContext.getDocumentContent());
  };

  const [isConnectSent, setConnectSent] = useState(false);

  useEffect(() => {
    if (isConnectSent) {
      return;
    }
    setConnectSent(true);
    socket.connect(BATCH_SIZE, message => {
      if (message.responseType === "ON_CONNECT") {
        const connectedData = message.payload as ConnectedMessagePayload;
        setConnectionId(connectedData.connectionId);
      } else {
        onDocumentChangesBatch(message.payload as ChangesPayload);
      }
    });
  }, [socket, onDocumentChangesBatch, isConnectSent, setConnectSent]);

  const onUserDocumentChange = (e: { target: { value: any; }; }) => {
    const updatedDocumentContent = e.target.value;
    const changesToApply =
        documentContext.applyUserChange(updatedDocumentContent, getDisambiguator(), generateUniqueId);
    if (changesToApply.length === 0) {
      return;
    }
    setPreviousContent(updatedDocumentContent);
    socket.applyChanges(generateUniqueId(), changesToApply, success => {
      console.log(`Change applied successfully = ${success}`);
    });
  };
  if (!isLoaded) {
    return <p>Hold on, document is still loading!</p>;
  }
  return (
    <textarea
      value={previousContent}
      onChange={onUserDocumentChange}
    />
  );
}
