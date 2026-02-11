import React, { useMemo, memo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ScheduledDay, User, ReportStatus, isAccruedStatus } from '../types';
import { UserCog, User as UserIcon, TrendingUp, Briefcase, AlertCircle } from 'lucide-react';

interface DashboardProps {
  schedule: ScheduledDay[];
  fullSchedule: ScheduledDay[];
  onNavigate: (view: any) => void;
  currentUser: User;
  todayStr: string;
}

const Dashboard: React.FC<DashboardProps> = ({ schedule, fullSchedule, onNavigate, currentUser, todayStr }) => {
  const sourceSchedule = currentUser.role === 'admin' ? fullSchedule : schedule;

  const todaySchedule = useMemo(() => schedule.find(s => s.date === todayStr), [schedule, todayStr]);

  // Helper to check if status means accrued (supports both old and new format)
  const isAccrued = (day: ScheduledDay) => {
    // Support new status field
    if (day.status) {
      return isAccruedStatus(day.status);
    }
    // Fallback to old completed field
    return day.completed === true;
  };

  // Calculate Pending Amount (Money that is waiting for approval) - memoized
  const pendingAmount = useMemo(() =>
    sourceSchedule
      .filter(s => s.status === 'pending_approval')
      .reduce((acc, s) => acc + s.earnings, 0),
    [sourceSchedule]
  );

  // Generate last 7 days data - memoized
  const { chartData, weeklyTotal } = useMemo(() => {
    const data: { day: string; amount: number }[] = [];
    let total = 0;

    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStr);
      d.setDate(d.getDate() - i);
      const dayStr = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('ru-RU', { weekday: 'short' });

      const earnings = sourceSchedule
        .filter(s => s.date === dayStr && isAccrued(s))
        .reduce((sum, s) => sum + s.earnings, 0);

      total += earnings;
      data.push({ day: dayName, amount: earnings });
    }

    return { chartData: data, weeklyTotal: total };
  }, [sourceSchedule]);

  // Get display status for today's task - memoized helper
  const getStatusDisplay = useMemo(() => (day: ScheduledDay) => {
    if (day.status) {
      switch (day.status) {
        case 'draft': return { text: 'В работе', className: 'bg-blue-100 text-blue-700' };
        case 'pending_approval': return { text: 'На проверке', className: 'bg-yellow-100 text-yellow-700' };
        case 'approved_waiting_payment': return { text: 'Одобрено', className: 'bg-green-100 text-green-700' };
        case 'paid_waiting_confirmation': return { text: 'Оплачено', className: 'bg-purple-100 text-purple-700' };
        case 'completed': return { text: 'Завершено', className: 'bg-gray-100 text-gray-700' };
      }
    }
    // Fallback for old format
    return day.completed
      ? { text: 'Завершено', className: 'bg-green-100 text-green-700' }
      : { text: 'В работе', className: 'bg-blue-100 text-blue-700' };
  }, []);

  // Memoize bar chart cell colors
  const barFillColor = useMemo(() =>
    currentUser.role === 'admin' ? '#9333ea' : '#0ea5e9',
    [currentUser.role]
  );

  return (
    <div className="p-4 space-y-6 pb-24">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {currentUser.role === 'admin' ? 'Администратор' : `Привет, ${currentUser.name.split(' ')[0]} 👋`}
          </h1>
          <p className="text-gray-500 text-sm">
            {currentUser.role === 'admin' ? 'Управление сервисом' : 'Делаем дома умнее.'}
          </p>
        </div>
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shadow-sm ${currentUser.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-brand-100 text-brand-600'}`}>
          {currentUser.role === 'admin' ? <UserCog className="w-6 h-6" /> : <UserIcon className="w-6 h-6" />}
        </div>
      </header>

      {/* Admin Actions */}
      {currentUser.role === 'admin' && (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onNavigate('admin')}
            className="relative bg-purple-600 text-white p-4 rounded-2xl shadow-lg shadow-purple-500/30 flex flex-col items-center justify-center active:scale-95 transition-transform"
          >
            <UserCog className="w-8 h-8 mb-2" />
            <span className="font-semibold text-sm">Админка</span>
            {pendingAmount > 0 && <span className="absolute top-2 right-2 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>}
          </button>
          <button
            onClick={() => onNavigate('schedule')}
            className="bg-white border border-gray-200 text-gray-700 p-4 rounded-2xl shadow-sm flex flex-col items-center justify-center active:scale-95 transition-transform"
          >
            <Briefcase className="w-8 h-8 mb-2 text-brand-500" />
            <span className="font-semibold text-sm">Все задачи</span>
          </button>
        </div>
      )}

      {/* Installer: Today's Task */}
      {currentUser.role !== 'admin' && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Задача на сегодня</h2>
          {todaySchedule && todaySchedule.objectId ? (
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <span className={`px-2 py-1 text-xs rounded-md font-medium ${getStatusDisplay(todaySchedule).className}`}>
                  {getStatusDisplay(todaySchedule).text}
                </span>
                <span className="text-sm text-gray-500">{new Date(todayStr).toLocaleDateString('ru-RU')}</span>
              </div>
              <p className="text-gray-900 font-medium mb-1">Объект назначен</p>
              <button
                onClick={() => onNavigate('report')}
                className="w-full mt-3 py-2 bg-brand-600 text-white rounded-xl text-sm font-semibold shadow-brand-500/30 shadow-lg active:scale-95 transition-transform"
              >
                {todaySchedule.status === 'draft' || !todaySchedule.status ? 'Заполнить отчет' : 'Смотреть статус'}
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-400 mb-3">На сегодня задач нет.</p>
              <button
                onClick={() => onNavigate('schedule')}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium"
              >
                Открыть график
              </button>
            </div>
          )}
        </div>
      )}

      {/* Stats Chart */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            {currentUser.role === 'admin' ? 'Выручка (Подтвержд.)' : 'Мой заработок'}
          </h2>
          <TrendingUp className={`w-5 h-5 ${currentUser.role === 'admin' ? 'text-purple-500' : 'text-green-500'}`} />
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: '#f1f5f9' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.amount > 0 ? barFillColor : '#e2e8f0'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex justify-between items-center">
          <span className="text-gray-500 text-sm">Одобрено за 7 дней</span>
          <span className="text-xl font-bold text-gray-800">{weeklyTotal.toLocaleString()} ₽</span>
        </div>
        {pendingAmount > 0 && (
          <div className="mt-3 bg-yellow-50 p-3 rounded-xl flex items-center gap-2 text-sm text-yellow-800">
            <AlertCircle className="w-4 h-4" />
            <span>Ожидает проверки: <strong>{pendingAmount.toLocaleString()} ₽</strong></span>
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(Dashboard);
