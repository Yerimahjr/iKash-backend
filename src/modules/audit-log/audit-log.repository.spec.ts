import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogRepository } from './audit-log.repository';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditAction, AuditResult } from './enums/audit-action.enum';

describe('AuditLogRepository', () => {
  let repository: AuditLogRepository;
  let prisma: { auditLog: { create: jest.Mock; findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repository = module.get<AuditLogRepository>(AuditLogRepository);
  });

  it('create() maps input fields to the Prisma create call, including metadata', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    await repository.create({
      userId: 'user-1',
      action: AuditAction.ESCROW_RELEASED,
      resourceType: 'Escrow',
      resourceId: 'escrow-1',
      result: AuditResult.SUCCESS,
      ipAddress: '127.0.0.1',
      userAgent: 'jest-test-agent',
      correlationId: 'corr-1',
      metadata: { transactionHash: '0xabc' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: AuditAction.ESCROW_RELEASED,
        resourceType: 'Escrow',
        resourceId: 'escrow-1',
        result: AuditResult.SUCCESS,
        ipAddress: '127.0.0.1',
        userAgent: 'jest-test-agent',
        correlationId: 'corr-1',
        metadata: { transactionHash: '0xabc' },
      },
    });
  });

  it('findByUser() queries by userId, ordered newest-first, with pagination', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);

    await repository.findByUser('user-1', 10, 5);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 5,
    });
  });

  it('findByResource() queries by resourceType and resourceId', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);

    await repository.findByResource('Offer', 'offer-1', 0, 20);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { resourceType: 'Offer', resourceId: 'offer-1' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
  });
});
