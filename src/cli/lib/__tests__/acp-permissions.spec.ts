/**
 * @file ACP adapter tests: permission routing and spawn argv
 * @description Locks the t309/t322 surface of the ACP adapter: recognizing a
 * session/request_permission line on stdout (extractPermissionRequest),
 * building the deferred JSON-RPC reply after the web UI decides
 * (buildPermissionResponse), the edit-like kind classifier the accept-edits
 * mode relies on (isEditLikePermissionKind), the routing verdict
 * acpAdapter.onPermissionRequest hands to the daemon, and the spawn argv
 * buildArgs assembles: protocolArgs first, the per-harness model flag when
 * config.model is set and the harness accepts one (resume is never in argv,
 * t324: it travels as session/load in the handshake). Everything
 * here is pure string/JSON work: no harness process is spawned, every fixture
 * line mirrors the ACP wire format documented in the adapter header.
 *
 * @functions
 *  → (vitest suites)
 *
 * @exports (tests)
 * @see src/cli/lib/agent/adapters/acp.ts
 * @see src/cli/lib/agent/agent-runtime.ts
 */

import { describe, expect, it } from 'vitest';
import {
  acpAdapter,
  buildArgs,
  buildPermissionResponse,
  extractPermissionRequest,
  isEditLikePermissionKind,
  parseLine,
} from '../agent/adapters/acp';
import type { AdapterState, AgentSessionConfig } from '../agent/types';
import type { AgentPermissionRequest } from '../agent/agent-runtime';

// 📖 Minimal ACP permission option shape: only the fields the adapter reads.
// The wire format allows more (name, permissions...), fixtures stay minimal.
interface AcpOption {
  kind: string;
  optionId?: string;
}

/** 📖 Serializes one JSON-RPC request line exactly as an ACP agent would emit
 *  it on stdout, with permission params layered on top of sane defaults. */
function permissionLine(options: {
  id?: number | string;
  omitId?: boolean;
  method?: string;
  params?: Record<string, unknown>;
}): string {
  const message: Record<string, unknown> = {
    jsonrpc: '2.0',
    method: options.method ?? 'session/request_permission',
    params: {
      toolCall: { kind: 'edit', title: 'Write notes.md', toolCallId: 'tc1' },
      options: [{ kind: 'allow_once', optionId: 'allow-once-1' }],
      ...options.params,
    },
  };
  if (!options.omitId) message.id = options.id ?? 7;
  return JSON.stringify(message);
}

/** 📖 Builds the protocol-neutral request object the runtime hands around,
 *  with the same defaults as the wire fixture above. */
function permissionRequest(kind: string, overrides: Partial<AgentPermissionRequest> = {}): AgentPermissionRequest {
  return {
    requestId: 7,
    toolCallId: 'tc1',
    title: `Permission: ${kind}`,
    kind,
    options: [{ kind: 'allow_once', optionId: 'allow-once-1' }],
    ...overrides,
  };
}

/** 📖 AdapterState fixture: only permissionMode/permissionSupport, the fields
 *  onPermissionRequest is allowed to read. */
function acpState(permissionMode: AdapterState['permissionMode']): AdapterState {
  return { permissionMode, permissionSupport: 'advisory' };
}

// 📖 Shape of the JSON-RPC reply buildPermissionResponse produces, narrowed so
// tests can assert on outcome and id without touching raw any-typed parses.
interface PermissionOutcome {
  outcome: 'selected' | 'cancelled';
  optionId?: string;
}
interface PermissionReply {
  jsonrpc: string;
  id: number | string;
  result: { outcome: PermissionOutcome };
}

function parseReply(line: string): PermissionReply {
  return JSON.parse(line) as PermissionReply;
}

