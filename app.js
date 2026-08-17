/**
 * JobPulse AI - Core Web Application Logic
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- Application State ---
    let state = {
        jobs: [],
        filteredJobs: [],
        savedJobs: JSON.parse(localStorage.getItem("jobpulse_saved") || "[]"),
        viewMode: "grid", // "grid" or "list"
        activeTab: "tab-explore",
        activeSavedFilter: "all",
        charts: {}
    };

    // --- DOM Elements ---
    const navButtons = document.querySelectorAll(".nav-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");
    const jobsContainer = document.getElementById("jobs-container");
    const emptyState = document.getElementById("empty-state");
    const showingCount = document.getElementById("showing-count");
    const dataStatusText = document.getElementById("data-status-text");
    const savedCountBadge = document.getElementById("saved-count-badge");

    // Inputs
    const filterKeyword = document.getElementById("filter-keyword");
    const filterLocation = document.getElementById("filter-location");
    const filterSite = document.getElementById("filter-site");
    const filterType = document.getElementById("filter-type");
    const filterRemote = document.getElementById("filter-remote");
    const filterSort = document.getElementById("filter-sort");
    const btnApplyFilters = document.getElementById("btn-apply-filters");
    const btnResetFilters = document.getElementById("btn-reset-filters");

    // Views & Modals
    const viewGridBtn = document.getElementById("view-grid-btn");
    const viewListBtn = document.getElementById("view-list-btn");
    const jobModal = document.getElementById("job-modal");
    const modalCloseBtn = document.getElementById("modal-close-btn");

    // File Actions
    const csvFileInput = document.getElementById("csv-file-input");
    const btnUploadTrigger = document.getElementById("btn-upload-trigger");
    const btnExportTrigger = document.getElementById("btn-export-trigger");

    // Scraper Elements
    const scraperForm = document.getElementById("scraper-form");
    const scraperLogTerminal = document.getElementById("scraper-log-terminal");
    const btnClearLog = document.getElementById("btn-clear-log");

    // --- Init Application ---
    init();

    async function init() {
        setupEventListeners();
        updateSavedBadge();
        await loadInitialData();
    }

    // --- Data Fetching ---
    async function loadInitialData() {
        logTerminal("[SYSTEM] Fetching job dataset from API server...", "info");
        const apiEndpoints = ["/api/jobs", "http://localhost:8000/api/jobs"];
        
        for (const endpoint of apiEndpoints) {
            try {
                const response = await fetch(endpoint);
                if (response.ok) {
                    const data = await response.json();
                    if (data.jobs && data.jobs.length > 0) {
                        state.jobs = cleanJobsData(data.jobs);
                        logTerminal(`[SYSTEM] Loaded ${state.jobs.length} jobs from server backend (${endpoint}).`, "success");
                        applyFiltersAndRender();
                        renderAnalytics();
                        return;
                    }
                }
            } catch (e) {
                console.warn(`API fetch from ${endpoint} failed`, e);
            }
        }

        // Fallback: Check if PapaParse can fetch local jobs_output.csv directly
        logTerminal("[SYSTEM] Attempting direct CSV fallback load...", "warn");
        Papa.parse("jobs_output.csv", {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                if (results.data && results.data.length > 0) {
                    state.jobs = cleanJobsData(results.data);
                    logTerminal(`[SYSTEM] Successfully loaded ${state.jobs.length} jobs via CSV fallback.`, "success");
                    applyFiltersAndRender();
                    renderAnalytics();
                } else {
                    logTerminal("[SYSTEM] No initial data found. Trigger a scrape or upload CSV.", "warn");
                    renderEmptyState();
                }
            },
            error: function (err) {
                logTerminal("[SYSTEM] Error reading local CSV dataset.", "error");
                renderEmptyState();
            }
        });
    }

    function cleanJobsData(rawJobs) {
        return rawJobs.map((j, idx) => {
            const id = j.id || `job-${idx}-${Date.now()}`;
            const title = j.title || "Untitled Role";
            const company = j.company || "Unknown Company";
            const location = j.location || "Unspecified Location";
            const site = (j.site || "indeed").toLowerCase();
            const date_posted = j.date_posted || "Recently";
            const job_type = j.job_type || "Full-Time";
            const is_remote = String(j.is_remote).toLowerCase() === "true" || location.toLowerCase().includes("remote");
            
            // Format Salary
            let salaryText = "Salary Undisclosed";
            const minSal = parseFloat(j.min_amount || 0);
            const maxSal = parseFloat(j.max_amount || 0);
            const interval = j.interval || "yearly";
            const currency = j.currency || "USD";

            if (minSal > 0 || maxSal > 0) {
                const sym = currency === "USD" ? "$" : `${currency} `;
                if (minSal > 0 && maxSal > 0) {
                    salaryText = `${sym}${formatNum(minSal)} - ${sym}${formatNum(maxSal)} / ${interval}`;
                } else if (maxSal > 0) {
                    salaryText = `Up to ${sym}${formatNum(maxSal)} / ${interval}`;
                } else {
                    salaryText = `From ${sym}${formatNum(minSal)} / ${interval}`;
                }
            }

            return {
                id,
                title,
                company,
                location,
                site,
                date_posted,
                job_type,
                is_remote,
                salaryText,
                minSal,
                maxSal,
                interval,
                currency,
                description: j.description || "No detailed job description provided.",
                skills: j.skills || extractSkills(j.description || ""),
                job_url: j.job_url || "#",
                emails: j.emails || "",
                company_url: j.company_url || "#",
                raw: j
            };
        });
    }

    function extractSkills(text) {
        const keywords = [
            "Python", "JavaScript", "React", "Node.js", "TypeScript", "SQL", "AWS", "Docker",
            "Kubernetes", "Java", "C++", "Go", "Rust", "Git", "REST API", "GraphQL", "Linux",
            "PostgreSQL", "MongoDB", "PyTorch", "TensorFlow", "HTML", "CSS", "Tailwind", "Next.js"
        ];
        const found = [];
        keywords.forEach(kw => {
            if (new RegExp(`\\b${kw}\\b`, "i").test(text)) {
                found.push(kw);
            }
        });
        return found.join(", ");
    }

    function formatNum(num) {
        if (num >= 1000) return (num / 1000).toFixed(0) + "k";
        return num.toLocaleString();
    }

    // --- Filtering & Rendering ---
    function applyFiltersAndRender() {
        const kw = filterKeyword.value.trim().toLowerCase();
        const loc = filterLocation.value.trim().toLowerCase();
        const site = filterSite.value;
        const type = filterType.value;
        const remote = filterRemote.value;
        const sort = filterSort.value;

        state.filteredJobs = state.jobs.filter(job => {
            // Keyword match
            if (kw) {
                const searchCorpus = `${job.title} ${job.company} ${job.skills} ${job.description}`.toLowerCase();
                if (!searchCorpus.includes(kw)) return false;
            }
            // Location match
            if (loc && !job.location.toLowerCase().includes(loc)) {
                return false;
            }
            // Site match
            if (site !== "all" && job.site !== site) {
                return false;
            }
            // Job Type match
            if (type !== "all" && job.job_type.toLowerCase() !== type.toLowerCase()) {
                return false;
            }
            // Workplace match
            if (remote === "remote" && !job.is_remote) return false;
            if (remote === "onsite" && job.is_remote) return false;

            return true;
        });

        // Sorting
        state.filteredJobs.sort((a, b) => {
            if (sort === "salary-high") {
                return (b.maxSal || b.minSal || 0) - (a.maxSal || a.minSal || 0);
            }
            if (sort === "title") return a.title.localeCompare(b.title);
            if (sort === "company") return a.company.localeCompare(b.company);
            // Default newest
            return String(b.date_posted).localeCompare(String(a.date_posted));
        });

        // Update Counter
        showingCount.textContent = state.filteredJobs.length;
        dataStatusText.textContent = `Loaded ${state.jobs.length} Jobs`;

        if (state.filteredJobs.length === 0) {
            jobsContainer.innerHTML = "";
            emptyState.classList.remove("hidden");
        } else {
            emptyState.classList.add("hidden");
            if (state.viewMode === "grid") {
                renderGridView();
            } else {
                renderListView();
            }
        }
    }

    function renderGridView() {
        jobsContainer.className = "jobs-grid";
        jobsContainer.innerHTML = state.filteredJobs.map(job => {
            const isSaved = state.savedJobs.some(s => s.id === job.id);
            const skillsList = job.skills ? job.skills.split(",").slice(0, 3) : [];

            return `
                <div class="job-card" data-id="${job.id}">
                    <div class="card-top">
                        <div class="company-logo-avatar">
                            ${job.company.substring(0, 2).toUpperCase()}
                        </div>
                        <div class="card-info">
                            <h3 class="card-title" title="${escapeHtml(job.title)}">${escapeHtml(job.title)}</h3>
                            <div class="card-company">
                                <i class="fa-solid fa-building"></i> ${escapeHtml(job.company)}
                            </div>
                        </div>
                        <button class="card-bookmark-btn ${isSaved ? 'saved' : ''}" data-action="bookmark" data-id="${job.id}">
                            <i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
                        </button>
                    </div>

                    <div class="card-meta-tags">
                        <span class="meta-badge platform-${job.site}">
                            <i class="fa-solid fa-globe"></i> ${job.site.toUpperCase()}
                        </span>
                        <span class="meta-badge">
                            <i class="fa-solid fa-location-dot"></i> ${escapeHtml(job.location)}
                        </span>
                        ${job.is_remote ? '<span class="meta-badge" style="color:#10b981;border-color:rgba(16,185,129,0.3);"><i class="fa-solid fa-wifi"></i> Remote</span>' : ''}
                        <span class="meta-badge salary">
                            <i class="fa-solid fa-sack-dollar"></i> ${job.salaryText}
                        </span>
                    </div>

                    <p class="card-snippet">${escapeHtml(job.description)}</p>

                    <div class="card-footer">
                        <span class="posted-age"><i class="fa-regular fa-clock"></i> ${escapeHtml(job.date_posted)}</span>
                        <button class="btn btn-secondary btn-sm" data-action="view-details" data-id="${job.id}">
                            View Details <i class="fa-solid fa-arrow-right"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    }

    function renderListView() {
        jobsContainer.className = "jobs-list-container";
        jobsContainer.innerHTML = `
            <table class="jobs-list-table">
                <thead>
                    <tr>
                        <th>Job Title</th>
                        <th>Company</th>
                        <th>Location</th>
                        <th>Board</th>
                        <th>Salary</th>
                        <th>Posted</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${state.filteredJobs.map(job => `
                        <tr>
                            <td><strong>${escapeHtml(job.title)}</strong></td>
                            <td>${escapeHtml(job.company)}</td>
                            <td>${escapeHtml(job.location)} ${job.is_remote ? '<span class="badge">Remote</span>' : ''}</td>
                            <td><span class="meta-badge platform-${job.site}">${job.site}</span></td>
                            <td class="salary-cell">${job.salaryText}</td>
                            <td>${escapeHtml(job.date_posted)}</td>
                            <td>
                                <button class="btn btn-secondary btn-sm" data-action="view-details" data-id="${job.id}">
                                    View
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    // --- Modal Logic ---
    function openJobModal(jobId) {
        const job = state.jobs.find(j => j.id === jobId);
        if (!job) return;

        document.getElementById("modal-company-logo").textContent = job.company.substring(0, 2).toUpperCase();
        document.getElementById("modal-job-title").textContent = job.title;
        document.getElementById("modal-company-name").innerHTML = `<i class="fa-solid fa-building"></i> ${escapeHtml(job.company)}`;
        document.getElementById("modal-location").innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(job.location)}`;
        document.getElementById("modal-posted-date").innerHTML = `<i class="fa-solid fa-calendar-day"></i> ${escapeHtml(job.date_posted)}`;
        
        const platformBadge = document.getElementById("modal-platform");
        platformBadge.textContent = job.site.toUpperCase();
        platformBadge.className = `badge platform-${job.site}`;

        document.getElementById("modal-salary").textContent = job.salaryText;
        document.getElementById("modal-job-type").textContent = job.job_type || "Full-Time";
        document.getElementById("modal-work-type").textContent = job.is_remote ? "Remote" : "On-Site / Hybrid";
        document.getElementById("modal-email").textContent = job.emails || "N/A";

        // Skills tags
        const skillsContainer = document.getElementById("modal-skills-tags");
        if (job.skills) {
            skillsContainer.innerHTML = job.skills.split(",").map(sk => `<span class="skill-tag">${escapeHtml(sk.strip ? sk.strip() : sk.trim())}</span>`).join("");
        } else {
            skillsContainer.innerHTML = "<span class='text-muted'>General Engineering Skills</span>";
        }

        document.getElementById("modal-description").textContent = job.description;

        // Action Buttons
        const applyBtn = document.getElementById("modal-apply-btn");
        applyBtn.href = job.job_url;

        const saveBtn = document.getElementById("modal-save-btn");
        const isSaved = state.savedJobs.some(s => s.id === job.id);
        saveBtn.innerHTML = isSaved ? `<i class="fa-solid fa-bookmark"></i> Saved` : `<i class="fa-regular fa-bookmark"></i> Save Application`;
        saveBtn.onclick = () => {
            toggleSaveJob(job);
            openJobModal(jobId); // Refresh modal button
        };

        jobModal.classList.add("open");
    }

    function toggleSaveJob(job) {
        const idx = state.savedJobs.findIndex(s => s.id === job.id);
        if (idx >= 0) {
            state.savedJobs.splice(idx, 1);
            logTerminal(`[APP] Removed '${job.title}' from saved applications.`, "info");
        } else {
            state.savedJobs.push({
                ...job,
                status: "Saved",
                notes: "",
                savedDate: new Date().toLocaleDateString()
            });
            logTerminal(`[APP] Saved '${job.title}' to application tracker.`, "success");
        }
        localStorage.setItem("jobpulse_saved", JSON.stringify(state.savedJobs));
        updateSavedBadge();
        applyFiltersAndRender();
        renderSavedTracker();
    }

    function updateSavedBadge() {
        savedCountBadge.textContent = state.savedJobs.length;
    }

    // --- Saved Applications Tracker Tab ---
    function renderSavedTracker() {
        const container = document.getElementById("saved-jobs-container");
        const emptySaved = document.getElementById("saved-empty-state");

        // Pipeline Counts
        const counts = { all: state.savedJobs.length, Saved: 0, Applied: 0, Interviewing: 0, Offered: 0 };
        state.savedJobs.forEach(j => {
            if (counts[j.status] !== undefined) counts[j.status]++;
        });

        document.getElementById("pipe-count-all").textContent = counts.all;
        document.getElementById("pipe-count-saved").textContent = counts.Saved;
        document.getElementById("pipe-count-applied").textContent = counts.Applied;
        document.getElementById("pipe-count-interviewing").textContent = counts.Interviewing;
        document.getElementById("pipe-count-offered").textContent = counts.Offered;

        const filteredSaved = state.savedJobs.filter(j => {
            if (state.activeSavedFilter === "all") return true;
            return j.status === state.activeSavedFilter;
        });

        if (filteredSaved.length === 0) {
            container.innerHTML = "";
            emptySaved.style.display = "block";
            return;
        }

        emptySaved.style.display = "none";
        container.innerHTML = `
            <table class="jobs-list-table">
                <thead>
                    <tr>
                        <th>Job Title & Company</th>
                        <th>Location</th>
                        <th>Application Status</th>
                        <th>Notes</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${filteredSaved.map(j => `
                        <tr>
                            <td>
                                <strong>${escapeHtml(j.title)}</strong><br>
                                <span class="text-muted">${escapeHtml(j.company)}</span>
                            </td>
                            <td>${escapeHtml(j.location)}</td>
                            <td>
                                <select class="status-select" data-id="${j.id}">
                                    <option value="Saved" ${j.status === 'Saved' ? 'selected' : ''}>📌 Saved</option>
                                    <option value="Applied" ${j.status === 'Applied' ? 'selected' : ''}>📩 Applied</option>
                                    <option value="Interviewing" ${j.status === 'Interviewing' ? 'selected' : ''}>🎯 Interviewing</option>
                                    <option value="Offered" ${j.status === 'Offered' ? 'selected' : ''}>🎉 Offered</option>
                                </select>
                            </td>
                            <td>
                                <input type="text" class="notes-input" data-id="${j.id}" value="${escapeHtml(j.notes || '')}" placeholder="Add private note...">
                            </td>
                            <td>
                                <button class="btn btn-outline btn-sm" data-action="remove-saved" data-id="${j.id}">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

        // Attach listeners for status & notes
        container.querySelectorAll(".status-select").forEach(sel => {
            sel.addEventListener("change", (e) => {
                const j = state.savedJobs.find(item => item.id === e.target.dataset.id);
                if (j) {
                    j.status = e.target.value;
                    localStorage.setItem("jobpulse_saved", JSON.stringify(state.savedJobs));
                    renderSavedTracker();
                }
            });
        });

        container.querySelectorAll(".notes-input").forEach(inp => {
            inp.addEventListener("blur", (e) => {
                const j = state.savedJobs.find(item => item.id === e.target.dataset.id);
                if (j) {
                    j.notes = e.target.value;
                    localStorage.setItem("jobpulse_saved", JSON.stringify(state.savedJobs));
                }
            });
        });
    }

    // --- Analytics Charts ---
    function renderAnalytics() {
        if (state.jobs.length === 0) return;

        // KPI Calculations
        document.getElementById("kpi-total-jobs").textContent = state.jobs.length;
        
        const salaries = state.jobs.map(j => {
            let sal = j.maxSal || j.minSal || 0;
            if (j.interval === "hourly" && sal > 0) sal *= 2080;
            return sal;
        }).filter(s => s > 10000 && s < 500000);

        const avgSal = salaries.length ? Math.round(salaries.reduce((a,b) => a+b, 0) / salaries.length) : 0;
        document.getElementById("kpi-avg-salary").textContent = avgSal ? `$${avgSal.toLocaleString()}` : "N/A";

        const remoteCount = state.jobs.filter(j => j.is_remote).length;
        const remoteRatio = Math.round((remoteCount / state.jobs.length) * 100);
        document.getElementById("kpi-remote-ratio").textContent = `${remoteRatio}%`;

        const siteCounts = {};
        state.jobs.forEach(j => siteCounts[j.site] = (siteCounts[j.site] || 0) + 1);
        const topPlatform = Object.keys(siteCounts).sort((a,b) => siteCounts[b] - siteCounts[a])[0] || "-";
        document.getElementById("kpi-top-platform").textContent = topPlatform.toUpperCase();

        // Chart 1: Salary Distribution
        createOrUpdateChart("chart-salary", "bar", {
            labels: ["$50k-$80k", "$80k-$110k", "$110k-$140k", "$140k-$170k", "$170k+"],
            datasets: [{
                label: "Job Count",
                data: [
                    salaries.filter(s => s >= 50000 && s < 80000).length,
                    salaries.filter(s => s >= 80000 && s < 110000).length,
                    salaries.filter(s => s >= 110000 && s < 140000).length,
                    salaries.filter(s => s >= 140000 && s < 170000).length,
                    salaries.filter(s => s >= 170000).length
                ],
                backgroundColor: "#6366f1",
                borderRadius: 6
            }]
        });

        // Chart 2: Jobs by Platform
        createOrUpdateChart("chart-platform", "doughnut", {
            labels: Object.keys(siteCounts).map(s => s.toUpperCase()),
            datasets: [{
                data: Object.values(siteCounts),
                backgroundColor: ["#3b82f6", "#0a66c2", "#10b981", "#8b5cf6"]
            }]
        });

        // Chart 3: Workplace Type
        createOrUpdateChart("chart-workplace", "pie", {
            labels: ["Remote", "On-Site / Hybrid"],
            datasets: [{
                data: [remoteCount, state.jobs.length - remoteCount],
                backgroundColor: ["#10b981", "#64748b"]
            }]
        });

        // Chart 4: Top Skills
        const skillsFreq = {};
        state.jobs.forEach(j => {
            if (j.skills) {
                j.skills.split(",").forEach(s => {
                    const clean = s.trim();
                    if (clean) skillsFreq[clean] = (skillsFreq[clean] || 0) + 1;
                });
            }
        });
        const topSkills = Object.entries(skillsFreq).sort((a,b) => b[1] - a[1]).slice(0, 8);

        createOrUpdateChart("chart-skills", "bar", {
            labels: topSkills.map(s => s[0]),
            datasets: [{
                label: "Demand Frequency",
                data: topSkills.map(s => s[1]),
                backgroundColor: "#8b5cf6",
                borderRadius: 6
            }]
        }, { indexAxis: 'y' });
    }

    function createOrUpdateChart(canvasId, type, data, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;

        if (state.charts[canvasId]) {
            state.charts[canvasId].destroy();
        }

        state.charts[canvasId] = new Chart(ctx, {
            type: type,
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#94a3b8' } }
                },
                scales: type === "doughnut" || type === "pie" ? {} : {
                    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
                },
                ...options
            }
        });
    }

    // --- Scraper Control Panel ---
    scraperForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const search = document.getElementById("scrape-search").value;
        const location = document.getElementById("scrape-location").value;
        const results = document.getElementById("scrape-results").value;
        const hours = document.getElementById("scrape-hours").value;
        const remote = document.getElementById("scrape-remote").checked;

        const siteBoxes = document.querySelectorAll("input[name='scrape-site']:checked");
        const sites = Array.from(siteBoxes).map(cb => cb.value);

        logTerminal(`[SCRAPER] Launching job query: '${search}' in '${location}'...`, "info");
        logTerminal(`[SCRAPER] Target sites: ${sites.join(", ")} | Results per site: ${results}`, "info");

        const btn = document.getElementById("btn-start-scrape");
        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scraping Live Jobs...`;

        const scrapeEndpoints = ["/api/scrape", "http://localhost:8000/api/scrape"];
        let success = false;

        const payload = JSON.stringify({
            search_term: search,
            location: location,
            results_wanted: results,
            hours_old: hours,
            is_remote: remote,
            site_name: sites
        });

        for (const endpoint of scrapeEndpoints) {
            try {
                const res = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: payload
                });

                if (res.ok) {
                    const result = await res.json();
                    logTerminal(`[SCRAPER] ${result.message}`, "success");
                    if (result.jobs) {
                        state.jobs = cleanJobsData(result.jobs);
                        applyFiltersAndRender();
                        renderAnalytics();
                        logTerminal(`[SYSTEM] Feed updated with ${state.jobs.length} jobs.`, "success");
                    }
                    success = true;
                    break;
                }
            } catch (err) {
                console.warn(`Scraper API endpoint ${endpoint} unreachable:`, err);
            }
        }

        if (!success) {
            logTerminal(`[SCRAPER ERROR] Could not connect to Python backend server.`, "error");
            logTerminal(`[TIP] Ensure backend is running with '.\\.venv\\Scripts\\python.exe app.py' on port 8000.`, "warn");
        } finally {
            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-play"></i> Run Live Job Scraper`;
        }
    });

    function logTerminal(msg, type = "info") {
        const line = document.createElement("div");
        line.className = `log-line ${type}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        scraperLogTerminal.appendChild(line);
        scraperLogTerminal.scrollTop = scraperLogTerminal.scrollHeight;
    }

    btnClearLog.addEventListener("click", () => {
        scraperLogTerminal.innerHTML = '<div class="log-line info">[SYSTEM] Log cleared.</div>';
    });

    // --- Events & Navigation ---
    function setupEventListeners() {
        // Tab switching
        navButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                navButtons.forEach(b => b.classList.remove("active"));
                tabPanes.forEach(p => p.classList.remove("active"));

                btn.classList.add("active");
                const targetTab = btn.dataset.tab;
                document.getElementById(targetTab).classList.add("active");
                state.activeTab = targetTab;

                if (targetTab === "tab-analytics") renderAnalytics();
                if (targetTab === "tab-saved") renderSavedTracker();
            });
        });

        // Search & Filter listeners
        btnApplyFilters.addEventListener("click", applyFiltersAndRender);
        filterKeyword.addEventListener("keyup", (e) => { if (e.key === "Enter") applyFiltersAndRender(); });
        filterLocation.addEventListener("keyup", (e) => { if (e.key === "Enter") applyFiltersAndRender(); });
        filterSite.addEventListener("change", applyFiltersAndRender);
        filterType.addEventListener("change", applyFiltersAndRender);
        filterRemote.addEventListener("change", applyFiltersAndRender);
        filterSort.addEventListener("change", applyFiltersAndRender);

        btnResetFilters.addEventListener("click", () => {
            filterKeyword.value = "";
            filterLocation.value = "";
            filterSite.value = "all";
            filterType.value = "all";
            filterRemote.value = "all";
            filterSort.value = "newest";
            document.querySelectorAll(".chip-btn").forEach(c => c.classList.remove("active"));
            applyFiltersAndRender();
        });

        // Quick Preset Chips
        document.querySelectorAll(".chip-btn[data-preset]").forEach(chip => {
            chip.addEventListener("click", () => {
                document.querySelectorAll(".chip-btn").forEach(c => c.classList.remove("active"));
                chip.classList.add("active");
                const preset = chip.dataset.preset;
                
                if (preset === "remote-eng") {
                    filterKeyword.value = "Software Engineer";
                    filterRemote.value = "remote";
                } else if (preset === "python-dev") {
                    filterKeyword.value = "Python";
                    filterRemote.value = "all";
                } else if (preset === "intern") {
                    filterKeyword.value = "";
                    filterType.value = "internship";
                } else if (preset === "high-sal") {
                    filterSort.value = "salary-high";
                }
                applyFiltersAndRender();
            });
        });

        // View Mode Toggles
        viewGridBtn.addEventListener("click", () => {
            viewGridBtn.classList.add("active");
            viewListBtn.classList.remove("active");
            state.viewMode = "grid";
            applyFiltersAndRender();
        });

        viewListBtn.addEventListener("click", () => {
            viewListBtn.classList.add("active");
            viewGridBtn.classList.remove("active");
            state.viewMode = "list";
            applyFiltersAndRender();
        });

        // Card action delegate
        jobsContainer.addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            const action = btn.dataset.action;
            const id = btn.dataset.id;
            if (action === "view-details") openJobModal(id);
            if (action === "bookmark") {
                const job = state.jobs.find(j => j.id === id);
                if (job) toggleSaveJob(job);
            }
        });

        // Modal Close
        modalCloseBtn.addEventListener("click", () => jobModal.classList.remove("open"));
        jobModal.addEventListener("click", (e) => {
            if (e.target === jobModal) jobModal.classList.remove("open");
        });

        // Pipeline stats filter
        document.querySelectorAll(".pipeline-stat").forEach(stat => {
            stat.addEventListener("click", () => {
                document.querySelectorAll(".pipeline-stat").forEach(s => s.classList.remove("active-filter"));
                stat.classList.add("active-filter");
                state.activeSavedFilter = stat.dataset.statusFilter;
                renderSavedTracker();
            });
        });

        // Saved Jobs actions delegate
        document.getElementById("saved-jobs-container").addEventListener("click", (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            if (btn.dataset.action === "remove-saved") {
                const id = btn.dataset.id;
                state.savedJobs = state.savedJobs.filter(j => j.id !== id);
                localStorage.setItem("jobpulse_saved", JSON.stringify(state.savedJobs));
                updateSavedBadge();
                renderSavedTracker();
            }
        });

        // CSV Upload Handler
        btnUploadTrigger.addEventListener("click", () => csvFileInput.click());
        csvFileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: function (results) {
                        if (results.data && results.data.length > 0) {
                            state.jobs = cleanJobsData(results.data);
                            logTerminal(`[UPLOAD] Uploaded custom dataset: ${file.name} (${state.jobs.length} jobs).`, "success");
                            applyFiltersAndRender();
                            renderAnalytics();
                        }
                    }
                });
            }
        });

        // CSV Export Handler
        btnExportTrigger.addEventListener("click", () => {
            if (state.filteredJobs.length === 0) return alert("No jobs to export!");
            const csv = Papa.unparse(state.filteredJobs.map(j => j.raw || j));
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `jobs_export_${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        // Empty state scrape trigger
        document.getElementById("btn-empty-scrape").addEventListener("click", () => {
            document.querySelector(".nav-btn[data-tab='tab-scraper']").click();
        });
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
