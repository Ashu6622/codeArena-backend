import { IsString, Length, Matches } from 'class-validator';

export class TagSlugParamDto {
  @IsString()
  @Length(2, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}
