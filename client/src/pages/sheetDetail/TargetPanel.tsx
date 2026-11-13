// Part of the running sheet screen (client/src/pages/SheetDetail.tsx). The screen's layout used to be
// one 2,800-line return; each section is now a component that takes the screen's state as `s`
// (see useSheetScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { fillRoute } from "@shared/parkingRoute";
import { seatedOccupantWording, seatsOf } from "@shared/vehicleSeats";
import { orderRsChips } from "@shared/rsChips";
import { endedContinuityCard } from "@/lib/surveillanceCard";
import { CeaseRowButton } from "@/components/CeaseRowButton";
import {
  samePlace,
  targetEmoji,
  vehiclesPeopleCanReach,
} from "@shared/targetPosition";
import { alightedWording } from "@/lib/transitCards";
import { shortAddressLabel } from "@shared/markerLink";
import {
  occupantsToVehicle,
  occupantWording,
  vehicleOccupants as sharedVehicleOccupants,
  occupantsStillInVehicle,
  splitPeopleNames,
  surnameTokens,
  isReadAsMovement,
} from "@shared/walkEventPatterns";
import { knownSurnamesOf } from "@shared/companions";
import {
  pickSubjectCardKey,
  subjectCompanions,
  trackedTargetCode,
} from "@shared/trackedTarget";
import { shortcutInsertText, shortcutRowSubject } from "@shared/shortcutRow";
import { returnedInsideSentence } from "@shared/outFront";
import {
  continuedOccupantWording,
  leftAddressSentence,
  vehicleDepartLabel,
  walkedToVehicleLabel,
} from "@shared/vehicleCardWording";
import {
  ContinuityCards,
  type ContinuityCardData,
} from "@/components/ContinuityCards";
import { Pencil, Target, Tag } from "lucide-react";
import React from "react";
import {
  extractOccupantNames,
  shortenAlreadyMentionedNames,
} from "@/lib/mentionAutocomplete";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { ShortcutChip } from "./EditableCell";
import { onTransitCards, transitBoardActions } from "@/lib/transitCards";
import type { SheetScreen } from "./useSheetScreen";

