import { useState } from 'react';
import { ProjectsList } from './ProjectsList';
import { ProjectBoard } from './ProjectBoard';
import type { KanbanProject } from './types';

export function KanbanProjectsTab() {
  const [openProject, setOpenProject] = useState<KanbanProject | null>(null);

  if (openProject) {
    return <ProjectBoard project={openProject} onBack={() => setOpenProject(null)} />;
  }
  return <ProjectsList onOpenProject={setOpenProject} />;
}
