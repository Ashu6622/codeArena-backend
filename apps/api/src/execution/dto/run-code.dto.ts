import { Transform } from 'class-transformer';
import { Language } from '@prisma/client';
import { IsEnum, IsString, Length, Matches } from 'class-validator';

export class RunCodeDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(3, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  problemSlug!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsEnum(Language)
  language!: Language;

  @IsString()
  @Length(1, 20000)
  code!: string;
}
