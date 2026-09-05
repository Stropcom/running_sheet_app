import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Car,
  Siren,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Clock,
  Phone,
  Briefcase,
  ListChecks,
  AlertTriangle,
  Target,
  Sparkles,
  MapPin,
  Camera,
  ShieldOff,
} from "lucide-react";

// ─── Reference data — from the AFP Western Command Surveillance Unit's
// Vehicle Crash SOP. Deterministic reference content + a rule-based decision
// wizard built directly from the SOP's own 5-stage structure — no runtime
// AI/LLM involved (see CLAUDE.md's Golden Rule).
const REPAIRER_NAME = "BRB Smash Repair";
const REPAIRER_ADDRESS = "5/7 Pitt Way, Booragoon";
const REPAIRER_CONTACT = "Bill — do not speak to any other staff";
const REPAIRER_AFTERHOURS = "0419 908 520";

type Screen = "menu" | "sop" | "wizard";
type ScenarioKey = "A1" | "A2" | "B1" | "B2" | "C1";
type DrivabilityKey = "secure" | "notsecure" | "notdrivable";

interface Answers {
  scenario: ScenarioKey | null;
  drivability: DrivabilityKey | null;
  damageClean: "yes" | "no" | null;
  exception: "yes" | "no" | null;
}

const EMPTY_ANSWERS: Answers = {
  scenario: null,
  drivability: null,
  damageClean: null,
  exception: null,
};

const SCENARIOS: { key: ScenarioKey; title: string; sub: string }[] = [
  {
    key: "A1",
    title: "A1 — Single-vehicle, damage only",
    sub: "No injuries. Only one vehicle involved in the collision (other property may still be damaged).",
  },
  {
    key: "A2",
    title: "A2 — Multiple-vehicle, damage only",
    sub: "No injuries. More than one vehicle involved, damage only.",
  },
  {
    key: "B1",
    title: "B1 — Single-vehicle damage + SU occupant injury",
    sub: "Bodily injury to someone in the SU vehicle.",
  },
  {
    key: "B2",
    title: "B2 — Multiple-vehicle damage + injury to anyone",
    sub: "Bodily injury to any person, multiple vehicles involved.",
  },
  {
    key: "C1",
    title: "C1 — Pedestrian injury",
    sub: "A pedestrian, cyclist, e-scooter rider, or other non-occupant is injured.",
  },
];

const DRIVABILITY: { key: DrivabilityKey; title: string; sub: string }[] = [
  {
    key: "secure",
    title: "Drivable and secure",
    sub: "May return to operational use, subject to TL + operative assessment.",
  },
  {
    key: "notsecure",
    title: "Drivable, but NOT secure",
    sub: "e.g. smashed/missing windows, doors won't lock, structural damage.",
  },
  {
    key: "notdrivable",
    title: "Not drivable",
    sub: "Vehicle cannot be safely driven at all.",
  },
];

// Damage-only crashes (A1 or A2) both turn on the same $3,000 / details-
// exchanged test — "single-vehicle" only describes the collision, not what
// got damaged. The SU vehicle can be the only vehicle involved and still
// take out a fence, a parked car, or a shopfront, which is exactly the
// property-damage scenario s.56 is testing for. Injury scenarios (B1/B2/C1)
// are always reportable regardless of value, per s.54's "bodily harm must
// be reported forthwith".
function needsPoliceReport(answers: Answers): boolean {
  if (
    answers.scenario === "B1" ||
    answers.scenario === "B2" ||
    answers.scenario === "C1"
  )
    return true;
  if (answers.scenario === "A1" || answers.scenario === "A2")
    return answers.damageClean === "no";
  return false;
}

// ─── Small building blocks for the SOP reference viewer ────────────────────
function SopP({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[13px] leading-relaxed text-muted-foreground mb-2 last:mb-0">
      {children}
    </p>
  );
}
function SopSub({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground/70 mt-3 mb-1 first:mt-0">
      {children}
    </p>
  );
}
function SopTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden my-2">
      <div className="grid grid-cols-[70px_1fr] bg-blue-500/10 text-[10px] font-bold uppercase tracking-wide text-blue-400 px-3 py-1.5">
        <span>Scenario</span>
        <span>Description</span>
      </div>
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[70px_1fr] px-3 py-2 text-[12.5px] border-t border-border"
        >
          <span className="font-semibold text-foreground">{k}</span>
          <span className="text-muted-foreground">{v}</span>
        </div>
      ))}
    </div>
  );
}

