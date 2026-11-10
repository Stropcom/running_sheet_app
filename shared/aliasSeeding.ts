// Whether a registered person's surname alias ("SANTOS", the word the TGT chip
// writes) is searched for as a BARE word in a sheet's rows, and who it then
// means. One rule, tested in server/aliasSeeding.test.ts.
//
//  - An alias carried by ONE registered person is searched on every sheet, as
//    before.
//  - An alias shared by two or more registered people (a relative on the
//    registry, another target with the same surname) is not credited to
//    anybody from a bare word — EXCEPT on the sheet that was opened for one of
//    them: there the team's bare "SANTOS" is that sheet's target (the TGT chip
//    inserts exactly that word), so it is credited to them. Without this a
//    common surname silently stopped the sheet's own target from collecting
//    any of its rows (v2.76.6 – v2.79.13).
//  - A person the sheet itself introduces under that surname ("Rosa Maria
//    SANTOS (SANTOS)") still wins on that sheet — the caller lets a sheet's own
//    bracket introduction replace the seeded entry.

export interface OwnTargetAlias {
  /** The registered full name of the target this sheet was opened for. */
  name: string;
  /** Their TGT alias (case does not matter). */
  alias: string;
}

/** The registered name a bare `alias` is credited to on this sheet, or null
 * when it must not be searched for. `sharedBy` is how many different
 * registered people carry the alias; `mappedName` is the one the registry map
 * holds for it (only meaningful when `sharedBy` is 1). */
export function bareAliasOwner(args: {
  alias: string;
  sharedBy: number;
  mappedName: string;
  ownTarget?: OwnTargetAlias | null;
}): string | null {
  const own = args.ownTarget;
  if (own && own.alias.trim().toUpperCase() === args.alias.trim().toUpperCase())
    return own.name;
  return args.sharedBy > 1 ? null : args.mappedName;
}
