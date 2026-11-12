import { PageHeader } from '../components/ui';
import { RunsTable } from '../components/RunsTable';
import { useProjectsQuery } from '../store/api';

export function RunsPage() {
  const { data } = useProjectsQuery();
  return (
    <>
      <PageHeader title="Execution history" subtitle="Every test run across your projects. Select two runs to compare them." />
      <RunsTable projects={data?.projects ?? []} />
    </>
  );
}
