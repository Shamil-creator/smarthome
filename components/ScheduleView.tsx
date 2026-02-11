import React, { useState, useMemo, memo } from 'react';
import { ScheduledDay, ClientObject } from '../types';
import { scheduleApi } from '../services/api';
import { Calendar, MapPin, CheckCircle, Clock, Loader2 } from 'lucide-react';

interface ScheduleViewProps {
  userId: number;
  fullSchedule: ScheduledDay[];
  onScheduleUpdate: () => Promise<void>;
  objects: ClientObject[];
  todayStr: string;
}

const ScheduleView: React.FC<ScheduleViewProps> = ({ userId, fullSchedule, onScheduleUpdate, objects, todayStr }) => {
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Generate next 7 days - memoized
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayStr);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  }), [todayStr]);

  // Filter schedule for THIS user only - memoized
  const mySchedule = useMemo(() => fullSchedule.filter(s => s.userId === userId), [fullSchedule, userId]);
  const currentDaySchedule = useMemo(() => mySchedule.find(s => s.date === selectedDate), [mySchedule, selectedDate]);
  const assignedObject = useMemo(() =>
    currentDaySchedule ? objects.find(o => o.id === currentDaySchedule.objectId) : null,
    [currentDaySchedule, objects]
  );

  const handleAssign = async (objectId: string) => {
    setIsLoading(true);

    try {
      await scheduleApi.createOrUpdate({
        userId,
        date: selectedDate,
        objectId,
      });
      await onScheduleUpdate();
      setIsAssigning(false);
    } catch (err) {
      console.error('Error assigning object:', err);
      alert('Ошибка при назначении объекта');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 pb-24 min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Calendar className="w-6 h-6 text-brand-500" />
        График
      </h1>

      {/* Horizontal Date Picker */}
      <div className="flex overflow-x-auto no-scrollbar gap-3 mb-8 pb-2">
        {days.map(date => {
          const d = new Date(date);
          const isSelected = selectedDate === date;
          // Check if user has work on this date
          const hasWork = mySchedule.some(s => s.date === date && s.objectId);

          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={`flex-shrink-0 w-16 h-20 rounded-2xl flex flex-col items-center justify-center transition-all ${isSelected
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/40 scale-105'
                  : 'bg-white text-gray-500 border border-gray-100'
                }`}
            >
              <span className="text-xs font-medium uppercase">{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
              <span className="text-xl font-bold mt-1">{d.getDate()}</span>
              {hasWork && <div className={`w-1.5 h-1.5 rounded-full mt-2 ${isSelected ? 'bg-white' : 'bg-brand-500'}`} />}
            </button>
          );
        })}
      </div>

      {/* Daily Content */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-700 capitalize">
          {new Date(selectedDate).toLocaleDateString('ru-RU', { weekday: 'long', month: 'long', day: 'numeric' })}
        </h2>

        {assignedObject ? (
          <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-brand-50 rounded-bl-full -mr-10 -mt-10 z-0"></div>
            <div className="relative z-10">
              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded uppercase tracking-wide">Назначено</span>
              <h3 className="text-xl font-bold text-gray-900 mt-2">{assignedObject.name}</h3>
              <div className="flex items-start mt-3 text-gray-500 text-sm">
                <MapPin className="w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                {assignedObject.address}
              </div>
              <div className="flex items-center mt-2 text-gray-500 text-sm">
                <Clock className="w-4 h-4 mr-2" />
                09:00 - 18:00
              </div>

              <button
                onClick={() => setIsAssigning(true)}
                className="mt-4 text-brand-600 text-sm font-medium hover:underline"
              >
                Сменить объект
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Calendar className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium">Объект не выбран</p>
            <button
              onClick={() => setIsAssigning(true)}
              className="mt-4 px-6 py-2 bg-brand-600 text-white rounded-xl font-semibold shadow-md active:scale-95 transition-all"
            >
              Выбрать объект
            </button>
          </div>
        )}
      </div>

      {/* Object Selection Modal/Sheet */}
      {isAssigning && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl max-h-[85vh] overflow-y-auto p-6 pb-12 animate-slide-up shadow-2xl">
            <div className="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 pb-2 border-b border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">Выбор объекта</h3>
              <button onClick={() => setIsAssigning(false)} className="text-gray-400 hover:text-gray-600 px-2 py-1" disabled={isLoading}>
                Закрыть
              </button>
            </div>
            <div className="space-y-3">
              {objects.map(obj => (
                <button
                  key={obj.id}
                  onClick={() => handleAssign(obj.id)}
                  disabled={isLoading}
                  className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-brand-500 hover:bg-brand-50 transition-colors group disabled:opacity-50"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-gray-900 group-hover:text-brand-700">{obj.name}</div>
                      <div className="text-sm text-gray-500 mt-1">{obj.address}</div>
                    </div>
                    {obj.status === 'active' && <CheckCircle className="w-5 h-5 text-green-500" />}
                  </div>
                </button>
              ))}
            </div>
            {isLoading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(ScheduleView);
