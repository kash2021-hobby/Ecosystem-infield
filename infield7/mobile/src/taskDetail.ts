export type Step = {
  id: string;
  title: string;
  status: string;
  n: number;
  assigneeUserId?: string | null;
  assignee?: string | null;
  lastAt?: string | null;
};

export type TaskUpdate = { id: string; note: string | null; hasPhoto: boolean; createdAt: string; person: string };

export type TaskDetail = {
  id: string;
  title: string;
  status: string;
  dueOn: string | null;
  assignee: string | null;
  site: string | null;
  hasPhoto: boolean;
  workflowName: string | null;
  updates: TaskUpdate[];
  steps: Step[];
};
