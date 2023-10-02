import { CharDetails } from "./CharDetails";
import { Path } from "./Path";

const NEW_CHARACTER = 'B';
const NEW_DISAMBIGUATOR = 12;
const NEW_CHAR_ID = '235363w46w';

const LEFT_CHARACTER = 'A';
const LEFT_DISAMBIGUATOR = 14;
const LEFT_CHAR_ID = '235363w462';

const RIGHT_CHARACTER = 'C';
const RIGHT_DISAMBIGUATOR = 16;
const RIGHT_CHAR_ID = '235363w46a';

const LEFT_DIRECTION = false;
const RIGHT_DIRECTION = true;

const LEFT_CHAR_DETAILS =
  new CharDetails(LEFT_CHAR_ID, undefined, LEFT_DIRECTION, LEFT_DISAMBIGUATOR, LEFT_CHARACTER)
    .updatePath(new Path([], []));

const RIGHT_CHAR_DETAILS =
  new CharDetails(RIGHT_CHAR_ID, undefined, RIGHT_DIRECTION, RIGHT_DISAMBIGUATOR, RIGHT_CHARACTER)
    .updatePath(new Path([], []));

test('createBetween_Given_Both_Paths_Undefined', () => {
  expect(
    CharDetails.createBetween(
      undefined,
      undefined,
      NEW_CHARACTER,
      NEW_DISAMBIGUATOR,
      NEW_CHAR_ID
    )
  ).toEqual(
    new CharDetails(
      NEW_CHAR_ID,
      undefined,
      true,
      NEW_DISAMBIGUATOR,
      NEW_CHARACTER
    ).updatePath(new Path([], [])))
});

test('createBetween_Given_Left_Path_Undefined', () => {
  expect(
    CharDetails.createBetween(
      undefined,
      RIGHT_CHAR_DETAILS,
      NEW_CHARACTER,
      NEW_DISAMBIGUATOR,
      NEW_CHAR_ID
    )
  ).toEqual(
    new CharDetails(
      NEW_CHAR_ID,
      RIGHT_CHAR_ID,
      false,
      NEW_DISAMBIGUATOR,
      NEW_CHARACTER
    ).updatePath(new Path([RIGHT_DIRECTION], [RIGHT_DISAMBIGUATOR])));
});

test('createBetween_Given_Right_Path_Undefined', () => {
  expect(
    CharDetails.createBetween(
      LEFT_CHAR_DETAILS,
      undefined,
      NEW_CHARACTER,
      NEW_DISAMBIGUATOR,
      NEW_CHAR_ID
    )
  ).toEqual(
    new CharDetails(
      NEW_CHAR_ID,
      LEFT_CHAR_ID,
      true,
      NEW_DISAMBIGUATOR,
      NEW_CHARACTER
    ).updatePath(new Path([LEFT_DIRECTION], [LEFT_DISAMBIGUATOR])));
});