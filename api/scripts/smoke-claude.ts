/** Smoke test: prove the Claude Agent SDK (Foundry) generates a valid reading item from the app. */
import 'reflect-metadata';
import { config } from 'dotenv';
config({ path: ['../.env', '.env'] });
import { ClaudeAgentService } from '../src/claude/claude-agent.service';

async function run(): Promise<void> {
  const svc = new ClaudeAgentService();
  console.log('model:', svc.model);
  const item = await svc.generateReadingItem(3, 'a tension in alliance burden-sharing');
  console.log('level:', item.stanagLevel, '| topic:', item.topic);
  console.log('passage words:', item.passage.split(/\s+/).length);
  console.log('question:', item.question);
  console.log('options:', item.options.map((o) => o.label).join(','), '| key:', item.correctLabel);
  console.log('SMOKE OK');
}

run().catch((e) => {
  console.error('SMOKE FAILED:', e);
  process.exitCode = 1;
});
