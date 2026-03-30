import React, { useEffect, useState } from 'react';
import { Joyride, EventData, STATUS, Step } from 'react-joyride';
import { useTourState, setTourState } from '../lib/tourState';
import { getTourSteps } from '../lib/tourSteps';

export const TourProvider: React.FC = () => {
  const { isActive, tourType, stepIndex } = useTourState();
  const [steps, setSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const lang = (localStorage.getItem('vendor_language') as 'en' | 'id') || 'en';

  useEffect(() => {
    if (isActive && tourType) {
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
  }, [isActive, tourType, lang]);

  const handleJoyrideCallback = (data: EventData) => {
    const { status, type, index, action } = data;
    
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
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

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      onEvent={handleJoyrideCallback}
      options={{
        primaryColor: '#bc13fe',
        zIndex: 10000,
        showProgress: true,
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
