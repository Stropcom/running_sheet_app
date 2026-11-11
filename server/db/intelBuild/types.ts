import type { getDb } from "../core";

/** The database handle the builder steps use (never null: the builder returns early without one). */
export type BuildDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
