import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class LeaderboardQueryDto {
  @Transform(({ value }: { value: unknown }) => (value === undefined ? 50 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
