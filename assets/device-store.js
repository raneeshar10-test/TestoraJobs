(() => {
  const databaseName = "testora-device-data";
  const databaseVersion = 2;
  let opening;

  function openDatabase() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("jobs")) database.createObjectStore("jobs", { keyPath: "id" });
        if (!database.objectStoreNames.contains("resumes")) database.createObjectStore("resumes", { keyPath: "id" });
        if (!database.objectStoreNames.contains("applications")) database.createObjectStore("applications", { keyPath: "id" });
        if (!database.objectStoreNames.contains("sourceSync")) database.createObjectStore("sourceSync", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error || new Error("Could not open on-device storage."));
      };
      request.onblocked = () => {
        opening = null;
        reject(new Error("On-device storage is blocked by another open site tab. Close other Testora Jobs tabs and retry."));
      };
    });
    return opening;
  }

  async function transact(storeName, mode, action) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      let result;
      try {
        action(transaction.objectStore(storeName), (value) => { result = value; });
      } catch (error) {
        transaction.abort();
        database.close();
        opening = null;
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        database.close();
        opening = null;
        resolve(result);
      };
      transaction.onerror = () => {
        database.close();
        opening = null;
        reject(transaction.error || new Error(`Could not access local ${storeName} data.`));
      };
      transaction.onabort = () => {
        database.close();
        opening = null;
        reject(transaction.error || new Error(`The local ${storeName} transaction was aborted.`));
      };
    });
  }

  function requestResult(storeName, request) {
    return transact(storeName, "readonly", (store, setResult) => {
      const operation = request(store);
      operation.onsuccess = () => setResult(operation.result);
    });
  }

  async function saveJobs(jobs) {
    return transact("jobs", "readwrite", (store) => {
      store.clear();
      jobs.forEach((job) => store.put(job));
    });
  }

  async function getJobs() {
    return (await requestResult("jobs", (store) => store.getAll())) || [];
  }

  async function getSourceState(id) {
    return requestResult("sourceSync", (store) => store.get(id));
  }

  async function saveSourceState(state) {
    return transact("sourceSync", "readwrite", (store) => { store.put(state); });
  }

  async function saveResume(file) {
    return transact("resumes", "readwrite", (store) => {
      store.put({ id: "profile", name: file.name, type: file.type, savedAt: new Date().toISOString(), blob: file });
    });
  }

  async function getResume(id) {
    return requestResult("resumes", (store) => store.get(id));
  }

  async function deleteResume(id) {
    return transact("resumes", "readwrite", (store) => { store.delete(id); });
  }

  async function saveApplication(application) {
    return transact("applications", "readwrite", (store) => { store.put(application); });
  }

  async function getApplications() {
    const applications = (await requestResult("applications", (store) => store.getAll())) || [];
    return applications.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  }

  async function deleteApplication(id) {
    return transact("applications", "readwrite", (store) => { store.delete(id); });
  }

  async function clearAll() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const stores = ["jobs", "resumes", "applications", "sourceSync"];
      const transaction = database.transaction(stores, "readwrite");
      stores.forEach((name) => transaction.objectStore(name).clear());
      transaction.oncomplete = () => {
        database.close();
        opening = null;
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        opening = null;
        reject(transaction.error || new Error("Could not clear on-device data."));
      };
      transaction.onabort = () => {
        database.close();
        opening = null;
        reject(transaction.error || new Error("The on-device data cleanup was aborted."));
      };
    });
  }

  async function storageEstimate() {
    if (!navigator.storage || !navigator.storage.estimate) return { usage: null, quota: null };
    return navigator.storage.estimate();
  }

  async function requestPersistentStorage() {
    if (!navigator.storage || !navigator.storage.persist) return false;
    return navigator.storage.persist();
  }

  window.TestoraDeviceStore = {
    saveJobs,
    getJobs,
    getSourceState,
    saveSourceState,
    saveResume,
    getResume,
    deleteResume,
    saveApplication,
    getApplications,
    deleteApplication,
    clearAll,
    storageEstimate,
    requestPersistentStorage
  };
})();
