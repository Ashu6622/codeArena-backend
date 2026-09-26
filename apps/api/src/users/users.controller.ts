import { Controller, Get, Inject, Param, ValidationPipe } from '@nestjs/common';
import { UserIdParamDto } from './dto/user-id-param.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Get(':id/public-profile')
  publicProfile(
    @Param(
      new ValidationPipe({
        expectedType: UserIdParamDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    params: UserIdParamDto,
  ) {
    return this.users.publicProfile(params.id);
  }
}
