import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function usePresence(vendorId: string | undefined, location: 'dashboard' | 'event_photobooth') {
  const [status, setStatus] = useState<'online' | 'idle'>('online');
  const statusRef = useRef<'online' | 'idle'>('online');
  const channelRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!vendorId) return;

    const channel = supabase.channel('vendor_presence', {
      config: {
        presence: {
          key: vendorId,
        },
      },
    });

    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      // Presence synced
    }).subscribe(async (subStatus) => {
      if (subStatus === 'SUBSCRIBED') {
        await trackPresence('online');
      }
    });

    const trackPresence = async (currentStatus: 'online' | 'idle') => {
      if (channelRef.current?.state === 'joined') {
        await channelRef.current.track({
          online_at: new Date().toISOString(),
          vendor_id: vendorId,
          status: currentStatus,
          location: location
        });
      }
    };

    const resetIdleTimer = () => {
      if (statusRef.current !== 'online') {
        setStatus('online');
        statusRef.current = 'online';
        trackPresence('online');
      }
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set idle after 15 minutes of inactivity
      timeoutRef.current = setTimeout(() => {
        setStatus('idle');
        statusRef.current = 'idle';
        trackPresence('idle');
      }, 15 * 60 * 1000);
    };

    // Initial timer
    resetIdleTimer();

    // Listeners for user activity
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
      window.addEventListener(event, resetIdleTimer, { passive: true });
    });

    return () => {
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetIdleTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [vendorId, location]);

  return status;
}
