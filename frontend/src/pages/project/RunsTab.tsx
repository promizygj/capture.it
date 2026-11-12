import { RunsTable } from '../../components/RunsTable';
import type { ProjectDetail } from '../../types';

export function RunsTab({ project }: { project: ProjectDetail }) {
  return <RunsTable projectId={project.id} />;
}
