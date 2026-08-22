<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```
## Audit Logging

The platform maintains a centralized, immutable audit trail for critical
security-relevant actions via `src/modules/audit-log`.

### Usage

Inject `AuditLogService` into any module that performs a critical action and
call `create()` (or `createOrThrow()` for operations where an unaudited
action is unacceptable):

```typescript
await auditLogService.create({
  userId,
  action: AuditAction.ESCROW_RELEASED,
  resourceType: 'Escrow',
  resourceId: escrow.escrowId,
  result: AuditResult.SUCCESS,
  ipAddress,
  userAgent,
  metadata: { transactionHash },
});
```

`create()` never throws — a failed audit write is logged via `Logger.error`
(including the action name and correlation id) and swallowed, so a broken
audit sink alone cannot fail an otherwise successful operation. Use
`createOrThrow()` at call sites where a missing audit record is unacceptable
(the caller is then expected to abort/roll back on failure).

### Action names

All action names are centralized in `AuditAction`
(`src/modules/audit-log/enums/audit-action.enum.ts`) — auth, payment
methods, offers, orders, escrow, disputes, KYC, and admin actions. Add new
actions there rather than using free-form strings, so audit queries stay
reliable.

### Currently integrated flows

| Flow | Actions | Location |
|---|---|---|
| Auth | `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILURE` | `src/modules/auth` |
| KYC | `KYC_STATUS_UPDATED` | `src/modules/kyc` |
| Escrow | `ESCROW_CREATED`, `ESCROW_FUNDED`, `ESCROW_RELEASED` | `src/modules/escrow` |
| Payment methods | `PAYMENT_METHOD_CREATED/UPDATED/DELETED` | `src/modules/payment-methods` |
| Offers | `OFFER_CREATED/UPDATED/CANCELLED` | `src/modules/offer` |
| Orders | `ORDER_CREATED/CANCELLED/EXPIRED` | `src/modules/order` |

### Known gaps (no corresponding code path yet)

The following `AuditAction` values are defined and ready to use, but this
codebase has no existing flow to hook them into yet:

- `ESCROW_REFUNDED` — no refund entrypoint currently exists; `EscrowService`
  only has `open`/`initialize`/`fund`/`release`/`syncTransaction`, and
  `syncTransaction`'s `EscrowAction` enum has no `REFUND` case.
- `DISPUTE_OPENED` / `DISPUTE_RESOLVED` — there is no `dispute` module in
  this codebase yet.
- `ADMIN_ACTION_EXECUTED` — there is no admin module or admin-gated
  entrypoint in this codebase yet.

When those flows are built, wire `AuditLogService` into them the same way
as the flows listed above.

### Sensitive data

`metadata` must be an explicitly-selected allowlist of fields — never a raw
request body or full entity dump. Never pass wallet private keys, JWTs,
webhook secrets, passwords, full bank account details, or raw identity
documents into any `AuditLogService` call.

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
