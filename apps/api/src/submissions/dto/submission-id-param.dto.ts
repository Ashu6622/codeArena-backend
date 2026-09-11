import { IsUUID } from 'class-validator';

export class SubmissionIdParamDto {
  @IsUUID()
  id!: string;
}
