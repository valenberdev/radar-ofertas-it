import type { z } from "zod";

export interface JsonGenerator {
  generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T>;
}