describe('extractPermissionRequest', () => {
  it('extracts id, tool call metadata and options from a well-formed line', () => {
    const line = permissionLine({ id: 42 });
    const request = extractPermissionRequest(line);
    expect(request).not.toBeNull();
    expect(request!.requestId).toBe(42);
    expect(request!.toolCallId).toBe('tc1');
    expect(request!.title).toBe('Write notes.md');
    expect(request!.kind).toBe('edit');
    expect(request!.options).toEqual([{ kind: 'allow_once', optionId: 'allow-once-1' }]);
  });

  it('returns null for a line that is not valid JSON', () => {
    // 📖 The substring guard passes but JSON.parse fails: adapters see noise
    // on stdout (banners, logs), the extractor must stay total.
    expect(extractPermissionRequest('session/request_permission but not json {')).toBeNull();
  });

  it('returns null for JSON lines that are not a permission request', () => {
    // 📖 A different method carrying the substring in its params must be
    // rejected by the method check, not just by the substring fast path.
    expect(extractPermissionRequest(permissionLine({ method: 'session/update' }))).toBeNull();
    // 📖 A plain JSON object without any method is rejected by the substring
    // fast path.
    expect(extractPermissionRequest('{"jsonrpc":"2.0","id":1,"result":{}}')).toBeNull();
  });

  it('returns null when the JSON-RPC id is missing', () => {
    // 📖 Without an id there is nothing to correlate the deferred reply with,
    // so the request is unusable for routing.
    expect(extractPermissionRequest(permissionLine({ omitId: true }))).toBeNull();
  });

  it('falls back to kind "unknown" when toolCall.kind is absent', () => {
    const request = extractPermissionRequest(permissionLine({
      params: { toolCall: { title: 'Something' } },
    }));
    expect(request).not.toBeNull();
    expect(request!.kind).toBe('unknown');
  });

  it('falls back to "Permission: <kind>" when the title is empty or blank', () => {
    const emptyTitle = extractPermissionRequest(permissionLine({
      params: { toolCall: { kind: 'edit', title: '' } },
    }));
    expect(emptyTitle!.title).toBe('Permission: edit');

    // 📖 Whitespace-only titles are treated as empty: the UI must never show
    // a blank approval card.
    const blankTitle = extractPermissionRequest(permissionLine({
      params: { toolCall: { kind: 'write', title: '   ' } },
    }));
    expect(blankTitle!.title).toBe('Permission: write');
  });

  it('accepts string ids and defaults options to an empty array', () => {
    const request = extractPermissionRequest(permissionLine({
      id: 'req-9',
      // 📖 A non-array options field exercises the fallback: the extractor
      // must normalize it to [] instead of passing raw agent data through.
      params: { toolCall: { kind: 'read', title: 'Read a.md' }, options: 'nope' },
    }));
    expect(request!.requestId).toBe('req-9');
    expect(request!.options).toEqual([]);
  });
});

describe('buildPermissionResponse', () => {
  it('prefers allow_once over allow_always when approving', () => {
    // 📖 allow_always is listed first on purpose: the pick must follow the
    // kind priority, not the option order.
    const reply = parseReply(buildPermissionResponse({
      requestId: 1,
      options: [
        { kind: 'allow_always', optionId: 'always-2' } satisfies AcpOption,
        { kind: 'allow_once', optionId: 'once-1' } satisfies AcpOption,
      ],
    }, true));
    expect(reply.result.outcome).toEqual({ outcome: 'selected', optionId: 'once-1' });
  });

  it('prefers reject_once over reject_always when rejecting', () => {
    const reply = parseReply(buildPermissionResponse({
      requestId: 1,
      options: [
        { kind: 'reject_always', optionId: 'never-2' } satisfies AcpOption,
        { kind: 'reject_once', optionId: 'no-once-1' } satisfies AcpOption,
      ],
    }, false));
    expect(reply.result.outcome).toEqual({ outcome: 'selected', optionId: 'no-once-1' });
  });

  it('falls back to allow_always when no allow_once is offered', () => {
    const reply = parseReply(buildPermissionResponse({
      requestId: 1,
      options: [
        { kind: 'reject_once', optionId: 'no-1' } satisfies AcpOption,
        { kind: 'allow_always', optionId: 'always-1' } satisfies AcpOption,
      ],
    }, true));
    expect(reply.result.outcome).toEqual({ outcome: 'selected', optionId: 'always-1' });
  });

  it('falls back to reject_always when no reject_once is offered', () => {
    const reply = parseReply(buildPermissionResponse({
      requestId: 1,
      options: [
        { kind: 'allow_once', optionId: 'ok-1' } satisfies AcpOption,
        { kind: 'reject_always', optionId: 'never-1' } satisfies AcpOption,
      ],
    }, false));
    expect(reply.result.outcome).toEqual({ outcome: 'selected', optionId: 'never-1' });
  });

  it('answers cancelled when no usable option is offered', () => {
    // 📖 Options without a string optionId, non-matching kinds and even
    // non-object entries must all be skipped, never crash the builder.
    const reply = parseReply(buildPermissionResponse({
      requestId: 1,
      options: [
        { kind: 'allow_once' } satisfies AcpOption,
        'noise',
        { kind: 'reject_once', optionId: 12 },
      ],
    }, true));
    expect(reply.result.outcome).toEqual({ outcome: 'cancelled' });
  });

  it('round-trips numeric and string request ids', () => {
    const numeric = parseReply(buildPermissionResponse({ requestId: 99, options: [] }, true));
    expect(numeric.id).toBe(99);
    expect(numeric.jsonrpc).toBe('2.0');

    const string = parseReply(buildPermissionResponse({ requestId: 'req-9', options: [] }, false));
    expect(string.id).toBe('req-9');
  });
});

