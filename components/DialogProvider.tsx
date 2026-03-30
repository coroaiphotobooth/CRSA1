import React, { createContext, useContext, useState, ReactNode } from 'react';
import { X } from 'lucide-react';

type DialogType = 'alert' | 'confirm' | 'prompt';

interface DialogConfig {
  isOpen: boolean;
  type: DialogType;
  title: string;
  message: string;
  inputValue: string;
  onConfirm: (val?: string) => void;
  onCancel: () => void;
}

interface DialogContextType {
  showDialog: (type: DialogType, title: string, message: string) => Promise<string | boolean | null>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialogConfig, setDialogConfig] = useState<DialogConfig | null>(null);

  const showDialog = (type: DialogType, title: string, message: string): Promise<string | boolean | null> => {
    return new Promise((resolve) => {
      setDialogConfig({
        isOpen: true,
        type,
        title,
        message,
        inputValue: '',
        onConfirm: (val) => {
          setDialogConfig(null);
          resolve(type === 'prompt' ? (val || '') : true);
        },
        onCancel: () => {
          setDialogConfig(null);
          resolve(type === 'prompt' ? null : false);
        }
      });
    });
  };

  return (
    <DialogContext.Provider value={{ showDialog }}>
      {children}
      {dialogConfig && dialogConfig.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[10001]">
          <div className="bg-[#111]/80 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-full max-w-md relative">
            <button 
              onClick={dialogConfig.onCancel}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-4 text-white">{dialogConfig.title}</h2>
            <p className="text-gray-300 mb-6 text-sm whitespace-pre-wrap">{dialogConfig.message}</p>
            
            {dialogConfig.type === 'prompt' && (
              <input
                type="text"
                autoFocus
                value={dialogConfig.inputValue}
                onChange={(e) => setDialogConfig(prev => prev ? { ...prev, inputValue: e.target.value } : null)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe] mb-6"
                placeholder="Enter value..."
              />
            )}

            <div className="flex justify-end gap-3">
              {(dialogConfig.type === 'confirm' || dialogConfig.type === 'prompt') && (
                <button
                  onClick={dialogConfig.onCancel}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-bold transition-colors"
                >
                  CANCEL
                </button>
              )}
              <button
                onClick={() => dialogConfig.onConfirm(dialogConfig.inputValue)}
                className="px-4 py-2 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg text-sm font-bold transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
