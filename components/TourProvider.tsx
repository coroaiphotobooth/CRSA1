import React, { useEffect, useState } from 'react';
import { Joyride, EventData, STATUS, Step, TooltipRenderProps } from 'react-joyride';
import { useTourState, setTourState } from '../lib/tourState';
import { getTourSteps } from '../lib/tourSteps';
import { motion } from 'motion/react';
import { useLocation } from 'react-router-dom';

const CustomTooltip = ({
  continuous,
  index,
  step,
  backProps,
  closeProps,
  primaryProps,
  tooltipProps,
  isLastStep,
}: TooltipRenderProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="bg-[#111]/80 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-2xl shadow-[#bc13fe]/20 max-w-sm w-full relative z-[10000]"
      {...tooltipProps}
    >
      {step.title && (
        <h3 className="text-lg font-bold text-white mb-2 tracking-wide uppercase">
          {step.title}
        </h3>
      )}
      <div className="text-gray-300 text-sm mb-6 leading-relaxed">
        {step.content}
      </div>
      {(!step.buttons || step.buttons.length > 0) && (
        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-2">
            {index > 0 && (!step.buttons || step.buttons.includes('back')) && (
              <button
                {...backProps}
                className="px-4 py-2 border border-white/20 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors uppercase tracking-widest"
              >
                {backProps.title || 'Back'}
              </button>
            )}
            {(!step.buttons || step.buttons.includes('skip') || step.buttons.includes('close')) && (
              <button
                {...closeProps}
                className="px-4 py-2 border border-white/20 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors uppercase tracking-widest"
              >
                {closeProps.title || 'Skip'}
              </button>
            )}
          </div>
          {(!step.buttons || step.buttons.includes('primary')) && (
            <button
              {...primaryProps}
              className="px-6 py-2 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg text-xs font-bold transition-colors uppercase tracking-widest"
            >
              {primaryProps.title || (isLastStep ? 'Finish' : 'Next')}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

export const TourProvider: React.FC = () => {
  const { isActive, tourType, stepIndex } = useTourState();
  const [steps, setSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const location = useLocation();
  const lang = (localStorage.getItem('vendor_language') as 'en' | 'id') || 'en';

  useEffect(() => {
    // Disable tour on pages other than dashboard and admin
    const isAllowedPath = location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/admin');
    if (isActive && tourType && isAllowedPath) {
      const allSteps = getTourSteps(lang);
      let currentSteps: Step[] = [];
      
      if (tourType === 'full') {
        // Full tour combines everything
        currentSteps = [
          ...allSteps.dashboard_overview,
          ...allSteps.create_event,
          ...allSteps.app,
          ...allSteps.settings,
          ...allSteps.concept,
          ...allSteps.finish
        ];
      } else if (tourType === 'dashboard_overview') {
        currentSteps = allSteps.dashboard_overview;
      } else if (tourType === 'create_event') {
        currentSteps = allSteps.create_event;
      } else if (tourType === 'settings') {
        currentSteps = allSteps.settings;
      } else if (tourType === 'concept') {
        currentSteps = allSteps.concept;
      }
      
      setSteps(currentSteps);
      setRun(true);
    } else {
      setRun(false);
    }
  }, [isActive, tourType, lang, location.pathname]);

  const handleJoyrideCallback = (data: EventData) => {
    const { status, type, index, action } = data;
    
    if ([STATUS.FINISHED, STATUS.SKIPPED, 'error', 'paused'].includes(status as any) || type === 'error:target_not_found') {
      setRun(false);
      setTourState({ isActive: false, tourType: null, stepIndex: 0 });
    } else if (type === 'step:after') {
      // Update step index globally
      if (action === 'next') {
        setTourState({ stepIndex: index + 1 });
      } else if (action === 'prev') {
        setTourState({ stepIndex: index - 1 });
      }
    }
  };

  const isAllowedPath = location.pathname.startsWith('/dashboard') || location.pathname.startsWith('/admin');
  if (!isAllowedPath || !isActive) {
    return null;
  }

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep={true}
      onEvent={handleJoyrideCallback}
      tooltipComponent={CustomTooltip}
      options={{
        primaryColor: '#bc13fe',
        zIndex: 10000,
        showProgress: true,
        overlayClickAction: false,
        scrollOffset: 100,
        closeButtonAction: 'skip',
      }}
      styles={{
        buttonClose: {
          display: 'none',
        },
      }}
      locale={{
        back: lang === 'id' ? 'Kembali' : 'Back',
        close: lang === 'id' ? 'Tutup' : 'Close',
        last: lang === 'id' ? 'Selesai' : 'Finish',
        next: lang === 'id' ? 'Lanjut' : 'Next',
        skip: lang === 'id' ? 'Batal Tour' : 'Cancel Tour',
      }}
    />
  );
};
