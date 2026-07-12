(function () {
  const DB_NAME = "atelie-em-dia";
  const DB_VERSION = 2;
  let dbPromise;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("orders")) db.createObjectStore("orders", { keyPath: "id" });
        if (!db.objectStoreNames.contains("clients")) db.createObjectStore("clients", { keyPath: "id" });
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
        if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  async function store(name, mode = "readonly") {
    const db = await openDB();
    const tx = db.transaction(name, mode);
    return { tx, store: tx.objectStore(name) };
  }

  function promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(name) {
    const { store } = await window.AtelieDB.store(name);
    return promisify(store.getAll());
  }

  async function get(name, key) {
    const { store } = await window.AtelieDB.store(name);
    return promisify(store.get(key));
  }

  async function put(name, value) {
    const { tx, store } = await window.AtelieDB.store(name, "readwrite");
    store.put(value);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function remove(name, key) {
    const { tx, store } = await window.AtelieDB.store(name, "readwrite");
    store.delete(key);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clear(name) {
    const { tx, store } = await window.AtelieDB.store(name, "readwrite");
    store.clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getSetting(key, fallback = null) {
    const row = await get("settings", key);
    return row ? row.value : fallback;
  }

  async function setSetting(key, value) {
    return put("settings", { key, value });
  }

  async function snapshot(reason) {
    const orders = await getAll("orders");
    const clients = await getAll("clients");
    const settings = await getAll("settings");
    const row = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      reason,
      data: { orders, clients, settings }
    };
    await put("snapshots", row);
    const snapshots = (await getAll("snapshots")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    await Promise.all(snapshots.slice(5).map((item) => remove("snapshots", item.id)));
  }

  window.AtelieDB = {
    openDB,
    store,
    getAll,
    get,
    put,
    remove,
    clear,
    getSetting,
    setSetting,
    snapshot
  };
})();
