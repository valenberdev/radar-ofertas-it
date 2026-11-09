import { describe, expect, it } from "vitest";
import { LlmError } from "../../../src/application/ports/llm-error";

describe("LlmError", () => {
  it("is an Error that carries its kind and message", () => {
    const error = new LlmError("quota", "Gemini quota exceeded (429)");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.kind).toBe("quota");
    expect(error.message).toBe("Gemini quota exceeded (429)");
    expect(error.name).toBe("LlmError");
  });

  it("keeps the cause when there is one", () => {
    const cause = new Error("socket hang up");

    expect(new LlmError("unavailable", "failed", { cause }).cause).toBe(cause);
  });

  it("has no cause by default", () => {
    expect(new LlmError("rejected", "failed").cause).toBeUndefined();
  });
});
