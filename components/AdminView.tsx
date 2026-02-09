import React, { useState, useMemo, useRef } from 'react';
import { ClientObject, PriceItem, User, ScheduledDay, DocItem, isAccruedStatus, ReportStatus } from '../types';
import { objectsApi, pricesApi, docsApi, scheduleApi, reportsApi } from '../services/api';
import { Settings, Plus, Trash2, Edit2, Building, DollarSign, Users, FileText, ChevronRight, ChevronDown, ChevronUp, ExternalLink, Loader2, Upload, X, Image as ImageIcon, Download, CheckCircle, Clock, Banknote } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'docx'];

interface AdminViewProps {
  objects: ClientObject[];
  onObjectsUpdate: () => Promise<void>;
  onAddObject?: (obj: ClientObject) => void;
  onUpdateObject?: (obj: ClientObject) => void;
  onRemoveObject?: (id: string) => void;
  priceList: PriceItem[];
  onPricesUpdate: () => Promise<void>;
  onAddPrice?: (price: PriceItem) => void;
  onUpdatePrice?: (price: PriceItem) => void;
  onRemovePrice?: (id: string) => void;
  users: User[];
  onUsersUpdate: () => Promise<void>;
  schedule: ScheduledDay[];
  onScheduleUpdate: () => Promise<void>;
  onUpdateScheduleItem?: (item: ScheduledDay) => void;
  generalDocs: DocItem[];
  onDocsUpdate: () => Promise<void>;
  onAddDoc?: (doc: DocItem) => void;
  onRemoveDoc?: (id: string) => void;
}

