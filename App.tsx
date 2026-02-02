import React, { useState, useEffect, useCallback, Suspense, lazy, useMemo, useRef } from 'react';
import { HashRouter } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import BottomNav from './components/BottomNav';
import { ViewState, ScheduledDay, ClientObject, PriceItem, User, DocItem, adaptScheduledDay } from './types';
import { usersApi, objectsApi, pricesApi, scheduleApi, docsApi, getTelegramUserName, checkApiHealth, clearApiCache } from './services/api';
import { Loader2 } from 'lucide-react';

// Lazy load heavy components for faster initial load
const ScheduleView = lazy(() => import('./components/ScheduleView'));
const WorkReport = lazy(() => import('./components/WorkReport'));
const KnowledgeBase = lazy(() => import('./components/KnowledgeBase'));
const AdminView = lazy(() => import('./components/AdminView'));

// Loading fallback component
const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center p-8">
    <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
  </div>
);

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  
  // Loading & Error states
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track which data has been loaded (for lazy loading)
  const [dataLoaded, setDataLoaded] = useState({
    schedule: false,
    objects: false,
    prices: false,
    docs: false,
    users: false,
  });
  
  // App State
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [schedule, setSchedule] = useState<ScheduledDay[]>([]);
  const [objects, setObjects] = useState<ClientObject[]>([]);
  const [generalDocs, setGeneralDocs] = useState<DocItem[]>([]);
  const [priceList, setPriceList] = useState<PriceItem[]>([]);

  // Load schedule data (critical - needed for Dashboard)
  const loadSchedule = useCallback(async () => {
    if (dataLoaded.schedule) return;
    try {
      const scheduleData = await scheduleApi.getAll();
      setSchedule(scheduleData.map(adaptScheduledDay));
      setDataLoaded(prev => ({ ...prev, schedule: true }));
    } catch (err) {
      console.error('Error loading schedule:', err);
    }
  }, [dataLoaded.schedule]);

  // Load objects data (lazy - only when needed)
  const loadObjects = useCallback(async (force = false) => {
    if (dataLoaded.objects && !force) return;
    try {
      const objectsData = await objectsApi.getAll();
      setObjects(objectsData);
      setDataLoaded(prev => ({ ...prev, objects: true }));
    } catch (err) {
      console.error('Error loading objects:', err);
    }
  }, [dataLoaded.objects]);

  // Load prices data (lazy - only when needed)
  const loadPrices = useCallback(async (force = false) => {
    if (dataLoaded.prices && !force) return;
    try {
      const pricesData = await pricesApi.getAll();
      setPriceList(pricesData);
      setDataLoaded(prev => ({ ...prev, prices: true }));
    } catch (err) {
      console.error('Error loading prices:', err);
    }
  }, [dataLoaded.prices]);

  // Load docs data (lazy - only when needed)
  const loadDocs = useCallback(async (force = false) => {
    if (dataLoaded.docs && !force) return;
    try {
      const docsData = await docsApi.getGeneral();
      setGeneralDocs(docsData);
      setDataLoaded(prev => ({ ...prev, docs: true }));
    } catch (err) {
      console.error('Error loading docs:', err);
    }
  }, [dataLoaded.docs]);

  // Load users data (lazy - only for admin)
  const loadUsers = useCallback(async (force = false) => {
    if (dataLoaded.users && !force) return;
    try {
      const usersData = await usersApi.getAllUsers();
      setUsers(usersData);
      setDataLoaded(prev => ({ ...prev, users: true }));
    } catch (err) {
      console.log('Could not load users list (might not be admin)');
    }
  }, [dataLoaded.users]);

  // Initialize app - load only critical data first
  useEffect(() => {
    const initApp = async () => {
      setIsLoading(true);
      setError(null);
      
      // Check API health with timeout (non-blocking)
      checkApiHealth().catch(() => {
        console.warn('Backend health check failed');
      });
      
      // Check Telegram WebApp data
      const tg = (window as any).Telegram?.WebApp;
      // #region agent log
      fetch('/api/debug/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'G',location:'App.tsx:initApp',message:'telegram_webapp_state',data:{hasTelegram:!!tg,hasInitData:!!tg?.initData,hasInitDataUnsafeUser:!!tg?.initDataUnsafe?.user,initDataLen:tg?.initData?.length || 0},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (tg) {
        tg.ready();
        tg.expand();
        
        const tgUser = tg.initDataUnsafe?.user;
        if (tgUser && tgUser.id) {
          // Try to get existing user
          let user = await usersApi.getCurrentUser();
          // #region agent log
          fetch('/api/debug/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'G',location:'App.tsx:initApp',message:'get_current_user_result',data:{hasUser:!!user,userId:user?.id || null,telegramId:user?.telegramId || null},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          
          if (!user) {
            // Create new user if not exists
            try {
              const name = getTelegramUserName();
              user = await usersApi.createUser(tgUser.id, name);
              // #region agent log
              fetch('/api/debug/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'G',location:'App.tsx:initApp',message:'create_user_success',data:{userId:user?.id || null,telegramId:user?.telegramId || null},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
            } catch (err: any) {
              // User might already exist (race condition)
              if (err.message?.includes('already exists')) {
                user = await usersApi.getCurrentUser();
              }
            }
          }
          
          if (user) {
            setCurrentUser(user);
            // #region agent log
            fetch('/api/debug/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'G',location:'App.tsx:initApp',message:'set_current_user',data:{userId:user.id,telegramId:user.telegramId || null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
          }
        }
      } else {
        // Development mode without Telegram
        console.warn('Telegram WebApp not available, running in dev mode');
        const devUser: User = {
          id: 1,
          telegramId: 123456789,
          name: 'Dev User',
          role: 'admin'
        };
        setCurrentUser(devUser);
      }
      
      // Load only critical data - schedule (for dashboard)
      try {
        const scheduleData = await scheduleApi.getAll();
        setSchedule(scheduleData.map(adaptScheduledDay));
        setDataLoaded(prev => ({ ...prev, schedule: true }));
      } catch (err) {
        console.error('Error loading schedule:', err);
      }
      
      setIsLoading(false);
    };
    
    initApp();
  }, []);

  useEffect(() => {
    if (!isLoading && !currentUser) {
      // #region agent log
      fetch('/api/debug/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'G',location:'App.tsx:auth_screen',message:'current_user_missing_after_init',data:{hasError:!!error},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
  }, [isLoading, currentUser, error]);

  // Load data when view changes (lazy loading)
  useEffect(() => {
    const loadViewData = async () => {
      switch (currentView) {
        case 'schedule':
          await loadObjects();
          break;
        case 'report':
          await Promise.all([loadObjects(), loadPrices()]);
          break;
        case 'docs':
          await Promise.all([loadObjects(), loadDocs()]);
          break;
        case 'admin':
          await Promise.all([loadObjects(), loadPrices(), loadDocs(), loadUsers()]);
          break;
      }
    };
    
    loadViewData();
  }, [currentView, loadObjects, loadPrices, loadDocs, loadUsers]);

  // === Refresh functions with force reload (fallback) ===
  const refreshSchedule = useCallback(async () => {
    try {
      const scheduleData = await scheduleApi.getAll();
      setSchedule(scheduleData.map(adaptScheduledDay));
    } catch (err) {
      console.error('Error refreshing schedule:', err);
    }
  }, []);

  const refreshObjects = useCallback(async () => {
    await loadObjects(true);
  }, [loadObjects]);

  const refreshPrices = useCallback(async () => {
    await loadPrices(true);
  }, [loadPrices]);

  const refreshGeneralDocs = useCallback(async () => {
    await loadDocs(true);
  }, [loadDocs]);

  const refreshUsers = useCallback(async () => {
    await loadUsers(true);
  }, [loadUsers]);

  const refreshOnResume = useCallback(async () => {
    clearApiCache();
    let user = currentUser;
    if (!user) {
      user = await usersApi.getCurrentUser();
      if (user) {
        setCurrentUser(user);
      }
    }
    if (!user) return;
    await refreshSchedule();
    const refreshTasks: Promise<void>[] = [];
    if (dataLoaded.objects) refreshTasks.push(loadObjects(true));
    if (dataLoaded.prices) refreshTasks.push(loadPrices(true));
    if (dataLoaded.docs) refreshTasks.push(loadDocs(true));
    if (dataLoaded.users) refreshTasks.push(loadUsers(true));
    if (refreshTasks.length > 0) {
      await Promise.all(refreshTasks);
    }
  }, [currentUser, dataLoaded, loadDocs, loadObjects, loadPrices, loadUsers, refreshSchedule]);

  // === Real-time Polling for Schedule Updates ===
  // Polls schedule data every 10 seconds to show status changes in real-time
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingPausedRef = useRef(false);
  
  const pollScheduleData = useCallback(async () => {
    // Skip polling if paused (tab hidden) or still loading initial data
    if (isPollingPausedRef.current || isLoading) return;
    
    try {
      const scheduleData = await scheduleApi.getAll();
      setSchedule(scheduleData.map(adaptScheduledDay));
    } catch (err) {
      // Silently log errors - don't interrupt polling on network issues
      console.debug('Polling schedule update failed:', err);
    }
  }, [isLoading]);

  useEffect(() => {
    // Don't start polling until initial load is complete
    if (isLoading || !currentUser) return;

    const POLLING_INTERVAL = 10000; // 10 seconds

    // Start polling
    pollingIntervalRef.current = setInterval(pollScheduleData, POLLING_INTERVAL);

    // Handle tab visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Pause polling when tab is hidden
        isPollingPausedRef.current = true;
      } else {
        // Resume polling and immediately fetch fresh data when tab becomes visible
        isPollingPausedRef.current = false;
        pollScheduleData();
        refreshOnResume();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshOnResume);

    // Cleanup on unmount
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshOnResume);
    };
  }, [isLoading, currentUser, pollScheduleData, refreshOnResume]);

  // === Incremental Update Functions ===
  // These update the local state directly without full reload
  
  // Update a single schedule item
  const updateScheduleItem = useCallback((updatedItem: ScheduledDay) => {
    const adapted = adaptScheduledDay(updatedItem);
    setSchedule(prev => {
      const index = prev.findIndex(s => s.id === adapted.id);
      if (index >= 0) {
        const newSchedule = [...prev];
        newSchedule[index] = adapted;
        return newSchedule;
      }
      return [...prev, adapted];
    });
  }, []);

  // Add a new object to state
  const addObject = useCallback((newObject: ClientObject) => {
    setObjects(prev => [...prev, newObject]);
  }, []);

  // Update an existing object in state
  const updateObject = useCallback((updatedObject: ClientObject) => {
    setObjects(prev => prev.map(obj => 
      obj.id === updatedObject.id ? updatedObject : obj
    ));
  }, []);

  // Remove an object from state
  const removeObject = useCallback((objectId: string) => {
    setObjects(prev => prev.filter(obj => obj.id !== objectId));
  }, []);

  // Add a new price item
  const addPrice = useCallback((newPrice: PriceItem) => {
    setPriceList(prev => [...prev, newPrice]);
  }, []);

  // Update an existing price item
  const updatePrice = useCallback((updatedPrice: PriceItem) => {
    setPriceList(prev => prev.map(price => 
      price.id === updatedPrice.id ? updatedPrice : price
    ));
  }, []);

  // Remove a price item
  const removePrice = useCallback((priceId: string) => {
    setPriceList(prev => prev.filter(price => price.id !== priceId));
  }, []);

  // Add a new doc
  const addDoc = useCallback((newDoc: DocItem) => {
    setGeneralDocs(prev => [...prev, newDoc]);
  }, []);

  // Remove a doc
  const removeDoc = useCallback((docId: string) => {
    setGeneralDocs(prev => prev.filter(doc => doc.id !== docId));
  }, []);

  // Filter schedule for the current logged-in user (memoized)
  const mySchedule = useMemo(() => {
    return currentUser 
      ? schedule.filter(s => s.userId === currentUser.id)
      : [];
  }, [currentUser, schedule]);

  // Loading screen
  if (isLoading) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-brand-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500 mb-2">Загрузка...</p>
          <p className="text-xs text-gray-400">Проверка подключения к серверу</p>
        </div>
      </div>
    );
  }

  // Error screen
  if (error) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Ошибка</h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-brand-600 text-white rounded-xl font-medium"
          >
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  // Not authenticated screen
  if (!currentUser) {
    // #region agent log
    const tgDebug = (window as any).Telegram?.WebApp;
    fetch('/api/debug/log',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'debug-session',runId:'pre-fix',hypothesisId:'H',location:'App.tsx:render',message:'auth_required_screen_shown',data:{isLoading,hasError:!!error,hasTelegram:!!tgDebug,hasInitData:!!tgDebug?.initData,hasInitDataUnsafeUser:!!tgDebug?.initDataUnsafe?.user},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return (
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔒</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Требуется авторизация</h2>
          <p className="text-gray-500">Откройте приложение через Telegram бота</p>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard 
          schedule={mySchedule} 
          fullSchedule={schedule}
          onNavigate={setCurrentView} 
          currentUser={currentUser} 
        />;
      case 'schedule':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <ScheduleView 
              userId={currentUser.id}
              fullSchedule={schedule} 
              onScheduleUpdate={refreshSchedule}
              objects={objects} 
            />
          </Suspense>
        );
      case 'report':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <WorkReport 
              objects={objects} 
              priceList={priceList}
              currentUser={currentUser}
              schedule={mySchedule}
              onWorkComplete={refreshSchedule}
              onUpdateScheduleItem={updateScheduleItem}
              onObjectsUpdate={refreshObjects}
              onPricesUpdate={refreshPrices}
            />
          </Suspense>
        );
      case 'docs':
        return (
          <Suspense fallback={<LoadingFallback />}>
            <KnowledgeBase 
              objects={objects} 
              generalDocs={generalDocs}
              isAdmin={currentUser.role === 'admin'}
              onDocsUpdate={refreshGeneralDocs}
              onObjectsUpdate={refreshObjects}
            />
          </Suspense>
        );
      case 'admin':
        // Protected route
        if (currentUser.role !== 'admin') {
           setCurrentView('dashboard');
           return <Dashboard schedule={mySchedule} fullSchedule={schedule} onNavigate={setCurrentView} currentUser={currentUser} />;
        }
        return (
          <Suspense fallback={<LoadingFallback />}>
            <AdminView 
              objects={objects} 
              onObjectsUpdate={refreshObjects}
              onAddObject={addObject}
              onUpdateObject={updateObject}
              onRemoveObject={removeObject}
              priceList={priceList} 
              onPricesUpdate={refreshPrices}
              onAddPrice={addPrice}
              onUpdatePrice={updatePrice}
              onRemovePrice={removePrice}
              users={users}
              onUsersUpdate={refreshUsers}
              schedule={schedule}
              onScheduleUpdate={refreshSchedule}
              onUpdateScheduleItem={updateScheduleItem}
              generalDocs={generalDocs}
              onDocsUpdate={refreshGeneralDocs}
              onAddDoc={addDoc}
              onRemoveDoc={removeDoc}
            />
          </Suspense>
        );
      default:
        return <Dashboard schedule={mySchedule} fullSchedule={schedule} onNavigate={setCurrentView} currentUser={currentUser} />;
    }
  };

  return (
    <HashRouter>
      <div className="max-w-md mx-auto min-h-screen bg-gray-50 shadow-2xl relative">
        <div className="h-full">
          {renderView()}
        </div>
        
        {currentView !== 'admin' && (
          <BottomNav currentView={currentView} onNavigate={setCurrentView} />
        )}
        
        {currentView === 'admin' && (
           <button 
              onClick={() => setCurrentView('dashboard')}
              className="fixed bottom-6 right-6 bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg text-sm font-semibold hover:bg-gray-700 transition-colors z-50"
           >
              Выйти из админки
           </button>
        )}
      </div>
    </HashRouter>
  );
};

export default App;
