import { IsString, IsOptional, IsEmail, IsArray, IsEnum, MaxLength, MinLength, ArrayMaxSize } from 'class-validator';

/**
 * Estágios válidos do pipeline CRM.
 * Deve permanecer sincronizado com lib/crmStages.ts no frontend.
 */
export enum LeadStage {
  INICIAL = 'INICIAL',
  QUALIFICANDO = 'QUALIFICANDO',
  AGUARDANDO_FORM = 'AGUARDANDO_FORM',
  REUNIAO_AGENDADA = 'REUNIAO_AGENDADA',
  AGUARDANDO_DOCS = 'AGUARDANDO_DOCS',
  AGUARDANDO_PROC = 'AGUARDANDO_PROC',
  FINALIZADO = 'FINALIZADO',
  PERDIDO = 'PERDIDO',
}

export class CreateLeadDto {
  @IsString({ message: 'Nome é obrigatório' })
  @MinLength(2, { message: 'Nome deve ter pelo menos 2 caracteres' })
  @MaxLength(255, { message: 'Nome deve ter no máximo 255 caracteres' })
  name: string;

  @IsString({ message: 'Telefone é obrigatório' })
  @MinLength(10, { message: 'Telefone inválido' })
  @MaxLength(20, { message: 'Telefone inválido' })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @MaxLength(255, { message: 'Email deve ter no máximo 255 caracteres' })
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20, { message: 'Máximo de 20 tags por contato' })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Origem deve ter no máximo 100 caracteres' })
  origin?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Nome deve ter pelo menos 2 caracteres' })
  @MaxLength(255, { message: 'Nome deve ter no máximo 255 caracteres' })
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  @MaxLength(255, { message: 'Email deve ter no máximo 255 caracteres' })
  email?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20, { message: 'Máximo de 20 tags por contato' })
  tags?: string[];
}

export class UpdateStageDto {
  @IsEnum(LeadStage, {
    message: `stage deve ser um dos valores: ${Object.values(LeadStage).join(', ')}`,
  })
  stage: LeadStage;
}
