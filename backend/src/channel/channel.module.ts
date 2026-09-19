import { Global, Module } from '@nestjs/common';
import { ChainWatcher } from './chain.watcher';
import { ChannelStore } from './channel.cache';
import { ChannelController } from './channel.controller';
import { ChannelVerifier } from './channel.verifier';
import { ClaimService } from './claim.scheduler';
import { FrozenRegistry } from './frozen.registry';
import { StreamSessions } from './stream.sessions';

@Global()
@Module({
  providers: [
    FrozenRegistry,
    ChannelStore,
    ChainWatcher,
    ChannelVerifier,
    ClaimService,
    StreamSessions,
  ],
  controllers: [ChannelController],
  exports: [
    FrozenRegistry,
    ChannelStore,
    ChainWatcher,
    ChannelVerifier,
    ClaimService,
    StreamSessions,
  ],
})
export class ChannelModule {}
