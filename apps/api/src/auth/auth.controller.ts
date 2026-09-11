import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('signup')
  signup(
    // tsx does not emit parameter metadata; keep DTO validation explicit.
    @Body(
      new ValidationPipe({
        expectedType: SignupDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: SignupDto,
  ) {
    return this.auth.signup(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body(
      new ValidationPipe({
        expectedType: LoginDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    dto: LoginDto,
  ) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getProfile(user.sub);
  }
}
