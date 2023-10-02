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

interface EditorMainProps {
  socket: AbstractSocket;
}

const BATCH_SIZE = 1000;
const sortedCharIds = new Array<string>();
const charDetailsMap = new Map<string, CharDetails>();

export function EditorMainView(props: EditorMainProps) {
  const socket = props.socket;
  const [connectionId, setConnectionId] = useState<String>();
  const [isLoaded, setLoaded] = useState(false);
  const dependenciesCharIdsByCharId = new Map<string, Set<string>>();
  const [previousContent, setPreviousContent] = useState("");

  const findPath = (charId?: string): Path | undefined => {
    if (!charId) {
      return new Path([], []);
    }
    const charDetails = charDetailsMap.get(charId);
    return charDetails && charDetails.getPath();
  };

  const createDependency = (dependent: string, dependency: string) => {
    if (!dependenciesCharIdsByCharId.has(dependency)) {
      dependenciesCharIdsByCharId.set(dependency, new Set<string>());
    }
    const set = dependenciesCharIdsByCharId.get(dependency);
    dependenciesCharIdsByCharId.set(dependency, set!!.add(dependent));
  };

  const getPathByIndex = (index: number) =>
    charDetailsMap.get(sortedCharIds[index])!!.getPath()!!;

  const generateUniqueId = () => {
    return crypto.randomUUID();
  };

  const getDisambiguator = () => Number(connectionId!!);

  // Called when tree path from root all the way to charId is present
  const onPathReady = (charId: string, rootPath: Path) => {
    // No cycle is possible, cuz its tree :)
    const queue = new Array<{ charId: string; parentPath: Path }>();
    queue.push({ charId, parentPath: rootPath });
    while (queue.length > 0) {
      const pair = queue.shift();
      if (!pair) {
        continue;
      }
      const charDetails = charDetailsMap.get(pair.charId)!!;
      charDetails.updatePath(pair.parentPath);
      // Add to array
      const newCharacterIndex = charDetails.getPath()!!.findOptimalPosition(
        sortedCharIds.length,
        getPathByIndex
      );
      if (charDetails.character) {
        sortedCharIds.splice(newCharacterIndex, 0, pair.charId);
      } else {
        if (
          newCharacterIndex >= 0 &&
          newCharacterIndex < sortedCharIds.length
        ) {
          sortedCharIds.splice(newCharacterIndex, 1);
        }
      }
      // Update ancestors...
      const dependencies = dependenciesCharIdsByCharId.get(pair.charId);
      dependencies &&
        dependencies.forEach(dependencyCharId => {
          queue.push({
            charId: dependencyCharId,
            parentPath: charDetails.getPath()!!
          });
        });
      dependenciesCharIdsByCharId.delete(pair.charId);
    }
  };

  const recalculateDocumentContent = () => {
    return sortedCharIds
      .map(v => charDetailsMap.get(v))
      .map(v => v && v.character)
      .join("");
  };

  const onDocumentChangesBatch = (changes: ChangesPayload) => {
    if (changes.isEndOfStream) {
      setLoaded(true);
    }
    for (const change of changes.changes) {
      const charId = change.charId;
      const isAlreadyPresent = charDetailsMap.has(charId);
      if (isAlreadyPresent) {
        charDetailsMap.get(charId)!!.updateCharacter(change.character);
      } else {
        const charDetails = new CharDetails(
          charId,
          change.parentCharId,
          change.isRight,
          change.disambiguator,
          change.character
        );
        charDetailsMap.set(charId, charDetails);
        const parentCharId = change.parentCharId;
        const parentPath = findPath(parentCharId);
        if (parentPath) {
          onPathReady(charId, parentPath);
        } else {
          createDependency(charId, parentCharId!!);
        }
      }
    }
    const currentDocumentContent = recalculateDocumentContent();
    setPreviousContent(currentDocumentContent);
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

  const getCharDetails = (index: number) => {
    if (index < 0 || index >= sortedCharIds.length) {
      return undefined;
    }
    return charDetailsMap.get(sortedCharIds[index]);
  };

  const onUserDocumentChange = (e: { target: { value: any; }; }) => {
    const updatedDocumentContent = e.target.value;
    const diffMatchPatch = new diff_match_patch();
    const differences = diffMatchPatch.diff_main(
      previousContent,
      updatedDocumentContent
    );
    let previousIndex = -1;
    const changesToApply = new Array<ApplyChange>();
    for (const diff of differences) {
      const v = diff[0];
      const str = diff[1];
      if (v === DIFF_EQUAL) {
        previousIndex += str.length;
      } else if (v === DIFF_DELETE) {
        for (let i = 0; i < str.length; i++) {
          const charIdToDelete = sortedCharIds[previousIndex + 1];
          changesToApply.splice(changesToApply.length, 0, {
            charId: charIdToDelete
          });
          const charDetails = charDetailsMap.get(charIdToDelete)!!;
          sortedCharIds.splice(previousIndex + 1, 1);
          charDetails.updateCharacter(undefined);
        }
      } else if (v === DIFF_INSERT) {
        const nextCharDetails = getCharDetails(previousIndex + 1);
        for (let i = 0; i < str.length; i++) {
          const newCharacter = str.charAt(i);
          const previousCharDetails = getCharDetails(previousIndex + i);
          const newCharDetails = CharDetails.createBetween(
            previousCharDetails,
            nextCharDetails,
            newCharacter,
            getDisambiguator(),
            generateUniqueId()
          );
          charDetailsMap.set(newCharDetails.charId, newCharDetails);
          changesToApply.splice(
            changesToApply.length,
            0,
            newCharDetails.getAsChange()
          );
          sortedCharIds.splice(previousIndex + i + 1, 0, newCharDetails.charId);
          previousIndex += str.length;
        }
      }
    }
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
