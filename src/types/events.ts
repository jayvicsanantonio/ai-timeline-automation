/**
 * Event type definitions for the AI News Automation system
 * These types represent events at different stages of the pipeline
 */

import { z } from 'zod';

// ============================================================================
// RAW EVENT (from news sources)
// ============================================================================

/**
 * Raw event data from news sources before processing
 */
export interface RawEvent {
  /** Event title from the source */
  title: string;
  /** When the event occurred */
  date: Date;
  /** Name of the news source */
  source: string;
  /** URL to the original article/announcement */
  url: string;
  /** Full text content or summary */
  content: string;
  /** Additional source-specific metadata */
  metadata?: Record<string, any>;
}

/**
 * Zod schema for RawEvent validation
 */
export const RawEventSchema = z.object({
  title: z.string().min(1).max(500),
  date: z.date(),
  source: z.string().min(1),
  url: z.string().url(),
  content: z.string().min(1),
  metadata: z.record(z.any()).optional(),
});

// ============================================================================
// ANALYZED EVENT (after AI analysis)
// ============================================================================

/**
 * Event categories for classification
 */
export type EventCategory = 'research' | 'product' | 'regulation' | 'industry';

/**
 * Significance scores for multi-dimensional evaluation
 */
export interface SignificanceScores {
  /** How groundbreaking is the technology? (0-10) */
  technologicalBreakthrough: number;
  /** Impact on the AI industry (0-10) */
  industryImpact: number;
  /** Scale of adoption or potential users (0-10) */
  adoptionScale: number;
  /** How novel or unprecedented is this? (0-10) */
  novelty: number;
}

/**
 * Event after AI analysis and scoring
 */
export interface AnalyzedEvent {
  /** Unique identifier (format: YYYY-MM-DD-slug) */
  id: string;
  /** Event title (refined) */
  title: string;
  /** ISO 8601 date string */
  date: string;
  /** Comprehensive description */
  description: string;
  /** Event category */
  category: EventCategory;
  /** List of source URLs */
  sources: string[];
  /** Overall impact score (0-10) */
  impactScore: number;
  /** Detailed significance breakdown */
  significance: SignificanceScores;
}

/**
 * Zod schema for SignificanceScores
 */
export const SignificanceScoresSchema = z.object({
  technologicalBreakthrough: z.number().min(0).max(10),
  industryImpact: z.number().min(0).max(10),
  adoptionScale: z.number().min(0).max(10),
  novelty: z.number().min(0).max(10),
});

/**
 * Zod schema for AnalyzedEvent validation
 */
export const AnalyzedEventSchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  date: z.string().datetime(),
  description: z.string().min(1).max(1000),
  category: z.enum(['research', 'product', 'regulation', 'industry']),
  sources: z.array(z.string().url()),
  impactScore: z.number().min(0).max(10),
  significance: SignificanceScoresSchema,
});

// ============================================================================
// TIMELINE ENTRY (for timeline repository)
// ============================================================================

/**
 * Final format for timeline-events.json entries
 * Note: Uses snake_case for JSON compatibility
 */
export interface TimelineEntry {
  /** Unique identifier (format: YYYY-MM-DD-slug) */
  id: string;
  /** ISO 8601 date string */
  date: string;
  /** Event title */
  title: string;
  /** Event description */
  description: string;
  /** Event category */
  category: string;
  /** List of source URLs */
  sources: string[];
  /** Overall impact score (0-10) */
  impact_score: number;
}

/**
 * Zod schema for TimelineEntry validation
 */
export const TimelineEntrySchema = z.object({
  id: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/),
  date: z.string().datetime(),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  category: z.enum(['research', 'product', 'regulation', 'industry']),
  sources: z.array(z.string().url()),
  impact_score: z.number().min(0).max(10),
});

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an object is a RawEvent
 */
export function isRawEvent(obj: unknown): obj is RawEvent {
  return RawEventSchema.safeParse(obj).success;
}

/**
 * Type guard to check if an object is an AnalyzedEvent
 */
export function isAnalyzedEvent(obj: unknown): obj is AnalyzedEvent {
  return AnalyzedEventSchema.safeParse(obj).success;
}

/**
 * Type guard to check if an object is a TimelineEntry
 */
export function isTimelineEntry(obj: unknown): obj is TimelineEntry {
  return TimelineEntrySchema.safeParse(obj).success;
}

// ============================================================================
// CONVERSION UTILITIES
// ============================================================================

/**
 * Convert AnalyzedEvent to TimelineEntry format
 */
export function toTimelineEntry(event: AnalyzedEvent): TimelineEntry {
  return {
    id: event.id,
    date: event.date,
    title: event.title,
    description: event.description,
    category: event.category,
    sources: event.sources,
    impact_score: event.impactScore,
  };
}

/**
 * Generate a unique event ID from date and title
 */
export function generateEventId(date: Date, title: string): string {
  const dateStr = date.toISOString().split('T')[0];
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${dateStr}-${slug}`;
}
