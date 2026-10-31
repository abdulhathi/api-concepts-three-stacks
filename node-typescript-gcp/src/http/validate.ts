// Concepts 5 and 6 · Path/query parameters and bodies are validated with the same zod schemas that feed OpenAPI.
import type { ZodType, z } from 'zod';
import { ApiProblem, type FieldError } from './problem.js';

function fieldName(path: PropertyKey[], root: string): string {
  const parts = path.map((segment) => (typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`));
  const joined = parts.join('').replace(/^\./, '');
  return joined || root;
}

/** Parses `input` with `schema`, turning zod issues into a 400 validation-error problem. */
export function parse<S extends ZodType>(schema: S, input: unknown, root = 'body'): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const errors: FieldError[] = result.error.issues.map((issue) => ({
    field: fieldName(issue.path, root),
    message: issue.message,
  }));
  const first = errors[0]!;
  throw new ApiProblem('validation-error', `${first.field} ${first.message}`, { errors });
}
