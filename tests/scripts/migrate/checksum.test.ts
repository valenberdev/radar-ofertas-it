import { describe, expect, it } from "vitest";
import { checksum } from "../../../scripts/migrate/checksum.mts";

describe("checksum", () => {
  it("returns the SHA-256 of the content as lowercase hex", () => {
    expect(checksum("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is stable for the same content", () => {
    expect(checksum("select 1;")).toBe(checksum("select 1;"));
  });

  it("changes when the content changes", () => {
    expect(checksum("select 1;")).not.toBe(checksum("select 2;"));
  });

  it("changes on whitespace edits other than line endings", () => {
    expect(checksum("select 1;")).not.toBe(checksum("select 1; "));
    expect(checksum("select 1;\n")).not.toBe(checksum("select 1;"));
  });

  it("ignores the difference between CRLF and LF line endings", () => {
    const unix = "create table a (\n  id int\n);\n";
    const windows = "create table a (\r\n  id int\r\n);\r\n";
    expect(checksum(windows)).toBe(checksum(unix));
  });

  it("ignores a leading byte order mark", () => {
    expect(checksum("\uFEFFselect 1;")).toBe(checksum("select 1;"));
  });

  it("hashes the empty string", () => {
    expect(checksum("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
