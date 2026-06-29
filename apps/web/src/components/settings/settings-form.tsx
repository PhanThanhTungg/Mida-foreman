'use client';
import { useState } from 'react';
import { CheckCircle2, CircleDashed, Clock3, Github, KeyRound, Link2, Mail, Save, Settings2, ShieldCheck } from 'lucide-react';
import type { Setting, SettingKey } from '@foreman/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const panelClass = 'border border-[#1b222b] bg-[#030303] shadow-[0_18px_60px_rgba(0,0,0,0.45)]';
const labelClass = 'text-[11px] font-semibold uppercase leading-none tracking-normal text-slate-500';
const inputClass =
  'h-10 rounded-md border-[#242d38] bg-black px-3 text-sm text-slate-100 shadow-none placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-[#58a6ff] focus-visible:ring-offset-0';

type FieldMeta = {
  key: SettingKey;
  label: string;
  placeholder: string;
  type: 'text' | 'password' | 'number';
  detail: string;
  section: 'jira' | 'github' | 'runtime';
  icon: typeof Link2;
};

const FIELDS: FieldMeta[] = [
  {
    key: 'jira_base_url',
    label: 'Jira Base URL',
    placeholder: 'https://yourorg.atlassian.net',
    type: 'text',
    detail: 'Atlassian Cloud site',
    section: 'jira',
    icon: Link2,
  },
  {
    key: 'jira_email',
    label: 'Jira Email',
    placeholder: 'you@company.com',
    type: 'text',
    detail: 'Automation account',
    section: 'jira',
    icon: Mail,
  },
  {
    key: 'jira_api_token',
    label: 'Jira API Token',
    placeholder: 'Leave blank to keep existing token',
    type: 'password',
    detail: 'Sensitive credential',
    section: 'jira',
    icon: KeyRound,
  },
  {
    key: 'github_token',
    label: 'GitHub Token',
    placeholder: 'Leave blank to keep existing token',
    type: 'password',
    detail: 'Pull request access',
    section: 'github',
    icon: Github,
  },
  {
    key: 'poll_interval_ms',
    label: 'Poll Interval',
    placeholder: '60000',
    type: 'number',
    detail: 'Milliseconds between Jira checks',
    section: 'runtime',
    icon: Clock3,
  },
];

const SECTIONS: {
  id: FieldMeta['section'];
  title: string;
  description: string;
  icon: typeof Settings2;
}[] = [
  { id: 'jira', title: 'Jira', description: 'Issue intake and polling identity', icon: ShieldCheck },
  { id: 'github', title: 'GitHub', description: 'Branch, commit, push, and pull request access', icon: Github },
  { id: 'runtime', title: 'Runtime', description: 'Worker scheduling cadence', icon: Clock3 },
];

export function SettingsForm({ initialSettings }: { initialSettings: Setting[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initialSettings.map((s) => [s.key, s.value === '***' ? '' : s.value])),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const isConfigured = (key: string) => {
    const initial = initialSettings.find((s) => s.key === key);
    return Boolean((values[key] ?? '').trim()) || initial?.value === '***' || (initial?.value !== undefined && initial.value !== '');
  };

  const configuredCount = FIELDS.filter((f) => isConfigured(f.key)).length;
  const requiredCount = FIELDS.length;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const settings = Object.entries(values)
        .filter(([, v]) => v !== '')
        .map(([key, value]) => ({ key, value }));
      await apiClient.settings.upsert(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="min-h-[calc(100vh-46px)] bg-black px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-[#141a22] pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-md border border-[#243044] bg-[#050505] text-[#58a6ff]">
                <Settings2 className="size-4" />
              </span>
              <div>
                <h1 className="text-[22px] font-semibold leading-tight text-slate-50">Settings</h1>
                <p className="mt-1 text-sm text-slate-500">Integration credentials and worker cadence.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-2 rounded-md border border-[#243044] bg-[#050505] px-3 text-xs font-medium text-slate-300">
              <span className="font-mono text-[#58a6ff]">{configuredCount}/{requiredCount}</span>
              configured
            </span>
            <Button
              type="submit"
              disabled={saving}
              size="sm"
              className="h-8 rounded-md border border-white bg-white px-3 text-xs font-semibold text-black hover:bg-black hover:text-white"
            >
              <Save className="size-3.5" />
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save changes'}
            </Button>
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className={cn(panelClass, 'rounded-lg p-3')}>
            <div className="space-y-1 px-2 pb-3 pt-1">
              <p className="text-[11px] font-semibold uppercase leading-none tracking-normal text-slate-500">Configuration</p>
            </div>
            <nav className="space-y-1">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const sectionFields = FIELDS.filter((f) => f.section === section.id);
                const sectionConfigured = sectionFields.filter((f) => isConfigured(f.key)).length;
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-2 text-sm text-slate-300 transition-colors hover:bg-[#080d13] hover:text-slate-100"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className="size-4 shrink-0 text-slate-500" />
                      <span className="truncate">{section.title}</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-600">
                      {sectionConfigured}/{sectionFields.length}
                    </span>
                  </a>
                );
              })}
            </nav>
            <div className="mt-4 rounded-md border border-[#1b222b] bg-black p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
                <ShieldCheck className="size-4 text-emerald-400" />
                Secret values stay masked after save
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            {SECTIONS.map((section) => {
              const Icon = section.icon;
              const fields = FIELDS.filter((f) => f.section === section.id);
              return (
                <div key={section.id} id={section.id} className={cn(panelClass, 'rounded-lg')}>
                  <div className="flex items-center justify-between border-b border-[#141a22] px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 place-items-center rounded-md border border-[#243044] bg-black text-slate-300">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-slate-100">{section.title}</h2>
                        <p className="mt-1 truncate text-xs text-slate-500">{section.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="divide-y divide-[#111820]">
                    {fields.map((field) => {
                      const Icon = field.icon;
                      const hasMaskedValue = initialSettings.some((s) => s.key === field.key && s.value === '***');
                      const configured = isConfigured(field.key);
                      return (
                        <div key={field.key} className="grid gap-3 px-4 py-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:px-5">
                          <div className="flex gap-3">
                            <span className="mt-0.5 grid size-7 place-items-center rounded-md border border-[#1b222b] bg-black text-slate-500">
                              <Icon className="size-3.5" />
                            </span>
                            <div className="min-w-0 space-y-1">
                              <Label htmlFor={field.key} className={labelClass}>
                                {field.label}
                              </Label>
                              <p className="text-xs text-slate-600">{field.detail}</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                id={field.key}
                                type={field.type}
                                value={values[field.key] ?? ''}
                                onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                                placeholder={hasMaskedValue ? '***********' : field.placeholder}
                                className={inputClass}
                              />
                              <span
                                className={cn(
                                  'hidden h-10 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium sm:inline-flex',
                                  configured
                                    ? 'border-emerald-500/30 bg-emerald-950/40 text-emerald-300'
                                    : 'border-[#243044] bg-black text-slate-500',
                                )}
                              >
                                {configured ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
                                {configured ? 'Configured' : 'Not set'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {(saved || error) && (
              <div
                className={cn(
                  'rounded-md border px-4 py-3 text-sm',
                  saved && 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300',
                  error && 'border-red-500/30 bg-red-950/30 text-red-300',
                )}
              >
                {saved ? 'Settings saved.' : error}
              </div>
            )}
          </section>
        </div>
      </div>
    </form>
  );
}
