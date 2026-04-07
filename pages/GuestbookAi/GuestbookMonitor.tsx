import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Maximize, Minimize } from 'lucide-react';
import { MonitorTheme } from '../../types';

interface GuestbookEntry {
  id: string;
  guest_name: string;
  guest_message: string;
  result_image_url: string;
  created_at: string;
}

interface PhysicsItem {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  element: HTMLDivElement;
  item: GuestbookEntry;
  isDragging: boolean;
}

const CARD_WIDTH = 300;
const CARD_HEIGHT = 400;
const MAX_SPEED = 2;

const GuestbookMonitor: React.FC = React.memo(() => {
  const { eventId } = useParams<{ eventId: string }>();
  const [searchParams] = useSearchParams();
  const themeParam = searchParams.get('theme') as MonitorTheme | null;
  
  const navigate = useNavigate();
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [eventName, setEventName] = useState('Guestbook AI');
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundVideoUrl, setBackgroundVideoUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theme, setTheme] = useState<MonitorTheme>(themeParam || 'physics');
  const [settings, setSettings] = useState<any>({});

  // Physics & Slider Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, PhysicsItem>>(new Map());
  const requestRef = useRef<number | null>(null);
  const [sliderActiveItem, setSliderActiveItem] = useState<GuestbookEntry | null>(null);
  const [lightboxItem, setLightboxItem] = useState<GuestbookEntry | null>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Fetch initial data and event name
  useEffect(() => {
    if (!eventId) return;

    const loadData = async () => {
      // Get Event Name & Settings
      const { data: eventData } = await supabase
        .from('events')
        .select('name, settings')
        .eq('id', eventId)
        .single();
      
      if (eventData) {
        setEventName(eventData.name);
        if (eventData.settings) {
          setSettings(eventData.settings);
          if (eventData.settings.backgroundImage) setBackgroundImage(eventData.settings.backgroundImage);
          if (eventData.settings.backgroundVideoUrl) setBackgroundVideoUrl(eventData.settings.backgroundVideoUrl);
          if (!themeParam && eventData.settings.monitorTheme) setTheme(eventData.settings.monitorTheme);
        }
      }

      // Get Entries
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('id, guest_name, guest_message, result_image_url, created_at')
        .eq('event_id', eventId)
        .eq('is_posted_to_wall', true)
        .order('created_at', { ascending: false })
        .limit(50); // Limit to 50 to prevent high Disk IO

      if (sessionData) {
        setEntries(sessionData);
        if (sessionData.length > 0) {
          setSliderActiveItem(sessionData[0]);
        }
      }
    };

    loadData();

    // Subscribe to new entries via Broadcast to reduce Disk IO
    const channel = supabase.channel(`guestbook_updates_${eventId}`);
    
    channel.on(
      'broadcast',
      { event: 'new_guestbook_entry' },
      (payload) => {
        const newEntry = payload.payload as GuestbookEntry;
        if (newEntry) {
          setEntries(prev => {
            if (prev.some(e => e.id === newEntry.id)) return prev;
            return [newEntry, ...prev];
          });
          
          // Dipanggil sejajar/independen setelah objek newEntry dibuat
          setSliderActiveItem(newEntry);
        }
      }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  // Slider Rotation
  useEffect(() => {
    if (theme !== 'slider' || entries.length === 0) return;
    
    const interval = setInterval(() => {
      setSliderActiveItem(current => {
        if (!current) return entries[0];
        const currentIndex = entries.findIndex(e => e.id === current.id);
        const nextIndex = (currentIndex + 1) % entries.length;
        return entries[nextIndex];
      });
    }, 8000);
    
    return () => clearInterval(interval);
  }, [theme, entries]);

  // Physics Logic
  useEffect(() => {
    if (theme !== 'physics' || !containerRef.current || entries.length === 0) return;

    const maxPhysics = settings.guestbookPhysicsCount || 20;
    const physicsEntries = entries.slice(0, maxPhysics);

    // Add new items
    physicsEntries.forEach(item => {
      if (!itemsRef.current.has(item.id)) {
        createPhysicsElement(item);
      }
    });

    // Remove deleted items or items beyond limit
    const currentIds = new Set(physicsEntries.map(e => e.id));
    itemsRef.current.forEach((val, key) => {
      if (!currentIds.has(key)) {
        val.element.remove();
        itemsRef.current.delete(key);
      }
    });

    if (!requestRef.current) {
      requestRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [entries, theme]);

  const createPhysicsElement = (item: GuestbookEntry) => {
    if (!containerRef.current) return;

    const cardWidth = settings.guestbookPhotoSize || 300;
    const textPos = settings.guestbookTextPosition || 'bottom';
    const cardStyle = settings.guestbookCardStyle || 'glass';
    const fontSize = settings.guestbookFontSize || 14;
    const speed = settings.guestbookPhysicsSpeed || 2;
    
    // Calculate height based on layout
    const cardHeight = textPos === 'side' ? cardWidth * 0.6 : cardWidth * 1.33;

    let bgClass = 'bg-black/80 border border-white/20 shadow-2xl';
    if (cardStyle === 'glass') bgClass = 'bg-black/40 backdrop-blur-md border border-white/20 shadow-2xl';
    if (cardStyle === 'solid') bgClass = 'bg-[#111] border border-white/10 shadow-2xl';
    if (cardStyle === 'minimal') bgClass = 'bg-transparent border-transparent';

    const div = document.createElement('div');
    div.className = `absolute cursor-grab active:cursor-grabbing flex ${textPos === 'side' ? 'flex-row' : 'flex-col'}`;
    div.style.width = `${cardWidth}px`;
    div.style.height = `${cardHeight}px`;
    div.style.touchAction = 'none';

    const photoRounded = textPos === 'side' ? 'rounded-l-xl' : 'rounded-t-xl';
    const messageRounded = textPos === 'side' ? 'rounded-r-xl' : 'rounded-b-xl';
    const junctionMargin = textPos === 'side' ? '-ml-[1px]' : '-mt-[1px]';

    div.innerHTML = `
      <div class="${textPos === 'side' ? 'w-1/2 h-full' : 'w-full h-[60%]'} ${photoRounded} overflow-hidden ${bgClass} pointer-events-none">
        <img src="${item.result_image_url}" class="w-full h-full object-contain" draggable="false" />
      </div>
      <div class="p-4 flex-1 flex flex-col justify-center ${messageRounded} ${bgClass} pointer-events-none ${junctionMargin}">
        <p class="text-white italic line-clamp-3 mb-2" style="font-size: ${fontSize}px;">"${item.guest_message}"</p>
        <div class="flex items-center gap-2 mt-auto">
          <div class="w-4 h-[2px] bg-[#bc13fe]"></div>
          <p class="font-bold text-[#bc13fe] uppercase tracking-wider" style="font-size: ${Math.max(10, fontSize - 4)}px;">${item.guest_name}</p>
        </div>
      </div>
    `;

    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    
    const x = Math.random() * (containerW - cardWidth);
    const y = Math.random() * (containerH - cardHeight);
    const vx = (Math.random() - 0.5) * speed;
    const vy = (Math.random() - 0.5) * speed;

    containerRef.current.appendChild(div);

    const physicsObj: PhysicsItem = {
      id: item.id,
      x, y, vx, vy,
      width: cardWidth,
      height: cardHeight,
      element: div,
      item: item,
      isDragging: false
    };

    itemsRef.current.set(item.id, physicsObj);
    attachInteractions(div, physicsObj);
  };

  const attachInteractions = (element: HTMLElement, obj: PhysicsItem) => {
    let startX = 0, startY = 0;
    let lastX = 0, lastY = 0;
    let startTime = 0;
    let velocityTrackerX = 0;
    let velocityTrackerY = 0;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      obj.isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      startTime = Date.now();
      element.style.zIndex = "100";
      itemsRef.current.forEach((val) => { if(val !== obj) val.element.style.zIndex = "1"; });
      element.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!obj.isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      obj.x += dx;
      obj.y += dy;
      velocityTrackerX = dx; 
      velocityTrackerY = dy;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onUp = (e: PointerEvent) => {
      if (!obj.isDragging) return;
      obj.isDragging = false;
      element.releasePointerCapture(e.pointerId);
      const dist = Math.sqrt(Math.pow(e.clientX - startX, 2) + Math.pow(e.clientY - startY, 2));
      const timeDiff = Date.now() - startTime;
      if (dist < 10 && timeDiff < 300) {
        setLightboxItem(obj.item);
      } else {
        obj.vx = Math.min(Math.max(velocityTrackerX * 1.5, -15), 15);
        obj.vy = Math.min(Math.max(velocityTrackerY * 1.5, -15), 15);
      }
    };

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
  };

  const animate = () => {
    if (theme !== 'physics' || !containerRef.current) return;
    
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    const items: PhysicsItem[] = Array.from(itemsRef.current.values());

    for (let i = 0; i < items.length; i++) {
      const p1 = items[i];
      if (p1.isDragging) {
        p1.element.style.transform = `translate(${p1.x}px, ${p1.y}px) scale(1.05)`;
        continue;
      }

      p1.x += p1.vx;
      p1.y += p1.vy;

      // Bounce off walls
      if (p1.x <= 0) { p1.x = 0; p1.vx *= -1; }
      if (p1.x + p1.width >= containerW) { p1.x = containerW - p1.width; p1.vx *= -1; }
      if (p1.y <= 0) { p1.y = 0; p1.vy *= -1; }
      if (p1.y + p1.height >= containerH) { p1.y = containerH - p1.height; p1.vy *= -1; }

      // Simple collision detection
      for (let j = i + 1; j < items.length; j++) {
        const p2 = items[j];
        if (p2.isDragging) continue;

        if (p1.x < p2.x + p2.width &&
            p1.x + p1.width > p2.x &&
            p1.y < p2.y + p2.height &&
            p1.height + p1.y > p2.y) {
          
          const tempVx = p1.vx;
          const tempVy = p1.vy;
          p1.vx = p2.vx;
          p1.vy = p2.vy;
          p2.vx = tempVx;
          p2.vy = tempVy;

          const overlapX = (p1.width + p2.width) / 2 - Math.abs((p1.x + p1.width/2) - (p2.x + p2.width/2));
          const overlapY = (p1.height + p2.height) / 2 - Math.abs((p1.y + p1.height/2) - (p2.y + p2.height/2));
          
          if (overlapX < overlapY) {
            if (p1.x < p2.x) { p1.x -= overlapX/2; p2.x += overlapX/2; }
            else { p1.x += overlapX/2; p2.x -= overlapX/2; }
          } else {
            if (p1.y < p2.y) { p1.y -= overlapY/2; p2.y += overlapY/2; }
            else { p1.y += overlapY/2; p2.y -= overlapY/2; }
          }
        }
      }

      p1.element.style.transform = `translate(${p1.x}px, ${p1.y}px)`;
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  const joinUrl = `${window.location.origin}/guestbook/${eventId}/guest`;

  return (
    <div className="min-h-screen bg-[#050505] text-white flex overflow-hidden relative">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        {backgroundVideoUrl ? (
          <video src={backgroundVideoUrl} className="w-full h-full object-cover opacity-60" autoPlay loop muted playsInline />
        ) : backgroundImage ? (
          <img src={backgroundImage} className="w-full h-full object-cover opacity-60" alt="Background" />
        ) : (
          <>
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-[#bc13fe]/20 rounded-full blur-[150px] animate-pulse" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-500/20 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />
          </>
        )}
      </div>

      {/* Header & Controls */}
      <div className="absolute top-0 left-0 right-0 z-50 p-8 flex justify-between items-start pointer-events-none">
        <div className="text-left pointer-events-auto">
          <h1 className="font-heading font-bold neon-text mb-2" style={{ fontSize: `${settings.guestbookTitleSize || 48}px` }}>{eventName}</h1>
          <p className="text-gray-300" style={{ fontSize: `${settings.guestbookDescSize || 24}px` }}>Scan the QR code to leave a message & take an AI photo!</p>
        </div>
        
        <div className="flex items-center gap-4 pointer-events-auto">
          <button 
            onClick={toggleFullscreen}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-md"
            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {isFullscreen ? (
              <Minimize className="w-6 h-6 text-white" />
            ) : (
              <Maximize className="w-6 h-6 text-white" />
            )}
          </button>
          <button 
            onClick={() => navigate(`/admin/${eventId}/guestbook`)}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-md"
            title="Settings"
          >
            <Settings className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {/* THEMES */}
      
      {/* 1. PHYSICS MODE */}
      <div ref={containerRef} className={`absolute inset-0 z-10 overflow-hidden ${theme !== 'physics' ? 'hidden' : ''}`} />

      {/* 2. GRID MODE */}
      {theme === 'grid' && (
        <div className="absolute inset-0 z-10 pt-32 pb-8 px-8 flex items-center justify-center">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full h-full max-w-7xl overflow-y-auto pb-32 no-scrollbar">
              {entries.slice(0, settings.guestbookGridCount || 12).map((item) => {
                const cardStyle = settings.guestbookCardStyle || 'glass';
                const textPos = settings.guestbookTextPosition || 'side';
                const fontSize = settings.guestbookFontSize || 14;
                const photoSize = settings.guestbookPhotoSize || 300;
                
                let bgClass = 'bg-black/80 border border-white/20 shadow-lg';
                if (cardStyle === 'glass') bgClass = 'bg-black/40 backdrop-blur-md border border-white/20 shadow-lg';
                if (cardStyle === 'solid') bgClass = 'bg-[#111] border border-white/10 shadow-lg';
                if (cardStyle === 'minimal') bgClass = 'bg-transparent border-transparent';

                const photoRounded = textPos === 'side' ? 'rounded-l-xl' : 'rounded-t-xl';
                const messageRounded = textPos === 'side' ? 'rounded-r-xl' : 'rounded-b-xl';
                const junctionMargin = textPos === 'side' ? '-ml-[1px]' : '-mt-[1px]';

                return (
                  <div 
                    key={item.id} 
                    onClick={() => setLightboxItem(item)}
                    className={`relative cursor-pointer hover:scale-105 transition-all group flex ${textPos === 'side' ? 'flex-row' : 'flex-col'}`}
                    style={{ width: textPos === 'side' ? `${photoSize * 2}px` : `${photoSize}px` }}
                  >
                    <div 
                      className={`relative overflow-hidden ${textPos === 'side' ? 'w-1/2' : 'w-full'} ${photoRounded} ${bgClass} pointer-events-none`} 
                      style={{ height: `${photoSize}px` }}
                    >
                      <img 
                        src={item.result_image_url} 
                        className="w-full h-full object-contain" 
                      />
                    </div>
                    <div className={`p-4 flex-1 flex flex-col justify-center ${messageRounded} ${bgClass} pointer-events-none ${junctionMargin}`}>
                      <p className="text-white italic line-clamp-3 mb-2" style={{ fontSize: `${fontSize}px` }}>"{item.guest_message}"</p>
                      <div className="flex items-center gap-2 mt-auto">
                        <div className="w-3 h-[2px] bg-[#bc13fe]"></div>
                        <p className="font-bold text-[#bc13fe] uppercase tracking-wider truncate" style={{ fontSize: `${Math.max(10, fontSize - 4)}px` }}>{item.guest_name}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 3. SLIDER MODE (Vertical Chat-like Feed) */}
      {theme === 'slider' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center pt-32 pb-8 px-8 overflow-hidden">
          <div className="w-full max-w-2xl space-y-4 overflow-y-auto no-scrollbar pb-32">
            <AnimatePresence initial={false}>
              {entries.slice(0, settings.guestbookSliderCount || 5).map((item, index) => {
                const cardStyle = settings.guestbookCardStyle || 'glass';
                // Slider theme always uses 'side' (Beside Photo) layout
                const textPos = 'side'; 
                const fontSize = settings.guestbookFontSize || 14;
                // Scale down photo size for slider mode specifically
                const basePhotoSize = settings.guestbookPhotoSize || 200;
                const photoSize = basePhotoSize * 0.6; 

                let bgClass = 'bg-black/80 border border-white/20 shadow-xl';
                if (cardStyle === 'glass') bgClass = 'bg-black/40 backdrop-blur-md border border-white/20 shadow-xl';
                if (cardStyle === 'solid') bgClass = 'bg-[#111] border border-white/10 shadow-xl';
                if (cardStyle === 'minimal') bgClass = 'bg-transparent border-transparent';

                // Alternating layout: index 0, 2, 4... (left), index 1, 3, 5... (right)
                const isEven = index % 2 === 0;
                const photoRounded = isEven ? 'rounded-l-2xl' : 'rounded-r-2xl';
                const messageRounded = isEven ? 'rounded-r-2xl' : 'rounded-l-2xl';
                const junctionMargin = isEven ? '-ml-[1px]' : '-mr-[1px]';

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: isEven ? -100 : 100, scale: 0.8, rotate: isEven ? -5 : 5 }}
                    animate={{ opacity: 1, x: 0, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.3 } }}
                    transition={{ 
                      type: "spring",
                      stiffness: 100,
                      damping: 15,
                      delay: index * 0.05 
                    }}
                    onClick={() => setLightboxItem(item)}
                    className={`relative cursor-pointer hover:scale-105 transition-all group flex items-center ${isEven ? 'flex-row' : 'flex-row-reverse'}`}
                  >
                    <div 
                      className={`relative overflow-hidden flex-shrink-0 ${photoRounded} ${bgClass} pointer-events-none`} 
                      style={{ 
                        width: `${photoSize}px`,
                        height: `${photoSize * 1.33}px` // 3:4 Aspect Ratio
                      }}
                    >
                      <img 
                        src={item.result_image_url} 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className={`p-3 px-5 flex-1 flex flex-col justify-center ${messageRounded} ${bgClass} ${junctionMargin} min-h-[60px] ${isEven ? 'items-start text-left' : 'items-end text-right'}`}>
                      <div className={`flex items-start gap-2 ${isEven ? 'flex-row' : 'flex-row-reverse'}`}>
                        <span className="text-[#bc13fe] text-xl leading-none">"</span>
                        <p className="text-white italic leading-tight" style={{ fontSize: `${fontSize}px` }}>
                          {item.guest_message}
                        </p>
                      </div>
                      <div className={`flex items-center gap-2 mt-2 ${isEven ? 'flex-row' : 'flex-row-reverse'}`}>
                        <div className="w-4 h-[1px] bg-[#bc13fe] rounded-full" />
                        <h3 className="font-bold text-[#bc13fe] uppercase tracking-widest" style={{ fontSize: `${Math.max(10, fontSize - 4)}px` }}>
                          {item.guest_name}
                        </h3>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Empty State */}
      {entries.length === 0 && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="text-center text-gray-500 glass-card p-12 rounded-3xl border border-white/10">
            <h2 className="text-3xl mb-4 font-heading">Waiting for guests...</h2>
            <p className="text-xl">Scan the QR code to be the first!</p>
          </div>
        </div>
      )}

      {/* QR Code Corner */}
      {!settings.guestbookHideQr && (
        <div className="absolute bottom-8 right-8 z-50 glass-card p-6 rounded-3xl border border-white/10 flex flex-col items-center shadow-2xl backdrop-blur-xl bg-black/60">
          <h3 className="text-xl font-bold mb-4 text-center text-white">Join the<br/>Guestbook</h3>
          <div className="bg-white p-4 rounded-2xl mb-4">
            <img 
              src={`https://api.qrserver.com/v1/create-qr-code/?size=${settings.guestbookQrSize || 150}x${settings.guestbookQrSize || 150}&data=${encodeURIComponent(joinUrl)}`} 
              alt="QR Code"
              style={{ width: `${settings.guestbookQrSize || 150}px`, height: `${settings.guestbookQrSize || 150}px` }}
            />
          </div>
          <p className="text-sm text-gray-300 font-mono">Scan to participate</p>
        </div>
      )}

      {/* Lightbox for Grid/Physics */}
      <AnimatePresence>
        {lightboxItem && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-8"
            onClick={() => setLightboxItem(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="max-w-5xl w-full flex flex-col md:flex-row gap-8 items-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-full md:w-1/2 aspect-[3/4] rounded-2xl overflow-hidden border-4 border-white/20 shadow-2xl bg-black/50">
                <img src={lightboxItem.result_image_url} className="w-full h-full object-contain" />
              </div>
              <div className="w-full md:w-1/2 flex flex-col justify-center">
                <div className="glass-card p-8 rounded-3xl border border-white/10 relative">
                  <div className="absolute -top-6 -left-6 text-6xl text-[#bc13fe] opacity-50">"</div>
                  <p className="text-3xl leading-relaxed text-white font-medium mb-8 relative z-10 italic">
                    {lightboxItem.guest_message}
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-1 bg-[#bc13fe] rounded-full" />
                    <h3 className="text-2xl font-bold text-[#bc13fe] uppercase tracking-widest">
                      {lightboxItem.guest_name}
                    </h3>
                  </div>
                </div>
                <button 
                  onClick={() => setLightboxItem(null)}
                  className="mt-8 px-8 py-4 bg-white/10 hover:bg-white/20 rounded-xl text-white font-bold tracking-widest uppercase transition-colors self-start"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default GuestbookMonitor;
