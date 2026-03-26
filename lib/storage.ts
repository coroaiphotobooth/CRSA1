export const saveLargeData = async (key: string, data: any): Promise<void> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PhotoboothDB', 1);

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('largeData')) {
                db.createObjectStore('largeData');
            }
        };

        request.onsuccess = (event: any) => {
            const db = event.target.result;
            const transaction = db.transaction(['largeData'], 'readwrite');
            const store = transaction.objectStore('largeData');
            const putRequest = store.put(data, key);

            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => reject(putRequest.error);
        };

        request.onerror = () => reject(request.error);
    });
};

export const getLargeData = async (key: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PhotoboothDB', 1);

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('largeData')) {
                db.createObjectStore('largeData');
            }
        };

        request.onsuccess = (event: any) => {
            const db = event.target.result;
            // Handle case where store might not exist yet if this is the first run
            // and onupgradeneeded wasn't called (e.g. DB already existed but store didn't)
            if (!db.objectStoreNames.contains('largeData')) {
                resolve(null);
                return;
            }
            const transaction = db.transaction(['largeData'], 'readonly');
            const store = transaction.objectStore('largeData');
            const getRequest = store.get(key);

            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
        };

        request.onerror = () => reject(request.error);
    });
};
