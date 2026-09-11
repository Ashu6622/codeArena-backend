import { Type, Transform } from 'class-transformer';
import { Difficulty, Language } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateProblemLanguageDto {
  @IsEnum(Language)
  language!: Language;

  @IsString()
  @Length(1, 20000)
  starterCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  functionSignature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  executionTemplate?: string;
}

export class CreateTestCaseDto {
  @IsString()
  @MaxLength(65536)
  input!: string;

  @IsString()
  @MaxLength(65536)
  expectedOutput!: string;

  @IsBoolean()
  isSample!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  order?: number;
}

export class CreateProblemDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 120)
  title!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Length(3, 120)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @IsString()
  @Length(20, 50000)
  description!: string;

  @IsEnum(Difficulty)
  difficulty!: Difficulty;

  @IsInt()
  @Min(100)
  @Max(30000)
  timeLimitMs!: number;

  @IsInt()
  @Min(16)
  @Max(1024)
  memoryLimitMb!: number;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CreateProblemLanguageDto)
  languages!: CreateProblemLanguageDto[];

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateTestCaseDto)
  testCases!: CreateTestCaseDto[];
}
