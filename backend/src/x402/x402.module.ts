import { Global, Module } from '@nestjs/common';
import { ExactVerifier } from './exact.verifier';
import { FacilitatorController } from './facilitator.controller';
import { MeterFactory } from './meter.factory';

@Global()
@Module({
  providers: [ExactVerifier, MeterFactory],
  controllers: [FacilitatorController],
  exports: [ExactVerifier, MeterFactory],
})
export class X402Module {}
