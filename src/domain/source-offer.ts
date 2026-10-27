export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SourceName = "himalayas" | "hackernews";

export interface SourceOffer {
  readonly source: SourceName;
  readonly sourceId: string;
  readonly title: string;
  readonly company: string | null;
  readonly url: string;
  readonly description: string;
  readonly postedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly raw: JsonValue;
}