interface SopSection {
  num: string;
  label: string;
  body: React.ReactNode;
}

const SOP_SECTIONS: SopSection[] = [
  {
    num: "1",
    label: "SOP Status",
    body: (
      <SopP>
        This document is the SOP for AFP Western Command Surveillance Unit (WC
        SU). Compliance is required for all members operating, supervising, or
        in charge of a WC SU vehicle.
      </SopP>
    ),
  },
  {
    num: "2",
    label: "Relationship to Other Policies and Law",
    body: (
      <>
        <SopP>
          This SOP operates{" "}
          <b className="text-foreground">
            in addition to, and not in replacement of
          </b>
          :
        </SopP>
        <ul className="list-disc list-inside text-[13px] text-muted-foreground mb-2 space-y-0.5">
          <li>Applicable state and territory legislation</li>
          <li>AFP professional standards obligations</li>
          <li>AFP capability protection requirements</li>
        </ul>
        <SopP>
          Where a conflict arises,{" "}
          <b className="text-foreground">
            statutory obligations take precedence
          </b>
          .
        </SopP>
      </>
    ),
  },
  {
    num: "3",
    label: "Purpose",
    body: (
      <SopP>
        Establishes a guide for managing vehicle crashes involving a WC SU
        vehicle: crash classification, statutory obligations, decision pathways
        based on vehicle drivability, operational actions at the scene,
        reporting, and repairs.
      </SopP>
    ),
  },
  {
    num: "4",
    label: "Scope",
    body: (
      <SopP>
        Applies to all traffic accidents involving a WC SU vehicle, including
        vehicle damage, property damage, or injury to any person.
      </SopP>
    ),
  },
  {
    num: "5",
    label: "Current AFP Vehicle Accident Policy",
    body: (
      <SopP>
        No AFP police vehicle accident/collision policy currently applies to AFP
        Regions (the only such policy, BPG — Police Vehicle Collisions and
        Investigations, applies only within the ACT). Crashes involving WC SU
        vehicles are managed per applicable state/territory road traffic
        legislation and this procedure.
      </SopP>
    ),
  },
  {
    num: "6",
    label: "Legislative Obligations — Road Traffic Act 1974 (WA), ss.54–56",
    body: (
      <>
        <SopSub>Duties at the scene — bodily harm (s.54)</SopSub>
        <SopP>
          Where bodily harm occurs to another person, the driver must stop
          immediately, remain at the scene as long as necessary, render
          reasonable assistance, and provide name/address (and
          vehicle-responsible-person details if known) if required by a victim,
          their representative, or police.
        </SopP>
        <SopSub>Duties at the scene — property damage (s.55)</SopSub>
        <SopP>
          Where any property is damaged, the driver must stop, remain at the
          scene, and provide the same details if required by the property owner,
          their representative, or a police officer.
        </SopP>
        <SopSub>Reporting traffic accidents to police (s.56)</SopSub>
        <SopP>
          <b className="text-foreground">Bodily harm</b> — must be reported to
          police forthwith.
        </SopP>
        <SopP>
          <b className="text-foreground">Property damage</b> — must be reported,{" "}
          <i>unless</i> the total value of damage does not exceed $3,000{" "}
          <b className="text-foreground">and</b> all required details were
          exchanged with the property owner — in that case, police reporting is
          not required.
        </SopP>
        <SopP>
          These statutory obligations are mandatory and apply{" "}
          <b className="text-foreground">
            regardless of crash scenario classification
          </b>
          , in addition to AFP procedures and requirements set out in this
          document.
        </SopP>
      </>
    ),
  },
  {
    num: "7",
    label: "Five Stages",
    body: (
      <ol className="list-decimal list-inside text-[13px] text-muted-foreground space-y-1">
        <li>
          <b className="text-foreground">Scenario Identification</b> — what type
          of crash
        </li>
        <li>
          <b className="text-foreground">SU Vehicle Assessment</b> — how to
          manage the vehicle
        </li>
        <li>
          <b className="text-foreground">Assumed Identities</b> — use of AIs
        </li>
        <li>
          <b className="text-foreground">Police Declaration</b> — when a
          declaration can be considered
        </li>
        <li>
          <b className="text-foreground">Reporting</b> — WAPOL, Comcover &amp;
          CPT — what's required, to whom
        </li>
      </ol>
    ),
  },
  {
    num: "7.1",
    label: "Stage 1 — Crash Scenario Identification",
    body: (
      <>
        <SopSub>A. Vehicle and/or Property Damage (No Injuries)</SopSub>
        <SopTable
          rows={[
            ["A1", "Single-vehicle — damage only"],
            ["A2", "Multiple-vehicle — damage only"],
          ]}
        />
        <SopSub>B. Vehicle Damage + Injury to Any Person</SopSub>
        <SopTable
          rows={[
            ["B1", "Single-vehicle damage with bodily injury to SU occupant"],
            ["B2", "Multiple-vehicle damage with bodily injury to any person"],
          ]}
        />
        <SopSub>C. Pedestrian Injury (No Damage)</SopSub>
        <SopTable rows={[["C1", "Pedestrian bodily injury"]]} />
        <SopP>
          Police reporting is required for B1, B2, C1 always (bodily harm must
          be reported forthwith, regardless of value). For damage-only crashes —{" "}
          <b className="text-foreground">A1 or A2 alike</b> — reporting is
          required unless the total value of{" "}
          <b className="text-foreground">all</b> property damaged is $3,000 or
          under <b className="text-foreground">and</b> the required details were
          fully exchanged with the property owner(s), who were present.
          "Property" here isn't limited to the vehicle(s) involved — a
          single-vehicle crash that takes out a fence, a parked car, or a
          shopfront is still property damage and is tested the same way.
        </SopP>
      </>
    ),
  },
  {
    num: "7.2",
    label: "Stage 2 — SU Vehicle Drivability Assessment",
    body: (
      <>
        <SopSub>Drivable and Secure</SopSub>
        <SopP>
          May be returned to operational use, subject to Team Leader + operative
          assessment (safety, security, suitability).
        </SopP>
        <SopSub>Drivable Not Secure</SopSub>
        <SopP>
          Must <b className="text-foreground">not</b> be returned to duty or
          left unattended. No temporary fixes (tape, coverings). Take{" "}
          <b className="text-foreground">directly to Darwinia</b> for securing.
          Applies regardless of scenario classification, even if mechanically
          drivable.
        </SopP>
        <SopSub>Not Drivable</SopSub>
        <SopP>
          Recovery and repair only through the approved repairer (see Section 8)
          — this is the <b className="text-foreground">only</b> approved
          repairer and towing contractor; do not use any other.
        </SopP>
      </>
    ),
  },
  {
    num: "7.3",
    label: "Stage 3 — Assumed Identities (applies to all scenarios)",
    body: (
      <>
        <SopP>
          Members will use an Assumed Identity (AI) in all crash-related
          interactions, unless an exception under Stage 4 applies.
        </SopP>
        <ul className="list-disc list-inside text-[13px] text-muted-foreground mb-2 space-y-1">
          <li>
            <b className="text-foreground">Personal and vehicle details</b> —
            where required to give a name/address, produce a licence, or provide
            vehicle registration details, provide the AI's details.
          </li>
          <li>
            <b className="text-foreground">Registration plates</b> — separately,
            and unconditionally: AI plates remain fitted to the vehicle at all
            times at the scene, regardless of what's disclosed to whom.
          </li>
        </ul>
        <SopP>
          Applies regardless of crash scenario classification, and to both
          statutory exchanges and informal requests at the scene.
        </SopP>
      </>
    ),
  },
  {
    num: "7.4",
    label: "Stage 4 — Police Declarations (Controlled Exceptions)",
    body: (
      <>
        <SopSub>General principle</SopSub>
        <SopP>
          A declaration that the operative and/or vehicle is associated with the
          AFP, or of the operative's true identity, is to be{" "}
          <b className="text-foreground">always avoided</b>.
        </SopP>
        <SopSub>When a declaration may happen</SopSub>
        <SopP>
          Disclosure may only occur where clearly justifiable — specifically:
          serious injury requiring medical treatment to the operative; a
          fatality to any person involved; or circumstances requiring urgent
          emergency/medical/law-enforcement coordination where non-disclosure
          would impede response. Approval is by the Team Leader and/or Inspector
          CTO WC, sought before disclosure wherever practicable.
        </SopP>
        <SopSub>How briefly</SopSub>
        <SopP>
          Disclosure is made{" "}
          <b className="text-foreground">only to emergency services</b> (Police,
          St John Ambulance, FESA) — never to other parties involved, media, or
          the public. It is given on a{" "}
          <b className="text-foreground">strict need-to-know basis</b>: state
          only what's necessary to the immediate purpose, once, with{" "}
          <b className="text-foreground">
            no further declaration or onward disclosure authorised
          </b>{" "}
          afterward.
        </SopP>
        <SopSub>
          Option 2 — true vehicle identity (limited, controlled exception)
        </SopSub>
        <SopP>
          The <i>only</i> scenario where reporting/repair coordination may use
          the vehicle's true identity — and only where{" "}
          <b className="text-foreground">all</b> of: no identified risk of
          exposure/compromise (witnesses, CCTV/dash-cam/phone footage, or any
          other link), <b className="text-foreground">and</b> explicitly agreed
          with Inspector CTO WC and CPT. Otherwise, default to Option 1 —
          Assumed Identity.
        </SopP>
      </>
    ),
  },
  {
    num: "7.5",
    label: "Stage 5 — Post-Incident Reporting",
    body: (
      <>
        <SopP>
          <i>
            All documentation must be reviewed and approved by the Team Leader
            or Inspector before submission to CPT, HUMINT Finance, SSU, or
            WAPOL.
          </i>
        </SopP>
        <SopSub>Initial contact — SSU, CPT, and HUMINT Finance</SopSub>
        <SopP>
          All three must be notified of every SU vehicle crash, as soon as
          practicable — with the{" "}
          <b className="text-foreground">same information</b> in every case:
          nature of the crash, circumstances of the crash, police attendance or
          response (if any), and whether AI details were exchanged. "Reporting
          to police," where required, is satisfied by SSU notification + MR72
          completion.
        </SopP>
        <SopP>
          <b className="text-foreground">MR72</b> — where reporting to police is
          required: request a hard-copy MR72 from SSU, complete it using the AI
          details given at the scene, and return it.
        </SopP>
        <SopSub>Roles — why all three are notified</SopSub>
        <SopP>
          CPT has primary responsibility for managing/protecting Assumed
          Identities and assessing compromise risk. HUMINT Finance has primary
          responsibility for AFP–Comcover interactions (insurance
          reporting/coordination). SSU is the police-reporting point of contact.
        </SopP>
        <SopP>
          Subsequent contact — provide to CPT and HUMINT Finance: a copy of the
          MR72 (where required); a completed Comcover claim form (leave Sections
          A &amp; B blank — completed by CPT); images (damage to the SU vehicle,
          the scene/area, wide-angle of all four sides, and the instrument
          cluster/speedo — the last two required by Comcover); and a Security
          Incident Report (SIR) where a police declaration occurred, an
          actual/suspected AI compromise occurred, or as otherwise required by
          CPT.
        </SopP>
      </>
    ),
  },
  {
    num: "8",
    label: "Repairs and Costs",
    body: (
      <>
        <SopP>
          As a default, repair costs are arranged/managed by CPT with HUMINT
          Finance and Comcover.{" "}
          <b className="text-foreground">
            Members do not make payment arrangements or engage directly with any
            insurer.
          </b>
        </SopP>
        <SopSub>Low-value repairs</SopSub>
        <SopP>
          Repairs estimated under <b className="text-foreground">$5,000</b> are
          handled directly by SU Command rather than a full Comcover claim, for
          administrative efficiency — this does{" "}
          <b className="text-foreground">not</b> remove any reporting obligation
          in this document.
        </SopP>
        <SopSub>Comcover reporting</SopSub>
        <SopP>
          All communication with Comcover is by CPT and/or HUMINT Finance only —
          members must never contact Comcover directly. Claims use the same AI
          details provided at the scene.
        </SopP>
        <SopSub>Approved repairer — the only one to use</SopSub>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 mb-2">
          <p className="text-[13px] font-bold text-foreground">
            {REPAIRER_NAME}
          </p>
          <p className="text-[12.5px] text-muted-foreground mt-1">
            Address: {REPAIRER_ADDRESS}
            <br />
            Contact: {REPAIRER_CONTACT}
            <br />
            After-hours: {REPAIRER_AFTERHOURS}
          </p>
          <p className="text-[12.5px] text-muted-foreground mt-1.5">
            <b className="text-foreground">Approved Tow / Tilt-Tray Provider</b>{" "}
            — linked to {REPAIRER_NAME}, same contact (Bill).
          </p>
        </div>
        <SopP>
          Multiple quotes are not required. This is the{" "}
          <b className="text-foreground">only</b> approved repairer and towing
          contractor for SU vehicles — members must not independently arrange
          repairs, recovery, or engage any other repairer or tow provider unless
          expressly directed by the Team Leader or Inspector CTO WC.
        </SopP>
        <SopSub>Equipment removal</SopSub>
        <SopP>
          Only in consultation with CPT and Inspector CTO WC. Non-write-off
          vehicles: AI plates may be removed at the repairer. Write-off
          vehicles: AI plates (vehicle may be left with none), radio base
          set/handset, emergency lights/siren, vehicle log book, and fuel cards
          are removed — or, where the vehicle instead goes elsewhere for
          wiring/hardwired-equipment removal, the{" "}
          <b className="text-foreground">original</b> registration plates travel
          with the vehicle (not necessarily fitted).
        </SopP>
      </>
    ),
  },
  {
    num: "9",
    label: "Immediate Post-Crash Checklist",
    body: (
      <ol className="list-decimal list-inside text-[13px] text-muted-foreground space-y-1.5">
        <li>
          <b className="text-foreground">Stop immediately</b>
        </li>
        <li>
          <b className="text-foreground">Preserve safety</b> — render assistance
          as required, call emergency services if there are injuries
        </li>
        <li>
          <b className="text-foreground">Identify scenario</b> — A: damage only
          / B: damage + injury / C: pedestrian injury
        </li>
        <li>
          <b className="text-foreground">Assess the SU vehicle</b> — drivable
          &amp; secure / drivable not secure / not drivable (approved recovery
          only)
        </li>
        <li>
          <b className="text-foreground">Use Assumed Identity</b> —
          registration, name, address, licence, phone; plates remain on the
          vehicle
        </li>
        <li>
          <b className="text-foreground">Avoid declaration</b> — don't disclose
          AFP affiliation unless a permitted exception applies; don't declare
          the insurer's name
        </li>
        <li>
          <b className="text-foreground">Approved repairer and towing</b> only
        </li>
        <li>
          <b className="text-foreground">Notify</b> — SSU and CPT
        </li>
        <li>
          <b className="text-foreground">Report</b> — MR72 (if required);
          Comcover documentation via CPT and HUMINT only
        </li>
      </ol>
    ),
  },
  {
    num: "10–13",
    label: "Ownership, Approval, Review, Amendments",
    body: (
      <SopP>
        <b className="text-foreground">Document owner:</b> Western Command —
        Surveillance Unit.{" "}
        <b className="text-foreground">Approval authority:</b> Inspector CTO
        Western Command. <b className="text-foreground">Review cycle:</b>{" "}
        annually, or earlier where operational, legislative, or capability
        changes occur. <b className="text-foreground">Amendments</b> must be
        approved by Inspector CTO WC.
      </SopP>
    ),
  },
];

