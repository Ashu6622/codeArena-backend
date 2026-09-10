import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'codearena-api',
      timestamp: new Date().toISOString(),
    };
  }
}
