'use client';
import { useState } from 'react';
import type { Setting, SettingKey } from '@foreman/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient } from '@/lib/api-client';

const FIELDS: { key: SettingKey; label: string; placeholder: string; type: 'text' | 'password' | 'number' }[] = [
  { key: 'jira_base_url', label: 'Jira Base URL', placeholder: 'https://yourorg.atlassian.net', type: 'text' },
  { key: 'jira_email', label: 'Jira Email', placeholder: 'you@company.com', type: 'text' },
  { key: 'jira_api_token', label: 'Jira API Token', placeholder: '••••••••', type: 'password' },
  { key: 'github_token', label: 'GitHub Token', placeholder: 'ghp_••••••••', type: 'password' },
  { key: 'poll_interval_ms', label: 'Poll Interval (ms)', placeholder: '60000', type: 'number' },
];

export function SettingsForm({ initialSettings }: { initialSettings: Setting[] }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initialSettings.map((s) => [s.key, s.value === '***' ? '' : s.value])),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isConfigured = (key: string) => {
    const initial = initialSettings.find((s) => s.key === key);
    return initial?.value === '***' || (initial?.value !== undefined && initial.value !== '');
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const settings = Object.entries(values)
        .filter(([, v]) => v !== '')
        .map(([key, value]) => ({ key, value }));
      await apiClient.settings.upsert(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-lg space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-slate-300">{f.label}</Label>
            <span className={`text-xs px-1.5 py-0.5 rounded ${isConfigured(f.key) ? 'bg-green-900 text-green-300' : 'bg-slate-800 text-slate-500'}`}>
              {isConfigured(f.key) ? 'Configured' : 'Not set'}
            </span>
          </div>
          <Input
            type={f.type}
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            className="bg-slate-900 border-slate-700"
          />
        </div>
      ))}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
      </Button>
    </form>
  );
}