/** the target card and the quick-insert chips. */
export function TargetPanel({ s }: { s: SheetScreen }) {
  const {
    sheet,
    isOnline,
    sheetId,
    navigate,
    assignedTarget,
    entityChips,
    pendingArrivals,
    pendingDepartures,
    pendingWalkIns,
    pendingHeadingTo,
    shortcutsData,
    usedBracketCodesWithDraft,
    rows,
    pendingPlacements,
    trackedTarget,
    surveillance,
    targetPosition,
    focusedTextareaRef,
    _addRowOnline,
    setJustAddedRowId,
    _deleteRowOnline,
    setTargetPanelExpanded,
    targetPanelExpanded,
    ownRowShortcut,
    ceaseAvailable,
    ceasePlace,
    invalidateRows,
    ceaseOpenForTyping,
    trackingSettings,
    continuityDismissed,
    setContinuityDismissal,
  } = s;
  return (
    <>
      {/* TARGET Panel — target card fields (when assigned) plus entity
            chips mined from this sheet's own observations, in one panel so
            officers see every quick-insert chip together. */}
      {((sheet?.targetId && assignedTarget) ||
        (entityChips && entityChips.length > 0) ||
        (pendingArrivals && pendingArrivals.length > 0) ||
        (pendingDepartures && pendingDepartures.length > 0) ||
        (pendingWalkIns && pendingWalkIns.length > 0) ||
        (pendingHeadingTo && pendingHeadingTo.length > 0)) &&
        (() => {
          const t = assignedTarget;
          const hasTarget = !!(sheet?.targetId && t);
          // Build dynamic extra vehicle fields from JSON
          const extraVehicleFields: {
            label: string;
            value: string | null;
          }[] = [];
          if (t) {
            try {
              const evs: Array<{ full: string; short: string }> = JSON.parse(
                (t as any).extraVehicles ?? "[]"
              );
              evs.forEach((ev, i) => {
                const num = i + 2;
                if (ev.full)
                  extraVehicleFields.push({
                    label: `V${num}F`,
                    value: ev.full,
                  });
                if (ev.short)
                  extraVehicleFields.push({
                    label: `V${num}`,
                    value: ev.short,
                  });
              });
            } catch {}
          }
          const fields: {
            label: string;
            value: string | null;
            shortcutId?: number;
            startsRow?: boolean;
          }[] = t
            ? [
                { label: "TGT", value: t.tgt },
                { label: "HBF", value: t.hbf },
                { label: "HB", value: t.hb },
                { label: "V1F", value: t.v1f },
                { label: "V1", value: t.v1 ?? null },
                ...extraVehicleFields,
                // All shortcut-folder triggers as chips — only those with showInRs=true, exclude legacy 'D' chip
                ...(shortcutsData ?? [])
                  .filter(s => s.trigger.toUpperCase() !== "D" && !!s.showInRs)
                  .map(s => ({
                    label: s.trigger.toUpperCase(),
                    value: s.expansion,
                    shortcutId: s.id,
                    startsRow: !!s.startsRow,
                  })),
              ]
            : [];
          const hasAnyField = fields.some(f => f.value);
          // The cards below word names against everything written so far,
          // including the unsaved text.
          const usedBracketCodes = usedBracketCodesWithDraft;
          const hasEntityChips = !!(entityChips && entityChips.length > 0);
          // Continuity chips — same underlying "pending" data as the RS
          // Quick Entry map popup's continuity chips (see the queries
          // above), adapted for a surface with no single selected address:
          // "Vehicle departing" and "Walked in" both use a pending
          // arrival's own already-known address, so they need no
          // placeholder; "Vehicle arriving" has no way to know a
          // not-yet-observed destination, so it uses a literal
          // "[location]" placeholder to type over — the same pattern the
          // popup already uses for "[route]", which is equally unknowable
          // in advance.
          const vehicleArrivingChips = (pendingDepartures ?? []).map(d => ({
            key: `arr-${d.rego}`,
            rego: d.rego,
            text: `Vehicle ${d.rego}, ${shortenAlreadyMentionedNames(d.occupantDesc, usedBracketCodes)}, arrived at [location]`,
          }));
          const vehicleDepartingChips = (pendingArrivals ?? []).map(a => ({
            key: `dep-${a.rego}`,
            rego: a.rego,
            text: `Vehicle ${a.rego}, ${shortenAlreadyMentionedNames(a.occupantDesc, usedBracketCodes)}, departed ${a.address} and continued via:`,
          }));
          const walkedOutChips = (pendingWalkIns ?? []).flatMap(w => {
            const arrivalsHere = (pendingArrivals ?? []).filter(
              a =>
                a.address.trim().toLowerCase() ===
                w.location.trim().toLowerCase()
            );
            const names = shortenAlreadyMentionedNames(
              w.names,
              usedBracketCodes
            );
            // w.route is only ever genuine route/path text (e.g. "across
            // the road") — never the destination, which would duplicate
            // the address already stated via w.location. It's empty
            // whenever the walk-in had no separate route content at all.
            return arrivalsHere.map(a => ({
              key: `wo-${w.location}-${a.rego}`,
              rego: a.rego,
              // Who walked, for the button's label ("Tgt to …" or "Walked to …").
              who: w.names,
              text: w.route
                ? `${names} exited ${w.location} and walked ${w.route} towards Vehicle ${a.rego}.`
                : `${names} exited ${w.location} and walked towards Vehicle ${a.rego}.`,
            }));
          });
          // People on foot with no vehicle: someone who walked into a
          // location and hasn't left it can be logged leaving it for
          // another address ("[location]" and "[route]" are literal text
          // to type over, as with "Vehicle arriving"), and someone logged
          // as heading for an address can be logged entering it.
          const leftAddressChips = (pendingWalkIns ?? []).map(w => ({
            key: `la-${w.location}`,
            rego: "",
            label: w.location,
            // Stops after "walked " for the officer to type on (no
            // [route] / [location] placeholders to delete).
            text: leftAddressSentence(
              shortenAlreadyMentionedNames(w.names, usedBracketCodes),
              w.location
            ),
          }));
          const enteredChips = (pendingHeadingTo ?? []).map(h => ({
            key: `en-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
            rego: "",
            label: h.destination,
            text: `${shortenAlreadyMentionedNames(h.names, usedBracketCodes)} entered ${h.destination} and continued out of sight.`,
          }));
          // ── Continuity cards ────────────────────────────────────────
          // Same pending data and sentences as the chips above, grouped
          // per vehicle / group of people (see ContinuityCards).
          const rowTime = (id: number) =>
            rows?.find(r => r.id === id)?.time ?? null;
          const sinceText = (id: number) => {
            const t = rowTime(id);
            return t ? ` · since ${t}` : "";
          };
          const sameAddr = (a: string, b: string) =>
            a.trim().toLowerCase() === b.trim().toLowerCase();
          const cardAction = (
            chip: { key: string; text: string } | undefined,
            label: string
          ) => (chip ? [{ key: chip.key, label, text: chip.text }] : []);
          const continuityCards: ContinuityCardData[] = [];
          const walkInsAtVehicle = new Set<string>();
          // Everyone currently logged as inside an address or walking
          // somewhere is NOT in a vehicle, whatever the vehicle's arrival
          // row says.
          const onFootNames = [
            ...(pendingWalkIns ?? []).map(w => w.names),
            ...(pendingHeadingTo ?? []).map(h => h.names),
          ];
          // Who is in a vehicle: those its own row names, plus anyone
          // logged walking to / getting into it — and a person is only in
          // the vehicle the most recent row puts them in (see
          // vehicleOccupants).
          const allVehicleRows = [
            ...(pendingArrivals ?? []).map(a => ({
              rego: a.rego,
              rowId: a.rowId,
              names: extractOccupantNames(a.occupantDesc),
            })),
            ...(pendingDepartures ?? []).map(d => ({
              rego: d.rego,
              rowId: d.rowId,
              names: extractOccupantNames(d.occupantDesc),
            })),
          ];
          // Parked vehicles people on foot could walk to: only those at the
          // address their latest vehicle journey ended (see
          // vehiclesPeopleCanReach), not ones left behind earlier.
          const reachableVehicles = (people: string, fallbackPlace: string) =>
            vehiclesPeopleCanReach({
              people,
              arrivals: (pendingArrivals ?? []).map(a => ({
                ...a,
                names: extractOccupantNames(a.occupantDesc),
              })),
              placements: pendingPlacements ?? [],
              fallbackPlace,
            });
          const vehicleOccupants = (
            desc: string,
            rego: string,
            rowId: number
          ) =>
            sharedVehicleOccupants(
              { rego, rowId, names: extractOccupantNames(desc) },
              onFootNames,
              pendingPlacements ?? [],
              allVehicleRows
            );
          // Who is out of sight at an address after a vehicle arrived and
          // "continued out of sight" there (and has not since been placed
          // anywhere by a later row).
          const oosPeopleOf = (
            b: NonNullable<typeof pendingArrivals>[number]
          ) => {
            if (!b.outOfSight) return [];
            if (
              (pendingWalkIns ?? []).some(w => sameAddr(w.location, b.address))
            )
              return [];
            const people = occupantsStillInVehicle(
              extractOccupantNames(b.occupantDesc),
              []
            );
            return people.filter(
              n =>
                !(pendingPlacements ?? []).some(
                  pl =>
                    pl.rowId > b.rowId &&
                    surnameTokens(n).some(t =>
                      surnameTokens(pl.name).includes(t)
                    )
                )
            );
          };
          (pendingArrivals ?? []).forEach(a => {
            const insideHere = (pendingWalkIns ?? []).filter(w =>
              sameAddr(w.location, a.address)
            );
            const rego = a.rego;
            const occupants = vehicleOccupants(a.occupantDesc, a.rego, a.rowId);
            const inCar = occupants.length > 0;
            // Those a later row only had walking TOWARDS the vehicle — in it
            // or next to it, the row doesn't say.
            const toNames = occupantsToVehicle(
              { rego: a.rego, rowId: a.rowId },
              occupants,
              pendingPlacements ?? []
            );
            const inNames = occupants.filter(o => !toNames.includes(o));
            // A vehicle only written as "parked and unattended" gets a card
            // once someone is logged at that place (they can walk out to it)
            // or is already on the way to / in it.
            if (a.unattended && insideHere.length === 0 && !inCar) return;
            // Where each sits, when the rows say — "MENON (driver)".
            const seatMap = seatsOf({
              desc: a.occupantDesc,
              descRowId: a.rowId,
              rego,
              occupants,
              placements: pendingPlacements ?? [],
            });
            const withSeat = (n: string) =>
              seatMap.has(n) ? `${n} (${seatMap.get(n)})` : n;
            // People inside this address take over the card only when
            // nobody is left in the vehicle; when some got out and others
            // stayed, the vehicle keeps its own card for those still in it
            // and the people inside get a card of their own.
            const inside = insideHere.length > 0 && !inCar;
            if (inside)
              insideHere.forEach(w => walkInsAtVehicle.add(w.location));
            // "... arrived and continued out of sight": nobody can say
            // whether anyone is still in it until someone is seen again,
            // so no walked-away / walked-in options are offered.
            // The target is then placed at the address, out of sight: the
            // next steps are to walk out to the vehicle, walk somewhere
            // else, or leave in a vehicle. Not once a later row has put
            // those people anywhere.
            const arrivalPeople = occupantsStillInVehicle(
              extractOccupantNames(a.occupantDesc),
              []
            );
            const movedOn = (pendingPlacements ?? []).some(
              pl =>
                pl.rowId > a.rowId &&
                arrivalPeople.some(n =>
                  surnameTokens(n).some(t => surnameTokens(pl.name).includes(t))
                )
            );
            const outOfSight = a.outOfSight && !inside && !movedOn;
            const oosNames = shortenAlreadyMentionedNames(
              arrivalPeople.join(" and "),
              usedBracketCodes
            );
            const otherOosPeople = inside
              ? []
              : (pendingArrivals ?? [])
                  .filter(
                    o => o.rego !== a.rego && sameAddr(o.address, a.address)
                  )
                  .flatMap(oosPeopleOf);
            const carNames = shortenAlreadyMentionedNames(
              occupants.join(" and "),
              usedBracketCodes
            );
            // Everyone known to be in it, or "unseen occupant/s" when nobody
            // is — the usual wording for a departure whose occupants
            // weren't seen.
            const departingAction = {
              key: `dep-${rego}`,
              label: vehicleDepartLabel(rego),
              // Everyone known to be in it, or "unseen occupant/s" when
              // nobody is — the usual wording for a departure whose
              // occupants weren't seen.
              text: `Vehicle ${rego}, ${
                inCar && !outOfSight
                  ? shortenAlreadyMentionedNames(
                      occupantWording(a.occupantDesc, occupants) ??
                        // Someone joined after the arrival: say where each
                        // sits when the rows say (driver, front passenger,
                        // rear passenger), else just the names.
                        seatedOccupantWording({
                          desc: a.occupantDesc,
                          descRowId: a.rowId,
                          rego,
                          occupants,
                          placements: pendingPlacements ?? [],
                        }) ??
                        carNames,
                      usedBracketCodes
                    )
                  : // Nobody is logged in it (the driver went inside and
                    // "walked to vehicle" was not pressed): carry on from how
                    // it arrived, not "unseen occupant/s".
                    shortenAlreadyMentionedNames(
                      continuedOccupantWording({
                        rego,
                        arrivalDesc: a.occupantDesc,
                        arrivalRowId: a.rowId,
                        onFootElsewhere: [
                          ...(pendingWalkIns ?? [])
                            .filter(w => !sameAddr(w.location, a.address))
                            .map(w => w.names),
                          ...(pendingHeadingTo ?? []).map(h => h.names),
                        ],
                        insideThisAddress: insideHere.map(w => w.names),
                        placements: pendingPlacements ?? [],
                        allVehicleRows,
                      }),
                      usedBracketCodes
                    )
              }, departed ${a.address} and continued via:`,
            };
            // Most likely next step first: parked with someone in it, the
            // vehicle leaves or they walk in; with someone inside the
            // address, they walk back out to it or on elsewhere.
            const actions = inside
              ? [
                  ...walkedOutChips
                    .filter(c =>
                      insideHere.some(w => c.key === `wo-${w.location}-${rego}`)
                    )
                    .map(c => ({
                      key: c.key,
                      label: walkedToVehicleLabel(rego, c.who, trackedTarget),
                      text: c.text,
                    })),
                  ...insideHere.flatMap(w =>
                    cardAction(
                      leftAddressChips.find(c => c.key === `la-${w.location}`),
                      "Left address"
                    )
                  ),
                  departingAction,
                ]
              : outOfSight && arrivalPeople.length > 0
                ? [
                    {
                      key: `wov-oos-${rego}`,
                      label: walkedToVehicleLabel(
                        rego,
                        arrivalPeople.join(" and "),
                        trackedTarget
                      ),
                      text: `${oosNames} exited ${a.address} and walked towards Vehicle ${rego}.`,
                    },
                    {
                      key: `la-oos-${rego}`,
                      label: "Walked away",
                      text: `${oosNames} exited ${a.address} and walked [route] towards [location].`,
                    },
                    departingAction,
                  ]
                : otherOosPeople.length > 0
                  ? [
                      // Someone is out of sight at this address after
                      // arriving in another vehicle: he could just as well
                      // walk out to THIS one.
                      {
                        key: `wov-oos-${rego}`,
                        label: walkedToVehicleLabel(
                          rego,
                          otherOosPeople.join(" and "),
                          trackedTarget
                        ),
                        text: `${shortenAlreadyMentionedNames(otherOosPeople.join(" and "), usedBracketCodes)} exited ${a.address} and walked towards Vehicle ${rego}.`,
                      },
                      departingAction,
                    ]
                  : [
                      departingAction,
                      ...(inCar && !inside && !outOfSight
                        ? [
                            // Left the vehicle and walked off somewhere other
                            // than here (a car park or street space).
                            {
                              key: `wa-${rego}`,
                              label: "Walked away",
                              rego,
                              text: `${carNames} exited the vehicle and walked [route] towards [location].`,
                            },
                            {
                              key: `wi-${rego}`,
                              label: "Walked in",
                              rego,
                              text: `${carNames} exited the vehicle, walked [route], entered ${a.address} and continued out of sight.`,
                            },
                          ]
                        : []),
                    ];
            continuityCards.push({
              key: `veh-${rego}`,
              title: rego,
              pill: "Parked",
              who: inside
                ? `${insideHere.map(w => w.names).join("; ")} inside the address`
                : outOfSight
                  ? inCar
                    ? `${occupants.join(", ")} out of sight at the address`
                    : "Out of sight since arriving"
                  : inCar
                    ? [
                        inNames.length
                          ? `${inNames.map(withSeat).join(", ")} in the vehicle`
                          : "",
                        toNames.length
                          ? `${toNames.join(", ")} to vehicle`
                          : "",
                      ]
                        .filter(Boolean)
                        .join("; ")
                    : "Nobody in the vehicle",
              state: `${a.address}${sinceText(a.rowId)}`,
              actions,
              latestRowId: Math.max(a.rowId, ...insideHere.map(w => w.rowId)),
              holds: [...occupants, ...insideHere.map(w => w.names)].flatMap(
                n => surnameTokens(n)
              ),
              people: inside
                ? insideHere.flatMap(w => splitPeopleNames(w.names))
                : occupants,
              locus: inside
                ? {
                    headline: `Inside ${a.address}`,
                    sub: `On foot${sinceText(Math.max(...insideHere.map(w => w.rowId)))}`,
                  }
                : outOfSight
                  ? {
                      headline: `Out of sight at ${a.address}`,
                      sub: `Arrived in ${rego}${sinceText(a.rowId)}`,
                    }
                  : {
                      headline: inCar
                        ? inNames.length
                          ? `In ${rego}`
                          : `To vehicle ${rego}`
                        : `${rego} unattended`,
                      sub: `Parked at ${a.address}${sinceText(a.rowId)}`,
                    },
            });
          });
          // "From <place> · 09:16 PM" for a vehicle that has left and has no
          // arrival logged yet.
          const departedState = (d: {
            fromAddress?: string | null;
            rowId: number;
          }) =>
            [
              d.fromAddress ? `From ${d.fromAddress}` : "",
              rowTime(d.rowId) ?? "",
            ]
              .filter(Boolean)
              .join(" · ") || "No arrival logged yet";
          (pendingDepartures ?? []).forEach(d => {
            const chip = vehicleArrivingChips.find(c => c.rego === d.rego);
            if (!chip) return;
            // A later row saw it on the move ("... HOGAN driver and sole
            // occupant, travelled on Leach Highway ..."): where it is now,
            // on top of where it left from.
            const travelling = d.via
              ? `Travelling on ${d.via}${d.viaRowId ? ` · ${rowTime(d.viaRowId) ?? ""}` : ""}`.replace(
                  / · $/,
                  ""
                )
              : "";
            const leftFrom = departedState(d);
            const stateLine = travelling
              ? `${travelling} — ${leftFrom.charAt(0).toLowerCase()}${leftFrom.slice(1)}`
              : leftFrom;
            continuityCards.push({
              key: `dep-${d.rego}`,
              title: d.rego,
              pill: "Departed",
              attn: true,
              who: vehicleOccupants(d.occupantDesc, d.rego, d.rowId).length
                ? vehicleOccupants(d.occupantDesc, d.rego, d.rowId).join(", ")
                : extractOccupantNames(d.occupantDesc) || "Occupants not seen",
              state: stateLine,
              actions: cardAction(chip, "Vehicle arriving"),
              latestRowId: Math.max(d.rowId, d.viaRowId ?? 0),
              ...(() => {
                const inCar = vehicleOccupants(d.occupantDesc, d.rego, d.rowId);
                return {
                  holds: inCar.flatMap(n => surnameTokens(n)),
                  people: inCar,
                  locus: travelling
                    ? {
                        headline: inCar.length
                          ? `In ${d.rego}`
                          : `Departed in ${d.rego}`,
                        sub: `${travelling} — ${leftFrom.charAt(0).toLowerCase()}${leftFrom.slice(1)}`,
                      }
                    : {
                        headline: `Departed in ${d.rego}`,
                        sub: leftFrom,
                      },
                };
              })(),
            });
          });
          (pendingWalkIns ?? [])
            .filter(w => !walkInsAtVehicle.has(w.location))
            .forEach(w => {
              const chip = leftAddressChips.find(
                c => c.key === `la-${w.location}`
              );
              continuityCards.push({
                key: `foot-${w.location}`,
                title: w.names,
                pill: "Inside",
                who: `Inside ${w.location}`,
                state: `On foot${sinceText(w.rowId)}`,
                actions: [
                  ...cardAction(chip, "Left address"),
                  // Logged at a bus stop or train station: boarding.
                  ...transitBoardActions({
                    keyBase: w.location,
                    names: shortenAlreadyMentionedNames(
                      w.names,
                      usedBracketCodes
                    ),
                    place: w.location,
                  }),
                  // Back to a parked vehicle from here.
                  ...reachableVehicles(w.names, w.location).map(a => ({
                    key: `wov-${w.location}-${a.rego}`,
                    label: `Walked to ${a.rego}`,
                    text: `${shortenAlreadyMentionedNames(w.names, usedBracketCodes)} exited ${w.location} and walked towards Vehicle ${a.rego}.`,
                  })),
                ],
                latestRowId: w.rowId,
                holds: surnameTokens(w.names),
                people: splitPeopleNames(w.names),
                locus: {
                  headline: `Inside ${w.location}`,
                  sub: `On foot${sinceText(w.rowId)}`,
                },
              });
            });
          (pendingHeadingTo ?? []).forEach(h => {
            const chip = enteredChips.find(
              c =>
                c.key ===
                `en-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`
            );
            if (!chip) return;
            const walkers = shortenAlreadyMentionedNames(
              h.names,
              usedBracketCodes
            );
            const destKnown = !h.destination.includes("[");
            // Stepped out the front of a place and stayed there (phone call,
            // a smoke): at that place, outside it. The next step is back
            // inside, on elsewhere, or to a vehicle — not "Entered a
            // location" / "Inside" (shared/outFront.ts).
            const outFront = !!h.outFront && !h.fromTransit && !h.fromVessel;
            const outFrontState = `Out the front of ${h.from}${sinceText(h.rowId)}`;
            // On foot, the next step is one of: enter where they were
            // heading, walk on to somewhere else, or walk back towards a
            // vehicle that is parked.
            continuityCards.push({
              key: `head-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
              title: h.names,
              pill: outFront
                ? "Out the front"
                : h.fromTransit
                  ? "Alighted"
                  : h.fromVessel
                    ? "Disembarked"
                    : "Departed on foot",
              attn: true,
              who: destKnown ? `Walking to ${h.destination}` : "On foot",
              state: outFront
                ? outFrontState
                : `${alightedWording(h)?.left ?? `Left ${h.fromVessel ?? h.from}`}${sinceText(h.rowId)}`,
              actions: [
                ...(outFront
                  ? [
                      {
                        key: `ri-${h.from}-${h.names}`,
                        label: "Returned inside",
                        text: returnedInsideSentence(walkers, h.from),
                      },
                    ]
                  : [
                      ...cardAction(
                        chip,
                        destKnown ? "Entered" : "Entered a location"
                      ),
                      {
                        key: `in-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
                        label: "Inside",
                        text: `${walkers} inside ${destKnown ? h.destination : "[location]"} [observation].`,
                      },
                    ]),
                {
                  key: `wk-${h.destination}${h.destination.includes("[") ? `-${h.names}` : ""}`,
                  label: "Walked to another location",
                  text: `${walkers} walked [route] towards [location].`,
                },
                // Heading for, or just got off at, a bus stop or train
                // station: boarding.
                ...(outFront
                  ? []
                  : transitBoardActions({
                      keyBase: `h-${h.destination}-${h.names}`,
                      names: walkers,
                      place: destKnown ? h.destination : h.from,
                    })),
                ...reachableVehicles(h.names, h.from).map(a => ({
                  key: `wv-${a.rego}`,
                  label: `Walked to ${a.rego}`,
                  text: `${walkers} walked towards Vehicle ${a.rego}.`,
                })),
              ],
              latestRowId: h.rowId,
              holds: surnameTokens(h.names),
              people: splitPeopleNames(h.names),
              locus: {
                headline: outFront
                  ? `Out the front of ${h.from}`
                  : (() => {
                      const how = h.fromTransit
                        ? "Alighted, on foot"
                        : h.fromVessel
                          ? "Disembarked, on foot"
                          : "Departed on foot";
                      return destKnown ? `${how} to ${h.destination}` : how;
                    })(),
                sub: outFront
                  ? `On foot${sinceText(h.rowId)}`
                  : `${alightedWording(h)?.left ?? `Left ${h.fromVessel ?? h.from}`}${sinceText(h.rowId)}`,
              },
            });
          });
          // People who got into a vehicle that has no arrival or departure
          // row of its own ("entered a gold BMW ... (Vehicle 1FAB888)"):
          // their position is where they were last logged, until a row
          // says where the vehicle went.
          {
            const logged = new Set(
              [...(pendingArrivals ?? []), ...(pendingDepartures ?? [])].map(
                v => v.rego.toUpperCase()
              )
            );
            const byRego = new Map<
              string,
              NonNullable<typeof pendingPlacements>
            >();
            for (const p of pendingPlacements ?? []) {
              if (!p.rego || p.inside === false) continue;
              if (logged.has(p.rego.toUpperCase())) continue;
              byRego.set(p.rego, [...(byRego.get(p.rego) ?? []), p]);
            }
            byRego.forEach((ps, rego) => {
              const names = ps.map(p => p.name);
              // A vehicle with a marker on the map is at that marker; else
              // where they were last logged.
              const markerAddr = ps.find(p => p.vehicleMarker?.address)
                ?.vehicleMarker?.address;
              const at = markerAddr
                ? shortAddressLabel(markerAddr)
                : ps.find(p => p.at)?.at;
              const atMarker = !!ps.find(p => p.vehicleMarker);
              const rowId = Math.max(...ps.map(p => p.rowId));
              continuityCards.push({
                key: `vnl-${rego}`,
                title: rego,
                pill: "In vehicle",
                attn: true,
                who: `${(() => {
                  const seats = seatsOf({
                    desc: "",
                    descRowId: 0,
                    rego,
                    occupants: names,
                    placements: ps,
                  });
                  return names
                    .map(n => (seats.has(n) ? `${n} (${seats.get(n)})` : n))
                    .join(", ");
                })()} in the vehicle`,
                state: `${at ? `${atMarker ? "At" : "Last seen at"} ${at}` : "Position not logged"}${sinceText(rowId)}`,
                actions: [
                  {
                    key: `vnl-dep-${rego}`,
                    label: "Vehicle departing",
                    text: `Vehicle ${rego}, ${
                      seatedOccupantWording({
                        desc: "",
                        descRowId: 0,
                        rego,
                        occupants: names,
                        placements: ps,
                      }) ?? names.join(", ")
                    }, departed ${at ?? "[location]"} and continued via:`,
                  },
                ],
                latestRowId: rowId,
                holds: names.flatMap(n => surnameTokens(n)),
                people: names,
                locus: {
                  headline: `In ${rego}`,
                  sub: `${at ? `${atMarker ? "At" : "Last seen at"} ${at}` : "Position not logged"}${sinceText(rowId)}`,
                },
              });
            });
          }
          // People aboard a boat or vessel ("boarded a vessel at the end of
          // the jetty"): where it is can't be told from the row, so it is
          // where they were last logged, until a row says they got off.
          {
            const byVessel = new Map<
              string,
              NonNullable<typeof pendingPlacements>
            >();
            for (const p of pendingPlacements ?? []) {
              if (!p.vessel) continue;
              const k = p.vessel.toLowerCase();
              byVessel.set(k, [...(byVessel.get(k) ?? []), p]);
            }
            byVessel.forEach((ps, vk) => {
              const vessel = ps[0].vessel ?? vk;
              const names = ps.map(p => p.name);
              const at = ps.find(p => p.at)?.at;
              const rowId = Math.max(...ps.map(p => p.rowId));
              const where = at
                ? `Last seen at ${at}${sinceText(rowId)}`
                : `Position not logged${sinceText(rowId)}`;
              continuityCards.push({
                key: `vsl-${vk}`,
                title: names.join(" and "),
                pill: "On a vessel",
                attn: true,
                who: `${names.join(", ")} on ${vessel}`,
                state: where,
                actions: [
                  {
                    key: `vsl-off-${vk}`,
                    label: "Disembarked",
                    text: `${shortenAlreadyMentionedNames(names.join(" and "), usedBracketCodes)} disembarked from ${vessel} and walked [route] towards [location].`,
                  },
                ],
                latestRowId: rowId,
                holds: names.flatMap(n => surnameTokens(n)),
                people: names,
                locus: { headline: `On ${vessel}`, sub: where },
              });
            });
          }
          // People aboard a bus, train or tram ("boarded a bus at Bus Stop
          // …"): until a row says they got off.
          continuityCards.push(
            ...onTransitCards({
              placements: pendingPlacements ?? [],
              sinceText,
              shorten: n => shortenAlreadyMentionedNames(n, usedBracketCodes),
            })
          );
          // The card holding the TARGET leads the band as its tracker: a
          // person's by surname, a vehicle's by its plate (shared rule:
          // trackedTarget). A location target has nothing that moves.
          const targetCode = trackedTargetCode(trackedTarget);
          const targetWho = trackedTarget?.kind === "vehicle" ? "it" : "he";
          // Safety net for phrasing the position logic doesn't read: the
          // newest row that names the target alongside a movement word
          // but matched none of the known movement phrasings. If it is
          // newer than what the tracker is based on, the position shown
          // may be stale, so say so rather than state it plainly. A row the
          // logic DID read (even one that doesn't change the card, such as
          // walking back towards a vehicle) never triggers this.
          const targetRe = targetCode
            ? new RegExp(`\\b${targetCode}\\b`, "i")
            : null;
          const knownSurnames = knownSurnamesOf(
            (rows ?? []).map(r => r.observation)
          );
          const latestMove =
            targetRe && rows
              ? rows
                  .filter(
                    r =>
                      !!r.observation &&
                      targetRe.test(r.observation) &&
                      !isReadAsMovement(r.observation, knownSurnames) &&
                      /\b(entered|exited|walked|left|arrived|departed|drove|travelled|stopped|parked|inside|seated|sitting|standing|seen|sighted|remains|remained)\b/i.test(
                        r.observation
                      )
                  )
                  .reduce<
                    NonNullable<typeof rows>[number] | null
                  >((a, b) => (!a || b.id > a.id ? b : a), null)
              : null;
          const staleWarn = (basedOnRowId: number) =>
            latestMove && latestMove.id > basedOnRowId
              ? `The ${latestMove.time ?? "latest"} row names ${targetCode} after this, but wasn't read as a move — check where ${targetWho} is.`
              : undefined;
          if (targetCode && continuityCards.length > 0) {
            const targetKey = pickSubjectCardKey(
              continuityCards,
              trackedTarget
            );
            const held = continuityCards.find(c => c.key === targetKey);
            if (held) {
              held.isTarget = true;
              held.warn = staleWarn(held.latestRowId);
              held.companions = subjectCompanions(
                held.people ?? [],
                trackedTarget
              ).join(", ");
              // Took over from another sheet: say where the picture came from.
              if (surveillance?.handover && held.locus)
                held.locus = {
                  ...held.locus,
                  sub: `${held.locus.sub} · Handed over from ${surveillance.handover.title}`,
                };
            } else {
              // Cards exist but none names him: say so rather than leave
              // the band looking as if it were about someone else.
              continuityCards.push({
                key: "target-not-located",
                title: targetCode,
                pill: "Not located",
                attn: true,
                who: "Position not logged",
                state: `No logged movement names ${targetCode} yet`,
                actions: [],
                latestRowId: Number.MAX_SAFE_INTEGER,
                isTarget: true,
                warn: staleWarn(0),
                locus: {
                  headline: "Position not logged",
                  sub: `No logged movement names ${targetCode} yet`,
                },
              });
            }
          }
          // Every member of the team has ceased: the live cards give way to
          // one grey card saying so, with the last place he was seen.
          if (surveillance?.ended) {
            continuityCards.length = 0;
            continuityCards.push(
              endedContinuityCard({
                who: targetCode ?? "Team",
                time: surveillance.endedAtTime,
                position: targetPosition,
              })
            );
          }
          // Tapping a card action adds the sentence as its own row, stamped
          // with the current (Perth) time — so the time of the event is
          // captured the moment it happens — and it can be edited like any
          // other row afterwards. Falls back to inserting the text (the
          // old behaviour) when that would be wrong: offline (the offline
          // queue doesn't carry observation text) or on a sheet dated for
          // a different day than today.
          // Types text into a controlled textarea so React sees it (same
          // execCommand / native-setter approach insertAtFocused uses).
          const typeInto = (
            el: HTMLTextAreaElement | HTMLInputElement,
            insert: string
          ) => {
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            try {
              document.execCommand("insertText", false, insert);
            } catch {
              const setter =
                Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  "value"
                )?.set ||
                Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype,
                  "value"
                )?.set;
              if (setter) {
                setter.call(
                  el,
                  el.value.slice(0, start) + insert + el.value.slice(end)
                );
                el.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }
          };
          // The observation cell that is open for editing right now, if
          // any. focusedTextareaRef also remembers cells that have since
          // closed, so it must still be attached and the active element.
          const openObservationCell = (): HTMLTextAreaElement | null => {
            const el = focusedTextareaRef.current;
            return el &&
              el.tagName === "TEXTAREA" &&
              el.isConnected &&
              document.activeElement === el
              ? (el as HTMLTextAreaElement)
              : null;
          };
          const addContinuityEntry = (text: string) => {
            // Rule 1: a cell is open → the sentence goes into it as the
            // next paragraph, at the end of what's already written.
            const open = openObservationCell();
            if (open) {
              const v = open.value;
              const lead = !v
                ? ""
                : v.endsWith("\n\n")
                  ? ""
                  : v.endsWith("\n")
                    ? "\n"
                    : "\n\n";
              open.focus();
              open.setSelectionRange(v.length, v.length);
              typeInto(open, lead + text);
              return;
            }
            // Rule 2: no cell open → it becomes its own row. Vehicles stay
            // written as plain "Vehicle 1ORB419", exactly as the cards
            // phrase them.
            const perth = (opts: Intl.DateTimeFormatOptions) =>
              new Intl.DateTimeFormat("en-GB", {
                timeZone: "Australia/Perth",
                ...opts,
              }).formatToParts(new Date());
            const part = (
              parts: Intl.DateTimeFormatPart[],
              type: string
            ): string => parts.find(p => p.type === type)?.value ?? "";
            const d = perth({
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            });
            const todayYmd = `${part(d, "year")}-${part(d, "month")}-${part(d, "day")}`;
            const forToday = !sheet?.sheetDate || sheet.sheetDate === todayYmd;
            if (!isOnline || !forToday) {
              insertAtFocused(text);
              if (!forToday) {
                toast.info(
                  "This sheet is dated for another day, so the text was added to the row you're editing instead."
                );
              }
              return;
            }
            const t = perth({
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
            const h24 = parseInt(part(t, "hour"), 10) % 24;
            const min = parseInt(part(t, "minute"), 10);
            const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
            const timeStr = `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
            _addRowOnline
              .mutateAsync({
                sheetId,
                time: timeStr,
                timeMinutes: h24 * 60 + min,
                observation: text,
              })
              .then(created => {
                // Leave the new row open, so the next tap adds to it as the
                // next paragraph.
                setJustAddedRowId(created.id);
                // If the row never appears to open (e.g. it is locked), do
                // not leave the request lying in wait.
                setTimeout(() => setJustAddedRowId(null), 6000);
                toast.success(`Added ${timeStr}`, {
                  description: "Edit it any time from the row.",
                  duration: 9000,
                  action: {
                    label: "Undo",
                    onClick: () => _deleteRowOnline.mutate({ id: created.id }),
                  },
                });
              })
              .catch(() => {
                /* the mutation's own onError already showed the message */
              });
          };
          const hasContinuityChips = continuityCards.length > 0;
          const insertAtFocused = (text: string) => {
            const el = focusedTextareaRef.current;
            if (!el) return;
            el.focus();
            const start = el.selectionStart ?? el.value.length;
            const end = el.selectionEnd ?? el.value.length;
            const before = el.value.slice(0, start);
            const after = el.value.slice(end);
            const insert = before && !before.endsWith(" ") ? ` ${text}` : text;
            try {
              document.execCommand("insertText", false, insert);
            } catch {
              const nativeInputValueSetter =
                Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  "value"
                )?.set ||
                Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype,
                  "value"
                )?.set;
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(el, before + insert + after);
                el.dispatchEvent(new Event("input", { bubbles: true }));
              }
            }
          };
          const showTargetPanel = !!(
            (sheet?.targetId && assignedTarget) ||
            (entityChips && entityChips.length > 0)
          );
          return (
            <>
              {showTargetPanel && (
                <div className="mb-4 rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                  {/* Header — always visible. Tapping the main area toggles collapse; pencil navigates to edit */}
                  <div className="flex items-center">
                    <button
                      className="flex-1 flex items-center gap-2 px-4 py-3 bg-muted/60 hover:bg-muted active:bg-muted transition-colors select-none text-left min-w-0"
                      onClick={() =>
                        setTargetPanelExpanded(v => {
                          const next = !v;
                          try {
                            localStorage.setItem(
                              "runsheet_target_panel_expanded",
                              String(next)
                            );
                          } catch {}
                          return next;
                        })
                      }
                    >
                      {hasTarget ? (
                        <Target className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-[13px] font-bold uppercase tracking-wide text-foreground truncate flex-1">
                        {hasTarget ? `TARGET — ${t!.name}` : "SHORTCUTS"}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ${targetPanelExpanded ? "" : "-rotate-90"}`}
                      />
                    </button>
                    {/* Edit pencil — independent tap zone, doesn't trigger collapse */}
                    {hasTarget && (
                      <button
                        className="px-3 py-3 text-muted-foreground hover:text-foreground active:scale-95 transition-all shrink-0 border-l border-border bg-muted/60 hover:bg-muted rounded-tr-lg"
                        onClick={() =>
                          navigate(
                            `/operation/${sheet!.operationId}?tab=target&targetId=${t!.id}&fromSheet=${sheetId}`
                          )
                        }
                        title="Edit Target"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {/* Collapsible details */}
                  {targetPanelExpanded &&
                    (() => {
                      // Shortcut chips follow the Shortcuts page order; the
                      // target's own chips (HBF, vehicles, TGT, HB) are a
                      // fixed block straight after SC (shared/rsChips.ts).
                      const orderedFields = orderRsChips(
                        fields.filter(f => f.value),
                        (shortcutsData ?? []).map(s => s.trigger)
                      );
                      return (
                        <div className="px-4 pb-3 border-t border-border/40">
                          {hasAnyField &&
                            (() => {
                              const shortcutFolderLabels = new Set(
                                (shortcutsData ?? []).map(s =>
                                  s.trigger.toUpperCase()
                                )
                              );
                              const TRIGGER_ONLY_LABELS = new Set([
                                "TGT",
                                "HBF",
                                "HB",
                                "V1F",
                                "V2F",
                              ]);
                              return (
                                <>
                                  <div className="flex flex-wrap gap-1.5 pt-2">
                                    {orderedFields.map(f => {
                                      const insertIntoFocused = () => {
                                        const el = focusedTextareaRef.current;
                                        if (el) {
                                          el.focus();
                                          const start =
                                            el.selectionStart ??
                                            el.value.length;
                                          const end =
                                            el.selectionEnd ?? el.value.length;
                                          const before = el.value.slice(
                                            0,
                                            start
                                          );
                                          const after = el.value.slice(end);
                                          // An Own row chip (TP, TEXT …) pressed
                                          // with an observation open goes in here;
                                          // it starts with the target's name when
                                          // it begins a new sentence.
                                          const text = f.startsRow
                                            ? (shortcutInsertText(
                                                shortcutRowSubject(t),
                                                f.value,
                                                before
                                              ) ?? f.value!)
                                            : f.value!;
                                          const insert =
                                            before && !before.endsWith(" ")
                                              ? ` ${text}`
                                              : text;
                                          try {
                                            document.execCommand(
                                              "insertText",
                                              false,
                                              insert
                                            );
                                          } catch {
                                            const nativeInputValueSetter =
                                              Object.getOwnPropertyDescriptor(
                                                window.HTMLTextAreaElement
                                                  .prototype,
                                                "value"
                                              )?.set ||
                                              Object.getOwnPropertyDescriptor(
                                                window.HTMLInputElement
                                                  .prototype,
                                                "value"
                                              )?.set;
                                            if (nativeInputValueSetter) {
                                              nativeInputValueSetter.call(
                                                el,
                                                before + insert + after
                                              );
                                              el.dispatchEvent(
                                                new Event("input", {
                                                  bubbles: true,
                                                })
                                              );
                                            }
                                          }
                                        }
                                      };
                                      const isVnShort = /^V\d+$/.test(f.label);
                                      const isVnFull = /^V\d+F$/.test(f.label);
                                      const isStandard =
                                        !isVnShort &&
                                        (shortcutFolderLabels.has(f.label) ||
                                          TRIGGER_ONLY_LABELS.has(f.label) ||
                                          isVnFull);
                                      return (
                                        <ShortcutChip
                                          key={f.label}
                                          label={f.label}
                                          value={f.value}
                                          showValue={isVnShort || !isStandard}
                                          onInsert={() =>
                                            f.startsRow &&
                                            f.shortcutId !== undefined &&
                                            isOnline &&
                                            // No observation open: its own row,
                                            // as before. One open: it goes in
                                            // at the cursor (insertIntoFocused).
                                            !openObservationCell()?.dataset
                                              .obsCell
                                              ? ownRowShortcut.press(
                                                  {
                                                    sheetId,
                                                    shortcutId: f.shortcutId,
                                                    label: f.label,
                                                  },
                                                  insertIntoFocused
                                                )
                                              : insertIntoFocused()
                                          }
                                        />
                                      );
                                    })}
                                    {/* Cease — last of the chips, in the same
                                          look. Press it for the ceased row. */}
                                    {ceaseAvailable && (
                                      <CeaseRowButton
                                        sheetId={sheetId}
                                        getPlace={ceasePlace}
                                        onChanged={invalidateRows}
                                        onOpenForTyping={ceaseOpenForTyping}
                                      />
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                          {/* Entity chips — quick-insert shortcuts mined from this sheet's own
                        observations (surname / short address / vehicle rego), one line
                        under the fixed chips above, shared across every officer viewing
                        the sheet since they come from the server, not a per-device setting. */}
                          {hasEntityChips && (
                            <div className="flex flex-wrap gap-1.5 pt-2">
                              {entityChips!.map(chip => {
                                const insertIntoFocused = () => {
                                  const el = focusedTextareaRef.current;
                                  if (!el) return;
                                  el.focus();
                                  const start =
                                    el.selectionStart ?? el.value.length;
                                  const end =
                                    el.selectionEnd ?? el.value.length;
                                  const before = el.value.slice(0, start);
                                  const after = el.value.slice(end);
                                  const insert =
                                    before && !before.endsWith(" ")
                                      ? ` ${chip.insertValue}`
                                      : chip.insertValue;
                                  try {
                                    document.execCommand(
                                      "insertText",
                                      false,
                                      insert
                                    );
                                  } catch {
                                    const nativeInputValueSetter =
                                      Object.getOwnPropertyDescriptor(
                                        window.HTMLTextAreaElement.prototype,
                                        "value"
                                      )?.set ||
                                      Object.getOwnPropertyDescriptor(
                                        window.HTMLInputElement.prototype,
                                        "value"
                                      )?.set;
                                    if (nativeInputValueSetter) {
                                      nativeInputValueSetter.call(
                                        el,
                                        before + insert + after
                                      );
                                      el.dispatchEvent(
                                        new Event("input", { bubbles: true })
                                      );
                                    }
                                  }
                                };
                                return (
                                  <button
                                    key={chip.key}
                                    onMouseDown={e => e.preventDefault()}
                                    onClick={insertIntoFocused}
                                    title={`Insert: ${chip.insertValue}`}
                                    className="inline-flex items-center px-2 py-0.5 rounded border border-violet-500/30 bg-violet-500/5 text-violet-400 hover:bg-violet-500/15 active:scale-95 transition-all select-none cursor-pointer"
                                  >
                                    {targetPosition?.place &&
                                      samePlace(
                                        chip.insertValue,
                                        targetPosition.place
                                      ) && (
                                        <span
                                          className="mr-1 text-xs"
                                          title={`Target ${targetPosition.label}`}
                                        >
                                          {targetEmoji(
                                            targetPosition.state,
                                            targetPosition.transitMode
                                          )}
                                        </span>
                                      )}
                                    <span className="text-xs font-mono font-bold max-w-[140px] truncate">
                                      {chip.insertValue}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>
              )}
              {/* Continuity cards sit between the chip panel and the rows,
                    and show whether or not the panel above is expanded. */}
              {hasContinuityChips && trackingSettings.tracking && (
                <div className={showTargetPanel ? "mb-4 -mt-2" : "mb-4"}>
                  <ContinuityCards
                    busy={_addRowOnline.isPending}
                    cards={continuityCards}
                    dismissed={continuityDismissed}
                    onDismiss={(key, rowId) =>
                      setContinuityDismissal.mutate({ sheetId, key, rowId })
                    }
                    onRestore={key =>
                      setContinuityDismissal.mutate({
                        sheetId,
                        key,
                        rowId: null,
                      })
                    }
                    onAction={(text, _mode, rego) =>
                      addContinuityEntry(
                        fillRoute(text, rego, [
                          ...[...(rows ?? [])]
                            .sort(
                              (a, b) => (a.rowNumber ?? 0) - (b.rowNumber ?? 0)
                            )
                            .map(r => r.observation),
                          // What is typed in the open box right now.
                          openObservationCell()?.value,
                        ])
                      )
                    }
                  />
                </div>
              )}
            </>
          );
        })()}
    </>
  );
}
