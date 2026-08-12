// Canonical default order for RS shortcut chips (target panel + RS Quick Entry).
// Used only as a fallback when a sheet has no saved custom order yet in
// localStorage (`runsheet_field_order_${sheetId}`) — once a user drags to
// reorder, that saved order takes over. Single source of truth shared by
// SheetDetail (main running sheet) and IntelligenceMapping (RS Quick Entry
// popup) so the two can't drift out of sync with each other.
export const RS_CANONICAL_CHIP_ORDER = [
  "SC",
  "HBF",
  ...Array.from({ length: 8 }, (_, i) => [`V${i + 1}F`, `V${i + 1}`]).flat(),
  "TGT",
  "DSO",
  "DR",
  "FP",
  "US",
  "DE",
  "AR",
  "HB",
  "CP",
  "DW",
  "CV",
  "OOS",
  "COOS",
  "PU",
  "PT",
  "RACK",
  "DEP",
  "ARR",
  ...Array.from({ length: 10 }, (_, i) => `#${i + 1}`),
];
