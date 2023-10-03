import {CharDetails} from "./CharDetails";
import {Path} from "./Path";
import {ApplyChange, Change} from "./AbstractSocket";
import {DIFF_DELETE, DIFF_EQUAL, DIFF_INSERT, diff_match_patch} from "diff-match-patch";


export class DocumentContext {
    private charDetailsMap = new Map<string, CharDetails>();
    private sortedCharIds = new Array<string>();
    private dependenciesCharIdsByCharId = new Map<string, Set<string>>();
    private previousContent: string = "";

    public applyUserChange(
        updatedDocumentContent: string,
        disambiguator: number,
        changeIdGenerator : () => string
    ) {
        const diffMatchPatch = new diff_match_patch();
        const differences = diffMatchPatch.diff_main(
            this.previousContent,
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
                    const charIdToDelete = this.sortedCharIds[previousIndex + 1];
                    changesToApply.splice(changesToApply.length, 0, {
                        charId: charIdToDelete
                    });
                    const charDetails = this.charDetailsMap.get(charIdToDelete)!!;
                    this.sortedCharIds.splice(previousIndex + 1, 1);
                    charDetails.updateCharacter(undefined);
                }
            } else if (v === DIFF_INSERT) {
                const nextCharDetails = this.getCharDetails(previousIndex + 1);
                for (let i = 0; i < str.length; i++) {
                    const newCharacter = str.charAt(i);
                    const previousCharDetails = this.getCharDetails(previousIndex + i);
                    const newCharDetails = CharDetails.createBetween(
                        previousCharDetails,
                        nextCharDetails,
                        newCharacter,
                        disambiguator,
                        changeIdGenerator()
                    );
                    this.charDetailsMap.set(newCharDetails.charId, newCharDetails);
                    changesToApply.splice(
                        changesToApply.length,
                        0,
                        newCharDetails.getAsChange()
                    );
                    this.sortedCharIds.splice(previousIndex + i + 1, 0, newCharDetails.charId);
                    previousIndex += str.length;
                }
            }
        }
        this.previousContent = updatedDocumentContent;
        return changesToApply;
    }

    public applyExternalChange(change: Change) {
        const charId = change.charId;
        const isAlreadyPresent = this.charDetailsMap.has(charId);
        if (isAlreadyPresent) {
            this.charDetailsMap.get(charId)!!.updateCharacter(change.character);
            this.recalculateDocumentContent();
        } else {
            const charDetails = new CharDetails(
                charId,
                change.parentCharId,
                change.isRight,
                change.disambiguator,
                change.character
            );
            this.charDetailsMap.set(charId, charDetails);
            const parentCharId = change.parentCharId;
            const parentPath = this.findPath(parentCharId);
            if (parentPath) {
                this.onPathReady(charId, parentPath);
                this.recalculateDocumentContent();
            } else {
                this.createDependency(charId, parentCharId!!);
            }
        }
    }

    public getDocumentContent() {
        return this.previousContent;
    }

    private getCharDetails = (index: number) => {
        if (index < 0 || index >= this.sortedCharIds.length) {
            return undefined;
        }
        return this.charDetailsMap.get(this.sortedCharIds[index]);
    };

    private recalculateDocumentContent() {
        this.previousContent = this.sortedCharIds
            .map(v => this.charDetailsMap.get(v))
            .map(v => v && v.character)
            .join("");
    }

    private getPathByIndex = (index: number) => this.charDetailsMap.get(this.sortedCharIds[index])!!.getPath()!!;

    private onPathReady = (charId: string, rootPath: Path) => {
        // No cycle is possible, cuz its tree :)
        const queue = new Array<{ charId: string; parentPath: Path }>();
        queue.push({ charId, parentPath: rootPath });
        while (queue.length > 0) {
            const pair = queue.shift();
            if (!pair) {
                continue;
            }
            const charDetails = this.charDetailsMap.get(pair.charId)!!;
            charDetails.updatePath(pair.parentPath);
            // Add to array
            const newCharacterIndex = charDetails.getPath()!!.findOptimalPosition(
                this.sortedCharIds.length,
                this.getPathByIndex
            );
            if (charDetails.character) {
                this.sortedCharIds.splice(newCharacterIndex, 0, pair.charId);
            } else {
                if (
                    newCharacterIndex >= 0 &&
                    newCharacterIndex < this.sortedCharIds.length
                ) {
                    this.sortedCharIds.splice(newCharacterIndex, 1);
                }
            }
            // Update ancestors...
            const dependencies = this.dependenciesCharIdsByCharId.get(pair.charId);
            dependencies && dependencies.forEach(dependencyCharId => {
                queue.push({
                    charId: dependencyCharId,
                    parentPath: charDetails.getPath()!!
                });
            });
            this.dependenciesCharIdsByCharId.delete(pair.charId);
        }
    };

    private findPath = (charId?: string): Path | undefined => {
        if (!charId) {
            return new Path([], []);
        }
        const charDetails = this.charDetailsMap.get(charId);
        return charDetails && charDetails.getPath();
    }

    private createDependency = (dependent: string, dependency: string) => {
        if (!this.dependenciesCharIdsByCharId.has(dependency)) {
            this.dependenciesCharIdsByCharId.set(dependency, new Set<string>());
        }
        const set = this.dependenciesCharIdsByCharId.get(dependency);
        this.dependenciesCharIdsByCharId.set(dependency, set!!.add(dependent));
    };

}