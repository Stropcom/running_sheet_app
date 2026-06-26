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