const AdminView: React.FC<AdminViewProps> = ({
  objects, onObjectsUpdate, onAddObject, onUpdateObject, onRemoveObject,
  priceList, onPricesUpdate, onAddPrice, onUpdatePrice, onRemovePrice,
  users, onUsersUpdate,
  schedule, onScheduleUpdate, onUpdateScheduleItem,
  generalDocs, onDocsUpdate, onAddDoc, onRemoveDoc
}) => {
  const [activeTab, setActiveTab] = useState<'objects' | 'prices' | 'users' | 'docs'>('users');
  const [editingObj, setEditingObj] = useState<Partial<ClientObject> | null>(null);
  const [editingPrice, setEditingPrice] = useState<Partial<PriceItem> | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [editingDoc, setEditingDoc] = useState<Partial<DocItem> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // State for expanding history items
  const [expandedHistoryIndex, setExpandedHistoryIndex] = useState<number | null>(null);

  // State for editing coefficients (key = `dayId-itemId`, value = string for input, parsed on approve)
  const [editingCoefficients, setEditingCoefficients] = useState<Record<string, string>>({});

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileExtension = (filename: string): string => {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError(null);

    if (!file) {
      setSelectedFile(null);
      setFilePreview(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`Файл слишком большой. Максимум ${MAX_FILE_SIZE / (1024 * 1024)} МБ`);
      return;
    }

    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadError(`Неподдерживаемый формат. Разрешены: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }

    setSelectedFile(file);

    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }

    if (editingDoc && !editingDoc.title) {
      setEditingDoc({ ...editingDoc, title: file.name.replace(/\.[^/.]+$/, '') });
    }
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    setFilePreview(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // --- Object Handlers ---
  const handleSaveObject = async () => {
    if (!editingObj?.name || !editingObj?.address) return;
    setIsLoading(true);

    try {
      if (editingObj.id) {
        const updated = await objectsApi.update(editingObj.id, {
          name: editingObj.name,
          address: editingObj.address,
          status: editingObj.status
        });
        // Use incremental update if available, otherwise fallback to full reload
        if (onUpdateObject) {
          onUpdateObject(updated);
        } else {
          await onObjectsUpdate();
        }
      } else {
        const created = await objectsApi.create({
          name: editingObj.name,
          address: editingObj.address,
          status: editingObj.status || 'active'
        });
        if (onAddObject) {
          onAddObject(created);
        } else {
          await onObjectsUpdate();
        }
      }
      setEditingObj(null);
    } catch (err) {
      console.error('Error saving object:', err);
      alert('Ошибка сохранения');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteObject = async (id: string) => {
    if (!confirm('Вы уверены?')) return;
    setIsLoading(true);

    try {
      await objectsApi.delete(id);
      // Use incremental update if available
      if (onRemoveObject) {
        onRemoveObject(id);
      } else {
        await onObjectsUpdate();
      }
    } catch (err) {
      console.error('Error deleting object:', err);
      alert('Ошибка удаления');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Price Handlers ---
  const handleSavePrice = async () => {
    if (!editingPrice?.name || !editingPrice?.category) return;
    setIsLoading(true);

    const finalPrice = editingPrice.price || 0;

    try {
      if (editingPrice.id) {
        const updated = await pricesApi.update(editingPrice.id, {
          name: editingPrice.name,
          category: editingPrice.category,
          price: finalPrice
        });
        if (onUpdatePrice) {
          onUpdatePrice(updated);
        } else {
          await onPricesUpdate();
        }
      } else {
        const created = await pricesApi.create({
          name: editingPrice.name,
          category: editingPrice.category,
          price: finalPrice
        });
        if (onAddPrice) {
          onAddPrice(created);
        } else {
          await onPricesUpdate();
        }
      }
      setEditingPrice(null);
    } catch (err) {
      console.error('Error saving price:', err);
      alert((err as any)?.message || 'Ошибка сохранения');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeletePrice = async (id: string) => {
    if (!confirm('Удалить?')) return;
    setIsLoading(true);

    try {
      await pricesApi.delete(id);
      if (onRemovePrice) {
        onRemovePrice(id);
      } else {
        await onPricesUpdate();
      }
    } catch (err) {
      console.error('Error deleting price:', err);
      alert('Ошибка удаления');
    } finally {
      setIsLoading(false);
    }
  };

  // --- General Docs Handlers ---
  const handleSaveDoc = async () => {
    if (!editingDoc?.title) return;
    setIsLoading(true);

    try {
      if (selectedFile) {
        // Upload file
        const created = await docsApi.upload(selectedFile, editingDoc.title);
        if (onAddDoc) {
          onAddDoc(created);
        } else {
          await onDocsUpdate();
        }
      } else if (editingDoc.id) {
        await docsApi.update(editingDoc.id, {
          title: editingDoc.title,
          type: editingDoc.type,
          url: editingDoc.url,
          content: editingDoc.content
        });
        // For updates, just refresh since we don't have the full updated object
        await onDocsUpdate();
      } else if (editingDoc.type) {
        const created = await docsApi.create({
          title: editingDoc.title,
          type: editingDoc.type,
          url: editingDoc.url,
          content: editingDoc.content
        });
        if (onAddDoc) {
          onAddDoc(created);
        } else {
          await onDocsUpdate();
        }
      }
      setEditingDoc(null);
      clearFileSelection();
    } catch (err: any) {
      console.error('Error saving doc:', err);
      alert(err.message || 'Ошибка сохранения');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    if (!confirm('Удалить документ?')) return;
    setIsLoading(true);

    try {
      await docsApi.delete(id);
      if (onRemoveDoc) {
        onRemoveDoc(id);
      } else {
        await onDocsUpdate();
      }
    } catch (err) {
      console.error('Error deleting doc:', err);
      alert('Ошибка удаления');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Report Workflow Handlers ---
  const handleApproveReport = async (day: ScheduledDay) => {
    if (!day.id) {
      console.error('Cannot approve: day.id is missing', day);
      alert('Ошибка: отчет не имеет ID');
      return;
    }
    setIsLoading(true);
    try {
      // Build workLog with edited coefficients
      const workLogWithCoeffs = day.workLog?.map(item => {
        const key = `${day.id}-${item.itemId}`;
        const editedCoeff = editingCoefficients[key];
        return {
          ...item,
          coefficient: editedCoeff !== undefined ? parseCoefficient(editedCoeff, item.coefficient ?? 1) : (item.coefficient ?? 1)
        };
      });

      const updated = await scheduleApi.approveReport(day.id, { workLog: workLogWithCoeffs });
      if (onUpdateScheduleItem) {
        onUpdateScheduleItem(updated);
      } else {
        await onScheduleUpdate();
      }
      // Clear edited coefficients for this day
      setEditingCoefficients(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(k => {
          if (k.startsWith(`${day.id}-`)) delete next[k];
        });
        return next;
      });
    } catch (err: any) {
      console.error('Error approving report:', err);
      alert(err.message || 'Ошибка подтверждения');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkPaid = async (day: ScheduledDay) => {
    if (!day.id) {
      console.error('Cannot mark paid: day.id is missing', day);
      alert('Ошибка: отчет не имеет ID');
      return;
    }
    setIsLoading(true);
    try {
      const updated = await scheduleApi.markPaid(day.id);
      if (onUpdateScheduleItem) {
        onUpdateScheduleItem(updated);
      } else {
        await onScheduleUpdate();
      }
    } catch (err: any) {
      console.error('Error marking as paid:', err);
      alert(err.message || 'Ошибка отметки оплаты');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateLogItem = async (day: ScheduledDay, itemId: string, newQty: number) => {
    if (!day.id || !day.workLog) {
      console.error('Cannot update: day.id or workLog is missing', day);
      alert('Ошибка: отчет не имеет ID');
      return;
    }
    setIsLoading(true);
    try {
      const newLog = day.workLog.map(item => {
        if (item.itemId === itemId) {
          // Preserve edited coefficient if exists
          const key = `${day.id}-${item.itemId}`;
          const editedCoeff = editingCoefficients[key];
          return {
            ...item,
            quantity: Math.max(0, newQty),
            coefficient: editedCoeff !== undefined ? parseCoefficient(editedCoeff, item.coefficient ?? 1) : (item.coefficient ?? 1)
          };
        }
        return item;
      }).filter(item => item.quantity > 0);

      const updated = await scheduleApi.editReport(day.id, { workLog: newLog });
      if (onUpdateScheduleItem) {
        onUpdateScheduleItem(updated);
      } else {
        await onScheduleUpdate();
      }
    } catch (err: any) {
      console.error('Error updating work log:', err);
      alert(err.message || 'Ошибка обновления');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler to update coefficient locally (not saved until approve)
  const handleUpdateCoefficient = (dayId: number, itemId: string, value: string) => {
    const key = `${dayId}-${itemId}`;
    // Store raw string to allow user to clear and retype (e.g., 2,5 or 0,5)
    setEditingCoefficients(prev => ({ ...prev, [key]: value }));
  };

  // Helper to parse coefficient string to number (for calculations)
  const parseCoefficient = (value: string | undefined, fallback: number = 1): number => {
    if (value === undefined) return fallback;
    const normalized = value.replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) || num <= 0 ? fallback : num;
  };

  const handleGenerateUserReport = async () => {
    if (!selectedUser) return;
    setIsLoading(true);
    try {
      await reportsApi.requestUserReport(selectedUser.id);
      alert('Отчет сформирован и отправлен в бот');
    } catch (err: any) {
      console.error('Error requesting user report:', err);
      alert(err?.message || 'Ошибка формирования отчета');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to get status badge
  const getStatusBadge = (status: ReportStatus) => {
    switch (status) {
      case 'pending_approval':
        return <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-bold">На проверке</span>;
      case 'approved_waiting_payment':
        return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">Ждет оплаты</span>;
      case 'paid_waiting_confirmation':
        return <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs font-bold">Оплачено</span>;
      case 'completed':
        return <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-bold">Закрыто</span>;
      case 'draft':
        return <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded text-xs font-bold">Черновик</span>;
      default:
        return null;
    }
  };

  // --- User Stats Calculations ---
  const getUserStats = (userId: number) => {
    // Get all work entries for user
    const userWork = schedule.filter(s => s.userId === userId && s.objectId);

    // Pending money (waiting for approval)
    const pending = userWork
      .filter(s => s.status === 'pending_approval')
      .reduce((acc, s) => acc + s.earnings, 0);

    // Approved money (approved + paid + completed)
    const approved = userWork
      .filter(s => isAccruedStatus(s.status))
      .reduce((acc, s) => acc + s.earnings, 0);

    // All history sorted by date
    const history = userWork.sort((a, b) => b.date.localeCompare(a.date));

    return { pending, approved, history };
  };

  const existingCategories = useMemo(() => Array.from(new Set(priceList.map(p => p.category))), [priceList]);

  // --- Render Tabs ---
  return (
    <div className="p-4 pb-24 min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Settings className="w-6 h-6 text-brand-500" />
        Админка
      </h1>

      <div className="flex bg-gray-200 p-1 rounded-xl mb-6 overflow-x-auto no-scrollbar">
        {[
          { id: 'users', icon: Users, label: 'Люди' },
          { id: 'objects', icon: Building, label: 'Объекты' },
          { id: 'prices', icon: DollarSign, label: 'Прайс' },
          { id: 'docs', icon: FileText, label: 'База' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 min-w-[80px] py-2 text-xs font-semibold rounded-lg transition-all flex flex-col items-center justify-center gap-1 ${activeTab === tab.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* --- USERS TAB --- */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {selectedUser ? (
            <div className="animate-fade-in">
              <button onClick={() => { setSelectedUser(null); setExpandedHistoryIndex(null); }} className="mb-4 text-sm text-gray-500 flex items-center">
                <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Назад к списку
              </button>
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 mb-4">
                <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
                <div className="text-sm text-gray-500 mb-4">{selectedUser.role === 'admin' ? 'Администратор' : 'Монтажник'}</div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-yellow-50 p-3 rounded-xl">
                    <div className="text-xs text-yellow-700 font-bold uppercase">Ждет проверки</div>
                    <div className="text-xl font-bold text-yellow-900">{getUserStats(selectedUser.id).pending.toLocaleString()} ₽</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded-xl">
                    <div className="text-xs text-green-700 font-bold uppercase">Одобрено</div>
                    <div className="text-xl font-bold text-green-900">{getUserStats(selectedUser.id).approved.toLocaleString()} ₽</div>
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    onClick={handleGenerateUserReport}
                    disabled={isLoading}
                    className="w-full py-2 bg-brand-600 text-white rounded-xl font-medium shadow-lg shadow-brand-500/30 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <Download className="w-4 h-4" />
                    Сформировать отчет
                  </button>
                </div>
              </div>

              <h3 className="font-bold text-gray-700 mb-2 px-1">Отчеты</h3>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {getUserStats(selectedUser.id).history.length > 0 ? (
                  getUserStats(selectedUser.id).history.map((day, idx) => (
                    <div key={idx} className={`border-b border-gray-100 last:border-0 ${day.status === 'pending_approval' ? 'bg-yellow-50/50' : ''}`}>
                      {/* Header Row */}
                      <button
                        onClick={() => setExpandedHistoryIndex(expandedHistoryIndex === idx ? null : idx)}
                        className="w-full p-4 flex justify-between items-center hover:bg-gray-50 transition-colors"
                      >
                        <div className="text-left">
                          <div className="font-medium text-gray-900 flex items-center gap-2">
                            {new Date(day.date).toLocaleDateString('ru-RU')}
                            {getStatusBadge(day.status)}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{objects.find(o => o.id === day.objectId)?.name || 'Неизвестный объект'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-bold text-gray-700">{day.earnings} ₽</div>
                          {expandedHistoryIndex === idx ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </button>

                      {/* Detailed Breakdown */}
                      {expandedHistoryIndex === idx && (
                        <div className="bg-gray-50 p-4 border-t border-gray-100 text-sm space-y-3 animate-fade-in">
                          <div className="text-xs text-gray-400 font-bold uppercase">Детализация работ:</div>
                          {day.workLog && day.workLog.length > 0 ? (
                            day.workLog.map((logItem, logIdx) => {
                              const service = priceList.find(p => p.id === logItem.itemId);
                              const coeffKey = `${day.id}-${logItem.itemId}`;
                              const currentCoeff = parseCoefficient(editingCoefficients[coeffKey], logItem.coefficient ?? 1);
                              const lineTotal = service ? Math.round(service.price * currentCoeff * logItem.quantity) : 0;
                              return (
                                <div key={logIdx} className="flex flex-col gap-1 py-2 border-b border-gray-100 last:border-0">
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-600 flex-1 pr-2 text-sm">
                                      {service?.name || 'Услуга удалена'}
                                    </span>
                                    <span className="font-medium text-gray-900 text-right">
                                      {lineTotal.toLocaleString()} ₽
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs">
                                    {day.status === 'pending_approval' ? (
                                      <>
                                        {/* Quantity controls */}
                                        <div className="flex items-center bg-white rounded border border-gray-200">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateLogItem(day, logItem.itemId, logItem.quantity - 1); }}
                                            className="px-2 py-1 text-gray-500 hover:bg-gray-100"
                                            disabled={isLoading}
                                          >-</button>
                                          <span className="px-1 font-bold">{logItem.quantity}</span>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateLogItem(day, logItem.itemId, logItem.quantity + 1); }}
                                            className="px-2 py-1 text-gray-500 hover:bg-gray-100"
                                            disabled={isLoading}
                                          >+</button>
                                        </div>
                                        <span className="text-gray-400">×</span>
                                        {/* Coefficient input */}
                                        <div className="flex items-center gap-1">
                                          <span className="text-gray-400">коэфф:</span>
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            pattern="[0-9]*[,.]?[0-9]*"
                                            value={editingCoefficients[coeffKey] !== undefined
                                              ? editingCoefficients[coeffKey]
                                              : String(logItem.coefficient ?? 1).replace('.', ',')}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              // Only allow digits, comma and dot
                                              const filtered = e.target.value.replace(/[^0-9,.]/g, '');
                                              // Only allow one decimal separator
                                              const parts = filtered.split(/[,.]/);
                                              const sanitized = parts.length > 2
                                                ? parts[0] + ',' + parts.slice(1).join('')
                                                : filtered;
                                              handleUpdateCoefficient(day.id!, logItem.itemId, sanitized);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-14 px-1 py-0.5 border border-gray-200 rounded text-center font-bold bg-white focus:ring-1 focus:ring-brand-500 outline-none"
                                          />
                                        </div>
                                        <span className="text-gray-400">× {service?.price ?? 0} ₽</span>
                                      </>
                                    ) : (
                                      <span className="text-gray-400">
                                        x{logItem.quantity} × коэфф {String(logItem.coefficient ?? 1).replace('.', ',')} × {service?.price ?? 0} ₽
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-gray-400 italic">Нет детальных данных</div>
                          )}

                          {/* Admin Actions */}
                          {day.status === 'pending_approval' && (
                            <div className="pt-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleApproveReport(day); }}
                                disabled={isLoading}
                                className="w-full py-2 bg-blue-600 text-white rounded-lg font-medium shadow-lg shadow-blue-500/30 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                <CheckCircle className="w-4 h-4" />
                                Подтвердить выполнение
                              </button>
                              <p className="text-xs text-gray-400 text-center mt-2">После подтверждения монтажник не сможет редактировать отчет.</p>
                            </div>
                          )}
                          {day.status === 'approved_waiting_payment' && (
                            <div className="pt-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleMarkPaid(day); }}
                                disabled={isLoading}
                                className="w-full py-2 bg-purple-600 text-white rounded-lg font-medium shadow-lg shadow-purple-500/30 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                <Banknote className="w-4 h-4" />
                                Отметить как Оплаченное
                              </button>
                            </div>
                          )}
                          {day.status === 'paid_waiting_confirmation' && (
                            <div className="text-center text-xs text-purple-600 font-medium pt-2 flex items-center justify-center gap-2">
                              <Clock className="w-4 h-4" />
                              Ждем подтверждения от сотрудника...
                            </div>
                          )}
                          {day.status === 'completed' && (
                            <div className="text-center text-xs text-green-600 font-medium pt-2 flex items-center justify-center gap-2">
                              <CheckCircle className="w-4 h-4" />
                              Оплачено и закрыто
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-400 text-sm">Нет записей о работе</div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map(user => {
                const stats = getUserStats(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => setSelectedUser(user)}
                    className="w-full bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between hover:border-brand-300 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-500 relative">
                        {user.name.charAt(0)}
                        {stats.pending > 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>}
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500">{user.role === 'admin' ? 'Админ' : 'Сотрудник'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-brand-600">{stats.approved.toLocaleString()} ₽</div>
                      {stats.pending > 0 ? (
                        <div className="text-[10px] text-yellow-600 font-bold bg-yellow-100 px-1.5 py-0.5 rounded-full inline-block mt-1">
                          +{stats.pending.toLocaleString()} ждет
                        </div>
                      ) : (
                        <div className="text-[10px] text-gray-400 uppercase">всего одобр.</div>
                      )}
                    </div>
                  </button>
                );
              })}
              {users.length === 0 && (
                <div className="text-center py-10 text-gray-400">Нет пользователей</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- OBJECTS TAB --- */}
      {activeTab === 'objects' && (
        <div className="space-y-4">
          <button
            onClick={() => setEditingObj({ name: '', address: '', status: 'active' })}
            className="w-full py-3 bg-brand-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30"
          >
            <Plus className="w-5 h-5" /> Добавить объект
          </button>
          {objects.map(obj => (
            <div key={obj.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-start">
              <div>
                <h3 className="font-bold text-gray-900">{obj.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{obj.address}</p>
                <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium uppercase ${obj.status === 'active' ? 'bg-green-100 text-green-700' :
                  obj.status === 'completed' ? 'bg-gray-100 text-gray-500' : 'bg-yellow-100 text-yellow-700'
                  }`}>{obj.status}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingObj(obj)} className="p-2 bg-gray-50 text-gray-600 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => handleDeleteObject(obj.id)} className="p-2 bg-red-50 text-red-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- PRICES TAB --- */}
      {activeTab === 'prices' && (
        <div className="space-y-4">
          <button onClick={() => setEditingPrice({ name: '', price: undefined, category: '' })} className="w-full py-3 bg-brand-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30">
            <Plus className="w-5 h-5" /> Добавить услугу
          </button>
          <div className="space-y-2">
            {priceList.map(item => (
              <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                <div className="flex-1 pr-4">
                  <div className="text-xs text-gray-400 font-bold uppercase mb-0.5">{item.category}</div>
                  <div className="font-medium text-gray-900">{item.name}</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-bold text-gray-700">{item.price} ₽</div>
                  </div>
                  <button onClick={() => setEditingPrice(item)} className="p-2 bg-gray-50 text-gray-600 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDeletePrice(item.id)} className="p-2 bg-red-50 text-red-500 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- GENERAL DOCS TAB --- */}
      {activeTab === 'docs' && (
        <div className="space-y-4">
          <button onClick={() => setEditingDoc({ title: '', type: 'text', content: '' })} className="w-full py-3 bg-brand-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30">
            <Plus className="w-5 h-5" /> Добавить в Общую Базу
          </button>
          {generalDocs.map(doc => (
            <div key={doc.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
              <div
                className="flex items-center gap-3 overflow-hidden flex-1 cursor-pointer"
                onClick={() => {
                  if (doc.url) window.open(doc.url, '_blank');
                  else if (doc.content) alert(doc.content);
                }}
              >
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  {doc.type === 'link' ? <ExternalLink className="w-5 h-5 text-blue-500" /> :
                    doc.type === 'pdf' ? <FileText className="w-5 h-5 text-red-500" /> :
                      doc.type === 'docx' ? <FileText className="w-5 h-5 text-blue-600" /> :
                        doc.type === 'img' ? <ImageIcon className="w-5 h-5 text-purple-500" /> :
                          <FileText className="w-5 h-5 text-gray-500" />}
                </div>
                <div className="truncate flex-1">
                  <div className="font-medium text-gray-900 truncate">{doc.title}</div>
                  <div className="text-xs text-gray-400">
                    {doc.type === 'link' ? 'Веб-ссылка' :
                      doc.type === 'pdf' ? 'PDF документ' :
                        doc.type === 'docx' ? 'Word документ' :
                          doc.type === 'img' ? 'Изображение' : 'Текст'}
                  </div>
                </div>
                {(doc.type === 'pdf' || doc.type === 'docx' || doc.type === 'img') && doc.url && (
                  <Download className="w-4 h-4 text-gray-300 mr-2" />
                )}
              </div>
              <button onClick={() => handleDeleteDoc(doc.id)} className="p-2 bg-red-50 text-red-500 rounded-lg flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}

      {/* --- MODALS --- */}
      {/* Object Modal */}
      {editingObj && (
        <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">{editingObj.id ? 'Редактировать' : 'Новый объект'}</h3>
            <div className="space-y-4">
              <input value={editingObj.name} onChange={e => setEditingObj({ ...editingObj, name: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Название" />
              <input value={editingObj.address} onChange={e => setEditingObj({ ...editingObj, address: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Адрес" />
              <select value={editingObj.status} onChange={e => setEditingObj({ ...editingObj, status: e.target.value as any })} className="w-full p-2 border border-gray-300 rounded-lg bg-white">
                <option value="active">Активен</option>
                <option value="maintenance">Обслуживание</option>
                <option value="completed">Завершен</option>
              </select>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setEditingObj(null)} className="flex-1 py-2 text-gray-500" disabled={isLoading}>Отмена</button>
                <button onClick={handleSaveObject} className="flex-1 py-2 bg-brand-600 text-white rounded-lg flex items-center justify-center gap-2" disabled={isLoading}>
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Price Modal */}
      {editingPrice && (
        <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="text-lg font-bold mb-4">{editingPrice.id ? 'Услуга' : 'Новая услуга'}</h3>
            <div className="space-y-4">
              <input value={editingPrice.name} onChange={e => setEditingPrice({ ...editingPrice, name: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Название" />
              <input list="categories" value={editingPrice.category} onChange={e => setEditingPrice({ ...editingPrice, category: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Категория" />
              <datalist id="categories">{existingCategories.map(cat => <option key={cat} value={cat} />)}</datalist>
              <input type="number" value={editingPrice.price === undefined || editingPrice.price === 0 ? '' : editingPrice.price} onChange={e => setEditingPrice({ ...editingPrice, price: Number(e.target.value) })} className="w-full p-3 border border-gray-300 rounded-xl text-xl font-bold" placeholder="0" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setEditingPrice(null)} className="flex-1 py-2 text-gray-500" disabled={isLoading}>Отмена</button>
              <button onClick={handleSavePrice} className="flex-1 py-2 bg-brand-600 text-white rounded-lg flex items-center justify-center gap-2" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doc Modal */}
      {editingDoc && (
        <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Общий документ</h3>
            <div className="space-y-4">
              {/* File Upload Section */}
              {!editingDoc.id && (
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="admin-file-upload"
                  />

                  {!selectedFile ? (
                    <label
                      htmlFor="admin-file-upload"
                      className="flex flex-col items-center cursor-pointer py-4"
                    >
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-sm text-gray-600 font-medium">Загрузить файл</span>
                      <span className="text-xs text-gray-400 mt-1">PDF, DOCX, PNG, JPG до 10 МБ</span>
                    </label>
                  ) : (
                    <div className="space-y-3">
                      {filePreview && (
                        <div className="relative">
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="w-full h-32 object-cover rounded-lg"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center gap-2 min-w-0">
                          {(() => {
                            const ext = getFileExtension(selectedFile.name);
                            if (ext === 'pdf') return <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />;
                            if (ext === 'docx') return <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />;
                            return <ImageIcon className="w-5 h-5 text-purple-500 flex-shrink-0" />;
                          })()}
                          <span className="text-sm truncate">{selectedFile.name}</span>
                        </div>
                        <button
                          onClick={clearFileSelection}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          <X className="w-4 h-4 text-gray-500" />
                        </button>
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <p className="text-sm text-red-500 mt-2">{uploadError}</p>
                  )}
                </div>
              )}

              {/* Divider - only show if creating new doc */}
              {!editingDoc.id && !selectedFile && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-white text-gray-400">или добавить вручную</span>
                  </div>
                </div>
              )}

              <input value={editingDoc.title} onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="Название" />

              {!selectedFile && (
                <>
                  <select value={editingDoc.type} onChange={e => setEditingDoc({ ...editingDoc, type: e.target.value as any })} className="w-full p-2 border border-gray-300 rounded-lg bg-white">
                    <option value="text">Текст</option>
                    <option value="link">Ссылка</option>
                  </select>
                  {editingDoc.type === 'link' ? (
                    <input value={editingDoc.url} onChange={e => setEditingDoc({ ...editingDoc, url: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg" placeholder="https://..." />
                  ) : (
                    <textarea value={editingDoc.content} onChange={e => setEditingDoc({ ...editingDoc, content: e.target.value })} className="w-full p-2 border border-gray-300 rounded-lg h-24" placeholder="Содержимое..." />
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setEditingDoc(null); clearFileSelection(); }} className="flex-1 py-2 text-gray-500" disabled={isLoading}>Отмена</button>
              <button onClick={handleSaveDoc} className="flex-1 py-2 bg-brand-600 text-white rounded-lg flex items-center justify-center gap-2" disabled={isLoading || (!selectedFile && (!editingDoc.title || !editingDoc.type))}>
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {selectedFile ? 'Загрузить' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminView;
