import { IsString, IsOptional, IsEmail, IsArray } from 'class-validator';

export class CreateLeadDto {
  @IsString({ message: 'Nome é obrigatório' })
  name: string;

  @IsString({ message: 'Telefone é obrigatório' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
