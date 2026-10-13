import { Module } from '@nestjs/common';
import { ClaudeAgentService } from './claude-agent.service';

@Module({
  providers: [ClaudeAgentService],
  exports: [ClaudeAgentService],
})
/** Provides {@link ClaudeAgentService} (Claude Agent SDK over Foundry) to feature modules. */
export class ClaudeModule {}
