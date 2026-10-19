// Device-only cache, partitioned by authenticated account and conversation.
(function () {
  let database;
  function open() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('donoss-chat-cache', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('chats');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return database;
  }
  async function operation(mode, key, value) {
    try {
      const db = await open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('chats', mode === 'get' ? 'readonly' : 'readwrite');
        const store = tx.objectStore('chats');
        const request = mode === 'get' ? store.get(key) : mode === 'delete' ? store.delete(key) : store.put(value, key);
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (_) { return null; } // Cache failure must never prevent using chat.
  }
  window.donossChatCache = {
    key: (user, chat) => JSON.stringify([user, chat]),
    read: key => operation('get', key),
    remove: key => operation('delete', key),
    write: (key, data) => operation('put', key, {
      ...data,
      messages: (data.messages || []).filter(message => !message.pending),
      savedAt: Date.now(),
    }),
  };
})();
