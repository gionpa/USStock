import { Module } from '@nestjs/common';
import { SignalsService } from './signals.service';
import { SignalsController } from './signals.controller';
import { SignalsGateway } from './signals.gateway';
import { AnalysisModule } from '../analysis/analysis.module';
import { WatchlistRepository } from './repositories/watchlist.repository';
import { WatchlistPgRepository } from './repositories/watchlist-pg.repository';

@Module({
  imports: [AnalysisModule],
  controllers: [SignalsController],
  providers: [SignalsService, SignalsGateway, WatchlistRepository, WatchlistPgRepository],
  exports: [SignalsService, WatchlistPgRepository],
})
export class SignalsModule {}
