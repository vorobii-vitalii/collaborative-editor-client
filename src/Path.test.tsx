import { Path } from "./Path";

test('length', () => {
  expect(new Path([false], [1]).length())
    .toBe(1);
});

test('addAncestor', () => {
  expect(new Path([false], [1]).addAncestor(true, 2))
    .toEqual(new Path([false, true], [1, 2]));
});

test('isAncestorOf_Given_Other_Path_Child_Of_The_Path', () => {
  expect(new Path([false], [1])
    .isAncestorOf(new Path([false, true], [1, 4])))
    .toEqual(true);
});

test('isAncestorOf_Given_Paths_Dont_Share_Same_Branch', () => {
  expect(new Path([false], [1])
    .isAncestorOf(new Path([true, true], [2, 4])))
    .toEqual(false);
});

test('findOptimalPosition_Given_Path_Bigger_Of_Any_Other_Paths_In_Array', () => {
  const paths = [
    new Path([], []),
    new Path([true], [1]),
    new Path([true, false], [1, 1]),
    new Path([true, true], [1, 1]),
  ];
  const path =
    new Path([true, true, true], [1, 1, 3]);
  expect(path.findOptimalPosition(paths.length, i => paths[i]))
    .toEqual(paths.length); // Should be put in end
});

test('findOptimalPosition_Given_Path_Smaller_Of_Any_Other_Paths_In_Array', () => {
  const paths = [
    new Path([], []),
    new Path([true], [1]),
    new Path([true, false], [1, 1]),
    new Path([true, true], [1, 1]),
  ];
  const path =
    new Path([false, false, false], [1, 4, 12]);
  expect(path.findOptimalPosition(paths.length, i => paths[i]))
    .toEqual(0); // Should be put in beginning
});

test('findOptimalPosition_Given_Path_Is_Bigger_Than_Half', () => {
  const paths = [
    new Path([], []),
    new Path([true, false], [1, 1]),
    new Path([true], [1]),
    new Path([true, true], [1, 1]),
  ];
  const path =
    new Path([true, false, true], [1, 4, 12]);
  expect(path.findOptimalPosition(paths.length, i => paths[i]))
    .toEqual(2);
});