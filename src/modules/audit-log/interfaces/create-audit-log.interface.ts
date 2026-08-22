import { AuditAction, AuditResult } from '../enums/audit-action.enum';

/**
 * Input shape for `AuditLogService.create`.
 *
 * `metadata` must be an explicitly-selected, allowlisted set of fields —
 * never the raw request body or a full domain object. See the security
 * notes in `AuditLogService` for what must never appear here (secrets,
 * JWTs, passwords, full payment credentials, raw identity documents).
 */
export interface CreateAuditLogInput {
  /** The authenticated user who performed the action, if known. */
  userId?: string;
  /** One of the centralized `AuditAction` values. */
  action: AuditAction;
  /** The domain entity type affected, e.g. `'Escrow'`, `'Offer'`, `'User'`. */
  resourceType: string;
  /** The specific entity's id, if the action targets a single resource. */
  resourceId?: string;
  /** Whether the operation succeeded or failed. */
  result: AuditResult;
  /** The caller's IP address, if available from the request context. */
  ipAddress?: string;
  /** The caller's User-Agent header, if available. */
  userAgent?: string;
  /** A request correlation id, for tracing a single request across logs. */
  correlationId?: string;
  /**
   * Explicitly-selected, non-sensitive contextual fields only — e.g.
   * `{ transactionHash }`, `{ previousStatus, newStatus }`. Never a raw
   * request body or full entity dump.
   */
  metadata?: Record<string, unknown>;
}
