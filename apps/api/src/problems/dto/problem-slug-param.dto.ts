import { IsString, Length, Matches } from 'class-validator';

export class ProblemSlugParamDto {
  @IsString()
  @Length(3, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
