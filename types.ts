
export interface Concept {
  id: string;
  concept_id?: string;
  name: string;
  prompt: string;
  thumbnail: string;
  refImage?: string; // Optional: Reference image for style/clothes/background
  refImage2?: string; // Optional: Second reference image
  reference_image_split?: string;
  reference_image_bg?: string;
  style_preset?: string;
  overlayImage?: string;
}

export interface TemplateConcept {
  id: string;
  name: string;
  prompt: string;
  thumbnail: string;
  ref_image?: string;
  ref_image_2?: string;
  created_at?: string;
}

export interface ConceptTemplate {
  id: string;
  vendor_id?: string | null;
  name: string;
  prompt: string;
  thumbnail?: string;
  reference_image_split?: string;
  reference_image_bg?: string;
  ref_image?: string;
  ref_image_2?: string;
  style_preset?: string;
  created_at?: string;
}

export interface EventRecord {
  id: string;
  name: string;
  description: string;
  folderId: string;
  createdAt: string;
  isActive: boolean;
  storage_folder?: string;
}

export type AspectRatio = '16:9' | '9:16' | '3:2' | '2:3';

export type MonitorTheme = 'physics' | 'grid' | 'hero' | 'slider';

export interface BartenderMenuItem {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
}

export interface UIDisplaySettings {
  eventNameSize: string;
  eventDescSize: string;
  fontFamily: string;
  buttonColor: string;
  glowColor?: string;
  fontColor?: string;
  conceptLayout: 'grid' | 'carousel';
  photoboothFlow: 'launch_concept_photo' | 'launch_photo_concept' | 'no_launch_concept_photo';
  launchLayout: 'split_left_right' | 'top_bottom' | 'background_only' | 'vip_checkin';
  showFrameDuringCapture: boolean;
  captureButtonPosition: 'bottom' | 'top_right';
  resultButtonsPosition: 'bottom' | 'right' | 'top';
  confirmPhotoBeforeGenerate?: boolean;
  themeEventInfoPosition?: 'none' | 'top' | 'bottom';
  processingStyle?: string;
  processingText?: string;
}

export interface PhotoboothSettings {
  title?: string;
  eventName: string;
  eventDescription: string;
  uiSettings?: UIDisplaySettings;
  vendor_id?: string;
  folderId: string;
  originalFolderId?: string; 
  storage_folder?: string;
  eventType?: 'photobooth' | 'interactive' | 'guestbook' | 'bartender' | 'registration';
  boothType?: 'standard' | 'interactive'; // Distinguish sub-types if eventType === 'photobooth' or 'interactive'
  interactiveFlow?: string[]; // Array of step ids like ['launch', 'form_1', 'concept_select', 'capture', 'result', 'thanks_1']
  interactivePages?: any[]; // Store custom page/form configs here
  bartenderMenu?: BartenderMenuItem[];
  spreadsheetId?: string; 
  selectedModel: string;
  gptModelSize?: '512' | '720' | '1024'; 
  overlayImage: string | null;
  backgroundImage: string | null;
  backgroundVideoUrl?: string | null; // New Field for Video Loop Background
  videoPrompt: string; 
  // enableVideoGeneration is deprecated in favor of boothMode
  enableVideoGeneration?: boolean; 
  videoResolution?: '480p' | '720p'; 
  videoModel?: string; // New Setting for Seedance Model ID
  boothMode?: 'photo' | 'video';
  selectedCameraId?: string;
  useDslr?: boolean; // New Setting: Enable DSLR via Wrapper
  dslrCameraId?: string; // New Setting: Selected DSLR Camera ID
  monitorImageSize?: 'small' | 'medium' | 'large'; 
  monitorTheme?: MonitorTheme; 
  processingMode?: 'normal' | 'fast'; 
  autoResetTime: number;
  adminPin: string;
  orientation: 'portrait' | 'landscape';
  outputRatio: AspectRatio;
  activeEventId?: string;
  cameraRotation: number;
  mirrorCamera?: boolean; // New Setting: Toggle mirror effect on camera preview
  countdownDuration?: 3 | 5; // New Setting: Camera countdown timer (3 or 5 seconds)
  promptMode?: 'raw' | 'wrapped' | 'booth'; // New Setting: 'raw' = free transform, 'wrapped' = strict face lock, 'booth' = outfit swap
  enableModelShortcut?: boolean; // New Setting: Show Quick Model Toggle on Camera
  enablePrint?: boolean; // New Setting: Enable Direct Printing Feature
  printMethod?: 'direct' | 'server'; // New Setting: Print Method
  enableDoublePrint?: boolean; // Legacy Setting: Double Print Layout (migrating to doublePrintMode)
  doublePrintMode?: 'disabled' | 'duplicate' | 'queue' | 'single_2r'; // 'duplicate' = duplicate same session, 'queue' = wait next
  printOrientation?: 'auto' | 'portrait' | 'landscape'; // Force hardware print layout
  printBrightness?: number; // Adjust printed brightness (-20 to +20)
  printTransparency?: number; // Adjust printed transparency/contrast (-20 to +20)
  enableSilentPrintWrapper?: boolean; // Windows App Wrapper specific flag
  enableVipMode?: boolean; // Temporary VIP Feature
  vipGuests?: any[]; // Temporary VIP Feature Data
  vipAppsScriptUrl?: string; // App Script Sync URL
  vipVideoIdleUrl?: string; // VIP Avatar Idle Video (MP4)
  vipVideoTalkingUrl?: string; // VIP Avatar Talking Video (MP4)
  vipOpenAiKey?: string; // OpenAI Key for TTS
  vipTtsVoice?: string; // Voice choice
  vipTtsSpeed?: number; // TTS speed multiplier (e.g., 1.0, 1.25)
  
