// Part of the Map page (client/src/pages/IntelligenceMapping.tsx). The page's layout used to be one
// 6,500-line return; each section is now a component that takes the page's state as `s`
// (see useMapScreen.ts) and renders exactly what it rendered before. Same code; see
// docs/features/dev-and-ops.md (Big-file plan, phase 2).

import { fillRoute } from "@shared/parkingRoute";
import {
  matchVehicleArrival,
  extractArrivalAddress,
} from "@shared/vehicleEventPatterns";
import {
  alightedWording,
  onTransitCards,
  transitBoardActions,
} from "@/lib/transitCards";
import { transitKindOfPlace } from "@shared/transitPlace";
import { seatedOccupantWording, seatsOf } from "@shared/vehicleSeats";
import { enterNearbyOffers } from "@shared/enterNearby";
import { endedContinuityCard } from "@/lib/surveillanceCard";
import { popupShortAddress } from "@shared/markerLink";
import { vehiclesPeopleCanReach } from "@shared/targetPosition";
import {
  extractOccupantNames,
  shortenAlreadyMentionedNames,
} from "@/lib/mentionAutocomplete";
import {
  occupantsToVehicle,
  occupantWording,
  vehicleOccupants as sharedVehicleOccupants,
  occupantsStillInVehicle,
  splitPeopleNames,
  surnameTokens,
} from "@shared/walkEventPatterns";
import {
  pickSubjectCardKey,
  subjectCompanions,
  trackedTargetCode,
} from "@shared/trackedTarget";
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
import { cardAddressMatch } from "./addressMatch";
import type { MapScreen } from "./useMapScreen";

