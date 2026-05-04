import { ZodError, ZodIssue, ZodTypeAny, z } from "zod";

import { NeuroLinkerConfigError } from "./errors.js";

function formatIssue(issue: ZodIssue): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
  return `${path}: ${issue.message}`;
}

function formatZodError(err: ZodError): string {
  return err.issues.map(formatIssue).join("; ");
}

export function parseOrThrow<S extends ZodTypeAny>(
  schema: S,
  value: unknown,
  label: string,
): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new NeuroLinkerConfigError(`Invalid ${label}: ${formatZodError(result.error)}`);
  }
  return result.data;
}

export function parseListOrThrow<S extends ZodTypeAny>(
  itemSchema: S,
  values: unknown,
  label: string,
  opts?: { allowEmpty?: boolean },
): z.infer<S>[] {
  if (!Array.isArray(values)) {
    throw new NeuroLinkerConfigError(`${label} must be a list.`);
  }
  if (values.length === 0 && !opts?.allowEmpty) {
    throw new NeuroLinkerConfigError(`${label} must be a non-empty list.`);
  }
  return values.map((item, idx) => parseOrThrow(itemSchema, item, `${label}[${idx}]`));
}
