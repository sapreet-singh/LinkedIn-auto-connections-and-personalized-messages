if (window.salesNavigatorUILoaded) {
  console.log("Sales Navigator UI script already loaded, skipping");
} else {
  window.salesNavigatorUILoaded = true;

  const CONSTANTS = {
    API: {
      BASE_URL: "https://localhost:7120",
      ENDPOINTS: {
        MESSAGES: "/api/linkedin/message",
        PROFILES: "/api/linkedin/profiles",
        STATUS: "/api/linkedin/GetStatus",
        FILTER_PROMPT: "/api/linkedin/filter-prompt",
      },
    },
  };

  const APIService = {
    async generateMessage(customPrompt, profileUrl) {
      try {
        const apiData = (typeof LinkedInApi !== 'undefined' && LinkedInApi.message)
          ? await LinkedInApi.message({ url: profileUrl, prompt: customPrompt })
          : await (async () => {
              const response = await fetch(
                `${CONSTANTS.API.BASE_URL}${CONSTANTS.API.ENDPOINTS.MESSAGES}`,
                {
                  method: "POST",
                  headers: { accept: "*/*", "Content-Type": "application/json" },
                  body: JSON.stringify({ url: profileUrl, prompt: customPrompt }),
                }
              );
              if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
              return await response.json();
            })();
        console.log("api Message", apiData);
        const messageTest = apiData?.messages?.message;
        const interestMessage = apiData?.messages?.interests;
        console.log("Message:", messageTest);
        console.log("Interests:", interestMessage);
        return {
          message: messageTest,
          interests: interestMessage,
        };
      } catch (error) {
        console.log("API Service Error:", error);
        console.error("API Service Error:", error);
        throw error;
      }
    },
    async addProfile(
      profile,
      customPrompt,
      message,
      profileUrl,
      reason,
      interests
    ) {
      try {
        console.log("Request Data", profile, customPrompt, message, profileUrl);
        const result = (typeof LinkedInApi !== 'undefined' && LinkedInApi.profiles?.post)
          ? await LinkedInApi.profiles.post({
              linkedinUrl: profileUrl || null,
              seleLeadUrl: profile.seleLeadUrl || null,
              name: profile.name || null,
              title: profile.title || null,
              location: profile.location || null,
              profilePicUrl: profile.profilePic || null,
              prompt: customPrompt || null,
              message: message || null,
              reason: reason || null,
              interests: interests || null,
              source: "sales-navigator",
              status: "pending" || null,
              createdAt: new Date(profile.timestamp).toISOString(),
            })
          : await (async () => {
              const response = await fetch(`${CONSTANTS.API.BASE_URL}${CONSTANTS.API.ENDPOINTS.PROFILES}`,{ method: 'POST', headers: { accept: '*/*', 'Content-Type': 'application/json' }, body: JSON.stringify({
                linkedinUrl: profileUrl || null,
                seleLeadUrl: profile.seleLeadUrl || null,
                name: profile.name || null,
                title: profile.title || null,
                location: profile.location || null,
                profilePicUrl: profile.profilePic || null,
                prompt: customPrompt || null,
                message: message || null,
                reason: reason || null,
                interests: interests || null,
                source: 'sales-navigator',
                status: 'pending' || null,
                createdAt: new Date(profile.timestamp).toISOString(),
              })});
              if (!response.ok){
                if (response.status === 409) throw new Error('Profile with this URL already exists');
                throw new Error(`Failed to add profile: ${response.status} ${response.statusText}`);
              }
              return await response.json();
            })();
        return {
          profileId: result.profileId,
          connectionRequestId: result.connectionRequestId,
          messageId: result.messageId || null,
          promptId: result.promptId || null,
        };
      } catch (error) {
        console.error("Profile API Error:", error);
        throw error;
      }
    },
    async getStatus() {
      try {
        const apiData = (typeof LinkedInApi !== 'undefined' && LinkedInApi.getStatus)
          ? await LinkedInApi.getStatus()
          : await (async () => {
              const response = await fetch(`${CONSTANTS.API.BASE_URL}${CONSTANTS.API.ENDPOINTS.STATUS}`, { headers: { accept: '*/*' }});
              if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
              return await response.json();
            })();
        return {
          sendConnectCount: apiData.sendConnect || 0,
          FailedConnectCount: apiData.failedConnect || 0,
        };
      } catch (error) {
        console.error("API Service Error (GetStatus):", error);
        throw error;
      }
    },
    async generateFilterPrompt(prompt) {
      try {
        const apiData = (typeof LinkedInApi !== 'undefined' && LinkedInApi.filterPrompt)
          ? await LinkedInApi.filterPrompt({ prompt })
          : await (async () => {
              const response = await fetch(`${CONSTANTS.API.BASE_URL}${CONSTANTS.API.ENDPOINTS.FILTER_PROMPT}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', accept: '*/*' }, body: JSON.stringify({ prompt })
              });
              if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
              return await response.json();
            })();
        console.log("API Data:", apiData);
        return {
          industry: apiData.industry || "any",
          jobTitles: apiData.job_titles || ["any"],
          seniorityLevel: apiData.seniority_level || "any",
          companyHeadquarters: apiData.company_headquarters || "any",
          companyHeadCount: apiData.company_head_count || "any",
        };
      } catch (error) {
        console.error("Filter Prompt API Error:", error);
        throw error;
      }
    },
  };

  class SalesNavigatorFloatingUI {
    constructor() {
      this.isCollecting = false;
      this.profiles = [];
      this.ui = null;
      this.currentWorkflowStep = "collecting";
      this.currentProfileIndex = 0;
      this.generatedMessage = null;
      this.generatedInterests = null;
      this.processedProfiles = [];
      this.workflowPaused = false;
      this.automationRunning = false;
      this.workflowPopup = null;
      this.currentLinkedInProfileUrl = null;
      this.isProcessingThreeDotMenu = false;
      this.profileStatuses = {};
      this.profileDelay = 50000;
      this.sendConnectCount = 0;
      this.FailedConnectCount = 0;
      this.customPrompt = "";
      this.promptSet = false;
      this.typingTotalDurationMs = 60000;
      this.sendDelayAfterTypingMs = 15000;
      this.loadSavedCounters();
      this.loadBatchSettings();
      this.autoProcessingTimeout = null;

      if (this.isSalesNavigatorSearchPage()) {
        this.init();
      } else if (
        this.isLinkedInProfilePage() ||
        this.isSalesNavigatorProfilePage()
      ) {
        this.checkAndRestoreWorkflow();
      }
    }

    isSalesNavigatorSearchPage() {
      const url = window.location.href;
      return (
        url.includes("/sales/search/people") && url.includes("linkedin.com")
      );
    }

    isLinkedInProfilePage() {
      const url = window.location.href;
      return url.includes("/in/") && url.includes("linkedin.com");
    }

    isSalesNavigatorProfilePage() {
      const url = window.location.href;
      return url.includes("/sales/lead/") && url.includes("linkedin.com");
    }

    init() {
      if (!this.isSalesNavigatorSearchPage()) return;
      this.injectCSS();
      this.createUI();
      this.setupEventListeners();
      this.startAutoDetection();

      const saved = localStorage.getItem("salesNavWorkflow");
      if (saved) {
        try {
          const state = JSON.parse(saved);
          this.currentWorkflowStep = state.currentWorkflowStep || "collecting";
          this.currentProfileIndex = state.currentProfileIndex || 0;
          this.profiles = state.profiles || [];
          this.generatedMessage = state.generatedMessage;
          this.generatedInterests = state.generatedInterests;
          this.processedProfiles = state.processedProfiles || [];
          this.automationRunning = state.automationRunning || false;
          this.workflowPaused = state.workflowPaused || false;
          this.profileStatuses = state.profileStatuses || {};
          this.sendConnectCount = state.sendConnectCount || 0;
          this.FailedConnectCount = state.FailedConnectCount || 0;
          this.customPrompt = state.customPrompt || "";
          this.promptSet = state.promptSet || false;
          if (this.currentWorkflowStep === "processing") {
            this.hideCollectionUI();
            this.showWorkflowPopup();
            this.updateButtonStates();
          } else {
            this.showUI();
            this.updateProfilesList();
            this.updateProfilesCount();
            this.updateConnectCounts();
            this.updateUI();
          }
        } catch (e) {
          localStorage.removeItem("salesNavWorkflow");
        }
      } else {
        setTimeout(() => this.showUI(), 1000);
      }
      this.updateStatusFromAPI();
      // Clear any existing interval to prevent duplicates
      if (this.statusUpdateInterval) {
        clearInterval(this.statusUpdateInterval);
      }

      // Set up new interval for every 5 minutes (300,000ms)
      this.statusUpdateInterval = setInterval(
        () => this.updateStatusFromAPI(),
        300000
      );
    }

    async updateStatusFromAPI() {
      try {
        const status = await APIService.getStatus();
        this.sendConnectCount = status.sendConnectCount;
        this.FailedConnectCount = status.FailedConnectCount;
        this.updateConnectCounts();
        this.saveState(); // Ensure counts are saved
      } catch (error) {
        console.error("Failed to update status from API:", error);
        // Fallback to existing counts if API fails
      }
    }

    injectCSS() {
      if (document.getElementById("sales-navigator-ui-styles")) return;
      const link = document.createElement("link");
      link.id = "sales-navigator-ui-styles";
      link.rel = "stylesheet";
      link.href = chrome.runtime.getURL("content/sales-navigator-ui.css");
      link.onerror = () => this.injectInlineCSS();
      document.head.appendChild(link);
      setTimeout(() => {
        if (!document.querySelector(".sales-navigator-floating-ui")) {
          this.injectInlineCSS();
        }
      }, 2000);
    }

    injectInlineCSS() {
      const style = document.createElement("style");
      style.id = "sales-navigator-ui-inline-styles";
      style.textContent = `
        .sales-navigator-floating-ui {
            position: fixed !important;
            top: 20px !important;
            right: 20px !important;
            width: 420px !important;
            max-height: 80vh !important;
            background: white !important;
            border-radius: 12px !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15) !important;
            z-index: 10000 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            border: 1px solid #e1e5e9 !important;
            overflow: hidden !important;
            display: flex !important;
            flex-direction: column !important;
        }
        .sales-nav-header {
            background: linear-gradient(135deg, #0a66c2, #004182) !important;
            color: white !important;
            padding: 16px 20px !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
        }
        .sales-nav-content {
            padding: 20px !important;
            flex: 1 !important;
            overflow-y: auto !important;
        }
        .sales-nav-btn {
            flex: 1 !important;
            padding: 12px 16px !important;
            border: none !important;
            border-radius: 8px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            margin: 0 6px !important;
        }
        .sales-nav-btn.start {
            background: #28a745 !important;
            color: white !important;
        }
        .sales-nav-btn.pause {
            background: #ffc107 !important;
            color: #212529 !important;
        }
        .sales-nav-btn.next {
            background: #007bff !important;
            color: white !important;
            margin-top: 12px !important;
        }
        .sales-nav-btn.next:hover {
            background: #0056b3 !important;
        }
        .workflow-status {
            background: #e3f2fd !important;
            border: 1px solid #bbdefb !important;
            border-radius: 8px !important;
            padding: 12px 16px !important;
            margin: 12px 0 !important;
            text-align: center !important;
            font-size: 14px !important;
            color: #1976d2 !important;
        }
        .three-dot-menu {
            position: relative !important;
            display: inline-block !important;
        }
        .three-dot-btn {
            background: #f8f9fa !important;
            border: 1px solid #dee2e6 !important;
            border-radius: 4px !important;
            padding: 4px 8px !important;
            cursor: pointer !important;
            font-size: 12px !important;
        }
        .three-dot-menu-content {
            display: none !important;
            position: absolute !important;
            right: 0 !important;
            background-color: white !important;
            min-width: 160px !important;
            box-shadow: 0 8px 16px rgba(0,0,0,0.2) !important;
            z-index: 10001 !important;
            border-radius: 4px !important;
            border: 1px solid #dee2e6 !important;
        }
        .three-dot-menu-content.show {
            display: block !important;
        }
        .three-dot-menu-content a {
            color: #333 !important;
            padding: 8px 12px !important;
            text-decoration: none !important;
            display: block !important;
            font-size: 12px !important;
        }
        .three-dot-menu-content a:hover {
            background-color: #f8f9fa !important;
        }
        .connect-btn {
            background: #28a745 !important;
            color: white !important;
            border: none !important;
            border-radius: 4px !important;
            padding: 6px 12px !important;
            cursor: pointer !important;
            font-size: 12px !important;
            margin-top: 8px !important;
        }
        .connect-btn:hover {
            background: #218838 !important;
        }
        .connect-btn:disabled {
            background: #6c757d !important;
            cursor: not-allowed !important;
        }
        .filter-section {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        #profile-filter-input {
            box-sizing: border-box;
        }
        #profile-filter-input:focus {
            outline: none;
            border-color: #007bff;
            box-shadow: 0 0 5px rgba(0, 123, 255, 0.3);
        }
        #generate-filter-btn {
            background: #007bff !important;
            color: white !important;
        }
        #generate-filter-btn:hover {
            background: #0056b3 !important;
        }
    `;
      document.head.appendChild(style);
    }

    createUI() {
      if (this.ui) return;
      const existingUI = document.querySelector(".sales-navigator-floating-ui");
      if (existingUI) {
        console.log(
          "Sales Navigator UI already exists in DOM, skipping creation"
        );
        this.ui = existingUI;
        return;
      }

      this.ui = document.createElement("div");
      this.ui.className = "sales-navigator-floating-ui";
      this.ui.innerHTML = `
        <div class="sales-nav-header">
            <h3 class="sales-nav-title">Sales Navigator</h3>
            <div class="sales-nav-controls">
                <button class="sales-nav-minimize" title="Minimize">−</button>
                <button class="sales-nav-close" title="Close">&times;</button>
            </div>
        </div>
        <div class="sales-nav-content">
            <div class="sales-nav-controls">
                <button class="sales-nav-btn start" id="start-collecting">Start Collecting</button>
                <button class="sales-nav-btn pause" id="pause-collecting" disabled>Pause Collecting</button>
            </div>
            <div class="sales-nav-status">
                <div class="status-indicator">
                    <span class="status-dot" id="status-dot"></span>
                    <span id="status-text">Ready to collect profiles</span>
                </div>
            </div>
            <div class="send-connect-section">
                <div class="connect-count">Send Connect: <span id="send-connect-count">0</span></div>
                <div class="connect-count">Failed Connect: <span id="Failed-connect-count">0</span></div>
            </div>
            <div class="profiles-section">
                <div class="profiles-header">
                    <span class="profiles-count">Profiles: <span id="profiles-count">0</span></span>
                    <button class="clear-profiles" id="clear-profiles">Clear All</button>
                </div>
                <div class="filter-section" style="margin: 10px 0;">
                    <input type="text" id="profile-filter-input" placeholder="Filter profiles by name, title, or company..." style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;">
                    <button id="generate-filter-btn" style="background: #007bff; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; margin-top: 8px; font-size: 14px;">Generate Filter</button>
                </div>
                <div class="profiles-list" id="profiles-list">
                    <div class="empty-profiles">No profiles collected yet. Click "Start Collecting" to begin.</div>
                </div>
            </div>
            <button class="sales-nav-btn next" id="next-button" style="display: none;">Process Profiles (0)</button>
            <div class="workflow-status" id="workflow-status" style="display: none;">
                <div id="workflow-text">Ready to process profiles</div>
            </div>
        </div>
    `;
      document.body.appendChild(this.ui);
    }

    setupEventListeners() {
      const startBtn = this.ui.querySelector("#start-collecting");
      const pauseBtn = this.ui.querySelector("#pause-collecting");
      const nextBtn = this.ui.querySelector("#next-button");
      const closeBtn = this.ui.querySelector(".sales-nav-close");
      const minimizeBtn = this.ui.querySelector(".sales-nav-minimize");
      const clearBtn = this.ui.querySelector("#clear-profiles");
      const generateFilterBtn = this.ui.querySelector("#generate-filter-btn");
      startBtn.addEventListener("click", () => this.startCollecting());
      pauseBtn.addEventListener("click", () => this.pauseCollecting());
      nextBtn.addEventListener("click", () => this.startWorkflow());
      closeBtn.addEventListener("click", () => this.closeUI());
      minimizeBtn.addEventListener("click", () => this.toggleMinimize());
      clearBtn.addEventListener("click", () => this.clearProfiles());
      generateFilterBtn.addEventListener("click", () =>
        this.generateFilterPrompt()
      );
      this.makeDraggable(this.ui.querySelector(".sales-nav-header"));
    }

    async generateFilterPrompt() {
      if (!this.ui) {
        console.error("UI not initialized in generateFilterPrompt");
        return;
      }
      const statusText = this.ui.querySelector("#status-text");
      const filterInput = this.ui.querySelector("#profile-filter-input"); // Updated to match createUI
      const generateFilterBtn = this.ui.querySelector("#generate-filter-btn");

      if (!filterInput) {
        console.error("Filter input element not found");
        statusText.textContent = "Error: Filter input not available";
        return;
      }

      try {
        statusText.textContent = "Generating filter prompt...";
        generateFilterBtn.disabled = true;
        const userPrompt = filterInput.value.trim();
        if (!userPrompt) {
          statusText.textContent = "Please enter a filter prompt";
          return;
        }

        const filterData = await APIService.generateFilterPrompt(userPrompt);
        console.log("Generated filter prompt:", filterData);
        await this.applySalesNavigatorFilters(filterData);
        statusText.textContent = "Filter applied to Sales Navigator!";
      } catch (error) {
        console.error("Error generating or applying filter prompt:", error);
        statusText.textContent = `Failed to apply filter: ${error.message}`;
      } finally {
        generateFilterBtn.disabled = false;
      }
    }

    async applySalesNavigatorFilters(filterData) {
      await this.waitForPageLoad();

      // Helper function: wait for input element
      const waitForInput = async (timeout = 10000, retryInterval = 500) => {
        return new Promise((resolve, reject) => {
          const maxRetries = timeout / retryInterval;
          let retries = 0;
          const check = () => {
            const el = document.querySelector(
              "input.artdeco-typeahead__input.search-filter__focus-target--input"
            );
            if (el) {
              resolve(el);
            } else if (retries >= maxRetries) {
              reject("Timeout: Input not found");
            } else {
              retries++;
              setTimeout(check, retryInterval);
            }
          };
          check();
        });
      };

      // Helper function: simulate typing with delay
      const typeWithDelay = async (input, text, delay = 300) => {
        input.focus();
        input.value = "";
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          input.value += char;
          input.dispatchEvent(
            new KeyboardEvent("keydown", { key: char, bubbles: true })
          );
          input.dispatchEvent(
            new KeyboardEvent("keypress", { key: char, bubbles: true })
          );
          input.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              inputType: "insertText",
              data: char,
            })
          );
          input.dispatchEvent(
            new KeyboardEvent("keyup", { key: char, bubbles: true })
          );
          await new Promise((r) => setTimeout(r, delay));
        }
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };

      // Helper function: wait for suggestions dropdown
      const waitForSuggestions = async (maxWaitTime = 15000) => {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitTime) {
          const suggestions = document.querySelectorAll(
            "li.artdeco-typeahead__result, li.search-typeahead-result, li[role='option']"
          );
          if (suggestions.length > 0) {
            return Array.from(suggestions);
          }
          await this.wait(500);
        }
        return null;
      };

      // ---------- Posted on LinkedIn filter ----------
      try {
        const postedLegend = Array.from(
          document.querySelectorAll("legend span")
        ).find((el) => el.textContent.trim() === "Posted on LinkedIn");
        if (!postedLegend)
          throw new Error("Posted on LinkedIn legend not found");
        const sectionContainer = postedLegend.closest("fieldset");
        const checkbox = sectionContainer?.querySelector(
          "input[type='checkbox']#search-filter-toggle-st122"
        );
        if (checkbox && !checkbox.checked) {
          checkbox.click();
          await this.wait(500);
        }
      } catch (err) {
        console.error(
          "❌ Failed to apply Posted on LinkedIn filter:",
          err.message
        );
      }
      await this.wait(2000);

      // Company Headcount Filter ----------
      try {
        const headcountValue = filterData.companyHeadCount; // Support both naming styles
        if (headcountValue && headcountValue.toLowerCase() !== "any") {
          const legendSpan = Array.from(
            document.querySelectorAll("legend span")
          ).find((el) => el.textContent.trim() === "Company headcount");
          if (!legendSpan)
            throw new Error("Company headcount legend not found");
          const sectionContainer = legendSpan.closest("fieldset");
          if (!sectionContainer)
            throw new Error("Company headcount container not found");

          // Expand the filter if collapsed
          const toggleBtn = sectionContainer.querySelector(
            "button[aria-expanded]"
          );
          if (toggleBtn?.getAttribute("aria-expanded") === "false") {
            toggleBtn.click();
            await this.wait(800); // Wait for expand animation
          }

          // Find or click to open the dropdown popup
          let dropdownBtn =
            sectionContainer.querySelector("button[aria-expanded]") ||
            sectionContainer.querySelector("button.artdeco-button") ||
            sectionContainer.querySelector("button[role='combobox']") ||
            sectionContainer.querySelector("button");
          if (dropdownBtn) {
            const isExpanded =
              dropdownBtn.getAttribute("aria-expanded") === "true";
            if (!isExpanded) {
              dropdownBtn.click();
              await this.wait(800); // Wait for popup to open
            }
          } else {
            console.warn(
              "Company headcount dropdown button not found, assuming options are visible"
            );
          }

          // Wait for options list to load
          const optionsList = await new Promise((resolve, reject) => {
            const timeout = 15000,
              interval = 500,
              start = Date.now();
            const check = () => {
              const list =
                sectionContainer.querySelector(
                  'ul[aria-label="Company headcount filter suggestions"], ul[role="listbox"]'
                ) ||
                document.querySelector('ul[aria-label*="Company headcount"]');
              if (list) return resolve(list);
              if (Date.now() - start >= timeout)
                reject(new Error("Headcount options list not loaded"));
              setTimeout(check, interval);
            };
            check();
          });

          // Find the matching option
          const optionsItems = Array.from(
            optionsList.querySelectorAll("li[role='option']")
          );
          const matchOption = optionsItems.find((el) => {
            const label = el.innerText.trim().toLowerCase();
            const searchVal = headcountValue.toLowerCase().trim();
            return (
              label === searchVal ||
              label.includes(searchVal) ||
              label.replace(/[,\s-]/g, "") === searchVal.replace(/[,\s-]/g, "")
            );
          });

          if (matchOption) {
            // Scroll into view and click
            matchOption.scrollIntoView({ behavior: "smooth", block: "center" });
            matchOption.querySelector("div, button")?.click() ||
              matchOption.click();
            console.log(`✅ Selected company headcount: ${headcountValue}`);

            // Set timeout to automatically close the filter after 2 seconds
            setTimeout(async () => {
              const currentToggle = sectionContainer.querySelector(
                "button[aria-expanded]"
              );
              if (currentToggle?.getAttribute("aria-expanded") === "true") {
                console.log("🔄 Auto-closing Company Headcount filter");
                currentToggle.click(); // Collapse the filter
                // Confirm closure if needed after a short delay
                await this.wait(500);
                if (currentToggle.getAttribute("aria-expanded") === "false") {
                  console.log(
                    "✅ Company Headcount filter auto-closed successfully"
                  );
                }
              }
            }, 2000); // 2 seconds delay before auto-close
          } else {
            console.error(
              `❌ Company headcount option "${headcountValue}" not found among options.`
            );
            console.log(
              "Available options:",
              optionsItems.map((e) => e.innerText.trim())
            );
          }
        }
      } catch (err) {
        console.error("❌ Error during company headcount filter:", err.message);
      }
      await this.wait(2000);

      // ---------- Company Headquartered Filter ----------
      try {
        const headquartersValue = filterData.companyHeadquarters;
        if (!headquartersValue || headquartersValue.toLowerCase() === "any") {
          console.log(
            "No company headquarters location specified or set to 'any'. Exiting."
          );
          return;
        }
        console.log(
          `🔍 Applying Company Headquarters filter for location: "${headquartersValue}"`
        );

        // Find legend and container
        const hqLegend = Array.from(
          document.querySelectorAll("legend span")
        ).find(
          (el) => el.textContent.trim() === "Company headquarters location"
        );
        if (!hqLegend)
          throw new Error("Company Headquarters filter legend not found");

        const sectionContainer = hqLegend.closest("fieldset, div");
        if (!sectionContainer)
          throw new Error("Company Headquarters container not found");

        // Expand if collapsed
        const toggleBtn = sectionContainer.querySelector(
          "button[aria-expanded]"
        );
        if (toggleBtn?.getAttribute("aria-expanded") === "false") {
          toggleBtn.click();
          await this.wait(800);
          console.log("⚡ Expanded Company Headquarters filter section.");
        }

        // Get input
        const input = await waitForInput(10000);
        if (!input) throw new Error("Company Headquarters input not found");

        // Remove existing chips
        const chips = sectionContainer.querySelectorAll(
          'button[aria-label*="Remove"]'
        );
        if (chips.length > 0) {
          console.log(`🧹 Clearing existing location selections`);
          for (const chip of chips) {
            chip.click();
            await this.wait(300);
          }
        }

        // Type the location string
        await typeWithDelay(input, headquartersValue, 200);
        await this.wait(500);

        // Wait for suggestions
        const suggestions = await waitForSuggestions(10000);
        if (!suggestions || suggestions.length === 0) {
          console.warn(
            `⚠️ No location suggestions found for "${headquartersValue}"`
          );
          // Fallback: hit Enter to accept typed input
          ["keydown", "keypress", "keyup"].forEach((evt) =>
            input.dispatchEvent(
              new KeyboardEvent(evt, { key: "Enter", bubbles: true })
            )
          );
          console.log(`✅ Added location (fallback): ${headquartersValue}`);
          return;
        }

        // Filter suggestions containing the location string (case-insensitive)
        const matchingSuggestions = Array.from(suggestions).filter((el) =>
          (el.innerText || "")
            .toLowerCase()
            .includes(headquartersValue.toLowerCase())
        );

        if (matchingSuggestions.length === 0) {
          console.warn(
            `⚠️ No matching suggestions found containing "${headquartersValue}"`
          );
          // Fallback: accept typed input
          ["keydown", "keypress", "keyup"].forEach((evt) =>
            input.dispatchEvent(
              new KeyboardEvent(evt, { key: "Enter", bubbles: true })
            )
          );
          console.log(`✅ Added location (fallback): ${headquartersValue}`);
          return;
        }

        console.log(
          `📍 Found ${matchingSuggestions.length} matching location(s) for "${headquartersValue}" to include:`
        );

        // Click "Include" on all matching suggestions
        for (let i = 0; i < matchingSuggestions.length; i++) {
          const suggestion = matchingSuggestions[i];
          console.log(
            `📍 Including location ${i + 1}/${matchingSuggestions.length}: ${(
              suggestion.innerText || ""
            ).trim()}`
          );

          const includeBtn = suggestion.querySelector(
            "._include-button_1cz98z, button"
          );
          if (includeBtn) {
            includeBtn.click();
          } else {
            suggestion.click();
          }
          await this.wait(300); // brief wait between clicks
        }

        console.log(
          `✅ Successfully applied Company Headquarters filter with all matching locations for "${headquartersValue}"`
        );

        // Auto-close filter after 2 seconds if open
        const collapseBtn = sectionContainer.querySelector(
          'button[aria-expanded="true"]'
        );
        if (collapseBtn) {
          console.log("⏰ Auto-closing headquarters filter in 2 seconds...");
          setTimeout(() => {
            collapseBtn.click();
            console.log(
              "✅ Company Headquarters filter auto-closed successfully"
            );
          }, 2000);
        }
      } catch (err) {
        console.error("❌ Failed to apply Company Headquarters filter:", err);
      }
      await this.wait(2000);

      // ---------- Job Title filter ----------
      try {
        const jobTitlesArray = filterData.jobTitles; // Support both naming styles
        if (
          jobTitlesArray &&
          Array.isArray(jobTitlesArray) &&
          jobTitlesArray.length > 0
        ) {
          console.log(
            `🎯 Applying Job Title filter for ${jobTitlesArray.length} titles:`,
            jobTitlesArray
          );

          const jobTitleLegend = Array.from(
            document.querySelectorAll("legend span")
          ).find((el) => el.textContent.trim() === "Current job title");

          if (!jobTitleLegend)
            throw new Error("Job title filter legend not found");

          const sectionContainer = jobTitleLegend.closest("div, fieldset, li");
          if (!sectionContainer)
            throw new Error("Job title container not found");

          // Expand the filter if collapsed
          const toggleBtn = sectionContainer.querySelector(
            "button[aria-expanded]"
          );
          if (toggleBtn?.getAttribute("aria-expanded") === "false") {
            toggleBtn.click();
            await this.wait(800);
            console.log("⚡ Expanded Job Title filter section");
          }

          // Clear any existing job title selections
          const existingChips = sectionContainer.querySelectorAll(
            'button[aria-label*="Remove"]'
          );
          if (existingChips.length > 0) {
            console.log("🧹 Clearing existing job title selections");
            for (const chip of existingChips) {
              chip.click();
              await this.wait(300);
            }
          }

          // Process each job title
          for (let i = 0; i < jobTitlesArray.length; i++) {
            const jobTitleValue = jobTitlesArray[i];
            console.log(
              `💼 Adding job title ${i + 1}/${
                jobTitlesArray.length
              }: "${jobTitleValue}"`
            );

            try {
              // Get the input field (may need to be re-queried after DOM changes)
              const input = await waitForInput(10000);
              if (!input) {
                console.error(
                  `❌ Job title input not found for: ${jobTitleValue}`
                );
                continue;
              }

              // Type the job title
              await typeWithDelay(input, jobTitleValue, 250);
              await this.wait(800); // Wait for suggestions to load

              // Wait for suggestions
              const suggestions = await waitForSuggestions(10000);

              if (suggestions && suggestions.length > 0) {
                // Find the best matching suggestion
                const matchingSuggestion = suggestions.find((el) => {
                  const suggestionText = (el.innerText || "")
                    .toLowerCase()
                    .trim();
                  const searchValue = jobTitleValue.toLowerCase().trim();
                  return (
                    suggestionText === searchValue ||
                    suggestionText.includes(searchValue) ||
                    searchValue.includes(suggestionText)
                  );
                });

                if (matchingSuggestion) {
                  console.log(
                    `   ✅ Found matching suggestion for: ${jobTitleValue}`
                  );

                  // Click the include button or the suggestion itself
                  const includeBtn = matchingSuggestion.querySelector(
                    "._include-button_1cz98z, button"
                  );
                  if (includeBtn) {
                    includeBtn.click();
                    console.log(
                      `   ✅ Clicked Include button for: ${jobTitleValue}`
                    );
                  } else {
                    matchingSuggestion.click();
                    console.log(
                      `   ✅ Clicked suggestion for: ${jobTitleValue}`
                    );
                  }

                  // Wait for the selection to be processed
                  await this.wait(1000);
                } else {
                  console.warn(
                    `   ⚠️ No matching suggestion found for: ${jobTitleValue}, adding as typed`
                  );
                  // Fallback: press Enter to accept typed input
                  ["keydown", "keypress", "keyup"].forEach((evt) =>
                    input.dispatchEvent(
                      new KeyboardEvent(evt, { key: "Enter", bubbles: true })
                    )
                  );
                  await this.wait(800);
                }
              } else {
                console.warn(
                  `   ⚠️ No suggestions appeared for: ${jobTitleValue}, adding as typed`
                );
                // Fallback: press Enter to accept typed input
                ["keydown", "keypress", "keyup"].forEach((evt) =>
                  input.dispatchEvent(
                    new KeyboardEvent(evt, { key: "Enter", bubbles: true })
                  )
                );
                await this.wait(800);
              }

              // Clear the input for the next job title
              const currentInput = sectionContainer.querySelector(
                "input.artdeco-typeahead__input.search-filter__focus-target--input"
              );
              if (currentInput) {
                currentInput.value = "";
                currentInput.focus();
              }
            } catch (jobTitleError) {
              console.error(
                `❌ Error processing job title "${jobTitleValue}":`,
                jobTitleError.message
              );
              continue; // Continue with next job title
            }
          }

          console.log(
            `✅ Successfully applied Job Title filter for ${jobTitlesArray.length} titles`
          );

          // Auto-close filter after 2 seconds
          const collapseBtn = sectionContainer.querySelector(
            'button[aria-expanded="true"]'
          );
          if (collapseBtn) {
            console.log("⏰ Auto-closing Job Title filter in 2 seconds...");
            setTimeout(() => {
              collapseBtn.click();
              console.log("✅ Job Title filter auto-closed successfully");
            }, 2000);
          }
        } else {
          console.log(
            "ℹ️ No job titles specified or job titles array is empty"
          );
        }
      } catch (err) {
        console.error("❌ Failed to apply Job Title filter:", err.message);
      }
      await this.wait(2000);

      // ---------- Seniority Level filter ----------
      try {
        const seniorityValue = filterData.seniorityLevel;
        if (seniorityValue && seniorityValue.toLowerCase() !== "any") {
          const seniorityLegend = Array.from(
            document.querySelectorAll("legend span")
          ).find((el) => el.textContent.trim() === "Seniority level");
          if (!seniorityLegend) throw new Error("Seniority legend not found");
          const sectionContainer = seniorityLegend.closest("fieldset");
          if (!sectionContainer)
            throw new Error("Fieldset container not found");
          const toggleBtn = sectionContainer.querySelector(
            "button[aria-expanded]"
          );
          if (
            toggleBtn &&
            toggleBtn.getAttribute("aria-expanded") === "false"
          ) {
            toggleBtn.click();
            await this.wait(1000);
          }

          const listContainer = await new Promise((resolve, reject) => {
            const timeout = 15000,
              interval = 500;
            let elapsed = 0;
            const check = () => {
              const el = sectionContainer.querySelector(
                'ul[aria-label="Seniority level filter suggestions"]'
              );
              if (el) resolve(el);
              else if (elapsed >= timeout)
                reject(
                  new Error("Seniority filter list not found within timeout")
                );
              else {
                elapsed += interval;
                setTimeout(check, interval);
              }
            };
            check();
          });
          const listItems = await new Promise((resolve, reject) => {
            const timeout = 15000,
              interval = 500;
            let elapsed = 0;
            const check = () => {
              const options =
                listContainer.querySelectorAll("li[role='option']");
              if (options.length > 0) resolve(Array.from(options));
              else if (elapsed >= timeout)
                reject(new Error("Seniority options not found within timeout"));
              else {
                elapsed += interval;
                setTimeout(check, interval);
              }
            };
            check();
          });
          const match = listItems.find((el) => {
            const text = el
              .querySelector("span")
              ?.textContent.trim()
              .toLowerCase();
            return (
              text === seniorityValue.toLowerCase() ||
              text.includes(seniorityValue.toLowerCase())
            );
          });
          if (match) {
            const includeBtn = match.querySelector("._include-button_1cz98z");
            if (includeBtn) includeBtn.click();
            else match.click();
            await this.wait(500);
          }
        }
      } catch (err) {
        console.error(
          "❌ Failed to apply Seniority Level filter:",
          err.message
        );
      }
      await this.wait(2000);

      // ---------- Industry filter ----------
      try {
        const industryValue = filterData.industry;
        if (industryValue && industryValue.toLowerCase() !== "any") {
          const industryLegend = Array.from(
            document.querySelectorAll("legend span")
          ).find((el) => el.textContent.trim() === "Industry");
          if (!industryLegend)
            throw new Error("Industry filter legend not found");
          const sectionContainer = industryLegend.closest("div, fieldset, li");
          const toggleBtn = sectionContainer?.querySelector(
            "button[aria-expanded]"
          );
          if (toggleBtn?.getAttribute("aria-expanded") === "false") {
            toggleBtn.click();
            await this.wait(800);
          }
          const input = await waitForInput(10000);
          if (!input) throw new Error("Industry input not found");
          const chips = sectionContainer?.querySelectorAll(
            'button[aria-label*="Remove"]'
          );
          for (const chip of chips || []) {
            chip.click();
            await this.wait(300);
          }
          await typeWithDelay(input, industryValue, 250);
          const suggestions = await waitForSuggestions(10000);
          const suggestion = suggestions?.find((el) =>
            (el.innerText || "")
              .toLowerCase()
              .includes(industryValue.toLowerCase())
          );
          if (suggestion) {
            const includeBtn = suggestion.querySelector(
              "._include-button_1cz98z, button"
            );
            if (includeBtn) includeBtn.click();
            else suggestion.click();
          } else {
            ["keydown", "keypress", "keyup"].forEach((evt) =>
              input.dispatchEvent(
                new KeyboardEvent(evt, { key: "Enter", bubbles: true })
              )
            );
          }
        }
      } catch (err) {
        console.error("❌ Failed to apply Industry filter:", err);
      }
      await this.wait(2000);

      // ---------- Geography Filter ----------
      try {
        const geographyValue = filterData.companyHeadquarters;
        if (geographyValue && geographyValue.toLowerCase() !== "any") {
          console.log(`🌍 Applying Geography filter for: "${geographyValue}"`);

          // Find the geography legend - look for div with "Geography" text
          const geographyLegend = Array.from(
            document.querySelectorAll("legend div")
          ).find((el) => el.textContent.trim() === "Geography");

          if (!geographyLegend)
            throw new Error("Geography filter legend not found");

          const sectionContainer = geographyLegend.closest("fieldset");
          if (!sectionContainer)
            throw new Error("Geography container not found");

          // Expand the filter if collapsed
          const toggleBtn = sectionContainer.querySelector(
            "button[aria-expanded]"
          );
          if (toggleBtn?.getAttribute("aria-expanded") === "false") {
            toggleBtn.click();
            await this.wait(800);
            console.log("⚡ Expanded Geography filter section");
          }

          // Get the input field
          const input = sectionContainer.querySelector(
            "input.artdeco-typeahead__input[placeholder='Add locations']"
          );
          if (!input) throw new Error("Geography input field not found");

          // Remove existing selected chips/filters
          const chips = sectionContainer.querySelectorAll(
            'button[aria-label*="Remove"]'
          );
          if (chips.length > 0) {
            console.log("🧹 Clearing existing geography selections");
            for (const chip of chips) {
              chip.click();
              await this.wait(300);
            }
          }

          // Check if we need to select Region vs Postal Code radio button
          const regionRadio = sectionContainer.querySelector(
            'input[type="radio"][value="REGION"]'
          );
          const postalRadio = sectionContainer.querySelector(
            'input[type="radio"][value="POSTAL_CODE"]'
          );

          // Default to Region unless the geography value looks like a postal code
          const isPostalCode =
            /^\d{5}(-\d{4})?$|^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(
              geographyValue.trim()
            );

          if (isPostalCode && postalRadio) {
            postalRadio.click();
            await this.wait(500);
            console.log("📮 Selected Postal Code geography type");
          } else if (regionRadio) {
            regionRadio.click();
            await this.wait(500);
            console.log("🌍 Selected Region geography type");
          }

          // Clear input and focus
          input.focus();
          input.value = "";

          // Type the geography value character by character
          await typeWithDelay(input, geographyValue, 200);
          await this.wait(1500); // Wait longer for suggestions to load

          // Wait for suggestions to appear and store them in variable
          const waitForAndStoreSuggestions = async (maxWaitTime = 15000) => {
            const startTime = Date.now();
            while (Date.now() - startTime < maxWaitTime) {
              const suggestionsList = sectionContainer.querySelector(
                'ul[aria-label="Add locations"]'
              );
              if (suggestionsList) {
                const suggestions = Array.from(
                  suggestionsList.querySelectorAll('li[role="option"]')
                );
                if (suggestions.length > 0) {
                  console.log(
                    `📍 Found ${suggestions.length} geography suggestions:`
                  );

                  // Store suggestions with their text content
                  const storedSuggestions = suggestions.map(
                    (suggestion, index) => {
                      const text =
                        suggestion
                          .querySelector('span[aria-hidden="true"]')
                          ?.textContent.trim() || suggestion.innerText.trim();
                      console.log(`   ${index + 1}. ${text}`);
                      return {
                        element: suggestion,
                        text: text,
                        includeButton: suggestion.querySelector(
                          "._include-button_1cz98z"
                        ),
                      };
                    }
                  );

                  return storedSuggestions;
                }
              }
              await this.wait(500);
            }
            return [];
          };

          const storedSuggestions = await waitForAndStoreSuggestions(15000);

          if (storedSuggestions.length === 0) {
            console.warn(
              `⚠️ No geography suggestions found for "${geographyValue}"`
            );
            // Fallback: press Enter to accept typed input
            ["keydown", "keypress", "keyup"].forEach((evt) =>
              input.dispatchEvent(
                new KeyboardEvent(evt, { key: "Enter", bubbles: true })
              )
            );
            console.log(`✅ Added geography (fallback): ${geographyValue}`);
            return;
          }

          // FIXED: Select only the exact match first, then add others one by one with longer delays
          const searchValue = geographyValue.toLowerCase().trim();

          // Find exact match first
          const exactMatch = storedSuggestions.find(
            (s) => s.text.toLowerCase() === searchValue
          );

          // Find other relevant matches
          const otherMatches = storedSuggestions.filter(
            (s) =>
              s.text.toLowerCase().includes(searchValue) &&
              s.text.toLowerCase() !== searchValue
          );

          console.log(
            `🎯 Found exact match: ${exactMatch ? exactMatch.text : "None"}`
          );
          console.log(`🎯 Found ${otherMatches.length} other relevant matches`);

          // Select exact match first
          if (exactMatch) {
            console.log(`🌍 Including primary location: ${exactMatch.text}`);
            if (exactMatch.includeButton) {
              exactMatch.includeButton.click();
              console.log(
                `   ✅ Clicked Include button for: ${exactMatch.text}`
              );
            } else {
              exactMatch.element.click();
              console.log(
                `   ✅ Clicked suggestion element for: ${exactMatch.text}`
              );
            }

            // Wait longer for the selection to be processed and page to stabilize
            await this.wait(2000);
          }

          // Add other relevant locations one by one with delays
          console.log(
            `🌍 Adding ${otherMatches.length} additional locations...`
          );

          for (let i = 0; i < Math.min(otherMatches.length, 5); i++) {
            // Limit to 5 additional locations
            const suggestion = otherMatches[i];

            console.log(`🌍 Adding location ${i + 1}/5: ${suggestion.text}`);

            // Re-focus input (might have been lost due to page navigation)
            const currentInput = sectionContainer.querySelector(
              "input.artdeco-typeahead__input[placeholder='Add locations']"
            );
            if (currentInput) {
              currentInput.focus();
              currentInput.value = "";

              // Type a partial search to trigger suggestions
              await typeWithDelay(
                currentInput,
                suggestion.text.split(",")[0],
                100
              );
              await this.wait(1000);

              // Find the suggestion again (DOM may have changed)
              const currentSuggestions = Array.from(
                sectionContainer.querySelectorAll('li[role="option"]')
              );

              const matchingSuggestion = currentSuggestions.find((s) => {
                const text =
                  s
                    .querySelector('span[aria-hidden="true"]')
                    ?.textContent.trim() || s.innerText.trim();
                return text === suggestion.text;
              });

              if (matchingSuggestion) {
                const includeBtn = matchingSuggestion.querySelector(
                  "._include-button_1cz98z"
                );
                if (includeBtn) {
                  includeBtn.click();
                  console.log(`   ✅ Added: ${suggestion.text}`);
                  await this.wait(1500); // Wait longer between selections
                }
              }
            }
          }

          console.log(
            `✅ Successfully applied Geography filter for "${geographyValue}"`
          );

          // Auto-close filter after 3 seconds
          const collapseBtn = sectionContainer.querySelector(
            'button[aria-expanded="true"]'
          );
          if (collapseBtn) {
            console.log("⏰ Auto-closing Geography filter in 3 seconds...");
            setTimeout(() => {
              collapseBtn.click();
              console.log("✅ Geography filter auto-closed successfully");
            }, 3000);
          }
        }
      } catch (err) {
        console.error("❌ Failed to apply Geography filter:", err.message);
        console.error("Full error:", err);
      }

      console.log("🏁 Finished Sales Navigator Filters");
    }

    makeDraggable(handle) {
      let isDragging = false;
      let currentX, currentY, initialX, initialY;
      let xOffset = 0,
        yOffset = 0;
      handle.addEventListener("mousedown", (e) => {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;
        if (e.target === handle || handle.contains(e.target)) {
          isDragging = true;
          this.ui.style.cursor = "grabbing";
        }
      });

      document.addEventListener("mousemove", (e) => {
        if (isDragging) {
          e.preventDefault();
          currentX = e.clientX - initialX;
          currentY = e.clientY - initialY;
          xOffset = currentX;
          yOffset = currentY;
          this.ui.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }
      });

      document.addEventListener("mouseup", () => {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        this.ui.style.cursor = "move";
      });
    }

    startAutoDetection() {
      if (
        window.location.href.includes("/sales/") ||
        window.location.href.includes("/in/")
      ) {
        setTimeout(() => this.showUI(), 2000);
        this.checkAndRestoreWorkflow();
      }

      let lastUrl = location.href;
      const urlObserver = new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          if (url.includes("/sales/") || url.includes("/sales/search/people")) {
            setTimeout(() => {
              this.showUI();
              const savedState = localStorage.getItem("salesNavWorkflow");
              if (savedState) {
                try {
                  const state = JSON.parse(savedState);
                  if (state.currentWorkflowStep === "processing") {
                    this.showWorkflowPopup();
                  }
                } catch (e) {
                  console.error("Error checking workflow state:", e);
                }
              }
            }, 2000);
          } else if (url.includes("/in/") && url.includes("linkedin.com")) {
            setTimeout(() => this.checkAndRestoreWorkflow(), 2000);
          }
        }
      });

      urlObserver.observe(document, { subtree: true, childList: true });
      setTimeout(() => {
        if (
          window.location.href.includes("/sales/") ||
          window.location.href.includes("/sales/search/people")
        ) {
          this.showUI();
        } else if (
          window.location.href.includes("/in/") &&
          window.location.href.includes("linkedin.com")
        ) {
          this.checkAndRestoreWorkflow();
        }
      }, 5000);
    }

    checkAndRestoreWorkflow() {
      const savedState = localStorage.getItem("salesNavWorkflow");
      if (!savedState) return;
      try {
        const state = JSON.parse(savedState);
        if (state.currentWorkflowStep === "processing") {
          this.currentWorkflowStep = state.currentWorkflowStep;
          this.currentProfileIndex = state.currentProfileIndex;
          this.profiles = state.profiles || [];
          this.generatedMessage = state.generatedMessage;
          this.generatedInterests = state.generatedInterests;
          this.processedProfiles = state.processedProfiles || [];
          this.profileStatuses = state.profileStatuses || {};
          this.automationRunning = state.automationRunning || false;
          this.workflowPaused = state.workflowPaused || false;
          this.sendConnectCount = state.sendConnectCount || 0;
          this.FailedConnectCount = state.FailedConnectCount || 0;
          this.customPrompt = state.customPrompt || "";
          this.promptSet = state.promptSet || false;
          this.currentLinkedInProfileUrl = null;
          this.showWorkflowPopup();
          setTimeout(() => {
            this.updateButtonStates();
            this.restoreProfileStatuses();
          }, 500);

          setTimeout(() => this.processNextProfile(), 3000);
        }
      } catch (error) {
        localStorage.removeItem("salesNavWorkflow");
      }
    }

    showUI() {
      if (this.currentWorkflowStep === "processing") return;
      if (this.ui) {
        this.ui.style.display = "flex";
        this.ui.style.visibility = "visible";
        this.ui.style.opacity = "1";
        this.updateConnectCounts();
      }
    }

    hideCollectionUI() {
      if (this.ui) {
        this.ui.style.display = "none";
        this.ui.style.visibility = "hidden";
        this.ui.style.opacity = "0";
      }
    }

    getCurrentProfileUrl() {
      if (this.currentProfileIndex < this.profiles.length) {
        return (
          this.profiles[this.currentProfileIndex].url || "No URL available"
        );
      }
      return "No profile selected";
    }

    closeUI() {
      if (this.ui) this.ui.style.display = "none";
      this.pauseCollecting();
    }

    toggleMinimize() {
      const content = this.ui.querySelector(".sales-nav-content");
      const minimizeBtn = this.ui.querySelector(".sales-nav-minimize");
      if (content.style.display === "none") {
        content.style.display = "block";
        minimizeBtn.textContent = "−";
        minimizeBtn.title = "Minimize";
        this.ui.style.height = "auto";
      } else {
        content.style.display = "none";
        minimizeBtn.textContent = "+";
        minimizeBtn.title = "Expand";
        this.ui.style.height = "auto";
      }
    }

    startCollecting() {
      this.isCollecting = true;
      this.updateUI();
      this.setupProfileObserver();
      this.collectCurrentPageProfiles();
      this.collectingInterval = setInterval(() => {
        this.collectCurrentPageProfiles();
      }, 3000);
    }

    pauseCollecting() {
      this.isCollecting = false;
      this.updateUI();
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
      if (this.collectingInterval) {
        clearInterval(this.collectingInterval);
        this.collectingInterval = null;
      }
    }

    setupProfileObserver() {
      if (this.observer) return;
      this.observer = new MutationObserver((mutations) => {
        if (!this.isCollecting) return;
        let hasNewProfiles = false;
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && this.isProfileElement(node)) {
              hasNewProfiles = true;
            }
          });
        });
        if (hasNewProfiles) {
          setTimeout(() => this.collectCurrentPageProfiles(), 500);
        }
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }

    isProfileElement(element) {
      const selectors = [
        ".artdeco-entity-lockup",
        "[data-chameleon-result-urn]",
        ".search-results__result-item",
        ".result-lockup",
      ];
      return selectors.some(
        (selector) =>
          (element.matches && element.matches(selector)) ||
          (element.querySelector && element.querySelector(selector))
      );
    }

    collectCurrentPageProfiles() {
      if (!this.isCollecting) return;
      const selectors = [
        ".artdeco-entity-lockup",
        "[data-chameleon-result-urn]",
        ".search-results__result-item",
        ".result-lockup",
      ];
      let profileElements = [];
      for (const selector of selectors) {
        profileElements = document.querySelectorAll(selector);
        if (profileElements.length > 0) break;
      }
      profileElements.forEach((element) => {
        const profile = this.extractProfileData(element);
        if (profile && !this.isDuplicateProfile(profile)) {
          this.addProfile(profile);
        }
      });
    }

    // extractProfileData(element) {
    //   try {
    //     const nameElement = element.querySelector(
    //       'a[href*="/sales/lead/"], a[href*="/in/"]'
    //     );
    //     const titleBlock = element.querySelector(
    //       ".artdeco-entity-lockup__subtitle"
    //     );
    //     const locationElement = element.querySelector(
    //       ".artdeco-entity-lockup__caption"
    //     );
    //     const imageElement = element.querySelector('img[src*="profile"]');
    //     if (!nameElement) return null;
    //     let name = nameElement.textContent?.trim();
    //     if (name && name.includes(" is reachable")) {
    //       name = name.replace(" is reachable", "").trim();
    //     }
    //     const url = nameElement.href.startsWith("http")
    //       ? nameElement.href
    //       : `https://www.linkedin.com${nameElement.getAttribute("href")}`;
    //     const location = locationElement?.textContent?.trim() || "";
    //     const profilePic = imageElement?.src || "";
    //     let title = "",
    //       company = "";
    //     if (titleBlock) {
    //       const raw = titleBlock.innerText.trim();
    //       if (raw.includes(" at ")) {
    //         const parts = raw.split(" at ");
    //         title = parts[0]?.trim() || "";
    //         company = parts[1]?.trim() || "";
    //       } else {
    //         title = raw;
    //       }
    //     }
    //     return {
    //       name,
    //       url,
    //       title,
    //       company,
    //       location,
    //       profilePic,
    //       timestamp: Date.now(),
    //       source: "sales-navigator",
    //     };
    //   } catch (error) {
    //     console.error("Error extracting profile data:", error);
    //     return null;
    //   }
    // }

    extractProfileData(element) {
      try {
        // Main profile link (name or sales lead link)
        const nameElement = element.querySelector(
          'a[href*="/sales/lead/"], a[href*="/in/"]'
        );
    
        // Sales Navigator lead-specific link (image or name link)
        const seleLeadElement = element.querySelector(
          'a[data-lead-search-result="profile-image-link-st240"], a[data-lead-search-result="profile-link-st240"]'
        );
    
        const titleBlock = element.querySelector(".artdeco-entity-lockup__subtitle");
        const locationElement = element.querySelector(".artdeco-entity-lockup__caption");
        const imageElement = element.querySelector('img[src*="profile"]');
    
        if (!nameElement) return null;
    
        let name = nameElement.textContent?.trim();
        if (name && name.includes(" is reachable")) {
          name = name.replace(" is reachable", "").trim();
        }
    
        const url = nameElement.href.startsWith("http")
          ? nameElement.href
          : `https://www.linkedin.com${nameElement.getAttribute("href")}`;
    
        const seleLeadUrl = seleLeadElement
          ? (seleLeadElement.href.startsWith("http")
              ? seleLeadElement.href
              : `https://www.linkedin.com${seleLeadElement.getAttribute("href")}`)
          : url; // fallback to main url if no dedicated lead link
    
        const location = locationElement?.textContent?.trim() || "";
        const profilePic = imageElement?.src || "";
    
        let title = "",
          company = "";
        if (titleBlock) {
          const raw = titleBlock.innerText.trim();
          if (raw.includes(" at ")) {
            const parts = raw.split(" at ");
            title = parts[0]?.trim() || "";
            company = parts[1]?.trim() || "";
          } else {
            title = raw;
          }
        }
    
        return {
          name,
          url,           // generic profile url
          seleLeadUrl,   // NEW: explicit Sales Navigator lead url
          title,
          company,
          location,
          profilePic,
          timestamp: Date.now(),
          source: "sales-navigator",
        };
      } catch (error) {
        console.error("Error extracting profile data:", error);
        return null;
      }
    }
    

    isDuplicateProfile(newProfile) {
      return this.profiles.some(
        (profile) =>
          profile.url === newProfile.url ||
          (profile.name === newProfile.name &&
            profile.title === newProfile.title)
      );
    }

    addProfile(profile) {
      this.profiles.push(profile);
      this.updateProfilesList();
      this.updateProfilesCount();
      this.sendProfileToExtension(profile);
    }

    sendProfileToExtension(profile) {
      try {
        chrome.runtime.sendMessage({
          action: "profileCollected",
          profiles: [profile],
          source: "sales-navigator-ui",
        });
      } catch (error) {}
    }

    updateUI() {
      const startBtn = this.ui.querySelector("#start-collecting");
      const pauseBtn = this.ui.querySelector("#pause-collecting");
      const nextBtn = this.ui.querySelector("#next-button");
      const statusDot = this.ui.querySelector("#status-dot");
      const statusText = this.ui.querySelector("#status-text");

      if (this.isCollecting) {
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        statusDot.className = "status-dot collecting";
        statusText.innerHTML =
          'Collecting profiles... <span class="collecting-animation"></span>';
      } else {
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        statusDot.className = "status-dot paused";
        statusText.textContent = "Collection paused";
        if (this.profiles.length > 0) {
          nextBtn.style.display = "block";
          nextBtn.textContent = `Process Profiles (${this.profiles.length})`;
        } else {
          nextBtn.style.display = "none";
        }
      }
    }

    updateProfilesCount() {
      const countElement = this.ui.querySelector("#profiles-count");
      const nextBtn = this.ui.querySelector("#next-button");
      countElement.textContent = this.profiles.length;
      if (this.profiles.length > 0 && !this.isCollecting) {
        nextBtn.style.display = "block";
        nextBtn.textContent = `Process Profiles (${this.profiles.length})`;
      } else if (this.profiles.length === 0) {
        nextBtn.style.display = "none";
      }
    }

    updateConnectCounts() {
      const sendConnectElement = this.ui?.querySelector("#send-connect-count");
      const FailedConnectElement = this.ui?.querySelector(
        "#Failed-connect-count"
      );

      if (sendConnectElement) {
        sendConnectElement.textContent = this.sendConnectCount;
      }
      if (FailedConnectElement) {
        FailedConnectElement.textContent = this.FailedConnectCount;
      }
      // Also update in workflow popup if it exists
      const workflowSendConnect = document.getElementById("send-connect-count");
      const workflowFailedConnect = document.getElementById(
        "Failed-connect-count"
      );
      if (workflowSendConnect)
        workflowSendConnect.textContent = this.sendConnectCount;
      if (workflowFailedConnect)
        workflowFailedConnect.textContent = this.FailedConnectCount;
    }

    updateProfilesList() {
      const listElement = this.ui.querySelector("#profiles-list");
      if (this.profiles.length === 0) {
        listElement.innerHTML =
          '<div class="empty-profiles">No profiles collected yet. Click "Start Collecting" to begin.</div>';
        return;
      }
      listElement.innerHTML = this.profiles
        .map(
          (profile, index) => `
            <div class="profile-item" data-profile-index="${index}">
                <div class="profile-image">
                    ${
                      profile.profilePic
                        ? `<img src="${profile.profilePic}" alt="${profile.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">`
                        : `<div class="profile-initial">${
                            profile.name
                              ? profile.name.charAt(0).toUpperCase()
                              : "?"
                          }</div>`
                    }
                </div>
                <div class="profile-info">
                    <div class="profile-name" title="${profile.name}">${
            profile.name
          }</div>
                    <div class="profile-title" title="${profile.title}">${
            profile.title
          }</div>
                    ${
                      profile.company
                        ? `<div class="profile-company" title="${profile.company}">${profile.company}</div>`
                        : ""
                    }
                    <div class="profile-url" title="${profile.url}" data-url="${
            profile.url
          }" style="cursor: pointer;">${this.shortenUrl(profile.url)}</div>
                </div>
                <div class="profile-actions">
                    <button class="profile-action-btn remove-profile-btn" data-url="${
                      profile.url
                    }" title="Remove">✕</button>
                </div>
            </div>
        `
        )
        .join("");
      // Add event listeners for profile actions
      listElement.querySelectorAll(".profile-url").forEach((urlElement) => {
        urlElement.addEventListener("click", (e) => {
          const url = e.target.getAttribute("data-url");
          this.copyProfileUrl(url);
        });
      });

      listElement
        .querySelectorAll(".remove-profile-btn")
        .forEach((removeBtn) => {
          removeBtn.addEventListener("click", (e) => {
            const url = e.target.getAttribute("data-url");
            this.removeProfile(url);
          });
        });
    }

    shortenUrl(url) {
      if (!url) return "";
      const match = url.match(/\/in\/([^\/\?]+)/);
      if (match) return `linkedin.com/in/${match[1]}`;
      return url.length > 30 ? url.substring(0, 30) + "..." : url;
    }

    copyProfileUrl(url) {
      navigator.clipboard
        .writeText(url)
        .then(() => {
          const notification = document.createElement("div");
          notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 10px 15px; border-radius: 5px; z-index: 10001; font-size: 12px;`;
          notification.textContent = "Profile URL copied!";
          document.body.appendChild(notification);
          setTimeout(() => notification.remove(), 2000);
        })
        .catch((err) => console.error("Failed to copy URL:", err));
    }

    removeProfile(url) {
      this.profiles = this.profiles.filter((profile) => profile.url !== url);
      this.updateProfilesList();
      this.updateProfilesCount();
    }

    clearProfiles() {
      if (confirm("Are you sure you want to clear all collected profiles?")) {
        this.profiles = [];
        this.updateProfilesList();
        this.updateProfilesCount();
        this.updateUI();
      }
    }

    startWorkflow() {
      if (this.profiles.length === 0) {
        alert("No profiles to process");
        return;
      }
      this.currentWorkflowStep = "processing";
      this.currentProfileIndex = 0;
      this.generatedMessage = null;
      this.processedProfiles = [];
      this.hideCollectionUI();
      this.saveState();
      this.showWorkflowPopup();
    }

    // saveState() {
    //     const state = {
    //         currentWorkflowStep: this.currentWorkflowStep,
    //         currentProfileIndex: this.currentProfileIndex,
    //         profiles: this.profiles,
    //         generatedMessage: this.generatedMessage,
    //         processedProfiles: this.processedProfiles || [],
    //         automationRunning: this.automationRunning,
    //         workflowPaused: this.workflowPaused,
    //         profileStatuses: this.profileStatuses || {},
    //         sendConnectCount: this.sendConnectCount || 0,
    //         FailedConnectCount: this.FailedConnectCount || 0,
    //         customPrompt: this.customPrompt || '',
    //         promptSet: this.promptSet || false
    //     };
    //     localStorage.setItem('salesNavWorkflow', JSON.stringify(state));
    // }

    saveState() {
      const state = {
        currentWorkflowStep: this.currentWorkflowStep,
        currentProfileIndex: this.currentProfileIndex,
        profiles: this.profiles.map((p) => ({
          ...p,
          profileId: p.profileId,
          connectionRequestId: p.connectionRequestId,
          messageId: p.messageId,
          promptId: p.promptId,
        })),
        generatedMessage: this.generatedMessage,
        generatedInterests: this.generatedInterests,
        processedProfiles: this.processedProfiles || [],
        automationRunning: this.automationRunning,
        workflowPaused: this.workflowPaused,
        profileStatuses: this.profileStatuses || {},
        sendConnectCount: this.sendConnectCount || 0,
        FailedConnectCount: this.FailedConnectCount || 0,
        customPrompt: this.customPrompt || "",
        promptSet: this.promptSet || false,
      };
      localStorage.setItem("salesNavWorkflow", JSON.stringify(state));
    }

    updateButtonStates() {
      const startBtn = document.getElementById("start-automation");
      const pauseBtn = document.getElementById("pause-automation");
      const resumeBtn = document.getElementById("resume-automation");

      if (this.automationRunning && !this.workflowPaused) {
        if (startBtn) startBtn.style.display = "none";
        if (pauseBtn) pauseBtn.style.display = "inline-block";
        if (resumeBtn) resumeBtn.style.display = "none";
      } else if (this.automationRunning && this.workflowPaused) {
        if (startBtn) startBtn.style.display = "none";
        if (pauseBtn) pauseBtn.style.display = "none";
        if (resumeBtn) resumeBtn.style.display = "inline-block";
      } else {
        if (startBtn) startBtn.style.display = "inline-block";
        if (pauseBtn) pauseBtn.style.display = "none";
        if (resumeBtn) resumeBtn.style.display = "none";
      }
    }

    showWorkflowPopup() {
      const overlay = document.createElement("div");
      overlay.id = "workflow-popup-overlay";
      overlay.style.cssText = `position: fixed !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; background: rgba(0, 0, 0, 0.3) !important; z-index: 999999 !important; display: flex !important; justify-content: flex-end !important; align-items: flex-start !important; pointer-events: none !important; padding: 20px !important;`;
      const popup = document.createElement("div");
      popup.id = "workflow-popup";
      popup.style.cssText = `background: white !important; border-radius: 12px !important; padding: 24px !important; width: 450px !important; max-height: 90vh !important; overflow-y: auto !important; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3) !important; position: relative !important; z-index: 1000000 !important; pointer-events: auto !important; margin-top: 20px !important;`;

      popup.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #0073b1;">Processing Profiles</h2>
                <button id="close-workflow-popup" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
            </div>
            <div style="margin-bottom: 20px;">
                <div style="background: #f3f6f8; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <strong>Progress: </strong><span id="workflow-progress">0 / ${
                      this.profiles.length
                    }</span>
                </div>
                <div style="background: #e7f3ff; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                    <strong>Current Status: </strong><span id="workflow-current-status">Starting workflow...</span>
                </div>
                <div style="background: #fff3cd; padding: 12px; border-radius: 8px;">
                    <strong>Message: </strong><span id="workflow-message">${
                      this.generatedMessage ||
                      "Will be generated from custom prompt"
                    }</span>
                </div>
                <div id="prompt-section" style="background: #e8f5e8; padding: 12px; border-radius: 8px; margin-top: 8px; ${
                  this.promptSet ? "display: none;" : ""
                }">
                    <strong>Custom Prompt: </strong>
                    <textarea id="custom-prompt-input" placeholder="Enter your custom prompt for message generation..."
                        style="width: 100%; height: 80px; margin-top: 8px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical; font-family: inherit; font-size: 14px;">${
                          this.customPrompt
                        }</textarea>
                    <button id="set-prompt-btn" style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 8px; font-size: 14px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display: inline-block; vertical-align: middle;">
                            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"></path>
                        </svg>
                    </button>
                </div>
                <div id="prompt-display" style="background: #d4edda; padding: 12px; border-radius: 8px; margin-top: 8px; ${
                  !this.promptSet ? "display: none;" : ""
                }">
                    <strong>Using Custom Prompt: </strong><span id="current-prompt-text" style="font-style: italic;">${
                      this.customPrompt
                    }</span>
                    <button id="change-prompt-btn" style="background: #6c757d; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-left: 8px; font-size: 12px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="display: inline-block; vertical-align: middle;">
                            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"></path>
                        </svg>
                    </button>
                </div>
                <div style="background: #f3e5f5; padding: 12px; border-radius: 8px; margin-top: 8px;">
                    <strong>LinkedIn URL: </strong><span id="workflow-linkedin-url" style="font-size: 12px; word-break: break-all;">${
                      this.currentLinkedInProfileUrl ||
                      "Will be captured from profile"
                    }</span>
                </div>
            </div>

            <div id="workflow-profiles-list" style="max-height: 300px; overflow-y: auto;">
                ${this.profiles
                  .map(
                    (profile, index) => `
                    <div id="profile-${index}" style="display: flex; align-items: center; padding: 8px; border-bottom: 1px solid #eee;">
                        <div id="status-icon-${index}" style="width: 20px; height: 20px; border-radius: 50%; background: #ddd; margin-right: 12px; display: flex; align-items: center; justify-content: center; font-size: 12px;">⏳</div>
                        <div style="flex: 1;">
                            <div style="font-weight: 500;">${profile.name}</div>
                            <div style="font-size: 12px; color: #666;">${
                              profile.title || ""
                            }</div>
                        </div>
                        <div id="profile-status-${index}" style="font-size: 12px; color: #666;">Waiting</div>
                    </div>
                `
                  )
                  .join("")}
            </div>
            <div style="margin-top: 20px; text-align: center;">
                <button id="start-automation" style="background: #28a745; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-right: 10px; font-weight: 500; font-size: 16px;">🚀 Start Automation</button>
                <button id="pause-automation" style="background: #f44336; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-right: 10px; font-weight: 500; font-size: 16px; display: none;">⏸️ Pause Automation</button>
                <button id="resume-automation" style="background: #4caf50; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: 500; font-size: 16px; display: none;">▶️ Resume Automation</button>
            </div>
        `;

      popup.addEventListener("click", (e) => e.stopPropagation());
      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      document
        .getElementById("close-workflow-popup")
        .addEventListener("click", () => this.closeWorkflowPopup());
      document
        .getElementById("start-automation")
        .addEventListener("click", () => this.startFullAutomation());
      document
        .getElementById("pause-automation")
        .addEventListener("click", () => this.pauseAutomation());
      document
        .getElementById("resume-automation")
        .addEventListener("click", () => this.resumeAutomation());
      document
        .getElementById("set-prompt-btn")
        .addEventListener("click", () => this.setCustomPrompt());
      document
        .getElementById("change-prompt-btn")
        .addEventListener("click", () => this.changePrompt());

      this.workflowPopup = overlay;
      if (this.ui) this.ui.style.display = "none";
      this.updateWorkflowUI();
    }

    updateWorkflowUI() {
      if (!this.workflowPopup) return;
      const progressElement = document.getElementById("workflow-progress");
      const statusElement = document.getElementById("workflow-current-status");
      const messageElement = document.getElementById("workflow-message");
      const profileUrlElement = document.getElementById("workflow-profile-url");
      const linkedinUrlElement = document.getElementById(
        "workflow-linkedin-url"
      );

      if (progressElement)
        progressElement.textContent = `${this.currentProfileIndex} / ${this.profiles.length}`;
      if (
        this.currentWorkflowStep === "processing" &&
        this.currentProfileIndex < this.profiles.length
      ) {
        const currentProfile = this.profiles[this.currentProfileIndex];
        if (statusElement)
          statusElement.textContent = `Processing: ${currentProfile.name}`;
      }

      if (
        this.currentProfileIndex < this.profiles.length &&
        this.automationRunning
      ) {
        this.setCurrentProfileProcessing();
      }
      if (messageElement) {
        messageElement.textContent =
          this.generatedMessage || "Will be generated from custom prompt";
      }

      const promptSection = document.getElementById("prompt-section");
      const promptDisplay = document.getElementById("prompt-display");
      const currentPromptText = document.getElementById("current-prompt-text");
      const customPromptInput = document.getElementById("custom-prompt-input");

      if (promptSection && promptDisplay) {
        if (this.promptSet) {
          promptSection.style.display = "none";
          promptDisplay.style.display = "block";
          if (currentPromptText)
            currentPromptText.textContent = this.customPrompt;
        } else {
          promptSection.style.display = "block";
          promptDisplay.style.display = "none";
          if (customPromptInput) customPromptInput.value = this.customPrompt;
        }
      }
      if (profileUrlElement)
        profileUrlElement.textContent = this.getCurrentProfileUrl();
      if (linkedinUrlElement)
        linkedinUrlElement.textContent =
          this.currentLinkedInProfileUrl || "Will be captured from profile";
      this.restoreProfileStatuses();
      this.updateButtonStates();
    }

    restoreProfileStatuses() {
      Object.keys(this.profileStatuses).forEach((index) => {
        const savedStatus = this.profileStatuses[index];
        if (savedStatus) {
          const statusIcon = document.getElementById(`status-icon-${index}`);
          const profileStatus = document.getElementById(
            `profile-status-${index}`
          );
          if (statusIcon) {
            statusIcon.textContent = savedStatus.icon;
            statusIcon.style.background = savedStatus.color;
            statusIcon.style.color = "white";
          }
          if (profileStatus) {
            profileStatus.textContent = savedStatus.text || savedStatus.status;
          }
        }
      });

      if (
        this.currentProfileIndex < this.profiles.length &&
        this.automationRunning &&
        !this.workflowPaused
      ) {
        this.setCurrentProfileProcessing();
      }
    }

    closeWorkflowPopup() {
      if (this.autoProcessingTimeout) {
        clearTimeout(this.autoProcessingTimeout);
        this.autoProcessingTimeout = null;
      }

      if (this.workflowPopup) {
        document.body.removeChild(this.workflowPopup);
        this.workflowPopup = null;
      }
      this.currentWorkflowStep = null;
      this.currentProfileIndex = 0;
      this.showUI();
    }

    pauseAutomation() {
      this.workflowPaused = true;
      this.automationRunning = false;
      if (this.autoProcessingTimeout) {
        clearTimeout(this.autoProcessingTimeout);
        this.autoProcessingTimeout = null;
      }

      document.getElementById("pause-automation").style.display = "none";
      document.getElementById("resume-automation").style.display =
        "inline-block";
      this.updateProfileStatus(
        this.currentProfileIndex,
        "Paused",
        "⏸️",
        "#ff9800"
      );
      this.updateCurrentStatus(
        '⏸️ Automation paused. Click "Resume Automation" to continue.'
      );
      this.saveState();
    }

    resumeAutomation() {
      this.workflowPaused = false;
      this.automationRunning = true;
      document.getElementById("pause-automation").style.display =
        "inline-block";
      document.getElementById("resume-automation").style.display = "none";
      this.updateCurrentStatus(
        `▶️ Automation resumed... Next profile in ${
          this.profileDelay / 1000
        } seconds.`
      );

      // Update current profile status to show it's being processed
      this.setCurrentProfileProcessing();

      this.saveState();
      this.scheduleNextProfile();
    }

    startFullAutomation() {
      if (!this.promptSet || !this.customPrompt.trim()) {
        alert("Please set a custom prompt before starting automation");
        return;
      }
      const startBtn = document.getElementById("start-automation");
      const pauseBtn = document.getElementById("pause-automation");

      if (startBtn) startBtn.style.display = "none";
      if (pauseBtn) pauseBtn.style.display = "inline-block";

      this.workflowPaused = false;
      this.automationRunning = true;
      this.saveState();

      this.updateCurrentStatus("🚀 Starting full automation process...");
      this.updateWorkflowUI();
      this.setCurrentProfileProcessing();
      setTimeout(() => {
        this.goToNextProfile();
      }, 2000);
    }

    updateCurrentStatus(message) {
      const statusElement = document.getElementById("workflow-current-status");
      if (statusElement) statusElement.textContent = message;
    }

    setCustomPrompt() {
      const promptInput = document.getElementById("custom-prompt-input");
      const promptValue = promptInput.value.trim();

      if (!promptValue) {
        alert("Please enter a custom prompt");
        return;
      }

      this.customPrompt = promptValue;
      this.promptSet = true;
      this.saveState();

      // Hide prompt input section and show display section
      document.getElementById("prompt-section").style.display = "none";
      document.getElementById("prompt-display").style.display = "block";
      document.getElementById("current-prompt-text").textContent =
        this.customPrompt;

      // Update message display
      const messageElement = document.getElementById("workflow-message");
      if (messageElement) {
        messageElement.textContent = "Will be generated from custom prompt";
      }
    }

    changePrompt() {
      this.promptSet = false;
      this.customPrompt = "";
      this.saveState();

      // Show prompt input section and hide display section
      document.getElementById("prompt-section").style.display = "block";
      document.getElementById("prompt-display").style.display = "none";
      document.getElementById("custom-prompt-input").value = "";

      // Update message display
      const messageElement = document.getElementById("workflow-message");
      if (messageElement) {
        messageElement.textContent = "Will be generated from custom prompt";
      }
    }

    scheduleNextProfile() {
      if (this.autoProcessingTimeout) {
        clearTimeout(this.autoProcessingTimeout);
      }
      this.startCountdownTimer();
      this.autoProcessingTimeout = setTimeout(() => {
        if (!this.workflowPaused) {
          this.goToNextProfile();
        }
      }, this.profileDelay);
    }

    startCountdownTimer() {
      let remainingTime = this.profileDelay / 1000;
      const countdownInterval = setInterval(() => {
        if (this.workflowPaused) {
          clearInterval(countdownInterval);
          return;
        }

        remainingTime--;
        if (remainingTime > 0) {
          const statusElement = document.getElementById(
            "workflow-current-status"
          );
          if (statusElement) {
            const baseMessage = statusElement.textContent.split(" in ")[0];
            statusElement.textContent = `${baseMessage} in ${remainingTime} seconds...`;
          }
        } else {
          clearInterval(countdownInterval);
        }
      }, 1000);
    }

    async goToNextProfile() {
      console.log(
        `goToNextProfile called. Current index: ${this.currentProfileIndex}, Total profiles: ${this.profiles.length}`
      );
      const pauseBtn = document.getElementById("pause-workflow");
      if (pauseBtn) pauseBtn.style.display = "inline-block";

      if (this.currentProfileIndex < this.profiles.length) {
        const profile = this.profiles[this.currentProfileIndex];
        console.log(
          `Next profile to process: ${profile.name} - ${profile.url}`
        );
        await this.navigateToProfile(profile.url);
      } else {
        console.log("All profiles completed, finishing workflow");
        this.completeWorkflow();
      }
    }

    async navigateToProfile(profileUrl) {
      console.log(
        `Navigating to profile ${this.currentProfileIndex + 1}/${
          this.profiles.length
        }: ${profileUrl}`
      );
      this.updateCurrentStatus(
        `Opening profile ${this.currentProfileIndex + 1}/${
          this.profiles.length
        }...`
      );

      this.saveState();
      window.location.href = profileUrl;
    }

    processCurrentProfile() {
      const pauseBtn = document.getElementById("pause-workflow");
      if (pauseBtn) pauseBtn.style.display = "inline-block";
      this.processNextProfile();
    }

    forceContinueWorkflow() {
      this.workflowPaused = false;
      this.updateProfileStatus(
        this.currentProfileIndex,
        "Force continuing...",
        "⚡",
        "#ff9800"
      );
      setTimeout(() => this.showThreeDotMenu(), 1000);
    }

    updateProfileStatus(index, status, icon, color) {
      const statusIcon = document.getElementById(`status-icon-${index}`);
      const profileStatus = document.getElementById(`profile-status-${index}`);
      if (statusIcon) {
        statusIcon.textContent = icon;
        statusIcon.style.background = color;
        statusIcon.style.color = "white";
      }
      if (profileStatus) profileStatus.textContent = status;

      this.profileStatuses[index] = {
        status: status,
        icon: icon,
        color: color,
        timestamp: Date.now(),
      };
      this.saveState();
    }

    setCurrentProfileProcessing() {
      if (this.currentProfileIndex < this.profiles.length) {
        this.updateProfileStatus(
          this.currentProfileIndex,
          "Processing...",
          "🔄",
          "#2196f3"
        );
      }
    }

    async processNextProfile() {
      if (this.workflowPaused) return;
      if (this.currentProfileIndex >= this.profiles.length) {
        this.completeWorkflow();
        return;
      }

      const profile = this.profiles[this.currentProfileIndex];
      this.currentLinkedInProfileUrl = null;

      try {
        const currentUrl = window.location.href;
        const isOnSalesNavPage = currentUrl.includes("/sales/search/people");
        const isOnLinkedInProfilePage =
          currentUrl.includes("/in/") && currentUrl.includes("linkedin.com");
        const isOnSalesNavProfilePage =
          currentUrl.includes("/sales/lead/") &&
          currentUrl.includes("linkedin.com");

        if (isOnSalesNavPage) {
          if (this.workflowPopup) this.closeWorkflowPopup();
          await this.openProfileUrl(profile.url);
          return;
        } else if (isOnLinkedInProfilePage || isOnSalesNavProfilePage) {
          if (!this.workflowPopup) this.showWorkflowPopup();
          this.updateWorkflowUI();
          this.updateProfileStatus(
            this.currentProfileIndex,
            "Page loading...",
            "🔄",
            "#2196f3"
          );

          if (this.workflowPaused) {
            this.updateProfileStatus(
              this.currentProfileIndex,
              "Paused",
              "⏸️",
              "#ff9800"
            );
            return;
          }

          await this.waitForPageLoad();
          this.updateProfileStatus(
            this.currentProfileIndex,
            "Finding menu...",
            "🔍",
            "#2196f3"
          );
          await this.showThreeDotMenu();
          this.updateProfileStatus(
            this.currentProfileIndex,
            "Completed",
            "✅",
            "#4caf50"
          );
          this.processedProfiles.push({
            ...profile,
            status: "completed",
            message: this.generatedMessage,
          });

          await this.wait(2000);
          this.currentProfileIndex++;
          console.log(
            `Profile completed. Moving to index ${this.currentProfileIndex}/${this.profiles.length}`
          );

          // Update UI to reflect completion
          this.updateWorkflowUI();

          if (this.currentProfileIndex < this.profiles.length) {
            this.updateCurrentStatus(
              `✅ Profile completed! Auto-moving to next profile in ${
                this.profileDelay / 1000
              } seconds...`
            );
            this.scheduleNextProfile();
          } else {
            this.completeWorkflow();
          }
          return;
        } else {
          await this.navigateBackToSalesNav();
          return;
        }
      } catch (error) {
        console.error("Error processing profile:", error);
        if (!this.workflowPopup) this.showWorkflowPopup();
        this.updateProfileStatus(
          this.currentProfileIndex,
          "Error",
          "❌",
          "#f44336"
        );
        this.processedProfiles.push({
          ...profile,
          status: "error",
          error: error.message,
        });
        await this.wait(1000);
        this.currentProfileIndex++;
        if (this.currentProfileIndex < this.profiles.length) {
          this.updateCurrentStatus(
            `❌ Error occurred! Auto-moving to next profile in ${
              this.profileDelay / 1000
            } seconds...`
          );
          this.scheduleNextProfile();
        } else {
          this.completeWorkflow();
        }
      }
    }

    async navigateBackToSalesNav() {
      const statusElement = document.getElementById("workflow-current-status");
      if (statusElement)
        statusElement.textContent = "Returning to search page...";
      this.saveState();
      if (
        document.referrer &&
        document.referrer.includes("/sales/search/people")
      ) {
        window.history.back();
      } else {
        const salesNavUrl = "https://www.linkedin.com/sales/search/people";
        window.location.href = salesNavUrl;
      }
    }

    async openProfileUrl(url) {
      const statusElement = document.getElementById("workflow-current-status");
      if (statusElement) statusElement.textContent = "Opening profile URL...";
      this.saveState();
      window.location.href = url;
    }

    async waitForPageLoad() {
      const statusElement = document.getElementById("workflow-current-status");
      if (statusElement)
        statusElement.textContent = "Waiting for page to load...";
      return new Promise((resolve) => {
        const maxTimeout = setTimeout(() => resolve(), 10000);
        if (document.readyState === "complete") {
          clearTimeout(maxTimeout);
          setTimeout(resolve, 1000);
          return;
        }
        const checkLoaded = () => {
          if (document.readyState === "complete") {
            clearTimeout(maxTimeout);
            setTimeout(resolve, 1000);
          } else {
            setTimeout(checkLoaded, 500);
          }
        };
        checkLoaded();
      });
    }

    // Helper: reliably resolve the overflow menu opened by a trigger button
    getOverflowMenuForButton(button) {
      if (!button) return null;
      const menuId = button.getAttribute("aria-controls");
      let menu = menuId ? document.getElementById(menuId) : null;
      if (!menu || !this.isElementVisible(menu)) {
        const candidates = Array.from(
          document.querySelectorAll('div[role="menu"], [id^="hue-menu-"]')
        );
        const visibleMenus = candidates.filter((el) =>
          this.isElementVisible(el)
        );
        const preferred = visibleMenus.find((el) => {
          const text = (el.textContent || "").toLowerCase();
          return (
            text.includes("copy") ||
            text.includes("connect") ||
            text.includes("linkedin")
          );
        });
        menu = preferred || visibleMenus.pop() || menu;
      }
      return menu || null;
    }

    // Helper: visibility check for menus rendered in portals
    isElementVisible(element) {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      )
        return false;
      if (element.offsetParent !== null) return true;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    // Helper: find a menu item by text patterns
    findMenuItemByText(menu, patterns) {
      if (!menu) return null;
      const items = Array.from(menu.querySelectorAll("a, button, div, span"));
      return (
        items.find((el) => {
          const text = (el.textContent || "").toLowerCase().trim();
          return patterns.some((p) => {
            if (typeof p === "string") return text.includes(p);
            try {
              return p.test(text);
            } catch {
              return false;
            }
          });
        }) || null
      );
    }

    async showThreeDotMenu() {
      if (this.isProcessingThreeDotMenu) return;
      this.isProcessingThreeDotMenu = true;
      const statusElement = document.getElementById("workflow-current-status");
      if (statusElement)
        statusElement.textContent = "Looking for three-dot menu...";

      const button =
        document.querySelector(
          'button[aria-label="Open actions overflow menu"]'
        ) ||
        document.querySelector('button[id^="hue-menu-trigger-"]') ||
        document.querySelector("button._overflow-menu--trigger_1xow7n");

      if (button) {
        if (statusElement)
          statusElement.textContent = "Clicking three-dot menu...";
        button.click();
        if (statusElement)
          statusElement.textContent = "Three-dot menu clicked!";
        await this.wait(1000);
        let menu = this.getOverflowMenuForButton(button);
        if (menu) {
          if (statusElement)
            statusElement.textContent =
              "Menu opened! Looking for LinkedIn profile option...";
          await this.wait(500);
          const copyUrlOption = this.findMenuItemByText(menu, [
            "copy linkedin.com url",
            "copy linkedin url",
            "copy url",
            /copy\s+linkedin/i,
          ]);
          console.log("Copy URL Option:", copyUrlOption);
          if (copyUrlOption) {
            if (statusElement)
              statusElement.textContent = "Extracting LinkedIn URL...";
            let linkedinUrl = this.extractLinkedInUrlFromPage();
            if (!linkedinUrl) {
              if (statusElement)
                statusElement.textContent =
                  'Clicking "Copy LinkedIn.com URL"...';
              copyUrlOption.click();
              if (statusElement)
                statusElement.textContent = "Waiting for URL to be copied...";
              await this.wait(2000);
              try {
                const clipboardText = await navigator.clipboard.readText();
                if (clipboardText && clipboardText.includes("linkedin.com")) {
                  const urlMatch = clipboardText.match(
                    /https:\/\/[^\s]*linkedin\.com\/in\/[^\s\n\r]*/
                  );
                  if (urlMatch) {
                    linkedinUrl = urlMatch[0].trim();
                  }
                }
              } catch (e) {
                console.log("Clipboard read failed:", e.message);
              }
            }
            const copiedUrl = linkedinUrl;
            console.log("Copied URL:", copiedUrl);
            if (copiedUrl) {
              this.currentLinkedInProfileUrl = copiedUrl;

              this.updateWorkflowUI();
              if (statusElement)
                statusElement.textContent =
                  "LinkedIn URL captured! Generating message...";

              const profile = this.profiles[this.currentProfileIndex];
              const staticMessage = `Hi ${
                profile.name || "there"
              }, I'm a full-stack developer with expertise in .NET, Angular, and React. I'd love to connect and explore how I can add value to your team.`;
              try {
                const messageData = await APIService.generateMessage(
                  this.customPrompt,
                  copiedUrl
                );
                if (messageData && messageData.message) {
                  this.generatedMessage = messageData.message.slice(0, 300); // Enforce 300-char limit
                  this.generatedInterests = messageData.interests; // Store interests
                  console.log("Received Message:", messageData.message);
                  console.log("Received Interests:", messageData.interests);
                  if (statusElement)
                    statusElement.textContent =
                      "Message generated from custom prompt!";
                } else {
                  this.generatedMessage = staticMessage;
                  this.generatedInterests = null;
                  console.log("Test Message", staticMessage);
                  if (statusElement)
                    statusElement.textContent =
                      "API response invalid - using static message";
                }
              } catch (error) {
                console.error("API call failed:", error);
                this.generatedMessage = staticMessage;
                this.generatedInterests = null;
                if (statusElement)
                  statusElement.textContent =
                    "API error - using static message";
              }

              this.updateWorkflowUI();
              this.saveState();
              await this.wait(10000);
              await this.clickConnectButton(true);
            } else {
              if (statusElement)
                statusElement.textContent =
                  "Failed to capture LinkedIn URL from clipboard";
              this.FailedConnectCount++;
              this.updateConnectCounts();
              try {
                const apiResponse = await APIService.addProfile(
                  profile,
                  this.promptSet ? this.customPrompt : null,
                  this.generatedMessage,
                  this.currentLinkedInProfileUrl,
                  statusElement.textContent,
                  this.generatedInterests
                );
                if (apiResponse) {
                  profile.profileId = apiResponse.profileId;
                  profile.connectionRequestId = apiResponse.connectionRequestId;
                  profile.messageId = apiResponse.messageId;
                  profile.promptId = apiResponse.promptId;
                  console.log(
                    `Profile stored after invitation: ProfileId=${
                      apiResponse.profileId
                    }, ConnectionRequestId=${
                      apiResponse.connectionRequestId
                    }, MessageId=${apiResponse.messageId || "none"}, PromptId=${
                      apiResponse.promptId || "none"
                    }`
                  );
                  this.saveState();
                } else {
                  console.error("API call to addProfile returned null");
                }
              } catch (error) {
                console.error("Failed to store profile in API:", error);
              }

              this.currentProfileIndex++;
              this.scheduleNextProfile();
            }
          } else {
            const viewProfile = this.findMenuItemByText(menu, [
              "view linkedin profile",
              /view\s+profile/i,
            ]);
            if (viewProfile) {
              if (statusElement)
                statusElement.textContent =
                  "Copy option not found. Opening LinkedIn profile...";
              viewProfile.click();
              await this.wait(2000);
              const urlFromPage = this.extractLinkedInUrlFromPage();
              if (urlFromPage) {
                this.currentLinkedInProfileUrl = urlFromPage;
                this.updateWorkflowUI();
                if (statusElement)
                  statusElement.textContent =
                    "LinkedIn URL captured from profile!";

                const profile = this.profiles[this.currentProfileIndex];
                const staticMessage = `Hi ${
                  profile.name || "there"
                }, I'm a full-stack developer with expertise in .NET, Angular, and React. I'd love to connect and explore how I can add value to your team.`;
                try {
                  const messageData = await APIService.generateMessage(
                    this.customPrompt,
                    urlFromPage
                  );
                  if (messageData && messageData.message) {
                    this.generatedMessage = messageData.message.slice(0, 300);
                    this.generatedInterests = messageData.interests;
                    if (statusElement)
                      statusElement.textContent =
                        "Message generated from custom prompt!";
                  } else {
                    this.generatedMessage = staticMessage;
                    this.generatedInterests = null;
                    if (statusElement)
                      statusElement.textContent =
                        "API response invalid - using static message";
                  }
                } catch (error) {
                  console.error("API call failed:", error);
                  this.generatedMessage = staticMessage;
                  this.generatedInterests = null;
                  if (statusElement)
                    statusElement.textContent =
                      "API error - using static message";
                }

                this.saveState();
                await this.wait(10000);
                await this.clickConnectButton(true);
              } else {
                if (statusElement)
                  statusElement.textContent =
                    "Failed to capture LinkedIn URL from profile";
                this.FailedConnectCount++;
                this.updateConnectCounts();
                try {
                  const apiResponse = await APIService.addProfile(
                    profile,
                    this.promptSet ? this.customPrompt : null,
                    this.generatedMessage,
                    this.currentLinkedInProfileUrl,
                    statusElement.textContent,
                    this.generatedInterests
                  );
                  if (apiResponse) {
                    profile.profileId = apiResponse.profileId;
                    profile.connectionRequestId =
                      apiResponse.connectionRequestId;
                    profile.messageId = apiResponse.messageId;
                    profile.promptId = apiResponse.promptId;
                    console.log(
                      `Profile stored after invitation: ProfileId=${
                        apiResponse.profileId
                      }, ConnectionRequestId=${
                        apiResponse.connectionRequestId
                      }, MessageId=${
                        apiResponse.messageId || "none"
                      }, PromptId=${apiResponse.promptId || "none"}`
                    );
                    this.saveState();
                  } else {
                    console.error("API call to addProfile returned null");
                  }
                } catch (error) {
                  console.error("Failed to store profile in API:", error);
                }
                this.currentProfileIndex++;
                this.scheduleNextProfile();
              }
            } else {
              if (statusElement)
                statusElement.textContent =
                  "Copy LinkedIn URL option not found";
              this.FailedConnectCount++;
              this.updateConnectCounts();
              try {
                const apiResponse = await APIService.addProfile(
                  profile,
                  this.promptSet ? this.customPrompt : null,
                  this.generatedMessage,
                  this.currentLinkedInProfileUrl,
                  statusElement.textContent,
                  this.generatedInterests
                );
                if (apiResponse) {
                  profile.profileId = apiResponse.profileId;
                  profile.connectionRequestId = apiResponse.connectionRequestId;
                  profile.messageId = apiResponse.messageId;
                  profile.promptId = apiResponse.promptId;
                  console.log(
                    `Profile stored after invitation: ProfileId=${
                      apiResponse.profileId
                    }, ConnectionRequestId=${
                      apiResponse.connectionRequestId
                    }, MessageId=${apiResponse.messageId || "none"}, PromptId=${
                      apiResponse.promptId || "none"
                    }`
                  );
                  this.saveState();
                } else {
                  console.error("API call to addProfile returned null");
                }
              } catch (error) {
                console.error("Failed to store profile in API:", error);
              }
              this.currentProfileIndex++;
              this.scheduleNextProfile();
            }
          }
        } else {
          if (statusElement)
            statusElement.textContent = "Menu not visible after click";
          this.FailedConnectCount++;
          this.updateConnectCounts();
          try {
            const apiResponse = await APIService.addProfile(
              profile,
              this.promptSet ? this.customPrompt : null,
              this.generatedMessage,
              this.currentLinkedInProfileUrl,
              statusElement.textContent,
              this.generatedInterests
            );
            if (apiResponse) {
              profile.profileId = apiResponse.profileId;
              profile.connectionRequestId = apiResponse.connectionRequestId;
              profile.messageId = apiResponse.messageId;
              profile.promptId = apiResponse.promptId;
              console.log(
                `Profile stored after invitation: ProfileId=${
                  apiResponse.profileId
                }, ConnectionRequestId=${
                  apiResponse.connectionRequestId
                }, MessageId=${apiResponse.messageId || "none"}, PromptId=${
                  apiResponse.promptId || "none"
                }`
              );
              this.saveState();
            } else {
              console.error("API call to addProfile returned null");
            }
          } catch (error) {
            console.error("Failed to store profile in API:", error);
          }
          this.currentProfileIndex++;
          this.scheduleNextProfile();
        }
      } else {
        if (statusElement)
          statusElement.textContent = "Three-dot button not found";
        this.FailedConnectCount++;
        this.updateConnectCounts();

        try {
          const apiResponse = await APIService.addProfile(
            profile,
            this.promptSet ? this.customPrompt : null,
            this.generatedMessage,
            this.currentLinkedInProfileUrl,
            statusElement.textContent,
            this.generatedInterests
          );
          if (apiResponse) {
            profile.profileId = apiResponse.profileId;
            profile.connectionRequestId = apiResponse.connectionRequestId;
            profile.messageId = apiResponse.messageId;
            profile.promptId = apiResponse.promptId;
            console.log(
              `Profile stored after invitation: ProfileId=${
                apiResponse.profileId
              }, ConnectionRequestId=${
                apiResponse.connectionRequestId
              }, MessageId=${apiResponse.messageId || "none"}, PromptId=${
                apiResponse.promptId || "none"
              }`
            );
            this.saveState();
          } else {
            console.error("API call to addProfile returned null");
          }
        } catch (error) {
          console.error("Failed to store profile in API:", error);
        }

        this.currentProfileIndex++;
        this.scheduleNextProfile();
      }
      this.isProcessingThreeDotMenu = false;
    }

    async clickSendInvitationButton() {
      const statusElement = document.getElementById("workflow-current-status");
      let sendButton =
        document.querySelector('button[aria-label="Send invitation"]') ||
        document.querySelector('button[data-control-name="send_invitation"]') ||
        Array.from(document.querySelectorAll("button")).find((btn) => {
          const text = btn.textContent && btn.textContent.trim().toLowerCase();
          return (
            text === "send invitation" ||
            text === "send" ||
            text.includes("send invitation")
          );
        });

      if (!sendButton) {
        const modal =
          document.querySelector("[data-test-modal]") ||
          document.querySelector(".send-invite") ||
          document.querySelector('[aria-labelledby*="send-invite"]');

        if (modal) {
          sendButton =
            modal.querySelector('button[type="submit"]') ||
            Array.from(modal.querySelectorAll("button")).find((btn) => {
              const text =
                btn.textContent && btn.textContent.trim().toLowerCase();
              return text.includes("send") || text.includes("invitation");
            });
        }
      }

      const profile = this.profiles[this.currentProfileIndex];

      if (sendButton && !sendButton.disabled) {
        if (statusElement)
          statusElement.textContent = "Clicking Send Invitation...";
        sendButton.click();
        await this.wait(3000);

        const successMessage =
          document.querySelector("[data-test-toast-message]") ||
          Array.from(document.querySelectorAll("div, span")).find((el) => {
            const text = el.textContent && el.textContent.toLowerCase();
            return (
              text &&
              (text.includes("invitation sent") ||
                text.includes("request sent"))
            );
          });

        if (successMessage) {
          if (statusElement)
            statusElement.textContent = "Invitation sent successfully!";
          this.sendConnectCount++;
          this.updateConnectCounts();

          // Call API to store profile, connection request, message, and prompt
          try {
            console.log("Test 1");
            const apiResponse = await APIService.addProfile(
              profile,
              this.promptSet ? this.customPrompt : null,
              this.generatedMessage,
              this.currentLinkedInProfileUrl
            );
            if (apiResponse) {
              profile.profileId = apiResponse.profileId;
              profile.connectionRequestId = apiResponse.connectionRequestId;
              profile.messageId = apiResponse.messageId;
              profile.promptId = apiResponse.promptId;
              console.log(
                `Profile stored after invitation: ProfileId=${
                  apiResponse.profileId
                }, ConnectionRequestId=${
                  apiResponse.connectionRequestId
                }, MessageId=${apiResponse.messageId || "none"}, PromptId=${
                  apiResponse.promptId || "none"
                }`
              );
              this.saveState();
            } else {
              console.error("API call to addProfile returned null");
            }
          } catch (error) {
            console.error("Failed to store profile in API:", error);
          }

          return { sent: true };
        } else {
          if (statusElement) statusElement.textContent = "Invitation sent";
          this.sendConnectCount++;
          this.updateConnectCounts();

          // Call API even if success message not found, assuming send succeeded
          try {
            console.log("Test 2");
            const apiResponse = await APIService.addProfile(
              profile,
              this.promptSet ? this.customPrompt : null,
              this.generatedMessage,
              this.currentLinkedInProfileUrl,
              statusElement.textContent,
              this.generatedInterests
            );
            if (apiResponse) {
              profile.profileId = apiResponse.profileId;
              profile.connectionRequestId = apiResponse.connectionRequestId;
              profile.messageId = apiResponse.messageId;
              profile.promptId = apiResponse.promptId;
              console.log(
                `Profile stored after invitation: ProfileId=${
                  apiResponse.profileId
                }, ConnectionRequestId=${
                  apiResponse.connectionRequestId
                }, MessageId=${apiResponse.messageId || "none"}, PromptId=${
                  apiResponse.promptId || "none"
                }`
              );
              this.saveState();
            } else {
              console.error("API call to addProfile returned null");
            }
          } catch (error) {
            console.error("Failed to store profile in API:", error);
          }

          return { sent: true };
        }
      } else if (sendButton && sendButton.disabled) {
        if (statusElement)
          statusElement.textContent =
            "Send button found but disabled - skipping";
        this.FailedConnectCount++;
        this.updateConnectCounts();
        try {
          const apiResponse = await APIService.addProfile(
            profile,
            this.promptSet ? this.customPrompt : null,
            this.generatedMessage,
            this.currentLinkedInProfileUrl,
            "Send button found but disabled - skipping",
            this.generatedInterests
          );
          if (apiResponse) {
            profile.profileId = apiResponse.profileId;
            profile.connectionRequestId = apiResponse.connectionRequestId;
            profile.messageId = apiResponse.messageId;
            profile.promptId = apiResponse.promptId;
            console.log(
              `Profile stored after invitation: ProfileId=${
                apiResponse.profileId
              }, ConnectionRequestId=${
                apiResponse.connectionRequestId
              }, MessageId=${apiResponse.messageId || "none"}, PromptId=${
                apiResponse.promptId || "none"
              }`
            );
            this.saveState();
          } else {
            console.error("API call to addProfile returned null");
          }
        } catch (error) {
          console.error("Failed to store profile in API:", error);
        }

        this.closeConnectionModal();
        return { skipped: true, reason: "send_button_disabled" };
      } else {
        if (statusElement)
          statusElement.textContent =
            "Send Invitation button not found - skipping";
        this.FailedConnectCount++;
        this.updateConnectCounts();
        try {
          console.log("Test 4");
          const apiResponse = await APIService.addProfile(
            profile,
            this.promptSet ? this.customPrompt : null,
            this.generatedMessage,
            this.currentLinkedInProfileUrl,
            "Send Invitation button not found - skipping",
            this.generatedInterests
          );
          if (apiResponse) {
            profile.profileId = apiResponse.profileId;
            profile.connectionRequestId = apiResponse.connectionRequestId;
            profile.messageId = apiResponse.messageId;
            profile.promptId = apiResponse.promptId;
            console.log(
              `Profile stored after invitation: ProfileId=${
                apiResponse.profileId
              }, ConnectionRequestId=${
                apiResponse.connectionRequestId
              }, MessageId=${apiResponse.messageId || "none"}, PromptId=${
                apiResponse.promptId || "none"
              }`
            );
            this.saveState();
          } else {
            console.error("API call to addProfile returned null");
          }
        } catch (error) {
          console.error("Failed to store profile in API:", error);
        }
        this.closeConnectionModal();
        return { skipped: true, reason: "send_button_not_found" };
      }
    }

    async clickConnectButton(menuAlreadyOpen = false) {
      const statusElement = document.getElementById("workflow-current-status");
      if (statusElement)
        statusElement.textContent = "Looking for Connect button...";

      const alreadyConnected =
        document.querySelector('[aria-label*="Connected"]') ||
        document.querySelector('[data-control-name*="connected"]') ||
        Array.from(document.querySelectorAll("span, div")).find(
          (el) =>
            el.textContent && el.textContent.toLowerCase().includes("connected")
        );

      if (alreadyConnected) {
        if (statusElement)
          statusElement.textContent = "Already connected to this profile";
        return;
      }

      let menu = null;

      if (menuAlreadyOpen) {
        const trigger = document.querySelector(
          'button[aria-label="Open actions overflow menu"], button[id^="hue-menu-trigger-"], button._overflow-menu--trigger_1xow7n'
        );
        menu = this.getOverflowMenuForButton(trigger);
      } else {
        document.body.click();
        await this.wait(500);

        const button =
          document.querySelector(
            'button[aria-label="Open actions overflow menu"]'
          ) ||
          document.querySelector('button[id^="hue-menu-trigger-"]') ||
          document.querySelector("button._overflow-menu--trigger_1xow7n");

        if (button) {
          if (statusElement)
            statusElement.textContent = "Opening three-dot menu for Connect...";
          button.click();
          await this.wait(1000);
          menu = this.getOverflowMenuForButton(button);
        } else {
          if (statusElement)
            statusElement.textContent =
              "Three-dot button not found for Connect";
          this.isProcessingThreeDotMenu = false;
          return;
        }
      }

      if (menu) {
        if (statusElement)
          statusElement.textContent = "Looking for Connect option...";
        await this.wait(500);

        const connectOption = Array.from(
          menu.querySelectorAll("a, button, div, span")
        ).find((el) => {
          const text = (el.textContent || "").toLowerCase().trim();
          return (
            text.includes("connect") &&
            !text.includes("copy") &&
            !text.includes("disconnect")
          );
        });

        if (connectOption) {
          if (statusElement) statusElement.textContent = "Clicking Connect...";
          connectOption.click();
          await this.wait(2000);

          const result = await this.fillInvitationMessage();
          if (result && result.skipped) {
            if (statusElement)
              statusElement.textContent = `Skipped - ${result.reason}`;
          }
        } else {
          if (statusElement)
            statusElement.textContent =
              "Connect option not found in menu (may already be connected)";
        }
      } else {
        if (statusElement)
          statusElement.textContent = "Menu not visible after click";
      }

      this.isProcessingThreeDotMenu = false;
    }

    async fillInvitationMessage() {
      try {
        const statusElement = document.getElementById(
          "workflow-current-status"
        );
        if (statusElement)
          statusElement.textContent = "Looking for invitation textarea...";

        await this.wait(8000);

        // Check if email is required first
        const emailInput =
          document.querySelector('input[type="email"]') ||
          document.querySelector('input[name="email"]') ||
          document.querySelector("#connect-cta-form__email");

        if (emailInput) {
          if (statusElement)
            statusElement.textContent =
              "Email required - skipping this profile";
          this.closeConnectionModal();
          return { skipped: true, reason: "email_required" };
        }

        let textarea =
          document.querySelector(
            "textarea.mt3.pv3.elevation-0dp._textarea_1jm0zx"
          ) ||
          document.querySelector(
            'textarea[id="connect-cta-form__invitation"]'
          ) ||
          document.querySelector('textarea[maxlength="300"]') ||
          document.querySelector(
            'textarea[placeholder*="accepts your invitation"]'
          ) ||
          document.querySelector('textarea[placeholder*="Bruno accepts"]') ||
          document.querySelector("div[data-test-modal] textarea") ||
          document.querySelector(".send-invite textarea");

        if (!textarea) {
          await this.wait(7000);
          textarea =
            document.querySelector("textarea") ||
            document.querySelector('input[type="text"][maxlength="300"]');
        }

        if (textarea) {
          if (statusElement)
            statusElement.textContent =
              "Found textarea, typing message word-by-word...";

          textarea.value = "";
          textarea.focus();

          const message = this.generatedMessage;
          await this.typeMessageWordByWord(textarea, message);

          textarea.dispatchEvent(new Event("change", { bubbles: true }));
          textarea.dispatchEvent(new Event("blur", { bubbles: true }));

          if (statusElement)
            statusElement.textContent = `Message typed. Waiting ${Math.round(
              this.sendDelayAfterTypingMs / 1000
            )}s before sending...`;
          await this.wait(this.sendDelayAfterTypingMs);

          return await this.clickSendInvitationButton();
        } else {
          if (statusElement)
            statusElement.textContent =
              "Invitation textarea not found - checking for popup...";

          const popup =
            document.querySelector("[data-test-modal]") ||
            document.querySelector(".send-invite") ||
            document.querySelector('[aria-labelledby*="send-invite"]');

          if (popup) {
            if (statusElement)
              statusElement.textContent = `Popup found but textarea missing - sending in ${Math.round(
                this.sendDelayAfterTypingMs / 1000
              )}s...`;
            await this.wait(this.sendDelayAfterTypingMs);
            return await this.clickSendInvitationButton();
          } else {
            if (statusElement)
              statusElement.textContent =
                "Send invitation popup not found - skipping";
            this.closeConnectionModal();
            return { skipped: true, reason: "popup_not_found" };
          }
        }
      } catch (error) {
        console.error("Error in fillInvitationMessage:", error);
        const statusElement = document.getElementById(
          "workflow-current-status"
        );
        if (statusElement)
          statusElement.textContent = "Error filling invitation message";
      }
    }

    extractLinkedInUrlFromPage() {
      try {
        const linkedinLinks = document.querySelectorAll(
          'a[href*="linkedin.com/in/"]'
        );
        for (const link of linkedinLinks) {
          if (link.href && link.href.includes("linkedin.com/in/")) {
            return link.href;
          }
        }
        const elementsWithData = document.querySelectorAll(
          "[data-linkedin-url], [data-profile-url], [data-url]"
        );
        for (const element of elementsWithData) {
          const url =
            element.getAttribute("data-linkedin-url") ||
            element.getAttribute("data-profile-url") ||
            element.getAttribute("data-url");
          if (url && url.includes("linkedin.com/in/")) {
            return url;
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    async wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async typeMessageWordByWord(textarea, message) {
      try {
        const maxlengthAttr = textarea.getAttribute("maxlength");
        const maxCharacters = maxlengthAttr ? parseInt(maxlengthAttr, 10) : 300;
        const rawWords = (message || "")
          .split(/\s+/)
          .filter((w) => w && w.length > 0);
        if (rawWords.length === 0) return;

        const wordsWithinLimit = [];
        let runningLength = 0;
        for (let i = 0; i < rawWords.length; i++) {
          const word = rawWords[i];
          const separator = i === 0 ? "" : " ";
          if (runningLength + separator.length + word.length <= maxCharacters) {
            wordsWithinLimit.push(word);
            runningLength += separator.length + word.length;
          } else {
            break;
          }
        }

        const totalWords = Math.max(1, wordsWithinLimit.length);
        const delayPerWordMs = Math.max(
          50,
          Math.floor(this.typingTotalDurationMs / totalWords)
        );

        textarea.value = "";
        textarea.dispatchEvent(new Event("input", { bubbles: true }));

        for (let i = 0; i < wordsWithinLimit.length; i++) {
          const word = wordsWithinLimit[i];
          textarea.value = i === 0 ? word : `${textarea.value} ${word}`;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
          textarea.dispatchEvent(new Event("keyup", { bubbles: true }));
          await this.wait(delayPerWordMs);
        }
      } catch (e) {
        const fallback = (message || "").slice(0, 300);
        textarea.value = fallback;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    completeWorkflow() {
      const statusElement = document.getElementById("workflow-current-status");
      const progressElement = document.getElementById("workflow-progress");

      if (statusElement) {
        statusElement.textContent = `Workflow completed! Processed ${this.profiles.length} profiles`;
        statusElement.parentElement.style.background = "#d4edda";
        statusElement.parentElement.style.color = "#155724";
      }
      if (progressElement)
        progressElement.textContent = `${this.profiles.length} / ${this.profiles.length} (Complete)`;
      this.automationRunning = false;
      this.updateButtonStates();

      const pauseBtn = document.getElementById("pause-workflow");
      const resumeBtn = document.getElementById("resume-workflow");
      if (pauseBtn) pauseBtn.style.display = "none";
      if (resumeBtn) resumeBtn.style.display = "none";

      const popup = document.getElementById("workflow-popup");
      if (popup) {
        const summaryDiv = document.createElement("div");
        summaryDiv.style.cssText = `margin-top: 20px; padding: 16px; background: #d4edda; border-radius: 8px; border: 1px solid #c3e6cb;`;
        const completedCount = this.processedProfiles.filter(
          (p) => p.status === "completed"
        ).length;
        const errorCount = this.processedProfiles.filter(
          (p) => p.status === "error"
        ).length;
        summaryDiv.innerHTML = `
                <h3 style="margin: 0 0 12px 0; color: #155724;">Workflow Summary</h3>
                <div style="color: #155724;">
                    <div>✅ Successfully processed: ${completedCount} profiles</div>
                    ${
                      errorCount > 0
                        ? `<div>❌ Errors: ${errorCount} profiles</div>`
                        : ""
                    }
                    <div style="margin-top: 12px; padding: 8px; background: #fff3cd; border-radius: 4px; color: #856404;">
                        🔄 Returning to Sales Navigator search in 5 seconds to start new collection...
                    </div>
                </div>
            `;
        popup.appendChild(summaryDiv);
      }

      // Save counters before clearing state
      const savedSendConnectCount = this.sendConnectCount;
      const savedFailedConnectCount = this.FailedConnectCount;

      localStorage.removeItem("salesNavWorkflow");
      this.currentWorkflowStep = "collecting";
      this.currentProfileIndex = 0;
      this.generatedMessage = null;
      this.processedProfiles = [];
      this.workflowPaused = false;
      this.automationRunning = false;
      this.currentLinkedInProfileUrl = null;
      this.profileStatuses = {};
      this.customPrompt = "";
      this.promptSet = false;

      // Restore counters after clearing state
      this.sendConnectCount = savedSendConnectCount;
      this.FailedConnectCount = savedFailedConnectCount;

      setTimeout(() => {
        if (statusElement) {
          statusElement.textContent =
            "Returning to Sales Navigator search page...";
        }
        // Save counters to localStorage for persistence across page navigation
        localStorage.setItem(
          "salesNavCounters",
          JSON.stringify({
            sendConnectCount: this.sendConnectCount,
            FailedConnectCount: this.FailedConnectCount,
          })
        );
        const salesNavUrl =
          "https://www.linkedin.com/sales/search/people?viewAllFilters=true";
        window.location.href = salesNavUrl;
      }, 5000);
    }
    loadSavedCounters() {
      try {
        const savedCounters = localStorage.getItem("salesNavCounters");
        if (savedCounters) {
          const counters = JSON.parse(savedCounters);
          this.sendConnectCount = counters.sendConnectCount || 0;
          this.FailedConnectCount = counters.FailedConnectCount || 0;
        }
      } catch (error) {
        console.error("Error loading saved counters:", error);
        this.sendConnectCount = 0;
        this.FailedConnectCount = 0;
      }
    }

    loadBatchSettings() {
      this.profileDelay = 8000;
    }

    closeConnectionModal() {
      // Try to close any open connection modal/dialog
      const closeButtons = [
        document.querySelector('button[aria-label*="Dismiss"]'),
        document.querySelector('button[aria-label*="Cancel"]'),
        document.querySelector('button[data-control-name="cancel"]'),
        document.querySelector(".artdeco-modal__dismiss"),
        document.querySelector("[data-test-modal-close-btn]"),
      ];

      for (const closeBtn of closeButtons) {
        if (closeBtn && closeBtn.offsetParent !== null) {
          closeBtn.click();
          break;
        }
      }
      // Also try pressing Escape key
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 27 })
      );
    }
  }

  window.SalesNavigatorFloatingUI = SalesNavigatorFloatingUI;

  if (
    typeof window.salesNavUI === "undefined" &&
    typeof window.salesNavigatorFloatingUI === "undefined" &&
    window.location.href.includes("linkedin.com") &&
    !document.querySelector(".sales-navigator-floating-ui")
  ) {
    try {
      window.salesNavUI = new SalesNavigatorFloatingUI();
    } catch (error) {
      console.error("Error creating SalesNavigatorFloatingUI instance:", error);
    }
  }
}
