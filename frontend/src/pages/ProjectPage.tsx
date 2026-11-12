import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Globe, Play } from 'lucide-react';
import { useProjectQuery } from '../store/api';
import { PageHeader, PageLoader, Tabs, EmptyState } from '../components/ui';
import { RunDialog } from '../components/RunDialog';
import { SuitesTab } from './project/SuitesTab';
import { RunsTab } from './project/RunsTab';
import { EnvironmentsTab } from './project/EnvironmentsTab';
import { SchedulesTab } from './project/SchedulesTab';
import { InsightsTab } from './project/InsightsTab';
import { SettingsTab } from './project/SettingsTab';

const TABS = ['suites', 'runs', 'insights', 'environments', 'schedules', 'settings'] as const;
type Tab = (typeof TABS)[number];

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'suites') as Tab;
  const { data, isLoading, error } = useProjectQuery(projectId);
  const [runOpen, setRunOpen] = useState(false);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <div className="card"><EmptyState title="Project not found">It may have been deleted, or you don’t have access.</EmptyState></div>;
  const p = data.project;
  const canEdit = p.role !== 'VIEWER';

  return (
    <>
      <PageHeader
        breadcrumb={<Link to="/projects" className="hover:underline">Projects</Link>}
        title={p.name}
        subtitle={<span className="inline-flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" /> <a href={p.baseUrl} target="_blank" rel="noreferrer" className="hover:underline">{p.baseUrl}</a> · your role: {p.role?.toLowerCase()}</span>}
        actions={canEdit && <button className="btn-primary" onClick={() => setRunOpen(true)} disabled={!p.suites.length} data-testid="run-all"><Play className="h-4 w-4" /> Run all suites</button>}
      />
      <Tabs<Tab>
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { key: 'suites', label: `Test suites (${p.suites.length})` },
          { key: 'runs', label: 'Execution history' },
          { key: 'insights', label: 'Insights' },
          { key: 'environments', label: 'Environments' },
          { key: 'schedules', label: 'Schedules' },
          { key: 'settings', label: 'Settings' },
        ]}
      />
      {tab === 'suites' && <SuitesTab project={p} />}
      {tab === 'runs' && <RunsTab project={p} />}
      {tab === 'insights' && <InsightsTab projectId={p.id} />}
      {tab === 'environments' && <EnvironmentsTab project={p} />}
      {tab === 'schedules' && <SchedulesTab project={p} />}
      {tab === 'settings' && <SettingsTab project={p} />}
      {runOpen && <RunDialog open project={p} onClose={() => setRunOpen(false)} />}
    </>
  );
}
