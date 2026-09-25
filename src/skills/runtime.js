import { parseSlashInvocation } from './slash.js';
import { SkillContentResolver } from './content-resolver.js';
import { computeSkillContentMetrics } from './metrics.js';
import {
  interactionReady,
  interactionUnknownSkill,
  interactionBlocked,
} from './interaction.js';

/**
 * @typedef {{
 *   matched: boolean,
 *   invocation?: { trigger: string, args: string, skillId: string|null },
 *   skill?: { id: string, trigger: string, name: string, source: string },
 *   modelInstructions?: { content: string },
 *   tools?: string[],
 *   operations?: string[],
 *   capabilities?: string[],
 *   interaction: import('./interaction.js').AgentSamInteraction,
 *   receipt?: {
 *     skillId: string,
 *     source: string,
 *     version: string|null,
 *     checksum: string,
 *     contentSource: string,
 *   },
 * }} SkillInvocationResult
 */

function suggestTriggers(trigger, vocabulary = []) {
  const needle = String(trigger || '').replace(/^\//, '');
  return vocabulary
    .map((t) => ({ t, score: distance(needle, t.replace(/^\//, '')) }))
    .filter((row) => row.score <= 3)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((row) => row.t);
}

function distance(a, b) {
  // cheap Levenshtein for short triggers
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function tipArgs(args) {
  const raw = String(args || '').trim();
  if (!raw) {
    return 'Tip: `/skills release-check` pre-fills a suggested id from your args.';
  }
  return `Using “${raw}” as the suggested skill id.`;
}

export class SkillRuntime {
  /**
   * @param {{
 *     registry: import('./registry.js').SkillRegistry,
 *     contentResolver?: SkillContentResolver,
 *     toolRegistry?: { has?: (id: string) => boolean },
 *     operationRegistry?: { has?: (id: string) => boolean },
 *   }} deps
   */
  constructor(deps) {
    this.registry = deps.registry;
    this.contentResolver = deps.contentResolver || new SkillContentResolver();
    this.toolRegistry = deps.toolRegistry || null;
    this.operationRegistry = deps.operationRegistry || null;
  }

  /**
   * Explicit slash only. Normal prose → matched:false, no lookup.
   * @param {{ input: unknown, context?: Record<string, unknown> }} opts
   * @returns {Promise<SkillInvocationResult>}
   */
  async invoke(opts) {
    const parsed = parseSlashInvocation(opts?.input);
    if (!parsed) {
      return {
        matched: false,
        interaction: interactionReady(),
      };
    }

    if (parsed.trigger === '/skills') {
      const vocab = this.registry.vocabulary();
      if (vocab.length) {
        return {
          matched: true,
          invocation: { trigger: '/skills', args: parsed.args, skillId: null },
          interaction: {
            status: 'complete',
            prompt: {
              kind: 'info',
              title: 'Skills',
              message: ['Installed slash vocabulary:', ...vocab.map((t) => `  ${t}`)].join('\n'),
            },
          },
        };
      }

      // Empty registry: help create the first skill — don't bounce to list again.
      const hintName = String(parsed.args || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
      const exampleId = hintName || 'my-first-skill';
      return {
        matched: true,
        invocation: { trigger: '/skills', args: parsed.args, skillId: null },
        interaction: {
          status: 'needs_input',
          prompt: {
            kind: 'select',
            code: 'NO_SKILLS',
            title: 'No slash skills yet',
            message: [
              'Nothing is installed in this registry yet.',
              '',
              'A skill is a named playbook with an explicit /trigger — create one locally, then invoke it:',
              '',
              `  agentsam skill create ${exampleId}`,
              `  # edit ~/.agentsam/skills/user/${exampleId}/SKILL.md`,
              `  /${exampleId} your args here`,
              '',
              'Or install from a folder that has agentsam.skill.json:',
              '  agentsam skill install ./path/to/skill',
              '',
              tipArgs(parsed.args),
            ]
              .filter(Boolean)
              .join('\n'),
            options: [
              {
                value: `create:${exampleId}`,
                label: `Create /${exampleId}`,
                description: `agentsam skill create ${exampleId}`,
              },
              {
                value: 'install',
                label: 'Install from path or npm',
                description: 'agentsam skill install ./my-skill | @scope/pkg',
              },
              {
                value: 'docs',
                label: 'What is a skill?',
                description: 'Portable playbook: instructions + tools/operations — no workspace/R2 required',
              },
            ],
            actions: [
              { id: `create:${exampleId}`, label: 'Create skill' },
              { id: 'install', label: 'Install skill' },
              { id: 'cancel', label: 'Cancel' },
            ],
          },
        },
      };
    }

    const skill = this.registry.getByTrigger(parsed.trigger);
    if (!skill) {
      const suggestions = suggestTriggers(parsed.trigger, this.registry.vocabulary());
      return {
        matched: true,
        invocation: { trigger: parsed.trigger, args: parsed.args, skillId: null },
        interaction: interactionUnknownSkill(parsed.trigger, suggestions),
      };
    }

    let resolved;
    try {
      resolved = await this.contentResolver.resolve(skill.manifest, {
        baseDir: skill.baseDir,
        packageRoot: skill.baseDir,
      });
    } catch (error) {
      return {
        matched: true,
        invocation: {
          trigger: parsed.trigger,
          args: parsed.args,
          skillId: skill.id,
        },
        skill: {
          id: skill.id,
          trigger: skill.trigger,
          name: skill.name,
          source: skill.source,
        },
        interaction: interactionBlocked({
          code: 'CONTENT_RESOLVE_FAILED',
          title: 'Skill content unavailable',
          message: error?.message || String(error),
          actions: [
            { id: 'inspect', label: 'Inspect skill' },
            { id: 'cancel', label: 'Cancel' },
          ],
        }),
      };
    }

    const metrics = computeSkillContentMetrics(resolved.content);
    const tools = skill.manifest.execution?.tools || [];
    const operations = skill.manifest.execution?.operations || [];
    const capabilities = skill.manifest.execution?.capabilities || [];

    // Missing required tools → blocked interaction (no subagent fallback)
    if (this.toolRegistry?.has) {
      const missing = tools.filter((id) => !this.toolRegistry.has(id));
      if (missing.length) {
        return {
          matched: true,
          invocation: {
            trigger: parsed.trigger,
            args: parsed.args,
            skillId: skill.id,
          },
          skill: {
            id: skill.id,
            trigger: skill.trigger,
            name: skill.name,
            source: skill.source,
          },
          tools,
          operations,
          capabilities,
          interaction: interactionBlocked({
            code: 'TOOL_REQUIRED',
            title: 'Required tools unavailable',
            message: `This skill needs: ${missing.join(', ')}`,
            actions: [
              { id: 'connect', label: 'Review tools' },
              { id: 'cancel', label: 'Cancel' },
            ],
          }),
          receipt: {
            skillId: skill.id,
            source: skill.source,
            version: skill.version || skill.manifest.version || null,
            checksum: metrics.checksum,
            contentSource: resolved.source,
          },
        };
      }
    }

    return {
      matched: true,
      invocation: {
        trigger: parsed.trigger,
        args: parsed.args,
        skillId: skill.id,
      },
      skill: {
        id: skill.id,
        trigger: skill.trigger,
        name: skill.name,
        source: skill.source,
      },
      modelInstructions: {
        content: resolved.content,
      },
      tools,
      operations,
      capabilities,
      interaction: interactionReady(),
      receipt: {
        skillId: skill.id,
        source: skill.source,
        version: skill.version || skill.manifest.version || null,
        checksum: metrics.checksum,
        contentSource: resolved.source,
      },
    };
  }
}
