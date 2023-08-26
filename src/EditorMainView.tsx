import React, {
  createRef,
  RefObject,
  useEffect,
  useMemo,
  useState
} from "react";
import { RSocket } from "rsocket-core";
import { encode, decode } from "@msgpack/msgpack";
import { Buffer } from "buffer";
// @ts-ignore
import pako from "pako";

interface EditorMainProps {
  socket: RSocket;
}

interface ConnectBaseMessage {
  responseType: "ON_CONNECT" | "CHANGES";
  payload: any;
}

interface ConnectedMessagePayload {
  connectionId: string;
}

interface Change {
  charId: string;
  parentCharId?: string;
  isRight: boolean;
  disambiguator: number;
  character: string;
}

interface ChangesPayload {
  changes: Array<Change>;
  isEndOfStream: boolean;
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
  private charId: string;
  private direction: boolean;
  private disambiguator: number;
  private path?: Path;
  public character?: string;

  public constructor(
    charId: string,
    direction: boolean,
    disambiguator: number,
    character?: string
  ) {
    this.character = character;
    this.charId = charId;
    this.direction = direction;
    this.disambiguator = disambiguator;
  }

  public updateCharacter(character: string | undefined) {
    this.character = character;
  }

  public getPath() {
    return this.path;
  }

  public updatePath(parentPath: Path) {
    this.path = parentPath.addAncestor(this.direction, this.disambiguator);
  }
}

const INITIAL_REQUEST = 100;
const BATCH_SIZE = 1000;

export function EditorMainView(props: EditorMainProps) {
  const socket = props.socket;
  const [connectionId, setConnectionId] = useState<String>();
  const [isLoaded, setLoaded] = useState(false);
  const charDetailsMap = new Map<string, CharDetails>();
  const dependenciesCharIdsByCharId = new Map<string, Set<string>>();
  const sortedCharIds = new Array<string>();
  const [documentContent, setDocumentContent] = useState<string>("");

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
    // printSet(set!!);
    dependenciesCharIdsByCharId.set(dependency, set!!.add(dependent));
    // console.log(`Updated dependencies for ${dependency} (added ${dependent})`);
    // printSet(dependenciesCharIdsByCharId.get(dependency)!!);
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
      // console.log(`Parent path for ${pair.charId} found!`);
      // Add to array
      const newCharacterIndex = binarySearch(charDetails.getPath()!!);
      // console.log(`Adding character ${charDetails.character} to index ${newCharacterIndex}`);
      sortedCharIds.splice(newCharacterIndex, 0, pair.charId);
      // console.log(`Updated length = ${sortedCharIds.length}`);
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
    // console.log("Recalculating document content...");
    const updatedDocumentContent = sortedCharIds
      .map(v => charDetailsMap.get(v))
      .map(v => v && v.character)
      .filter(v => v)
      .join("");
    // // console.log(`New document content = `);
    // // console.log(updatedDocumentContent);
    return updatedDocumentContent;
  };

  const onDocumentChangesBatch = (changes: ChangesPayload) => {
    // console.log("Received document changes batch!");
    if (changes.isEndOfStream) {
      setLoaded(true);
    }
    for (const change of changes.changes) {
      const charId = change.charId;
      const isAlreadyPresent = charDetailsMap.has(charId);
      if (isAlreadyPresent) {
        // console.log(`charId ${charId} already present!`);
        charDetailsMap.get(charId)!!.updateCharacter(change.character);
      } else {
        // console.log(`Visiting ${charId}`);
        const charDetails = new CharDetails(
          charId,
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
          // console.log(`Will visit charId ${charId} later when parent path ready...`);
          createDependency(charId, parentCharId!!);
        }
      }
    }
    if (isLoaded || changes.isEndOfStream) {
      setDocumentContent(recalculateDocumentContent());
    }
  };

  const [isConnectSent, setConnectSent] = useState(false);

  useEffect(() => {
    if (isConnectSent) {
      return;
    }
    setConnectSent(true);
    // TODO: Investigate SETUP message in RSocket, it might simplify design...
    // console.log("Sending connect message to server...");
    const connectMessage = Buffer.from(
      encode({
        type: "CONNECT",
        batchSize: BATCH_SIZE
      })
    );

    socket.requestStream({ data: connectMessage }, INITIAL_REQUEST, {
      onNext(payload, isComplete) {
        const buffer = payload.data;
        // console.log(`On next ${buffer}`);
        if (!buffer) {
          console.warn("Skipping response message with null payload..");
          return;
        }
        const decodedMessage = decode(new Uint8Array(buffer));
        // console.log(`Decoded message ${decodedMessage}`);
        const message = decodedMessage as ConnectBaseMessage;
        // console.log(`Message ${decodedMessage} ${message.responseType}`);
        if (message.responseType === "ON_CONNECT") {
          // console.log("Received on connect message!");
          const connectedData = message.payload as ConnectedMessagePayload;
          setConnectionId(connectedData.connectionId);
        } else {
          onDocumentChangesBatch(message.payload as ChangesPayload);
        }
      },
      onError(error) {
        console.error(error);
      },
      onComplete() {
        // console.log("on complete!");
      },
      onExtension(extendedType, content, canBeIgnored) {}
    });
  }, [socket, onDocumentChangesBatch, isConnectSent, setConnectSent]);

  if (!isLoaded) {
    return <p>Hold on, document is still loading!</p>;
  }
  return <textarea value={documentContent} readOnly={true} />;
}
