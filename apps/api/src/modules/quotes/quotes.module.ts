import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { QuotesService } from './quotes.service';
import { QuotesController } from './quotes.controller';
import { QuotesGateway } from './quotes.gateway';
import { PolygonQuotesService } from './providers/polygon-quotes.service';
import { FinnhubQuotesService } from './providers/finnhub-quotes.service';

@Module({
  imports: [HttpModule],
  controllers: [QuotesController],
  providers: [
    QuotesService,
    QuotesGateway,
    PolygonQuotesService,
    FinnhubQuotesService,
  ],
  exports: [QuotesService],
})
export class QuotesModule {}
