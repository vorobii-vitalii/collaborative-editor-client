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

interface EditorMainProps {
  socket: AbstractSocket;
}

const GREATER = 1;
const LOWER = -1;
const EQUAL = 0;

class Path {
  directions: Array<boolean>;
  disambiguators: Array<number>;

  constructor(directions: Array<boolean>, disambiguators: Array<number>) {
    this.directions = directions;
    this.disambiguators = disambiguators;
  }

  length() {
    return this.directions.length;
  }

  addAncestor(direction: boolean, disambiguator: number) {
    return new Path(
      [...this.directions, direction],
      [...this.disambiguators, disambiguator]
    );
  }

  isAncestorOf(path: Path) {
    const leftLength = this.length();
    const rightLength = path.length();
    if (rightLength < leftLength) {
      return false;
    }
    for (let i = 0; i < leftLength; i++) {
      if (
        this.directions[i] !== path.directions[i] ||
        this.disambiguators[i] !== path.disambiguators[i]
      ) {
        return false;
      }
    }
    return true;
  }

  compare(anotherPath: Path) {
    const leftLength = this.length();
    const rightLength = anotherPath.length();
    const minLength = Math.min(leftLength, rightLength);
    for (let i = 0; i < minLength; i++) {
      if (this.directions[i] !== anotherPath.directions[i]) {
        return this.directions[i] ? GREATER : LOWER;
      }
      if (this.disambiguators[i] !== anotherPath.disambiguators[i]) {
        return this.disambiguators[i] < anotherPath.disambiguators[i]
          ? LOWER
          : GREATER;
      }
    }
    // Paths are equal
    if (leftLength === rightLength) {
      return EQUAL;
    }
    if (leftLength === minLength) {
      return anotherPath.directions[minLength] ? LOWER : GREATER;
    }
    return this.directions[minLength] ? GREATER : LOWER;
  }
}

class CharDetails {
  // TODO: Timestamp
  public charId: string;
  public parentCharId: string | undefined;
  private direction: boolean;
  private disambiguator: number;
  private path?: Path;
  public character?: string;

  public constructor(
    charId: string,
    parentCharId: string | undefined,
    direction: boolean,
    disambiguator: number,
    character?: string
  ) {
    this.parentCharId = parentCharId;
    this.character = character;
    this.charId = charId;
    this.direction = direction;
    this.disambiguator = disambiguator;
  }

  public getAsChange(): ApplyChange {
    return {
      charId: this.charId,
      disambiguator: this.disambiguator,
      character: this.character,
      parentCharId: this.parentCharId,
      isRight: this.direction
    };
  }

  public updateCharacter(character: string | undefined) {
    this.character = character;
  }

  public getPath() {
    return this.path;
  }

  public updatePath(parentPath: Path) {
    this.path = parentPath.addAncestor(this.direction, this.disambiguator);
    return this;
  }
}

const BATCH_SIZE = 1000;
const sortedCharIds = new Array<string>();
const charDetailsMap = new Map<string, CharDetails>();

export function EditorMainView(props: EditorMainProps) {
  const socket = props.socket;
  const [connectionId, setConnectionId] = useState<String>();
  const [isLoaded, setLoaded] = useState(false);
  const dependenciesCharIdsByCharId = new Map<string, Set<string>>();
  const [editorState, setEditorState] = useState<EditorState>(
    EditorState.createEmpty()
  );
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

  const binarySearch = (path: Path) => {
    if (
      sortedCharIds.length > 0 &&
      path.compare(getPathByIndex(sortedCharIds.length - 1)) === GREATER
    ) {
      return sortedCharIds.length;
    }
    let low = 0;
    let high = sortedCharIds.length - 1;
    let res = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const c = path.compare(getPathByIndex(mid));
      if (c === EQUAL) {
        return mid;
      }
      if (c === GREATER) {
        low = mid + 1;
      } else {
        res = mid;
        high = mid - 1;
      }
    }
    return res;
  };

  const generateUniqueId = () => {
    return crypto.randomUUID();
  };

  const getDisambiguator = () => Number(connectionId!!);

  const createNewCharacter = (
    left: CharDetails | undefined,
    right: CharDetails | undefined,
    character: string
  ): CharDetails => {
    // console.log(`Inserting between ${JSON.stringify(left)} and ${JSON.stringify(right)} = ${character}`)
    if (!left && !right) {
      return new CharDetails(
        generateUniqueId(),
        undefined,
        true,
        getDisambiguator(),
        character
      ).updatePath(new Path([], []));
    }
    if (!left) {
      return new CharDetails(
        generateUniqueId(),
        right?.charId,
        false,
        getDisambiguator(),
        character
      ).updatePath(right?.getPath()!!);
    }
    if (!right) {
      return new CharDetails(
        generateUniqueId(),
        left?.charId,
        true,
        getDisambiguator(),
        character
      ).updatePath(left?.getPath()!!);
    }
    if (left.getPath()!!.isAncestorOf(right.getPath()!!)) {
      return new CharDetails(
        generateUniqueId(),
        right?.charId,
        false,
        getDisambiguator(),
        character
      ).updatePath(right?.getPath()!!);
    }
    return new CharDetails(
      generateUniqueId(),
      left?.charId,
      true,
      getDisambiguator(),
      character
    ).updatePath(left?.getPath()!!);
  };

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
      const newCharacterIndex = binarySearch(charDetails.getPath()!!);
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
    setEditorState(
      EditorState.createWithContent(
        ContentState.createFromText(currentDocumentContent)
      )
    );
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

  useEffect(() => {
    const updatedDocumentContent = editorState
      .getCurrentContent()
      .getPlainText();
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
          const newCharDetails = createNewCharacter(
            previousCharDetails,
            nextCharDetails,
            newCharacter
          );
          charDetailsMap.set(newCharDetails.charId, newCharDetails);
          changesToApply.splice(
            changesToApply.length,
            0,
            newCharDetails.getAsChange()
          );
          sortedCharIds.splice(previousIndex + i + 1, 0, newCharDetails.charId);
        }
      }
      previousIndex += str.length;
    }
    if (changesToApply.length === 0) {
      return;
    }
    setPreviousContent(updatedDocumentContent);
    socket.applyChanges(generateUniqueId(), changesToApply, success => {
      console.log(`Change applied successfully = ${success}`);
    });
  }, [editorState]);

  if (!isLoaded) {
    return <p>Hold on, document is still loading!</p>;
  }
  return <Editor editorState={editorState} onChange={setEditorState} />;
}
