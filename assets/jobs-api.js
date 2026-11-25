(() => {
  const config = window.TESTORA_CONFIG;
  const pageSize = 1000;
  const maxJobs = 10000;
  const requestTimeoutMs = 15000;
  const selectedFields = "id,title,company,city,job_type,experience_min,experience_max,salary,posted_at,skills,description,apply_url";

  function setStatus(element, message, isError) {
    if (!element) return;
    element.textContent = message;
    element.dataset.state = isError ? "error" : "info";
  }

  function isConfigured() {
    if (!config || typeof config.supabaseUrl !== "string" || typeof config.supabaseAnonKey !== "string") return false;
    try {
      return new URL(config.supabaseUrl).protocol === "https:" && Boolean(config.supabaseAnonKey.trim());
    } catch {
      return false;
    }
  }

  function normalizeJob(row) {
    if (!row || row.id === null || row.id === undefined || typeof row.title !== "string" || typeof row.company !== "string" || typeof row.city !== "string") {
      throw new Error("The live jobs response contains an invalid job record.");
    }
    const experienceMin = Number(row.experience_min);
    const experienceMax = Number(row.experience_max);
    return {
      id: String(row.id),
      title: row.title.trim(),
      company: row.company.trim(),
      city: row.city.trim(),
      type: typeof row.job_type === "string" && row.job_type.trim() ? row.job_type.trim() : "Other",
      expMin: Number.isFinite(experienceMin) && experienceMin >= 0 ? experienceMin : 0,
      expMax: Number.isFinite(experienceMax) && experienceMax >= 0 ? experienceMax : 0,
      salary: typeof row.salary === "string" && row.salary.trim() ? row.salary : "Not specified",
      posted: typeof row.posted_at === "string" ? row.posted_at : "",
      skills: Array.isArray(row.skills) ? row.skills.filter((skill) => typeof skill === "string").map((skill) => skill.toLowerCase()) : [],
      description: typeof row.description === "string" && row.description ? row.description : "No description provided.",
      applyUrl: typeof row.apply_url === "string" ? row.apply_url : ""
    };
  }

  async function cacheJobs(jobs, statusElement) {
    try {
      await window.TestoraDeviceStore.saveJobs(jobs);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown device storage error.";
      setStatus(statusElement, `Jobs loaded, but could not be cached on this device: ${reason}`, true);
    }
    return jobs;
  }

  async function loadCachedOrDemo(statusElement, reason) {
    try {
      const cached = await window.TestoraDeviceStore.getJobs();
      if (cached.length) {
        setStatus(statusElement, `${reason} Showing ${cached.length} job${cached.length === 1 ? "" : "s"} cached on this device.`, true);
        return cached;
      }
    } catch (error) {
      const storageReason = error instanceof Error ? error.message : "Unknown device storage error.";
      setStatus(statusElement, `${reason} Could not read the on-device job cache: ${storageReason} Sample listings are shown.`, true);
      return window.DEMO_JOBS;
    }
    setStatus(statusElement, `${reason} Sample listings are shown.`, true);
    return window.DEMO_JOBS;
  }

  async function fetchPage(url) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseAnonKey}`
        },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Supabase returned HTTP ${response.status}.`);
      const page = await response.json();
      if (!Array.isArray(page)) throw new Error("Supabase returned an unexpected jobs response.");
      return page;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("The live jobs request timed out after 15 seconds.");
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function loadJobs(statusElement) {
    const hasUrl = config && typeof config.supabaseUrl === "string" && Boolean(config.supabaseUrl.trim());
    const hasKey = config && typeof config.supabaseAnonKey === "string" && Boolean(config.supabaseAnonKey.trim());
    if (!hasUrl && !hasKey) {
      return loadCachedOrDemo(statusElement, "Live listings are not configured.");
    }
    if (!hasUrl || !hasKey || !isConfigured()) {
      return loadCachedOrDemo(statusElement, "Supabase configuration is incomplete or invalid; provide an HTTPS project URL and publishable key.");
    }

    try {
      const endpoint = new URL(`${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/jobs`);
      endpoint.searchParams.set("select", selectedFields);
      endpoint.searchParams.set("is_active", "eq.true");
      endpoint.searchParams.set("order", "posted_at.desc");
      const rows = [];
      for (let offset = 0; offset < maxJobs; offset += pageSize) {
        const pageUrl = new URL(endpoint);
        pageUrl.searchParams.set("limit", String(pageSize));
        pageUrl.searchParams.set("offset", String(offset));
        const page = await fetchPage(pageUrl);
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      const jobs = rows.map(normalizeJob);
      if (rows.length >= maxJobs) {
        setStatus(statusElement, "Showing the first 10,000 live jobs. Narrow the date range or search filters.", false);
      } else {
        setStatus(statusElement, `Showing ${rows.length} live job${rows.length === 1 ? "" : "s"} from configured feeds.`, false);
      }
      return cacheJobs(jobs, statusElement);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown request error.";
      return loadCachedOrDemo(statusElement, `Live jobs could not be loaded: ${reason}`);
    }
  }

  window.TestoraJobsApi = { isConfigured, loadJobs };
})();
