import { useState, useEffect, useCallback, useRef } from 'react';

export interface DslrCamera {
  id: string;
  name: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId: NodeJS.Timeout;
}

export const useWebViewCamera = () => {
  const [isWrapper, setIsWrapper] = useState(false);
  const [cameras, setCameras] = useState<DslrCamera[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [liveViewFrame, setLiveViewFrame] = useState<string | null>(null);
  const pendingRequests = useRef<Map<string, PendingRequest>>(new Map());

  useEffect(() => {
    let checkInterval: NodeJS.Timeout;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.action === 'CAMERA_LIVEVIEW_FRAME') {
        setLiveViewFrame(data.frame);
        return;
      }

      if (data.requestId && pendingRequests.current.has(data.requestId)) {
        const req = pendingRequests.current.get(data.requestId)!;
        clearTimeout(req.timeoutId);
        pendingRequests.current.delete(data.requestId);

        if (data.ok === false || data.action === 'PHOTO_ERROR') {
          req.reject(new Error(data.error || 'Camera operation failed'));
        } else {
          req.resolve(data);
        }
      }
    };

    const initWrapper = () => {
      const checkWrapper = !!(window as any).chrome?.webview;
      if (checkWrapper) {
        setIsWrapper(true);
        (window as any).chrome.webview.addEventListener('message', handleMessage);
        if (checkInterval) clearInterval(checkInterval);
        return true;
      }
      return false;
    };

    if (!initWrapper()) {
      // Retry every 500ms for up to 5 seconds if injected late
      let attempts = 0;
      checkInterval = setInterval(() => {
        attempts++;
        if (initWrapper() || attempts > 10) {
          clearInterval(checkInterval);
        }
      }, 500);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if ((window as any).chrome?.webview) {
        (window as any).chrome.webview.removeEventListener('message', handleMessage);
      }
    };
  }, []);

  const sendCommand = useCallback((command: any, timeoutMs = 15000): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!isWrapper) {
        return reject(new Error('Not running in WebView2 wrapper'));
      }

      const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const payload = { ...command, requestId };

      const timeoutId = setTimeout(() => {
        if (pendingRequests.current.has(requestId)) {
          pendingRequests.current.delete(requestId);
          reject(new Error(`Command ${command.action} timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      pendingRequests.current.set(requestId, { resolve, reject, timeoutId });
      (window as any).chrome.webview.postMessage(payload);
    });
  }, [isWrapper]);

  const listCameras = useCallback(async () => {
    try {
      const res = await sendCommand({ action: 'CAMERA_LIST' }, 5000);
      setCameras(res.cameras || []);
      return res.cameras;
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [sendCommand]);

  const connectCamera = useCallback(async (vendor: string, cameraId: string) => {
    try {
      const res = await sendCommand({ action: 'CAMERA_CONNECT', vendor, cameraId }, 10000);
      setIsConnected(true);
      return res;
    } catch (err) {
      console.error(err);
      setIsConnected(false);
      throw err;
    }
  }, [sendCommand]);

  const capturePhoto = useCallback(async () => {
    try {
      const res = await sendCommand({ action: 'CAMERA_CAPTURE' }, 15000);
      // Assuming res.photo contains the base64 image
      return res.photo; 
    } catch (err) {
      console.error(err);
      throw err;
    }
  }, [sendCommand]);

  const disconnectCamera = useCallback(async () => {
    try {
      await sendCommand({ action: 'CAMERA_DISCONNECT' }, 5000);
      setIsConnected(false);
      setLiveViewFrame(null);
    } catch (err) {
      console.error(err);
    }
  }, [sendCommand]);

  return {
    isWrapper,
    cameras,
    isConnected,
    liveViewFrame,
    listCameras,
    connectCamera,
    capturePhoto,
    disconnectCamera
  };
};