/** the address card inside the Quick Entry (known address, suburb, nearby and map options). */
export function QeAddressCard({ s }: { s: MapScreen }) {
  const {
    rsSelectedSheetId,
    trackingSettings,
    mapQeAddress,
    rsInlineInputRef,
    rsInlineText,
    pushInlineUndo,
    setRsInlineText,
    resetInlineTimer,
    assignedTarget,
    rsInlineRows,
    rsSurveillance,
    rsTrackedTarget,
    rsPendingArrivals,
    rsPendingDepartures,
    rsPendingWalkIns,
    rsPendingHeadingTo,
    rsPendingPlacements,
    rsAddressMentionedData,
    rsUsedBracketCodesWithDraft,
    mapQeLatLng,
    placePosition,
    rsTargetPosition,
    rsContinuityDismissed,
    setContinuityDismissal,
  } = s;
  return (
    <>
      {mapQeAddress &&
        (() => {
          const shortAddr = popupShortAddress(mapQeAddress);
          // First mention of an address on this sheet is
          // written in full (with its bracket short-form,
          // which Intelligence relies on to register the
          // location); later mentions use the short form.
          const arriveAddr = rsAddressMentionedData?.mentioned
            ? shortAddr
            : mapQeAddress;
          const names = (n: string) =>
            shortenAlreadyMentionedNames(n, rsUsedBracketCodesWithDraft);
          // The entry was opened from a bus stop or a
          // train station: people on foot board there
          // rather than "enter" it.
          const clickedTransit = transitKindOfPlace(shortAddr);
          const cards: ContinuityCardData[] = [];

          // Vehicles that left somewhere and have no
          // arrival logged — any of them could be
          // arriving here.
          // Anyone logged as inside an address or walking
          // somewhere is NOT in a vehicle, whatever the
          // vehicle's arrival row says.
          const onFootNames = [
            ...(rsPendingWalkIns ?? []).map(w => w.names),
            ...(rsPendingHeadingTo ?? []).map(h => h.names),
          ];
          // Who is in a vehicle: those its own row names,
          // plus anyone logged walking to / getting into
          // it — and a person is only in the vehicle the
          // most recent row puts them in.
          const allVehicleRows = [
            ...(rsPendingArrivals ?? []).map(a => ({
              rego: a.rego,
              rowId: a.rowId,
              names: extractOccupantNames(a.occupantDesc),
            })),
            ...(rsPendingDepartures ?? []).map(d => ({
              rego: d.rego,
              rowId: d.rowId,
              names: extractOccupantNames(d.occupantDesc),
            })),
          ];
          // Parked vehicles people on foot could walk to:
          // only those at the address their latest
          // vehicle journey ended, not ones left behind
          // earlier (see vehiclesPeopleCanReach).
          const reachableVehicles = (people: string, fallbackPlace: string) =>
            vehiclesPeopleCanReach({
              people,
              arrivals: (rsPendingArrivals ?? []).map(a => ({
                ...a,
                names: extractOccupantNames(a.occupantDesc),
              })),
              placements: rsPendingPlacements ?? [],
              fallbackPlace,
            });
          const vehicleOccupants = (
            desc: string,
            rego: string,
            rowId: number
          ) =>
            sharedVehicleOccupants(
              {
                rego,
                rowId,
                names: extractOccupantNames(desc),
              },
              onFootNames,
              rsPendingPlacements ?? [],
              allVehicleRows
            );
          (rsPendingDepartures ?? []).forEach(d => {
            const movingOcc = vehicleOccupants(d.occupantDesc, d.rego, d.rowId);
            cards.push({
              key: `dep-${d.rego}`,
              title: d.rego,
              pill: "Departed",
              attn: true,
              who: movingOcc.length
                ? movingOcc.join(", ")
                : extractOccupantNames(d.occupantDesc) || "Occupants not seen",
              state: d.via
                ? `Travelling on ${d.via}${
                    d.fromAddress ? ` — from ${d.fromAddress}` : ""
                  }`
                : d.fromAddress
                  ? `From ${d.fromAddress}`
                  : "No arrival logged yet",
              holds: movingOcc.length
                ? movingOcc.flatMap(n => surnameTokens(n))
                : surnameTokens(d.occupantDesc),
              people: movingOcc.length
                ? movingOcc
                : splitPeopleNames(extractOccupantNames(d.occupantDesc)),
              locus: {
                headline:
                  d.via && movingOcc.length
                    ? `In ${d.rego}`
                    : `Departed in ${d.rego}`,
                sub: d.via
                  ? `Travelling on ${d.via}${
                      d.fromAddress ? ` — from ${d.fromAddress}` : ""
                    }`
                  : d.fromAddress
                    ? `From ${d.fromAddress}`
                    : "No arrival logged yet",
              },
              actions: [
                {
                  key: `arr-${d.rego}`,
                  label: "Arrived here",
                  text: `Vehicle ${d.rego}, ${names(d.occupantDesc)}, arrived at ${arriveAddr}`,
                },
              ],
              latestRowId: d.rowId,
            });
          });

          // Vehicles here: saved arrivals at this
          // address, plus a vehicle-arrival sentence
          // already typed into THIS unsaved observation
          // (so the walk-in options appear in the same
          // row, as officers write it).
          const here = new Map<
            string,
            {
              rego: string;
              occupantDesc: string;
              rowId: number;
              saved: boolean;
              outOfSight: boolean;
            }
          >();
          (rsPendingArrivals ?? [])
            .filter(a => cardAddressMatch(a.address, shortAddr))
            .forEach(a =>
              here.set(a.rego, {
                rego: a.rego,
                occupantDesc: a.occupantDesc,
                rowId: a.rowId,
                saved: true,
                outOfSight: a.outOfSight,
              })
            );
          const draftArrive = matchVehicleArrival(rsInlineText);
          if (draftArrive) {
            const draftAddress = extractArrivalAddress(rsInlineText);
            if (draftAddress && cardAddressMatch(draftAddress, shortAddr)) {
              here.set(draftArrive.rego, {
                rego: draftArrive.rego,
                occupantDesc: draftArrive.occupantDesc,
                // A just-typed arrival is never hidden
                // by an older dismissal.
                rowId: Number.MAX_SAFE_INTEGER,
                saved: false,
                outOfSight: /\bout of sight\b/i.test(rsInlineText),
              });
            }
          }
          const insideHere = (rsPendingWalkIns ?? []).filter(w =>
            cardAddressMatch(w.location, shortAddr)
          );
          const leftAddressText = (w: { names: string; location: string }) =>
            leftAddressSentence(names(w.names), w.location);
          // Whether the people inside this address are
          // shown on a vehicle's card (nobody left in the
          // vehicle) or on a card of their own.
          let insideOnVehicleCard = false;
          Array.from(here.values()).forEach(v => {
            const occupants = vehicleOccupants(v.occupantDesc, v.rego, v.rowId);
            const inCar = occupants.length > 0;
            // Those a later row only had walking TOWARDS
            // the vehicle — in it or next to it.
            const toNames = occupantsToVehicle(
              { rego: v.rego, rowId: v.rowId },
              occupants,
              rsPendingPlacements ?? []
            );
            const inNames = occupants.filter(o => !toNames.includes(o));
            // Where each sits, when the rows say.
            const seatMap = seatsOf({
              desc: v.occupantDesc,
              descRowId: v.rowId,
              rego: v.rego,
              occupants,
              placements: rsPendingPlacements ?? [],
            });
            const withSeat = (n: string) =>
              seatMap.has(n) ? `${n} (${seatMap.get(n)})` : n;
            // People inside take over the card only when
            // nobody is left in the vehicle; when some got
            // out and others stayed, the vehicle keeps a
            // card for those still in it.
            const inside = insideHere.length > 0 && !inCar;
            if (inside) insideOnVehicleCard = true;
            // "... arrived and continued out of sight":
            // nobody can say whether anyone is still in
            // it until someone is seen again, so no
            // walked-away / walked-in options.
            // The target is then placed at the address, out of
            // sight: the next steps are to walk out to the
            // vehicle, walk somewhere else, or leave in a
            // vehicle. Not once a later row has put those
            // people anywhere.
            const arrivalPeople = occupantsStillInVehicle(
              extractOccupantNames(v.occupantDesc),
              []
            );
            const movedOn = (rsPendingPlacements ?? []).some(
              pl =>
                pl.rowId > v.rowId &&
                arrivalPeople.some(n =>
                  surnameTokens(n).some(t => surnameTokens(pl.name).includes(t))
                )
            );
            const outOfSight = v.outOfSight && !inside && !movedOn;
            const occNames = names(occupants.join(" and "));
            const actions: ContinuityCardData["actions"] = [];
            if (v.saved) {
              actions.push({
                key: `dep-${v.rego}`,
                label: vehicleDepartLabel(v.rego),
                // Everyone known to be in it, or
                // "unseen occupant/s" when nobody is.
                text: `Vehicle ${v.rego}, ${
                  inCar && !outOfSight
                    ? names(
                        occupantWording(v.occupantDesc, occupants) ??
                          seatedOccupantWording({
                            desc: v.occupantDesc,
                            descRowId: v.rowId,
                            rego: v.rego,
                            occupants,
                            placements: rsPendingPlacements ?? [],
                          }) ??
                          occNames
                      )
                    : // Nobody is logged in it (the driver went inside and
                      // "walked to vehicle" was not pressed): carry on from
                      // how it arrived, not "unseen occupant/s".
                      names(
                        continuedOccupantWording({
                          rego: v.rego,
                          arrivalDesc: v.occupantDesc,
                          arrivalRowId: v.rowId,
                          onFootElsewhere: [
                            ...(rsPendingWalkIns ?? [])
                              .filter(
                                w => !cardAddressMatch(w.location, shortAddr)
                              )
                              .map(w => w.names),
                            ...(rsPendingHeadingTo ?? []).map(h => h.names),
                          ],
                          insideThisAddress: insideHere.map(w => w.names),
                          placements: rsPendingPlacements ?? [],
                          allVehicleRows,
                        })
                      )
                }, departed ${shortAddr} and continued via:`,
              });
            }
            if (outOfSight && arrivalPeople.length > 0) {
              const oosNames = names(arrivalPeople.join(" and "));
              // Walk out to the vehicle or on elsewhere,
              // ahead of Vehicle departing.
              actions.unshift(
                {
                  key: `wov-oos-${v.rego}`,
                  label: walkedToVehicleLabel(
                    v.rego,
                    arrivalPeople.join(" and "),
                    rsTrackedTarget
                  ),
                  mode: "paragraph",
                  text: `${oosNames} exited ${shortAddr} and walked towards Vehicle ${v.rego}.`,
                },
                {
                  key: `la-oos-${v.rego}`,
                  label: "Walked away",
                  mode: "paragraph",
                  text: `${oosNames} exited ${shortAddr} and walked [route] towards [location].`,
                }
              );
            } else if (!inside) {
              // Someone is out of sight at this address
              // after arriving in another vehicle: he
              // could just as well walk out to THIS one.
              const otherOos = Array.from(here.values())
                .filter(o => o.rego !== v.rego)
                .flatMap(o => {
                  if (!o.outOfSight) return [];
                  return occupantsStillInVehicle(
                    extractOccupantNames(o.occupantDesc),
                    []
                  ).filter(
                    n =>
                      !(rsPendingPlacements ?? []).some(
                        pl =>
                          pl.rowId > o.rowId &&
                          surnameTokens(n).some(t =>
                            surnameTokens(pl.name).includes(t)
                          )
                      )
                  );
                });
              if (otherOos.length > 0) {
                actions.unshift({
                  key: `wov-oos-${v.rego}`,
                  label: walkedToVehicleLabel(
                    v.rego,
                    otherOos.join(" and "),
                    rsTrackedTarget
                  ),
                  mode: "paragraph",
                  text: `${names(otherOos.join(" and "))} exited ${shortAddr} and walked towards Vehicle ${v.rego}.`,
                });
              }
            }
            if (inCar && !inside && !outOfSight) {
              // Left the vehicle and walked off somewhere
              // other than here, or walked in here.
              actions.push(
                {
                  key: `wa-${v.rego}`,
                  label: "Walked away",
                  rego: v.rego,
                  mode: "paragraph",
                  text: `${occNames} exited the vehicle and walked [route] towards [location].`,
                },
                {
                  key: `wir-${v.rego}`,
                  label: "Walked in",
                  rego: v.rego,
                  mode: "paragraph",
                  text: `${occNames} exited the vehicle, walked [route], entered ${shortAddr} and continued out of sight.`,
                }
              );
            }
            if (inside) {
              const w = insideHere[0];
              const walkOutNames = names(w.names);
              actions.push({
                key: `wo-${v.rego}`,
                label: walkedToVehicleLabel(v.rego, w.names, rsTrackedTarget),
                // w.route is only ever genuine route text,
                // never the destination (that is shortAddr).
                text: w.route
                  ? `${walkOutNames} exited ${shortAddr} and walked ${w.route} towards Vehicle ${v.rego}.`
                  : `${walkOutNames} exited ${shortAddr} and walked towards Vehicle ${v.rego}.`,
              });
              actions.push({
                key: `la-${v.rego}`,
                label: "Left address",
                text: leftAddressText(w),
              });
            }
            cards.push({
              key: `veh-${v.rego}`,
              title: v.rego,
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
              state: shortAddr,
              actions,
              latestRowId: Math.max(v.rowId, ...insideHere.map(w => w.rowId)),
              holds: [...occupants, ...insideHere.map(w => w.names)].flatMap(
                n => surnameTokens(n)
              ),
              people: inside
                ? insideHere.flatMap(w => splitPeopleNames(w.names))
                : occupants,
              locus: inside
                ? {
                    headline: `Inside ${shortAddr}`,
                    sub: "On foot",
                  }
                : outOfSight
                  ? {
                      headline: `Out of sight at ${shortAddr}`,
                      sub: `Arrived in ${v.rego}`,
                    }
                  : {
                      headline: inCar
                        ? inNames.length
                          ? `In ${v.rego}`
                          : `To vehicle ${v.rego}`
                        : `${v.rego} unattended`,
                      sub: `Parked at ${shortAddr}`,
                    },
            });
          });

          // Someone logged inside a place close to the one
          // clicked (a shop in the centre they are in): this
          // pin is where they may have gone ("Entered here").
          // Only ever from a map click — nothing is added to
          // the cards otherwise (shared/enterNearby.ts).
          {
            const homes = [
              (assignedTarget as any)?.hbf,
              (assignedTarget as any)?.hb,
            ].filter(Boolean) as string[];
            enterNearbyOffers({
              walkIns: (rsPendingWalkIns ?? []).map(w => ({
                names: w.names,
                location: w.location,
                rowId: w.rowId,
              })),
              clicked: mapQeLatLng,
              clickedAddress: shortAddr,
              same: cardAddressMatch,
              positionOf: placePosition,
              exclude: place => homes.some(h => cardAddressMatch(h, place)),
            }).forEach(o =>
              cards.push({
                key: `enter-${o.names}-${o.inside}-${shortAddr}`,
                title: o.names,
                pill: "Inside",
                who: `Inside ${o.inside}`,
                state: "On foot",
                holds: surnameTokens(o.names),
                people: splitPeopleNames(o.names),
                locus: {
                  headline: `Inside ${o.inside}`,
                  sub: "On foot",
                },
                actions: [
                  {
                    key: `ent-${o.inside}-${shortAddr}`,
                    label: "Entered here",
                    text: `${names(o.names)} entered ${arriveAddr} and continued out of sight.`,
                  },
                ],
                latestRowId: o.rowId,
              })
            );
          }

          // People on foot inside this address with no
          // vehicle here.
          if (!insideOnVehicleCard) {
            insideHere.forEach(w =>
              cards.push({
                key: `foot-${w.location}`,
                title: w.names,
                pill: "Inside",
                who: `Inside ${w.location}`,
                state: "On foot",
                holds: surnameTokens(w.names),
                people: splitPeopleNames(w.names),
                locus: {
                  headline: `Inside ${w.location}`,
                  sub: "On foot",
                },
                actions: [
                  {
                    key: `la-${w.location}`,
                    label: "Left address",
                    text: leftAddressText(w),
                  },
                  // At a bus stop or train station.
                  ...transitBoardActions({
                    keyBase: w.location,
                    names: names(w.names),
                    place: w.location,
                  }),
                  // Back to a parked vehicle from here.
                  ...reachableVehicles(w.names, w.location).map(a => ({
                    key: `wov-${w.location}-${a.rego}`,
                    label: `Walked to ${a.rego}`,
                    text: `${names(w.names)} exited ${w.location} and walked towards Vehicle ${a.rego}.`,
                  })),
                ],
                latestRowId: w.rowId,
              })
            );
          }

          // People on foot: this pin is where they may
          // have got to, whatever they said they were
          // heading for — the same as a vehicle that left
          // somewhere, which can arrive at any pin. Their
          // own destination, when it is this place, keeps
          // its "Entered" / "Inside" wording.
          (rsPendingHeadingTo ?? []).forEach(h => {
            const unwritten = h.destination.includes("[");
            const isDest =
              !unwritten && cardAddressMatch(h.destination, shortAddr);
            // This pin, rather than where they said.
            const here = !isDest;
            const keyTail = unwritten ? `-${h.names}` : "";
            // Stepped out the front of a place and stayed there: out the front
            // of it, not "departed on foot" (shared/outFront.ts).
            const outFront = !!h.outFront && !h.fromTransit && !h.fromVessel;
            const how = h.fromTransit
              ? "Alighted, on foot"
              : h.fromVessel
                ? "Disembarked, on foot"
                : "Departed on foot";
            const left = outFront
              ? `Out the front of ${h.from}`
              : (alightedWording(h)?.left ?? `Left ${h.fromVessel ?? h.from}`);
            const nm = names(h.names);
            cards.push({
              key: `head-${h.destination}${keyTail}`,
              title: h.names,
              pill: outFront
                ? "Out the front"
                : h.fromTransit
                  ? "Alighted"
                  : h.fromVessel
                    ? "Disembarked"
                    : "Departed on foot",
              attn: true,
              who: unwritten ? "On foot" : `Walking to ${h.destination}`,
              state: left,
              holds: surnameTokens(h.names),
              people: splitPeopleNames(h.names),
              locus: {
                headline: outFront
                  ? left
                  : unwritten
                    ? how
                    : `${how} to ${h.destination}`,
                sub: outFront ? "On foot" : left,
              },
              actions: [
                // Back inside the place they stood out the front of.
                ...(outFront
                  ? [
                      {
                        key: `ri-${h.from}-${h.names}`,
                        label: "Returned inside",
                        text: returnedInsideSentence(nm, h.from),
                      },
                    ]
                  : []),
                // Got to this place on foot: any place —
                // a street corner, a bus stop, a station.
                ...(here
                  ? [
                      {
                        key: `arr-${h.names}-${shortAddr}`,
                        label: "Arrived here",
                        text: `${nm} arrived on foot at ${arriveAddr}.`,
                      },
                    ]
                  : []),
                // A bus stop or train station: boarding.
                ...(clickedTransit && here
                  ? transitBoardActions({
                      keyBase: `here-${h.names}-${shortAddr}`,
                      names: nm,
                      place: arriveAddr,
                    })
                  : []),
                // Going into it ("Entered"), or into a
                // place that is not a stop or station.
                ...((clickedTransit && here) || outFront
                  ? []
                  : [
                      {
                        key: `en-${h.destination}${keyTail}`,
                        label: here ? "Entered here" : "Entered",
                        text: `${nm} entered ${
                          here ? arriveAddr : h.destination
                        } and continued out of sight.`,
                      },
                      {
                        key: `in-${h.destination}${keyTail}`,
                        label: here ? "Inside here" : "Inside",
                        text: `${nm} inside ${
                          here ? arriveAddr : h.destination
                        } [observation].`,
                      },
                    ]),
                {
                  key: `wk-${h.destination}${keyTail}`,
                  label: "Walked to another location",
                  text: `${nm} walked [route] towards [location].`,
                },
                // Heading for a stop or station they said,
                // or just got off at one.
                ...((clickedTransit && here) || outFront
                  ? []
                  : transitBoardActions({
                      keyBase: `h-${h.destination}-${h.names}`,
                      names: nm,
                      place: unwritten ? h.from : h.destination,
                    })),
                ...reachableVehicles(h.names, h.from).map(a => ({
                  key: `wv-${a.rego}`,
                  label: `Walked to ${a.rego}`,
                  text: `${nm} walked towards Vehicle ${a.rego}.`,
                })),
              ],
              latestRowId: h.rowId,
            });
          });

          // People aboard a boat or vessel: shown
          // wherever the sheet is, until a row says they
          // got off.
          {
            const byVessel = new Map<
              string,
              NonNullable<typeof rsPendingPlacements>
            >();
            for (const p of rsPendingPlacements ?? []) {
              if (!p.vessel) continue;
              const k = p.vessel.toLowerCase();
              byVessel.set(k, [...(byVessel.get(k) ?? []), p]);
            }
            byVessel.forEach((ps, vk) => {
              const vessel = ps[0].vessel ?? vk;
              const crew = ps.map(p => p.name);
              const at = ps.find(p => p.at)?.at;
              const where = at ? `Last seen at ${at}` : "Position not logged";
              cards.push({
                key: `vsl-${vk}`,
                title: crew.join(" and "),
                pill: "On a vessel",
                attn: true,
                who: `${crew.join(", ")} on ${vessel}`,
                state: where,
                holds: crew.flatMap(n => surnameTokens(n)),
                people: crew,
                locus: {
                  headline: `On ${vessel}`,
                  sub: where,
                },
                actions: [
                  {
                    key: `vsl-off-${vk}`,
                    label: "Disembarked",
                    text: `${names(crew.join(" and "))} disembarked from ${vessel} and walked [route] towards [location].`,
                  },
                ],
                latestRowId: Math.max(...ps.map(p => p.rowId)),
              });
            });
          }

          // People aboard a bus, train or tram: shown
          // wherever the sheet is, until a row says they
          // got off.
          cards.push(
            ...onTransitCards({
              placements: rsPendingPlacements ?? [],
              shorten: names,
              hereAddress: clickedTransit ? arriveAddr : undefined,
            })
          );

          // The card holding the target leads, as its
          // tracker (person or vehicle; same rule as the
          // sheet and the flag).
          {
            const tKey = pickSubjectCardKey(cards, rsTrackedTarget);
            const held = cards.find(c => c.key === tKey);
            if (held) {
              held.isTarget = true;
              held.companions = subjectCompanions(
                held.people ?? [],
                rsTrackedTarget
              ).join(", ");
              // Took over from another sheet: say where
              // the picture came from.
              if (rsSurveillance?.handover && held.locus)
                held.locus = {
                  ...held.locus,
                  sub: `${held.locus.sub} · Handed over from ${rsSurveillance.handover.title}`,
                };
            }
          }

          // Every member of the team has ceased: one grey
          // card replaces the live ones.
          if (rsSurveillance?.ended) {
            cards.length = 0;
            cards.push(
              endedContinuityCard({
                who: trackedTargetCode(rsTrackedTarget) ?? "Team",
                time: rsSurveillance.endedAtTime,
                position: rsTargetPosition,
              })
            );
          }
          if (cards.length === 0 || !trackingSettings.tracking) return null;
          return (
            <ContinuityCards
              cards={cards}
              dismissed={rsContinuityDismissed}
              onDismiss={(key, rowId) =>
                rsSelectedSheetId &&
                setContinuityDismissal.mutate({
                  sheetId: rsSelectedSheetId,
                  key,
                  rowId,
                })
              }
              onRestore={key =>
                rsSelectedSheetId &&
                setContinuityDismissal.mutate({
                  sheetId: rsSelectedSheetId,
                  key,
                  rowId: null,
                })
              }
              // Puts the sentence into the observation box
              // for the officer to review and edit; nothing
              // is saved until Submit. With text already
              // there it goes in as the next paragraph.
              onAction={(rawText, _mode, rego) => {
                const text = fillRoute(rawText, rego, [
                  ...[...(rsInlineRows ?? [])]
                    .sort((a, b) => (a.rowNumber ?? 0) - (b.rowNumber ?? 0))
                    .map(r => r.observation),
                  // What is typed in the box right now.
                  rsInlineText,
                ]);
                pushInlineUndo(rsInlineText);
                setRsInlineText(prev => {
                  if (!prev.trim()) return text;
                  const lead = prev.endsWith("\n\n")
                    ? ""
                    : prev.endsWith("\n")
                      ? "\n"
                      : "\n\n";
                  return `${prev}${lead}${text}`;
                });
                resetInlineTimer();
                rsInlineInputRef.current?.focus();
              }}
            />
          );
        })()}
    </>
  );
}
