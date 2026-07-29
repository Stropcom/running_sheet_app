/**
 * PrintRosterView — a flat, non-scrollable HTML table used exclusively for PDF export.
 * Rendered as a React portal directly on document.body (outside #root) so the
 * @media print CSS can hide #root and show only this element.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { format, eachDayOfInterval, parseISO, isValid } from "date-fns";
import {
  SHIFT_LABELS,
  SHIFT_CODES,
  shiftClass,
} from "@shared/ctoRosterShiftUtils";
import { cn } from "@/lib/utils";

/**
 * Toggles a body class while this component is mounted so the shared
 * @media print rules that hide #root only apply here — several other pages
 * (OperationManagerPage, WitnessListPage, Intelligence profiles, etc.) print
 * in place via their own .no-print rules and must be unaffected.
 */
function usePrintingBodyClass() {
  useEffect(() => {
    document.body.classList.add("cto-roster-printing");
    return () => document.body.classList.remove("cto-roster-printing");
  }, []);
}

type Member = { id: number; name: string; teamId: number; sortOrder: number };
type Team = { id: number; name: string; sortOrder: number };
type ShiftData = {
  memberId: number;
  shiftDate: string;
  shiftCode: string;
  shiftTime?: string | null;
  comment?: string | null;
  isActing?: boolean;
};

interface Props {
  rosterName: string;
  startDate: string | Date | null | undefined;
  endDate: string | Date | null | undefined;
  createdByName?: string | null;
  teams: Team[];
  members: Member[];
  shiftMap: Map<string, ShiftData>;
}

function safeDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  const dt = typeof d === "string" ? parseISO(d) : d;
  return isValid(dt) ? dt : null;
}

export function PrintRosterView({
  rosterName,
  startDate,
  endDate,
  createdByName,
  teams,
  members,
  shiftMap,
}: Props) {
  usePrintingBodyClass();
  const start = safeDate(startDate);
  const end = safeDate(endDate);
  if (!start || !end) return null;

  const allDates = eachDayOfInterval({ start, end });
  const membersByTeam = new Map<number, Member[]>();
  for (const m of members) {
    if (!membersByTeam.has(m.teamId)) membersByTeam.set(m.teamId, []);
    membersByTeam.get(m.teamId)!.push(m);
  }

  // Only codes actually used
  const seenCodes = new Set(
    Array.from(shiftMap.values()).map(v => v.shiftCode)
  );
  const usedCodes = SHIFT_CODES.filter(c => seenCodes.has(c));

  return createPortal(
    <div
      className="print-only"
      style={{ fontFamily: "Arial, sans-serif", fontSize: 9, color: "#000" }}
    >
      <style>{`@media print { @page { size: A4 landscape; margin: 10mm 8mm; } }`}</style>
      {/* Header */}
      <div
        style={{
          borderBottom: "2px solid #000",
          paddingBottom: 4,
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: "bold" }}>
          SAVED ROSTER — {rosterName}
        </div>
        <div style={{ fontSize: 9, color: "#555", marginTop: 2 }}>
          {start ? format(start, "d MMM yyyy") : ""} –{" "}
          {end ? format(end, "d MMM yyyy") : ""}
          {createdByName ? ` · Saved by ${createdByName}` : ""}
          {" · "}Printed {format(new Date(), "d MMM yyyy HH:mm")}
        </div>
      </div>

      {/* Roster table */}
      <table
        style={{
          borderCollapse: "collapse",
          width: "100%",
          tableLayout: "fixed",
        }}
      >
        <colgroup>
          {/* Name column */}
          <col style={{ width: 110 }} />
          {/* Date columns */}
          {allDates.map(d => (
            <col
              key={format(d, "yyyy-MM-dd")}
              style={{ width: Math.max(28, Math.floor(680 / allDates.length)) }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th
              style={{
                border: "1px solid #ccc",
                padding: "2px 4px",
                background: "#f0f0f0",
                textAlign: "left",
                fontSize: 8,
              }}
            >
              Member
            </th>
            {allDates.map(d => (
              <th
                key={format(d, "yyyy-MM-dd")}
                style={{
                  border: "1px solid #ccc",
                  padding: "1px 1px",
                  background: "#f0f0f0",
                  textAlign: "center",
                  fontSize: 7,
                  lineHeight: 1.1,
                }}
              >
                <div style={{ fontWeight: "bold" }}>{format(d, "d")}</div>
                <div style={{ color: "#666" }}>{format(d, "EEE")}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map(team => {
            const teamMembers = (membersByTeam.get(team.id) ?? [])
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (teamMembers.length === 0) return null;
            return (
              <>
                {/* Team header row */}
                <tr key={`team-${team.id}`}>
                  <td
                    colSpan={allDates.length + 1}
                    style={{
                      background: "#1e3a5f",
                      color: "#fff",
                      fontWeight: "bold",
                      fontSize: 8,
                      padding: "2px 4px",
                      border: "1px solid #1e3a5f",
                    }}
                  >
                    {team.name}
                  </td>
                </tr>
                {/* Member rows */}
                {teamMembers.map(member => (
                  <tr key={member.id}>
                    <td
                      style={{
                        border: "1px solid #ddd",
                        padding: "1px 3px",
                        fontSize: 8,
                        fontWeight: "500",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        background: "#fafafa",
                      }}
                    >
                      {member.name}
                    </td>
                    {allDates.map(d => {
                      const ds = format(d, "yyyy-MM-dd");
                      const shift = shiftMap.get(`${member.id}_${ds}`);
                      const code = shift?.shiftCode ?? "";
                      const time = shift?.shiftTime ?? "";
                      const isActing = shift?.isActing ?? false;
                      return (
                        <td
                          key={ds}
                          style={{
                            border: "1px solid #ddd",
                            padding: 0,
                            textAlign: "center",
                            verticalAlign: "middle",
                            height: 20,
                          }}
                        >
                          {code ? (
                            <div
                              className={cn(shiftClass(code))}
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                height: "100%",
                                padding: "1px 0",
                                position: "relative",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 7,
                                  fontWeight: "bold",
                                  lineHeight: 1,
                                }}
                              >
                                {code.toUpperCase()}
                              </span>
                              {time && (
                                <span
                                  style={{
                                    fontSize: 6,
                                    lineHeight: 1,
                                    opacity: 0.8,
                                  }}
                                >
                                  {time}
                                </span>
                              )}
                              {isActing && (
                                <span
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    right: 1,
                                    fontSize: 6,
                                    color: "#f59e0b",
                                  }}
                                >
                                  ★
                                </span>
                              )}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      {usedCodes.length > 0 && (
        <div
          style={{ marginTop: 10, borderTop: "1px solid #ccc", paddingTop: 6 }}
        >
          <div
            style={{
              fontSize: 8,
              fontWeight: "bold",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#555",
            }}
          >
            Shift Legend
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {usedCodes.map(code => (
              <div
                key={code}
                style={{ display: "flex", alignItems: "center", gap: 3 }}
              >
                <div
                  className={cn(shiftClass(code))}
                  style={{
                    borderRadius: 3,
                    padding: "1px 5px",
                    fontSize: 7,
                    fontWeight: "bold",
                    minWidth: 22,
                    textAlign: "center",
                  }}
                >
                  {code.toUpperCase()}
                </div>
                <span style={{ fontSize: 8, color: "#333" }}>
                  {SHIFT_LABELS[code as keyof typeof SHIFT_LABELS] ?? code}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
