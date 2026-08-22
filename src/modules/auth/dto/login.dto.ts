import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  publicKey!: string;

  @IsString()
  @IsNotEmpty()
  challenge!: string;

  @IsString()
  @IsNotEmpty()
  signature!: string;
}
