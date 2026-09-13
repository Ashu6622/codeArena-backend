import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class SubmissionActivityQueryDto {
  @Transform(({ value }: { value: unknown }) => (value === undefined ? 365 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(366)
  days = 365;
}
