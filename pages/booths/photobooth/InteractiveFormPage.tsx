import React, { useState } from 'react';
import { Settings, ArrowRight, ArrowLeft } from 'lucide-react';
import { PhotoboothSettings } from '../../../types';

interface InteractiveFormPageProps {
  pageConfig: any;
  settings: PhotoboothSettings;
  onNext: (formData: any) => void;
  onBack: () => void;
  onAdmin?: () => void;
}

const InteractiveFormPage: React.FC<InteractiveFormPageProps> = ({ pageConfig, settings, onNext, onBack, onAdmin }) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fields = pageConfig?.fields || [];

  const handleInputChange = (fieldId: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrs = { ...prev };
        delete newErrs[fieldId];
        return newErrs;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;
    const newErrors: Record<string, string> = {};

    fields.forEach((field: any) => {
      if (field.required && !formData[field.id]) {
        newErrors[field.id] = 'Field ini wajib diisi';
        hasError = true;
      }
    });

    if (hasError) {
      setErrors(newErrors);
      return;
    }

    onNext(formData);
  };

  const formStyle = pageConfig?.formStyle || 'card';

  const formFields = (
    <form onSubmit={handleSubmit} className="space-y-6 w-full">
      {fields.map((field: any) => (
        <div key={field.id} className="flex flex-col text-left">
          <label className="text-xs font-bold tracking-widest text-[#bc13fe] uppercase mb-2 ml-1 drop-shadow-md">
            {field.label} {field.required && <span className="text-red-500">*</span>}
          </label>
          
          {field.type === 'textarea' ? (
            <textarea
              className={`w-full ${formStyle === 'split' || formStyle === 'floating' ? 'bg-black/60 border-white/20' : 'bg-black/50 border-white/20'} backdrop-blur-md border ${errors[field.id] ? '!border-red-500' : ''} rounded-2xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#bc13fe] focus:ring-1 focus:ring-[#bc13fe] transition-all resize-none h-32 shadow-inner`}
              placeholder={`Masukkan ${field.label?.toLowerCase() || 'jawaban'}...`}
              value={formData[field.id] || ''}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
            />
          ) : field.type === 'radio' ? (
            <div className={`flex flex-col gap-3 ${errors[field.id] ? 'p-2 border border-red-500 rounded-xl' : ''}`}>
              {(field.options || '').split(',').map((opt: string, i: number) => {
                const val = opt.trim();
                if (!val) return null;
                const isChecked = formData[field.id] === val;
                return (
                  <label key={i} className={`flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-black/40 cursor-pointer transition-all hover:bg-white/10 ${isChecked ? 'border-[#bc13fe] bg-white/10' : ''}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isChecked ? 'border-[#bc13fe] bg-[#bc13fe]' : 'border-gray-500'}`}>
                      {isChecked && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <input 
                      type="radio" 
                      name={field.id}
                      value={val}
                      checked={isChecked}
                      onChange={(e) => handleInputChange(field.id, e.target.value)}
                      className="hidden"
                    />
                    <span className="text-white text-sm">{val}</span>
                  </label>
                );
              })}
            </div>
          ) : field.type === 'checkbox' ? (
            <div className={`flex flex-col gap-3 ${errors[field.id] ? 'p-2 border border-red-500 rounded-xl' : ''}`}>
              {(field.options || '').split(',').map((opt: string, i: number) => {
                const val = opt.trim();
                if (!val) return null;
                const currentVals = formData[field.id] ? formData[field.id].split(',').map((v:string) => v.trim()) : [];
                const isChecked = currentVals.includes(val);
                return (
                  <label key={i} className={`flex items-center gap-4 p-4 rounded-xl border border-white/10 bg-black/40 cursor-pointer transition-all hover:bg-white/10 ${isChecked ? 'border-[#bc13fe] bg-white/10' : ''}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${isChecked ? 'border-[#bc13fe] bg-[#bc13fe]' : 'border-gray-500'}`}>
                      {isChecked && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                    </div>
                    <input 
                      type="checkbox" 
                      value={val}
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleInputChange(field.id, [...currentVals, val].filter(Boolean).join(', '));
                        } else {
                          handleInputChange(field.id, currentVals.filter((v:string) => v !== val).filter(Boolean).join(', '));
                        }
                      }}
                      className="hidden"
                    />
                    <span className="text-white text-sm">{val}</span>
                  </label>
                );
              })}
            </div>
          ) : field.type === 'select' ? (
            <select
              className={`w-full ${formStyle === 'split' || formStyle === 'floating' ? 'bg-black/60 border-white/20' : 'bg-black/50 border-white/20'} backdrop-blur-md border ${errors[field.id] ? '!border-red-500' : ''} rounded-2xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#bc13fe] focus:ring-1 focus:ring-[#bc13fe] transition-all shadow-inner appearance-none`}
              value={formData[field.id] || ''}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
            >
              <option value="" disabled>Pilih {field.label?.toLowerCase() || 'pilihan'}</option>
              {(field.options || '').split(',').map((opt: string, i: number) => {
                const val = opt.trim();
                return val ? <option key={i} value={val}>{val}</option> : null;
              })}
            </select>
          ) : (
            <input
              type={field.type === 'email' ? 'email' : field.type === 'number' ? 'tel' : field.type === 'date' ? 'date' : 'text'}
              className={`w-full ${formStyle === 'split' || formStyle === 'floating' ? 'bg-black/60 border-white/20' : 'bg-black/50 border-white/20'} backdrop-blur-md border ${errors[field.id] ? '!border-red-500' : ''} rounded-2xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#bc13fe] focus:ring-1 focus:ring-[#bc13fe] transition-all shadow-inner`}
              placeholder={`Masukkan ${field.label?.toLowerCase() || 'jawaban'}...`}
              value={formData[field.id] || ''}
              onChange={(e) => handleInputChange(field.id, e.target.value)}
            />
          )}
          
          {errors[field.id] && (
            <p className="text-red-500 text-[10px] mt-1 ml-2 drop-shadow-md">{errors[field.id]}</p>
          )}
        </div>
      ))}

      <div className="flex gap-4 pt-6">
        {pageConfig?.showBackButton !== false && (
          <button
            type="button"
            onClick={onBack}
            className={`px-6 py-4 rounded-2xl ${formStyle === 'split' || formStyle === 'floating' ? 'bg-black/50 border-white/20' : 'bg-white/5 border-white/10'} hover:bg-white/20 border text-white font-bold uppercase tracking-widest transition-all flex items-center justify-center backdrop-blur-sm shadow-lg`}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <button
          type="submit"
          className="flex-1 py-4 bg-gradient-to-r from-blue-600/90 to-[#bc13fe]/90 hover:from-blue-500 hover:to-[#bc13fe] text-white rounded-2xl text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(188,19,254,0.4)] hover:shadow-[0_0_30px_rgba(188,19,254,0.6)] border border-white/20 backdrop-blur-sm"
        >
          LANJUT <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </form>
  );

  const headerContent = (isSplit: boolean = false) => (
    <div className={`${isSplit ? 'text-left' : 'text-center mb-10'}`}>
      <h1 className={`${isSplit ? 'text-4xl md:text-5xl lg:text-6xl mb-6' : 'text-3xl md:text-4xl'} font-heading tracking-widest text-white uppercase font-bold text-shadow-glow drop-shadow-2xl`}>
        {pageConfig?.title || 'Form'}
      </h1>
      {pageConfig?.description && (
        <p className={`${isSplit ? 'text-lg md:text-xl' : 'text-sm mt-3'} text-gray-200 drop-shadow-lg font-medium`}>
          {pageConfig.description}
        </p>
      )}
    </div>
  );

  return (
    <div className={`w-full h-full min-h-screen flex flex-col justify-center p-6 lg:p-10 relative ${formStyle === 'split' ? 'items-stretch md:items-center' : 'items-center'}`}>
      {onAdmin && (
        <button 
          onClick={onAdmin}
          className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all shadow-xl backdrop-blur-md border border-white/10 z-50"
        >
          <Settings className="w-5 h-5 text-white/50 hover:text-white" />
        </button>
      )}
      
      {formStyle === 'floating' ? (
        // Floating Style - No Box Background
        <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-5 duration-500">
          {headerContent()}
          {formFields}
        </div>
      ) : formStyle === 'split' ? (
        // Split Style - Side by Side
        <div className="w-full max-w-6xl mx-auto flex flex-col md:flex-row gap-10 md:gap-16 lg:gap-24 items-center animate-in fade-in slide-in-from-bottom-5 duration-500">
          <div className="flex-1 w-full md:pr-10 md:border-r border-white/20">
            {headerContent(true)}
          </div>
          <div className="flex-1 w-full max-w-xl">
            {formFields}
          </div>
        </div>
      ) : (
        // Card Box Style (Default)
        <div className="w-full max-w-xl bg-black/40 backdrop-blur-2xl border border-white/10 shadow-[0_0_50px_rgba(188,19,254,0.15)] rounded-[2rem] p-8 md:p-12 animate-in fade-in slide-in-from-bottom-5 duration-500">
          {headerContent()}
          {formFields}
        </div>
      )}
    </div>
  );
};

export default InteractiveFormPage;
