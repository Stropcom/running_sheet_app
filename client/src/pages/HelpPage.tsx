import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronDown, ChevronRight, BookOpen, AlertTriangle, Info } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HelpItem {
  question: string;
  answer: string;
  tags: string[];
  important?: boolean; // highlights data-entry critical items
}

interface HelpSection {
  id: string;
  title: string;
  icon: string;
  items: HelpItem[];
}

// ─── Help Content ─────────────────────────────────────────────────────────────

const HELP_SECTIONS: HelpSection[] = [
  {
    id: "user-roles",
    title: "User Roles & Access",
    icon: "👤",
    items: [
      {
        question: "What are the different user roles?",
        answer:
          "There are three roles:\n\n• **Admin** — Full access to everything: create/edit/delete operations and sheets, manage users, certify rows, close sheets, access all pages.\n• **Member (Full Access)** — Can create operations and sheets, add/edit rows, certify their own rows, and reopen sheets. Cannot manage users.\n• **Observer** — Read-only access. Can view running sheets and operations but cannot add, edit, certify, or delete anything.",
        tags: ["roles", "access", "admin", "member", "observer"],
      },
      {
        question: "Who can close a running sheet?",
        answer:
          "Only the **Team Leader** (the CIN designated as TL in the sheet's TEAM roster) or an **Admin** can close a running sheet. All other members can view and certify rows, but cannot close the sheet. This is a deliberate control to ensure the Team Leader has reviewed and approved the sheet before it is finalised.",
        tags: ["close", "team leader", "TL", "sheet", "access"],
        important: true,
      },
      {
        question: "Who can reopen a closed sheet?",
        answer:
          "Any user with Member or Admin role can reopen a closed running sheet. This allows corrections to be made after closure if needed.",
        tags: ["reopen", "sheet", "access"],
      },
    ],
  },
  {
    id: "operations",
    title: "Operations",
    icon: "📁",
    items: [
      {
        question: "How do I create a new operation?",
        answer:
          "From the main Operations page, click the **+ New Operation** button in the top right. Fill in the Operation Name, PROMIS Number, IMS Number, and Investigation Unit, then save. The operation will appear in your operations list.",
        tags: ["create", "operation", "new", "PROMIS", "IMS"],
      },
      {
        question: "What is the YYYYMMDD naming convention for operations and sheets?",
        answer:
          "If you begin an operation or running sheet title with a date in the format **YYYYMMDD** (e.g. 20260704 Operation ALPHA), the Calendar view will automatically place that operation/sheet on the correct date. Without this prefix, the system falls back to the creation date in UTC, which may display on a different day depending on timezone. Always use this prefix for accurate calendar placement.",
        tags: ["naming", "calendar", "date", "YYYYMMDD", "format"],
        important: true,
      },
      {
        question: "How do I edit an operation?",
        answer:
          "Open the operation, then click the **Edit** (pencil) icon near the operation title. You can update the name, PROMIS number, IMS number, and investigation unit.",
        tags: ["edit", "operation", "update"],
      },
      {
        question: "How do I delete an operation?",
        answer:
          "On the Operations list page, hover over the operation card and click the **trash icon**. You will be shown a summary of how many running sheets, rows, and targets will also be deleted. Confirm to proceed. This action is permanent and cannot be undone.",
        tags: ["delete", "operation", "remove"],
      },
      {
        question: "What happens when I search for an operation?",
        answer:
          "The search bar on the Operations page performs a **deep search** across operation names, running sheet titles, CINs, target names, and observation text. Results from Before Court and Archive operations are also returned, shown with a status badge. Clicking a non-active operation result redirects you to the Operation Management folder rather than the operation itself.",
        tags: ["search", "deep search", "operations", "find"],
      },
    ],
  },
  {
    id: "running-sheets",
    title: "Running Sheets",
    icon: "📋",
    items: [
      {
        question: "How do I create a running sheet?",
        answer:
          "Open an operation, then click **+ New Running Sheet**. Enter the sheet title (use the YYYYMMDD prefix for calendar accuracy), then set up the TEAM roster — add each CIN that participated, designate the Team Leader and Author, and indicate which CINs have imagery.",
        tags: ["create", "running sheet", "new", "TEAM"],
      },
      {
        question: "How do rows get sorted?",
        answer:
          "Rows are sorted chronologically by their **time value** (timeMinutes). New rows without a time appear at the top. Once a time is assigned, the row moves into the correct position automatically. This order is also used in PDF exports and AFP Statements.",
        tags: ["sort", "rows", "time", "order", "chronological"],
        important: true,
      },
      {
        question: "How do I add a row?",
        answer:
          "Click the **+ Add Row** button at the bottom of the running sheet. A new blank row appears at the top. Fill in the time using the time picker, add CINs to the CIN column, and enter the observation text.",
        tags: ["add row", "new row", "running sheet"],
      },
      {
        question: "What does locking a row do?",
        answer:
          "A locked row cannot be edited or have CINs added or removed. Rows are locked when all CINs in that row have been certified. You can unlock a row by uncertifying a CIN within it.",
        tags: ["lock", "row", "locked", "edit"],
      },
      {
        question: "How do I close a running sheet?",
        answer:
          "Only the **Team Leader** or an **Admin** can close a sheet. The Close button appears at the top of the sheet detail page. All rows do not need to be certified before closing — closing is a deliberate TL decision. Once closed, the sheet is faded but still readable, and a closed badge with CIN and timestamp is shown.",
        tags: ["close", "sheet", "team leader", "finalise"],
      },
      {
        question: "Can I copy or move a running sheet?",
        answer:
          "Yes. On the operation detail page, each running sheet card has a **copy/move icon** next to the delete icon. Select whether to copy or move, choose the destination operation, and if copying, provide a new name for the sheet.",
        tags: ["copy", "move", "running sheet", "transfer"],
      },
    ],
  },
  {
    id: "cins-team",
    title: "CINs & TEAM Roster",
    icon: "🪪",
    items: [
      {
        question: "What is the TEAM roster?",
        answer:
          "The TEAM roster is the list of CINs (officer identifiers) who participated in the surveillance operation for that running sheet. It is set when creating the sheet and can be edited later via the **Edit Roster** button. Each CIN can be designated as Team Leader (★) or Author (✏), and flagged as having imagery.",
        tags: ["TEAM", "roster", "CIN", "team leader", "author"],
      },
      {
        question: "Why must CINs in the TEAM roster match exactly what is entered in rows?",
        answer:
          "The system uses CINs to link certifications, generate AFP Statements, build Witness Lists, and populate the Governance To-Do list. If a CIN in a row does not exactly match a CIN in the TEAM roster, that officer's rows will not be included in their statement, and their certification status will not be tracked correctly. Always use the dropdown when adding CINs to rows — this ensures the correct value is used.",
        tags: ["CIN", "match", "roster", "statement", "certification", "accuracy"],
        important: true,
      },
      {
        question: "What does the Team Leader designation do?",
        answer:
          "The Team Leader (TL) CIN is the only person (besides Admin) who can close the running sheet. The TL also receives a **'Ready to close'** item in their Governance To-Do list for every open sheet they lead. Only one CIN should be designated as Team Leader per sheet.",
        tags: ["team leader", "TL", "close", "governance", "to-do"],
        important: true,
      },
      {
        question: "What does the Author designation do?",
        answer:
          "The Author is the officer who wrote the running sheet. This is used in the Governance checklist to identify who is responsible for completing the post-surveillance governance tasks (Saved as Word, PDF, PROMIS upload, etc.).",
        tags: ["author", "governance", "running sheet"],
      },
      {
        question: "Can I add the same CIN more than once to a row?",
        answer:
          "Yes. You can add the same CIN multiple times within a single row to align with different segments of the observation text. Each instance is tracked and certified independently.",
        tags: ["CIN", "duplicate", "row", "multiple"],
      },
      {
        question: "What are the group shortcuts (TEAM 1, TEAM 2, PTT) in the CIN dropdown?",
        answer:
          "When adding CINs to a row, the dropdown includes group options — **TEAM 1**, **TEAM 2**, and **PTT**. Selecting one of these automatically adds all users belonging to that team to the row in one action. Individual CINs can still be added or removed after.",
        tags: ["TEAM 1", "TEAM 2", "PTT", "group", "CIN", "dropdown"],
      },
    ],
  },
  {
    id: "observations",
    title: "Observation Text & Shortcuts",
    icon: "✍️",
    items: [
      {
        question: "How do observation shortcuts work?",
        answer:
          "Type a shortcut trigger word in the observation field followed by a **space or tab**, and it automatically expands to the full phrase. For example, typing `pt ` expands to `PHOTOGRAPH/S TAKEN`. Shortcuts are managed in the **Shortcuts** page in the sidebar.",
        tags: ["shortcuts", "observation", "expand", "trigger"],
      },
      {
        question: "What are the default shortcuts?",
        answer:
          "The default shortcuts are:\n• `sc` → SURVEILLANCE COMMENCED\n• `rack` → RACK\n• `oos` → OUT OF SIGHT\n• `coos` → CAME OUT OF SIGHT\n• `pt` → PHOTOGRAPH/S TAKEN\n\nAdditional shortcuts can be created on the Shortcuts page.",
        tags: ["shortcuts", "default", "sc", "rack", "oos", "pt"],
      },
      {
        question: "How do target-aware shortcuts work?",
        answer:
          "When a running sheet has an assigned target, the target's field abbreviations become live shortcuts in the observation field. For example, if the target's home address is set to '27 Olding Way', typing `HB ` in the observation field will expand to `27 Olding Way`. The available shortcuts are: TGT (target name), HB (home), HBF (home full address), V1 (vehicle 1), V1F (vehicle 1 full), V2 (vehicle 2), V2F (vehicle 2 full), DEP (depart), ARR (arrive).",
        tags: ["target", "shortcuts", "TGT", "HB", "V1", "V2", "DEP", "ARR", "observation"],
        important: true,
      },
      {
        question: "Do I need to format observations differently for the Intelligence folder?",
        answer:
          "No. The Intelligence folder works automatically from standard AFP surveillance log writing. As long as observations follow the normal format of writing a full description followed by a short form in parentheses — which is standard practice — the system will extract and link entities without any extra effort from the officer.\n\nConsistency in how names, registrations, and addresses are written does matter — for example, writing a vehicle registration as `(ABC 123)` in one sheet and `(ABC123)` in another will cause them to be treated as different entities. Keeping short forms consistent across sheets ensures accurate intelligence linking.",
        tags: ["intelligence", "entities", "observation", "format", "automatic", "parentheses", "consistency"],
        important: true,
      },
      {
        question: "What are 'Surveillance Commenced', 'Surveillance Ceased', and 'Travelled Via' rows?",
        answer:
          "These are **special row types** that the system recognises by their observation text prefix:\n\n• Rows beginning with `SURVEILLANCE COMMENCED` or `SURVEILLANCE CEASED` mark the start and end of an officer's surveillance period. These rows are **excluded** from AFP Statements (they are administrative, not evidential) and are used to classify officers as **secondary witnesses** in the Witness List.\n• Rows where the observation ends with `WHEREAT` (or `WHEREAT:`) followed by a subsequent row beginning with `CONTINUED VIA` are classified as **Travelled Via** rows and are also excluded from statements and used for secondary witness classification.\n\nThese prefixes must be written exactly as shown for the system to recognise them.",
        tags: ["surveillance commenced", "surveillance ceased", "travelled via", "whereat", "statement", "witness list", "secondary"],
        important: true,
      },
      {
        question: "Why does the observation text affect the AFP Statement?",
        answer:
          "The AFP Statement generator reads each row's observation text to build the numbered paragraphs in the statement. It also scans for photo/video keywords (e.g. `PHOTOGRAPH`, `VIDEO`, `FOOTAGE`) to determine which rows contain imagery, and lists those in paragraph 9 with exhibit labels. Rows classified as Surveillance Commenced/Ceased or Travelled Via are excluded. The quality and accuracy of the generated statement is directly dependent on how observations are written.",
        tags: ["statement", "AFP", "observation", "photograph", "video", "imagery", "exhibit"],
        important: true,
      },
    ],
  },
  {
    id: "certification",
    title: "Certification",
    icon: "🛡️",
    items: [
      {
        question: "How do I certify a row?",
        answer:
          "In the Certify column of each row, each CIN has a **shield icon**. A red shield means uncertified; a green shield means certified. Click the shield to certify. Click again to uncertify. Only the CIN's own officer (or an Admin) can certify that CIN's entry.",
        tags: ["certify", "shield", "row", "CIN", "green", "red"],
      },
      {
        question: "What does 'Certify All' do?",
        answer:
          "The **Certify All** button next to each CIN in the TEAM roster certifies every unlocked row that contains that CIN across the entire sheet in one action. This is useful at the end of a surveillance day to quickly sign off all rows.",
        tags: ["certify all", "bulk certify", "CIN", "TEAM"],
      },
      {
        question: "What do the CIN badge colours on sheet cards mean?",
        answer:
          "On the operation detail page, each running sheet card shows CIN badges:\n• **Red badge** — that CIN has one or more uncertified rows\n• **Green badge** — all of that CIN's rows are certified\n\nWhen every CIN on the sheet is fully certified, the entire sheet card turns green.",
        tags: ["badge", "CIN", "green", "red", "certified", "sheet card"],
      },
    ],
  },
  {
    id: "governance",
    title: "RS Governance",
    icon: "✅",
    items: [
      {
        question: "What is the Governance checklist?",
        answer:
          "The Governance checklist is a post-surveillance task tracker for each running sheet. It records whether key administrative tasks have been completed after the operation: iSurv submission, sending to IO, saving as Word, saving as PDF, uploading to PROMIS, linking, saving in the Op folder, and imagery management. It is accessed via the **Governance** button on the sheet detail page or through the Governance list in the sidebar.",
        tags: ["governance", "checklist", "iSurv", "PROMIS", "Word", "PDF", "IO"],
      },
      {
        question: "What is the Governance To-Do page?",
        answer:
          "The **Governance To-Do** page (under To-Do in the sidebar) shows each officer's outstanding governance tasks across all their running sheets. Items appear in amber (rows not yet certified), rose (governance incomplete), or emerald (ready to close). The Team Leader sees a 'Ready to close' item for every open sheet they lead, with a percentage badge showing governance completion.",
        tags: ["governance", "to-do", "outstanding", "team leader", "ready to close", "percentage"],
      },
      {
        question: "What does the governance percentage badge mean?",
        answer:
          "The percentage badge on a 'Ready to close' item shows how much of the governance checklist has been completed for that sheet (0–100%). A slate badge means 0–49% complete, sky-blue means 50–99%, and emerald means 100% complete. The Team Leader can use this to gauge whether the sheet is truly ready to close.",
        tags: ["governance", "percentage", "badge", "ready to close", "team leader"],
      },
    ],
  },
  {
    id: "operation-management",
    title: "Operation Management",
    icon: "⚖️",
    items: [
      {
        question: "What is the Operation Management folder?",
        answer:
          "The **Operation Management** folder (in the sidebar, between Target Registry and Court) is where you manage the lifecycle status of operations. Operations can be moved from Active to **Before Court** or **Archive** status. Non-active operations are hidden from the main Operations page but remain searchable.",
        tags: ["operation management", "before court", "archive", "status", "lifecycle"],
      },
      {
        question: "What happens when an operation is moved to Before Court or Archive?",
        answer:
          "Once an operation is moved out of Active status:\n• It disappears from the main Operations page\n• It is still findable via the deep search (shown with a status badge)\n• Clicking it in search results redirects to Operation Management, not the operation itself\n• **All running sheet mutations are blocked** — no rows can be added, edited, or deleted, and no CINs can be modified\n• PDF export of running sheets is still permitted\n• The operation can be moved back to Active at any time from Operation Management",
        tags: ["before court", "archive", "status", "blocked", "mutations", "PDF"],
        important: true,
      },
      {
        question: "What is required before moving an operation to Before Court or Archive?",
        answer:
          "All running sheets within the operation must be **closed** before the operation can be moved to Before Court or Archive status. If any sheets are still open, the status change will be blocked with an error message.",
        tags: ["before court", "archive", "close sheets", "requirement", "status change"],
        important: true,
      },
    ],
  },
  {
    id: "court",
    title: "Court Documents",
    icon: "🏛️",
    items: [
      {
        question: "How do I generate an AFP Statement?",
        answer:
          "Go to **Court → Statements** in the sidebar. Select the operation, then select one or more running sheets. If you are an Admin, you can select which CINs to generate statements for; otherwise your own CIN is automatically selected. Click **Generate Statement** to download a .docx file per CIN (or a ZIP if multiple).",
        tags: ["statement", "AFP", "generate", "court", "docx"],
      },
      {
        question: "What data does the AFP Statement pull from?",
        answer:
          "The statement generator uses:\n• The officer's name and CIN from the user database\n• The operation name, PROMIS number, and IMS number\n• All rows in the selected sheets where that CIN appears (excluding Surveillance Commenced/Ceased and Travelled Via rows)\n• Imagery rows (where observation contains PHOTOGRAPH, VIDEO, or FOOTAGE keywords) for paragraph 9 exhibit entries\n• The sheet's TEAM roster for the imagery flag\n\nAccuracy of the statement depends entirely on the accuracy of the data entered in the running sheet.",
        tags: ["statement", "AFP", "data", "CIN", "imagery", "PROMIS", "IMS"],
        important: true,
      },
      {
        question: "How do I generate a Witness List?",
        answer:
          "Go to **Court → Witness List** in the sidebar. Select the operation, then select one or more running sheets. Click **Generate Witness List** to download a .docx file. If only one sheet is selected, only the individual sheet list is produced. If two or more sheets are selected, a combined list is also included.",
        tags: ["witness list", "court", "generate", "docx", "primary", "secondary"],
      },
      {
        question: "How are Primary and Secondary witnesses determined?",
        answer:
          "The Witness List generator classifies each CIN as:\n• **Primary Witness** — the CIN has substantive observation rows (rows that are not Surveillance Commenced/Ceased or Travelled Via)\n• **Secondary Witness** — the CIN only appears on Surveillance Commenced/Ceased or Travelled Via rows\n\nThis classification is automatic and based on the row content. Correct use of the SURVEILLANCE COMMENCED/CEASED and WHEREAT/CONTINUED VIA conventions is essential for accurate classification.",
        tags: ["primary", "secondary", "witness", "classification", "surveillance commenced", "travelled via"],
        important: true,
      },
    ],
  },
  {
    id: "targets",
    title: "Target Registry",
    icon: "🎯",
    items: [
      {
        question: "What is the Target Registry?",
        answer:
          "The **Target Registry** is a central database of all targets across all operations. Targets persist independently — they are not deleted if an operation is deleted. Each target has fields for name, home address (HB), home full address (HBF), vehicle 1 (V1), vehicle 1 full (V1F), vehicle 2 (V2), vehicle 2 full (V2F), depart (DEP), and arrive (ARR).",
        tags: ["target registry", "targets", "HB", "V1", "V2", "DEP", "ARR"],
      },
      {
        question: "How do I link a target to a running sheet?",
        answer:
          "On the running sheet detail page, use the **target selector dropdown** in the sheet header to link an existing target. Once linked, the target's field abbreviations (TGT, HB, V1, etc.) become active shortcuts in the observation field for that sheet.",
        tags: ["target", "link", "running sheet", "shortcuts", "observation"],
      },
      {
        question: "Why are target field values important for shortcuts?",
        answer:
          "Target-aware shortcuts only work if the target's fields are populated. If HB (home address) is empty, typing `HB ` in the observation field will not expand. Ensure all relevant target fields are filled in the Target Registry before beginning surveillance so shortcuts work correctly during the operation.",
        tags: ["target", "shortcuts", "fields", "HB", "V1", "observation", "accuracy"],
        important: true,
      },
    ],
  },
  {
    id: "intelligence",
    title: "Intelligence Folder",
    icon: "🔍",
    items: [
      {
        question: "What does the Intelligence folder do?",
        answer:
          "The Intelligence folder automatically extracts and links **persons, vehicles, addresses, and businesses** from all observation text across all running sheets. It builds profiles showing how entities are connected — which vehicles a person was seen in, which addresses they visited, which other persons they were associated with, and which running sheets they appear in.",
        tags: ["intelligence", "entities", "persons", "vehicles", "addresses", "profiles"],
      },
      {
        question: "How does entity extraction work?",
        answer:
          "The system automatically scans observation text for the standard AFP surveillance log format — a **full description followed by a short form in parentheses**. No special formatting is required beyond writing observations as you normally would.\n\nExamples the system will detect:\n• `Jason JOHNSON (JOHNSON)` → Person\n• `a silver Toyota Hilux bearing registration (ABC 123)` → Vehicle\n• `1200 Leach Highway, MYAREE (HB)` → Address\n• `7-Eleven Northbridge (7-Eleven)` → Business\n\nThe system classifies the entity type automatically based on context words in the surrounding text — words like 'vehicle', 'registration', 'bearing' indicate a vehicle; all-caps names indicate a person; street numbers and road types indicate an address. Officers do not need to do anything differently from standard observation writing.",
        tags: ["intelligence", "extraction", "parentheses", "vehicles", "persons", "addresses", "businesses", "automatic"],
        important: false,
      },
      {
        question: "What is the Association Map?",
        answer:
          "The **Association Map** (under Intelligence in the sidebar) is a visual graph showing how entities are connected to each other across all running sheets. Nodes represent entities and edges represent co-occurrence in the same observation or sheet.",
        tags: ["association map", "intelligence", "graph", "entities", "connections"],
      },
    ],
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: "📅",
    items: [
      {
        question: "How does the Calendar work?",
        answer:
          "The Calendar view displays all running sheets as events on their surveillance date. Each event is clickable and links to the running sheet. Events are colour-coded by operation.",
        tags: ["calendar", "events", "date", "running sheet"],
      },
      {
        question: "Why is my running sheet appearing on the wrong date in the Calendar?",
        answer:
          "The Calendar uses the **YYYYMMDD prefix** in the sheet or operation title to determine the date. If no prefix is present, it falls back to the UTC creation timestamp, which may differ from Perth time (UTC+8) and cause the event to appear one day earlier than expected. Always prefix sheet and operation titles with the date in YYYYMMDD format to ensure correct calendar placement.",
        tags: ["calendar", "date", "YYYYMMDD", "timezone", "Perth", "wrong date"],
        important: true,
      },
    ],
  },
  {
    id: "todo",
    title: "To-Do Pages",
    icon: "📌",
    items: [
      {
        question: "What is the To-Do page?",
        answer:
          "The **To-Do** page (in the sidebar) shows all rows across all sheets where your CIN is listed but you have not yet certified. Items are grouped by operation and sheet, with a time and observation preview and a direct link to the sheet.",
        tags: ["to-do", "uncertified", "rows", "CIN", "certify"],
      },
      {
        question: "What is the Governance To-Do page?",
        answer:
          "The **Governance To-Do** page shows outstanding post-surveillance governance tasks for your CIN. Items appear in different colours:\n• **Amber** — rows not yet certified (must be done before governance tasks are actionable)\n• **Rose** — governance checklist items incomplete\n• **Emerald** — sheet is ready to close (Team Leader only)\n\nThe badge count in the sidebar shows the total number of outstanding items.",
        tags: ["governance to-do", "outstanding", "amber", "rose", "emerald", "team leader", "badge"],
      },
    ],
  },
  {
    id: "pdf-export",
    title: "PDF Export",
    icon: "🖨️",
    items: [
      {
        question: "How do I export a running sheet to PDF?",
        answer:
          "On the running sheet detail page, click the **Export** button in the header and select **PDF**. This opens a print-ready styled HTML document in a new tab. Use your browser's print function (Ctrl+P / Cmd+P) to save as PDF.",
        tags: ["PDF", "export", "print", "running sheet"],
      },
      {
        question: "What is included in the PDF export?",
        answer:
          "The PDF export includes:\n• A cover page with operation name, PROMIS number, IMS number, investigation unit, sheet title, date, and the TEAM roster with imagery indicators\n• The full running sheet table with all rows in chronological order (time, CINs, observation, certify status)\n\nThe search filter on the sheet does not affect what is exported — all rows are always included.",
        tags: ["PDF", "export", "cover page", "PROMIS", "IMS", "TEAM", "rows"],
      },
      {
        question: "Can I export a PDF for a Before Court or Archive operation?",
        answer:
          "Yes. PDF export is always permitted regardless of operation status. Even when an operation is in Before Court or Archive status (and all editing is blocked), you can still export running sheets to PDF.",
        tags: ["PDF", "export", "before court", "archive", "status"],
      },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalise(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

function scoreItem(item: HelpItem, query: string): number {
  if (!query) return 1;
  const q = normalise(query);
  const words = q.split(/\s+/).filter(Boolean);
  const haystack = normalise(item.question + " " + item.answer + " " + item.tags.join(" "));
  let score = 0;
  for (const word of words) {
    if (haystack.includes(word)) score++;
  }
  return score;
}

// ─── Section component ────────────────────────────────────────────────────────

function HelpSectionBlock({
  section,
  query,
  defaultOpen,
}: {
  section: HelpSection;
  query: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const filteredItems = useMemo(() => {
    if (!query) return section.items;
    return section.items.filter((item) => scoreItem(item, query) > 0);
  }, [section.items, query]);

  if (filteredItems.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-xl">{section.icon}</span>
        <span className="font-semibold text-foreground flex-1">{section.title}</span>
        <Badge variant="secondary" className="text-xs mr-2">
          {filteredItems.length}
        </Badge>
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border divide-y divide-border">
          {filteredItems.map((item, idx) => (
            <HelpItemBlock key={idx} item={item} query={query} />
          ))}
        </div>
      )}
    </div>
  );
}

function HelpItemBlock({ item, query }: { item: HelpItem; query: string }) {
  const [open, setOpen] = useState(!!query);

  // Auto-open when searching
  useMemo(() => {
    if (query) setOpen(true);
    else setOpen(false);
  }, [query]);

  // Render answer with basic markdown-like formatting
  function renderAnswer(text: string) {
    return text.split("\n").map((line, i) => {
      // Bold **text**
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <p key={i} className={`text-sm text-muted-foreground leading-relaxed ${i > 0 && line.startsWith("•") ? "ml-2" : ""}`}>
          {parts.map((part, j) =>
            j % 2 === 1 ? (
              <strong key={j} className="text-foreground font-semibold">
                {part}
              </strong>
            ) : (
              <span key={j}>{part}</span>
            )
          )}
        </p>
      );
    });
  }

  return (
    <div className={`px-5 py-3 ${item.important ? "border-l-2 border-amber-500/60" : ""}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 text-left group"
      >
        <div className="flex-1 flex items-start gap-2 mt-0.5">
          {item.important && (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
            {item.question}
          </span>
        </div>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </button>

      {open && (
        <div className="mt-2 pl-5 flex flex-col gap-1">
          {renderAnswer(item.answer)}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim();

  const visibleSections = useMemo(() => {
    if (!trimmedQuery) return HELP_SECTIONS;
    return HELP_SECTIONS.filter((section) =>
      section.items.some((item) => scoreItem(item, trimmedQuery) > 0)
    );
  }, [trimmedQuery]);

  const totalItems = useMemo(
    () =>
      HELP_SECTIONS.reduce((acc, s) => acc + s.items.length, 0),
    []
  );

  const matchedItems = useMemo(() => {
    if (!trimmedQuery) return totalItems;
    return HELP_SECTIONS.reduce(
      (acc, s) => acc + s.items.filter((item) => scoreItem(item, trimmedQuery) > 0).length,
      0
    );
  }, [trimmedQuery, totalItems]);

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-8 px-4 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Help Guide</h1>
            <p className="text-sm text-muted-foreground">
              Usage guide and data entry standards for the Secure Running Sheet Log
            </p>
          </div>
        </div>

        {/* Important notice */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Items marked with a{" "}
            <AlertTriangle className="w-3 h-3 text-amber-400 inline mx-0.5" />
            amber indicator describe <strong className="text-foreground">data entry standards</strong> — how information must be entered for the system's automated functions (statements, witness lists, intelligence, shortcuts, calendar) to work correctly.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search help topics…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {trimmedQuery && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {matchedItems} result{matchedItems !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Sections */}
        {visibleSections.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No help topics found for "{trimmedQuery}". Try different keywords.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleSections.map((section) => (
              <HelpSectionBlock
                key={section.id}
                section={section}
                query={trimmedQuery}
                defaultOpen={false}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