// ─── Menu ───────────────────────────────────────────────────────────────
function CrashMenu({ onSelect }: { onSelect: (s: Screen) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => onSelect("sop")}
        className="flex items-center gap-3.5 p-4 rounded-xl border border-border/60 bg-card/60 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
          <BookOpen className="h-5 w-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Full SOP</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            The complete Vehicle Crash Standard Operating Procedure, as a
            collapsible reference.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
      <button
        onClick={() => onSelect("wizard")}
        className="flex items-center gap-3.5 p-4 rounded-xl border border-border/60 bg-card/60 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="w-11 h-11 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
          <Siren className="h-5 w-5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Crash Helper</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
            Answer a few quick questions at the scene — get exactly what to do
            now, and what to report afterwards.
          </p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
    </div>
  );
}

// ─── Full SOP viewer ────────────────────────────────────────────────────
function CrashSopViewer() {
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const toggle = (num: string) =>
    setOpenSet(prev => {
      const next = new Set(prev);
      next.has(num) ? next.delete(num) : next.add(num);
      return next;
    });
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
      {SOP_SECTIONS.map((s, i) => (
        <Collapsible
          key={s.num}
          open={openSet.has(s.num)}
          onOpenChange={() => toggle(s.num)}
        >
          <CollapsibleTrigger asChild>
            <button
              className={`w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-muted/40 transition-colors ${i > 0 ? "border-t border-border/60" : ""}`}
            >
              <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 rounded px-1.5 py-0.5 shrink-0">
                {s.num}
              </span>
              <span className="text-sm font-semibold text-foreground flex-1">
                {s.label}
              </span>
              <ChevronRight
                className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${openSet.has(s.num) ? "rotate-90" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="px-4 pb-4 pl-11">
            {s.body}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}

// ─── Crash Helper wizard ────────────────────────────────────────────────
function OptionButton({
  title,
  sub,
  onClick,
}: {
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3.5 rounded-xl border border-border/60 bg-card/60 hover:border-indigo-400/60 hover:bg-indigo-500/5 transition-colors"
    >
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{sub}</p>
    </button>
  );
}

function ProgressRow({ step }: { step: number }) {
  return (
    <div className="flex gap-1.5 mb-4">
      {[1, 2, 3, 4].map(i => (
        <div
          key={i}
          className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-indigo-500" : "bg-muted"}`}
        />
      ))}
    </div>
  );
}

interface ResultItem {
  text: React.ReactNode;
  caution?: boolean;
}

function ResultList({ items }: { items: ResultItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((it, i) => (
        <div
          key={i}
          className="flex gap-2.5 py-2.5 border-b border-dashed border-border/60 last:border-b-0 text-sm text-foreground"
        >
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
              it.caution
                ? "bg-amber-500/15 text-amber-500"
                : "bg-indigo-500/10 text-indigo-400"
            }`}
          >
            {i + 1}
          </span>
          <span className="leading-snug">{it.text}</span>
        </div>
      ))}
    </div>
  );
}

function CrashWizard() {
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);

  const restart = () => {
    setStep(1);
    setAnswers(EMPTY_ANSWERS);
  };
  const goBack = () => {
    if (step === 4 && answers.scenario !== "A1" && answers.scenario !== "A2") {
      setStep(2);
    } else {
      setStep(s => Math.max(1, s - 1));
    }
  };

  if (step === 1) {
    return (
      <div>
        <ProgressRow step={1} />
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-indigo-400 mb-1">
          Step 1 of 4
        </p>
        <p className="text-lg font-bold text-foreground mb-1">What happened?</p>
        <p className="text-xs text-muted-foreground mb-4">
          Pick the scenario that best matches the crash.
        </p>
        <div className="flex flex-col gap-2">
          {SCENARIOS.map(s => (
            <OptionButton
              key={s.key}
              title={s.title}
              sub={s.sub}
              onClick={() => {
                setAnswers(a => ({ ...a, scenario: s.key }));
                setStep(2);
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div>
        <ProgressRow step={2} />
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-indigo-400 mb-1">
          Step 2 of 4
        </p>
        <p className="text-lg font-bold text-foreground mb-1">
          Is the SU vehicle drivable?
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Assess this before anything else moves — it decides where the vehicle
          goes.
        </p>
        <div className="flex flex-col gap-2">
          {DRIVABILITY.map(d => (
            <OptionButton
              key={d.key}
              title={d.title}
              sub={d.sub}
              onClick={() => {
                setAnswers(a => ({ ...a, drivability: d.key }));
                setStep(3);
              }}
            />
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={goBack}>
          <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
      </div>
    );
  }

  if (step === 3) {
    if (answers.scenario !== "A1" && answers.scenario !== "A2") {
      // Injury scenarios (B1/B2/C1) always require police reporting — skip.
      setStep(4);
      return null;
    }
    return (
      <div>
        <ProgressRow step={3} />
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-indigo-400 mb-1">
          Step 3 of 4
        </p>
        <p className="text-lg font-bold text-foreground mb-1">
          Was ALL property damage $3,000 or under, with details fully exchanged?
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          "Property" here means anything damaged — not just the vehicle(s). A
          fence, a parked car, a wall or shopfront all count, even in a
          single-vehicle crash. Add up everything damaged, by anyone involved.
        </p>
        <div className="flex flex-col gap-2">
          <OptionButton
            title="Yes — $3,000 or under in total, and the required details were exchanged with the property owner(s), who were present"
            sub="Police reporting is not required."
            onClick={() => {
              setAnswers(a => ({ ...a, damageClean: "yes" }));
              setStep(4);
            }}
          />
          <OptionButton
            title="No — total damage is over $3,000, details couldn't be exchanged, an owner wasn't present, or police attended and require it"
            sub="Police reporting is required."
            onClick={() => {
              setAnswers(a => ({ ...a, damageClean: "no" }));
              setStep(4);
            }}
          />
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={goBack}>
          <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
      </div>
    );
  }

  if (step === 4) {
    return (
      <div>
        <ProgressRow step={4} />
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-indigo-400 mb-1">
          Step 4 of 4
        </p>
        <p className="text-lg font-bold text-foreground mb-1">
          Does any of this apply?
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Serious injury requiring medical treatment to the operative — a
          fatality to any person — or an urgent situation where staying silent
          would delay emergency, medical, or law-enforcement response.
        </p>
        <div className="flex flex-col gap-2">
          <OptionButton
            title="Yes, one of these applies"
            sub="A declaration exception may be available — TL / Inspector approval required."
            onClick={() => {
              setAnswers(a => ({ ...a, exception: "yes" }));
              setStep(5);
            }}
          />
          <OptionButton
            title="No — none of these apply"
            sub="Continue using the Assumed Identity throughout."
            onClick={() => {
              setAnswers(a => ({ ...a, exception: "no" }));
              setStep(5);
            }}
          />
        </div>
        <Button variant="outline" size="sm" className="mt-4" onClick={goBack}>
          <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
      </div>
    );
  }

  // step === 5: results
  const policeNeeded = needsPoliceReport(answers);
  const exceptionFlagged = answers.exception === "yes";

  const scene: ResultItem[] = [];
  if (
    answers.scenario === "B1" ||
    answers.scenario === "B2" ||
    answers.scenario === "C1"
  ) {
    scene.push({
      text: (
        <>
          <b>Render assistance and call emergency services</b> — an injury has
          occurred ({answers.scenario}).
        </>
      ),
      caution: true,
    });
  }
  scene.push({
    text: (
      <>
        Use your <b>Assumed Identity</b> details for anything you're required to
        give — registration, name, address, licence, phone.
      </>
    ),
  });
  scene.push({
    text: (
      <>
        <b>AI registration plates remain fitted to the vehicle at all times</b>{" "}
        at the scene — this is unconditional, regardless of scenario.
      </>
    ),
    caution: true,
  });
  if (exceptionFlagged) {
    scene.push({
      text: (
        <>
          A <b>declaration exception may apply</b> — this is only permitted
          where there's a serious injury requiring medical treatment to the
          operative, a fatality to any person, or an urgent situation where
          staying silent would delay emergency, medical, or law-enforcement
          response. Get authorisation from your{" "}
          <b>Team Leader / Inspector CTO WC</b> first. If disclosed: emergency
          services only (Police / SJA / FESA), never media, the public, or other
          parties in the incident — and keep it <b>strictly need-to-know</b>:
          state only what's necessary, once, with no further disclosure or
          elaboration afterward.
        </>
      ),
      caution: true,
    });
  } else {
    scene.push({
      text: (
        <>
          <b>Do Not Declare</b> AFP affiliation or true identity — and don't
          declare the insurer's name.
        </>
      ),
    });
  }
  if (answers.drivability === "secure") {
    scene.push({
      text: (
        <>
          Vehicle is <b>drivable and secure</b> — may return to operational use
          once your Team Leader has assessed it.
        </>
      ),
    });
  } else if (answers.drivability === "notsecure") {
    scene.push({
      text: (
        <>
          Vehicle is <b>drivable but not secure</b> — do <b>not</b> return to
          duty or leave it unattended, and don't rely on tape/temporary fixes.
          Take it <b>directly to Darwinia</b> for securing.
        </>
      ),
      caution: true,
    });
  } else if (answers.drivability === "notdrivable") {
    scene.push({
      text: (
        <>
          Vehicle is <b>not drivable</b> — recovery only through the approved
          tow/tilt-tray provider, linked to <b>{REPAIRER_NAME}</b>,{" "}
          {REPAIRER_ADDRESS} — contact <b>{REPAIRER_CONTACT}</b> (after-hours:{" "}
          {REPAIRER_AFTERHOURS}). This is the <b>only</b> approved repairer and
          towing contractor — do not use any other, under any circumstances,
          unless expressly directed by your Team Leader or Inspector CTO WC.
        </>
      ),
      caution: true,
    });
  }
  scene.push({
    text: policeNeeded ? (
      <>
        <b>Police reporting is required</b> for this scenario — cooperate as
        normal, using your Assumed Identity details.
      </>
    ) : (
      <>
        Based on your answers, <b>police reporting is not required</b> for this
        scenario — confirm with SSU if in doubt.
      </>
    ),
  });
  scene.push({
    text: (
      <>
        Take photos before leaving the scene: damage to the SU vehicle, the
        scene/area, <b>wide-angle shots of all four sides</b>, and the{" "}
        <b>instrument cluster/speedo</b> — the last two are required by
        Comcover.
      </>
    ),
  });
  scene.push({
    text: <>Do not contact Comcover or any insurer directly, at any point.</>,
  });

  const after: ResultItem[] = [];
  after.push({
    text: (
      <>
        <b>Notify SSU, CPT, and HUMINT Finance</b> as soon as practicable — the
        initial information is the same for all three:
        <ul className="list-disc list-inside mt-1.5 text-muted-foreground">
          <li>Nature of the crash ({answers.scenario})</li>
          <li>Circumstances of the crash</li>
          <li>Police attendance or response, if any</li>
          <li>Whether Assumed Identity details were exchanged</li>
        </ul>
      </>
    ),
  });
  if (policeNeeded) {
    after.push({
      text: (
        <>
          Request a hard-copy <b>MR72</b> from SSU, complete it using your
          Assumed Identity details, and return it.
        </>
      ),
    });
  }
  after.push({
    text: (
      <>
        Provide to CPT / HUMINT Finance:{" "}
        {policeNeeded && "a copy of the MR72, "}a completed Comcover claim form
        (leave Sections A &amp; B blank), and your scene/vehicle photos.
      </>
    ),
  });
  if (exceptionFlagged) {
    after.push({
      text: (
        <>
          Complete a <b>Security Incident Report (SIR)</b> — a declaration
          exception was used this time.
        </>
      ),
      caution: true,
    });
  } else {
    after.push({
      text: (
        <>
          A Security Incident Report (SIR) is only needed if a declaration
          occurred, AI compromise is suspected, or CPT otherwise requires one.
        </>
      ),
    });
  }
  after.push({
    text: (
      <>
        All documentation is reviewed and approved by your{" "}
        <b>Team Leader or Inspector</b> before it goes to CPT, HUMINT Finance,
        SSU, or WAPOL.
      </>
    ),
  });
  after.push({
    text: (
      <>
        Repairs go only through <b>{REPAIRER_NAME}</b> ({REPAIRER_CONTACT}),
        arranged via CPT/HUMINT Finance (or directly by SU Command if under
        $5,000) — never arrange this yourself, and never use any other repairer.
      </>
    ),
    caution: true,
  });

  return (
    <div>
      <div
        className={`flex items-start gap-2.5 p-3.5 rounded-xl mb-4 text-sm font-semibold ${
          exceptionFlagged
            ? "bg-red-500/10 border border-red-500/25 text-red-400"
            : "bg-green-500/10 border border-green-500/25 text-green-500"
        }`}
      >
        {exceptionFlagged ? (
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        ) : (
          <ShieldOff className="h-4 w-4 shrink-0 mt-0.5" />
        )}
        <span>
          {exceptionFlagged
            ? "A declaration exception may be in play — get Team Leader / Inspector CTO WC sign-off before disclosing anything beyond your Assumed Identity."
            : "Standard pathway — stay in your Assumed Identity throughout, no declaration needed."}
        </span>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden mb-3">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-500">
          <Camera className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            At the Scene
          </span>
        </div>
        <div className="px-4 pb-1">
          <ResultList items={scene} />
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden mb-4">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 text-blue-400">
          <ListChecks className="h-3.5 w-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            After / Reporting
          </span>
        </div>
        <div className="px-4 pb-1">
          <ResultList items={after} />
        </div>
      </div>

      <Button onClick={restart}>Start Over</Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────
export default function VehicleCrashPage() {
  const [screen, setScreen] = useState<Screen>("menu");

  const titles: Record<Screen, string> = {
    menu: "Vehicle Crash",
    sop: "Full SOP",
    wizard: "Crash Helper",
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <Car className="h-5 w-5 text-slate-400" />
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {titles[screen]}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              AFP Western Command Surveillance Unit — Vehicle Crash SOP
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {(["menu", "sop", "wizard"] as Screen[]).map(s => (
            <button
              key={s}
              onClick={() => setScreen(s)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                screen === s
                  ? "bg-indigo-500 border-indigo-500 text-white"
                  : "bg-card/60 border-border/60 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {s === "menu"
                ? "Menu"
                : s === "sop"
                  ? "Full SOP"
                  : "Crash Helper"}
            </button>
          ))}
        </div>

        {screen === "menu" && <CrashMenu onSelect={setScreen} />}
        {screen === "sop" && <CrashSopViewer />}
        {screen === "wizard" && <CrashWizard key="wizard" />}
      </div>
    </DashboardLayout>
  );
}
