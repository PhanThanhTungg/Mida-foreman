export type SettingKey =
  | 'jira_base_url'
  | 'jira_email'
  | 'jira_api_token'
  | 'github_token'
  | 'poll_interval_ms';

export interface Setting {
  key: string;
  value: string;
}
