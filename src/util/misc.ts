import { checkShareIsValid } from "../core-validators/addresses.ts";
import {
  alphaLower,
  workspaceKeyChars,
} from "../core-validators/characters.ts";
import { isErr, ValidationError } from "./errors.ts";

//================================================================================
// TIME

export function microsecondNow() {
  return Date.now() * 1000;
}

/** Returns a promise which is fulfilled after a given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((res) => {
    setTimeout(res, ms);
  });
}

// TODO: better randomness here
export function randomId(): string {
  return "" + Math.floor(Math.random() * 1000) +
    Math.floor(Math.random() * 1000);
}

// replace all occurrences of substring "from" with "to"
export function replaceAll(str: string, from: string, to: string): string {
  return str.split(from).join(to);
}

// how many times does the character occur in the string?

export function countChars(str: string, char: string) {
  if (char.length != 1) {
    throw new Error("char must have length 1 but is " + JSON.stringify(char));
  }
  return str.split(char).length - 1;
}

export function isObjectEmpty(obj: Object): Boolean {
  return Object.keys(obj).length === 0;
}

//================================================================================
// Share

/** Returns a valid share address generated using a given name.
 * @returns A share address or a validation error resulting from the name given.
 * @deprecated This function only generates valid es.4 addresses. Use Crypto.generateShareKeypair to generate es.5 share addresses.
 */
export function generateShareAddress(name: string): string | ValidationError {
  const randomFromString = (str: string) => {
    return str[Math.floor(Math.random() * str.length)];
  };

  const firstLetter = randomFromString(alphaLower);
  const rest = Array.from(Array(11), () => randomFromString(workspaceKeyChars))
    .join("");

  const suffix = `${firstLetter}${rest}`;
  const address = `+${name}.${suffix}`;

  return address;
}
