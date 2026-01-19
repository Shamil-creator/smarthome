export interface User {
  id: number;
  telegramId?: number;
  name: string;
  role: 'admin' | 'installer';
  avatar?: string;
}

export interface PriceItem {
  id: string;
  category: string;
  name: string;
  price: number;
}

export interface WorkLogItem {
  itemId: string;
  quantity: number;
}

export interface ClientObject {
  id: string;
  name: string;
  address: string;
  status: 'active' | 'completed' | 'maintenance';
  docs: DocItem[];
}

export interface DocItem {
  id: string;
  title: string;
  type: 'pdf' | 'img' | 'text' | 'link' | 'docx';
  url?: string;
  content?: string;
}

// Report status flow: draft -> pending_approval -> approved_waiting_payment -> paid_waiting_confirmation -> completed
export type ReportStatus = 'draft' | 'pending_approval' | 'approved_waiting_payment' | 'paid_waiting_confirmation' | 'completed';

export interface ScheduledDay {
  id?: number; // Database ID for API calls
  userId: number; // Linked to specific user
  date: string; // ISO string YYYY-MM-DD
  objectId: string | null;
  completed: boolean; // Keep for backward compatibility with API
  status: ReportStatus; // New status field for detailed workflow
  earnings: number;
  workLog?: WorkLogItem[]; // Detailed breakdown of work done
}

export type ViewState = 'dashboard' | 'schedule' | 'report' | 'docs' | 'admin';
export type UserRole = 'installer' | 'admin';

// Helper function to check if status means money is accrued (counted as earnings)
export const isAccruedStatus = (status: ReportStatus): boolean => {
  return ['approved_waiting_payment', 'paid_waiting_confirmation', 'completed'].includes(status);
};

// Helper to convert old completed boolean to new status
export const completedToStatus = (completed: boolean): ReportStatus => {
  return completed ? 'completed' : 'draft';
};

// Helper to convert new status to completed boolean (for API compatibility)
export const statusToCompleted = (status: ReportStatus): boolean => {
  return status === 'completed';
};

// Adapter to ensure ScheduledDay has both completed and status fields
export const adaptScheduledDay = (day: Partial<ScheduledDay>): ScheduledDay => {
  const hasStatus = day.status !== undefined;
  const hasCompleted = day.completed !== undefined;
  
  return {
    id: day.id, // Preserve database ID for API calls
    userId: day.userId ?? 0,
    date: day.date ?? new Date().toISOString().split('T')[0],
    objectId: day.objectId ?? null,
    earnings: day.earnings ?? 0,
    workLog: day.workLog ?? [],
    // If we have status, use it; otherwise derive from completed
    status: hasStatus ? day.status! : completedToStatus(day.completed ?? false),
    // If we have completed, use it; otherwise derive from status
    completed: hasCompleted ? day.completed! : (hasStatus ? statusToCompleted(day.status!) : false),
  };
};