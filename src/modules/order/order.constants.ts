import { order_status } from '@prisma/client';

export const ORDER_STATUS = {
  CREATED: 'created' as order_status,
  LOCKED: 'locked' as order_status,
  RELEASED: 'released' as order_status,
  CANCELLED: 'cancelled' as order_status,
  EXPIRED: 'expired' as order_status,
  DISPUTED: 'disputed' as order_status,
} as const;
