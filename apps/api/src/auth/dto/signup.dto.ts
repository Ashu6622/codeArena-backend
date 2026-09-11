import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

export class SignupDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(15, 128)
  password!: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  name?: string;
}