describe('isEditLikePermissionKind', () => {
  it('treats every write-shaped kind as edit-like, in any casing', () => {
    const editLike = ['edit', 'write', 'create', 'patch', 'delete', 'move', 'rename', 'Edit', 'FILE_WRITE', 'file_delete'];
    for (const kind of editLike) {
      expect(isEditLikePermissionKind(kind), `kind "${kind}" should be edit-like`).toBe(true);
    }
  });

  it('keeps read-like and unknown kinds off the routed path', () => {
    const readOnly = ['read', 'unknown', '', 'fetch', 'list', 'search'];
    for (const kind of readOnly) {
      expect(isEditLikePermissionKind(kind), `kind "${kind}" should not be edit-like`).toBe(false);
    }
  });
});

describe('acpAdapter.onPermissionRequest', () => {
  // 📖 onPermissionRequest is optional on the adapter interfaces; the ACP
  // adapter always provides it, hence the non-null assertions below.
  const route = (state: AdapterState, request: AgentPermissionRequest): 'allow' | 'route' =>
    acpAdapter.onPermissionRequest!(state, request);

  it('routes edit-like requests to the UI in accept-edits mode', () => {
    expect(route(acpState('accept-edits'), permissionRequest('edit'))).toBe('route');
    expect(route(acpState('accept-edits'), permissionRequest('FILE_WRITE'))).toBe('route');
  });

  it('auto-allows read-like requests in accept-edits mode', () => {
    // 📖 A session must never block on trivia: only writes surface a card.
    expect(route(acpState('accept-edits'), permissionRequest('read'))).toBe('allow');
    expect(route(acpState('accept-edits'), permissionRequest('unknown'))).toBe('allow');
  });

  it('auto-allows every kind in yolo mode', () => {
    for (const kind of ['edit', 'write', 'read', 'unknown']) {
      expect(route(acpState('yolo'), permissionRequest(kind))).toBe('allow');
    }
  });
});

describe('parseLine auto-answer (yolo path)', () => {
  const config: AgentSessionConfig = {
    harnessId: 'opencode',
    projectRoot: '/tmp/project',
    prompt: 'work',
    permissionMode: 'yolo',
  };
  const state: AdapterState = { ...acpState('yolo'), permissionSupport: 'native' };

  it('falls back to allow_always when the agent only offers a persistent allow', () => {
    // 📖 Mirrors the buildPermissionResponse preference order: an agent that
    // never offers allow_once used to get `cancelled` here and the turn
    // stalled until the user noticed the silent prompt.
    const line = permissionLine({
      id: 12,
      params: { options: [{ kind: 'allow_always', optionId: 'always-1' }] },
    });
    const result = parseLine(line, state, config);
    expect(result.outbound).toHaveLength(1);
    const reply = parseReply(result.outbound![0]);
    expect(reply.id).toBe(12);
    expect(reply.result.outcome).toEqual({ outcome: 'selected', optionId: 'always-1' });
  });

  it('still prefers allow_once when both kinds are offered', () => {
    const line = permissionLine({
      id: 13,
      params: { options: [
        { kind: 'allow_always', optionId: 'always-1' },
        { kind: 'allow_once', optionId: 'once-1' },
      ] },
    });
    const result = parseLine(line, state, config);
    const reply = parseReply(result.outbound![0]);
    expect(reply.result.outcome).toEqual({ outcome: 'selected', optionId: 'once-1' });
  });
});

