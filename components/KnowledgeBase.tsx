import React, { useState, useRef } from 'react';
import { ClientObject, DocItem } from '../types';
import { docsApi } from '../services/api';
import { FileText, Image as ImageIcon, Book, ChevronRight, Layers, Globe, ExternalLink, Plus, Loader2, Trash2, Upload, Download, X } from 'lucide-react';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'docx'];

interface KnowledgeBaseProps {
  objects: ClientObject[];
  generalDocs: DocItem[];
  isAdmin: boolean;
  onDocsUpdate: () => Promise<void>;
  onObjectsUpdate?: () => Promise<void>;
}

const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ objects, generalDocs, isAdmin, onDocsUpdate, onObjectsUpdate }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'objects'>('general');
  const [selectedObjId, setSelectedObjId] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<Partial<DocItem> & { objectId?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      setUploadError(`Файл слишком большой. Максимум ${MAX_FILE_SIZE / (1024 * 1024)} МБ`);
      return;
    }

    // Validate file type
    const ext = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setUploadError(`Неподдерживаемый формат. Разрешены: ${ALLOWED_EXTENSIONS.join(', ')}`);
      return;
    }

    setSelectedFile(file);

    // Create preview for images
    if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }

    // Auto-fill title if empty
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

  const renderDocIcon = (type: string) => {
      switch(type) {
          case 'link': return <ExternalLink className="w-5 h-5 text-blue-500" />;
          case 'img': return <ImageIcon className="w-5 h-5 text-purple-500" />;
          case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
          case 'docx': return <FileText className="w-5 h-5 text-blue-600" />;
          default: return <FileText className="w-5 h-5 text-gray-500" />;
      }
  };

  const renderDocTypeLabel = (doc: DocItem) => {
    if (doc.type === 'link') return 'Веб-ссылка';
    if (doc.type === 'pdf') return 'PDF документ';
    if (doc.type === 'docx') return 'Word документ';
    if (doc.type === 'img') return 'Изображение';
    if (doc.type === 'text') return 'Текст';
    return 'Документ';
  };

  const handleDocClick = (doc: DocItem) => {
      if (doc.type === 'link' && doc.url) {
          window.open(doc.url, '_blank');
      } else if ((doc.type === 'pdf' || doc.type === 'docx' || doc.type === 'img') && doc.url) {
          // Open file in new tab
          window.open(doc.url, '_blank');
      } else if (doc.type === 'text' && doc.content) {
          alert(doc.content);
      } else {
          alert(`Просмотр ${doc.type} пока не реализован полностью. \nСодержимое: ${doc.content || 'Файл...'}`);
      }
  };

  const handleSaveDoc = async () => {
    if (!editingDoc?.title) return;
    setIsLoading(true);
    
    try {
      // If we have a file, upload it
      if (selectedFile) {
        await docsApi.upload(selectedFile, editingDoc.title, editingDoc.objectId);
      } else if (editingDoc.type) {
        // Otherwise create a regular document (text or link)
        await docsApi.create({
          title: editingDoc.title,
          type: editingDoc.type,
          url: editingDoc.url,
          content: editingDoc.content,
          objectId: editingDoc.objectId
        });
      }
      
      await onDocsUpdate();
      // Если документ привязан к объекту, обновляем объекты тоже
      if (editingDoc.objectId && onObjectsUpdate) {
        await onObjectsUpdate();
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
      // Найти документ, чтобы узнать, к какому объекту он привязан
      const docToDelete = [...generalDocs, ...objects.flatMap(obj => obj.docs || [])].find(d => d.id === id);
      
      await docsApi.delete(id);
      await onDocsUpdate();
      // Если документ был привязан к объекту, обновляем объекты
      if (docToDelete && (docToDelete as any).objectId && onObjectsUpdate) {
        await onObjectsUpdate();
      }
    } catch (err) {
      console.error('Error deleting doc:', err);
      alert('Ошибка удаления');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 pb-24 min-h-screen bg-gray-50">
      <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Book className="w-6 h-6 text-brand-500" />
        База знаний
      </h1>

      {/* Tabs */}
      <div className="flex bg-gray-200 p-1 rounded-xl mb-6">
        <button
          onClick={() => setActiveTab('general')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'general' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
        >
          <Layers className="w-4 h-4" />
          Общее
        </button>
        <button
          onClick={() => setActiveTab('objects')}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'objects' ? 'bg-white shadow-sm text-brand-600' : 'text-gray-500'}`}
        >
          <Globe className="w-4 h-4" />
          По объектам
        </button>
      </div>

      {activeTab === 'general' ? (
          <div className="space-y-3">
              {isAdmin && (
                <button 
                  onClick={() => setEditingDoc({ title: '', type: 'text', content: '' })}
                  className="w-full py-3 bg-brand-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/30 mb-4"
                >
                  <Plus className="w-5 h-5" /> Добавить документ
                </button>
              )}
              {generalDocs.length > 0 ? generalDocs.map(doc => (
                  <div key={doc.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center">
                      <div 
                        onClick={() => handleDocClick(doc)} 
                        className="flex items-center flex-1 cursor-pointer active:scale-[0.99] transition-transform"
                      >
                          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mr-3 flex-shrink-0">
                              {renderDocIcon(doc.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 truncate">{doc.title}</div>
                              <div className="text-xs text-gray-400">{renderDocTypeLabel(doc)}</div>
                          </div>
                          {doc.type === 'link' && <ExternalLink className="w-4 h-4 text-gray-300" />}
                          {(doc.type === 'pdf' || doc.type === 'docx' || doc.type === 'img') && doc.url && (
                            <Download className="w-4 h-4 text-gray-300" />
                          )}
                      </div>
                      {isAdmin && (
                        <button 
                          onClick={() => handleDeleteDoc(doc.id)} 
                          className="ml-2 p-2 bg-red-50 text-red-500 rounded-lg flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                  </div>
              )) : (
                  <div className="text-center py-10 text-gray-400">Пусто</div>
              )}
          </div>
      ) : (
        <div className="space-y-4">
          {objects.map(obj => (
            <div key={obj.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
              <button 
                onClick={() => setSelectedObjId(selectedObjId === obj.id ? null : obj.id)}
                className="w-full p-4 flex items-center justify-between text-left active:bg-gray-50"
              >
                <div>
                  <h3 className="font-semibold text-gray-900">{obj.name}</h3>
                  <p className="text-xs text-gray-400 mt-1">{obj.docs?.length || 0} документов</p>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${selectedObjId === obj.id ? 'rotate-90' : ''}`} />
              </button>
              
              {selectedObjId === obj.id && (
                <div className="bg-gray-50 p-4 pt-0 space-y-2 border-t border-gray-100">
                    <div className="pt-2"></div>
                  {obj.docs && obj.docs.length > 0 ? (
                    obj.docs.map(doc => (
                      <div key={doc.id} className="flex items-center p-3 bg-white rounded-xl border border-gray-200">
                        <div 
                          onClick={() => handleDocClick(doc)} 
                          className="flex items-center flex-1 active:bg-gray-50 cursor-pointer"
                        >
                          <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center mr-3 flex-shrink-0">
                            {renderDocIcon(doc.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{doc.title}</div>
                            <div className="text-xs text-gray-500">{renderDocTypeLabel(doc)}</div>
                          </div>
                          {(doc.type === 'pdf' || doc.type === 'img') && doc.url && (
                            <Download className="w-4 h-4 text-gray-300 mr-2" />
                          )}
                        </div>
                        {isAdmin && (
                          <button 
                            onClick={() => handleDeleteDoc(doc.id)} 
                            className="ml-2 p-2 bg-red-50 text-red-500 rounded-lg flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-sm text-gray-400">Нет документов.</div>
                  )}
                  {isAdmin && (
                    <button 
                      onClick={() => setEditingDoc({ title: '', type: 'text', content: '', objectId: obj.id })}
                      className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 text-sm font-medium mt-2 hover:border-brand-300 hover:text-brand-500 transition-colors"
                    >
                      + Загрузить фото/док
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Doc Modal */}
      {editingDoc && (
        <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">
              {editingDoc.objectId ? 'Документ объекта' : 'Общий документ'}
            </h3>
            <div className="space-y-4">
              {/* File Upload Section */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                
                {!selectedFile ? (
                  <label 
                    htmlFor="file-upload"
                    className="flex flex-col items-center cursor-pointer py-4"
                  >
                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600 font-medium">Загрузить файл</span>
                    <span className="text-xs text-gray-400 mt-1">PDF, DOCX, PNG, JPG до 10 МБ</span>
                  </label>
                ) : (
                  <div className="space-y-3">
                    {/* File Preview */}
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

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-2 bg-white text-gray-400">или добавить вручную</span>
                </div>
              </div>

              <input 
                value={editingDoc.title} 
                onChange={e => setEditingDoc({...editingDoc, title: e.target.value})} 
                className="w-full p-2 border border-gray-300 rounded-lg" 
                placeholder="Название" 
              />
              
              {!selectedFile && (
                <>
                  <select 
                    value={editingDoc.type} 
                    onChange={e => setEditingDoc({...editingDoc, type: e.target.value as any})} 
                    className="w-full p-2 border border-gray-300 rounded-lg bg-white"
                  >
                    <option value="text">Текст</option>
                    <option value="link">Ссылка</option>
                  </select>
                  {editingDoc.type === 'link' ? (
                    <input 
                      value={editingDoc.url} 
                      onChange={e => setEditingDoc({...editingDoc, url: e.target.value})} 
                      className="w-full p-2 border border-gray-300 rounded-lg" 
                      placeholder="https://..." 
                    />
                  ) : (
                    <textarea 
                      value={editingDoc.content} 
                      onChange={e => setEditingDoc({...editingDoc, content: e.target.value})} 
                      className="w-full p-2 border border-gray-300 rounded-lg h-24" 
                      placeholder="Содержимое..." 
                    />
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => { setEditingDoc(null); clearFileSelection(); }} 
                className="flex-1 py-2 text-gray-500" 
                disabled={isLoading}
              >
                Отмена
              </button>
              <button 
                onClick={handleSaveDoc} 
                className="flex-1 py-2 bg-brand-600 text-white rounded-lg flex items-center justify-center gap-2" 
                disabled={isLoading || (!selectedFile && (!editingDoc.title || !editingDoc.type))}
              >
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

export default KnowledgeBase;
