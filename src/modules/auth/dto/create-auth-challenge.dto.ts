import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAuthChallengeDto {
  @IsString()
  @IsNotEmpty()
  publicKey!: string;
}
