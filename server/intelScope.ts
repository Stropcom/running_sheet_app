// Per-request Intelligence scope. The tRPC guard (server/_core/trpc.ts) runs
// each request inside `intelScope.run(...)` when the person can't see some
// operations in Intelligence (another Command's Restricted ones); then
// getAllIntelligenceEntities() — and everything built on it: profiles, the map,
// duplicate checks — returns the trimmed set without each call site having to
// know. Region Search asks for the unscoped set on purpose (it shows the match
// and says whether you can open it).
import { AsyncLocalStorage } from "node:async_hooks";

export interface IntelScope {
  hiddenOperationIds: Set<number>;
}

export const intelScope = new AsyncLocalStorage<IntelScope>();
