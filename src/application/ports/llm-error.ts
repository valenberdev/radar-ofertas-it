export type LlmErrorKind =
  | "quota"
  | "unavailable"
  | "invalid_response"
  | "rejected";

export class LlmError extends Error {
  readonly kind: LlmErrorKind;

  constructor(kind: LlmErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LlmError";
    this.kind = kind;
  }
}
