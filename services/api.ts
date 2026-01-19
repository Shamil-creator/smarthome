import { User, ClientObject, PriceItem, ScheduledDay, DocItem, WorkLogItem, ReportStatus } from '../types';

// For local dev with Vite proxy, use relative path
// For production or when API is on different domain, use full URL from env
// When accessed via ngrok, use relative path so Vite proxy works
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// ==================== Simple In-Memory Cache ====================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

// Cache configuration (in milliseconds)
const CACHE_TTL = {
  prices: 5 * 60 * 1000,   // 5 minutes - prices rarely change
  objects: 2 * 60 * 1000,  // 2 minutes - objects change occasionally
  schedule: 0,             // No cache - polling handles real-time updates
  docs: 2 * 60 * 1000,     // 2 minutes - docs change occasionally
  users: 60 * 1000,        // 1 minute - users change occasionally
};

const cache = new Map<string, CacheEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttl: number): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    expiresAt: Date.now() + ttl,
  });
}

function invalidateCache(keyPrefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) {
      cache.delete(key);
    }
  }
}

// Clear all cache
export function clearApiCache(): void {
  cache.clear();
}

// ==================== Telegram Helpers ====================

// Get Telegram WebApp instance
const getTelegramWebApp = (): any => {
  return (window as any).Telegram?.WebApp;
};

// Get Telegram initData for secure authentication
const getTelegramInitData = (): string | null => {
  const tg = getTelegramWebApp();
  // initData contains the signed data string for server validation
  return tg?.initData || null;
};

// Get Telegram User ID from WebApp (fallback for development)
const getTelegramUserId = (): string | null => {
  const tg = getTelegramWebApp();
  if (tg?.initDataUnsafe?.user?.id) {
    return String(tg.initDataUnsafe.user.id);
  }
  return null;
};

// Get Telegram User Name
export const getTelegramUserName = (): string => {
  const tg = getTelegramWebApp();
  if (tg?.initDataUnsafe?.user) {
    const user = tg.initDataUnsafe.user;
    return user.first_name + (user.last_name ? ` ${user.last_name}` : '');
  }
  return 'Пользователь';
};

// ==================== API Request Helper ====================

// Helper for API requests with timeout and optional caching
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  cacheConfig?: { key: string; ttl: number }
): Promise<T> {
  // Check cache for GET requests
  if (cacheConfig && (!options.method || options.method === 'GET')) {
    const cached = getCached<T>(cacheConfig.key);
    if (cached !== null) {
      return cached;
    }
  }
  
  // Get authentication data
  const initData = getTelegramInitData();
  const telegramId = getTelegramUserId();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    // Prefer initData for secure authentication
    ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
    // Fallback to userId for backward compatibility (development only)
    ...(telegramId && !initData ? { 'X-Telegram-User-Id': telegramId } : {}),
    ...options.headers,
  };

  // Add timeout to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error ${response.status}`);
    }

    const data = await response.json();
    
    // Cache the result for GET requests
    if (cacheConfig && (!options.method || options.method === 'GET')) {
      setCache(cacheConfig.key, data, cacheConfig.ttl);
    }
    
    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout - сервер не отвечает');
    }
    if (error.message) {
      throw error;
    }
    throw new Error('Network error - проверьте подключение к серверу');
  }
}

// ==================== Users API ====================