describe('buildArgs (t322 model flag)', () => {
  /** 📖 Config fixture: harness ids and protocolArgs mirror the detect.ts
   *  catalog entries for the two ACP harnesses. */
  function acpConfig(overrides: Partial<AgentSessionConfig> = {}): AgentSessionConfig {
    return {
      harnessId: 'gemini',
      projectRoot: '/tmp/project',
      prompt: 'work',
      permissionMode: 'yolo',
      protocolArgs: ['--experimental-acp'],
      ...overrides,
    };
  }

  it('passes only the binary and protocolArgs when no model is set', () => {
    // 📖 The unset-model case is the normal case, never an error: the argv
    // must stay byte-identical to the pre-t322 shape.
    expect(buildArgs(acpConfig(), '/bin/gemini')).toEqual(['/bin/gemini', '--experimental-acp']);
    expect(buildArgs(acpConfig({ harnessId: 'opencode', protocolArgs: ['acp'] }), '/bin/opencode'))
      .toEqual(['/bin/opencode', 'acp']);
  });

  it('treats an empty-string model exactly like no model', () => {
    expect(buildArgs(acpConfig({ model: '' }), '/bin/gemini')).toEqual(['/bin/gemini', '--experimental-acp']);
  });

  it('appends the model flag after protocolArgs for a harness that accepts one', () => {
    // 📖 Placement verified against gemini-cli 0.46.0: --model is a global
    // yargs option, so after protocolArgs parses the same as anywhere else.
    expect(buildArgs(acpConfig({ model: 'gemini-2.5-pro' }), '/bin/gemini'))
      .toEqual(['/bin/gemini', '--experimental-acp', '--model', 'gemini-2.5-pro']);
  });

  it('omits the model flag for opencode, whose acp command rejects unknown flags', () => {
    // 📖 Locked reality: opencode 1.18.19 exits 1 on any flag its acp command
    // does not declare, so forwarding --model would kill the session at
    // spawn. The pick stays inert instead.
    const args = buildArgs(acpConfig({ harnessId: 'opencode', protocolArgs: ['acp'], model: 'anthropic/claude-sonnet-4-5' }), '/bin/opencode');
    expect(args).toEqual(['/bin/opencode', 'acp']);
    expect(args).not.toContain('--model');
  });

  it('omits the model flag for unknown ACP harnesses', () => {
    // 📖 Conservative default for the generic ACP long tail: no verified flag,
    // no flag passed, a cosmetic pick never breaks a spawn.
    expect(buildArgs(acpConfig({ harnessId: 'mystery-acp-agent', model: 'some-model' }), '/bin/mystery'))
      .toEqual(['/bin/mystery', '--experimental-acp']);
  });

  it('keeps the model flag but never emits --resume when resuming (t324)', () => {
    // 📖 Resume travels in the handshake (session/load), not in argv: strict
    // parsers like `opencode acp` exit 1 on the unknown flag.
    expect(buildArgs(acpConfig({ model: 'gemini-2.5-flash', resumeSessionId: 'sess-1' }), '/bin/gemini'))
      .toEqual(['/bin/gemini', '--experimental-acp', '--model', 'gemini-2.5-flash']);
    expect(buildArgs(acpConfig({ resumeSessionId: 'sess-1' }), '/bin/gemini')).not.toContain('--resume');
  });
});
