/**
 * tests/_helpers.ts — small test-only utilities.
 */
export function expectDefined<T>(
  value: T | undefined | null,
  message?: string
): asserts value is NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message ?? `expected value to be defined, got: ${String(value)}`);
  }
}