  // Guestbook specific settings
  guestbookPhotoSize?: number; // Scale factor or width
  guestbookPhysicsSpeed?: number;
  guestbookFontSize?: number;
  guestbookCardStyle?: 'glass' | 'solid' | 'minimal';
  guestbookTextPosition?: 'bottom' | 'side';
  guestbookQrSize?: number;
  guestbookHideQr?: boolean;
  guestbookTitleSize?: number;
  guestbookDescSize?: number;
  guestbookSliderCount?: number;
  guestbookGridCount?: number;
  guestbookPhysicsCount?: number;
}

export interface GalleryItem {
  id: string;
  createdAt: string;
  updatedAt?: string; // NEW: For incremental sync
  conceptName: string;
  imageUrl: string;
  downloadUrl: string;
  token: string;
  eventId?: string;
  type?: 'image' | 'video';
  originalId?: string; 
  providerUrl?: string; 
  relatedPhotoId?: string; 
  // New Fields for Session & Queue
  sessionFolderId?: string;
  sessionFolderUrl?: string;
  videoStatus?: 'idle' | 'queued' | 'processing' | 'done' | 'failed' | 'ready_url' | 'uploading';
  videoTaskId?: string;
  videoFileId?: string; // ID File Video di Google Drive
  videoResolution?: string;
  videoModel?: string; // New Field in Sheet
}

export interface ProcessNotification {
  id: string;
  thumbnail: string;
  conceptName: string;
  status: 'processing' | 'completed' | 'failed';
  timestamp: number;
}

export enum AppState {
  LANDING = 'LANDING',
  THEMES = 'THEMES',
  CAMERA = 'CAMERA',
  GENERATING = 'GENERATING',
  RESULT = 'RESULT',
  GALLERY = 'GALLERY',
  ADMIN = 'ADMIN',
  MONITOR = 'MONITOR',
  FAST_THANKS = 'FAST_THANKS',
  INTERACTIVE_FLOW = 'INTERACTIVE_FLOW'
}

export interface Vendor {
  id: string;
  email: string;
  name: string;
  company_name?: string;
  country?: string;
  phone?: string;
  plan: 'free' | 'pay_as_you_go' | 'rent' | 'pro' | 'enterprise';
  credits: number;
  credits_used?: number;
  unlimited_seconds_left?: number;
  is_timer_running?: boolean;
  timer_last_started_at?: string | null;
  unlimited_expires_at?: string | null;
  created_at: string;
  is_blocked?: boolean;
  admin_message?: string;
  email_confirmed?: boolean;
  last_login_at?: string;
}

export interface VendorActivity {
  id: string;
  vendor_id: string;
  action: string;
  details?: any;
  created_at: string;
}

export interface Event {
  id: string;
  vendor_id: string;
  name: string;
  description: string;
  date: string;
  is_active: boolean;
  settings: PhotoboothSettings;
  created_at: string;
  storage_folder?: string;
  event_type?: string;
}

export interface Transaction {
  id: string;
  vendor_id: string;
  type: 'CREDIT' | 'UNLIMITED';
  amount: number;
  quantity: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
  doku_invoice_id?: string;
  created_at: string;
}
