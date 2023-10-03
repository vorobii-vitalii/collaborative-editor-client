import {DocumentContext} from "./DocumentContext";

const CHANGE_ID = "123";
const DISAMBIGUATOR = 2;

test('applyUserChange_InsertionEnd', () => {
    const documentContext = new DocumentContext();
    documentContext.applyExternalChange({
        charId: "1",
        disambiguator: 1,
        character: 'B',
        isRight: false,
        parentCharId: undefined
    });
    documentContext.applyExternalChange({
        charId: "3",
        disambiguator: 1,
        character: 'A',
        isRight: false,
        parentCharId: "1"
    });
    documentContext.applyExternalChange({
        charId: "2",
        disambiguator: 1,
        character: 'C',
        isRight: true,
        parentCharId: "1"
    });

    // User change
    const changesToApply =
        documentContext.applyUserChange("ABCX", DISAMBIGUATOR, () => CHANGE_ID);

    expect(changesToApply).toEqual([
        {
            charId: CHANGE_ID,
            disambiguator: DISAMBIGUATOR,
            character: 'X',
            parentCharId: '2',
            isRight: true
        }
    ])
    expect(documentContext.getDocumentContent()).toEqual("ABCX");
})

test('applyUserChange_InsertionBeginning', () => {
    const documentContext = new DocumentContext();
    documentContext.applyExternalChange({
        charId: "1",
        disambiguator: 1,
        character: 'B',
        isRight: false,
        parentCharId: undefined
    });
    documentContext.applyExternalChange({
        charId: "3",
        disambiguator: 1,
        character: 'A',
        isRight: false,
        parentCharId: "1"
    });
    documentContext.applyExternalChange({
        charId: "2",
        disambiguator: 1,
        character: 'C',
        isRight: true,
        parentCharId: "1"
    });

    // User change
    const changesToApply =
        documentContext.applyUserChange("XABC", DISAMBIGUATOR, () => CHANGE_ID);

    expect(changesToApply).toEqual([
        {
            charId: CHANGE_ID,
            disambiguator: DISAMBIGUATOR,
            character: 'X',
            parentCharId: '3',
            isRight: false
        }
    ])
    expect(documentContext.getDocumentContent()).toEqual("XABC");
});

test('applyUserChange_DeletionCase', () => {
    const documentContext = new DocumentContext();
    documentContext.applyExternalChange({
        charId: "1",
        disambiguator: 1,
        character: 'B',
        isRight: false,
        parentCharId: undefined
    });
    documentContext.applyExternalChange({
        charId: "3",
        disambiguator: 1,
        character: 'A',
        isRight: false,
        parentCharId: "1"
    });
    documentContext.applyExternalChange({
        charId: "2",
        disambiguator: 1,
        character: 'C',
        isRight: true,
        parentCharId: "1"
    });

    // User change
    const changesToApply =
        documentContext.applyUserChange("BC", DISAMBIGUATOR, () => CHANGE_ID);

    expect(changesToApply).toEqual([
        { charId: '3'}
    ])
    expect(documentContext.getDocumentContent()).toEqual("BC");
});

test('applyExternalChange_EventualDeletion', () => {
    const documentContext = new DocumentContext();
    documentContext.applyExternalChange({
        charId: "1",
        disambiguator: 1,
        character: 'B',
        isRight: false,
        parentCharId: undefined
    });
    documentContext.applyExternalChange({
        charId: "3",
        disambiguator: 1,
        character: 'A',
        isRight: false,
        parentCharId: "1"
    });
    documentContext.applyExternalChange({
        charId: "2",
        disambiguator: 1,
        character: 'C',
        isRight: true,
        parentCharId: "1"
    });
    expect(documentContext.getDocumentContent()).toEqual("ABC");
    documentContext.applyExternalChange({
        charId: "3",
        disambiguator: 1,
        character: undefined,
        isRight: false,
        parentCharId: "1"
    });
    expect(documentContext.getDocumentContent()).toEqual("BC");
})

test('applyExternalChange_CorrectOrderingOfChanges', () => {
    const documentContext = new DocumentContext();
    documentContext.applyExternalChange({
        charId: "1",
        disambiguator: 1,
        character: 'B',
        isRight: false,
        parentCharId: undefined
    });
    documentContext.applyExternalChange({
        charId: "3",
        disambiguator: 1,
        character: 'A',
        isRight: false,
        parentCharId: "1"
    });
    documentContext.applyExternalChange({
        charId: "2",
        disambiguator: 1,
        character: 'C',
        isRight: true,
        parentCharId: "1"
    });
    expect(documentContext.getDocumentContent()).toEqual("ABC");
});

test('applyExternalChange_WrongChangeOrdering', () => {
    const documentContext = new DocumentContext();
    documentContext.applyExternalChange({
        charId: "3",
        disambiguator: 1,
        character: 'A',
        isRight: false,
        parentCharId: "1"
    });
    documentContext.applyExternalChange({
        charId: "1",
        disambiguator: 1,
        character: 'B',
        isRight: false,
        parentCharId: undefined
    });
    documentContext.applyExternalChange({
        charId: "2",
        disambiguator: 1,
        character: 'C',
        isRight: true,
        parentCharId: "1"
    });
    expect(documentContext.getDocumentContent()).toEqual("ABC");
});