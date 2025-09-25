if (window.linkedInAutomationInjected) {
  // Script already injected, exit early
} else {
  window.linkedInAutomationInjected = true;

  class LinkedInAutomation {
    constructor() {
      this.isRunning = false;
      this.currentCampaign = null;
      this.actionDelay = 30000;
      this.dailyLimit = 20;
      this.todayCount = 0;
      this.isRealTimeMode = false;
      this.isAutoCollecting = false;
      this.isAutoCollectionEnabled = true;
      this.currentPageCollected = false;
      this.autoProfileObserver = null;
      this.autoCollectionTimeout = null;
      this.processedProfiles = new Set();

      this.dynamicMessage = {
        mode: 'api',
        apiUrl: 'https://localhost:7120/api/linkedin/InboxReply',
        maxMessages: 30
      };

      // Consolidated selectors to avoid duplication
      this.PROFILE_SELECTORS = [
        "div.c2a2412c.b619b9f7._28ca1907._5f311868.a582f5c1._3a156bd9._10a87fcc.e5efaf8e.c0a5ca7f._5a2af3d2.db8addcf._5a920b17", // New LinkedIn layout
        ".reusable-search__result-container",
        "[data-chameleon-result-urn]",
        ".search-result",
        ".entity-result",
        "div[componentkey]", // Generic fallback
      ];

      this.init();
    }

    init() {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        return this.handleMessage(message, sendResponse);
      });
      this.setupAutoDetection();
      this.setupAutoPopupDetection();
      this.initSalesNavigatorUI();
      this.setupPageChangeDetection();
    }

    setupPageChangeDetection() {
      let lastUrl = location.href;
      const pageChangeObserver = new MutationObserver(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          this.handlePageChange(currentUrl);
        }
      });

      pageChangeObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });

      window.addEventListener("popstate", () => {
        setTimeout(() => this.handlePageChange(location.href), 100);
      });
    }

    handlePageChange(currentUrl) {
      try {
        if (this.isRealTimeMode && currentUrl.includes("linkedin.com")) {
          setTimeout(() => this.setupAutoDetection(), 2000);
        }

        if (
          this.isProfilePage() &&
          !this.isAutoCollecting &&
          this.isAutoCollectionEnabled
        ) {
          this.startAutoCollection();
        }

        if (!window.linkedInPageChangeHandled) {
          chrome.runtime.onMessage.addListener(
            (message, _sender, sendResponse) => {
              return this.handleMessage(message, sendResponse);
            }
          );
          window.linkedInPageChangeHandled = true;
        }
      } catch (error) {
        console.error("Error handling page change:", error);
      }
    }

    // Try to click "Load older messages" to fetch more history
    async expandConversationHistory(scope) {
      try {
        const root = scope || document;
        for (let i = 0; i < 3; i++) {
          const btn = root.querySelector('button[aria-label="Load older messages"], button:has(span._text_ps32ck)');
          if (btn && btn.offsetParent !== null && !btn.disabled) {
            try { btn.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
            await this.delay(200);
            try { btn.click(); } catch (_) {}
            await this.delay(1200);
          } else {
            break;
          }
        }
      } catch (_) {}
    }

    async initSalesNavigatorUI() {
      if (this.isSalesNavigatorSearchPage()) {
        await this.loadSalesNavigatorUI();
      }

      let lastUrl = location.href;
      const observer = new MutationObserver(async () => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;

          if (
            this.isSalesNavigatorSearchPage() &&
            !window.salesNavigatorFloatingUI &&
            !window.salesNavUI &&
            !document.querySelector(".sales-navigator-floating-ui")
          ) {
            await this.loadSalesNavigatorUI();
          } else if (!this.isSalesNavigatorSearchPage()) {
            const existingUI = document.querySelector(
              ".sales-navigator-floating-ui"
            );
            if (existingUI) {
              existingUI.remove();
            }
            if (window.salesNavigatorFloatingUI) {
              window.salesNavigatorFloatingUI = null;
            }
            if (window.salesNavUI) {
              window.salesNavUI = null;
            }
          }
        }
      });

      observer.observe(document, { subtree: true, childList: true });
    }

    async loadSalesNavigatorUI() {
      try {
        console.log("LinkedIn Automation: loadSalesNavigatorUI called");
        if (document.querySelector(".sales-navigator-floating-ui")) {
          console.log(
            "LinkedIn Automation: Sales Navigator UI already exists, skipping creation"
          );
          return;
        }

        if (window.salesNavigatorFloatingUI || window.salesNavUI) {
          console.log(
            "LinkedIn Automation: Sales Navigator instance already exists, skipping creation"
          );
          return;
        }

        if (window.SalesNavigatorFloatingUI) {
          console.log(
            "LinkedIn Automation: SalesNavigatorFloatingUI class exists, but no instance found"
          );
          return;
        }

        if (!this.isSalesNavigatorSearchPage()) {
          return;
        }

        if (document.querySelector('script[src*="sales-navigator-ui.js"]')) {
          console.log(
            "LinkedIn Automation: Sales Navigator script already loaded"
          );
          return;
        }

        const script = document.createElement("script");
        script.src = chrome.runtime.getURL("content/sales-navigator-ui.js");

        script.onload = () => {
          console.log(
            "LinkedIn Automation: Sales Navigator script loaded successfully"
          );
        };

        script.onerror = (error) => {
          console.error(
            "LinkedIn Automation: Error loading Sales Navigator UI script:",
            error
          );
        };

        document.head.appendChild(script);
      } catch (error) {
        console.error("Error loading Sales Navigator UI:", error);
      }
    }

    isSalesNavigatorSearchPage() {
      const url = window.location.href;
      return (
        url.includes("/sales/search/people") && url.includes("linkedin.com")
      );
    }

    setupAutoDetection() {
      if (this.isProfilePage() && this.isAutoCollectionEnabled) {
        setTimeout(() => this.startAutoCollection(), 2000);
      }
    }

    isProfilePage() {
      const url = window.location.href;
      if (url.includes("/in/") && !url.includes("/search/")) return false;
      return (
        url.includes("linkedin.com/search/results/people") ||
        url.includes("linkedin.com/search/people") ||
        url.includes("linkedin.com/sales/search/people") ||
        url.includes("linkedin.com/mynetwork") ||
        url.includes("linkedin.com/connections") ||
        (url.includes("linkedin.com") &&
          document.querySelector(
            ".reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result, .artdeco-entity-lockup"
          ))
      );
    }

    setupAutoPopupDetection() {
      if (document.readyState === "complete") {
        setTimeout(() => this.showAutoPopup(), 3000);
      } else {
        window.addEventListener("load", () => {
          setTimeout(() => this.showAutoPopup(), 3000);
        });
      }
    }

    showAutoPopup() {
      try {
        this.createAutoPopupNotification();
      } catch (error) {
        console.error("Error showing auto popup:", error);
      }
    }

    createAutoPopupNotification() {
      const existing = document.getElementById("linkedin-auto-popup");
      if (existing) existing.remove();

      const popup = document.createElement("div");
      popup.id = "linkedin-auto-popup";
      popup.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: linear-gradient(135deg, #0077b5 0%, #005885 100%); color: white; padding: 20px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 119, 181, 0.3); z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 350px; animation: slideIn 0.5s ease-out;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <div style="font-size: 24px; margin-right: 10px;">🚀</div>
                    <div>
                        <div style="font-weight: 600; font-size: 16px;">LinkedIn Automation Ready!</div>
                        <div style="font-size: 14px; opacity: 0.9;">Your automation tools are now active</div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="open-automation-popup" style="background: white; color: #0077b5; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; flex: 1; transition: all 0.2s;">Open Tools</button>
                    <button id="dismiss-popup" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">Dismiss</button>
                </div>
            </div>
            <style>@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }</style>
        `;

      document.body.appendChild(popup);

      popup
        .querySelector("#open-automation-popup")
        .addEventListener("click", () => {
          this.openExtensionPopup();
          popup.remove();
        });

      popup
        .querySelector("#dismiss-popup")
        .addEventListener("click", () => popup.remove());

      setTimeout(() => {
        if (popup.parentNode) popup.remove();
      }, 10000);
    }

    openExtensionPopup() {
      try {
        chrome.runtime.sendMessage({ action: "openPopup" });
      } catch (error) {
        console.error("Error opening popup:", error);
      }
    }

    async startAutoCollection() {
      if (this.isAutoCollecting) return;
      this.isAutoCollecting = true;

      try {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            action: "autoCollectionStarted",
            url: window.location.href,
          });
        }
      } catch (error) {}

      this.collectAndSendProfiles();
      this.setupContinuousMonitoring();
    }

    async collectAndSendProfiles() {
      if (!this.isAutoCollectionEnabled || !this.isRealTimeMode) return;

      let profiles = [];
      if (!window.location.href.includes("sales/search/people")) {
        profiles = await this.collectMultiplePages(4);
      } else {
        profiles = await this.collectCurrentPageOnly();
      }
      if (
        profiles.length > 0 &&
        this.isAutoCollectionEnabled &&
        this.isRealTimeMode
      ) {
        this.sendProfilesRealTime(profiles);
      }
    }

    setupContinuousMonitoring() {
      const observer = new MutationObserver((mutations) => {
        let hasNewProfiles = false;
        mutations.forEach((mutation) => {
          if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
              if (
                node.nodeType === Node.ELEMENT_NODE &&
                node.querySelectorAll
              ) {
                for (const selector of this.PROFILE_SELECTORS) {
                  if (node.querySelectorAll(selector).length > 0) {
                    hasNewProfiles = true;
                    break;
                  }
                }
              }
            });
          }
        });

        if (
          hasNewProfiles &&
          this.isAutoCollectionEnabled &&
          this.isRealTimeMode
        ) {
          clearTimeout(this.autoCollectionTimeout);
          this.autoCollectionTimeout = setTimeout(
            () => this.collectNewProfilesAuto(),
            1500
          );
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      this.autoProfileObserver = observer;
    }

    async collectNewProfilesAuto() {
      if (
        !this.isAutoCollecting ||
        !this.isAutoCollectionEnabled ||
        !this.isRealTimeMode
      )
        return;

      let profileCards = [];
      for (const selector of this.PROFILE_SELECTORS) {
        profileCards = document.querySelectorAll(selector);
        if (profileCards.length > 0) break;
      }

      const newProfiles = [];
      profileCards.forEach((card) => {
        if (card.dataset.autoProcessed) return;
        const profile = this.extractProfileFromCard(card);
        if (profile?.name && profile?.url) {
          newProfiles.push(profile);
          card.dataset.autoProcessed = "true";
        }
      });

      if (newProfiles.length > 0) this.sendProfilesRealTime(newProfiles);
    }

    stopAutoCollection() {
      this.isAutoCollecting = false;
      if (this.autoProfileObserver) {
        this.autoProfileObserver.disconnect();
        this.autoProfileObserver = null;
      }
      if (this.autoCollectionTimeout) {
        clearTimeout(this.autoCollectionTimeout);
        this.autoCollectionTimeout = null;
      }
    }

    pauseCollection() {
      this.isRealTimeMode = false;
      this.isAutoCollecting = false;
      this.isAutoCollectionEnabled = false;

      if (this.autoProfileObserver) {
        this.autoProfileObserver.disconnect();
        this.autoProfileObserver = null;
      }
      if (this.continuousMonitoringInterval) {
        clearInterval(this.continuousMonitoringInterval);
        this.continuousMonitoringInterval = null;
      }
      if (this.autoCollectionTimeout) {
        clearTimeout(this.autoCollectionTimeout);
        this.autoCollectionTimeout = null;
      }

      this.stopAllScrolling();
      this.sendCollectionStatus("Collection paused");
    }

    resumeCollection() {
      this.isRealTimeMode = true;
      this.isAutoCollecting = true;
      this.isAutoCollectionEnabled = true;
      this.setupContinuousMonitoring();
      this.collectAndSendProfiles();
      this.sendCollectionStatus("Collection resumed");
    }

    stopAllScrolling() {
      const highestTimeoutId = setTimeout(() => {}, 0);
      for (let i = 0; i < highestTimeoutId; i++) {
        clearTimeout(i);
      }
      window.scrollTo(window.scrollX, window.scrollY);
    }

    handleMessage(message, sendResponse) {
      if (!message || !message.action) {
        sendResponse({ error: "Invalid message format" });
        return;
      }

      const actions = {
        startAutomation: () => {
          this.startAutomation(message.campaign);
          sendResponse({ success: true });
        },
        startFollowUp: () => {
          this.startFollowUpFlow(message.profile)
            .then((result) => sendResponse({ success: true, result }))
            .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
          return true;
        },
        checkSalesInbox: () => {
          this.checkSalesInbox()
            .then((result) => sendResponse({ success: true, result }))
            .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
          return true;
        },
        markActiveConversationRead: () => {
          this.markActiveConversationRead()
            .then((result) => sendResponse({ success: !!result?.success, result }))
            .catch((error) => sendResponse({ success: false, error: error?.message || String(error) }));
          return true;
        },
        stopAutomation: () => {
          this.stopAutomation();
          sendResponse({ success: true });
        },
        getPageInfo: () => sendResponse(this.getPageInfo()),
        collectProfiles: () => {
          this.collectProfiles().then((profiles) => sendResponse({ profiles }));
          return true;
        },
        sendDirectMessage: () => {
          this.handleDirectMessage(
            message.message,
            message.profileName,
            message.profileUrl
          );
          sendResponse({ success: true });
        },
        showAutoPopup: () => {
          this.showAutoPopup();
          sendResponse({ success: true });
        },
        startRealTimeCollection: () => {
          this.isRealTimeMode = true;
          this.currentPageCollected = false;
          setTimeout(() => {
            this.collectCurrentPageOnly()
              .then((profiles) => {
                if (profiles.length > 0) {
                  this.sendProfilesRealTime(profiles);
                  this.currentPageCollected = true;
                } else {
                  const alternativeProfiles = this.extractProfilesAlternative();
                  if (alternativeProfiles.length > 0) {
                    this.sendProfilesRealTime(alternativeProfiles.slice(0, 10));
                  }
                }
              })
              .catch((error) =>
                console.error("Error in real-time collection:", error)
              );
          }, 1000);
          sendResponse({ success: true });
          return true;
        },
        startMultiPageCollection: () => {
          this.isRealTimeMode = true;
          const maxPages = message.maxPages || 4;
          setTimeout(() => {
            this.collectMultiplePages(maxPages)
              .then((profiles) => {
                sendResponse({ success: true, totalProfiles: profiles.length });
              })
              .catch((error) => {
                sendResponse({ success: false, error: error.message });
              });
          }, 1000);
          return true;
        },
        stopRealTimeCollection: () => {
          this.isRealTimeMode = false;
          this.currentPageCollected = false;
          sendResponse({ success: true });
          return true;
        },
        stopAutoCollection: () => {
          this.stopAutoCollection();
          sendResponse({ success: true });
          return true;
        },
        startAutoCollection: () => {
          if (!this.isAutoCollecting && this.isAutoCollectionEnabled)
            this.startAutoCollection();
          sendResponse({ success: true });
          return true;
        },
        enableAutoCollection: () => {
          this.isAutoCollectionEnabled = true;
          if (this.isProfilePage() && !this.isAutoCollecting)
            this.startAutoCollection();
          sendResponse({ success: true });
          return true;
        },
        pauseCollection: () => {
          this.pauseCollection();
          sendResponse({ success: true });
          return true;
        },
        resumeCollection: () => {
          this.resumeCollection();
          sendResponse({ success: true });
          return true;
        },
        disableAutoCollection: () => {
          this.isAutoCollectionEnabled = false;
          this.stopAutoCollection();
          sendResponse({ success: true });
          return true;
        },
        searchByCompany: () => {
          this.searchByCompany(message.companyName).then((result) =>
            sendResponse(result)
          );
          return true;
        },
        searchNetwork: () => {
          this.searchNetwork(message.criteria)
            .then((profiles) => {
              sendResponse({ profiles: profiles || [] });
            })
            .catch((error) => {
              sendResponse({ profiles: [], error: error.message });
            });
          return true;
        },
        scrapeConnections: () => {
          this.scrapeConnections().then((connections) => {
            console.log(
              `Scraped connections test function: ${JSON.stringify(
                connections
              )}`
            );
            sendResponse({ connections });
          });
          return true;
        },
      };

      return actions[message.action]
        ? actions[message.action]()
        : sendResponse({ error: "Unknown action: " + message.action });
    }

    async checkSalesInbox() {
      try {
        if (!location.href.includes("linkedin.com/sales/inbox/2")) {
          return { skipped: true, reason: "Not on Sales Navigator inbox page" };
        }

        const listSelectorCandidates = [
          'div.artdeco-entity-lockup__content',
          '.conversation-list-item__main-content',
          'div[data-test-conversation-list-item]',
          'a.msg-conversation-card',
          'li.msg-conversations-container__convo-item',
        ];

        let attempts = 0;
        let items = [];
        while (attempts < 15) {
          items = this.findSalesInboxItems(listSelectorCandidates);
          if (items.length > 0) break;
          await this.delay(500);
          attempts++;
        }

        if (items.length === 0) {
          return { found: 0, clicked: false };
        }

        items = items.map((el) => this.getSalesInboxRow(el)).filter(Boolean);
        const seen = new Set();
        items = items.filter((el) => { if (seen.has(el)) return false; seen.add(el); return true; });
        items = items.filter((el) => this.isVisible(el));

        const unreadItems = items.filter((el) => this.isSalesInboxItemUnread(el));
        if (unreadItems.length === 0) {
          return { found: items.length, foundVisible: items.length, clicked: false, unreadFound: 0, unreadFoundVisible: 0 };
        }

        const unreadWithInfo = unreadItems.map((el) => ({
          el,
          info: this.extractSalesInboxItemInfo(el),
          top: (el.getBoundingClientRect ? el.getBoundingClientRect().top : Number.MAX_SAFE_INTEGER)
        }));
        unreadWithInfo.sort((a, b) => a.top - b.top);

        const clickedItems = [];
        let sentCount = 0;
        for (const u of unreadWithInfo) {
          const target = u.el;
          const clickable = target.closest('a') || target.querySelector('a') || target;
          clickedItems.push(u.info);
          if (clickable && typeof clickable.click === 'function') {
            clickable.click();
          } else {
            target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
          await this.delay(800);
          const input = await this.findMessageInput();
          if (input) {
            if (input.isContentEditable || input.contentEditable === 'true') {
              input.textContent = '';
            } else if ('value' in input) {
              input.value = '';
            }
            const dynamicMsg = await this.generateDynamicMessageForInbox(u.info).catch(() => null);
            const messageToSend = (dynamicMsg && typeof dynamicMsg === 'string' && dynamicMsg.trim())
              ? dynamicMsg.trim()
              : 'Hi there!';
            await this.typeWordsWithDelay(input, messageToSend, 120);
            await this.delay(300);
            await this.clickSendButton();
            sentCount++;
            // Ensure this conversation is marked as read to avoid reprocessing
            await this.ensureConversationMarkedRead(target);
            // Backup: also attempt to mark the active conversation as read
            await this.markActiveConversationRead();
          }

          await this.delay(400);
        }
        return {
          found: items.length,
          foundVisible: items.length,
          clicked: true,
          clickedCount: clickedItems.length,
          sentCount,
          unreadPreferred: true,
          unreadFound: unreadItems.length,
          unreadFoundVisible: unreadItems.length,
          unreadItems: unreadWithInfo.map(u => u.info),
          clickedItems,
          item: clickedItems[0] || null,
        };
      } catch (err) {
        throw err;
      }
    }

    findSalesInboxItems(selectorCandidates) {
      for (const selector of selectorCandidates) {
        const nodes = Array.from(document.querySelectorAll(selector));
        const filtered = nodes
          .filter((n) =>
            n.querySelector('[data-anonymize="person-name"], .t-16, .msg-conversation-card__participant-names') ||
            n.querySelector('[data-anonymize="general-blurb"], .t-14, .msg-conversation-card__message-snippet')
          )
          .map((n) => this.getSalesInboxRow(n))
          .filter(Boolean);
        if (filtered.length > 0) return filtered;
      }
      const fallbacks = Array.from(document.querySelectorAll('div.artdeco-entity-lockup, li, a'))
        .filter((n) =>
          (n.className || '').toString().includes('conversation') || (n.className || '').toString().includes('entity-lockup')
        )
        .map((n) => this.getSalesInboxRow(n))
        .filter(Boolean);
      return fallbacks;
    }

    getSalesInboxRow(el) {
      if (!el || el.nodeType !== 1) return null;
      return (
        el.closest('li.conversation-list-item') ||
        el.closest('a.conversation-list-item__link') ||
        el.closest('a.msg-conversation-card') ||
        el.closest('li.msg-conversations-container__convo-item') ||
        el.closest('div.artdeco-entity-lockup') ||
        el
      );
    }

    isVisible(el) {
      if (!el) return false;
      const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      const hasSize = rect ? (rect.width > 0 && rect.height > 0) : true;
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      const notHidden = style ? (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') : true;
      return hasSize && notHidden;
    }

    isSalesInboxItemUnread(el) {
      try {
        const activeAncestor = el.closest('li.conversation-list-item, a.conversation-list-item__link, li, a');
        if (activeAncestor) {
          const anchor = activeAncestor.matches('a') ? activeAncestor : activeAncestor.querySelector('a');
          if (anchor && /\bactive\b/.test(anchor.className || '')) return false;
        }
        const rootItem = el.closest('li.conversation-list-item') || el.closest('li') || el;
        if (rootItem && /\bis-unread\b/.test(rootItem.className || '')) return true;
        if (rootItem) {
          const hasMarkRead = rootItem.querySelector('button[data-control-name="mark_read"]');
          const hasMarkUnread = rootItem.querySelector('button[data-control-name="mark_unread"]');
          if (hasMarkRead) return true;      
          if (hasMarkUnread) return false;  
        }

        if (
          el.querySelector(
            '[data-qa="unread-badge"], .msg-conversation-card__unread-count, .notification-badge, .artdeco-badge, .conversation-list-item__unread, .conversation-list-item__unread-indicator, .conversation-list-item__badge, [data-unread="true"], [aria-current="unread"]'
          )
        ) {
          return true;
        }
        const classHasUnread = !!el.querySelector('[class*="unread"]');
        if (classHasUnread) return true;
        const isSelected = el.getAttribute('aria-selected') === 'true' || /\bselected\b/i.test(el.className || '');
        if (!isSelected) {
          const previewEl = el.querySelector('[data-anonymize="general-blurb"], .t-14, .msg-conversation-card__message-snippet');
          const isBold = (node) => node && (getComputedStyle(node).fontWeight === '700' || parseInt(getComputedStyle(node).fontWeight, 10) >= 600);
          if (isBold(previewEl)) return true;
        }
        
        const containerWithAria = el.closest('[aria-label]') || el;
        const aria = containerWithAria.getAttribute('aria-label') || '';
        if (/\bunread\b/i.test(aria)) return true;
      } catch (_) {}
      return false;
    }

    async markActiveConversationRead(timeoutMs = 5000) {
      try {
        const activeLink = document.querySelector('a.conversation-list-item__link.active');
        const li = (activeLink && activeLink.closest('li.conversation-list-item')) || null;
        const fallbackLi = li || document.querySelector('li.conversation-list-item');
        const target = fallbackLi || activeLink || null;
        if (!target) return { success: false, reason: 'No active conversation row found' };
        if (!/\bis-unread\b/.test((fallbackLi || {}).className || '')) {
          const hasMarkUnread = fallbackLi && fallbackLi.querySelector('button[data-control-name="mark_unread"]');
          if (hasMarkUnread) return { success: true, alreadyRead: true };
        }
        const markReadBtn = (fallbackLi && fallbackLi.querySelector('button[data-control-name="mark_read"]'))
          || document.querySelector('button[data-control-name="mark_read"]');
        if (markReadBtn && !markReadBtn.disabled) {
          try { markReadBtn.click(); } catch (_) {}
        }

        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          await this.delay(250);
          const freshActiveLink = document.querySelector('a.conversation-list-item__link.active');
          const freshLi = (freshActiveLink && freshActiveLink.closest('li.conversation-list-item')) || fallbackLi;
          if (freshLi && !/\bis-unread\b/.test((freshLi.className || ''))) {
            const hasMarkUnreadNow = freshLi.querySelector('button[data-control-name="mark_unread"]');
            if (hasMarkUnreadNow) return { success: true, marked: true };
            return { success: true, marked: true };
          }
        }
        return { success: false, timeout: true };
      } catch (err) {
        return { success: false, error: err?.message || String(err) };
      }
    }

    async ensureConversationMarkedRead(targetEl, timeoutMs = 5000) {
      try {
        let row = this.getSalesInboxRow(targetEl) || targetEl;
        if (!row) {
          const activeLink = document.querySelector('a.conversation-list-item__link.active');
          row = (activeLink && activeLink.closest('li.conversation-list-item')) || activeLink || null;
        }
        const li = row.closest('li.conversation-list-item') || row.closest('li') || row;
        const start = Date.now();
        if (li && !/\bis-unread\b/.test(li.className || '')) return true;
        try { (li || row).scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
        try { (li || row).dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); } catch (_) {}
        try { (li || row).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); } catch (_) {}
        const findMarkRead = () => {
          if (!document) return null;
          const scope = li || document;
          const direct = (
            scope.querySelector('button[data-control-name="mark_read"]') ||
            scope.querySelector('button[aria-describedby*="mark-as-read"]')
          );
          if (direct) return direct;
          const buttons = Array.from(scope.querySelectorAll('button'));
          return buttons.find(b => ((b.textContent || '').toLowerCase().includes('mark message as read')) ) || null;
        };

        let markReadBtn = findMarkRead();
        if (markReadBtn && !markReadBtn.disabled) {
          try { markReadBtn.click(); } catch (_) {}
        } else {
          await this.delay(200);
          markReadBtn = findMarkRead();
          if (markReadBtn && !markReadBtn.disabled) {
            try { markReadBtn.click(); } catch (_) {}
          }
        }

        while (Date.now() - start < timeoutMs) {
          await this.delay(300);
          if (li && !/\bis-unread\b/.test(li.className || '')) return true;
          const hasMarkUnreadNow = li && li.querySelector('button[data-control-name="mark_unread"]');
          if (hasMarkUnreadNow) return true;
        }
      } catch (_) {}
      return false;
    }

    extractSalesInboxItemInfo(el) {
      const name = (el.querySelector('[data-anonymize="person-name"], .t-16, .msg-conversation-card__participant-names') || {}).textContent?.trim() || '';
      const preview = (el.querySelector('[data-anonymize="general-blurb"], .t-14, .msg-conversation-card__message-snippet') || {}).textContent?.trim() || '';
      const time = (el.querySelector('time, .conversation-list-item__timestamp, .msg-conversation-card__time-stamp') || {}).textContent?.trim() || '';
      return { name, preview, time };
    }

    async scrapeConnections() {
      try {

        console.log("🚀 Starting LinkedIn connection scraper...");
        const connectionCards = document.querySelectorAll( '[data-view-name="connections-profile"]');

        if (connectionCards.length === 0) {
          console.warn("⚠️ No connection cards found on the connections page.");
          chrome.runtime.sendMessage({
            action: "scrapeConnectionsResponse",
            connections: [],
            warning: "No connection cards found",
          });
          return [];
        }

        let scrapedConnections = [];

        connectionCards.forEach((card, index) => {
          try {
            const profileLink = card.getAttribute("href");
            if (!profileLink) {
              console.warn(`❌ No profile link found in card #${index}`);
              return;
            }

            const url = profileLink.split("?")[0];
            let date = null;
            const parentDiv = card.closest("div");
            if (parentDiv) {
              const paragraphs = [...parentDiv.querySelectorAll("p")];
              const dateP = paragraphs.find((p) => p.innerText.includes("Connected on"));
              if (dateP) {
                date = dateP.innerText.replace("Connected on", "").trim();
              } else {
                console.warn(
                  `   ⚠️ No "Connected on ..." text found for card #${index}`
                );
              }
            }

            scrapedConnections.push({url, date });
          } catch (err) {
            console.error(`💥 Error parsing card #${index}:`, err);
          }
        });
        
        const uniqueConnections = {};
        scrapedConnections.forEach((conn) => {
          if (
            !uniqueConnections[conn.url] ||
            (conn.date &&
              new Date(conn.date) > new Date(uniqueConnections[conn.url].date))
          ) {
            uniqueConnections[conn.url] = conn;
          }
        });

        const finalConnections = Object.values(uniqueConnections);

        console.log("✅ Final scraped connections:", finalConnections);

        chrome.runtime.sendMessage({
          action: "scrapeConnectionsResponse",
          connections: finalConnections,
        });

        return finalConnections;
      } catch (err) {
        console.error("💥 Failed to scrape connections:", err);
        chrome.runtime.sendMessage({
          action: "scrapeConnectionsResponse",
          connections: [],
          error: err.message || "Unknown error",
        });
        return [];
      }
    }

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    isSearchResultsPage() {
      return (
        window.location.href.includes("/search/people/") ||
        window.location.href.includes("/search/results/people/") ||
        window.location.href.includes("/sales/search/people")
      );
    }

    startAutomationFromPage() {
      if (this.todayCount >= this.dailyLimit) return;
      this.isRunning = true;
      this.processConnections();
    }

    async processConnections() {
      if (!this.isRunning) return;
      const connectButtons = this.findConnectButtons();
      if (connectButtons.length === 0) {
        this.stopAutomation();
        return;
      }

      for (let i = 0; i < connectButtons.length && this.isRunning; i++) {
        if (this.todayCount >= this.dailyLimit) break;
        const button = connectButtons[i];
        const personInfo = this.extractPersonInfo(button);

        try {
          await this.sendConnectionRequest(button, personInfo);
          this.todayCount++;
          if (i < connectButtons.length - 1) await this.delay(this.actionDelay);
        } catch (error) {
          console.error("Error sending connection request:", error);
        }
      }
      this.stopAutomation();
    }

    findConnectButtons() {
      const selectors = [
        'button[aria-label*="Connect"]',
        'button[data-control-name="connect"]',
        '.search-result__actions button[aria-label*="Invite"]',
      ];
      const buttons = [];
      selectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
          if (
            (el.textContent.includes("Connect") ||
              el.getAttribute("aria-label")?.includes("Connect")) &&
            el.offsetParent !== null
          ) {
            buttons.push(el);
          }
        });
      });
      return buttons;
    }

    extractPersonInfo(connectButton) {
      const resultCard =
        connectButton.closest(".search-result") ||
        connectButton.closest(".reusable-search__result-container") ||
        connectButton.closest("[data-chameleon-result-urn]");
      let name = "Unknown",
        company = "",
        title = "";

      if (resultCard) {
        const nameElement =
          resultCard.querySelector(".entity-result__title-text a") ||
          resultCard.querySelector(".search-result__result-link") ||
          resultCard.querySelector('[data-anonymize="person-name"]');
        if (nameElement) name = nameElement.textContent.trim();

        const subtitleElement =
          resultCard.querySelector(".entity-result__primary-subtitle") ||
          resultCard.querySelector(".search-result__truncate");
        if (subtitleElement) title = subtitleElement.textContent.trim();
      }
      return { name, company, title };
    }

    async sendConnectionRequest(button, personInfo) {
      return new Promise((resolve, reject) => {
        try {
          button.click();
          setTimeout(() => {
            const sendButton =
              document.querySelector(
                'button[aria-label*="Send without a note"]'
              ) ||
              document.querySelector(
                'button[data-control-name="send_invite"]'
              ) ||
              document.querySelector(
                '.send-invite__actions button[aria-label*="Send"]'
              );

            if (sendButton) {
              sendButton.click();
              resolve();
            } else {
              const addNoteButton = document.querySelector(
                'button[aria-label*="Add a note"]'
              );
              if (addNoteButton) {
                addNoteButton.click();
                setTimeout(
                  () => this.sendCustomMessage(personInfo, resolve, reject),
                  1000
                );
              } else {
                reject(new Error("Could not find send button"));
              }
            }
          }, 1000);
        } catch (error) {
          reject(error);
        }
      });
    }

    async sendCustomMessage(personInfo, resolve, reject) {
      try {
        const messageTemplate = "Hi {firstName}, I'd love to connect with you!";
        const personalizedMessage = this.personalizeMessage(
          messageTemplate,
          personInfo
        );
        const messageTextarea =
          document.querySelector("#custom-message") ||
          document.querySelector('textarea[name="message"]') ||
          document.querySelector(".send-invite__custom-message textarea");

        if (messageTextarea) {
          messageTextarea.value = personalizedMessage;
          messageTextarea.dispatchEvent(new Event("input", { bubbles: true }));

          setTimeout(() => {
            const sendButton =
              document.querySelector('button[aria-label*="Send invitation"]') ||
              document.querySelector(
                '.send-invite__actions button[aria-label*="Send"]'
              );
            if (sendButton) {
              sendButton.click();
              resolve();
            } else {
              reject(
                new Error("Could not find send button for custom message")
              );
            }
          }, 500);
        } else {
          reject(new Error("Could not find message textarea"));
        }
      } catch (error) {
        reject(error);
      }
    }

    personalizeMessage(template, personInfo) {
      const firstName = personInfo.name.split(" ")[0];
      const lastName = personInfo.name.split(" ").slice(1).join(" ");
      return template
        .replace(/{firstName}/g, firstName)
        .replace(/{lastName}/g, lastName)
        .replace(/{fullName}/g, personInfo.name)
        .replace(/{company}/g, personInfo.company)
        .replace(/{title}/g, personInfo.title);
    }

    startAutomation(campaign) {
      this.currentCampaign = campaign;
      this.startAutomationFromPage();
    }

    stopAutomation() {
      this.isRunning = false;
    }

    async closeChatWindow() {
      try {
        const primarySelectors = [
          'button svg[data-test-icon="close-small"]',
          'button .artdeco-button__icon[data-test-icon="close-small"]',
          '[data-test-icon="close-small"]',
        ];
        const fallbackSelectors = [
          ".msg-overlay-bubble-header__control--close",
          '.msg-overlay-bubble-header__control[aria-label*="Close"]',
          '.msg-overlay-bubble-header button[aria-label*="Close"]',
          ".msg-overlay-bubble-header .artdeco-button--circle",
          'button[aria-label="Close conversation"]',
          ".msg-overlay-bubble-header button:last-child",
        ];

        for (let attempt = 0; attempt < 5; attempt++) {
          for (const selector of primarySelectors) {
            const closeIcon = document.querySelector(selector);
            if (closeIcon) {
              const closeButton = closeIcon.closest("button");
              if (
                closeButton &&
                closeButton.offsetParent !== null &&
                !closeButton.disabled
              ) {
                closeButton.click();
                await this.delay(500);
                return true;
              }
            }
          }

          for (const selector of fallbackSelectors) {
            const closeButton = document.querySelector(selector);
            if (
              closeButton &&
              closeButton.offsetParent !== null &&
              !closeButton.disabled
            ) {
              closeButton.click();
              await this.delay(500);
              return true;
            }
          }
          await this.delay(1000);
        }
        return false;
      } catch (error) {
        console.error("Error closing chat window:", error);
        return false;
      }
    }

    async handleDirectMessage(message) {
      try {
        await this.delay(2000);
        const messageButton = await this.findMessageButton();
        if (messageButton) {
          messageButton.click();
          await this.delay(4000);
          const messageInput = await this.findMessageInput();
          if (!messageInput) return;

          await this.pasteMessageDirectly(messageInput, message);
          await this.delay(1000);
          if (!messageInput.textContent.trim() && !messageInput.value) {
            await this.pasteUsingClipboard(messageInput, message);
          }
          await this.delay(500);
          if (!messageInput.textContent.trim() && !messageInput.value) {
            messageInput.textContent = message;
            messageInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          await this.clickSendButton();
          await this.delay(2000);
          await this.closeChatWindow();
          await this.delay(1000);
        }
      } catch (error) {}
    }

    async findMessageButton() {
      await this.delay(2000);
      const selectors = [
        // Sales Navigator specific patterns
        'button[data-anchor-send-inmail]',
        'button[aria-label^="Message "]',
        'button._message-cta_1xow7n',
        'button[id^="ember"][aria-label^="Message "]',
        // General/consumer LinkedIn patterns
        'button[aria-label*="Message"]:not([aria-label*="Send"]):not([aria-label*="Share"])',
        'button[data-control-name="message"]',
        '.pv-s-profile-actions button[aria-label*="Message"]',
        '.pvs-profile-actions__action button[aria-label*="Message"]',
        ".message-anywhere-button",
        'a[data-control-name="message"]',
      ];

      for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (button) {
          const text = button.textContent.toLowerCase().trim();
          const ariaLabel =
            button.getAttribute("aria-label")?.toLowerCase() || "";
          if (
            !text.includes("send") &&
            !text.includes("share") &&
            !ariaLabel.includes("send") &&
            !ariaLabel.includes("share") &&
            !ariaLabel.includes("post")
          ) {
            return button;
          }
        }
      }

      const buttons = document.querySelectorAll("button, a");
      for (const button of buttons) {
        const text = button.textContent.toLowerCase().trim();
        const ariaLabel =
          button.getAttribute("aria-label")?.toLowerCase() || "";
        if (
          (text === "message" || ariaLabel.includes("message")) &&
          !ariaLabel.includes("send") &&
          !ariaLabel.includes("share") &&
          !ariaLabel.includes("post") &&
          !text.includes("send") &&
          !text.includes("share") &&
          !text.includes("more")
        ) {
          return button;
        }
      }
      return null;
    }

    async pasteMessageDirectly(messageInput, message) {
      if (!messageInput) return;
      messageInput.focus();
      await this.delay(500);

      if (messageInput.contentEditable === "true") {
        messageInput.innerHTML = `<p>${message}</p>`;
        const range = document.createRange();
        const selection = window.getSelection();
        const textNode = messageInput.querySelector("p") || messageInput;
        range.selectNodeContents(textNode);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        messageInput.value = message;
      }

      const events = [
        new Event("focus", { bubbles: true }),
        new Event("input", { bubbles: true }),
        new Event("change", { bubbles: true }),
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
        new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }),
      ];
      for (const event of events) {
        messageInput.dispatchEvent(event);
        await this.delay(100);
      }
      messageInput.focus();
      await this.delay(1000);
    }

    async pasteUsingClipboard(messageInput, message) {
      try {
        messageInput.focus();
        await this.delay(300);
        messageInput.textContent = "";
        await navigator.clipboard.writeText(message);
        await this.delay(200);

        const pasteEvent = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        });
        pasteEvent.clipboardData.setData("text/plain", message);
        messageInput.dispatchEvent(pasteEvent);
        messageInput.dispatchEvent(new Event("input", { bubbles: true }));
        messageInput.dispatchEvent(new Event("change", { bubbles: true }));
        await this.delay(500);
      } catch (error) {
        messageInput.textContent = message;
        messageInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    async findMessageInput() {
      const selectors = [
        // Sales Navigator textarea
        'textarea[name="message"]',
        'textarea[aria-label*="Type your message here"]',
        // Standard LinkedIn contenteditable inputs
        ".msg-form__contenteditable",
        '.msg-form__msg-content-container div[contenteditable="true"]',
        'div[data-placeholder*="message"]',
        ".compose-form__message-field",
        'div[contenteditable="true"][data-placeholder]',
        '.msg-form__msg-content-container--scrollable div[contenteditable="true"]',
        '.msg-form__placeholder + div[contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        '.msg-form div[contenteditable="true"]',
      ];

      for (let attempt = 0; attempt < 8; attempt++) {
        for (const selector of selectors) {
          const input = document.querySelector(selector);
          if (input && input.offsetParent !== null &&
            (
              input.isContentEditable === true ||
              input.tagName === 'TEXTAREA' ||
              input.tagName === 'INPUT'
            )
          ) {
            console.debug('[FollowUp] Found message input via selector:', selector);
            return input;
          }
        }

        const allContentEditables = document.querySelectorAll(
          'div[contenteditable="true"]'
        );
        for (const element of allContentEditables) {
          if (element.offsetParent === null) continue;
          const placeholder =
            element.getAttribute("data-placeholder") ||
            element.getAttribute("aria-label") ||
            element.getAttribute("placeholder");
          if (placeholder && placeholder.toLowerCase().includes("message"))
            return element;
          const parentContainer = element.closest(".msg-form, .compose-form");
          if (parentContainer) return element;
        }

        // Fallback: try any visible textarea that looks like a message box
        const textareas = document.querySelectorAll('textarea');
        for (const ta of textareas) {
          if (ta.offsetParent === null) continue;
          const aria = (ta.getAttribute('aria-label') || '').toLowerCase();
          const ph = (ta.getAttribute('placeholder') || '').toLowerCase();
          const name = (ta.getAttribute('name') || '').toLowerCase();
          if (
            name === 'message' ||
            aria.includes('type your message') ||
            ph.includes('message')
          ) {
            console.debug('[FollowUp] Fallback found textarea as message input');
            return ta;
          }
        }
        await this.delay(1000);
      }
      return null;
    }

    async typeText(element, text) {
      if (element.contentEditable === "true") {
        element.focus();
        if (!element.textContent.trim()) element.textContent = "";
        element.textContent += text;

        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);

        element.dispatchEvent(new Event("focus", { bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
      } else {
        element.focus();
        const current = typeof element.value === 'string' ? element.value : '';
        element.value = current + text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }
    }

    async clickSendButton() {
      await this.delay(2000);
      const sendSelectors = [
        // Sales Navigator specific
        'button._button_fx0fxz[data-sales-action]',
        'button[data-sales-action]',
        'button._button_fx0fxz',
        'button[id^="ember"][aria-disabled="false"]',
        // Standard LinkedIn
        ".msg-form__send-button",
        'button[type="submit"]',
        '.msg-form button[type="submit"]',
        'button[data-control-name="send"]',
        'button[aria-label*="Send"]:not([aria-label*="options"])',
        ".compose-form__send-button",
        ".msg-form__send-btn",
      ];

      const isButtonEnabled = (btn) => {
        if (!btn) return false;
        const ariaDisabled = btn.getAttribute('aria-disabled');
        const isAriaDisabled = ariaDisabled === 'true';
        return (
          !btn.disabled &&
          !isAriaDisabled &&
          btn.offsetParent !== null &&
          btn.offsetWidth > 0 &&
          btn.offsetHeight > 0
        );
      };

      for (let attempt = 0; attempt < 10; attempt++) {
        for (const selector of sendSelectors) {
          const button = document.querySelector(selector);
          if (button && isButtonEnabled(button)) {
            const text = button.textContent.toLowerCase().trim();
            const ariaLabel =
              button.getAttribute("aria-label")?.toLowerCase() || "";
            if (!text.includes("options") && !ariaLabel.includes("options")) {
              try { button.scrollIntoView({ behavior: 'instant', block: 'center' }); } catch (_) {}
              await this.delay(200);
              try { button.click(); } catch (_) {}
              await this.delay(400);
              try {
                button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              } catch (_) {}
              await this.delay(800);
              return;
            }
          }
        }

        const buttons = document.querySelectorAll("button");
        for (const button of buttons) {
          const text = button.textContent.toLowerCase().trim();
          const ariaLabel =
            button.getAttribute("aria-label")?.toLowerCase() || "";
          if (
            (text === "send" || text.includes("send")) &&
            !text.includes("options") &&
            !ariaLabel.includes("options") &&
            !button.disabled &&
            button.offsetParent !== null &&
            button.offsetWidth > 0 &&
            button.offsetHeight > 0
          ) {
            button.click();
            await this.delay(1000);
            return;
          }
        }
        await this.delay(500);
      }
    }

    async startFollowUpFlow(profile) {
      try {
        console.log("[FollowUp] Starting follow-up flow with profile:", profile);

        await this.delay(5000);
        const messageButton = await this.findMessageButton();
        if (!messageButton) {
          throw new Error("Message button not found");
        }
        messageButton.click();
        await this.delay(4000);

        const followUpText = await this.generateFollowUpMessage(profile);

        if (!followUpText || typeof followUpText !== "string") {
          throw new Error("Follow-up text not received from API");
        }

        // 4) Find input and type word-by-word
        const messageInput = await this.findMessageInput();
        if (!messageInput) {
          throw new Error("Message input not found");
        }

        // Clear any pre-filled text
        if (messageInput.contentEditable === "true") {
          messageInput.textContent = "";
        } else if ("value" in messageInput) {
          messageInput.value = "";
        }

        await this.typeWordsWithDelay(messageInput, followUpText, 150);

        // 5) Wait 10 seconds then send
        await this.delay(10000);
        //await this.clickSendButton();

        console.log("[FollowUp] Message sent successfully.");
        try {
          const logApiUrl = "https://localhost:7120/api/linkedin/FollowUp-log";
          const logPayload = {
            profileUrl: profile?.url || profile?.profileUrl || "",
            followUp: followUpText,
          };
          await fetch(logApiUrl, {
            method: "POST",
            headers: {
              Accept: "*/*",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(logPayload),
          });
          console.log("[FollowUp] Log stored successfully.");
        } catch (logErr) {
          console.warn("[FollowUp] Failed to store log:", logErr);
        }
        return { success: true };
      } catch (err) {
        console.error("[FollowUp] Error in startFollowUpFlow:", err);
        return { success: false, error: err?.message || String(err) };
      }
    }

    async generateFollowUpMessage(profile) {
      try {
        const apiUrl = "https://localhost:7120/api/linkedin/FollowUp";
        const payload = {
          name: profile?.name || "",
          title: profile?.title || "",
          url: profile?.url || profile?.profileUrl || "",
          location: profile?.location || "",
          interests: profile?.interests || "",
          previousMessage: profile?.previousMessage || "",
        };

        console.log("[FollowUp] Requesting follow-up from:", apiUrl, payload);

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Accept": "*/*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`FollowUp API failed: ${res.status}`);
        }

        const text = await res.text();
        let messageText = text;
        try {
          const json = this.safeJsonParse(text);
          if (json) {
            messageText = json.message || json.text || json.content || JSON.stringify(json);
          }
        } catch (_) {}

        if (!messageText || typeof messageText !== "string") {
          throw new Error("No message content returned by API");
        }

        return messageText.trim();
      } catch (err) {
        console.warn("[FollowUp] Using fallback message due to error:", err);
        const name = (profile?.name || "there").split(" ")[0];
        const title = profile?.title ? ` about your work as ${profile.title}` : "";
        return `Hi ${name}, just following up on my previous note${title}. Would love to connect and explore if there's a fit to help you. Cheers!`;
      }
    }

    async getActiveConversationMessages(maxCount = 8) {
      try {
        const containers = [
          'section.message-container-align',
          'section.thread-container',
          'section[data-lss-force-hue-theme]',
          'div.msg-s-message-listcontainer',
          'div.msg-s-message-list__container',
        ];
        let root = null;
        for (const sel of containers) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) { root = el; break; }
        }
        if (!root) root = document;

        await this.expandConversationHistory(root);

        const nodes = Array.from(root.querySelectorAll(
          'article[tabindex="0"], article.relative, article.mt4, li .msg-s-message-list__event'
        ));

        let currentDateText = '';
        const messages = [];
        const boundarySelectors = [
          '.message-item__date-boundary time',
          'div.message-item__date-boundary time',
          'time.t-12.t-black--light.t-bold.text-uppercase'
        ];

        const listContainer = root.querySelector('ul.list-style-none') || root;
        const walkerNodes = listContainer ? Array.from(listContainer.querySelectorAll('*')) : nodes;
        for (const el of walkerNodes) {
          if (boundarySelectors.some(sel => el.matches?.(sel))) {
            currentDateText = (el.textContent || '').trim();
            continue;
          }
          if (!nodes.includes(el)) continue;

          let sender = '';
          const isYou = !!el.querySelector('address span[aria-label="Message from you"], address .a11y-text, address span[aria-label="Message from you"]');
          if (isYou) {
            sender = 'you';
          } else {
            const nameEl = el.querySelector('address [data-anonymize="person-name"], address span[aria-label^="Message from"], address span');
            sender = (nameEl?.textContent || '').trim() || 'other';
            if (/^you$/i.test(sender)) sender = 'you';
          }

          const p = el.querySelector('div.message-content p, p[data-anonymize="general-blurb"], p.t-14, .message-content [data-anonymize="general-blurb"], .message-content');
          const text = (p?.textContent || '').replace(/<!---->/g, '').trim();
          if (!text) continue;

          const tEl = el.querySelector('time.t-12.t-black--light, time');
          const timeText = (tEl?.textContent || '').trim();

          messages.push({ sender, text, time: timeText || currentDateText || '' });
          if (messages.length >= maxCount) break;
        }

        return messages.slice(-maxCount);
      } catch (_) {
        return [];
      }
    }

    async generateDynamicMessageForInbox(itemInfo) {
      const maxMsgs = Math.max(1, Math.min(100, this.dynamicMessage?.maxMessages || 30));
      const recent = await this.getActiveConversationMessages(maxMsgs);
      const lastIncoming = [...recent].reverse().find(m => m.sender !== 'you');
      const name = (itemInfo?.name || '').split(' ')[0] || '';

      if (this.dynamicMessage?.mode === 'api' && this.dynamicMessage?.apiUrl) {
        try {
          const payload = {
            recipientName: itemInfo?.name || '',
            preview: itemInfo?.preview || '',
            time: itemInfo?.time || '',
            recentMessages: recent.map(m => ({ sender: m.sender, text: m.text, time: m.time || '' })),
            source: 'sales-inbox'
          };
          const res = await fetch(this.dynamicMessage.apiUrl, {
            method: 'POST',
            headers: { 'Accept': '*/*', 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (res.ok) {
            const txt = await res.text();
            let out = txt;
            try {
              const json = this.safeJsonParse(txt);
              if (json) out = json.message || json.text || json.content || JSON.stringify(json);
            } catch (_) {}
            if (typeof out === 'string' && out.trim()) return out.trim();
          }
        } catch (_) { }
      }

      if (lastIncoming) {
        const t = lastIncoming.text.toLowerCase();
        if (t.includes('how are you')) {
          return `Hi ${name || ''}${name ? ', ' : ''}I’m doing well, thanks for asking! How’s your week going?`;
        }
        if (t.includes('hi') || t.includes('hello') || t.includes('hii')) {
          return `Hi ${name || 'there'}! Great to hear from you. What can I help you with today?`;
        }
        if (t.endsWith('?')) {
          return `Thanks ${name || ''}${name ? ' ' : ''}for the note — happy to help. Could you share a bit more context?`;
        }
      }
      return `Hi ${name || 'there'}!`;
    }

    async typeWordsWithDelay(element, text, delayMs = 150) {
      const words = text.split(/(\s+)/); // keep spaces
      for (const part of words) {
        await this.typeText(element, part);
        await this.delay(delayMs);
      }
    }

    safeJsonParse(text) {
      try {
        return JSON.parse(text);
      } catch (_) {
        return null;
      }
    }

    getPageInfo() {
      return {
        url: window.location.href,
        title: document.title,
        isSearchPage: this.isSearchResultsPage(),
        connectButtonsCount: this.findConnectButtons().length,
      };
    }

    async collectProfiles() {
      const profiles = [];
      if (window.location.href.includes("/mynetwork/"))
        return this.collectNetworkProfiles();

      let profileCards = [];
      for (const selector of this.PROFILE_SELECTORS) {
        profileCards = document.querySelectorAll(selector);
        if (profileCards.length > 0) {
          console.log(
            `Found ${profileCards.length} profile cards using selector: ${selector}`
          );
          break;
        }
      }

      profileCards.forEach((card) => {
        const profile = this.extractProfileFromCard(card);
        if (profile?.name && profile?.url) {
          profiles.push(profile);
        }
      });

      if (profiles.length === 0) {
        const alternativeProfiles = this.extractProfilesAlternative();
        if (
          Array.isArray(alternativeProfiles) &&
          alternativeProfiles.length > 0
        ) {
          profiles.push(...alternativeProfiles);
        }
      }

      return profiles;
    }

    async collectCurrentPageOnly() {
      const allProfiles = await this.collectProfiles();
      const limitedProfiles = allProfiles.slice(0, 10);
      limitedProfiles.forEach((profile) =>
        this.sendProfilesRealTime([profile])
      );
      return limitedProfiles;
    }

    async collectProfilesWithScrolling() {
      const profiles = [];
      const maxScrollAttempts = 5;
      let scrollAttempts = 0;

      let searchResults = this.getSearchResultElements();
      searchResults.forEach((card) => {
        if (profiles.length < 20) {
          const profile = this.extractProfileFromCard(card);
          if (profile && profile.name && profile.url) {
            profile.source = "network-search";
            profiles.push(profile);
          }
        }
      });

      while (
        scrollAttempts < maxScrollAttempts &&
        profiles.length < 20 &&
        this.isAutoCollectionEnabled &&
        this.isRealTimeMode
      ) {
        scrollAttempts++;
        const initialCount = profiles.length;

        if (scrollAttempts <= 3) {
          window.scrollBy(0, window.innerHeight);
          await this.delay(2000);
          window.scrollTo(0, document.body.scrollHeight);
        } else {
          window.scrollBy(0, -window.innerHeight);
          await this.delay(2000);

          if (scrollAttempts === maxScrollAttempts) {
            window.scrollTo(0, 0);
          }
        }

        await this.delay(2000);

        searchResults = this.getSearchResultElements();
        searchResults.forEach((card) => {
          if (profiles.length < 20) {
            const profile = this.extractProfileFromCard(card);
            if (profile && profile.name && profile.url) {
              const isDuplicate = profiles.some((p) => p.url === profile.url);
              if (!isDuplicate) {
                profile.source = "network-search";
                profiles.push(profile);
              }
            }
          }
        });

        if (profiles.length === initialCount) {
          break;
        }
      }

      return profiles;
    }

    async collectMultiplePages(maxPages = 4) {
      const allProfiles = [];
      let currentPage = 1;

      try {
        this.sendCollectionStatus(
          `🚀 Starting collection from ${maxPages} pages...`
        );

        while (
          currentPage <= maxPages &&
          this.isAutoCollectionEnabled &&
          this.isRealTimeMode
        ) {
          this.sendCollectionStatus(`Processing page ${currentPage}`);

          // First scroll and collect profiles from current page
          this.sendCollectionStatus(
            `Scrolling and collecting from page ${currentPage}`
          );
          let pageProfiles = [];

          try {
            await this.delay(2000);
            await this.waitForSearchResults();

            this.sendCollectionStatus(`Trying main collection method...`);
            pageProfiles = await this.collectProfiles();
            if (!Array.isArray(pageProfiles)) pageProfiles = [];

            if (pageProfiles.length === 0) {
              this.sendCollectionStatus(
                `No profiles found with main method, trying scrolling...`
              );
              pageProfiles = await this.collectProfilesWithScrolling();
              if (!Array.isArray(pageProfiles)) pageProfiles = [];
            }

            if (pageProfiles.length === 0) {
              this.sendCollectionStatus(
                `No profiles found with scrolling, trying alternative method...`
              );
              const alternativeProfiles = this.extractProfilesAlternative();
              if (
                Array.isArray(alternativeProfiles) &&
                alternativeProfiles.length > 0
              ) {
                pageProfiles = alternativeProfiles.slice(0, 10);
                this.sendCollectionStatus(
                  `Found ${pageProfiles.length} profiles using alternative method`
                );
              } else {
                this.sendCollectionStatus(
                  `Page ${currentPage} completed (no profiles found)`
                );
              }
            } else {
              this.sendCollectionStatus(
                `Found ${pageProfiles.length} profiles on page ${currentPage}`
              );
            }
          } catch (error) {
            console.error(`Error collecting from page ${currentPage}:`, error);
            pageProfiles = [];
            this.sendCollectionStatus(
              `Page ${currentPage} failed - ${error.message}`
            );
          }

          if (Array.isArray(pageProfiles) && pageProfiles.length > 0) {
            pageProfiles.forEach((profile) => {
              if (profile && typeof profile === "object") {
                profile.collectedFromPage = currentPage;
                profile.collectionTimestamp = new Date().toISOString();
              }
            });

            allProfiles.push(...pageProfiles);
            this.sendProfilesRealTime(pageProfiles);
            this.sendCollectionStatus(
              `Completed page ${currentPage} with ${pageProfiles.length} profiles`
            );
          }

          if (currentPage < maxPages) {
            const nextPage = currentPage + 1;
            this.sendCollectionStatus(`Navigating to page ${nextPage}`);
            let navigationSuccess = false;
            let attempts = 0;
            const maxAttempts = 3;

            while (!navigationSuccess && attempts < maxAttempts) {
              attempts++;
              this.sendCollectionStatus(
                `Attempt ${attempts}/${maxAttempts} to navigate to page ${nextPage}`
              );

              const clickSuccess = await this.clickPaginationButton(nextPage);

              if (clickSuccess) {
                await this.delay(3000);
                await this.waitForSearchResults();

                const verifiedPage = this.getCurrentPageNumber();
                if (verifiedPage === nextPage) {
                  navigationSuccess = true;
                  this.sendCollectionStatus(
                    `Successfully navigated to page ${nextPage}`
                  );
                } else {
                  this.sendCollectionStatus(
                    `Navigation verification failed: expected page ${nextPage}, got ${verifiedPage}`
                  );
                }
              } else {
                this.sendCollectionStatus(
                  `Failed to click pagination button for page ${nextPage}`
                );
              }

              if (!navigationSuccess && attempts < maxAttempts) {
                await this.delay(2000);
              }
            }

            if (!navigationSuccess) {
              this.sendCollectionStatus(
                `❌ Failed to navigate to page ${nextPage} after ${maxAttempts} attempts. Stopping collection.`
              );
              break;
            }
          }

          currentPage++;
          if (currentPage <= maxPages) await this.delay(1000);
        }

        const pagesProcessed = currentPage - 1;
        this.sendCollectionStatus(
          `All pages completed (${pagesProcessed}/${maxPages})`
        );
        return allProfiles;
      } catch (error) {
        let errorMessage = "Collection error occurred";
        if (
          error.message.includes("iterable") ||
          error.message.includes("Symbol.iterator")
        ) {
          errorMessage = "Profile data format error - collection stopped";
        } else if (error.message.includes("timeout")) {
          errorMessage = "Page loading timeout - collection stopped";
        } else {
          errorMessage = `Collection error: ${error.message}`;
        }

        this.sendCollectionStatus(errorMessage);
        return Array.isArray(allProfiles) ? allProfiles : [];
      }
    }

    async clickPaginationButton(pageNumber) {
      try {
        const selectors = [
          `button[aria-label="Page ${pageNumber}"]`,
          `button[aria-current="false"][aria-label="Page ${pageNumber}"]`,
          `.artdeco-pagination__button[aria-label="Page ${pageNumber}"]`,
          `.artdeco-pagination li button[aria-label="Page ${pageNumber}"]`,
          `[data-test-pagination-page-btn="${pageNumber}"]`,
          `.pagination button[aria-label="Page ${pageNumber}"]`,
          `button[data-test-pagination-page-btn="${pageNumber}"]`,
          `.artdeco-pagination__pages button[aria-label="Page ${pageNumber}"]`,
          `button[data-test-id="pagination-page-${pageNumber}"]`,
          `button[aria-label="${pageNumber}"]`,
          `button:contains("${pageNumber}")`,
          `.artdeco-pagination button:contains("${pageNumber}")`,
        ];

        let pageButton = null;

        for (const selector of selectors) {
          try {
            pageButton = document.querySelector(selector);
            if (pageButton && !pageButton.disabled) {
              break;
            }
          } catch (e) {
            continue;
          }
        }

        if (!pageButton) {
          const allButtons = document.querySelectorAll("button");

          for (const button of allButtons) {
            if (button.disabled) continue;

            const buttonText = button.textContent.trim();
            const span = button.querySelector("span");
            const spanText = span ? span.textContent.trim() : "";

            if (
              buttonText === pageNumber.toString() ||
              spanText === pageNumber.toString()
            ) {
              const ariaLabel = button.getAttribute("aria-label");
              const parentClass = button.parentElement
                ? button.parentElement.className
                : "";
              const buttonClass = button.className;

              const isPaginationButton =
                (ariaLabel && ariaLabel.toLowerCase().includes("page")) ||
                parentClass.includes("pagination") ||
                buttonClass.includes("pagination") ||
                parentClass.includes("artdeco-pagination") ||
                buttonClass.includes("artdeco-pagination") ||
                /^\d+$/.test(buttonText) ||
                /^\d+$/.test(spanText);

              if (isPaginationButton) {
                pageButton = button;
                break;
              }
            }
          }
        }

        if (pageButton) {
          pageButton.scrollIntoView({ behavior: "smooth", block: "center" });
          await this.delay(1000);

          try {
            pageButton.click();
          } catch (clickError) {
            pageButton.dispatchEvent(
              new MouseEvent("click", { bubbles: true, cancelable: true })
            );
          }

          await this.delay(4000);
          await this.waitForSearchResults();

          return true;
        } else {
          if (pageNumber > 1) {
            return await this.clickNextButtonToPage(pageNumber);
          }
          return false;
        }
      } catch (error) {
        console.error(
          `Error clicking pagination button for page ${pageNumber}:`,
          error
        );
        return false;
      }
    }

    getCurrentPageNumber() {
      try {
        const currentPageButton = document.querySelector(
          'button[aria-current="true"]'
        );
        if (currentPageButton) {
          const span = currentPageButton.querySelector("span");
          if (span) {
            const pageNum = parseInt(span.textContent.trim());
            if (!isNaN(pageNum)) return pageNum;
          }
          const pageNum = parseInt(currentPageButton.textContent.trim());
          if (!isNaN(pageNum)) return pageNum;
        }

        const activeButton = document.querySelector(
          '.artdeco-pagination__button--active, .pagination__button--active, button[aria-selected="true"]'
        );
        if (activeButton) {
          const pageNum = parseInt(activeButton.textContent.trim());
          if (!isNaN(pageNum)) return pageNum;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const pageParam = urlParams.get("page");
        if (pageParam) {
          const pageNum = parseInt(pageParam);
          if (!isNaN(pageNum)) return pageNum;
        }

        return 1;
      } catch (error) {
        console.error("Error getting current page number:", error);
        return 1;
      }
    }

    async clickNextButtonToPage(targetPage) {
      try {
        const currentPage = this.getCurrentPageNumber();
        console.log(`Current page: ${currentPage}, Target page: ${targetPage}`);

        if (currentPage >= targetPage) {
          console.log("Already on or past target page");
          return true;
        }

        const clicksNeeded = targetPage - currentPage;
        console.log(`Need to click Next button ${clicksNeeded} times`);

        for (let i = 0; i < clicksNeeded; i++) {
          console.log(`Clicking Next button (${i + 1}/${clicksNeeded})`);

          const nextButton = this.findNextButton();
          if (!nextButton) {
            return false;
          }

          nextButton.scrollIntoView({ behavior: "smooth", block: "center" });
          await this.delay(500);
          nextButton.click();

          await this.delay(3000);
          await this.waitForSearchResults();

          const newPage = this.getCurrentPageNumber();

          if (newPage === targetPage) {
            return true;
          }
        }

        return this.getCurrentPageNumber() === targetPage;
      } catch (error) {
        console.error("Error in clickNextButtonToPage:", error);
        return false;
      }
    }

    findNextButton() {
      const nextSelectors = [
        'button[aria-label="Next"]',
        'button[aria-label="Next page"]',
        'button:contains("Next")',
        ".artdeco-pagination__button--next",
        'button[data-test-pagination-page-btn="next"]',
        '.artdeco-pagination button[aria-label*="Next"]',
        '.pagination button[aria-label*="Next"]',
      ];

      for (const selector of nextSelectors) {
        try {
          const button = document.querySelector(selector);
          if (button && !button.disabled) return button;
        } catch (e) {
          continue;
        }
      }

      const allButtons = document.querySelectorAll("button");

      for (const button of allButtons) {
        if (button.disabled) continue;

        const buttonText = button.textContent.toLowerCase().trim();
        const ariaLabel =
          button.getAttribute("aria-label")?.toLowerCase() || "";

        if (
          (buttonText.includes("next") ||
            ariaLabel.includes("next") ||
            buttonText.includes("→") ||
            buttonText.includes("›") ||
            button.innerHTML.includes("chevron-right") ||
            button.innerHTML.includes("arrow-right")) &&
          (button.closest(".artdeco-pagination") ||
            button.closest(".pagination") ||
            ariaLabel.includes("page"))
        ) {
          return button;
        }
      }

      return null;
    }

    buildPageUrl(baseUrl, pageNumber) {
      const separator = baseUrl.includes("?") ? "&" : "?";
      return `${baseUrl}${separator}page=${pageNumber}`;
    }

    async waitForPageLoad() {
      return new Promise((resolve) => {
        if (document.readyState === "complete") {
          resolve();
        } else {
          window.addEventListener("load", resolve, { once: true });
          setTimeout(resolve, 5000);
        }
      });
    }

    async waitForSearchResults() {
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 15;

        const checkForResults = () => {
          attempts++;

          const searchResults =
            document.querySelector(".search-results-container") ||
            document.querySelector(
              '[data-view-name="search-entity-result-universal-template"]'
            ) ||
            document.querySelector(".reusable-search__result-container") ||
            document.querySelector(".search-result__wrapper") ||
            document.querySelector(".entity-result") ||
            document.querySelector(".search-result") ||
            document.querySelector('[data-test-id="search-result"]');

          if (searchResults || attempts >= maxAttempts) {
            resolve();
          } else {
            setTimeout(checkForResults, 800);
          }
        };

        checkForResults();
      });
    }

    reinitializeAfterPageChange(previousState) {
      try {
        this.isRealTimeMode = previousState.isRealTimeMode;
        this.isAutoCollecting = previousState.isAutoCollecting;
        this.processedProfiles = new Set(previousState.processedProfiles);

        if (!window.linkedInAutomationReinitialized) {
          chrome.runtime.onMessage.addListener(
            (message, _sender, sendResponse) => {
              return this.handleMessage(message, sendResponse);
            }
          );
          window.linkedInAutomationReinitialized = true;
        }

        if (this.isAutoCollecting) {
          this.setupAutoDetection();
        }
      } catch (error) {
        console.error("Error during re-initialization:", error);
      }
    }

    sendCollectionStatus(message) {
      try {
        if (chrome.runtime?.id) {
          chrome.runtime
            .sendMessage({
              action: "collectionStatus",
              message: message,
            })
            .catch(() => {});
        }
      } catch (error) {}
    }

    sendProfilesRealTime(profiles) {
      if (!this.isAutoCollectionEnabled || profiles.length === 0) return;

      if (!chrome.runtime?.id) return;

      try {
        chrome.runtime
          .sendMessage({
            action: "addProfilesRealTime",
            profiles: profiles,
          })
          .catch(() => {});
      } catch (error) {}
    }

    fixProfileData(profile) {
      if (
        !profile.name ||
        profile.name.includes("Status is") ||
        profile.name.includes("offline") ||
        profile.name.includes("reachable") ||
        profile.name.length < 3
      ) {
        if (profile.location) {
          const nameMatch = profile.location.match(
            /^([A-Za-z\s]+?)(?:View|•|\n)/
          );
          if (nameMatch && nameMatch[1].trim().length > 2) {
            profile.name = nameMatch[1].trim();
          }

          const titleMatch = profile.location.match(
            /Full Stack Developer|Software Engineer|Developer|Engineer|Manager|Director|CEO|CTO|VP|President/i
          );
          if (titleMatch && !profile.title) {
            profile.title = titleMatch[0];
          }

          const locationMatch = profile.location.match(
            /([A-Za-z\s]+,\s*[A-Za-z\s]+)(?:\n|$)/
          );
          if (locationMatch) {
            const cleanLocation = locationMatch[1].trim();
            if (
              cleanLocation.includes(",") &&
              !cleanLocation.includes("View")
            ) {
              profile.location = cleanLocation;
            }
          }
        }
      }

      if (profile.title && profile.title.includes("degree connection")) {
        if (profile.location) {
          const titleMatch = profile.location.match(
            /\n\s*([A-Za-z\s]+(?:Developer|Engineer|Manager|Director|CEO|CTO|VP|President|Analyst|Consultant|Specialist)[A-Za-z\s]*)/i
          );
          if (titleMatch) {
            profile.title = titleMatch[1].trim();
          } else {
            profile.title = "";
          }
        } else {
          profile.title = "";
        }
      }

      if (profile.title && profile.title.includes(" at ") && !profile.company) {
        const parts = profile.title.split(" at ");
        if (parts.length === 2) {
          profile.title = parts[0].trim();
          profile.company = parts[1].trim();
        }
      }
    }

    extractProfilesAlternative() {
      const profiles = [];
      const alternativeSelectors = [
        'div[componentkey*="result"]',
        'div[componentkey*="profile"]',
        'div[componentkey*="person"]',
        'div[componentkey*="entity"]',
        'div:has(a[href*="/in/"])',
        ".search-results-container .result-card",
        ".search-results .search-result__wrapper",
        ".artdeco-list .artdeco-list__item",
        ".pvs-list .pvs-list__item",
      ];

      for (const selector of alternativeSelectors) {
        try {
          const cards = document.querySelectorAll(selector);
          if (cards.length > 0) {
            cards.forEach((card) => {
              const profile = this.extractProfileFromCard(card);
              if (profile?.name && profile?.url) {
                profiles.push(profile);
              }
            });
            if (profiles.length > 0) break;
          }
        } catch (error) {
          continue;
        }
      }

      if (profiles.length === 0) {
        const allLinks = document.querySelectorAll('a[href*="/in/"]');
        const processedUrls = new Set();

        allLinks.forEach((link) => {
          if (profiles.length >= 10) return;

          const url = link.href;
          if (processedUrls.has(url)) return;
          processedUrls.add(url);

          const name = link.textContent.trim();
          if (
            name &&
            name.length > 2 &&
            !name.includes("View") &&
            !name.includes("Connect")
          ) {
            const parentCard = link.closest("div");
            if (parentCard) {
              const profile = this.extractProfileFromCard(parentCard);
              if (profile?.name && profile?.url) {
                profiles.push(profile);
              } else {
                profiles.push({
                  name: name,
                  url: url.split("?")[0],
                  company: "",
                  title: "",
                  location: "",
                  industry: "",
                  profilePic: "",
                  collectedAt: new Date().toISOString(),
                });
              }
            }
          }
        });
      }

      return profiles;
    }

    async collectNetworkProfiles() {
      const profiles = [];

      const selectors = [
        ".discover-entity-type-card",
        ".mn-person-card",
        '[data-test-id="person-card"]',
        ".artdeco-entity-lockup",
        ".discover-person-card",
      ];

      let profileCards = [];
      for (const selector of selectors) {
        profileCards = document.querySelectorAll(selector);
        if (profileCards.length > 0) break;
      }

      profileCards.forEach((card) => {
        const profile = this.extractProfileFromCard(card, true);
        if (profile?.name && profile?.url) {
          profiles.push(profile);
        }
      });

      return profiles;
    }

    async collectSalesNavigatorProfiles() {
      const profiles = [];

      const selectors = [
        ".artdeco-entity-lockup",
        "[data-chameleon-result-urn]",
        ".search-results__result-item",
        ".result-lockup",
        ".entity-result",
      ];

      let profileCards = [];
      for (const selector of selectors) {
        profileCards = document.querySelectorAll(selector);
        if (profileCards.length > 0) break;
      }

      profileCards.forEach((card) => {
        const profile = this.extractSalesNavigatorProfile(card);
        if (profile?.name && profile?.url) {
          profile.source = "sales-navigator";
          profiles.push(profile);
        }
      });

      return profiles;
    }

    extractSalesNavigatorProfile(card) {
      const profile = {
        name: "",
        url: "",
        company: "",
        title: "",
        location: "",
        industry: "",
        profilePic: "",
        collectedAt: new Date().toISOString(),
        source: "sales-navigator",
      };

      try {
        const nameSelectors = [
          ".artdeco-entity-lockup__title a",
          ".result-lockup__name a",
          'a[href*="/sales/lead/"]',
          'a[href*="/in/"]',
        ];

        let nameElement = null;
        for (const selector of nameSelectors) {
          nameElement = card.querySelector(selector);
          if (nameElement) break;
        }

        if (nameElement) {
          profile.name = nameElement.textContent?.trim() || "";
          profile.url = nameElement.href || "";
        }

        const titleSelectors = [
          ".artdeco-entity-lockup__subtitle",
          ".result-lockup__highlight-keyword",
          ".entity-result__primary-subtitle",
        ];

        for (const selector of titleSelectors) {
          const titleElement = card.querySelector(selector);
          if (titleElement) {
            const titleText = titleElement.textContent?.trim() || "";
            if (titleText.includes(" at ")) {
              const parts = titleText.split(" at ");
              profile.title = parts[0]?.trim() || "";
              profile.company = parts[1]?.trim() || "";
            } else {
              profile.title = titleText;
            }
            break;
          }
        }

        const locationSelectors = [
          ".artdeco-entity-lockup__caption",
          ".result-lockup__misc-item",
          ".entity-result__secondary-subtitle",
        ];

        for (const selector of locationSelectors) {
          const locationElement = card.querySelector(selector);
          if (locationElement) {
            profile.location = locationElement.textContent?.trim() || "";
            break;
          }
        }

        const imgSelectors = [
          ".artdeco-entity-lockup__image img",
          ".result-lockup__image img",
          ".entity-result__image img",
        ];

        for (const selector of imgSelectors) {
          const imgElement = card.querySelector(selector);
          if (imgElement) {
            profile.profilePic = imgElement.src || "";
            break;
          }
        }
      } catch (error) {
        console.error("Error extracting Sales Navigator profile:", error);
      }

      return profile;
    }

    extractProfileFromCard(card, isNetworkPage = false) {
      const profile = {
        name: "",
        url: "",
        company: "",
        title: "",
        location: "",
        industry: "",
        profilePic: "",
        collectedAt: new Date().toISOString(),
      };

      try {
        const nameSelectors = isNetworkPage
          ? [
              'a[href*="/in/"]',
              ".discover-entity-type-card__link",
              ".mn-person-card__link",
              ".artdeco-entity-lockup__title a",
            ]
          : [
              'a._00ec11e5.e729de72[href*="/in/"]',
              ".entity-result__title-text a",
              ".search-result__result-link",
              'a[href*="/in/"]',
              ".app-aware-link",
            ];

        let nameLink = null;
        for (const selector of nameSelectors) {
          nameLink = card.querySelector(selector);
          if (nameLink) break;
        }

        if (nameLink) {
          profile.name = this.cleanNameText(nameLink.textContent.trim());
          profile.url = nameLink.href || "";
        } else {
          const nameResult = this.findNameInCard(card);
          if (nameResult.name) {
            profile.name = nameResult.name;
            profile.url =
              nameResult.url ||
              card.querySelector('a[href*="/in/"]')?.href ||
              "";
          }
        }

        if (profile.url) {
          if (profile.url.startsWith("/")) {
            profile.url = "https://www.linkedin.com" + profile.url;
          }
          if (profile.url.includes("?")) {
            profile.url = profile.url.split("?")[0];
          }
          profile.url = profile.url.replace(/\/$/, "");
        }

        const imgSelectors = [
          "img._4dab8b16._330f094a._2a7e48ae._8275b093",
          ".entity-result__image img",
          ".presence-entity__image img",
          ".discover-entity-type-card__image img",
          ".mn-person-card__picture img",
          ".artdeco-entity-lockup__image img",
          'img[alt*="profile"]',
          'img[alt*="Photo"]',
          "img[data-ghost-classes]",
          'img[src*="profile"]',
          "img",
        ];

        for (const selector of imgSelectors) {
          const imgElement = card.querySelector(selector);
          if (
            imgElement?.src &&
            !imgElement.src.includes("data:image") &&
            !imgElement.src.includes("ghost") &&
            imgElement.src.includes("http")
          ) {
            profile.profilePic = imgElement.src;
            break;
          }
        }

        const subtitleSelectors = isNetworkPage
          ? [
              ".discover-entity-type-card__occupation",
              ".mn-person-card__occupation",
              ".artdeco-entity-lockup__subtitle",
            ]
          : [
              "p._9e82a86e.a4e0e831.cbb1f25c._63482a47._41ac81b1.efc3ceee.c26ae7d0._94b51cfc._374d2a1f._2d409b09.adae7f6d._79448f3c._41e849ee.ce713fa8",
              ".entity-result__primary-subtitle",
              ".search-result__truncate",
              ".t-14.t-normal",
            ];

        for (const selector of subtitleSelectors) {
          const subtitleElement = card.querySelector(selector);
          if (subtitleElement) {
            const subtitle = subtitleElement.textContent.trim();
            const atIndex = subtitle.toLowerCase().indexOf(" at ");
            if (atIndex !== -1) {
              profile.title = subtitle.substring(0, atIndex).trim();
              profile.company = subtitle.substring(atIndex + 4).trim();
            } else {
              profile.title = subtitle;
            }
            break;
          }
        }

        const locationSelectors = [
          "p._9e82a86e.a4e0e831.cbb1f25c._63482a47._41ac81b1.efc3ceee.c26ae7d0._94b51cfc._374d2a1f._2d409b09.adae7f6d._79448f3c.a9f41f8b.ce713fa8",
          ".entity-result__secondary-subtitle",
          '[data-anonymize="location"]',
          ".t-12.t-black--light",
        ];

        for (const selector of locationSelectors) {
          const locationElement = card.querySelector(selector);
          if (locationElement) {
            const text = locationElement.textContent.trim();
            if (
              text.includes(",") ||
              text.includes("India") ||
              text.includes("USA") ||
              text.includes("UK") ||
              text.includes("Canada") ||
              text.includes("Australia") ||
              text.includes("Germany") ||
              text.includes("France") ||
              text.includes("Singapore") ||
              text.includes("Dubai") ||
              text.match(/\b(City|State|Province|Country|Area|Region)\b/i)
            ) {
              profile.location = text;
              break;
            }
          }
        }

        this.fixProfileData(profile);
        if (!profile.name || !profile.url || !profile.url.includes("/in/")) {
          return null;
        }

        return profile;
      } catch (error) {
        console.error("Error extracting profile data:", error);
        return null;
      }
    }

    cleanNameText(nameText) {
      if (nameText.includes("View") && nameText.includes("profile")) {
        const match = nameText.match(/^(.+?)(?:View|•|\n)/);
        if (match) {
          return match[1].trim();
        }
      }
      return nameText;
    }

    findNameInCard(card) {
      const nameSelectors = [
        'span[aria-hidden="true"]',
        ".t-16.t-black.t-bold",
        '[data-anonymize="person-name"] span',
        ".entity-result__title-text span",
        ".search-result__result-link span",
        ".artdeco-entity-lockup__title span",
        "span.t-16",
        "span.t-bold",
      ];

      for (const selector of nameSelectors) {
        const nameSpan = card.querySelector(selector);
        if (nameSpan && this.isValidNameText(nameSpan.textContent.trim())) {
          const parentLink =
            nameSpan.closest("a") || card.querySelector('a[href*="/in/"]');
          return {
            name: nameSpan.textContent.trim(),
            url: parentLink?.href || "",
          };
        }
      }

      const allLinks = card.querySelectorAll('a[href*="/in/"]');
      for (const link of allLinks) {
        const text = link.textContent.trim();
        if (this.isValidNameText(text) && text.split(" ").length >= 2) {
          return { name: text, url: link.href };
        }
      }

      return { name: "", url: "" };
    }

    isValidNameText(text) {
      return (
        text &&
        text.length > 2 &&
        !text.includes("Status") &&
        !text.includes("View") &&
        !text.includes("•")
      );
    }

    async searchByCompany(companyName) {
      try {
        const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
          companyName
        )}&origin=GLOBAL_SEARCH_HEADER`;
        window.location.href = searchUrl;

        return {
          success: true,
          message: `Searching for employees at ${companyName}`,
        };
      } catch (error) {
        console.error("Error searching by company:", error);
        return { success: false, message: error.message };
      }
    }

    async searchNetwork(criteria) {
      try {
        const profiles = [];
        // let scrollAttempts = 0;
        // const maxScrollAttempts = 5;

        this.setupContinuousMonitoring();

        if (
          criteria.type === "sales-navigator" ||
          window.location.href.includes("sales/search/people")
        ) {
          let searchResults = this.getSalesNavigatorResultElements();

          searchResults.forEach((card) => {
            if (profiles.length < 20) {
              const profile = this.extractSalesNavigatorProfile(card);
              if (profile && profile.name && profile.url) {
                profile.source = "sales-navigator";
                profiles.push(profile);
              }
            }
          });
        } else if (
          criteria.type === "search" ||
          window.location.href.includes("search/results/people")
        ) {
          let searchResults = this.getSearchResultElements();

          searchResults.forEach((card) => {
            if (profiles.length < 20) {
              const profile = this.extractProfileFromCard(card);
              if (profile && profile.name && profile.url) {
                profile.source = "network-search";
                profiles.push(profile);
              }
            }
          });

          while (
            scrollAttempts < maxScrollAttempts &&
            profiles.length < 20 &&
            this.isAutoCollectionEnabled &&
            this.isRealTimeMode
          ) {
            scrollAttempts++;

            const initialCount = profiles.length;

            if (scrollAttempts <= 3) {
              window.scrollBy(0, window.innerHeight);
              await this.delay(2000);
              window.scrollTo(0, document.body.scrollHeight);
            } else {
              window.scrollBy(0, -window.innerHeight);
              await this.delay(2000);

              if (scrollAttempts === maxScrollAttempts) {
                window.scrollTo(0, 0);
              }
            }

            await this.delay(2000);
            searchResults = this.getSearchResultElements();
            searchResults.forEach((card) => {
              if (profiles.length < 20) {
                const profile = this.extractProfileFromCard(card);
                if (profile && profile.name && profile.url) {
                  const isDuplicate = profiles.some(
                    (p) => p.url === profile.url
                  );
                  if (!isDuplicate) {
                    profile.source = "network-search";
                    profiles.push(profile);
                  }
                }
              }
            });

            const newProfilesCount = profiles.length - initialCount;

            if (newProfilesCount === 0 && scrollAttempts >= 2) {
              break;
            }
          }
        } else if (
          criteria.type === "connections" ||
          window.location.href.includes("mynetwork") ||
          window.location.href.includes("connections")
        ) {
          let connectionCards = document.querySelectorAll(
            ".mn-connection-card"
          );
          if (connectionCards.length === 0) {
            connectionCards = document.querySelectorAll(".connection-card");
          }
          if (connectionCards.length === 0) {
            connectionCards = document.querySelectorAll(
              '[data-control-name="connection_profile"]'
            );
          }
          if (connectionCards.length === 0) {
            connectionCards = document.querySelectorAll(
              ".artdeco-entity-lockup"
            );
          }
          if (connectionCards.length === 0) {
            connectionCards = document.querySelectorAll("li");
          }

          connectionCards.forEach((card, index) => {
            if (index < 20) {
              const profile = this.extractProfileFromCard(card, true);
              if (profile?.name && profile?.url) {
                profile.source = "connections";
                profiles.push(profile);

                if (profiles.length <= 3 || profiles.length % 2 === 0) {
                  this.sendProfilesRealTime([profile]);
                }
              }
            }
          });
        }

        return profiles;
      } catch (error) {
        console.error("Error searching network:", error);
        return [];
      }
    }

    getSearchResultElements() {
      // Use consolidated selectors plus additional ones for search results
      const selectors = [
        ...this.PROFILE_SELECTORS,
        "li[data-reusable-search-result]",
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) return elements;
      }

      // Fallback: find any elements containing LinkedIn profile links
      const elements = document.querySelectorAll("li, div");
      return Array.from(elements).filter(
        (el) =>
          el.querySelector('a[href*="/in/"]') ||
          el.querySelector('a[href*="linkedin.com/in/"]')
      );
    }

    getSalesNavigatorResultElements() {
      const selectors = [
        ".artdeco-entity-lockup",
        "[data-chameleon-result-urn]",
        ".search-results__result-item",
        ".result-lockup",
        ".entity-result",
        "li[data-test-result-item]",
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) return elements;
      }

      // Fallback for Sales Navigator
      const elements = document.querySelectorAll("li");
      return Array.from(elements).filter(
        (li) =>
          li.querySelector('a[href*="/sales/lead/"]') ||
          li.querySelector('a[href*="/in/"]') ||
          li.querySelector(".artdeco-entity-lockup")
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.linkedInAutomation = new LinkedInAutomation();
    });
  } else {
    window.linkedInAutomation = new LinkedInAutomation();
  }
}