export const usersApi = {
  getCurrentUser: async (): Promise<User | null> => {
    try {
      return await apiRequest<User>('/user/me');
    } catch (error) {
      console.error('Error getting current user:', error);
      return null;
    }
  },

  getAllUsers: async (): Promise<User[]> => {
    return apiRequest<User[]>('/users');
  },

  createUser: async (telegramId: number, name: string, role: string = 'installer'): Promise<User> => {
    return apiRequest<User>('/users', {
      method: 'POST',
      body: JSON.stringify({ telegramId, name, role }),
    });
  },

  updateUser: async (userId: number, data: Partial<User>): Promise<User> => {
    return apiRequest<User>(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  setAdmin: async (telegramId: number): Promise<User> => {
    return apiRequest<User>('/users/set-admin', {
      method: 'POST',
      body: JSON.stringify({ telegramId }),
    });
  },

  checkAdminExists: async (): Promise<boolean> => {
    const result = await apiRequest<{ adminExists: boolean }>('/users/check-admin');
    return result.adminExists;
  },
};

// ==================== Objects API ====================

export const objectsApi = {
  getAll: async (): Promise<ClientObject[]> => {
    return apiRequest<ClientObject[]>('/objects', {}, { key: 'objects:all', ttl: CACHE_TTL.objects });
  },

  getById: async (id: string): Promise<ClientObject> => {
    return apiRequest<ClientObject>(`/objects/${id}`, {}, { key: `objects:${id}`, ttl: CACHE_TTL.objects });
  },

  create: async (data: Omit<ClientObject, 'id' | 'docs'>): Promise<ClientObject> => {
    invalidateCache('objects:');
    return apiRequest<ClientObject>('/objects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<ClientObject>): Promise<ClientObject> => {
    invalidateCache('objects:');
    return apiRequest<ClientObject>(`/objects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    invalidateCache('objects:');
    await apiRequest(`/objects/${id}`, { method: 'DELETE' });
  },
};

// ==================== Prices API ====================

export const pricesApi = {
  getAll: async (): Promise<PriceItem[]> => {
    return apiRequest<PriceItem[]>('/prices', {}, { key: 'prices:all', ttl: CACHE_TTL.prices });
  },

  create: async (data: Omit<PriceItem, 'id'>): Promise<PriceItem> => {
    invalidateCache('prices:');
    return apiRequest<PriceItem>('/prices', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<PriceItem>): Promise<PriceItem> => {
    invalidateCache('prices:');
    return apiRequest<PriceItem>(`/prices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    invalidateCache('prices:');
    await apiRequest(`/prices/${id}`, { method: 'DELETE' });
  },
};

// ==================== Schedule API ====================

export const scheduleApi = {
  getAll: async (): Promise<ScheduledDay[]> => {
    return apiRequest<ScheduledDay[]>('/schedule', {}, { key: 'schedule:all', ttl: CACHE_TTL.schedule });
  },

  getByUser: async (userId: number): Promise<ScheduledDay[]> => {
    return apiRequest<ScheduledDay[]>(`/schedule?userId=${userId}`, {}, { key: `schedule:user:${userId}`, ttl: CACHE_TTL.schedule });
  },

  // Get reports pending approval (admin only)
  getPending: async (): Promise<ScheduledDay[]> => {
    return apiRequest<ScheduledDay[]>('/schedule/pending', {}, { key: 'schedule:pending', ttl: CACHE_TTL.schedule });
  },

  createOrUpdate: async (data: {
    userId: number;
    date: string;
    objectId?: string | null;
    completed?: boolean;
    earnings?: number;
    workLog?: WorkLogItem[];
  }): Promise<ScheduledDay> => {
    invalidateCache('schedule:');
    return apiRequest<ScheduledDay>('/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  completeWork: async (data: {
    userId: number;
    date: string;
    objectId: string;
    workLog: WorkLogItem[];
    status?: ReportStatus;
    completed?: boolean;
  }): Promise<ScheduledDay> => {
    invalidateCache('schedule:');
    return apiRequest<ScheduledDay>('/schedule/complete', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Edit a report (installer can edit draft/pending_approval, admin can edit any)
  editReport: async (scheduleId: number, data: {
    objectId?: string;
    workLog?: WorkLogItem[];
    status?: ReportStatus;
    earnings?: number;
  }): Promise<ScheduledDay> => {
    invalidateCache('schedule:');
    return apiRequest<ScheduledDay>(`/schedule/${scheduleId}/edit`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  // Admin approves a report (pending_approval → approved_waiting_payment)
  approveReport: async (scheduleId: number, data?: {
    workLog?: WorkLogItem[];
    earnings?: number;
  }): Promise<ScheduledDay> => {
    invalidateCache('schedule:');
    return apiRequest<ScheduledDay>(`/schedule/${scheduleId}/approve`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  // Admin rejects a report (pending_approval → draft)
  rejectReport: async (scheduleId: number): Promise<ScheduledDay> => {
    invalidateCache('schedule:');
    return apiRequest<ScheduledDay>(`/schedule/${scheduleId}/reject`, {
      method: 'POST',
    });
  },

  // Admin marks report as paid (approved_waiting_payment → paid_waiting_confirmation)
  markPaid: async (scheduleId: number): Promise<ScheduledDay> => {
    invalidateCache('schedule:');
    return apiRequest<ScheduledDay>(`/schedule/${scheduleId}/mark-paid`, {
      method: 'POST',
    });
  },

  // Installer confirms payment received (paid_waiting_confirmation → completed)
  confirmPayment: async (scheduleId: number): Promise<ScheduledDay> => {
    invalidateCache('schedule:');
    return apiRequest<ScheduledDay>(`/schedule/${scheduleId}/confirm-payment`, {
      method: 'POST',
    });
  },
};

// ==================== Docs API ====================

export const docsApi = {
  getAll: async (): Promise<DocItem[]> => {
    return apiRequest<DocItem[]>('/docs', {}, { key: 'docs:all', ttl: CACHE_TTL.docs });
  },

  getGeneral: async (): Promise<DocItem[]> => {
    return apiRequest<DocItem[]>('/docs/general', {}, { key: 'docs:general', ttl: CACHE_TTL.docs });
  },

  getByObject: async (objectId: string): Promise<DocItem[]> => {
    return apiRequest<DocItem[]>(`/docs?objectId=${objectId}`, {}, { key: `docs:object:${objectId}`, ttl: CACHE_TTL.docs });
  },

  create: async (data: Omit<DocItem, 'id'> & { objectId?: string }): Promise<DocItem> => {
    invalidateCache('docs:');
    return apiRequest<DocItem>('/docs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (id: string, data: Partial<DocItem>): Promise<DocItem> => {
    invalidateCache('docs:');
    return apiRequest<DocItem>(`/docs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete: async (id: string): Promise<void> => {
    invalidateCache('docs:');
    await apiRequest(`/docs/${id}`, { method: 'DELETE' });
  },

  upload: async (file: File, title?: string, objectId?: string): Promise<DocItem> => {
    invalidateCache('docs:');
    const initData = getTelegramInitData();
    const telegramId = getTelegramUserId();
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (objectId) formData.append('objectId', objectId);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 sec timeout for uploads

    try {
      const response = await fetch(`${API_BASE_URL}/docs/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          // Prefer initData for secure authentication
          ...(initData ? { 'X-Telegram-Init-Data': initData } : {}),
          // Fallback for development
          ...(telegramId && !initData ? { 'X-Telegram-User-Id': telegramId } : {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP error ${response.status}`);
      }

      return response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Upload timeout - файл слишком большой или сервер не отвечает');
      }
      throw error;
    }
  },
};

// ==================== Health Check ====================

export const checkApiHealth = async (): Promise<boolean> => {
  try {
    await apiRequest<{ status: string }>('/health');
    return true;
  } catch {
    return false;
  }
};
