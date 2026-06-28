// foreman/apps/api/src/triggers/jira-poller.service.ts
import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { AgentType } from '@foreman/types';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { WorkspacesService } from '../repos/repos.service';
import { OrchestratorService } from '../tasks/orchestrator.service';

const DEFAULT_POLL_INTERVAL_MS = 60_000;

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    labels: string[];
  };
}

@Injectable()
export class JiraPollerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(JiraPollerService.name);
  private readonly processedKeys = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly repos: WorkspacesService,
    private readonly orchestrator: OrchestratorService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const token = await this.settings.getRaw('jira_api_token');
    if (!token) {
      this.logger.warn('jira_api_token not configured — Jira poller disabled');
      return;
    }
    this.logger.log('Jira poller starting');
    this.scheduleNextPoll();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNextPoll(): void {
    this.poll()
      .catch((err: unknown) => this.logger.error('Poll cycle error', err instanceof Error ? err.stack : String(err)))
      .finally(async () => {
        const intervalStr = await this.settings.getRaw('poll_interval_ms');
        const interval = intervalStr ? parseInt(intervalStr, 10) : DEFAULT_POLL_INTERVAL_MS;
        this.timer = setTimeout(() => this.scheduleNextPoll(), interval);
      });
  }

  async poll(): Promise<void> {
    const [baseUrl, email, token] = await Promise.all([
      this.settings.getRaw('jira_base_url'),
      this.settings.getRaw('jira_email'),
      this.settings.getRaw('jira_api_token'),
    ]);

    if (!baseUrl || !email || !token) {
      this.logger.warn('Jira credentials incomplete — skipping poll cycle');
      return;
    }

    const jql = 'project in (MAH, MIDA) AND status = "To Do" AND assignee = currentUser()';
    const url = `${baseUrl}/rest/api/3/search/jql`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jql, fields: ['summary', 'labels'], maxResults: 50 }),
    });

    if (!response.ok) {
      this.logger.error(`Jira API returned ${response.status}: ${await response.text()}`);
      return;
    }

    const data = (await response.json()) as { issues: JiraIssue[] };
    const allRepos = await this.repos.findAll();

    for (const issue of data.issues) {
      await this.processIssue(issue, allRepos);
    }
  }

  private async processIssue(
    issue: JiraIssue,
    allRepos: Awaited<ReturnType<WorkspacesService['findAll']>>,
  ): Promise<void> {
    if (this.processedKeys.has(issue.key)) return;

    const existing = await this.prisma.task.findFirst({ where: { issueKey: issue.key } });
    if (existing) {
      this.processedKeys.add(issue.key);
      return;
    }

    const labels = issue.fields.labels;

    const agentLabel = labels.find((l) => l.startsWith('agent:'));
    const agentType = agentLabel?.replace('agent:', '') as AgentType | undefined;
    if (!agentType || !['feature', 'bugfix', 'support', 'improve'].includes(agentType)) {
      this.logger.warn(`Issue ${issue.key} has no valid agent: label — skipping`);
      return;
    }

    const workspaceLabel = labels.find((l) => l.startsWith('workspace:'));
    const workspaceName = workspaceLabel?.replace('workspace:', '');
    const repo = allRepos.find((r) => r.name === workspaceName);
    if (!repo) {
      this.logger.warn(`Issue ${issue.key}: workspace "${workspaceName}" not found — skipping`);
      return;
    }

    const task = await this.prisma.task.create({
      data: {
        issueKey: issue.key,
        title: issue.fields.summary,
        repoId: repo.id,
        agentType,
        status: 'queued',
        maxRounds: 5,
      },
    });

    await this.orchestrator.enqueue(task.id);
    this.processedKeys.add(issue.key);
    this.logger.log(`Enqueued ${issue.key} as ${agentType} task for workspace ${workspaceName}`);
  }
}
