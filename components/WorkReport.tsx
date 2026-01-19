import React, { useState, useMemo, useEffect } from 'react';
import { PriceItem, WorkLogItem, ClientObject, User, ScheduledDay, ReportStatus } from '../types';
import { scheduleApi } from '../services/api';
import { Plus, Minus, Calculator, Loader2, CheckCircle, Save, Clock, Banknote } from 'lucide-react';

interface WorkReportProps {
  objects: ClientObject[];
  priceList: PriceItem[];
  currentUser: User;
  schedule: ScheduledDay[]; // User's schedule from API
  onWorkComplete: () => Promise<void>;
  onUpdateScheduleItem?: (item: ScheduledDay) => void;
  onObjectsUpdate?: () => Promise<void>;
  onPricesUpdate?: () => Promise<void>;
}

const WorkReport: React.FC<WorkReportProps> = ({ 
  objects, 
  priceList, 
  currentUser, 
  schedule,
  onWorkComplete,
  onUpdateScheduleItem,
  onObjectsUpdate, 
  onPricesUpdate 
}) => {
  const [selectedObject, setSelectedObject] = useState<string>('');
  const [log, setLog] = useState<WorkLogItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [actionType, setActionType] = useState<'save_draft' | 'submit' | 'confirm_payment' | null>(null);

  const todayStr = new Date().toISOString().split('T')[0];
  
  // Find existing report for today
  const existingDay = schedule.find(s => s.userId === currentUser.id && s.date === todayStr);

  // Get current status (support both old and new format)
  const getStatus = (): ReportStatus => {
    if (existingDay?.status) return existingDay.status;
    if (existingDay?.completed) return 'completed';
    return 'draft';
  };
  
  const status = getStatus();
  const isEditable = status === 'draft' || status === 'pending_approval';

  // Initialize state based on existing data
  useEffect(() => {
    if (existingDay && existingDay.objectId) {
      setSelectedObject(existingDay.objectId);
      if (existingDay.workLog) {
        setLog(existingDay.workLog);
      }
    } else if (objects.length > 0 && !selectedObject) {
      setSelectedObject(objects[0].id);
    }
  }, [existingDay, objects]);

  const categories = useMemo(() => {
    return Array.from(new Set(priceList.map(p => p.category)));
  }, [priceList]);

  const updateQuantity = (id: string, delta: number) => {
    if (!isEditable) return;
    setLog(prev => {
      const existing = prev.find(item => item.itemId === id);
      if (existing) {
        const newQty = existing.quantity + delta;
        if (newQty <= 0) return prev.filter(item => item.itemId !== id);
        return prev.map(item => item.itemId === id ? { ...item, quantity: newQty } : item);
      } else if (delta > 0) {
        return [...prev, { itemId: id, quantity: 1 }];
      }
      return prev;
    });
  };

  const getQuantity = (id: string) => log.find(item => item.itemId === id)?.quantity || 0;

  const totalEarnings = log.reduce((sum, item) => {
    const price = priceList.find(p => p.id === item.itemId)?.price || 0;
    return sum + (price * item.quantity);
  }, 0);

  const handleAction = async (action: 'save_draft' | 'submit' | 'confirm_payment') => {
    if (log.length === 0 && action !== 'confirm_payment') return;
    if (!selectedObject && action !== 'confirm_payment') return;
    
    setIsSaving(true);
    setActionType(action);
    
    try {
      if (action === 'confirm_payment') {
        // Use dedicated confirm payment endpoint
        if (!existingDay?.id) {
          throw new Error('Отчет не найден');
        }
        const updated = await scheduleApi.confirmPayment(existingDay.id);
        if (onUpdateScheduleItem) {
          onUpdateScheduleItem(updated);
        } else {
          await onWorkComplete();
        }
        alert('Оплата подтверждена!');
      } else {
        // For save_draft and submit - use completeWork
        const newStatus: ReportStatus = action === 'submit' ? 'pending_approval' : 'draft';
        const completed = false;

        const updated = await scheduleApi.completeWork({
          userId: currentUser.id,
          date: todayStr,
          objectId: selectedObject,
          workLog: log,
          status: newStatus,
          completed: completed,
        });
        
        if (onUpdateScheduleItem) {
          onUpdateScheduleItem(updated);
        } else {
          await onWorkComplete();
        }
        
        if (action === 'submit') {
          alert('Отчет отправлен на проверку!');
        } else {
          alert('Черновик сохранен');
        }
      }
    } catch (err: any) {
      console.error('Error saving work:', err);
      alert(err.message || 'Ошибка сохранения работы');
    } finally {
      setIsSaving(false);
      setActionType(null);
    }
  };

  // Status Banner
  const renderStatusBanner = () => {
    switch(status) {
      case 'pending_approval':
        return (
          <div className="bg-yellow-100 text-yellow-800 p-4 rounded-xl mb-4 flex gap-3 text-sm border border-yellow-200">
            <Clock className="w-5 h-5 flex-shrink-0" />
            <div>Отчет на проверке. Вы можете внести правки и отправить повторно.</div>
          </div>
        );
      case 'approved_waiting_payment':
        return (
          <div className="bg-blue-100 text-blue-800 p-4 rounded-xl mb-4 flex gap-3 text-sm border border-blue-200">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <div>Отчет проверен и одобрен! Ожидайте поступления оплаты. Редактирование закрыто.</div>
          </div>
        );
      case 'paid_waiting_confirmation':
        return (
          <div className="bg-purple-100 text-purple-800 p-4 rounded-xl mb-4 flex gap-3 text-sm border border-purple-200">
            <Banknote className="w-5 h-5 flex-shrink-0" />
            <div>Средства переведены. Пожалуйста, подтвердите получение.</div>
          </div>
        );
      case 'completed':
        return (
          <div className="bg-green-100 text-green-800 p-4 rounded-xl mb-4 flex gap-3 text-sm border border-green-200">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <div>Оплачено и закрыто. Спасибо за работу!</div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 pb-48 min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Calculator className="w-6 h-6 text-brand-500" />
        Отчет о работе
      </h1>
      
      {renderStatusBanner()}

      {/* Object Selector (Locked if not draft/pending) */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-500 mb-2">Объект</label>
        <select 
          value={selectedObject}
          onChange={(e) => setSelectedObject(e.target.value)}
          disabled={!isEditable}
          className={`w-full p-3 border rounded-xl font-medium text-gray-800 outline-none ${
            !isEditable 
              ? 'bg-gray-100 border-gray-200' 
              : 'bg-white border-gray-200 focus:ring-2 focus:ring-brand-500'
          }`}
        >
          {objects.map(obj => (
            <option key={obj.id} value={obj.id}>{obj.name}</option>
          ))}
        </select>
      </div>

      {/* Price List */}
      <div className="space-y-6">
        {categories.map(cat => (
          <div key={cat}>
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 ml-1">{cat}</h3>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
              {priceList.filter(p => p.category === cat).map(item => {
                const qty = getQuantity(item.id);
                // If not editable, only show items with qty > 0
                if (!isEditable && qty === 0) return null;

                return (
                  <div key={item.id} className="p-4 flex items-center justify-between">
                    <div className="flex-1 pr-4">
                      <div className="font-medium text-gray-900">{item.name}</div>
                      <div className="text-sm text-gray-500">{item.price} ₽</div>
                    </div>
                    {isEditable ? (
                      <div className="flex items-center bg-gray-50 rounded-lg p-1">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${
                            qty > 0 ? 'bg-white shadow-sm text-brand-600' : 'text-gray-300'
                          }`}
                          disabled={qty === 0}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className={`w-8 text-center font-bold ${qty > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
                          {qty}
                        </span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-8 h-8 flex items-center justify-center rounded-md bg-white shadow-sm text-brand-600 active:bg-gray-100"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="font-bold text-gray-900 px-3">
                        x{qty}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-[80px] left-0 right-0 p-4 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none z-40">
        <div className="max-w-md mx-auto pointer-events-auto">
          <div className="bg-gray-900 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between">
            <div>
              <div className="text-gray-400 text-xs uppercase font-bold">Итого</div>
              <div className="text-xl font-bold">{totalEarnings.toLocaleString()} ₽</div>
            </div>
            
            <div className="flex gap-2">
              {isEditable ? (
                <>
                  <button
                    onClick={() => handleAction('save_draft')}
                    disabled={log.length === 0 || isSaving}
                    className="p-3 bg-gray-700 rounded-xl hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    {isSaving && actionType === 'save_draft' ? (
                      <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
                    ) : (
                      <Save className="w-5 h-5 text-gray-300" />
                    )}
                  </button>
                  <button
                    onClick={() => handleAction('submit')}
                    disabled={log.length === 0 || isSaving}
                    className={`px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${
                      log.length > 0 && !isSaving
                        ? 'bg-brand-500 hover:bg-brand-400 text-white' 
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {isSaving && actionType === 'submit' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : null}
                    {status === 'pending_approval' ? 'Обновить' : 'Отправить'}
                  </button>
                </>
              ) : status === 'paid_waiting_confirmation' ? (
                <button
                  onClick={() => handleAction('confirm_payment')}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl font-semibold bg-green-500 hover:bg-green-400 text-white flex items-center gap-2"
                >
                  {isSaving && actionType === 'confirm_payment' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Подтвердить оплату
                </button>
              ) : (
                <div className="px-4 py-2 text-sm text-gray-400 font-medium">
                  {status === 'completed' ? 'Закрыто' : 'Ждем админа'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkReport;
