import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Loader2, LogOut, Plus, Settings, Play, Image as ImageIcon, Video, Coins, Trash2, Download, CloudUpload, X, ShieldAlert, ArrowLeft, Palette } from 'lucide-react';
import { Vendor, Event } from '../types';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { robustFetch } from '../lib/appsScript';
import { useDialog } from '../components/DialogProvider';
import { DEFAULT_SETTINGS, DEFAULT_CONCEPTS, DEFAULT_GAS_URL } from '../constants';
import CinematicIntro from '../components/CinematicIntro';
import { useTourState, setTourState } from '../lib/tourState';
import ConceptStudio from './ConceptStudio';

export default function VendorDashboard() {
  const [activeTab, setActiveTab] = useState<'events' | 'concept_studio'>('events');
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [templateEvents, setTemplateEvents] = useState<Event[]>([]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default');
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [buyModalTab, setBuyModalTab] = useState<'credit' | 'event' | 'rent' | 'free'>('credit');
  const [instagramUsername, setInstagramUsername] = useState('');
  const [buyCurrency, setBuyCurrency] = useState<'IDR' | 'USD'>('IDR');
  const [creditAmount, setCreditAmount] = useState<number>(10);
  const [eventDuration, setEventDuration] = useState<number>(2);
  const [rentDuration, setRentDuration] = useState<'minggu' | 'bulan'>('minggu');
  const [newEventName, setNewEventName] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('AI PHOTOBOOTH EXPERIENCE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number, total: number } | null>(null);
  const [backupProgress, setBackupProgress] = useState<{ current: number, total: number, success: number, fail: number } | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showTourPrompt, setShowTourPrompt] = useState(false);
  const [showCreateEventTourPrompt, setShowCreateEventTourPrompt] = useState(false);
  const [showNextTutorialPrompt, setShowNextTutorialPrompt] = useState(false);
  const [showFinalTutorialHint, setShowFinalTutorialHint] = useState(false);
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const tutorialBtnRef = useRef<HTMLButtonElement>(null);
  const [language, setLanguage] = useState<'en' | 'id'>('en');
  const { showDialog } = useDialog();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const impersonatedVendorId = searchParams.get('vendorId');
  const { startTour, isActive, tourType, stepIndex, status } = useTourState();
  const prevTourTypeRef = useRef<string | null>(null);
  const prevIsActive = useRef(isActive);

  // Close modal if tour is skipped and modal is empty
  useEffect(() => {
    if (prevIsActive.current && !isActive && showCreateModal && !newEventName) {
      setShowCreateModal(false);
    }
    prevIsActive.current = isActive;
  }, [isActive, showCreateModal, newEventName]);

  useEffect(() => {
    if (!isActive && prevTourTypeRef.current === 'dashboard_overview' && status === 'finished') {
      setShowCreateEventTourPrompt(true);
    }
    if (!isActive && prevTourTypeRef.current === 'create_event' && status === 'finished') {
      setShowNextTutorialPrompt(true);
    }
    prevTourTypeRef.current = tourType;
  }, [isActive, tourType, status]);

  useEffect(() => {
    if (isActive && tourType === 'create_event') {
      if (stepIndex === 1) {
        setShowCreateModal(true);
      } else if (stepIndex === 2) {
        setShowCreateModal(false);
      }
    }
  }, [isActive, tourType, stepIndex]);

  useEffect(() => {
    const savedLang = localStorage.getItem('vendor_language');
    if (savedLang === 'en' || savedLang === 'id') {
      setLanguage(savedLang);
    }
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate('/login');
          return;
        }

        const isSuper = user.email === 'admin@coroai.app';
        setIsSuperAdmin(isSuper);

        const targetUserId = (isSuper && impersonatedVendorId) ? impersonatedVendorId : user.id;

        // Fetch Vendor Profile
        const { data: vendorData, error: vendorError } = await supabase
          .from('vendors')
          .select('*')
          .eq('id', targetUserId)
          .single();

        let currentVendor = vendorData;

        if (vendorError) {
          if (vendorError.code === 'PGRST116' && targetUserId === user.id) {
            // Fetch global settings to get default credits
            const { data: gsData } = await supabase
              .from('global_settings')
              .select('default_free_credits')
              .eq('id', 1)
              .single();
            
            const defaultCredits = gsData?.default_free_credits ?? 10;

            // Vendor doesn't exist, create it (only if not impersonating)
            const newVendor = {
              id: user.id,
              email: user.email || '',
              name: user.user_metadata?.full_name || user.user_metadata?.name || 'Vendor',
              company_name: user.user_metadata?.company_name || null,
              country: user.user_metadata?.country || null,
              phone: user.user_metadata?.phone || null,
              credits: defaultCredits,
              is_blocked: false,
              email_confirmed: !!user.email_confirmed_at
            };
            const { data: createdVendor, error: createError } = await supabase
              .from('vendors')
              .insert([newVendor])
              .select()
              .single();
              
            if (createError) {
              console.error("Error creating vendor:", createError);
              setErrorMsg(`Warning: Could not create your vendor profile in the database (${createError.message}). You may not be able to create events.`);
              currentVendor = { ...newVendor, created_at: new Date().toISOString() } as any;
            } else {
              currentVendor = createdVendor;
            }
          } else {
            console.error("Error fetching vendor:", vendorError);
            if (targetUserId === user.id) {
              // Fetch global settings to get default credits
              const { data: gsData } = await supabase
                .from('global_settings')
                .select('default_free_credits')
                .eq('id', 1)
                .single();
              const defaultCredits = gsData?.default_free_credits ?? 10;

              currentVendor = {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.full_name || 'Vendor',
                plan: 'free',
                credits: defaultCredits,
                created_at: new Date().toISOString(),
                is_blocked: false
              } as any;
            }
          }
        }

        if (currentVendor?.is_blocked) {
          // We show a dedicated UI for this now
        }

        // Fetch Events first to check if they are a new user
        const { data: eventsData, error: eventsError } = await supabase
          .from('events')
          .select('*')
          .eq('vendor_id', targetUserId)
          .order('created_at', { ascending: false });

        if (eventsError) {
          console.error("Error fetching events:", eventsError);
        } else {
          setEvents(eventsData || []);
        }

        // Fetch global settings for default template
        const { data: globalSettings, error: globalSettingsError } = await supabase
          .from('global_settings')
          .select('template_event_id')
          .eq('id', 1)
          .maybeSingle();
          
        if (globalSettingsError) {
          console.error("Error fetching global settings:", globalSettingsError);
        }
        
        if (globalSettings?.template_event_id) {
          setDefaultTemplateId(globalSettings.template_event_id);
        }

        // Fetch all templates (events owned by the super admin)
        const { data: superAdminId, error: rpcError } = await supabase.rpc('get_superadmin_id');
        
        if (rpcError) {
          // PGRST202 means the function doesn't exist yet (user hasn't run the SQL setup).
          // We silently fall back in this case to avoid alarming console errors.
          if (rpcError.code !== 'PGRST202') {
            console.error("Error calling get_superadmin_id RPC:", rpcError);
          }
        }

        if (superAdminId) {
          const { data: templatesData, error: templatesError } = await supabase
            .from('events')
            .select('*')
            .eq('vendor_id', superAdminId)
            .order('created_at', { ascending: false });
            
          if (templatesError) {
            console.error("Error fetching templates:", templatesError);
          }
          
          if (templatesData) {
            setTemplateEvents(templatesData);
          }
        } else {
          // Fallback if RPC fails or isn't created yet
          const { data: templatesData, error: templatesError } = await supabase
            .from('events')
            .select('*')
            .eq('description', 'Template for default event settings')
            .order('created_at', { ascending: false });
            
          if (templatesError) {
            console.error("Error fetching templates fallback:", templatesError);
          }
          
          if (templatesData) {
            setTemplateEvents(templatesData);
          }
        }

        // Check if we need to update existing vendor with metadata (only if not impersonating)
        if (targetUserId === user.id) {
          const metadataName = user.user_metadata?.full_name || user.user_metadata?.name;
          const isEmailConfirmed = !!user.email_confirmed_at;
          
          if (currentVendor && (currentVendor.name === 'Vendor' || !currentVendor.company_name || currentVendor.credits === 0 || currentVendor.credits === 100 || currentVendor.email_confirmed !== isEmailConfirmed)) {
              const updateData: any = {};
              if (currentVendor.name === 'Vendor' && metadataName) updateData.name = metadataName;
              if (!currentVendor.company_name && user.user_metadata?.company_name) updateData.company_name = user.user_metadata.company_name;
              if (!currentVendor.country && user.user_metadata?.country) updateData.country = user.user_metadata.country;
              if (!currentVendor.phone && user.user_metadata?.phone) updateData.phone = user.user_metadata.phone;
              if (currentVendor.email_confirmed !== isEmailConfirmed) updateData.email_confirmed = isEmailConfirmed;
              
              let grantingCredits = false;
              // Removed legacy credits granting logic that forced credits to 5

              if (Object.keys(updateData).length > 0) {
                  const { data: updatedVendor, error: updateError } = await supabase
                    .from('vendors')
                    .update(updateData)
                    .eq('id', user.id)
                    .select()
                    .single();
                    
                  if (!updateError && updatedVendor) {
                      currentVendor = updatedVendor;
                      if (grantingCredits) {
                          await supabase.auth.updateUser({
                              data: { credits_granted: true }
                          });
                      }
                  }
              }
          }
        }

        if (currentVendor) {
          const localSeenOnboarding = localStorage.getItem(`has_seen_onboarding_${user.id}`) === 'true';
          const localSeenTourPrompt = localStorage.getItem(`has_seen_tour_prompt_${user.id}`) === 'true';
          
          const needsOnboarding = !user.user_metadata?.has_seen_onboarding && !localSeenOnboarding;
          const needsTourPrompt = !user.user_metadata?.has_seen_tour_prompt && !localSeenTourPrompt && !isActive;

          if (needsOnboarding) {
            setShowOnboarding(true);
          } else if (needsTourPrompt) {
            setShowTourPrompt(true);
          } else if (!isActive) {
            setShowFinalTutorialHint(true);
            setTimeout(() => {
              setShowFinalTutorialHint(false);
            }, 5000);
          }
        }

        setVendor(currentVendor);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [navigate, impersonatedVendorId]);

  const handleLogout = async () => {
    setTourState({ isActive: false, tourType: null, stepIndex: 0 });
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleCloseTourPrompt = async (start: boolean) => {
    setShowTourPrompt(false);
    
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      localStorage.setItem(`has_seen_tour_prompt_${user.id}`, 'true');
    }

    try {
      await supabase.auth.updateUser({
        data: { has_seen_tour_prompt: true }
      });
    } catch (err) {
      console.error("Failed to save tour prompt status:", err);
    }

    if (start) {
      startTour('dashboard_overview');
    } else {
      setShowFinalTutorialHint(true);
      setTimeout(() => {
        setShowFinalTutorialHint(false);
      }, 5000);
    }
  };

  const [isCreating, setIsCreating] = useState(false);

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    if (!newEventName.trim()) return;
    if (isCreating) return;

    if (vendor.is_blocked) {
      await showDialog('alert', 'Account Blocked', 'Your account has been temporarily blocked by coro.ai. Please contact the admin at admin@coroai.app or send a message on WhatsApp at +6282381230888');
      return;
    }

    setIsCreating(true);
    try {
      // Generate folder name: companyname_eventname
      const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const companyName = vendor.company_name || vendor.name || 'vendor';
      const folderName = `${sanitizeName(companyName)}_${sanitizeName(newEventName.trim())}`;

      let initialSettings = { ...DEFAULT_SETTINGS };
      let initialConcepts: any[] = [...DEFAULT_CONCEPTS];
      let targetTemplateId: string | null = null;

      if (selectedTemplateId === 'default') {
        const { data: globalSettings } = await supabase
          .from('global_settings')
          .select('template_event_id')
          .eq('id', 1)
          .single();
        targetTemplateId = globalSettings?.template_event_id || null;
      } else if (selectedTemplateId !== 'empty') {
        targetTemplateId = selectedTemplateId;
      }

      if (targetTemplateId) {
        // Fetch template event settings
        const { data: templateEvent } = await supabase
          .from('events')
          .select('settings')
          .eq('id', targetTemplateId)
          .single();
        
        if (templateEvent?.settings) {
          initialSettings = { ...initialSettings, ...templateEvent.settings };
        }

        // Fetch template event concepts
        const { data: templateConcepts } = await supabase
          .from('concepts')
          .select('*')
          .eq('event_id', targetTemplateId);
        
        if (templateConcepts && templateConcepts.length > 0) {
          initialConcepts = templateConcepts;
        }
      }

      // Create folders in Supabase Storage by uploading a dummy .keep file
      const emptyBlob = new Blob([''], { type: 'text/plain' });
      
      await Promise.all([
        supabase.storage.from('photobooth').upload(`${folderName}/original/.keep`, emptyBlob, { upsert: true }),
        supabase.storage.from('photobooth').upload(`${folderName}/result/.keep`, emptyBlob, { upsert: true })
      ]);

      const { data, error } = await supabase
        .from('events')
        .insert([
          {
            vendor_id: vendor.id,
            name: newEventName.trim(),
            description: newEventDescription.trim(),
            storage_folder: folderName,
            settings: {
              ...initialSettings,
              eventName: newEventName.trim(),
              eventDescription: newEventDescription.trim(),
              storage_folder: folderName
            }
          }
        ])
        .select();

      if (error) throw error;
      if (data && data[0]) {
        const newEvent = data[0];
        
        // Insert default concepts for this event
        const conceptsToInsert = initialConcepts.map((concept, index) => {
          const isAlreadyTemplate = concept.concept_id?.startsWith('template_') || concept.id.startsWith('template_');
          return {
            id: crypto.randomUUID(),
            concept_id: isAlreadyTemplate ? (concept.concept_id || concept.id) : `template_${concept.id}`,
            vendor_id: vendor.id,
            event_id: newEvent.id,
            name: concept.name,
            prompt: concept.prompt,
            thumbnail: concept.thumbnail,
            ref_image: concept.ref_image || concept.refImage || null,
            reference_image_split: concept.reference_image_split || null,
            reference_image_bg: concept.reference_image_bg || null,
            style_preset: concept.style_preset || null
          };
        });

        if (conceptsToInsert.length > 0) {
          const { error: conceptsError } = await supabase
            .from('concepts')
            .insert(conceptsToInsert);

          if (conceptsError) {
            console.error("Failed to insert default concepts:", conceptsError);
            // Don't fail the whole event creation, just log it
          }
        }

        setEvents([newEvent, ...events]);
        setShowCreateModal(false);
        setNewEventName('');
        setNewEventDescription('AI PHOTOBOOTH EXPERIENCE');
        
        if (isActive && tourType === 'create_event') {
          setTourState({ stepIndex: 2 });
        }
      }
    } catch (err: any) {
      console.error("Failed to create event:", err);
      setErrorMsg(`Failed to create event: ${err.message || 'Unknown error'}. Please ensure your Supabase tables and policies are correctly set up.`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const confirmed = await showDialog('confirm', 'Remove Event', "Are you sure you want to remove this event? All data and settings in this event will be deleted.");
    if (confirmed) {
      try {
        const eventToDelete = events.find(e => e.id === eventId);

        const { error } = await supabase.from('events').delete().eq('id', eventId);
        if (error) throw error;

        if (eventToDelete?.storage_folder) {
          const folderPath = eventToDelete.storage_folder;
          const deleteFilesInPath = async (path: string) => {
            let hasMore = true;
            let iterations = 0;
            while (hasMore && iterations < 50) { // Max 5000 files to prevent infinite loop
              iterations++;
              const { data: files } = await supabase.storage.from('photobooth').list(path, { limit: 100 });
              if (files && files.length > 0) {
                const fileNames = files.filter(x => x.id).map(x => `${path}/${x.name}`);
                if (fileNames.length > 0) {
                  const { error: removeError } = await supabase.storage.from('photobooth').remove(fileNames);
                  if (removeError) {
                    console.error("Error removing files:", removeError);
                    break;
                  }
                } else {
                  hasMore = false;
                }
              } else {
                hasMore = false;
              }
            }
          };

          await deleteFilesInPath(`${folderPath}/original`);
          await deleteFilesInPath(`${folderPath}/result`);
          await deleteFilesInPath(folderPath);
        }

        setEvents(events.filter(e => e.id !== eventId));
      } catch (err: any) {
        console.error("Failed to delete event:", err);
        await showDialog('alert', 'Error', `Failed to delete event: ${err.message}`);
      }
    }
  };

  const handleDownloadAllData = async (eventId: string) => {
    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('event_id', eventId);

      if (error) throw error;
      if (!sessions || sessions.length === 0) {
        await showDialog('alert', 'Notice', "No data found for this event.");
        return;
      }

      let totalFiles = 0;
      sessions.forEach(s => {
        if (s.result_image_url) totalFiles++;
        if (s.result_video_url) totalFiles++;
      });

      if (totalFiles === 0) {
        await showDialog('alert', 'Notice', "No files found to download.");
        return;
      }

      setDownloadProgress({ current: 0, total: totalFiles });
      
      const zip = new JSZip();
      const folder = zip.folder(`event_${eventId}_data`);

      let count = 0;
      for (const session of sessions) {
        if (session.result_image_url) {
          try {
            const response = await fetch(session.result_image_url);
            const blob = await response.blob();
            folder?.file(`session_${session.id}_image.jpg`, blob);
            count++;
            setDownloadProgress({ current: count, total: totalFiles });
          } catch (e) {
            console.error(`Failed to download image for session ${session.id}`, e);
          }
        }
        if (session.result_video_url) {
          try {
            const response = await fetch(session.result_video_url);
            const blob = await response.blob();
            folder?.file(`session_${session.id}_video.mp4`, blob);
            count++;
            setDownloadProgress({ current: count, total: totalFiles });
          } catch (e) {
            console.error(`Failed to download video for session ${session.id}`, e);
          }
        }
      }

      if (count === 0) {
        await showDialog('alert', 'Notice', "No files could be downloaded.");
        setDownloadProgress(null);
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `event_${eventId}_data.zip`);
      setDownloadProgress(null);
      
    } catch (err: any) {
      console.error("Failed to download data:", err);
      await showDialog('alert', 'Error', `Failed to download data: ${err.message}`);
      setDownloadProgress(null);
    }
  };

  const handleBackupToDrive = async (eventId: string) => {
    const driveInput = await showDialog('prompt', 'Google Drive Backup', "Please enter your Google Drive Folder ID or URL.\n\nIMPORTANT: The folder must have General access set to 'Anyone on the internet with the link can edit'.");
    if (!driveInput || typeof driveInput !== 'string') return;

    let folderId = driveInput;
    const match = driveInput.match(/folders\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      folderId = match[1];
    } else if (driveInput.includes('id=')) {
      const urlParams = new URLSearchParams(driveInput.substring(driveInput.indexOf('?')));
      folderId = urlParams.get('id') || driveInput;
    }

    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('event_id', eventId);

      if (error) throw error;
      if (!sessions || sessions.length === 0) {
        await showDialog('alert', 'Notice', "No data found for this event.");
        return;
      }

      const gasUrl = DEFAULT_GAS_URL;

      if (!gasUrl) {
        await showDialog('alert', 'Error', "Google Apps Script URL not configured. Cannot backup to Google Drive.");
        return;
      }

      let totalFiles = 0;
      sessions.forEach(s => {
        if (s.result_image_url) totalFiles++;
        if (s.result_video_url) totalFiles++;
      });

      if (totalFiles === 0) {
        await showDialog('alert', 'Notice', "No files found to backup.");
        return;
      }

      setBackupProgress({ current: 0, total: totalFiles, success: 0, fail: 0 });

      let successCount = 0;
      let failCount = 0;
      let currentCount = 0;

      for (const session of sessions) {
        if (session.result_image_url) {
          try {
            const response = await fetch(session.result_image_url);
            const blob = await response.blob();
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            const base64Data = await base64Promise;

            const res = await robustFetch(gasUrl, {
              method: 'POST',
              body: JSON.stringify({
                action: 'uploadGenerated',
                image: base64Data,
                folderId,
                skipGallery: true
              })
            });
            if (res.ok) successCount++;
            else failCount++;
          } catch (e) {
            console.error("Backup failed for an image:", e);
            failCount++;
          }
          currentCount++;
          setBackupProgress({ current: currentCount, total: totalFiles, success: successCount, fail: failCount });
        }

        if (session.result_video_url) {
          try {
            const response = await fetch(session.result_video_url);
            const blob = await response.blob();
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            const base64Data = await base64Promise;

            const res = await robustFetch(gasUrl, {
              method: 'POST',
              body: JSON.stringify({
                action: 'uploadGeneratedVideo',
                image: base64Data,
                folderId,
                skipGallery: true
              })
            });
            if (res.ok) successCount++;
            else failCount++;
          } catch (e) {
            console.error("Backup failed for a video:", e);
            failCount++;
          }
          currentCount++;
          setBackupProgress({ current: currentCount, total: totalFiles, success: successCount, fail: failCount });
        }
      }

      setTimeout(async () => {
        setBackupProgress(null);
        await showDialog('alert', 'Success', `Backup complete! Successfully backed up ${successCount} files. Failed: ${failCount} files.`);
      }, 500);

    } catch (err: any) {
      console.error("Backup error:", err);
      setBackupProgress(null);
      await showDialog('alert', 'Error', `Backup failed: ${err.message}`);
    }
  };

  const translations = {
    en: {
      welcome: "Welcome back,",
      credits: "Credits",
      createEvent: "CREATE EVENT",
      buyCredits: "BUY CREDITS",
      totalEvents: "Total Events",
      currentPlan: "Current Plan",
      availableCredits: "Available Credits",
      launch: "LAUNCH",
      gallery: "GALLERY",
      settings: "SETTINGS",
      delete: "Delete",
      backup: "Backup to Google Drive",
      download: "Download All Data (ZIP)",
      logout: "Logout",
      backToAdmin: "Back to Super Admin",
      impersonating: "Impersonating",
      myEvents: "Your Events",
      noEvents: "No events found. Create your first photobooth event!",
      startEvent: "Please click \"Create Event\" to start the photobooth page.",
      conceptTip: "In \"Settings - Concept,\" you can create your own concept by entering a prompt and uploading a thumbnail image, or load one we provide for free.",
      downloading: "Downloading Data",
      pleaseWait: "Please wait, this might take a while depending on the number of files.",
      backingUp: "Backing up to Google Drive",
      doNotClose: "Please do not close this window.",
      createNewEvent: "Create New Event",
      eventName: "Event Name",
      eventDescription: "Event Description",
      template: "Template",
      cancel: "CANCEL",
      create: "CREATE",
      creating: "CREATING...",
      error: "Error",
      close: "CLOSE",
      messageFromCoroai: "Message from coroai",
      defaultAdminMessage: `Hi, welcome to Coroai!
- Please click "Create Event" to start the photobooth page.
- On the settings page, you can change the background, branding overlay, and other settings.
- In "Settings - Concept," you can create your own concept by entering a prompt and uploading a thumbnail image, or load one we provide for free.
- If you'd like a custom concept created for you, let us know via WhatsApp. We'll create a concept according to your request for free.
- Good luck, have fun!`
    },
    id: {
      welcome: "Selamat datang kembali,",
      credits: "Kredit",
      createEvent: "BUAT EVENT",
      buyCredits: "BELI KREDIT",
      totalEvents: "Total Event",
      currentPlan: "Paket Saat Ini",
      availableCredits: "Kredit Tersedia",
      launch: "MULAI",
      gallery: "GALERI",
      settings: "PENGATURAN",
      delete: "Hapus",
      backup: "Cadangkan ke Google Drive",
      download: "Unduh Semua Data (ZIP)",
      logout: "Keluar",
      backToAdmin: "Kembali ke Super Admin",
      impersonating: "Menyamar",
      myEvents: "Event Anda",
      noEvents: "Belum ada event. Buat event photobooth pertama Anda!",
      startEvent: "Silakan klik \"Buat Event\" untuk memulai halaman photobooth.",
      conceptTip: "Di \"Pengaturan - Konsep,\" Anda dapat membuat konsep Anda sendiri dengan memasukkan prompt dan mengunggah gambar thumbnail, atau memuat konsep yang kami sediakan secara gratis.",
      downloading: "Mengunduh Data",
      pleaseWait: "Harap tunggu, ini mungkin memakan waktu tergantung pada jumlah file.",
      backingUp: "Mencadangkan ke Google Drive",
      doNotClose: "Harap jangan tutup jendela ini.",
      createNewEvent: "Buat Event Baru",
      eventName: "Nama Event",
      eventDescription: "Deskripsi Event",
      template: "Template",
      cancel: "BATAL",
      create: "BUAT",
      creating: "MEMBUAT...",
      error: "Kesalahan",
      close: "TUTUP",
      messageFromCoroai: "Pesan dari coroai",
      defaultAdminMessage: `Hai, selamat datang di Coroai!
- Silakan klik "BUAT EVENT" untuk memulai halaman photobooth.
- Di halaman pengaturan, Anda dapat mengubah latar belakang, overlay branding, dan pengaturan lainnya.
- Di "PENGATURAN - KONSEP," Anda dapat membuat konsep sendiri dengan memasukkan prompt dan mengunggah gambar thumbnail, atau load template yang kami sediakan secara gratis.
- Jika Anda membutuhkan konsep khusus dibuat untuk Anda, beri tahu kami melalui WhatsApp. Kami akan membuatkan konsep sesuai permintaan Anda secara gratis.
- selamat mencoba, Terimakasih`
    }
  };

  const getCreditPriceIDR = (amount: number) => {
    if (amount < 10) return 100000;
    if (amount <= 1000) {
      return 100000 + Math.round(((amount - 10) * 6900000) / 990);
    }
    return amount * 7000;
  };

  const eventPrices: Record<number, number> = {
    2: 1500000,
    3: 1950000,
    4: 2400000,
    5: 2850000,
    6: 3300000,
    7: 3750000,
    8: 4200000,
    9: 4650000,
    10: 5100000,
    11: 5550000,
    12: 6000000,
  };

  const EXCHANGE_RATE = 15000;

  const formatPrice = (priceIDR: number) => {
    if (buyCurrency === 'IDR') {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(priceIDR);
    } else {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(priceIDR / EXCHANGE_RATE);
    }
  };

  const handleBuyWhatsApp = () => {
    let text = '';
    const isUSD = buyCurrency === 'USD';

    if (buyModalTab === 'free') {
      text = isUSD 
        ? `I want Free Credit\nInstagram username : ${instagramUsername}\nEmail : ${vendor?.email || ''}`
        : `Saya ingin Free Credit\nNama instagram : ${instagramUsername}\nEmail : ${vendor?.email || ''}`;
    } else {
      let packageName = '';
      let packageDetail = '';
      let totalPriceStr = '';

      if (buyModalTab === 'credit') {
        packageName = isUSD ? 'Buy Credit' : 'Beli Kredit';
        packageDetail = `${creditAmount} credit`;
        totalPriceStr = formatPrice(getCreditPriceIDR(creditAmount));
      } else if (buyModalTab === 'event') {
        packageName = isUSD ? 'Buy per Event - Unlimited Generate photo & video' : 'Beli per Event - Unlimited Generate photo & video';
        packageDetail = `${eventDuration} ${isUSD ? 'hours' : 'jam'}`;
        totalPriceStr = formatPrice(eventPrices[eventDuration]);
      } else {
        packageName = isUSD ? 'Rent Duration' : 'Durasi Sewa';
        packageDetail = isUSD ? `per ${rentDuration === 'minggu' ? 'week' : 'month'}` : `per ${rentDuration}`;
        totalPriceStr = isUSD ? 'Call for price' : 'Hubungi untuk harga';
      }

      text = isUSD 
        ? `Hi I want to buy ${packageName}\n${vendor?.email || 'Vendor Email'}\nSelected package: ${packageDetail}\nTotal price: ${totalPriceStr}`
        : `Hi saya ingin membeli ${packageName}\n${vendor?.email || 'Vendor Email'}\nPaket yang diambil: ${packageDetail}\nTotal harga: ${totalPriceStr}`;
    }

    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/6282381230888?text=${encodedText}`, '_blank');
  };

  const t = translations[language];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin text-[#bc13fe]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
      {showOnboarding && vendor && (
        <CinematicIntro 
          vendorName={vendor.name} 
          onComplete={async (lang) => {
            setLanguage(lang);
            localStorage.setItem('vendor_language', lang);
            
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              localStorage.setItem(`has_seen_onboarding_${user.id}`, 'true');
            }
            
            setShowOnboarding(false);
            if (!isActive) {
              setShowTourPrompt(true);
            }
            
            try {
              const { error } = await supabase.auth.updateUser({
                data: { has_seen_onboarding: true }
              });
              if (error) {
                console.error("Failed to save onboarding status:", error);
              }
            } catch (err) {
              console.error("Failed to save onboarding status:", err);
            }
          }} 
        />
      )}
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {isSuperAdmin && impersonatedVendorId && (
                <button
                  onClick={() => navigate('/superadmin')}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                  title={t.backToAdmin}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h1 className="text-3xl font-heading font-bold neon-text">DASHBOARD</h1>
            </div>
            <p className="text-gray-400">{t.welcome} {vendor?.name} {isSuperAdmin && impersonatedVendorId && <span className="text-yellow-400 text-xs ml-2 px-2 py-0.5 bg-yellow-400/10 rounded-full border border-yellow-400/30">{t.impersonating}</span>}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                ref={tutorialBtnRef}
                onClick={() => {
                  setShowTutorialMenu(!showTutorialMenu);
                  setShowFinalTutorialHint(false);
                }}
                className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-full font-bold transition-all text-sm border border-blue-500/30 tour-tutorial-btn"
              >
                {language === 'id' ? 'Tutorial' : 'Tutorial'}
              </button>
              {showTutorialMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-[#111] border border-white/10 rounded-xl shadow-xl overflow-hidden z-50">
                  <div className="py-2">
                    <button 
                      onClick={() => {
                        setShowTutorialMenu(false);
                        startTour('create_event');
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm transition-colors"
                    >
                      {language === 'id' ? 'Tutorial Create Event' : 'Create Event Tutorial'}
                    </button>
                    <button 
                      onClick={() => {
                        setShowTutorialMenu(false);
                        if (events.length > 0) {
                          navigate(`/admin/${events[0].id}`);
                          setTimeout(() => startTour('settings'), 500);
                        } else {
                          startTour('create_event');
                        }
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm transition-colors"
                    >
                      {language === 'id' ? 'Tutorial Settings App' : 'Settings App Tutorial'}
                    </button>
                    <button 
                      onClick={() => {
                        setShowTutorialMenu(false);
                        if (events.length > 0) {
                          navigate(`/admin/${events[0].id}?tab=concept`);
                          setTimeout(() => startTour('concept'), 500);
                        } else {
                          startTour('create_event');
                        }
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 text-sm transition-colors"
                    >
                      {language === 'id' ? 'Tutorial Create Concept' : 'Create Concept Tutorial'}
                    </button>
                  </div>
                </div>
              )}

              {/* Final Tutorial Hint */}
              <AnimatePresence>
                {showFinalTutorialHint && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-4 bg-[#111]/90 backdrop-blur-xl border border-[#bc13fe]/50 p-4 rounded-xl w-64 shadow-2xl shadow-[#bc13fe]/20 z-50"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-white font-bold text-sm">
                        {language === 'id' ? 'Butuh Bantuan?' : 'Need Help?'}
                      </h3>
                      <button 
                        onClick={() => setShowFinalTutorialHint(false)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-gray-300 text-xs">
                      {language === 'id' 
                        ? 'Jika anda membutuhkan tutorial membuat konsep atau cara settings app bisa klik disini' 
                        : 'If you need a tutorial on creating concepts or app settings, you can click here.'}
                    </p>
                    <div className="absolute -top-2 right-6 w-4 h-4 bg-[#111]/90 border-t border-l border-[#bc13fe]/50 transform rotate-45"></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {isSuperAdmin && !impersonatedVendorId && (
              <button
                onClick={() => navigate('/superadmin')}
                className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-full font-bold transition-all text-sm"
              >
                Super Admin
              </button>
            )}
            <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-white/10">
              <button 
                onClick={() => {
                  setLanguage('en');
                  localStorage.setItem('vendor_language', 'en');
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${language === 'en' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
              >
                EN
              </button>
              <button 
                onClick={() => {
                  setLanguage('id');
                  localStorage.setItem('vendor_language', 'id');
                }}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${language === 'id' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
              >
                ID
              </button>
            </div>
            <div className="glass-card px-4 py-2 rounded-full flex items-center gap-2 border border-[#bc13fe]/30">
              <Coins className="w-4 h-4 text-[#bc13fe]" />
              <span className="font-bold">{vendor?.credits} {t.credits}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors"
              title={t.logout}
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl mb-8">
            {errorMsg}
          </div>
        )}

        {vendor?.is_blocked && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-6 rounded-xl mb-8 flex items-start gap-4">
            <ShieldAlert className="w-8 h-8 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-bold mb-2">Account Blocked</h3>
              <p className="text-sm opacity-90">
                Your account has been temporarily blocked by coro.ai. Please contact the admin at <a href="mailto:admin@coroai.app" className="underline">admin@coroai.app</a> or send a message on WhatsApp at <a href="https://wa.me/6282381230888" className="underline">+6282381230888</a>
              </p>
            </div>
          </div>
        )}

        <div className="bg-blue-500/10 border border-blue-500/50 text-blue-400 p-6 rounded-xl mb-8 flex items-start gap-4">
          <div className="w-8 h-8 flex-shrink-0 mt-1 flex items-center justify-center bg-blue-500/20 rounded-full">
            <span className="text-blue-400 font-bold text-lg">i</span>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2">{t.messageFromCoroai}</h3>
            <p className="text-sm opacity-90 whitespace-pre-wrap">
              {vendor?.admin_message || t.defaultAdminMessage}
            </p>
          </div>
        </div>

        {/* Stats / Overview */}
        {activeTab === 'events' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="glass-card p-6 rounded-2xl border border-white/10 tour-total-events">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">{t.totalEvents}</h3>
            <p className="text-4xl font-bold">{events.length}</p>
          </div>
          <div className="glass-card p-6 rounded-2xl border border-white/10 tour-current-plan">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">{t.currentPlan}</h3>
            <p className="text-4xl font-bold capitalize text-[#bc13fe]">
              {vendor?.plan === 'pay_as_you_go' ? 'PAY AS YOU GO' : vendor?.plan === 'rent' ? 'RENT' : vendor?.plan}
            </p>
          </div>
          <div className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-[#bc13fe]/10 to-transparent flex flex-col tour-available-credits">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">{t.availableCredits}</h3>
            <p className="text-4xl font-bold">{vendor?.credits}</p>
            <div className="mt-auto pt-4 flex items-center justify-between">
              <p className="text-xs text-gray-500">1 Credit = 1 AI Generation</p>
              <button 
                onClick={() => setShowBuyCreditsModal(true)}
                className="text-xs bg-[#bc13fe] hover:bg-[#a010d8] text-white px-3 py-1.5 rounded-md font-bold transition-colors"
              >
                {t.buyCredits}
              </button>
            </div>
          </div>
        </div>

        {/* Events List */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-heading font-bold">{t.myEvents}</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('concept_studio')}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-sm transition-all flex items-center gap-2"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">Concept Studio</span>
            </button>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg font-bold text-sm transition-all flex items-center gap-2 tour-create-event-btn"
            >
              <Plus className="w-4 h-4" />
              {t.createEvent}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.length === 0 ? (
            <div className="col-span-full glass-card p-10 rounded-2xl border border-white/10 text-center text-gray-500 flex flex-col items-center justify-center tour-event-card">
              <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
              <p>{t.noEvents}</p>
            </div>
          ) : (
            events.map((event, index) => (
              <div key={event.id} className={`glass-card p-6 rounded-2xl border border-white/10 flex flex-col gap-4 hover:border-[#bc13fe]/50 transition-colors group ${index === 0 ? 'tour-event-card' : ''}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg mb-1">{event.name}</h3>
                    <p className="text-xs text-gray-400">{event.date ? new Date(event.date).toLocaleDateString() : new Date().toLocaleDateString()}</p>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${event.is_active !== false ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-gray-600'}`} title={event.is_active !== false ? 'Active' : 'Inactive'} />
                </div>
                
                <p className="text-sm text-gray-400 line-clamp-2">{event.description || 'New Photobooth Event'}</p>
                
                <div className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => navigate(`/app/${event.id}`)}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2 tour-app-page"
                    >
                      <Play className="w-3 h-3" />
                      {t.launch}
                    </button>
                    <button 
                      onClick={() => navigate(`/admin/${event.id}`)}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Settings className="w-3 h-3" />
                      {t.settings}
                    </button>
                    <button 
                      onClick={() => navigate(`/app/${event.id}?page=gallery`)}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <ImageIcon className="w-3 h-3" />
                      {t.gallery}
                    </button>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button 
                      onClick={() => handleDownloadAllData(event.id)}
                      className="flex-1 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                      title={t.download}
                    >
                      <Download className="w-3 h-3" />
                      {t.download}
                    </button>
                    <button 
                      onClick={() => handleBackupToDrive(event.id)}
                      className="flex-1 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                      title={t.backup}
                    >
                      <CloudUpload className="w-3 h-3" />
                      {t.backup}
                    </button>
                    <button 
                      onClick={() => handleDeleteEvent(event.id)}
                      className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                      title={t.delete}
                    >
                      <Trash2 className="w-3 h-3" />
                      {t.delete}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        </>
        ) : (
          <ConceptStudio vendorId={vendor?.id || ''} onClose={() => setActiveTab('events')} />
        )}

      </div>

      {/* Progress Modals */}
      {downloadProgress && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[10001]">
          <div className="bg-[#111]/80 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-full max-w-md text-center">
            <Loader2 className="w-12 h-12 text-[#bc13fe] animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t.downloading}</h2>
            <p className="text-gray-400 mb-4">{t.pleaseWait}</p>
            <div className="w-full bg-white/10 rounded-full h-4 mb-2 overflow-hidden">
              <div 
                className="bg-[#bc13fe] h-full transition-all duration-300" 
                style={{ width: `${(downloadProgress.current / downloadProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-sm font-bold">
              {downloadProgress.current} / {downloadProgress.total} files processed
              ({Math.round((downloadProgress.current / downloadProgress.total) * 100)}%)
            </p>
          </div>
        </div>
      )}

      {backupProgress && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[10001]">
          <div className="bg-[#111]/80 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-full max-w-md text-center">
            <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t.backingUp}</h2>
            <p className="text-gray-400 mb-4">{t.doNotClose}</p>
            <div className="w-full bg-white/10 rounded-full h-4 mb-2 overflow-hidden">
              <div 
                className="bg-green-500 h-full transition-all duration-300" 
                style={{ width: `${(backupProgress.current / backupProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-sm font-bold mb-2">
              {backupProgress.current} / {backupProgress.total} files processed
              ({Math.round((backupProgress.current / backupProgress.total) * 100)}%)
            </p>
            <div className="flex justify-center gap-4 text-xs">
              <span className="text-green-400">Success: {backupProgress.success}</span>
              <span className="text-red-400">Failed: {backupProgress.fail}</span>
            </div>
          </div>
        </div>
      )}

      {/* Buy Credits Modal */}
      {showBuyCreditsModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[10001]">
          <div className="bg-[#111]/90 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-full max-w-lg relative shadow-2xl">
            <button 
              onClick={() => setShowBuyCreditsModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center justify-between mb-4 pr-8">
              <h2 className="text-xl font-bold text-white">{buyCurrency === 'USD' ? 'Buy Package' : 'Beli Paket'}</h2>
            </div>

            {/* Info Message */}
            <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-xl mb-6">
              <p className="text-blue-200 text-xs leading-relaxed">
                {buyCurrency === 'USD' 
                  ? 'We apologize, currently purchases are made via WhatsApp. We are working on automatic payments, Qris, Visa, Mastercard, bank transfers, virtual accounts, and other payment methods.' 
                  : 'Mohon maaf saat ini pembelian dilakukan melalui whatsapp. Kami sedang memproses pembelian secara otomatis, Qris, Visa, Mastercard, transfer bank, virtual account, dan metode pembayaran lainya.'}
              </p>
            </div>

            {/* Currency Toggle */}
            <div className="flex justify-center mb-6">
              <div className="flex items-center bg-black/50 rounded-xl p-1.5 border border-white/10 w-full max-w-sm">
                <button
                  onClick={() => setBuyCurrency('USD')}
                  className={`flex-1 px-6 py-3 text-sm font-bold rounded-lg transition-colors ${buyCurrency === 'USD' ? 'bg-[#bc13fe] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                  USD
                </button>
                <button
                  onClick={() => setBuyCurrency('IDR')}
                  className={`flex-1 px-6 py-3 text-sm font-bold rounded-lg transition-colors ${buyCurrency === 'IDR' ? 'bg-[#bc13fe] text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                >
                  IDR
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-white/10 pb-2 overflow-x-auto hide-scrollbar">
              <button
                onClick={() => setBuyModalTab('credit')}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${buyModalTab === 'credit' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                {buyCurrency === 'USD' ? 'Buy Credit' : 'Beli Kredit'}
              </button>
              <button
                onClick={() => setBuyModalTab('event')}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${buyModalTab === 'event' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                {buyCurrency === 'USD' ? 'Unlimited / Event' : 'Unlimited / Event'}
              </button>
              <button
                onClick={() => setBuyModalTab('rent')}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${buyModalTab === 'rent' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                {buyCurrency === 'USD' ? 'Rent Duration' : 'Durasi Sewa'}
              </button>
              <button
                onClick={() => setBuyModalTab('free')}
                className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${buyModalTab === 'free' ? 'bg-[#bc13fe] text-white' : 'text-[#bc13fe] hover:text-white hover:bg-white/5'}`}
              >
                {buyCurrency === 'USD' ? 'Free Credit' : 'Kredit Gratis'}
              </button>
            </div>

            {/* Tab Content */}
            <div className="min-h-[150px] mb-8">
              {buyModalTab === 'credit' && (
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm text-gray-300 font-medium">{buyCurrency === 'USD' ? 'Amount of Credits' : 'Jumlah Kredit'}</label>
                      <input 
                        type="number" 
                        min="10" 
                        value={creditAmount || ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? 0 : parseInt(e.target.value);
                          if (!isNaN(val)) setCreditAmount(val);
                        }}
                        onBlur={() => {
                          if (creditAmount < 10) setCreditAmount(10);
                        }}
                        className="w-24 bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-white text-right focus:outline-none focus:border-[#bc13fe]"
                      />
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="1000" 
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(parseInt(e.target.value))}
                      className="w-full accent-[#bc13fe]"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>10</span>
                      <span>1000</span>
                    </div>
                  </div>
                  
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                    <span className="text-gray-400 text-sm">{buyCurrency === 'USD' ? 'Total Price' : 'Total Harga'}</span>
                    <span className="text-2xl font-bold text-[#bc13fe]">{formatPrice(getCreditPriceIDR(creditAmount))}</span>
                  </div>
                </div>
              )}

              {buyModalTab === 'event' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm text-gray-300 font-medium mb-2">{buyCurrency === 'USD' ? 'Event Duration' : 'Durasi Event'}</label>
                    <select 
                      value={eventDuration}
                      onChange={(e) => setEventDuration(parseInt(e.target.value))}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] appearance-none"
                    >
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(hours => (
                        <option key={hours} value={hours}>{hours} {buyCurrency === 'USD' ? 'Hours' : 'Jam'}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                    <span className="text-gray-400 text-sm">{buyCurrency === 'USD' ? 'Total Price' : 'Total Harga'}</span>
                    <span className="text-2xl font-bold text-[#bc13fe]">{formatPrice(eventPrices[eventDuration])}</span>
                  </div>
                </div>
              )}

              {buyModalTab === 'rent' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm text-gray-300 font-medium mb-2">{buyCurrency === 'USD' ? 'Rent Duration' : 'Durasi Sewa'}</label>
                    <select 
                      value={rentDuration}
                      onChange={(e) => setRentDuration(e.target.value as 'minggu' | 'bulan')}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe] appearance-none"
                    >
                      <option value="minggu">{buyCurrency === 'USD' ? 'Per Week' : 'Per Minggu'}</option>
                      <option value="bulan">{buyCurrency === 'USD' ? 'Per Month' : 'Per Bulan'}</option>
                    </select>
                  </div>
                  
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                    <span className="text-gray-400 text-sm">{buyCurrency === 'USD' ? 'Total Price' : 'Total Harga'}</span>
                    <span className="text-2xl font-bold text-white">{buyCurrency === 'USD' ? 'Call for price' : 'Hubungi untuk harga'}</span>
                  </div>
                </div>
              )}

              {buyModalTab === 'free' && (
                <div className="space-y-4">
                  <div className="bg-[#bc13fe]/10 border border-[#bc13fe]/30 p-4 rounded-xl">
                    <h3 className="text-[#bc13fe] font-bold mb-2">
                      {buyCurrency === 'USD' 
                        ? 'Get 30 to 50 free credits with the following conditions:' 
                        : 'Dapatkan gratis 30 hingga 50 credit dengan ketentuan :'}
                    </h3>
                    <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
                      <li>{buyCurrency === 'USD' ? "Share one of coro.ai's Instagram posts on your feed or story" : 'share salah satu postingan instagram coro.ai di feed atau story kamu'}</li>
                      <li>{buyCurrency === 'USD' ? 'Tag 10 of your friends and @coro.ai' : 'dan Tag 10 temanmu dan @coro.ai'}</li>
                      <li>{buyCurrency === 'USD' ? 'Then click buy via whatsapp' : 'lalu klik buy via whatsapp'}</li>
                    </ul>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 font-medium mb-2">
                      {buyCurrency === 'USD' ? 'Enter your Instagram username:' : 'Masukan username instagram :'}
                    </label>
                    <input 
                      type="text" 
                      value={instagramUsername}
                      onChange={(e) => setInstagramUsername(e.target.value)}
                      placeholder="@username"
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#bc13fe]"
                    />
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowBuyCreditsModal(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-bold transition-colors"
              >
                {buyCurrency === 'USD' ? 'CANCEL' : 'BATAL'}
              </button>
              <button
                onClick={handleBuyWhatsApp}
                className="px-6 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                {buyCurrency === 'USD' ? 'BUY VIA WHATSAPP' : 'BELI VIA WHATSAPP'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => {
            setShowCreateModal(false);
            if (isActive && tourType === 'create_event') {
              setTourState({ isActive: false, tourType: null, stepIndex: 0 });
            }
          }}></div>
          <div className="relative bg-[#111]/80 backdrop-blur-md border border-white/10 p-6 rounded-2xl w-full max-w-md tour-create-event-modal">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{t.createNewEvent}</h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  if (isActive && tourType === 'create_event') {
                    setTourState({ isActive: false, tourType: null, stepIndex: 0 });
                  }
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateEvent}>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">{t.eventName}</label>
                <input
                  type="text"
                  value={newEventName}
                  onChange={(e) => setNewEventName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                  placeholder="e.g., John & Jane Wedding"
                  autoFocus
                  required
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">{t.eventDescription}</label>
                <input
                  type="text"
                  value={newEventDescription}
                  onChange={(e) => setNewEventDescription(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                  placeholder="e.g., AI PHOTOBOOTH EXPERIENCE"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm text-gray-400 mb-2">{t.template}</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe] appearance-none"
                >
                  <option value="default">
                    Default Template {defaultTemplateId && templateEvents.find(t => t.id === defaultTemplateId) ? `(${templateEvents.find(t => t.id === defaultTemplateId)?.name})` : ''}
                  </option>
                  <option value="empty">Empty - No Template</option>
                  {templateEvents.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name} {template.id === defaultTemplateId ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    if (isActive && tourType === 'create_event') {
                      setTourState({ isActive: false, tourType: null, stepIndex: 0 });
                    }
                  }}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className={`px-4 py-2 ${isCreating ? 'bg-gray-600 cursor-not-allowed' : 'bg-[#bc13fe] hover:bg-[#a010d8]'} text-white rounded-lg text-sm font-bold transition-colors`}
                >
                  {isCreating ? t.creating : t.create}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorMsg && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[10001]">
          <div className="bg-[#111]/80 backdrop-blur-md border border-red-500/30 p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-400">{t.error}</h2>
            <p className="text-gray-300 mb-6 text-sm">{errorMsg}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setErrorMsg(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors"
              >
                {t.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tour Prompt Modal */}
      <AnimatePresence>
        {showTourPrompt && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="bg-[#111]/20 backdrop-blur-xl border border-white/10 p-8 rounded-2xl w-full max-w-md text-center shadow-2xl shadow-[#bc13fe]/20"
            >
              <h2 className="text-2xl font-bold mb-4 text-white">
                {language === 'id' ? 'Mulai Tour & Tutorial?' : 'Start Tour & Tutorial?'}
              </h2>
              <p className="text-gray-400 mb-8 text-sm">
                {language === 'id' 
                  ? 'Kami akan memandu Anda mengenal fitur-fitur di dashboard ini.' 
                  : 'We will guide you through the features in this dashboard.'}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={() => handleCloseTourPrompt(false)}
                  className="px-6 py-3 border border-white/20 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors uppercase tracking-widest text-white"
                >
                  {language === 'id' ? 'Tidak' : 'No'}
                </button>
                <button
                  onClick={() => handleCloseTourPrompt(true)}
                  className="px-6 py-3 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg text-sm font-bold transition-colors uppercase tracking-widest"
                >
                  {language === 'id' ? 'Ya' : 'Yes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Create Event Tour Prompt Modal */}
      <AnimatePresence>
        {showCreateEventTourPrompt && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="bg-[#111]/20 backdrop-blur-xl border border-white/10 p-8 rounded-2xl w-full max-w-md text-center shadow-2xl shadow-[#bc13fe]/20"
            >
              <h2 className="text-2xl font-bold mb-4 text-white">
                {language === 'id' ? 'Lanjut ke Tutorial Membuat Event?' : 'Continue to Create Event Tutorial?'}
              </h2>
              <p className="text-gray-400 mb-8 text-sm">
                {language === 'id' 
                  ? 'Apakah Anda mau lanjut ke Tutorial membuat event atau tidak?' 
                  : 'Do you want to continue to the Create Event Tutorial?'}
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={() => {
                    setShowCreateEventTourPrompt(false);
                    setShowFinalTutorialHint(true);
                    setTimeout(() => {
                      setShowFinalTutorialHint(false);
                    }, 5000);
                  }}
                  className="px-6 py-3 border border-white/20 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors uppercase tracking-widest text-white"
                >
                  {language === 'id' ? 'Tidak' : 'No'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateEventTourPrompt(false);
                    startTour('create_event');
                  }}
                  className="px-6 py-3 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg text-sm font-bold transition-colors uppercase tracking-widest"
                >
                  {language === 'id' ? 'Ya' : 'Yes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Next Tutorial Prompt Modal */}
      <AnimatePresence>
        {showNextTutorialPrompt && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="bg-[#111]/20 backdrop-blur-xl border border-white/10 p-8 rounded-2xl w-full max-w-md text-center shadow-2xl shadow-[#bc13fe]/20"
            >
              <h2 className="text-2xl font-bold mb-4 text-white">
                {language === 'id' ? 'Lanjut Tutorial Berikutnya?' : 'Continue to Next Tutorial?'}
              </h2>
              <p className="text-gray-400 mb-8 text-sm">
                {language === 'id' 
                  ? 'Pilih tutorial yang ingin Anda ikuti selanjutnya atau batalkan.' 
                  : 'Choose the tutorial you want to follow next or cancel.'}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setShowNextTutorialPrompt(false);
                    if (events.length > 0) {
                      navigate(`/admin/${events[0].id}?tab=settings`);
                      setTimeout(() => startTour('settings'), 500);
                    } else {
                      startTour('create_event');
                    }
                  }}
                  className="px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-400 rounded-lg text-sm font-bold transition-colors uppercase tracking-widest"
                >
                  {language === 'id' ? 'Tutorial Settings App' : 'Settings App Tutorial'}
                </button>
                <button
                  onClick={() => {
                    setShowNextTutorialPrompt(false);
                    if (events.length > 0) {
                      navigate(`/admin/${events[0].id}?tab=concept`);
                      setTimeout(() => startTour('concept'), 500);
                    } else {
                      startTour('create_event');
                    }
                  }}
                  className="px-6 py-3 bg-[#bc13fe]/20 hover:bg-[#bc13fe]/30 border border-[#bc13fe]/30 text-[#bc13fe] rounded-lg text-sm font-bold transition-colors uppercase tracking-widest"
                >
                  {language === 'id' ? 'Tutorial Create Concept' : 'Create Concept Tutorial'}
                </button>
                <button
                  onClick={() => {
                    setShowNextTutorialPrompt(false);
                    setShowFinalTutorialHint(true);
                    setTimeout(() => {
                      setShowFinalTutorialHint(false);
                    }, 5000);
                  }}
                  className="px-6 py-3 border border-white/20 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors uppercase tracking-widest text-white mt-2"
                >
                  {language === 'id' ? 'Cancel' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
