import { Module } from '@nestjs/common';
import { FloatController } from './float.controller';
import { FloatService } from './float.service';

@Module({ providers: [FloatService], controllers: [FloatController], exports: [FloatService] })
export class FloatModule {}
