(() => {
  const list = document.getElementById("jobList");
  const detail = document.getElementById("jobDetail");
  const count = document.getElementById("resultCount");
  const applicationDialog = document.getElementById("applicationDialog");
  const refreshButton = document.getElementById("refreshJobs");
  let jobs = [];
  let selectedId = "";
  let refreshing = false;
  const stored = window.TestoraProfileStore.load();
  const profile = stored.profile || {};

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value ?? "");
    return node.innerHTML;
  }

  function daysAgo(value) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? Math.max(0, Math.floor((Date.now() - time) / 86400000)) : null;
  }

  function postedLabel(value) {
    const days = daysAgo(value);
    if (days === null) return "Posting date unavailable";
    if (days === 0) return "Posted today";
    if (days === 1) return "Posted yesterday";
    return `Posted ${days} days ago`;
  }

  function experienceLabel(job) {
    return job.experienceSpecified === false
      ? "Experience not specified"
      : `${job.expMin}–${job.expMax} years`;
  }

  function match(job) {
    const skills = Array.isArray(profile.skills) ? profile.skills : [];
    if (!skills.length) return null;
    const hits = job.skills.filter((skill) => skills.includes(skill));
    const years = profile.experienceYears === null || profile.experienceYears === undefined || profile.experienceYears === ""
      ? Number.NaN
      : Number(profile.experienceYears);
    let experienceScore = 1;
    if (Number.isFinite(years)) {
      if (years < job.expMin) experienceScore = Math.max(0, 1 - (job.expMin - years) * .25);
      else if (years > job.expMax + 3) experienceScore = .8;
    }
    return Math.round((hits.length / Math.max(job.skills.length, 1) * .8 + experienceScore * .2) * 100);
  }

  function filteredJobs() {
    const keyword = document.getElementById("keyword").value.trim().toLowerCase();
    const city = document.getElementById("city").value.trim().toLowerCase();
    const experience = document.getElementById("experience").value;
    const category = document.getElementById("category").value;
    const posted = document.querySelector("[name=posted]:checked").value;

    return jobs.filter((job) => {
      const searchable = `${job.title} ${job.company} ${job.type} ${job.city} ${job.description} ${job.skills.join(" ")}`.toLowerCase();
      if (keyword && !searchable.includes(keyword)) return false;
      if (city && !job.city.toLowerCase().includes(city)) return false;
      if (experience !== "" && job.experienceSpecified !== false &&
          !(Number(experience) >= job.expMin && Number(experience) <= job.expMax + 1)) return false;
      if (category && job.type !== category) return false;
      const age = daysAgo(job.posted);
      if (posted && (age === null || age > Number(posted))) return false;
      return true;
    }).sort((a, b) => {
      const aMatch = match(a);
      const bMatch = match(b);
      return aMatch !== null && bMatch !== null ? bMatch - aMatch : new Date(b.posted) - new Date(a.posted);
    });
  }

  function renderDetail(job) {
    if (!job) {
      detail.innerHTML = '<p class="note">Select a job to view its details.</p>';
      return;
    }
    const applyUrl = job.applyUrl ? safeApplyUrl(job.applyUrl) : "";
    const description = String(job.description || "No description provided.");
    detail.innerHTML = `
      <h2>${escapeHtml(job.title)}</h2>
      <p class="company">${escapeHtml(job.company)} · ${escapeHtml(job.city)}</p>
      <div class="meta"><span>${escapeHtml(experienceLabel(job))}</span><span>${escapeHtml(job.salary)}</span></div>
      ${match(job) === null ? "" : `<p><span class="match">${match(job)}% profile match</span></p>`}
      <h4>About the role</h4>
      <p>${escapeHtml(description)}</p>
      <h4>Skills</h4>
      <div class="tags">${job.skills.map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join("")}</div>
      <button class="btn" id="startApplication" type="button" style="width:100%;margin-top:16px">Save application (CV optional)</button>
      ${applyUrl ? `<a class="btn secondary" href="${escapeHtml(applyUrl)}" target="_blank" rel="noopener noreferrer" style="width:100%;margin-top:8px">${job.sourceName === "Arbeitnow" ? "View original listing on Arbeitnow" : "Continue to employer website"}</a>` : '<p class="note">Employer application link unavailable. Saving here does not notify the employer.</p>'}
    `;
    document.getElementById("startApplication").addEventListener("click", () => openApplication(job));
  }

  function safeApplyUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function render() {
    const rows = filteredJobs();
    count.textContent = `${rows.length} job${rows.length === 1 ? "" : "s"} found`;
    list.innerHTML = rows.length ? rows.map((job) => {
      const score = match(job);
      return `
        <article class="card job-card${selectedId === job.id ? " selected" : ""}" data-job-id="${escapeHtml(job.id)}" tabindex="0" role="button" aria-label="View ${escapeHtml(job.title)}">
          <div class="row"><div><h3>${escapeHtml(job.title)}</h3><div class="company">${escapeHtml(job.company)}</div></div>${score === null ? "" : `<span class="match">${score}% match</span>`}</div>
          <div class="meta"><span>${escapeHtml(job.city)}</span><span>${escapeHtml(experienceLabel(job))}</span><span>${escapeHtml(job.salary)}</span></div>
          <div class="tags">${job.skills.slice(0, 5).map((skill) => `<span class="tag">${escapeHtml(skill)}</span>`).join("")}</div>
          <div class="posted">${escapeHtml(postedLabel(job.posted))}${job.isDemo ? " · Sample listing" : job.sourceName ? ` · Source: ${escapeHtml(job.sourceName)}` : ""}</div>
        </article>`;
    }).join("") : '<div class="card">No jobs match these filters. Try another location, keyword, or date range.</div>';
    if (selectedId && !rows.some((job) => job.id === selectedId)) selectedId = "";
    renderDetail(rows.find((job) => job.id === selectedId));
  }

  function renderCategories() {
    const category = document.getElementById("category");
    const selected = category.value;
    const values = [...new Set(jobs.map((job) => job.type).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    category.replaceChildren(new Option("All categories", ""));
    values.forEach((value) => category.add(new Option(value, value)));
    if (values.includes(selected)) category.value = selected;
  }

  async function refreshJobs() {
    if (refreshing) return;
    refreshing = true;
    refreshButton.disabled = true;
    refreshButton.textContent = "Refreshing…";
    try {
      const loaded = await window.TestoraJobsApi.loadJobs(document.getElementById("catalogStatus"));
      jobs = loaded.map((job) => ({ ...job, isDemo: String(job.id).startsWith("demo-") }));
      renderCategories();
      render();
      document.getElementById("lastRefresh").textContent = `Last checked ${new Date().toLocaleTimeString()}`;
    } catch (error) {
      const status = document.getElementById("catalogStatus");
      const reason = error instanceof Error ? error.message : "Unknown error.";
      status.textContent = `Could not refresh job listings: ${reason} Existing results are unchanged.`;
      status.dataset.state = "error";
    } finally {
      refreshing = false;
      refreshButton.disabled = false;
      refreshButton.textContent = "Refresh listings";
    }
  }

  async function openApplication(job) {
    const profileData = window.TestoraProfileStore.load();
    const candidate = profileData.profile || {};
    document.getElementById("applicationJob").textContent = `${job.title} at ${job.company} · ${job.city}`;
    document.getElementById("applicationName").value = candidate.name || "";
    document.getElementById("applicationEmail").value = candidate.email || "";
    document.getElementById("applicationPhone").value = candidate.phone || "";
    document.getElementById("applicationStatus").textContent = "";
    document.getElementById("applicationCv").value = "";
    const savedOption = document.querySelector("#resumeChoice option[value=saved]");
    try {
      const resume = await window.TestoraDeviceStore.getResume("profile");
      savedOption.hidden = !resume;
      savedOption.textContent = resume ? `Use saved profile CV (${resume.name})` : "Use saved profile CV";
    } catch (error) {
      savedOption.hidden = true;
      document.getElementById("applicationStatus").textContent = error instanceof Error
        ? `Saved CV could not be read: ${error.message}`
        : "Saved CV could not be read.";
    }
    document.getElementById("resumeChoice").value = "none";
    document.getElementById("applicationCvLabel").hidden = true;
    applicationDialog.dataset.jobId = job.id;
    applicationDialog.showModal();
  }

  function updateApplicationResumeControl() {
    const choice = document.getElementById("resumeChoice").value;
    document.getElementById("applicationCvLabel").hidden = choice !== "new";
    if (choice !== "new") document.getElementById("applicationCv").value = "";
  }

  list.addEventListener("click", (event) => {
    const card = event.target.closest("[data-job-id]");
    if (!card) return;
    selectedId = card.dataset.jobId;
    render();
  });
  list.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-job-id]");
    if (!card) return;
    event.preventDefault();
    selectedId = card.dataset.jobId;
    render();
  });
  document.getElementById("searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    render();
  });
  document.getElementById("applyFilters").addEventListener("click", render);
  document.getElementById("category").addEventListener("change", render);
  refreshButton.addEventListener("click", refreshJobs);
  document.getElementById("closeApplication").addEventListener("click", () => applicationDialog.close());
  document.getElementById("resumeChoice").addEventListener("change", updateApplicationResumeControl);
  document.getElementById("applicationCv").addEventListener("change", () => {
    if (document.getElementById("applicationCv").files.length) {
      document.getElementById("resumeChoice").value = "new";
      updateApplicationResumeControl();
    }
  });
  document.getElementById("applicationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const job = jobs.find((item) => item.id === applicationDialog.dataset.jobId);
    if (!job) {
      document.getElementById("applicationStatus").textContent = "The selected job is no longer available. Close this form and select it again.";
      return;
    }
    const choice = document.getElementById("resumeChoice").value;
    const file = document.getElementById("applicationCv").files[0];
    if (choice === "new" && !file) {
      document.getElementById("applicationStatus").textContent = "Choose a CV file or select another CV option.";
      return;
    }
    if (file && !/\.(pdf|docx|txt)$/i.test(file.name)) {
      document.getElementById("applicationStatus").textContent = "Use a PDF, DOCX, or TXT file.";
      return;
    }
    const applicantName = document.getElementById("applicationName").value.trim();
    const applicantEmail = document.getElementById("applicationEmail").value.trim();
    if (!applicantName || !applicantEmail) {
      document.getElementById("applicationStatus").textContent = "Enter your name and a valid email address.";
      return;
    }
    const submit = document.getElementById("saveApplication");
    submit.disabled = true;
    document.getElementById("applicationStatus").textContent = "Saving this application on your device…";
    try {
      let resumeBlob = null;
      let resumeName = "";
      if (choice === "saved") {
        const resume = await window.TestoraDeviceStore.getResume("profile");
        if (!resume) throw new Error("The saved profile CV is no longer available. Choose another option.");
        resumeBlob = resume.blob;
        resumeName = resume.name;
      } else if (choice === "new" && file) {
        resumeBlob = file;
        resumeName = file.name;
      }
      const application = {
        id: `application-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        city: job.city,
        applicantName,
        email: applicantEmail,
        phone: document.getElementById("applicationPhone").value.trim(),
        savedAt: new Date().toISOString(),
        resumeName,
        resumeBlob
      };
      await window.TestoraDeviceStore.saveApplication(application);
      document.getElementById("applicationStatus").textContent = "Saved on this device. The employer has not been notified.";
      applicationDialog.close();
      const toast = document.getElementById("toast");
      toast.textContent = "Application saved on this device; it was not sent to the employer.";
      toast.style.display = "block";
      window.setTimeout(() => { toast.style.display = "none"; }, 4000);
    } catch (error) {
      document.getElementById("applicationStatus").textContent = error instanceof Error
        ? `Could not save this application: ${error.message}`
        : "Could not save this application.";
    } finally {
      submit.disabled = false;
    }
  });

  async function start() {
    await refreshJobs();
    if (stored.error) {
      const status = document.getElementById("catalogStatus");
      status.textContent += ` Profile session data could not be read: ${stored.error}`;
      status.dataset.state = "error";
    }
    window.setInterval(refreshJobs, 60 * 60 * 1000);
  }

  start();
})();
