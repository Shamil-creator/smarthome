import React, { useState, useMemo, useEffect, useRef } from 'react';
import { PriceItem, WorkLogItem, ClientObject, User, ScheduledDay, ReportStatus } from '../types';
import { scheduleApi } from '../services/api';
import { Plus, Minus, Calculator, Loader2, CheckCircle, Save, Clock, Banknote, ChevronDown, ClipboardList, Calendar } from 'lucide-react';

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
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Track initialization and last local edit time to prevent polling from overwriting active edits
  const isInitializedRef = useRef(false);
  const lastLocalEditTimeRef = useRef<number>(0);
  const lastServerDataHashRef = useRef<string>('');

  const todayStr = new Date().toISOString().split('T')[0];

  // Helper to get last 7 days
  const last7Days = useMemo(() => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, []);

  // Find existing report for selected date
  const existingDay = schedule.find(s => s.userId === currentUser.id && s.date === selectedDate);

  // Get current status (support both old and new format)
  const getStatus = (): ReportStatus => {
    if (existingDay?.status) return existingDay.status;
    if (existingDay?.completed) return 'completed';
    return 'draft';
  };

  const status = getStatus();
  const isEditable = status === 'draft' || status === 'pending_approval';

  // Normalize workLog for comparison (sort by itemId, filter zeros)
  const normalizeWorkLog = (workLog: WorkLogItem[] | undefined): string => {
    if (!workLog || workLog.length === 0) return '';
    const normalized = workLog
      .filter(item => item.quantity > 0)
      .map(item => ({
        itemId: String(item.itemId),
        quantity: item.quantity
      }))
      .sort((a, b) => a.itemId.localeCompare(b.itemId));
    return JSON.stringify(normalized);
  };

  // Reset initialization when date changes
  useEffect(() => {
    isInitializedRef.current = false;
    lastLocalEditTimeRef.current = 0;
  }, [selectedDate]);

  // Initialize state based on existing data with smart updates
  useEffect(() => {
    if (!existingDay) {
      // No existing day - initialize object selector if needed
      if (!isInitializedRef.current) {
        if (objects.length > 0) {
          setSelectedObject(objects[0].id);
        }
        setLog([]);
        lastServerDataHashRef.current = '';
        isInitializedRef.current = true;
      }
      return;
    }

    // First initialization for this date
    if (!isInitializedRef.current) {
      if (existingDay.objectId) {
        setSelectedObject(existingDay.objectId);
      } else if (objects.length > 0) {
        setSelectedObject(objects[0].id);
      }
      if (existingDay.workLog) {
        setLog(existingDay.workLog);
        lastServerDataHashRef.current = normalizeWorkLog(existingDay.workLog);
      } else {
        setLog([]);
        lastServerDataHashRef.current = '';
      }
      isInitializedRef.current = true;
      return;
    }

    // After initialization: smart update from polling
    const serverHash = normalizeWorkLog(existingDay.workLog);
    const timeSinceLastEdit = Date.now() - lastLocalEditTimeRef.current;
    const MIN_EDIT_COOLDOWN = 2000;

    if (serverHash !== lastServerDataHashRef.current) {
      if (timeSinceLastEdit > MIN_EDIT_COOLDOWN) {
        if (existingDay.workLog) {
          setLog(existingDay.workLog);
          lastServerDataHashRef.current = serverHash;
        }
      }
    }

    if (existingDay.objectId && existingDay.objectId !== selectedObject && timeSinceLastEdit > MIN_EDIT_COOLDOWN) {
      setSelectedObject(existingDay.objectId);
    }
  }, [existingDay, objects, selectedDate]);

  const categories = useMemo(() => {
    return Array.from(new Set(priceList.map(p => p.category)));
  }, [priceList]);

  // Count selected items (qty > 0) per category
  const getSelectedCountForCategory = (cat: string) => {
    return priceList
      .filter(p => p.category === cat)
      .filter(p => log.find(item => item.itemId === p.id && item.quantity > 0))
      .length;
  };

  // Get all selected items with their details for the summary
  const selectedItems = useMemo(() => {
    return log
      .filter(item => item.quantity > 0)
      .map(item => {
        const priceItem = priceList.find(p => p.id === item.itemId);
        return priceItem ? { ...priceItem, quantity: item.quantity } : null;
      })
      .filter(Boolean) as (PriceItem & { quantity: number })[];
  }, [log, priceList]);

  // Set default open category on mount (first category or first with selected items)
  useEffect(() => {
    if (categories.length > 0 && openCategory === null) {
      // Prefer first category with selected items, otherwise first category
      const catWithSelected = categories.find(cat => getSelectedCountForCategory(cat) > 0);
      setOpenCategory(catWithSelected || categories[0]);
    }
  }, [categories]);

  const setQuantity = (id: string, quantity: number) => {
    if (!isEditable) return;
    // Track last edit time to prevent polling from overwriting active edits
    lastLocalEditTimeRef.current = Date.now();
    setLog(prev => {
      if (quantity <= 0) return prev.filter(item => item.itemId !== id);
      const existing = prev.find(item => item.itemId === id);
      if (existing) {
        return prev.map(item => item.itemId === id ? { ...item, quantity } : item);
      }
      return [...prev, { itemId: id, quantity }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    if (!isEditable) return;
    const current = getQuantity(id);
    setQuantity(id, current + delta);
  };

  const normalizeQuantityInput = (raw: string): string => {
    const digitsOnly = raw.replace(/\D+/g, '');
    if (digitsOnly === '') return '';
    const withoutLeadingZeros = digitsOnly.replace(/^0+/, '');
    return withoutLeadingZeros === '' ? '' : withoutLeadingZeros;
  };

  const handleQuantityInput = (id: string, raw: string) => {
    if (!isEditable) return;
    const normalized = normalizeQuantityInput(raw);
    if (normalized === '') {
      setQuantity(id, 0);
      return;
    }
    const quantity = Number(normalized);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setQuantity(id, 0);
      return;
    }
    setQuantity(id, quantity);
  };

  const getQuantity = (id: string) => log.find(item => item.itemId === id)?.quantity || 0;

  const totalEarnings = Math.round(log.reduce((sum, item) => {
    const priceItem = priceList.find(p => p.id === item.itemId);
    const price = priceItem?.price || 0;
    const coefficient = item.coefficient ?? 1;
    return sum + (price * coefficient * item.quantity);
  }, 0));

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
        // Update local state from server response
        if (updated?.workLog) {
          setLog(updated.workLog);
          lastServerDataHashRef.current = normalizeWorkLog(updated.workLog);
        }
        alert('Оплата подтверждена!');
      } else {
        // For save_draft and submit - use completeWork
        const newStatus: ReportStatus = action === 'submit' ? 'pending_approval' : 'draft';
        const completed = false;

        const updated = await scheduleApi.completeWork({
          userId: currentUser.id,
          date: selectedDate,
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

        // Update local state from server response (ensures sync with server)
        if (updated?.workLog) {
          setLog(updated.workLog);
          lastServerDataHashRef.current = normalizeWorkLog(updated.workLog);
        }
        // Reset edit time to allow polling updates
        lastLocalEditTimeRef.current = 0;

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
    switch (status) {
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

      {/* Date Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-500 mb-2 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Выберите дату
        </label>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {last7Days.map(date => {
            const isSelected = date === selectedDate;
            const hasReport = schedule.some(s => s.userId === currentUser.id && s.date === date);
            const d = new Date(date);
            const dayName = date === todayStr ? 'Сегодня' : d.toLocaleDateString('ru-RU', { weekday: 'short' });
            const dayNum = d.getDate();

            return (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-2xl border transition-all ${isSelected
                  ? 'bg-brand-500 border-brand-500 text-white shadow-lg shadow-brand-200'
                  : 'bg-white border-gray-100 text-gray-600 hover:border-brand-200'
                  }`}
              >
                <span className={`text-[10px] uppercase font-bold mb-1 ${isSelected ? 'text-brand-100' : 'text-gray-400'}`}>
                  {dayName}
                </span>
                <span className="text-lg font-bold">{dayNum}</span>
                {hasReport && (
                  <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-brand-500'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Object Selector (Locked if not draft/pending) */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-500 mb-2">Объект</label>
        <select
          value={selectedObject}
          onChange={(e) => setSelectedObject(e.target.value)}
          disabled={!isEditable}
          className={`w-full p-3 border rounded-xl font-medium text-gray-800 outline-none ${!isEditable
            ? 'bg-gray-100 border-gray-200'
            : 'bg-white border-gray-200 focus:ring-2 focus:ring-brand-500'
            }`}
        >
          {objects.map(obj => (
            <option key={obj.id} value={obj.id}>{obj.name}</option>
          ))}
        </select>
      </div>

      {/* Selected Items Summary */}
      {selectedItems.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-5 h-5 text-brand-500" />
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">
              Выбрано ({selectedItems.length})
            </h2>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-100">
            {selectedItems.map(item => (
              <div key={item.id} className="p-3 flex items-center justify-between">
                <div className="flex-1 pr-3">
                  <div className="font-medium text-gray-900 text-sm">{item.name}</div>
                  <div className="text-xs text-gray-400">{item.category}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">x{item.quantity}</span>
                  <span className="text-sm font-bold text-brand-600">{(item.price * item.quantity).toLocaleString()} ₽</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price List with Accordion */}
      <div className="space-y-3">
        {categories.map(cat => {
          const isOpen = openCategory === cat;
          const selectedCount = getSelectedCountForCategory(cat);
          const categoryItems = priceList.filter(p => p.category === cat);

          return (
            <div key={cat} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => setOpenCategory(isOpen ? null : cat)}
                aria-expanded={isOpen}
                aria-controls={`category-panel-${cat}`}
                className="w-full p-4 flex items-center justify-between text-left transition-colors hover:bg-gray-50 group"
              >
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">{cat}</h3>
                  {selectedCount > 0 && (
                    <span className="px-2 py-0.5 bg-brand-100 text-brand-700 text-xs font-bold rounded-full">
                      {selectedCount}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''
                    }`}
                />
              </button>

              {/* Accordion Panel */}
              <div
                id={`category-panel-${cat}`}
                className={`transition-all duration-200 ease-in-out overflow-hidden ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
              >
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {categoryItems.map(item => {
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
                              className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${qty > 0 ? 'bg-white shadow-sm text-brand-600' : 'text-gray-300'
                                }`}
                              disabled={qty === 0}
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={qty === 0 ? '' : String(qty)}
                              onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                              placeholder="0"
                              className="w-12 h-8 mx-1 text-center font-bold text-gray-900 bg-white rounded-md border border-gray-200 focus:ring-2 focus:ring-brand-500 outline-none"
                              aria-label={`Количество для ${item.name}`}
                            />
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
            </div>
          );
        })}
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
                    className={`px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all ${log.length > 0 && !isSaving
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
