'use client';

import { TasksPanel } from './TasksPanel';

export default function AgendaPage() {
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <TasksPanel />
    </div>
  );
}
