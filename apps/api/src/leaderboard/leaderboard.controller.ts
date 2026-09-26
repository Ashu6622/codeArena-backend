import { Controller, Get, Inject, Query, ValidationPipe } from '@nestjs/common';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(@Inject(LeaderboardService) private readonly leaderboard: LeaderboardService) {}

  @Get()
  list(
    @Query(
      new ValidationPipe({
        expectedType: LeaderboardQueryDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        validationError: { target: false, value: false },
      }),
    )
    query: LeaderboardQueryDto,
  ) {
    return this.leaderboard.list(query);
  }
}
