import React, { createContext, useContext, useState, ReactNode } from 'react';
import { ViewMode } from '../types/weather';

interface ViewContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewContext = createContext<ViewContextType | undefined>(undefined);

export function ViewProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('dispatcher');

  return (
    <ViewContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewContext);
  if (!context) {
    throw new Error('useViewMode must be used within ViewProvider');
  }
  return context;
}
