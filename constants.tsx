
import { Concept, PhotoboothSettings } from './types';

export const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxH9LHFPmWozQOo2MmeEujd_PyIMY3AzTA9ANYEi5bGjxyu3YzG9pF4N4kjfiXnskk7/exec';

export const DEFAULT_CONCEPTS: Concept[] = [];

export const DEFAULT_SETTINGS: PhotoboothSettings = {
  eventName: 'COROAI PHOTOBOOTH',
  eventDescription: 'Transform Your Reality into Digital Art',
  folderId: '1knqeFCrMVhUlfzmuu-AVTkZmFF3Dnuqy',
  originalFolderId: '', // New Default
  spreadsheetId: '',
  selectedModel: 'gemini-3.1-flash-image-preview',
  gptModelSize: '1024',
  overlayImage: null,
  backgroundImage: null,
  backgroundVideoUrl: null, // New Default for Video Loop
  videoPrompt: 'Apply slow camera movement (push-in, push-out, pan, or parallax depth effect). Add subtle natural motion to the subject such as blinking, breathing, and micro expressions. Keep the face sharp, realistic, and undistorted.',
  enableVideoGeneration: true, // Deprecated but kept for type safety
  videoResolution: '480p', // Default 480p
  videoModel: 'seedance-1-0-pro-fast-251015', // Default Model
  boothMode: 'video', // Default mode
  selectedCameraId: '', // Default empty
  useDslr: false,
  dslrCameraId: '',
  monitorImageSize: 'medium',
  monitorTheme: 'physics', // Default theme
  processingMode: 'normal', // Default mode
  autoResetTime: 60,
  adminPin: '1234',
  orientation: 'portrait',
  outputRatio: '9:16',
  cameraRotation: 0,
  mirrorCamera: true, // Default to mirrored preview
  promptMode: 'wrapped', // Default: Wrapped (Safe/Strict)
  enableModelShortcut: false, // Default off
  enablePrint: false, // Default off
  printMethod: 'direct', // Default direct
  enableDoublePrint: false, // Default off
  enableVipMode: true,
  vipAppsScriptUrl: 'https://script.google.com/macros/s/AKfycbxUmgIA0fWFcjLE5r0vwdDAFTAjQqbhDHDSMmx0ky_sKZZQbXAfQwz8WoNRSYcJmam9/exec',
  vipVideoIdleUrl: 'https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO/LOOP%20IDLE.mp4',
  vipVideoTalkingUrl: 'https://ufxymelzgxshoopuphoj.supabase.co/storage/v1/object/public/DATA%20COROAI/VIDEO/TALKING.mp4',
};
