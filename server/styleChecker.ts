/**
 * styleChecker.ts — Fully local, rule-based RS writing style checker.
 *
 * No data leaves the server. All checking is done in-process using
 * regex patterns and string matching against the stored style_rules table.
 *
 * Rules are seeded from the uploaded pro forma and can be managed via the
 * admin UI. No AI or external API calls are made.
 */

import { getDb } from "./db.js";
import { styleRules } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

export interface StyleIssue {
  ruleId: number;
  ruleType: string;
  description: string;
  matchedText: string;
  suggestion: string | null;
  startIndex: number;
  endIndex: number;
}

export interface CheckResult {
  observationId: number;
  originalText: string;
  issues: StyleIssue[];
  suggestedText: string;
}

/**
 * Check a single observation text against all active style rules.
 * Returns a list of issues found and a suggested corrected version.
 */
export function checkObservation(
  observationId: number,
  text: string,
  rules: Array<{
    id: number;
    ruleType: string;
    pattern: string;
    description: string;
    suggestion: string | null;
  }>
): CheckResult {
  const issues: StyleIssue[] = [];
  let suggestedText = text;

  for (const rule of rules) {
    try {
      switch (rule.ruleType) {
        case "abbreviation": {
          // pattern = "abbrev|full word" e.g. "veh|vehicle"
          const [abbrev, fullWord] = rule.pattern.split("|");
          if (!abbrev) break;
          // Match whole-word abbreviation (case-insensitive)
          const regex = new RegExp(`\\b${escapeRegex(abbrev)}\\b`, "gi");
          let match: RegExpExecArray | null;
          while ((match = regex.exec(text)) !== null) {
            issues.push({
              ruleId: rule.id,
              ruleType: rule.ruleType,
              description: rule.description,
              matchedText: match[0],
              suggestion: fullWord || rule.suggestion,
              startIndex: match.index,
              endIndex: match.index + match[0].length,
            });
          }
          // Apply to suggested text
          if (fullWord) {
            suggestedText = suggestedText.replace(
              new RegExp(`\\b${escapeRegex(abbrev)}\\b`, "gi"),
              fullWord
            );
          }
          break;
        }

        case "phrase_required": {
          // pattern = "trigger_keyword|required_phrase"
          // If observation contains trigger_keyword but NOT required_phrase, flag it
          const [trigger, required] = rule.pattern.split("|");
          if (!trigger || !required) break;
          const hasTrigger = new RegExp(`\\b${escapeRegex(trigger)}\\b`, "i").test(text);
          const hasRequired = new RegExp(escapeRegex(required), "i").test(text);
          if (hasTrigger && !hasRequired) {
            issues.push({
              ruleId: rule.id,
              ruleType: rule.ruleType,
              description: rule.description,
              matchedText: trigger,
              suggestion: rule.suggestion,
              startIndex: 0,
              endIndex: text.length,
            });
          }
          break;
        }

        case "sentence_start": {
          // pattern = required starting phrase (regex)
          // Flag if observation does NOT start with this pattern
          const startRegex = new RegExp(`^${rule.pattern}`, "i");
          if (!startRegex.test(text.trim())) {
            issues.push({
              ruleId: rule.id,
              ruleType: rule.ruleType,
              description: rule.description,
              matchedText: text.substring(0, 30) + (text.length > 30 ? "…" : ""),
              suggestion: rule.suggestion,
              startIndex: 0,
              endIndex: Math.min(text.length, 30),
            });
          }
          break;
        }

        case "article_missing": {
          // pattern = "noun_phrase" — flag if noun appears without "the/a/an" before it
          const articleRegex = new RegExp(
            `(?<!\\b(?:the|a|an)\\s)\\b${escapeRegex(rule.pattern)}\\b`,
            "gi"
          );
          let match: RegExpExecArray | null;
          while ((match = articleRegex.exec(text)) !== null) {
            issues.push({
              ruleId: rule.id,
              ruleType: rule.ruleType,
              description: rule.description,
              matchedText: match[0],
              suggestion: rule.suggestion || `the ${match[0]}`,
              startIndex: match.index,
              endIndex: match.index + match[0].length,
            });
          }
          if (rule.suggestion) {
            suggestedText = suggestedText.replace(articleRegex, rule.suggestion);
          }
          break;
        }

        case "passive_voice": {
          // pattern = regex for passive voice construction
          const passiveRegex = new RegExp(rule.pattern, "gi");
          let match: RegExpExecArray | null;
          while ((match = passiveRegex.exec(text)) !== null) {
            issues.push({
              ruleId: rule.id,
              ruleType: rule.ruleType,
              description: rule.description,
              matchedText: match[0],
              suggestion: rule.suggestion,
              startIndex: match.index,
              endIndex: match.index + match[0].length,
            });
          }
          break;
        }

        case "tense": {
          // pattern = regex for wrong tense
          const tenseRegex = new RegExp(rule.pattern, "gi");
          let match: RegExpExecArray | null;
          while ((match = tenseRegex.exec(text)) !== null) {
            issues.push({
              ruleId: rule.id,
              ruleType: rule.ruleType,
              description: rule.description,
              matchedText: match[0],
              suggestion: rule.suggestion,
              startIndex: match.index,
              endIndex: match.index + match[0].length,
            });
          }
          break;
        }

        case "punctuation": {
          // pattern = "end" → check observation ends with full stop
          if (rule.pattern === "end_fullstop") {
            const trimmed = text.trim();
            if (trimmed.length > 0 && !trimmed.endsWith(".")) {
              issues.push({
                ruleId: rule.id,
                ruleType: rule.ruleType,
                description: rule.description,
                matchedText: trimmed.slice(-1),
                suggestion: rule.suggestion || `${trimmed}.`,
                startIndex: text.length - 1,
                endIndex: text.length,
              });
              suggestedText = suggestedText.trimEnd() + ".";
            }
          }
          break;
        }

        case "capitalisation": {
          // pattern = regex for suburb/place that should be ALL CAPS
          // Matches a word that looks like a suburb name but is not all-caps
          const capRegex = new RegExp(rule.pattern, "g");
          let match: RegExpExecArray | null;
          while ((match = capRegex.exec(text)) !== null) {
            if (match[0] !== match[0].toUpperCase()) {
              issues.push({
                ruleId: rule.id,
                ruleType: rule.ruleType,
                description: rule.description,
                matchedText: match[0],
                suggestion: match[0].toUpperCase(),
                startIndex: match.index,
                endIndex: match.index + match[0].length,
              });
            }
          }
          break;
        }

        case "custom": {
          // pattern = plain regex
          const customRegex = new RegExp(rule.pattern, "gi");
          let match: RegExpExecArray | null;
          while ((match = customRegex.exec(text)) !== null) {
            issues.push({
              ruleId: rule.id,
              ruleType: rule.ruleType,
              description: rule.description,
              matchedText: match[0],
              suggestion: rule.suggestion,
              startIndex: match.index,
              endIndex: match.index + match[0].length,
            });
          }
          break;
        }
      }
    } catch {
      // Skip malformed rules silently
    }
  }

  return {
    observationId,
    originalText: text,
    issues,
    suggestedText,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fetch all active rules from the DB and check a batch of observations.
 */
export async function checkObservations(
  observations: Array<{ id: number; observation: string }>
): Promise<CheckResult[]> {
  const db = await getDb();
  if (!db) return observations.map((o) => ({ observationId: o.id, originalText: o.observation, issues: [], suggestedText: o.observation }));
  const rules = await db
    .select()
    .from(styleRules)
    .where(eq(styleRules.isActive, true))
    .orderBy(styleRules.sortOrder);

  return observations
    .filter((o) => o.observation && o.observation.trim().length > 0)
    .map((o) => checkObservation(o.id, o.observation, rules));
}

/**
 * Seed the initial rule set extracted from the uploaded pro forma.
 * Only inserts if no rules exist yet.
 */
export async function seedInitialRules(guideId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select({ id: styleRules.id })
    .from(styleRules)
    .where(eq(styleRules.guideId, guideId))
    .limit(1);

  if (existing.length > 0) return; // Already seeded

  const initialRules: Array<{
    guideId: number;
    ruleType: "abbreviation" | "phrase_required" | "sentence_start" | "article_missing" | "passive_voice" | "tense" | "punctuation" | "capitalisation" | "custom";
    pattern: string;
    description: string;
    suggestion: string | null;
    sortOrder: number;
  }> = [
    // ── Abbreviation rules ──────────────────────────────────────────────────
    { guideId, ruleType: "abbreviation", pattern: "veh|vehicle", description: "Use 'vehicle' not 'veh'", suggestion: "vehicle", sortOrder: 10 },
    { guideId, ruleType: "abbreviation", pattern: "rego|registration", description: "Use 'registration' not 'rego'", suggestion: "registration", sortOrder: 11 },
    { guideId, ruleType: "abbreviation", pattern: "obs|observed", description: "Use 'observed' not 'obs'", suggestion: "observed", sortOrder: 12 },
    { guideId, ruleType: "abbreviation", pattern: "cont'd|continued", description: "Use 'continued' not 'cont'd'", suggestion: "continued", sortOrder: 13 },
    { guideId, ruleType: "abbreviation", pattern: "w/|with", description: "Use 'with' not 'w/'", suggestion: "with", sortOrder: 14 },
    { guideId, ruleType: "abbreviation", pattern: "dept|departed", description: "Use 'departed' not 'dept'", suggestion: "departed", sortOrder: 15 },
    { guideId, ruleType: "abbreviation", pattern: "arr|arrived", description: "Use 'arrived' not 'arr'", suggestion: "arrived", sortOrder: 16 },
    { guideId, ruleType: "abbreviation", pattern: "approx|approximately", description: "Use 'approximately' not 'approx'", suggestion: "approximately", sortOrder: 17 },
    { guideId, ruleType: "abbreviation", pattern: "desc|described", description: "Use 'described' not 'desc'", suggestion: "described", sortOrder: 18 },
    { guideId, ruleType: "abbreviation", pattern: "pax|passenger", description: "Use 'passenger' not 'pax'", suggestion: "passenger", sortOrder: 19 },

    // ── Phrase required rules ───────────────────────────────────────────────
    { guideId, ruleType: "phrase_required", pattern: "departed|departed from", description: "Departure observations must use 'departed from [ADDRESS]'", suggestion: "Use 'departed from [ADDRESS]'", sortOrder: 30 },
    { guideId, ruleType: "phrase_required", pattern: "exited Vehicle|exited Vehicle [REGO]", description: "Person exit must use 'exited Vehicle [REGO]'", suggestion: "Use 'exited Vehicle [REGO]'", sortOrder: 31 },
    { guideId, ruleType: "phrase_required", pattern: "entered.*door|via the.*door", description: "Vehicle entry must specify which door: 'via the driver's door' or 'via the passenger door'", suggestion: "Add 'via the driver's door' or 'via the passenger door'", sortOrder: 32 },

    // ── Passive voice rules ─────────────────────────────────────────────────
    { guideId, ruleType: "passive_voice", pattern: "was seen by|were seen by", description: "Avoid passive voice: 'was seen by' — use active voice", suggestion: "Rewrite in active voice", sortOrder: 50 },
    { guideId, ruleType: "passive_voice", pattern: "was observed by|were observed by", description: "Avoid passive voice: 'was observed by' — use active voice", suggestion: "Rewrite in active voice", sortOrder: 51 },
    { guideId, ruleType: "passive_voice", pattern: "was followed by|were followed by", description: "Avoid passive voice: 'was followed by' — use active voice", suggestion: "Rewrite in active voice", sortOrder: 52 },

    // ── Punctuation rules ───────────────────────────────────────────────────
    { guideId, ruleType: "punctuation", pattern: "end_fullstop", description: "Observation must end with a full stop (.)", suggestion: null, sortOrder: 60 },

    // ── Article rules ───────────────────────────────────────────────────────
    { guideId, ruleType: "article_missing", pattern: "subject", description: "Use 'the subject' not 'subject' when referring generically", suggestion: "the subject", sortOrder: 70 },
    { guideId, ruleType: "article_missing", pattern: "driver", description: "Use 'the driver' not 'driver' when referring generically", suggestion: "the driver", sortOrder: 71 },

    // ── Out of sight phrasing ───────────────────────────────────────────────
    { guideId, ruleType: "custom", pattern: "lost sight|went out of sight|lost visual", description: "Use 'continued out of sight' not 'lost sight' or 'went out of sight'", suggestion: "continued out of sight", sortOrder: 80 },

    // ── Description phrasing ───────────────────────────────────────────────
    { guideId, ruleType: "custom", pattern: "was wearing|appeared to be wearing|dressed in", description: "Use 'described as wearing' not 'was wearing' or 'dressed in'", suggestion: "described as wearing", sortOrder: 90 },

    // ── Sole occupant ──────────────────────────────────────────────────────
    { guideId, ruleType: "custom", pattern: "only occupant|only person|lone occupant", description: "Use 'driver and sole occupant' not 'only occupant'", suggestion: "driver and sole occupant", sortOrder: 100 },
  ];

  await db.insert(styleRules).values(initialRules);
}
