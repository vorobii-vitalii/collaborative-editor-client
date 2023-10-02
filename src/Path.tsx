import { EQUAL, GREATER, LOWER } from "./constants";

export class Path {
  directions: Array<boolean>;
  disambiguators: Array<number>;

  constructor(directions: Array<boolean>, disambiguators: Array<number>) {
    this.directions = directions;
    this.disambiguators = disambiguators;
  }

  length() {
    return this.directions.length;
  }

  // O(log(n))
  findOptimalPosition(n : number, pathExtractor: (idx : number) => Path) {
    if (n > 0 && this.compare(pathExtractor(n - 1)) === GREATER) {
      return n;
    }
    let low = 0;
    let high = n - 1;
    let res = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const c = this.compare(pathExtractor(mid));
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
