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

  function normalizeSupabaseJob(row) {
    if (!row || row.id === null || row.id === undefined || typeof row.title !== "string" || typeof row.company !== "string" || typeof row.city !== "string") {
      throw new Error("The live jobs response contains an invalid job record.");
    }
    const experienceMin = Number(row.experience_min);
    const experienceMax = Number(row.experience_max);
    const experienceSpecified = row.experience_min !== null && row.experience_max !== null &&
      Number.isFinite(experienceMin) && Number.isFinite(experienceMax) &&
      experienceMin >= 0 && experienceMax >= experienceMin;
    const city = row.city.trim();
    return {
      id: String(row.id),
      title: row.title.trim(),
      company: row.company.trim(),
      city,
      locationScopes: [city],
      type: typeof row.job_type === "string" && row.job_type.trim() ? row.job_type.trim() : "Other",
      level: typeof row.job_type === "string" ? row.job_type.trim() : "",
      expMin: experienceSpecified && experienceMin >= 0 ? experienceMin : 0,
      expMax: experienceSpecified && experienceMax >= 0 ? experienceMax : 40,
      experienceSpecified,
      salary: typeof row.salary === "string" && row.salary.trim() ? row.salary : "Not specified",
      posted: typeof row.posted_at === "string" ? row.posted_at : "",
      skills: Array.isArray(row.skills) ? row.skills.filter((skill) => typeof skill === "string").map((skill) => skill.toLowerCase()) : [],
      description: typeof row.description === "string" && row.description ? row.description : "No description provided.",
      applyUrl: typeof row.apply_url === "string" ? row.apply_url : "",
      sourceName: "Configured job feeds"
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

  async function readCachedJobs() {
    try {
      return { jobs: await window.TestoraDeviceStore.getJobs(), warning: "" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown device storage error.";
      return { jobs: [], warning: `Could not read the on-device job cache: ${reason}.` };
    }
  }

  function demoOrCache(statusElement, reason, cachedJobs, cacheWarning) {
    const jobs = cachedJobs.length ? cachedJobs : window.DEMO_JOBS;
    const description = cachedJobs.length
      ? `${reason} Showing ${cachedJobs.length} listings cached on this device.`
      : `${reason} Sample listings are shown.`;
    setStatus(statusElement, `${description}${cacheWarning ? ` ${cacheWarning}` : ""}`, true);
    return jobs;
  }

  async function fetchJson(url, sourceName, headers) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const options = { cache: "no-store", signal: controller.signal };
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

  async function fetchSupabaseJobs() {
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
    return { jobs: rows.map(normalizeSupabaseJob), truncated: rows.length >= maxJobs };
  }

  async function loadPublicSources(statusElement, filters, cachedJobs, warnings, cacheWarning) {
    try {
      const result = await window.TestoraJobSources.loadAll(filters || {}, cachedJobs);
      let jobs = result.jobs;
      let status;
      if (jobs.length) {
        status = result.loadedSources.length
          ? `Showing ${jobs.length} listings from ${result.loadedSources.join(", ")}. Listings link to their original sources.`
          : `Showing ${jobs.length} cached listings from this device.`;
      } else if (cachedJobs.length) {
        jobs = cachedJobs;
        status = `No live listings are currently available. Showing ${jobs.length} listings cached on this device.`;
      } else {
        const failures = [...warnings, ...result.warnings].join(" ");
        return demoOrCache(
          statusElement,
          failures || "The public job sources did not return any listings.",
          cachedJobs,
          cacheWarning
        );
      }
      const allWarnings = [...new Set([...warnings, ...result.warnings, cacheWarning].filter(Boolean))];
      if (allWarnings.length) status += ` ${allWarnings.join(" ")}`;
      setStatus(statusElement, status, allWarnings.length > 0);
      return cacheJobs(jobs, statusElement);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown public source error.";
      return demoOrCache(
        statusElement,
        [...warnings, `Public job sources could not be loaded: ${reason}`].join(" "),
        cachedJobs,
        cacheWarning
      );
    }
  }

  async function loadJobs(statusElement, filters) {
    const cache = await readCachedJobs();
    const priorWarnings = [];
    if (cache.warning) priorWarnings.push(cache.warning);

    const hasUrl = config && typeof config.supabaseUrl === "string" && Boolean(config.supabaseUrl.trim());
    const hasKey = config && typeof config.supabaseAnonKey === "string" && Boolean(config.supabaseAnonKey.trim());
    if (hasUrl || hasKey) {
      if (!hasUrl || !hasKey || !isConfigured()) {
        priorWarnings.push("Supabase configuration is incomplete or invalid; trying public listings instead.");
      } else {
        try {
          const result = await fetchSupabaseJobs();
          if (result.jobs.length) {
            const message = result.truncated
              ? "Showing the first 10,000 live jobs. Narrow the date range or search filters."
              : `Showing ${result.jobs.length} live job${result.jobs.length === 1 ? "" : "s"} from configured feeds.`;
            setStatus(statusElement, message, false);
            return cacheJobs(result.jobs, statusElement);
          }
          priorWarnings.push("No active jobs were returned by Supabase; trying public listings instead.");
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Unknown request error.";
          priorWarnings.push(`Supabase jobs could not be loaded: ${reason}`);
        }
      }
    }

    return loadPublicSources(statusElement, filters, cache.jobs, priorWarnings, cache.warning);
  }

  window.TestoraJobsApi = { isConfigured, loadJobs };
})();
