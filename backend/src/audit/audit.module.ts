import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PrismaService } from './prisma.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { ReportController } from './report.controller';
import { StatsService } from './stats.service';

@Global()
@Module({
  providers: [PrismaService, EventsService, StatsService, ReceiptsService],
  controllers: [EventsController, ReportController, ReceiptsController],
  exports: [PrismaService, EventsService, StatsService, ReceiptsService],
})
export class AuditModule {}
