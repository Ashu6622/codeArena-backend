import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';

export class UpsertProblemNoteDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(10000)
  content!: string;
}
