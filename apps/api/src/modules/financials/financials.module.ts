import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FinancialsService } from './financials.service';
import { FinancialsController } from './financials.controller';

@Module({
  imports: [HttpModule],
  controllers: [FinancialsController],
  providers: [FinancialsService],
})
export class FinancialsModule {}
