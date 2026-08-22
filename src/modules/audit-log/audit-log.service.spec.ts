import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-log.service';
import { AuditLogRepository } from './audit-log.repository';
import { AuditAction, AuditResult } from './enums/audit-action.enum';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repository: { create: jest.Mock };

  beforeEach(async () => {
    repository = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: AuditLogRepository, useValue: repository },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  describe('create', () => {
    it('writes an audit record via the repository', async () => {
      repository.create.mockResolvedValue({ id: 'audit-1' });

      await service.create({
        userId: 'user-1',
        action: AuditAction.OFFER_CREATED,
        resourceType: 'Offer',
        resourceId: 'offer-1',
        result: AuditResult.SUCCESS,
      });

      expect(repository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        action: AuditAction.OFFER_CREATED,
        resourceType: 'Offer',
        resourceId: 'offer-1',
        result: AuditResult.SUCCESS,
      });
    });

    it('never throws when the repository write fails', async () => {
      repository.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.create({
          action: AuditAction.USER_LOGIN_FAILURE,
          resourceType: 'User',
          result: AuditResult.FAILURE,
          correlationId: 'corr-1',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('createOrThrow', () => {
    it('writes an audit record via the repository on success', async () => {
      repository.create.mockResolvedValue({ id: 'audit-2' });

      await service.createOrThrow({
        action: AuditAction.ADMIN_ACTION_EXECUTED,
        resourceType: 'System',
        result: AuditResult.SUCCESS,
      });

      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('re-throws when the repository write fails', async () => {
      const dbError = new Error('db down');
      repository.create.mockRejectedValue(dbError);

      await expect(
        service.createOrThrow({
          action: AuditAction.ADMIN_ACTION_EXECUTED,
          resourceType: 'System',
          result: AuditResult.FAILURE,
        }),
      ).rejects.toThrow('db down');
    });
  });

  describe('findByUser', () => {
    it('delegates to the repository', () => {
      const findByUser = jest.fn().mockReturnValue(Promise.resolve([]));
      (repository as unknown as { findByUser: jest.Mock }).findByUser =
        findByUser;

      void service.findByUser('user-1', 0, 20);

      expect(findByUser).toHaveBeenCalledWith('user-1', 0, 20);
    });
  });
});
