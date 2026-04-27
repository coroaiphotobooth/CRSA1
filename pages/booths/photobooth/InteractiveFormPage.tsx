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

  return (
    <div className="w-full h-full min-h-screen flex flex-col items-center justify-center p-6 lg:p-10 relative">
      {onAdmin && (
        <button 
          onClick={onAdmin}
          className="absolute top-6 right-6 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all shadow-xl backdrop-blur-md border border-white/10"
        >
          <Settings className="w-5 h-5 text-white/50 hover:text-white" />
        </button>
      )}
      
      <div className="w-full max-w-xl bg-black/40 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-8 md:p-12 shadow-[0_0_50px_rgba(188,19,254,0.15)] animate-in fade-in slide-in-from-bottom-5 duration-500">
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-heading tracking-widest text-white uppercase font-bold text-shadow-glow">
            {pageConfig?.title || 'Form'}
          </h1>
          {pageConfig?.description && (
            <p className="mt-3 text-gray-400 text-sm">{pageConfig.description}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {fields.map((field: any) => (
            <div key={field.id} className="flex flex-col">
              <label className="text-xs font-bold tracking-widest text-[#bc13fe] uppercase mb-2 ml-1">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              
              {field.type === 'textarea' ? (
                <textarea
                  className={`w-full bg-black/50 border ${errors[field.id] ? 'border-red-500' : 'border-white/20'} rounded-2xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-[#bc13fe] focus:ring-1 focus:ring-[#bc13fe] transition-all resize-none h-32`}
                  placeholder={`Masukkan ${field.label?.toLowerCase() || 'jawaban'}...`}
                  value={formData[field.id] || ''}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                />
              ) : (
                <input
                  type={field.type === 'email' ? 'email' : field.type === 'number' ? 'tel' : field.type === 'date' ? 'date' : 'text'}
                  className={`w-full bg-black/50 border ${errors[field.id] ? 'border-red-500' : 'border-white/20'} rounded-2xl px-5 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-[#bc13fe] focus:ring-1 focus:ring-[#bc13fe] transition-all`}
                  placeholder={`Masukkan ${field.label?.toLowerCase() || 'jawaban'}...`}
                  value={formData[field.id] || ''}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                />
              )}
              
              {errors[field.id] && (
                <p className="text-red-500 text-[10px] mt-1 ml-2">{errors[field.id]}</p>
              )}
            </div>
          ))}

          <div className="flex gap-4 pt-6">
            <button
              type="button"
              onClick={onBack}
              className="px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold uppercase tracking-widest transition-all flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button
              type="submit"
              className="flex-1 py-4 bg-gradient-to-r from-blue-600/80 to-[#bc13fe]/80 hover:from-blue-500 hover:to-[#bc13fe] text-white rounded-2xl text-sm font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(188,19,254,0.3)] hover:shadow-[0_0_30px_rgba(188,19,254,0.5)] border border-white/10"
            >
              LANJUT <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InteractiveFormPage;
