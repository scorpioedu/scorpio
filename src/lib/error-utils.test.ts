import { errorCode, errorMessage } from "./error-utils";

describe("errorMessage", () => {
  test("reads the message of an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });
  test("reads the message of a plain object", () => {
    expect(errorMessage({ message: "plain" })).toBe("plain");
  });
  test("returns undefined for thrown strings, null and undefined", () => {
    expect(errorMessage("oops")).toBeUndefined();
    expect(errorMessage(null)).toBeUndefined();
    expect(errorMessage(undefined)).toBeUndefined();
  });
  test("returns undefined when message is not a string", () => {
    expect(errorMessage({ message: 42 })).toBeUndefined();
  });
});

describe("errorCode", () => {
  test("reads a Firebase style code", () => {
    expect(errorCode({ code: "auth/weak-password", message: "x" })).toBe("auth/weak-password");
  });
  test("returns undefined when there is no string code", () => {
    expect(errorCode(new Error("x"))).toBeUndefined();
    expect(errorCode({ code: 500 })).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });
});
