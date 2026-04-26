import { IsString, IsOptional, IsDateString, IsIn, IsBoolean, IsInt, Min, Max } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  lead_id?: string;

  @IsOptional() @IsString()
  conversation_id?: string;

  @IsOptional() @IsString()
  cliente_contabil_id?: string;

  @IsOptional() @IsString()
  assigned_user_id?: string;

  @IsOptional() @IsDateString()
  due_at?: string;

  @IsOptional() @IsIn(['FISCAL', 'PESSOAL', 'CONTABIL'])
  setor?: string;

  @IsOptional() @IsBoolean()
  recorrente?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(120)
  recorrencia_meses?: number;
}

export class UpdateTaskDto {
  @IsOptional() @IsString()
  title?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsIn(['A_FAZER', 'EM_PROGRESSO', 'CONCLUIDA', 'CANCELADA'])
  status?: string;

  @IsOptional()
  due_at?: string | null;

  @IsOptional() @IsString()
  assigned_user_id?: string | null;
}
