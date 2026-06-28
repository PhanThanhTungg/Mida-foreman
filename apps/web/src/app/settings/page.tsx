import { apiClient } from '@/lib/api-client';
import { SettingsForm } from '@/components/settings/settings-form';

export default async function SettingsPage() {
  const settings = await apiClient.settings.list().catch(() => []);
  return <SettingsForm initialSettings={settings} />;
}
