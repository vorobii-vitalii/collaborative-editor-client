import {cleanup, fireEvent, render} from '@testing-library/react';
import {EditorMainView} from "./EditorMainView";
import {AbstractSocket, ApplyChange, Change, ConnectBaseMessage} from "./AbstractSocket";
import {DocumentContext} from "./DocumentContext";

class StubSocket implements AbstractSocket {
    private readonly messagesOnConnect: Array<ConnectBaseMessage>;
    private userChanges: Map<string, Array<ApplyChange>> = new Map<string, Array<ApplyChange>>();

    constructor(messagesOnConnect: Array<ConnectBaseMessage>) {
        this.messagesOnConnect = messagesOnConnect;
    }

    applyChanges(
        changeId: string,
        changesToApply: Array<ApplyChange>,
        onApplied: (success: boolean) => void
    ): void {
        this.userChanges.set(changeId, changesToApply);
        onApplied(true)
    }

    connect(
        batchSize: number,
        onReceive: (msg: ConnectBaseMessage) => void
    ): void {
        for (const message of this.messagesOnConnect) {
            onReceive(message)
        }
    }

    public getUserChanges() {
        return this.userChanges;
    }
}

const CONNECTION_ID = 2;
const NEW_ID = "123";

const testIdGenerator = () => NEW_ID;


const DOCUMENT_TEXTAREA_ID = "documentTextArea";
test('noUserChangesHappyPath', () => {
    const socket = new StubSocket([
        {
            responseType: "ON_CONNECT",
            payload: {
                connectionId: CONNECTION_ID
            }
        },
        {
            responseType: "CHANGES",
            payload: {
                changes: [
                    {
                        charId: "2",
                        disambiguator: 1,
                        character: "A",
                        isRight: false,
                        parentCharId: "1"
                    } as Change,
                    {
                        charId: "1",
                        disambiguator: 1,
                        character: "B",
                        isRight: true,
                        parentCharId: undefined
                    } as Change,
                    {
                        charId: "3",
                        disambiguator: 1,
                        character: "C",
                        isRight: true,
                        parentCharId: "1"
                    } as Change
                ],
                isEndOfStream: false,
                source: "source"
            }
        },
        {
            responseType: "CHANGES",
            payload: {
                changes: [],
                isEndOfStream: true,
                source: "source"
            }
        }

    ]);
    const { getByTestId } = render(
        <EditorMainView socket={socket} idGenerator={testIdGenerator} documentContext={new DocumentContext()} />,
    );
    const textarea = getByTestId(DOCUMENT_TEXTAREA_ID);

    expect(textarea).toBeTruthy();
    expect(textarea).toHaveTextContent("ABC");
});


test('noUserChanges_LoadingScreen', () => {
    const socket = new StubSocket([
        {
            responseType: "ON_CONNECT",
            payload: {
                connectionId: CONNECTION_ID
            }
        },
        {
            responseType: "CHANGES",
            payload: {
                changes: [
                    {
                        charId: "2",
                        disambiguator: 1,
                        character: "A",
                        isRight: false,
                        parentCharId: "1"
                    } as Change,
                    {
                        charId: "1",
                        disambiguator: 1,
                        character: "B",
                        isRight: true,
                        parentCharId: undefined
                    } as Change,
                    {
                        charId: "3",
                        disambiguator: 1,
                        character: "C",
                        isRight: true,
                        parentCharId: "1"
                    } as Change
                ],
                isEndOfStream: false,
                source: "source"
            }
        }
    ]);
    const { getByText } = render(
        <EditorMainView socket={socket} idGenerator={testIdGenerator} documentContext={new DocumentContext()} />,
    );
    expect(getByText("Hold on, document is still loading!")).toBeTruthy();
});

test('userChangeToEmptyDocument', () => {
    const socket = new StubSocket([
        {
            responseType: "ON_CONNECT",
            payload: {
                connectionId: CONNECTION_ID
            }
        },
        {
            responseType: "CHANGES",
            payload: {
                changes: [],
                isEndOfStream: true,
                source: "source"
            }
        }
    ]);
    const { getByTestId } = render(
        <EditorMainView socket={socket} idGenerator={testIdGenerator} documentContext={new DocumentContext()} />,
    );
    const textarea = getByTestId(DOCUMENT_TEXTAREA_ID);
    expect(textarea).toBeTruthy();
    fireEvent.change(textarea, {target: {value: 'A'}})
    const expectedChanges = new Map<string, Array<ApplyChange>>();
    expectedChanges.set(NEW_ID, [
        {
            charId: NEW_ID,
            character: 'A',
            isRight: true,
            parentCharId: undefined,
            disambiguator: CONNECTION_ID
        }
    ]);
    expect(socket.getUserChanges()).toEqual(expectedChanges)
});