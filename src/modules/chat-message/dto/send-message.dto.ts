import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class OrderRoomDto {
  @IsUUID()
  orderId: string;
}

export class SendMessageDto extends OrderRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  content: string;

  @IsOptional()
  @IsUUID()
  clientMessageId?: string;
}
