(() => {
  const config = window.TESTORA_CONFIG;
  const pageSize = 1000;
  const maxJobs = 10000;
  const requestTimeoutMs = 15000;
  const selectedFields = "id,title,company,city,job_type,experience_min,experience_max,salary,posted_at,skills,description,apply_url";
  const arbeitnowEndpoint = "https://www.arbeitnow.com/api/job-board-api?page=1";

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

  function normalizeSupabaseJob(row) {
    if (!row || row.id === null || row.id === undefined || typeof row.title !== "string" || typeof row.company !== "string" || typeof row.city !== "string") {
      throw new Error("The live jobs response contains an invalid job record.");
    }
    const experienceMin = Number(row.experience_min);
    const experienceMax = Number(row.experience_max);
    const experienceSpecified = Number.isFinite(experienceMin) && Number.isFinite(experienceMax) && (experienceMin > 0 || experienceMax > 0);
    return {
      id: String(row.id),
      title: row.title.trim(),
      company: row.company.trim(),
      city: row.city.trim(),
      type: typeof row.job_type === "string" && row.job_type.trim() ? row.job_type.trim() : "Other",
      expMin: Number.isFinite(experienceMin) && experienceMin >= 0 ? experienceMin : 0,
      expMax: experienceSpecified ? experienceMax : 40,
      experienceSpecified,
      salary: typeof row.salary === "string" && row.salary.trim() ? row.salary : "Not specified",
      posted: typeof row.posted_at === "string" ? row.posted_at : "",
      skills: Array.isArray(row.skills) ? row.skills.filter((skill) => typeof skill === "string").map((skill) => skill.toLowerCase()) : [],
      description: typeof row.description === "string" && row.description ? row.description : "No description provided.",
      applyUrl: typeof row.apply_url === "string" ? row.apply_url : "",
      sourceName: "Configured job feeds"
    };
  }

  function stripHtml(value) {
    const document = new DOMParser().parseFromString(value, "text/html");
    document.querySelectorAll("script, style").forEach((element) => element.remove());
    return (document.body.textContent || "").replace(/\s+/g, " ").trim().slice(0, 8000);
  }

  function normalizeArbeitnowJob(row) {
    if (!row || typeof row.slug !== "string" || typeof row.title !== "string" ||
        typeof row.company_name !== "string" || typeof row.url !== "string") {
      throw new Error("Arbeitnow returned an invalid job record.");
    }
    const tags = Array.isArray(row.tags) ? row.tags.filter((tag) => typeof tag === "string") : [];
    const jobTypes = Array.isArray(row.job_types) ? row.job_types.filter((type) => typeof type === "string") : [];
    const createdAt = Number(row.created_at);
    const location = typeof row.location === "string" && row.location.trim() ? row.location.trim() : "Location not specified";
    return {
      id: `arbeitnow-${row.slug}`,
      title: row.title.trim(),
      company: row.company_name.trim(),
      city: row.remote ? `${location} · Remote` : location,
      type: tags[0] || jobTypes[0] || "Other",
      expMin: 0,
      expMax: 40,
      experienceSpecified: false,
      salary: "Not specified",
      posted: Number.isFinite(createdAt) ? new Date(createdAt * 1000).toISOString() : "",
      skills: tags.map((tag) => tag.toLowerCase()),
      description: typeof row.description === "string" ? stripHtml(row.description) : "No description provided.",
      applyUrl: row.url,
      sourceName: "Arbeitnow"
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

  async function fetchJson(url, sourceName, headers) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const options = {
        cache: "no-store",
        signal: controller.signal
      };
      if (headers) options.headers = headers;
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`${sourceName} returned HTTP ${response.status}.`);
      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`${sourceName} request timed out after 15 seconds.`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function fetchSupabasePage(url) {
    const page = await fetchJson(url, "Supabase", {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`
    });
    if (!Array.isArray(page)) throw new Error("Supabase returned an unexpected jobs response.");
    return page;
  }

  async function fetchArbeitnowJobs() {
    const response = await fetchJson(arbeitnowEndpoint, "Arbeitnow");
    if (!response || !Array.isArray(response.data)) {
      throw new Error("Arbeitnow returned an unexpected jobs response.");
    }
    return response.data.map(normalizeArbeitnowJob);
  }

  async function loadArbeitnowOrFallback(statusElement, priorError) {
    try {
      const jobs = await fetchArbeitnowJobs();
      if (!jobs.length) throw new Error("The public feed currently contains no jobs.");
      const prefix = priorError ? `${priorError} ` : "";
      setStatus(statusElement, `${prefix}Showing ${jobs.length} live listings from Arbeitnow. The feed updates hourly; each listing links to its source.`, Boolean(priorError));
      return cacheJobs(jobs, statusElement);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown public feed error.";
      const prefix = priorError ? `${priorError} ` : "";
      return loadCachedOrDemo(statusElement, `${prefix}Arbeitnow live listings could not be loaded: ${reason}`);
    }
  }

  async function loadJobs(statusElement) {
    const hasUrl = config && typeof config.supabaseUrl === "string" && Boolean(config.supabaseUrl.trim());
    const hasKey = config && typeof config.supabaseAnonKey === "string" && Boolean(config.supabaseAnonKey.trim());
    if (!hasUrl && !hasKey) {
      return loadArbeitnowOrFallback(statusElement, "");
    }
    if (!hasUrl || !hasKey || !isConfigured()) {
      return loadArbeitnowOrFallback(statusElement, "Supabase configuration is incomplete or invalid; showing public listings instead.");
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
        const page = await fetchSupabasePage(pageUrl);
        rows.push(...page);
        if (page.length < pageSize) break;
      }
      const jobs = rows.map(normalizeSupabaseJob);
      if (!jobs.length) return loadArbeitnowOrFallback(statusElement, "No active jobs were returned by Supabase; showing public listings instead.");
      if (rows.length >= maxJobs) {
        setStatus(statusElement, "Showing the first 10,000 live jobs. Narrow the date range or search filters.", false);
      } else {
        setStatus(statusElement, `Showing ${rows.length} live job${rows.length === 1 ? "" : "s"} from configured feeds.`, false);
      }
      return cacheJobs(jobs, statusElement);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown request error.";
      return loadArbeitnowOrFallback(statusElement, `Supabase jobs could not be loaded: ${reason}. Showing public listings instead.`);
    }
  }

  window.TestoraJobsApi = { isConfigured, loadJobs };
})();
