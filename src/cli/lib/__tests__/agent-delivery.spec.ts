/**
 * @file Round 4 agent-chat routing tests: follow-up delivery and model flags
 * @description Locks the pure surfaces of the steer/queue delivery split and
 * the model pass-through. The pi follow-up routing table (steer at the next
 * tool-call boundary, queue behind the live turn, plain prompt when idle) is
 * exercised through its pure command builder; the ACP queue drain and the
 * one-shot resume need a live process and stay covered by the runtime's
 * integration behavior. The model assertions pin each adapter's launch flag
 * (claude `--model`, codex `-m`, pi `--model`) and the "no flag when unset"
 * contract; ACP is excluded by design (its agents self-select models).
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/agent-runtime.ts
 * @see src/cli/lib/agent/adapters
 */

import { describe, expect, it } from 'vitest';
import { piFollowUpCommand } from '../agent/agent-runtime';
import { buildArgs as claudeArgs } from '../agent/adapters/claude-code';
import { buildArgs as codexArgs } from '../agent/adapters/codex';
import { buildArgs as piArgs } from '../agent/adapters/pi';

const BASE_CONFIG = {
  harnessId: 'test',
  projectRoot: '/tmp/project',
  prompt: 'PROMPT',
  permissionMode: 'yolo' as const,
};

describe('pi follow-up delivery routing', () => {
  it('steers a busy session at the next tool-call boundary', () => {
    expect(JSON.parse(piFollowUpCommand('hold on', true, 'steer', 'id-1')))
      .toEqual({ type: 'steer', message: 'hold on' });
  });

  it('queues behind a busy session with streamingBehavior followUp', () => {
    expect(JSON.parse(piFollowUpCommand('later', true, 'queue', 'id-1')))
      .toEqual({ type: 'prompt', message: 'later', streamingBehavior: 'followUp' });
  });

  it('prompts an idle session directly, whatever the delivery', () => {
    const deliveries: Array<'steer' | 'queue' | undefined> = ['steer', 'queue', undefined];
    for (const delivery of deliveries) {
      expect(JSON.parse(piFollowUpCommand('go', false, delivery, 'id-1')))
        .toEqual({ id: 'id-1', type: 'prompt', message: 'go' });
    }
  });

  it('keeps the pre-round-4 default for a busy session without a delivery', () => {
    expect(JSON.parse(piFollowUpCommand('follow up', true, undefined, 'id-1')))
      .toEqual({ type: 'prompt', message: 'follow up', streamingBehavior: 'followUp' });
  });
});

describe('model launch flags', () => {
  it('passes the model to claude via --model and omits the flag when unset', () => {
    const withModel = claudeArgs({ ...BASE_CONFIG, model: 'opus', resumeSessionId: 'ses9' }, '/bin/claude');
    expect(withModel).toEqual(expect.arrayContaining(['--model', 'opus']));
    // 📖 The model lands before the resume pair, so a resumed session keeps
    // its requested model too.
    expect(withModel.indexOf('--model')).toBeLessThan(withModel.indexOf('--resume'));
    const withoutModel = claudeArgs(BASE_CONFIG, '/bin/claude');
    expect(withoutModel).not.toContain('--model');
  });

  it('passes the model to codex via -m and omits the flag when unset', () => {
    const withModel = codexArgs({ ...BASE_CONFIG, model: 'gpt-5.1-codex' }, '/bin/codex');
    expect(withModel).toEqual(expect.arrayContaining(['-m', 'gpt-5.1-codex']));
    expect(withModel[withModel.length - 1]).toBe('PROMPT');
    expect(codexArgs(BASE_CONFIG, '/bin/codex')).not.toContain('-m');
  });

  it('passes the model to pi via --model in rpc mode and omits it when unset', () => {
    expect(piArgs({ ...BASE_CONFIG, model: 'provider/model-id' }, '/bin/pi'))
      .toEqual(['/bin/pi', '--mode', 'rpc', '--model', 'provider/model-id']);
    expect(piArgs(BASE_CONFIG, '/bin/pi')).toEqual(['/bin/pi', '--mode', 'rpc']);
  });
});
