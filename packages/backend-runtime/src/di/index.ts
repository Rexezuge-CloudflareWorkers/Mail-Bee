/**
 * The DI container is the kit's, unchanged.
 *
 * The local copy lost two members in the convergence — `resolve()` and
 * `createChild()` — and neither had a production caller here, so this barrel is
 * a re-export rather than a subclass. A subclass would be a second container to
 * drift from the first, which is the thing this migration exists to end.
 */
export { Container } from '@rexezuge/runtime';
export type { Factory, Token } from '@rexezuge/runtime';
