import React, { memo, useMemo } from 'react';
import { ViewState } from '../types';
import { Home, Calendar, ClipboardCheck, Book } from 'lucide-react';

interface BottomNavProps {
  currentView: ViewState;
  onNavigate: (view: ViewState) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate }) => {
  const navItems = useMemo(() => [
    { id: 'dashboard' as ViewState, label: 'Главная', icon: Home },
    { id: 'schedule' as ViewState, label: 'График', icon: Calendar },
    { id: 'report' as ViewState, label: 'Отчет', icon: ClipboardCheck },
    { id: 'docs' as ViewState, label: 'База', icon: Book },
  ], []);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] pb-safe z-50">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex flex-col items-center justify-center w-full h-full space-y-1"
            >
              <item.icon 
                className={`w-6 h-6 transition-colors ${isActive ? 'text-brand-600' : 'text-gray-400'}`} 
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-[10px] font-medium ${isActive ? 'text-brand-600' : 'text-gray-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default memo(BottomNav);