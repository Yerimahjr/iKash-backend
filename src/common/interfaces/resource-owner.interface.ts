export enum ResourceType {
  ORDER = 'order',
  ESCROW = 'escrow',
  CHAT_MESSAGE = 'chat_message',
  PAYMENT_METHOD = 'payment_method',
}

export interface ResourceOwnerMetadata {
  type: ResourceType;
  paramKey: string;
}
