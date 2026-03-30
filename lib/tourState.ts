import { useState, useEffect } from 'react';

export type TourType = 'full' | 'dashboard_overview' | 'create_event' | 'settings' | 'concept' | null;

export interface TourState {
  isActive: boolean;
  tourType: TourType;
  stepIndex: number;
}

const TOUR_STATE_KEY = 'coroai_tour_state';

export const getTourState = (): TourState => {
  try {
    const stored = localStorage.getItem(TOUR_STATE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Failed to parse tour state', e);
  }
  return { isActive: false, tourType: null, stepIndex: 0 };
};

export const setTourState = (state: Partial<TourState>) => {
  const current = getTourState();
  const next = { ...current, ...state };
  localStorage.setItem(TOUR_STATE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('tour_update', { detail: next }));
};

export const useTourState = () => {
  const [state, setState] = useState<TourState>(getTourState());

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<TourState>;
      setState(customEvent.detail);
    };

    window.addEventListener('tour_update', handleUpdate);
    return () => window.removeEventListener('tour_update', handleUpdate);
  }, []);

  return {
    ...state,
    startTour: (type: TourType) => setTourState({ isActive: true, tourType: type, stepIndex: 0 }),
    stopTour: () => setTourState({ isActive: false, tourType: null, stepIndex: 0 }),
    setStep: (index: number) => setTourState({ stepIndex: index }),
    nextStep: () => setTourState({ stepIndex: state.stepIndex + 1 }),
  };
};
