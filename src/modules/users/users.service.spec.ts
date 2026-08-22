import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { FileStorageService } from '../file-storage/file-storage.service';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { PaymentMethodValidatorService } from '../payment-methods/payment-method-validator.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    update: jest.Mock;
    findById: jest.Mock;
  };
  let mockFileStorageService: {
    uploadFile: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      update: jest.fn(),
      findById: jest.fn(),
    };

    mockFileStorageService = {
      uploadFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repo },
        { provide: PrismaService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: FileStorageService, useValue: mockFileStorageService },
        { provide: PaymentMethodValidatorService, useValue: {} },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('updates the user when the authenticated user owns the resource', async () => {
    const updatedUser = { userId: 'user-1', alias: 'new-alias' };
    repo.findById.mockResolvedValue({ userId: 'user-1', alias: 'new-alias' });
    repo.update.mockResolvedValue(updatedUser);

    await expect(
      service.update('user-1', { alias: 'new-alias' }, 'user-1'),
    ).resolves.toEqual(updatedUser);

    expect(repo.update).toHaveBeenCalledWith('user-1', { alias: 'new-alias' });
  });

  it('sets kycUpdatedAt only after ownership is validated', async () => {
    repo.update.mockResolvedValue({ userId: 'user-1', kycStatus: 'approved' });

    await service.update('user-1', { kycStatus: 'approved' }, 'user-1');

    const calls = repo.update.mock.calls as [[string, Record<string, unknown>]];

    expect(calls[0][0]).toBe('user-1');
    expect(calls[0][1].kycStatus).toBe('approved');
    expect(calls[0][1].kycUpdatedAt).toBeInstanceOf(Date);
  });

  it('rejects attempts to update another user resource', async () => {
    await expect(
      service.update('user-2', { alias: 'taken' }, 'user-1'),
    ).rejects.toThrow();

    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects update attempts without an authenticated user id', async () => {
    await expect(
      service.update('user-1', { alias: 'new-alias' }),
    ).rejects.toThrow();

    expect(repo.update).not.toHaveBeenCalled();
  });

  describe('uploadProfilePicture', () => {
    it('should upload file and update user profileImageUrl when MOCK_PROFILE_UPLOAD is false', async () => {
      process.env.MOCK_PROFILE_UPLOAD = 'false';
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 100,
        buffer: Buffer.from('data'),
      };

      const mockStoredFile = {
        key: 'path/to/test.jpg',
        url: 'http://gcs.local/path/to/test.jpg',
      };
      mockFileStorageService.uploadFile = jest
        .fn()
        .mockResolvedValue(mockStoredFile);

      const mockUser = { userId: 'user-1', alias: 'test' };
      repo.findById = jest.fn().mockResolvedValue(mockUser);
      repo.update = jest.fn().mockResolvedValue({
        ...mockUser,
        profileImageUrl: mockStoredFile.url,
      });

      const result = await service.uploadProfilePicture('user-1', mockFile);

      expect(repo.findById).toHaveBeenCalledWith('user-1');
      expect(mockFileStorageService.uploadFile).toHaveBeenCalledWith(mockFile);
      expect(repo.update).toHaveBeenCalledWith('user-1', {
        profileImageUrl: mockStoredFile.url,
      });
      expect(result.profileImageUrl).toBe(mockStoredFile.url);
    });

    it('should throw an error if user is not found', async () => {
      process.env.MOCK_PROFILE_UPLOAD = 'false';
      repo.findById = jest.fn().mockResolvedValue(null);
      mockFileStorageService.uploadFile = jest.fn();

      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 100,
        buffer: Buffer.from('data'),
      };

      await expect(
        service.uploadProfilePicture('non-existent-id', mockFile),
      ).rejects.toThrow();
      expect(mockFileStorageService.uploadFile).not.toHaveBeenCalled();
    });

    it('should return mock response without hitting DB when MOCK_PROFILE_UPLOAD is true', async () => {
      process.env.MOCK_PROFILE_UPLOAD = 'true';
      const mockFile = {
        originalname: 'test.jpg',
        mimetype: 'image/jpeg',
        size: 100,
        buffer: Buffer.from('data'),
      };

      const mockStoredFile = {
        key: 'mock-path',
        url: 'http://mock-url.local/mock-path',
      };
      mockFileStorageService.uploadFile = jest
        .fn()
        .mockResolvedValue(mockStoredFile);
      repo.update = jest.fn();

      const result = await service.uploadProfilePicture('user-1', mockFile);

      expect(mockFileStorageService.uploadFile).toHaveBeenCalledWith(mockFile);
      expect(repo.update).not.toHaveBeenCalled();
      expect(result.profileImageUrl).toBe(mockStoredFile.url);
    });
  });
});
