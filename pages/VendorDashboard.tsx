import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2, LogOut, Plus, Settings, Play, Image as ImageIcon, Video, Coins, Trash2, Download, CloudUpload, X, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Vendor, Event } from '../types';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { robustFetch } from '../lib/appsScript';
import { useDialog } from '../components/DialogProvider';
import { DEFAULT_SETTINGS, DEFAULT_CONCEPTS } from '../constants';

export default function VendorDashboard() {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [newEventDescription, setNewEventDescription] = useState('AI PHOTOBOOTH EXPERIENCE');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number, total: number } | null>(null);
  const [backupProgress, setBackupProgress] = useState<{ current: number, total: number, success: number, fail: number } | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const { showDialog } = useDialog();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const impersonatedVendorId = searchParams.get('vendorId');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate('/login');
          return;
        }

        const isSuper = user.email === 'coroaiphotobooth@gmail.com';
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
            // Vendor doesn't exist, create it (only if not impersonating)
            const newVendor = {
              id: user.id,
              email: user.email || '',
              name: user.user_metadata?.full_name || user.user_metadata?.name || 'Vendor',
              company_name: user.user_metadata?.company_name || null,
              country: user.user_metadata?.country || null,
              phone: user.user_metadata?.phone || null,
              credits: user.user_metadata?.credits || 5,
              is_blocked: false
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
              currentVendor = {
                id: user.id,
                email: user.email || '',
                name: user.user_metadata?.full_name || 'Vendor',
                plan: 'free',
                credits: 5,
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

        // Check if we need to update existing vendor with metadata (only if not impersonating)
        if (targetUserId === user.id) {
          const metadataName = user.user_metadata?.full_name || user.user_metadata?.name;
          if (currentVendor && (currentVendor.name === 'Vendor' || !currentVendor.company_name || currentVendor.credits === 0 || currentVendor.credits === 100)) {
              const updateData: any = {};
              if (currentVendor.name === 'Vendor' && metadataName) updateData.name = metadataName;
              if (!currentVendor.company_name && user.user_metadata?.company_name) updateData.company_name = user.user_metadata.company_name;
              if (!currentVendor.country && user.user_metadata?.country) updateData.country = user.user_metadata.country;
              if (!currentVendor.phone && user.user_metadata?.phone) updateData.phone = user.user_metadata.phone;
              
              let grantingCredits = false;
              if ((currentVendor.credits === 0 || currentVendor.credits === 100) && (!eventsData || eventsData.length === 0)) {
                  if (!user.user_metadata?.credits_granted) {
                      updateData.credits = 5;
                      grantingCredits = true;
                  }
              }

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
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendor) return;
    if (!newEventName.trim()) return;

    if (vendor.is_blocked) {
      await showDialog('alert', 'Account Blocked', 'Your account has been temporarily blocked by coro.ai. Please contact the admin at coroaiphotobooth@gmail.com or send a message on WhatsApp at +6282381230888');
      return;
    }

    try {
      // Generate folder name: companyname_eventname
      const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      const companyName = vendor.company_name || vendor.name || 'vendor';
      const folderName = `${sanitizeName(companyName)}_${sanitizeName(newEventName.trim())}`;

      // Fetch global settings to see if there's a template event
      const { data: globalSettings } = await supabase
        .from('global_settings')
        .select('template_event_id')
        .eq('id', 1)
        .single();

      let initialSettings = { ...DEFAULT_SETTINGS };
      let initialConcepts: any[] = [...DEFAULT_CONCEPTS];

      if (globalSettings?.template_event_id) {
        // Fetch template event settings
        const { data: templateEvent } = await supabase
          .from('events')
          .select('settings')
          .eq('id', globalSettings.template_event_id)
          .single();
        
        if (templateEvent?.settings) {
          initialSettings = { ...initialSettings, ...templateEvent.settings };
        }

        // Fetch template event concepts
        const { data: templateConcepts } = await supabase
          .from('concepts')
          .select('*')
          .eq('event_id', globalSettings.template_event_id);
        
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
        const conceptsToInsert = initialConcepts.map((concept, index) => ({
          id: crypto.randomUUID(),
          concept_id: `template_${concept.id}`,
          vendor_id: vendor.id,
          event_id: newEvent.id,
          name: concept.name,
          prompt: concept.prompt,
          thumbnail: concept.thumbnail,
          ref_image: concept.ref_image || concept.refImage || null
        }));

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
      }
    } catch (err: any) {
      console.error("Failed to create event:", err);
      setErrorMsg(`Failed to create event: ${err.message || 'Unknown error'}. Please ensure your Supabase tables and policies are correctly set up.`);
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

      const { data: globalSettings } = await supabase.from('global_settings').select('gas_url').single();
      const gasUrl = globalSettings?.gas_url;

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">
        <Loader2 className="w-12 h-12 animate-spin text-[#bc13fe]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {isSuperAdmin && impersonatedVendorId && (
                <button
                  onClick={() => navigate('/superadmin')}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                  title="Back to Super Admin"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h1 className="text-3xl font-heading font-bold neon-text">DASHBOARD</h1>
            </div>
            <p className="text-gray-400">Welcome back, {vendor?.name} {isSuperAdmin && impersonatedVendorId && <span className="text-yellow-400 text-xs ml-2 px-2 py-0.5 bg-yellow-400/10 rounded-full border border-yellow-400/30">Impersonating</span>}</p>
          </div>
          <div className="flex items-center gap-4">
            {isSuperAdmin && !impersonatedVendorId && (
              <button
                onClick={() => navigate('/superadmin')}
                className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-full font-bold transition-all text-sm"
              >
                Super Admin
              </button>
            )}
            <div className="glass-card px-4 py-2 rounded-full flex items-center gap-2 border border-[#bc13fe]/30">
              <Coins className="w-4 h-4 text-[#bc13fe]" />
              <span className="font-bold">{vendor?.credits} Credits</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-full transition-colors"
              title="Logout"
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
                Your account has been temporarily blocked by coro.ai. Please contact the admin at <a href="mailto:coroaiphotobooth@gmail.com" className="underline">coroaiphotobooth@gmail.com</a> or send a message on WhatsApp at <a href="https://wa.me/6282381230888" className="underline">+6282381230888</a>
              </p>
            </div>
          </div>
        )}

        {vendor?.admin_message && (
          <div className="bg-blue-500/10 border border-blue-500/50 text-blue-400 p-6 rounded-xl mb-8 flex items-start gap-4">
            <div className="w-8 h-8 flex-shrink-0 mt-1 flex items-center justify-center bg-blue-500/20 rounded-full">
              <span className="text-blue-400 font-bold text-lg">i</span>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-2">Message from coroai</h3>
              <p className="text-sm opacity-90 whitespace-pre-wrap">
                {vendor.admin_message}
              </p>
            </div>
          </div>
        )}

        {/* Stats / Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">Total Events</h3>
            <p className="text-4xl font-bold">{events.length}</p>
          </div>
          <div className="glass-card p-6 rounded-2xl border border-white/10">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">Current Plan</h3>
            <p className="text-4xl font-bold capitalize text-[#bc13fe]">{vendor?.plan}</p>
          </div>
          <div className="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-[#bc13fe]/10 to-transparent flex flex-col">
            <h3 className="text-gray-400 text-sm uppercase tracking-widest mb-2">Available Credits</h3>
            <p className="text-4xl font-bold">{vendor?.credits}</p>
            <div className="mt-auto pt-4 flex items-center justify-between">
              <p className="text-xs text-gray-500">1 Credit = 1 AI Generation</p>
              <button 
                onClick={() => setShowBuyCreditsModal(true)}
                className="text-xs bg-[#bc13fe] hover:bg-[#a010d8] text-white px-3 py-1.5 rounded-md font-bold transition-colors"
              >
                BUY CREDITS
              </button>
            </div>
          </div>
        </div>

        {/* Events List */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-heading font-bold">Your Events</h2>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg font-bold text-sm transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            CREATE EVENT
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.length === 0 ? (
            <div className="col-span-full glass-card p-10 rounded-2xl border border-white/10 text-center text-gray-500 flex flex-col items-center justify-center">
              <ImageIcon className="w-12 h-12 mb-4 opacity-20" />
              <p>No events found. Create your first photobooth event!</p>
            </div>
          ) : (
            events.map(event => (
              <div key={event.id} className="glass-card p-6 rounded-2xl border border-white/10 flex flex-col gap-4 hover:border-[#bc13fe]/50 transition-colors group">
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
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Play className="w-3 h-3" />
                      LAUNCH
                    </button>
                    <button 
                      onClick={() => navigate(`/admin/${event.id}`)}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Settings className="w-3 h-3" />
                      SETTINGS
                    </button>
                    <button 
                      onClick={() => navigate(`/app/${event.id}?page=gallery`)}
                      className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <ImageIcon className="w-3 h-3" />
                      GALLERY
                    </button>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button 
                      onClick={() => handleDownloadAllData(event.id)}
                      className="flex-1 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                      title="Download All Data (ZIP)"
                    >
                      <Download className="w-3 h-3" />
                      DOWNLOAD
                    </button>
                    <button 
                      onClick={() => handleBackupToDrive(event.id)}
                      className="flex-1 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                      title="Backup to Google Drive"
                    >
                      <CloudUpload className="w-3 h-3" />
                      BACKUP
                    </button>
                    <button 
                      onClick={() => handleDeleteEvent(event.id)}
                      className="flex-1 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                      title="Remove Event"
                    >
                      <Trash2 className="w-3 h-3" />
                      REMOVE
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* Progress Modals */}
      {downloadProgress && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111] border border-white/10 p-6 rounded-2xl w-full max-w-md text-center">
            <Loader2 className="w-12 h-12 text-[#bc13fe] animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Downloading Data</h2>
            <p className="text-gray-400 mb-4">Please wait while we prepare your files...</p>
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111] border border-white/10 p-6 rounded-2xl w-full max-w-md text-center">
            <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Backing up to Google Drive</h2>
            <p className="text-gray-400 mb-4">Please do not close this window...</p>
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111] border border-white/10 p-6 rounded-2xl w-full max-w-md relative">
            <button 
              onClick={() => setShowBuyCreditsModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-4 text-white">BUY CREDIT</h2>
            <p className="text-gray-300 mb-2 text-sm">Auto Payment gateway integration coming soon!</p>
            <p className="text-gray-300 mb-6 text-sm">Please make a manual purchase via WhatsApp message</p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowBuyCreditsModal(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-bold transition-colors"
              >
                CANCEL
              </button>
              <a
                href="https://wa.me/6282381230888?text=Hi%20I%20want%20to%20buy%20credit"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                </svg>
                WHATSAPP
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111] border border-white/10 p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Create New Event</h2>
            <form onSubmit={handleCreateEvent}>
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Event Name</label>
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
                <label className="block text-sm text-gray-400 mb-2">Event Description</label>
                <input
                  type="text"
                  value={newEventDescription}
                  onChange={(e) => setNewEventDescription(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#bc13fe]"
                  placeholder="e.g., AI PHOTOBOOTH EXPERIENCE"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold transition-colors"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#bc13fe] hover:bg-[#a010d8] text-white rounded-lg text-sm font-bold transition-colors"
                >
                  CREATE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorMsg && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#111] border border-red-500/30 p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-400">Error</h2>
            <p className="text-gray-300 mb-6 text-sm">{errorMsg}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setErrorMsg(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-bold transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
