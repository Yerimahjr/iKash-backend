import { Module } from '@nestjs/common';
import { ChatMessageController } from './chat-message.controller';
import { ChatMessageRepository } from './chat-message.repository';
import { ChatMessageService } from './chat-message.service';
import { AuthModule } from '../auth/auth.module';
import { ChatMessageGateway } from './chat-message.gateway';

@Module({
  imports: [AuthModule],
  controllers: [ChatMessageController],
  providers: [ChatMessageService, ChatMessageRepository, ChatMessageGateway],
  exports: [ChatMessageService],
})
export class ChatMessageModule {}
