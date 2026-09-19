import { Global, Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { PrismaService } from './prisma.service';
import { ReportController } from './report.controller';
import { StatsService } from './stats.service';

@Global()
@Module({
  providers: [PrismaService, EventsService, StatsService],
  controllers: [EventsController, ReportController],
  exports: [PrismaService, EventsService, StatsService],
})
export class AuditModule {}
