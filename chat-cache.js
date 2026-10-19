// Device-only cache, partitioned by authenticated account and conversation.
(function () {
  let database;
  let activeUser = null;
  let generation = 0;
  const memory = new Map();
  const attached = new WeakSet();
  async function prepare(user) {
    if (activeUser === user) return;
    activeUser = user;
    const version = ++generation;
    memory.clear();
    if (!user) return;
    try {
      const db = await open();
      const request = db.transaction('chats', 'readonly').objectStore('chats').openCursor();
      request.onsuccess = () => {
        if (version !== generation) return;
        const cursor = request.result;
        if (!cursor) return;
        try { if (JSON.parse(cursor.key)[0] === user && !String(JSON.parse(cursor.key)[1]).startsWith('media:') && !memory.has(cursor.key)) memory.set(cursor.key, cursor.value); } catch (_) {}
        cursor.continue();
      };
    } catch (_) {}
  }
  function parentCache() {
    try { return window.parent !== window ? window.parent.donossChatCache : null; } catch (_) { return null; }
  }
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
    attach(client) {
      if (attached.has(client)) return;
      attached.add(client);
      client.auth.onAuthStateChange((_event, session) => { prepare(session?.user?.id || null); });
      client.auth.getSession().then(({ data }) => prepare(data.session?.user?.id || null)).catch(() => {});
    },
    peek(chat) {
      const parent = parentCache();
      if (parent) return parent.peek(chat);
      return activeUser ? memory.get(JSON.stringify([activeUser, chat])) || null : null;
    },
    updateMemory(key, data) {
      const parent = parentCache();
      if (parent) parent.updateMemory(key, data);
      try { if (JSON.parse(key)[0] === activeUser && !String(JSON.parse(key)[1]).startsWith('media:')) data ? memory.set(key, data) : memory.delete(key); } catch (_) {}
    },
    read: key => operation('get', key),
    remove(key) { this.updateMemory(key, null); return operation('delete', key); },
    write(key, data) { const snapshot = {
      ...data,
      messages: (data.messages || []).filter(message => !message.pending),
      savedAt: Date.now(),
    }; this.updateMemory(key, snapshot); return operation('put', key, snapshot); },
  };
})();
