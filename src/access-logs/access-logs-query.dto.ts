import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AccessLogsQueryDto {
  @Type(() => Number)
  @IsInt() @Min(1) @Max(1000000)
  page = 1;

  @IsOptional() @IsString() @MaxLength(100)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  search?: string;

  @IsOptional() @IsDateString({ strict: true })
  from?: string;

  @IsOptional() @IsDateString({ strict: true })
  until?: string;
}
