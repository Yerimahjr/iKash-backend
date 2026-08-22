import { Test, TestingModule } from '@nestjs/testing';
import {
  INVALID_ACCOUNT_IDENTIFIER_MESSAGE,
  PaymentMethodValidatorService,
  PaymentProviderInfo,
} from './payment-method-validator.service';
import { AppException, ErrorCode } from '../../common/errors';

describe('PaymentMethodValidatorService', () => {
  let service: PaymentMethodValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaymentMethodValidatorService],
    }).compile();

    service = module.get(PaymentMethodValidatorService);
  });

  const provider = (
    partial: Partial<PaymentProviderInfo> = {},
  ): PaymentProviderInfo => ({ type: 'PLATFORM', countryCode: '', ...partial });

  describe('PayPal (PLATFORM + GLOBAL e-mail)', () => {
    const paypal = provider({ type: 'PLATFORM', countryCode: '' });

    it('treats an empty country code as global', () => {
      expect(service.isValid(paypal, 'user@example.com')).toBe(true);
    });

    it('accepts valid e-mails', () => {
      for (const email of [
        'user@example.com',
        'first.last+tag@sub.domain.co',
        'pix-user_42@paypal.com',
      ]) {
        expect(service.isValid(paypal, email)).toBe(true);
      }
    });

    it('rejects invalid e-mails', () => {
      for (const email of [
        'not-an-email',
        'user@',
        '@domain.com',
        'user name@example.com',
        '',
      ]) {
        expect(service.isValid(paypal, email)).toBe(false);
      }
    });
  });

  describe('SINPE Móvil (MOBILE + Costa Rica)', () => {
    const sinpe = provider({ type: 'MOBILE', countryCode: 'CR' });

    it('accepts valid Costa Rican mobile numbers', () => {
      for (const phone of [
        '61234567',
        '7123-4567',
        '8000 1234',
        '+506 6123 4567',
        '50661234567',
      ]) {
        expect(service.isValid(sinpe, phone)).toBe(true);
      }
    });

    it('rejects invalid Costa Rican phone numbers', () => {
      for (const phone of [
        '12345678',
        '51234567',
        '6123456',
        '612345678',
        '+507 6123 4567',
        '',
      ]) {
        expect(service.isValid(sinpe, phone)).toBe(false);
      }
    });
  });

  describe('Pago Móvil (MOBILE + Venezuela)', () => {
    const pagoMovil = provider({ type: 'MOBILE', countryCode: 'VE' });

    it('accepts valid Venezuelan mobile numbers', () => {
      for (const phone of [
        '04121234567',
        '0414-1234567',
        '0416 123 4567',
        '+58 412-1234567',
        '+58 4241234567',
      ]) {
        expect(service.isValid(pagoMovil, phone)).toBe(true);
      }
    });

    it('rejects invalid Venezuelan phone numbers', () => {
      for (const phone of [
        '4121234567',
        '04111234567',
        '04171234567',
        '02121234567',
        '12345678901',
        '',
      ]) {
        expect(service.isValid(pagoMovil, phone)).toBe(false);
      }
    });
  });

  describe('Banks (BANK + country-agnostic engine)', () => {
    const bankOfAmerica = provider({ type: 'BANK', countryCode: 'US' });

    it('accepts national account numbers', () => {
      for (const account of [
        '12345678',
        '000-000000-000',
        '0000 0000 0000 0000',
        'DE89370400440532013000',
      ]) {
        expect(service.isValid(bankOfAmerica, account)).toBe(true);
      }
    });

    it('rejects identifiers that do not look like a bank account', () => {
      for (const account of [
        '',
        '   ',
        'abc',
        '12',
        'not a bank account',
        '!@#$%^',
      ]) {
        expect(service.isValid(bankOfAmerica, account)).toBe(false);
      }
    });
  });

  describe('Panama banks (BANK + PA accept IBAN or account number)', () => {
    const panama = provider({ type: 'BANK', countryCode: 'PA' });

    it('accepts a valid IBAN', () => {
      expect(service.isValid(panama, 'PA25BNKO000000000000001234')).toBe(true);
      expect(service.isValid(panama, 'DE89 3704 0044 0532 0130 00')).toBe(true);
    });

    it('accepts a national account number', () => {
      expect(service.isValid(panama, '000-000000-000')).toBe(true);
    });

    it('rejects invalid identifiers', () => {
      for (const account of ['', 'abc', '!@#$%^']) {
        expect(service.isValid(panama, account)).toBe(false);
      }
    });
  });

  describe('Costa Rican banks (BANK + CR)', () => {
    const crBank = provider({ type: 'BANK', countryCode: 'CR' });

    it('accepts the national 000-000000-000 format', () => {
      expect(service.isValid(crBank, '000-000000-000')).toBe(true);
      expect(service.isValid(crBank, '123 456789 000')).toBe(true);
    });

    it('accepts bare numeric accounts (e.g. BAC Credomatic)', () => {
      expect(service.isValid(crBank, '0000000000')).toBe(true);
      expect(service.isValid(crBank, '12345678901234567')).toBe(true);
    });

    it('rejects values that do not match a Costa Rican account', () => {
      for (const account of ['', '123', '000-000000-00', 'not-an-account']) {
        expect(service.isValid(crBank, account)).toBe(false);
      }
    });
  });

  describe('Pix (PLATFORM + Brazil)', () => {
    const pix = provider({ type: 'PLATFORM', countryCode: 'BR' });

    it('accepts a valid CPF', () => {
      expect(service.isValid(pix, '529.982.247-25')).toBe(true);
      expect(service.isValid(pix, '52998224725')).toBe(true);
    });

    it('rejects an invalid CPF', () => {
      expect(service.isValid(pix, '111.111.111-11')).toBe(false);
      expect(service.isValid(pix, '123.456.789-10')).toBe(false);
    });

    it('accepts an e-mail key', () => {
      expect(service.isValid(pix, 'user@example.com')).toBe(true);
    });

    it('accepts a Brazilian phone key', () => {
      expect(service.isValid(pix, '+55 11 91234 5678')).toBe(true);
      expect(service.isValid(pix, '11912345678')).toBe(true);
    });

    it('rejects an invalid phone key', () => {
      expect(service.isValid(pix, '1191234567')).toBe(false);
    });

    it('accepts a random (UUID) key', () => {
      expect(service.isValid(pix, '123e4567-e89b-12d3-a456-426614174000')).toBe(
        true,
      );
    });

    it('rejects unsupported Pix keys', () => {
      expect(service.isValid(pix, 'not-a-pix-key')).toBe(false);
      expect(service.isValid(pix, '')).toBe(false);
    });
  });

  describe('default rule for unknown scenarios', () => {
    it('accepts any non-empty identifier for an unknown type', () => {
      expect(
        service.isValid(
          provider({ type: 'CRYPTO', countryCode: 'XX' }),
          'anything-at-all',
        ),
      ).toBe(true);
    });

    it('rejects empty identifiers for an unknown type', () => {
      const unknown = provider({ type: 'CRYPTO', countryCode: 'XX' });
      expect(service.isValid(unknown, '')).toBe(false);
      expect(service.isValid(unknown, '   ')).toBe(false);
    });

    it('uses the default rule when no country matches a registered type', () => {
      const mobile = provider({ type: 'MOBILE', countryCode: 'MX' });
      expect(service.isValid(mobile, 'anything-at-all')).toBe(true);
    });

    it('uses the default rule when the provider has no type', () => {
      expect(service.isValid({ countryCode: 'CR' }, 'anything-at-all')).toBe(
        true,
      );
    });
  });

  describe('registration and lookup precedence', () => {
    it('registers a rule for a specific country', () => {
      service.registerValidator(
        { type: 'CUSTOM', countryCode: 'US' },
        (id) => id === 'us',
      );

      expect(
        service.isValid(provider({ type: 'CUSTOM', countryCode: 'US' }), 'us'),
      ).toBe(true);
      expect(
        service.isValid(
          provider({ type: 'CUSTOM', countryCode: 'US' }),
          'other',
        ),
      ).toBe(false);
    });

    it('falls back to a type-only rule when the country is not registered', () => {
      service.registerValidator(
        { type: 'CUSTOM', countryCode: '' },
        (id) => id === 'global',
      );

      expect(
        service.isValid(
          provider({ type: 'CUSTOM', countryCode: 'XX' }),
          'global',
        ),
      ).toBe(true);
      expect(
        service.isValid(
          provider({ type: 'CUSTOM', countryCode: 'XX' }),
          'other',
        ),
      ).toBe(false);
    });

    it('treats an empty country code as GLOBAL', () => {
      service.registerValidator(
        { type: 'CUSTOM', countryCode: '' },
        (id) => id === 'global',
      );

      expect(
        service.isValid(
          provider({ type: 'CUSTOM', countryCode: '' }),
          'global',
        ),
      ).toBe(true);
    });

    it('prefers the code-specific rule over the country rule', () => {
      service.registerValidator(
        { type: 'CUSTOM', countryCode: 'MX' },
        (id) => id === 'generic',
      );
      service.registerValidator(
        { type: 'CUSTOM', countryCode: 'MX', code: 'BBVA_MX' },
        (id) => id === 'bbva',
      );

      const bbva = provider({
        type: 'CUSTOM',
        countryCode: 'MX',
        code: 'BBVA_MX',
      });
      expect(service.isValid(bbva, 'bbva')).toBe(true);
      expect(service.isValid(bbva, 'generic')).toBe(false);

      const generic = provider({ type: 'CUSTOM', countryCode: 'MX' });
      expect(service.isValid(generic, 'generic')).toBe(true);
    });

    it('normalizes type, country and code to uppercase', () => {
      service.registerValidator(
        { type: 'custom', countryCode: 'mx', code: 'bbva_mx' },
        (id) => id === 'ok',
      );

      expect(
        service.isValid(
          provider({ type: 'CUSTOM', countryCode: 'MX', code: 'BBVA_MX' }),
          'ok',
        ),
      ).toBe(true);
    });

    it('lets new providers register a rule without modifying existing logic', () => {
      service.registerValidator(
        { type: 'CUSTOM', countryCode: 'US' },
        (id) => id === 'secret',
      );

      expect(
        service.isValid(
          provider({ type: 'CUSTOM', countryCode: 'US' }),
          'secret',
        ),
      ).toBe(true);
      expect(
        service.isValid(
          provider({ type: 'CUSTOM', countryCode: 'US' }),
          'other',
        ),
      ).toBe(false);
    });
  });

  describe('validate', () => {
    it('returns true for a valid identifier', () => {
      expect(
        service.validate(
          provider({ type: 'PLATFORM', countryCode: '' }),
          'user@example.com',
        ),
      ).toBe(true);
    });

    it('throws a 400 INVALID_ACCOUNT_IDENTIFIER for an invalid identifier', () => {
      try {
        service.validate(
          provider({ type: 'PLATFORM', countryCode: '' }),
          'not-an-email',
        );
        fail('expected validate to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getStatus()).toBe(400);
        const body = (error as AppException).getResponse() as {
          error: ErrorCode;
          message: string;
        };
        expect(body.error).toBe(ErrorCode.INVALID_ACCOUNT_IDENTIFIER);
        expect(body.message).toBe(INVALID_ACCOUNT_IDENTIFIER_MESSAGE);
      }
    });
  });
});
