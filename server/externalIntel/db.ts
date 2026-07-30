import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "../db";
import {
  externalDocuments,
  externalDocumentSections,
  externalEntityMentions,
  externalBackgroundNotes,
  rowAttachments,
} from "../../drizzle/schema";
import type {
  ExtractedTableFields,
  ParsedSections,
  ExtractedEntity,
} from "./index";

export interface CreateExternalDocumentParams {
  attachmentId: number;
  templateType: string;
  fields: ExtractedTableFields;
  sections: ParsedSections;
  entities: ExtractedEntity[];
  ocrText: string;
  uploadedBy: number;
  uploadedByCIN?: string;
}

/** Persists one processed document: the document row, its verbatim sections, and its extracted entity mentions. */
export async function createExternalDocument(
  params: CreateExternalDocumentParams
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [docResult] = await db.insert(externalDocuments).values({
    attachmentId: params.attachmentId,
    templateType: params.templateType,
    extractedFields: JSON.stringify(params.fields),
    ocrText: params.ocrText,
    status: "pending_review",
    uploadedBy: params.uploadedBy,
    uploadedByCIN: params.uploadedByCIN,
  });
  const documentId = docResult.insertId as number;

  const sectionRows: (typeof externalDocumentSections.$inferInsert)[] = [];
  let sortOrder = 0;
  if (params.sections.currentAddress) {
    sectionRows.push({
      documentId,
      heading: "current_address",
      bodyText: params.sections.currentAddress,
      sortOrder: sortOrder++,
    });
  }
  if (params.sections.previousAddress) {
    sectionRows.push({
      documentId,
      heading: "previous_address",
      bodyText: params.sections.previousAddress,
      sortOrder: sortOrder++,
    });
  }
  for (const vehicle of params.sections.vehicles) {
    sectionRows.push({
      documentId,
      heading: "vehicle",
      bodyText: vehicle,
      sortOrder: sortOrder++,
    });
  }
  if (params.sections.summary) {
    sectionRows.push({
      documentId,
      heading: "summary",
      bodyText: params.sections.summary,
      sortOrder: sortOrder++,
    });
  }
  if (params.sections.communications.length) {
    sectionRows.push({
      documentId,
      heading: "communications",
      bodyText: params.sections.communications.join(", "),
      sortOrder: sortOrder++,
    });
  }
  if (sectionRows.length) {
    await db.insert(externalDocumentSections).values(sectionRows);
  }

  if (params.entities.length) {
    const seen = new Set<string>();
    const mentionRows: (typeof externalEntityMentions.$inferInsert)[] = [];
    for (const entity of params.entities) {
      const key = `${entity.type}:${entity.label.toLowerCase().trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mentionRows.push({
        documentId,
        type: entity.type,
        entityKey: key,
        label: entity.label,
        status: "pending_review",
      });
    }
    await db.insert(externalEntityMentions).values(mentionRows);
  }

  return documentId;
}

export async function getExternalDocumentList() {
  const db = await getDb();
  if (!db) return [];
  const docs = await db
    .select({
      id: externalDocuments.id,
      templateType: externalDocuments.templateType,
      extractedFields: externalDocuments.extractedFields,
      status: externalDocuments.status,
      uploadedByCIN: externalDocuments.uploadedByCIN,
      createdAt: externalDocuments.createdAt,
      attachmentUrl: rowAttachments.url,
    })
    .from(externalDocuments)
    .innerJoin(
      rowAttachments,
      eq(externalDocuments.attachmentId, rowAttachments.id)
    )
    .where(isNull(externalDocuments.deletedAt))
    .orderBy(desc(externalDocuments.createdAt));

  return docs.map(d => ({
    ...d,
    fields:
      (JSON.parse(d.extractedFields ?? "{}") as ExtractedTableFields) ?? {},
  }));
}

export async function getExternalDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [doc] = await db
    .select({
      id: externalDocuments.id,
      templateType: externalDocuments.templateType,
      extractedFields: externalDocuments.extractedFields,
      ocrText: externalDocuments.ocrText,
      status: externalDocuments.status,
      reviewedByCIN: externalDocuments.reviewedByCIN,
      reviewedAt: externalDocuments.reviewedAt,
      uploadedByCIN: externalDocuments.uploadedByCIN,
      createdAt: externalDocuments.createdAt,
      attachmentUrl: rowAttachments.url,
    })
    .from(externalDocuments)
    .innerJoin(
      rowAttachments,
      eq(externalDocuments.attachmentId, rowAttachments.id)
    )
    .where(
      and(eq(externalDocuments.id, id), isNull(externalDocuments.deletedAt))
    );
  if (!doc) return null;

  const sections = await db
    .select()
    .from(externalDocumentSections)
    .where(eq(externalDocumentSections.documentId, id))
    .orderBy(externalDocumentSections.sortOrder);

  const mentions = await db
    .select()
    .from(externalEntityMentions)
    .where(eq(externalEntityMentions.documentId, id));

  return {
    ...doc,
    fields:
      (JSON.parse(doc.extractedFields ?? "{}") as ExtractedTableFields) ?? {},
    sections,
    mentions,
  };
}

export async function updateExternalDocumentFields(
  id: number,
  fields: ExtractedTableFields
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(externalDocuments)
    .set({ extractedFields: JSON.stringify(fields) })
    .where(eq(externalDocuments.id, id));
}

export async function resolveExternalEntityMention(
  mentionId: number,
  status: "matched" | "new_entity" | "rejected",
  matchedExistingKey: string | undefined,
  reviewedByCIN: string | undefined
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(externalEntityMentions)
    .set({
      status,
      matchedExistingKey: matchedExistingKey ?? null,
      reviewedByCIN,
      reviewedAt: Date.now(),
    })
    .where(eq(externalEntityMentions.id, mentionId));
}

/**
 * Marks a document reviewed and attaches its verbatim Summary/background
 * text to every resolved (matched or new_entity) person/business mention —
 * "attached to whichever entity the officer resolves for that document"
 * (see external_intel_import_plan.md). Mentions still pending_review or
 * rejected don't get a note.
 */
export async function confirmExternalDocumentReview(
  documentId: number,
  reviewedByCIN: string | undefined
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(externalDocuments)
    .set({
      status: "reviewed",
      reviewedByCIN,
      reviewedAt: Date.now(),
    })
    .where(eq(externalDocuments.id, documentId));

  const [backgroundSection] = await db
    .select()
    .from(externalDocumentSections)
    .where(
      and(
        eq(externalDocumentSections.documentId, documentId),
        eq(externalDocumentSections.heading, "summary")
      )
    );
  if (!backgroundSection) return;

  const resolvedMentions = await db
    .select()
    .from(externalEntityMentions)
    .where(
      and(
        eq(externalEntityMentions.documentId, documentId),
        eq(externalEntityMentions.type, "person")
      )
    );
  const resolvedBusinessMentions = await db
    .select()
    .from(externalEntityMentions)
    .where(
      and(
        eq(externalEntityMentions.documentId, documentId),
        eq(externalEntityMentions.type, "business")
      )
    );

  const targets = [...resolvedMentions, ...resolvedBusinessMentions].filter(
    m => m.status === "matched" || m.status === "new_entity"
  );
  if (!targets.length) return;

  const noteRows = targets.map(m => ({
    entityKey: m.matchedExistingKey ?? m.entityKey,
    documentId,
    sectionId: backgroundSection.id,
    attachedByCIN: reviewedByCIN,
    attachedAt: Date.now(),
  }));
  await db.insert(externalBackgroundNotes).values(noteRows);
}

export async function softDeleteExternalDocument(
  id: number,
  deletedByCIN: string | undefined
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(externalDocuments)
    .set({ deletedAt: Date.now(), deletedByCIN })
    .where(eq(externalDocuments.id, id));
}
