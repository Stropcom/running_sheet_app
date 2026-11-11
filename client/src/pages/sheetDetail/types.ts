// Types shared by the running sheet screen and the pieces split out of it
// (client/src/pages/sheetDetail/).

export type Member = {
  id: number;
  rowId: number;
  memberName: string;
  sortOrder: number;
  createdAt: Date;
};
export type Certification = {
  id: number;
  rowId: number;
  memberId: number;
  certifiedByUserId: number;
  certifiedByName: string;
  certifiedAt: number;
  isActive: boolean;
};
export type RowAttachment = {
  id: number;
  rowId: number | null;
  url: string;
  mimeType: string;
  caption: string | null;
  uploadedByCIN: string | null;
  createdAt: Date;
  linkedCount?: number;
  linkedCategories?: string[];
  linkedEntities?: Array<{ category: string; label: string }>;
  faceCount?: number | null;
};

export type SheetRow = {
  id: number;
  sheetId: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  dayOffset?: number | null;
  rowDate?: string | null;
  observation: string | null;
  isLocked: boolean;
  createdAt: Date;
  updatedAt: Date;
  members: Member[];
  certifications: Certification[];
  attachments: RowAttachment[];
};

export type ExportRow = {
  id: number;
  rowNumber: number;
  time: string | null;
  timeMinutes: number | null;
  dayOffset?: number | null;
  rowDate?: string | null;
  observation: string | null;
  isLocked: boolean;
  members: { id: number; memberName: string }[];
  certifications: {
    memberId: number;
    certifiedByName: string;
    certifiedAt: number;
    isActive: boolean;
  }[];
  attachments: {
    id: number;
    url: string;
    linkedEntities?: Array<{ category: string; label: string }>;
  }[];
};

export type OperationMeta = {
  name: string;
  promisNumber?: string | null;
  imsNumber?: string | null;
  investigationUnit?: string | null;
  createdAt: Date;
} | null;

export type CinEntry = {
  cin: string;
  hasImages: boolean;
  isTeamLeader?: boolean;
  isAuthor?: boolean;
};
