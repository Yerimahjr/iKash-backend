import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AppException, ErrorCode } from '../../common/errors';
import { kyc_status } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction, AuditResult } from '../audit-log/enums/audit-action.enum';

export interface VerifyWebhookSignatureOptions {
  signatureV2?: string;
  signatureV1?: string;
  signatureSimple?: string;
  timestamp?: string;
  rawBody?: Buffer;
  payload?: Record<string, unknown>;
}

interface DiditWebhookPayload {
  vendor_data?: string;
  status?: string;
  verification_session?: { vendor_data?: string; status?: string };
  session?: { vendor_data?: string; status?: string };
  data?: { vendor_data?: string; status?: string };
}

interface DiditSessionResponse {
  url: string;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly diditApiUrl =
    process.env.DIDIT_API_URL || 'https://verification.didit.me/v3';
  private readonly diditApiKey = process.env.DIDIT_API_KEY;
  private readonly diditWorkflowId = process.env.DIDIT_WORKFLOW_ID;

  constructor(
    private prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly configService?: ConfigService,
  ) {}

  /**
   * Verifies the authenticity of incoming Didit webhook requests.
   * Throws AppException with appropriate ErrorCode on verification failure.
   */
  verifyWebhookSignature(options: VerifyWebhookSignatureOptions): void {
    const webhookSecret =
      this.configService?.get<string>('DIDIT_WEBHOOK_SECRET') ||
      process.env.DIDIT_WEBHOOK_SECRET;

    if (!webhookSecret) {
      this.logger.error('[WEBHOOK] DIDIT_WEBHOOK_SECRET is not configured');
      throw new AppException(
        ErrorCode.KYC_WEBHOOK_SECRET_MISSING,
        'DIDIT_WEBHOOK_SECRET is not configured',
      );
    }

    if (!options.rawBody) {
      this.logger.error('[WEBHOOK] Missing raw HTTP body');
      throw new AppException(
        ErrorCode.KYC_WEBHOOK_MISSING_BODY,
        'Missing raw HTTP body. Ensure { rawBody: true } is set in main.ts.',
      );
    }

    // Optional timestamp tolerance check (prevent replay attacks if timestamp is present)
    if (options.timestamp) {
      const timestampNum = parseInt(options.timestamp, 10);
      if (!isNaN(timestampNum)) {
        const now = Date.now();
        const timestampMs =
          timestampNum < 1e11 ? timestampNum * 1000 : timestampNum;
        const maxAgeMs = 5 * 60 * 1000; // 5 minutes
        if (Math.abs(now - timestampMs) > maxAgeMs) {
          this.logger.warn(
            `[WEBHOOK] Failed verification attempt: Request timestamp expired or out of range. Timestamp=${options.timestamp}`,
          );
          throw new AppException(
            ErrorCode.KYC_WEBHOOK_INVALID_SIGNATURE,
            'Webhook request expired',
          );
        }
      }
    }

    const sigToVerify = options.signatureV2 || options.signatureV1;
    if (sigToVerify) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(options.rawBody)
        .digest('hex');

      if (!this.timingSafeEqual(sigToVerify.trim(), expectedSignature)) {
        this.logger.warn(
          `[WEBHOOK] Failed verification attempt: Signature mismatch (V1/V2).`,
        );
        throw new AppException(
          ErrorCode.KYC_WEBHOOK_INVALID_SIGNATURE,
          'Invalid webhook signature',
        );
      }
      this.logger.log('[WEBHOOK] Signature verified ✅');
    } else if (options.signatureSimple) {
      const payloadObj = options.payload || {};
      const sessionId = (payloadObj.session_id as string) || '';
      const status = (payloadObj.status as string) || '';
      const webhookType = (payloadObj.webhook_type as string) || '';
      const simplePayload = `:${sessionId}:${status}:${webhookType}`;
      const expectedSimple = crypto
        .createHmac('sha256', webhookSecret)
        .update(simplePayload)
        .digest('hex');

      if (
        !this.timingSafeEqual(options.signatureSimple.trim(), expectedSimple)
      ) {
        this.logger.warn(
          '[WEBHOOK] Failed verification attempt: Simple signature mismatch.',
        );
        throw new AppException(
          ErrorCode.KYC_WEBHOOK_INVALID_SIGNATURE,
          'Invalid webhook signature',
        );
      }
      this.logger.log('[WEBHOOK] Simple signature verified ✅');
    } else {
      this.logger.warn(
        '[WEBHOOK] Failed verification attempt: No signature header found.',
      );
      throw new AppException(
        ErrorCode.KYC_WEBHOOK_INVALID_SIGNATURE,
        'Missing X-Signature header',
      );
    }
  }

  /**
   * Performs a timing-safe string comparison to prevent timing attacks.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  async initializeSession(userId: string): Promise<{ sessionUrl: string }> {
    try {
      if (!this.diditApiKey) {
        throw new AppException(
          ErrorCode.KYC_SESSION_FAILED,
          'DIDIT_API_KEY is not configured',
        );
      }

      if (!this.diditWorkflowId) {
        throw new AppException(
          ErrorCode.KYC_SESSION_FAILED,
          'DIDIT_WORKFLOW_ID is not configured',
        );
      }

      this.logger.log(`Initializing KYC session for user: ${userId}`);

      const response = await fetch(`${this.diditApiUrl}/session/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.diditApiKey,
        },
        body: JSON.stringify({
          vendor_data: userId,
          workflow_id: this.diditWorkflowId,
          callback:
            process.env.KYC_CALLBACK_URL || 'http://localhost:3001/dashboard',
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`Error from Didit API: ${errorData}`);
        throw new AppException(
          ErrorCode.KYC_SESSION_FAILED,
          'Failed to create KYC session with the verification provider.',
        );
      }

      const data: DiditSessionResponse =
        (await response.json()) as DiditSessionResponse;
      return { sessionUrl: data.url };
    } catch (error) {
      // Re-throw AppExceptions directly; wrap anything else
      if (error instanceof AppException) throw error;

      const err = error as Error;
      this.logger.error(`Error initializing KYC session: ${err.message}`);
      throw new AppException(
        ErrorCode.KYC_SESSION_FAILED,
        'Could not initialize KYC session.',
      );
    }
  }

  async processWebhookEvent(payload: DiditWebhookPayload): Promise<void> {
    this.logger.log(`[KYC WEBHOOK] Full payload: ${JSON.stringify(payload)}`);

    const userId: string | undefined =
      payload.vendor_data ??
      payload.verification_session?.vendor_data ??
      payload.session?.vendor_data ??
      payload.data?.vendor_data;

    const rawStatus: string | undefined =
      payload.status ??
      payload.verification_session?.status ??
      payload.session?.status ??
      payload.data?.status;

    this.logger.log(
      `[KYC WEBHOOK] Extracted userId=${userId}, rawStatus=${rawStatus}`,
    );

    if (!userId) {
      this.logger.warn(
        `[KYC WEBHOOK] No vendor_data found in payload keys: ${Object.keys(payload || {}).join(', ')}`,
      );
      return;
    }

    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(userId)) {
      this.logger.warn(
        `[KYC WEBHOOK] Skipping: vendor_data '${userId}' is not a valid UUID`,
      );
      return;
    }

    const statusLower: string =
      rawStatus?.toLowerCase().trim().replace(/ +/g, '_') || '';
    this.logger.log(`[KYC WEBHOOK] Normalized status: '${statusLower}'`);

    let kycStatus: kyc_status = 'pending';
    if (statusLower === 'approved') kycStatus = 'approved';
    else if (statusLower === 'declined' || statusLower === 'rejected')
      kycStatus = 'rejected';
    else if (statusLower === 'review' || statusLower === 'in_review')
      kycStatus = 'in_review';
    else if (statusLower === 'expired') kycStatus = 'expired';
    else if (statusLower === 'kyc_expired') kycStatus = 'kyc_expired';
    else if (statusLower === 'abandoned') kycStatus = 'abandoned';
    else if (statusLower === 'resubmitted') kycStatus = 'resubmitted';
    else if (statusLower === 'not_started') kycStatus = 'not_started';
    else if (statusLower === 'in_progress') kycStatus = 'in_progress';
    else kycStatus = 'pending';

    // Capture the pre-update status so the audit record shows the actual
    // transition (previousStatus -> newStatus), not just the new value.
    const existing = await this.prisma.appUser.findUnique({
      where: { userId },
      select: { kycStatus: true },
    });
    const previousStatus = existing?.kycStatus ?? null;

    try {
      const updatedUser = await this.prisma.appUser.update({
        where: { userId },
        data: { kycStatus, kycUpdatedAt: new Date() },
      });
      this.logger.log(
        `[KYC WEBHOOK] âœ… Updated user ${userId} â†’ kycStatus: ${updatedUser.kycStatus}`,
      );

      await this.auditLogService.createOrThrow({
        userId,
        action: AuditAction.KYC_STATUS_UPDATED,
        resourceType: 'User',
        resourceId: userId,
        result: AuditResult.SUCCESS,
        metadata: { previousStatus, newStatus: updatedUser.kycStatus },
      });
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `[KYC WEBHOOK] âŒ Failed to update user ${userId}: ${err.message}`,
      );

      await this.auditLogService.createOrThrow({
        userId,
        action: AuditAction.KYC_STATUS_UPDATED,
        resourceType: 'User',
        resourceId: userId,
        result: AuditResult.FAILURE,
        metadata: { previousStatus, attemptedStatus: kycStatus },
      });
    }
  }
}
