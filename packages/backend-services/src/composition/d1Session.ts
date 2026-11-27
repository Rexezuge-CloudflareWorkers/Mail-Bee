/**
 * Session-backed env construction belongs to the data layer, but `apps/api`
 * is barred from importing `backend-data` values: the route/worker layer talks
 * to services only. This re-export is the composition-root seam that keeps the
 * request's D1 bookmark in one place without widening that import boundary.
 */
export { createD1SessionEnv } from '@mail-bee/backend-data/utils';
