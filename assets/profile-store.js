(() => {
  const key = "testora-profile-v2";

  function load() {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { profile: JSON.parse(raw), error: "" };
      const previous = sessionStorage.getItem("testora-profile-v1");
      if (!previous) return { profile: null, error: "" };
      const profile = JSON.parse(previous);
      localStorage.setItem(key, JSON.stringify(profile));
      return { profile, error: "" };
    } catch (error) {
      return { profile: null, error: error instanceof Error ? error.message : "Local browser storage is unavailable." };
    }
  }

  function save(profile) {
    try {
      localStorage.setItem(key, JSON.stringify(profile));
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Local browser storage is unavailable.";
    }
  }

  function clear() {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem("testora-profile-v1");
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Local browser storage is unavailable.";
    }
  }

  window.TestoraProfileStore = { load, save, clear };
})();
