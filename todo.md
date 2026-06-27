# Running Sheet App — TODO

## Database Schema
- [x] running_sheets table (id, title, description, createdBy, createdAt, updatedAt)
- [x] sheet_rows table (id, sheetId, rowNumber, time, observation, isLocked, createdAt, updatedAt)
- [x] row_members table (id, rowId, memberName, isLocked, createdAt)
- [x] certifications table (id, rowId, memberId, certifiedBy (userId), certifiedAt, isActive)
- [x] audit_logs table (id, sheetId, rowId, userId, action, details, createdAt)

## Backend API (tRPC Routers)
- [x] runningSheet router: list, get, create, update, delete
- [x] sheetRow router: list, create, update, delete
- [x] rowMember router: add, remove
- [x] certification router: certify, uncertify (certifier/admin only)
- [x] auditLog router: list by sheet, list all
- [x] Role enforcement middleware (observer, certifier, admin)

## Frontend Pages & Components
- [x] DashboardLayout with sidebar (Running Sheets, Audit Log, Admin)
- [x] Running Sheets list page
- [x] Running Sheet detail page with 5-column table
- [x] Row with multi-member support (add/remove members)
- [x] Certification button per member with timestamp display
- [x] Locked row visual distinction (muted, lock icon)
- [x] Uncertify button (certifier/admin only)
- [x] Audit Log page with filterable event table
- [x] Admin page: user role management

## Security & Access Control
- [x] Role-based procedure guards (observer, certifier, admin)
- [x] Locked row edit prevention on backend
- [x] Uncertification restricted to certifier/admin
- [x] Audit trail on every certification, uncertification, edit

## Styling & Polish
- [x] Elegant dark/neutral color palette with refined typography
- [x] Locked row visual distinction (background, lock icon, opacity)
- [x] Smooth animations on certification/lock state changes
- [x] Responsive table with horizontal scroll on mobile
- [x] Empty states, loading skeletons, error handling

## Tests
- [x] 22 vitest tests passing (auth, sheet, row, certification, admin, audit log)

## Export Feature
- [x] Backend tRPC endpoint to return full sheet data (rows + members + certifications) for export
- [x] CSV export: generate and download client-side
- [x] PDF export: open print dialog with a styled HTML document (client-side)
- [x] Export button with dropdown (PDF / CSV) on sheet detail page header

## UI & Export Refinements (Round 2)
- [x] Remove Row Number column from the running sheet table
- [x] PDF export: remove row dividers between members in the same row (stack cleanly)
- [x] PDF export: add column dividers
- [x] Narrow the Certify column width in the running sheet table
- [x] Audit Log: add sheet selector (filter by running sheet name)
- [x] Audit Log: add per-sheet PDF export
- [x] Remove CSV export option (PDF only)

## PDF & Structure Refinements (Round 3)
- [x] PDF export: fix column widths — Time and Member as tight as data, Observation fills remaining space
- [x] PDF export: merge Certify + Certified By/At into one compact column
- [x] Add Operations table to DB schema (id, name, description, createdAt)
- [x] Link runningSheets to operations (operationId FK)
- [x] Backend: operations router (create, list, get, delete)
- [x] Home page: list operations with search, click to enter operation
- [x] Operation detail page: list running sheets for that operation, create new sheet within it
- [x] Update navigation and routes for operation hierarchy
- [x] Update audit log sheet selector to show operation > sheet grouping

## Auth & User Profile Overhaul (Round 4)
- [ ] Add CIN, unit, username, passwordHash fields to users table
- [ ] Add local login endpoint (username + password, bcrypt, JWT session)
- [ ] Replace Manus OAuth login page with local username/password login page
- [ ] Admin: create user with name, CIN, unit, username, password, access level
- [ ] Admin: edit user profile fields
- [ ] Admin: delete user
- [ ] Admin: reset user password
- [ ] Rename "Member" column header to "CIN" in running sheet table
- [ ] Rename "Member" column header to "CIN" in PDF export
- [ ] Certify column shows CIN number of certifying user (not name)
- [ ] CIN shown in audit log entries
