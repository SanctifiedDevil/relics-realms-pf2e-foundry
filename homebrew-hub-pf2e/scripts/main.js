const MODULE_ID = "homebrew-hub-pf2e";
const MODULE_TITLE = "Relics & Realms Bazaar";

Hooks.once("init", () => {
  console.log(`${MODULE_TITLE} | Initializing (PF2e)`);

  game.settings.register(MODULE_ID, "apiUrl", {
    name: "API URL",
    hint: "The URL of your Relics & Realms Bazaar server",
    scope: "world", config: true, type: String,
    default: "http://192.168.1.76:3000",
  });
  game.settings.register(MODULE_ID, "authToken", {
    name: "Auth Token",
    scope: "client", config: false, type: String, default: "",
  });
  game.settings.register(MODULE_ID, "compendiumName", {
    name: "Compendium Name",
    hint: "Name of the compendium to import content into",
    scope: "world", config: true, type: String,
    default: "homebrew-hub-pf2e-imports",
  });
  game.settings.register(MODULE_ID, "importToItems", {
    name: "Also add to World Items",
    hint: "When importing, also add the item directly to the world Items tab",
    scope: "world", config: true, type: Boolean, default: true,
  });
});



class HHApi {
  static getBaseUrl() { return game.settings.get(MODULE_ID, "apiUrl"); }
  static getToken() { return game.settings.get(MODULE_ID, "authToken"); }

  static async request(path, options = {}) {
    const url = `${this.getBaseUrl()}${path}`;
    const token = this.getToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    if (response.status === 401) {
      await game.settings.set(MODULE_ID, "authToken", "");
      ui.notifications.warn("Session expired. Please log in again.");
      new HHLoginApp().render(true);
      throw new Error("Session expired");
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    return response.json();
  }

  static async login(email, password) {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }
  static async getMe() { return this.request("/api/me"); }
  static async getContent(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/content${query ? "?" + query : ""}`);
  }
  static async getContentItem(id) { return this.request(`/api/content/${id}`); }
  static async getLibrary(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/library${query ? "?" + query : ""}`);
  }
  static async getPacks(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/packs${query ? "?" + query : ""}`);
  }
  static async getPack(id) {
    return this.request(`/api/packs/${id}`);
  }
}

class HHSidebarTab extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "rrb-sidebar",
      title: "Relics & Realms",
      template: "modules/homebrew-hub-pf2e/templates/sidebar.html",
      width: 300,
      height: 600,
      resizable: true,
    });
  }

  async getData() {
    const token = game.settings.get(MODULE_ID, "authToken");
    let loggedInUser = null;
    if (token) {
      try { loggedInUser = await HHApi.getMe(); }
      catch { await game.settings.set(MODULE_ID, "authToken", ""); }
    }
    return { loggedInUser };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("#rrb-sidebar-login-btn").click(() => {
      new HHLoginApp().render(true);
    });
    html.find("#rrb-sidebar-browse-btn").click(() => {
      const token = game.settings.get(MODULE_ID, "authToken");
      if (!token) {
        ui.notifications.warn("Please log in first.");
        new HHLoginApp().render(true);
        return;
      }
      new HHBrowserApp().render(true);
    });
    html.find("#rrb-sidebar-logout-btn").click(async () => {
      await game.settings.set(MODULE_ID, "authToken", "");
      this.render();
    });
  }
}

Hooks.on("ready", () => {
  setTimeout(() => {
    const menu = document.querySelector("#sidebar-tabs menu");
    if (!menu) return;

    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ui-control plain";
    btn.setAttribute("data-action", "tab");
    btn.setAttribute("data-tab", "rrb-bazaar-pf2e");
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-pressed", "false");
    btn.setAttribute("data-group", "primary");
    btn.setAttribute("aria-label", "Relics & Realms Bazaar (PF2e)");
    btn.setAttribute("data-tooltip", "Relics & Realms Bazaar (PF2e)");
    btn.style.fontSize = "20px";
    btn.innerHTML = "♜";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const token = game.settings.get(MODULE_ID, "authToken");
      if (!token) {
        new HHLoginApp().render(true);
      } else {
        new HHBrowserApp().render(true);
      }
    });

    li.appendChild(btn);
    menu.appendChild(li);
    console.log("HH PF2e | Button injected into sidebar");
  }, 1000);
});
class HHLoginApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "homebrew-hub-pf2e-login",
      title: "Relics & Realms Bazaar (PF2e)",
      template: "modules/homebrew-hub-pf2e/templates/login.html",
      width: 360, height: "auto", resizable: false,
    });
  }

  async getData() {
    const token = game.settings.get(MODULE_ID, "authToken");
    let loggedInUser = null;
    if (token) {
      try { loggedInUser = await HHApi.getMe(); }
      catch { await game.settings.set(MODULE_ID, "authToken", ""); }
    }
    return { loggedInUser };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("#hh-login-form").submit(async (e) => {
      e.preventDefault();
      const email = html.find("#hh-email").val();
      const password = html.find("#hh-password").val();
      const statusEl = html.find("#hh-login-status");
      const submitBtn = html.find("#hh-login-submit");
      submitBtn.prop("disabled", true).text("Entering...");
      statusEl.removeClass("success error").text("").hide();
      try {
        const data = await HHApi.login(email, password);
        await game.settings.set(MODULE_ID, "authToken", data.access_token);
        statusEl.addClass("success").text("Welcome to the Bazaar!").show();
        setTimeout(() => {
          this.close();
          new HHBrowserApp().render(true);
        }, 800);
      } catch (err) {
        statusEl.addClass("error").text(err.message || "Login failed").show();
        submitBtn.prop("disabled", false).text("Enter");
      }
    });

    html.find("#hh-open-browser").click(() => {
      this.close();
      new HHBrowserApp().render(true);
    });

    html.find("#hh-logout").click(async () => {
      await game.settings.set(MODULE_ID, "authToken", "");
      this.render();
    });
  }
}

class HHBrowserApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "homebrew-hub-pf2e-browser",
      title: "Relics & Realms Bazaar (PF2e)",
      template: "modules/homebrew-hub-pf2e/templates/browser.html",
      width: 480,
      height: 650,
      resizable: true,
    });
  }

  activateListeners(html) {
    super.activateListeners(html);
    this._html = html;
    this._items = [];
    this._packs = [];
    this._page = 1;
    this._totalPages = 1;
    this._currentType = null;
    this._currentTypeLabel = "";
    this._search = "";
    this._mode = "mine";

    this._showScreen("categories");
    this._initAuthBar();
    this._initCategories();

    html.find("#rrb-back-to-categories").click(() => {
      this._showScreen("categories");
      this._initCategories();
    });
    html.find("#rrb-back-to-list").click(() => {
      if (this._currentType === "pack") {
        this._renderPackList();
      } else {
        this._renderItemList();
      }
      this._showScreen("items");
    });
    html.find("#rrb-item-search").on("input", async (e) => {
      this._search = e.target.value;
      this._page = 1;
      if (this._currentType === "pack") {
        await this._loadPacks();
        this._renderPackList();
      } else {
        await this._loadItems();
        this._renderItemList();
      }
    });
    html.find("#rrb-prev-page").click(async () => {
      if (this._page > 1) {
        this._page--;
        if (this._currentType === "pack") { await this._loadPacks(); this._renderPackList(); }
        else { await this._loadItems(); this._renderItemList(); }
      }
    });
    html.find("#rrb-next-page").click(async () => {
      if (this._page < this._totalPages) {
        this._page++;
        if (this._currentType === "pack") { await this._loadPacks(); this._renderPackList(); }
        else { await this._loadItems(); this._renderItemList(); }
      }
    });

    // Mode tabs
    html.find("#rrb-tab-mine").click(() => {
      this._mode = "mine";
      html.find(".rrb-mode-tab").removeClass("rrb-mode-active");
      html.find("#rrb-tab-mine").addClass("rrb-mode-active");
      html.find("#rrb-categories-title").text("My Creations");
      this._initCategories();
    });
    html.find("#rrb-tab-library").click(() => {
      this._mode = "library";
      html.find(".rrb-mode-tab").removeClass("rrb-mode-active");
      html.find("#rrb-tab-library").addClass("rrb-mode-active");
      html.find("#rrb-categories-title").text("My Library");
      this._initCategories();
    });
  }

  _showScreen(name) {
    this._html.find(".rrb-screen").hide();
    this._html.find(`#rrb-screen-${name}`).show();
  }

  async _initAuthBar() {
    const statusEl = this._html.find("#rrb-auth-status");
    const actionsEl = this._html.find("#rrb-auth-actions");
    const token = game.settings.get(MODULE_ID, "authToken");
    if (!token) {
      statusEl.html(`<span style="color:var(--rrb-text-muted);font-size:0.75rem;font-family:Cinzel,serif;">Not logged in</span>`);
      actionsEl.html(`<button class="rrb-auth-btn" id="rrb-auth-login">Log In</button>`);
      actionsEl.find("#rrb-auth-login").click(() => new HHLoginApp().render(true));
      return;
    }
    try {
      const user = await HHApi.getMe();
      statusEl.html(`<span style="color:var(--rrb-accent-violet-light);font-size:0.72rem;font-family:Cinzel,serif;">&#10022; ${user.username}</span>`);
      actionsEl.html(`<button class="rrb-auth-btn" id="rrb-auth-logout">Logout</button>`);
      actionsEl.find("#rrb-auth-logout").click(async () => {
        await game.settings.set(MODULE_ID, "authToken", "");
        this._initAuthBar();
      });
    } catch {
      statusEl.html(`<span style="color:var(--rrb-text-muted);font-size:0.75rem;">Session expired</span>`);
      actionsEl.html(`<button class="rrb-auth-btn" id="rrb-auth-login">Log In</button>`);
      actionsEl.find("#rrb-auth-login").click(() => new HHLoginApp().render(true));
    }
  }

  async _initCategories() {
    const grid = this._html.find("#rrb-category-grid");
    grid.html(`<div class="rrb-category-loading">Consulting the archives...</div>`);

    const categories = [
      { type: "pack",       label: "Packs",        icon: "&#9672;" },
      { type: "weapon",     label: "Weapons",      icon: "&#9876;" },
      { type: "armor",      label: "Armor",        icon: "&#9960;" },
      { type: "equipment",  label: "Equipment",    icon: "&#8853;" },
      { type: "spell",      label: "Spells",       icon: "&#10022;" },
      { type: "feat",       label: "Feats",        icon: "&#9733;" },
      { type: "monster",    label: "Creatures",    icon: "&#9760;" },
      { type: "background", label: "Backgrounds",  icon: "&#9812;" },
      { type: "class",      label: "Classes",      icon: "&#9874;" },
      { type: "subclass",   label: "Subclasses",   icon: "&#9874;" },
      { type: "ancestry",   label: "Ancestries",   icon: "&#9873;" },
      { type: "heritage",   label: "Heritages",    icon: "&#9873;" },
      { type: "journal",    label: "Journals",     icon: "&#9998;" },
      { type: "map",        label: "Maps",         icon: "&#8862;" },
      { type: "audio",      label: "Audio",        icon: "&#9835;" },
    ];

    let counts = {};
    try {
      const mode = this._mode || "mine";
      const agnosticTypes = ["map", "audio"];
      const countPromises = categories.map(c =>
        c.type === "pack"
          ? HHApi.getPacks({ system: "pf2e", limit: 1 })
              .then(d => ({ type: c.type, count: d.pagination?.total || 0 }))
              .catch(() => ({ type: c.type, count: 0 }))
          : mode === "library"
            ? HHApi.getLibrary({ type: c.type, limit: 1 })
                .then(d => ({ type: c.type, count: d.pagination?.total || 0 }))
                .catch(() => ({ type: c.type, count: 0 }))
            : HHApi.getContent(Object.assign(
                { type: c.type, limit: 1, author: "me" },
                agnosticTypes.includes(c.type) ? {} : { system: "pf2e" }
              ))
                .then(d => ({ type: c.type, count: d.pagination?.total || 0 }))
                .catch(() => ({ type: c.type, count: 0 }))
      );
      const results = await Promise.all(countPromises);
      results.forEach(r => counts[r.type] = r.count);
      console.log("HH PF2e | Counts:", counts);
    } catch (err) {
      console.warn("HH PF2e | Failed to load counts:", err);
    }

    let html2 = "";
    for (const cat of categories) {
      const count = counts[cat.type] || 0;
      html2 += `
        <div class="rrb-cat-card" data-type="${cat.type}" data-label="${cat.label}">
          <div class="rrb-cat-icon">${cat.icon}</div>
          <div class="rrb-cat-name">${cat.label}</div>
          <div class="rrb-cat-count">${count} item${count !== 1 ? "s" : ""}</div>
        </div>
      `;
    }
    grid.html(html2);

    grid.find(".rrb-cat-card").click(async (e) => {
      const card = $(e.currentTarget);
      this._currentType = card.data("type");
      this._currentTypeLabel = card.data("label");
      this._search = "";
      this._page = 1;
      this._html.find("#rrb-list-title").text(this._currentTypeLabel);
      this._html.find("#rrb-item-search").val("");
      if (this._currentType === "pack") {
        await this._loadPacks();
        this._renderPackList();
      } else {
        await this._loadItems();
        this._renderItemList();
      }
      this._showScreen("items");
    });
  }

  async _loadItems() {
    const params = { page: this._page, limit: 20 };
    if (this._currentType) params.type = this._currentType;
    if (this._search) params.search = this._search;
    try {
      const mode = this._mode || "mine";
      let data;
      if (mode === "library") {
        data = await HHApi.getLibrary(params);
      } else {
        // Maps and audio are system-agnostic — don't filter by system
        const agnosticTypes = ["map", "audio"];
        if (!agnosticTypes.includes(this._currentType)) {
          params.system = "pf2e";
        }
        params.author = "me";
        data = await HHApi.getContent(params);
      }
      this._items = data.items || [];
      this._totalPages = data.pagination?.pages || 1;
    } catch (err) {
      ui.notifications.error("R&R Bazaar: " + err.message);
      this._items = [];
    }
  }

  _renderItemList() {
    const list = this._html.find("#rrb-item-list");
    const showPagination = this._totalPages > 1;
    this._html.find(".rrb-pagination").toggle(showPagination);
    if (showPagination) {
      this._html.find("#rrb-page-info").text(`${this._page} / ${this._totalPages}`);
      this._html.find("#rrb-prev-page").prop("disabled", this._page <= 1);
      this._html.find("#rrb-next-page").prop("disabled", this._page >= this._totalPages);
    }

    if (!this._items.length) {
      list.html(`<div class="rrb-status"><div class="rrb-status-icon">&#9674;</div><p>No items found</p></div>`);
      return;
    }

    let html2 = "";
    for (const item of this._items) {
      const imgHtml = item.image_url
        ? `<img src="${item.image_url}" class="rrb-item-img" alt="${item.name}" />`
        : `<div class="rrb-item-img-placeholder">&#9670;</div>`;
      html2 += `
        <div class="rrb-item" data-id="${item.id}">
          <div class="rrb-item-art">${imgHtml}</div>
          <div class="rrb-item-info">
            <div class="rrb-item-name">${item.name}</div>
            <div class="rrb-item-meta">
              <span class="rrb-badge rrb-badge-${item.content_type}">${item.content_type}</span>
              <span class="rrb-badge rrb-badge-version">v${item.version}</span>
              ${item.profiles?.username ? `<span class="rrb-author">${item.profiles.username}</span>` : ""}
            </div>
            ${item.description ? `<div class="rrb-item-desc">${item.description}</div>` : ""}
          </div>
          <div class="rrb-item-actions">
            <button class="rrb-preview-btn" data-id="${item.id}">View</button>
            <button class="rrb-import-btn rrb-import-quick" data-id="${item.id}" data-name="${item.name}">Import</button>
          </div>
        </div>
      `;
    }
    list.html(html2);

    list.find(".rrb-item").click((e) => {
      if (!$(e.target).hasClass("rrb-preview-btn")) {
        const id = $(e.currentTarget).data("id");
        const item = this._items.find(i => i.id === id);
        if (item) this._showPreview(item);
      }
    });

    list.find(".rrb-preview-btn").click((e) => {
      e.stopPropagation();
      const id = $(e.currentTarget).data("id");
      const item = this._items.find(i => i.id === id);
      if (item) this._showPreview(item);
    });

    list.find(".rrb-import-quick").click(async (e) => {
      e.stopPropagation();
      const id = $(e.currentTarget).data("id");
      const name = $(e.currentTarget).data("name");
      const btn = $(e.currentTarget);
      btn.prop("disabled", true).text("...");
      try {
        await HHImporter.importItem(id);
        btn.text("Done!");
        ui.notifications.info(`Imported "${name}" successfully.`);
      } catch (err) {
        btn.prop("disabled", false).text("Import");
        ui.notifications.error(`Import failed: ${err.message}`);
      }
    });
  }

  async _showPreview(item) {
    this._html.find("#rrb-preview-title").text(item.name);
    let fullItem = item;
    try { fullItem = await HHApi.getContentItem(item.id); }
    catch (err) { console.warn("HH PF2e | Could not fetch full item:", err); }

    const d = fullItem.data || {};
    const imgHtml = fullItem.image_url
      ? `<img src="${fullItem.image_url}" class="rrb-preview-img" alt="${fullItem.name}" />`
      : `<div class="rrb-preview-img-placeholder">&#9670;</div>`;

    let statsHtml = "";
    if (fullItem.content_type === "weapon") {
      const strikingDice = { "": 1, "striking": 2, "greater striking": 3, "major striking": 4 };
      const dice = strikingDice[d.pf2e_striking_rune || ""] || 1;
      const potency = d.pf2e_potency_rune || 0;
      statsHtml = `
        <div class="rrb-stat-row"><span class="rrb-stat-label">Damage</span><span class="rrb-stat-value">${dice}${d.pf2e_damage_die || "d6"} ${d.damage_type || ""}</span></div>
        ${potency > 0 ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Attack Bonus</span><span class="rrb-stat-value">+${potency} item</span></div>` : ""}
        ${d.pf2e_striking_rune ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Striking</span><span class="rrb-stat-value">${d.pf2e_striking_rune}</span></div>` : ""}
        ${d.range_normal ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Range</span><span class="rrb-stat-value">${d.range_normal} ft</span></div>` : `<div class="rrb-stat-row"><span class="rrb-stat-label">Range</span><span class="rrb-stat-value">Melee</span></div>`}
        ${d.weapon_category ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Category</span><span class="rrb-stat-value">${d.weapon_category}</span></div>` : ""}
        ${d.pf2e_group ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Group</span><span class="rrb-stat-value">${d.pf2e_group}</span></div>` : ""}
        ${d.pf2e_hands ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Hands</span><span class="rrb-stat-value">${d.pf2e_hands}</span></div>` : ""}
        ${d.pf2e_bulk ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Bulk</span><span class="rrb-stat-value">${d.pf2e_bulk}</span></div>` : ""}
        ${d.properties?.length ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Traits</span><span class="rrb-stat-value">${d.properties.join(", ")}</span></div>` : ""}
        ${d.pf2e_property_runes?.length ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Property Runes</span><span class="rrb-stat-value">${d.pf2e_property_runes.join(", ")}</span></div>` : ""}
        ${d.pf2e_price_text ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Price</span><span class="rrb-stat-value">${d.pf2e_price_text}</span></div>` : ""}
        ${d.rarity && d.rarity !== "common" ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Rarity</span><span class="rrb-stat-value">${d.rarity}</span></div>` : ""}
      `;
    } else if (fullItem.content_type === "armor") {
      const potency = d.pf2e_potency_rune || 0;
      const totalAC = (d.ac_bonus || 0) + potency;
      statsHtml = `
        <div class="rrb-stat-row"><span class="rrb-stat-label">AC Bonus</span><span class="rrb-stat-value">+${totalAC}${potency ? ` (base ${d.ac_bonus || 0} + ${potency} potency)` : ""}</span></div>
        ${d.dex_cap !== undefined && d.dex_cap !== null ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Dex Cap</span><span class="rrb-stat-value">+${d.dex_cap}</span></div>` : ""}
        ${d.check_penalty ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Check Penalty</span><span class="rrb-stat-value">${d.check_penalty}</span></div>` : ""}
        ${d.speed_penalty ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Speed Penalty</span><span class="rrb-stat-value">${d.speed_penalty} ft</span></div>` : ""}
        ${d.pf2e_resilient_rune ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Resilient</span><span class="rrb-stat-value">${d.pf2e_resilient_rune}</span></div>` : ""}
        ${d.group ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Group</span><span class="rrb-stat-value">${d.group}</span></div>` : ""}
        ${d.bulk ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Bulk</span><span class="rrb-stat-value">${d.bulk}</span></div>` : ""}
        ${d.traits?.length ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Traits</span><span class="rrb-stat-value">${d.traits.join(", ")}</span></div>` : ""}
        ${d.pf2e_property_runes?.length ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Property Runes</span><span class="rrb-stat-value">${d.pf2e_property_runes.join(", ")}</span></div>` : ""}
        ${d.price_text ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Price</span><span class="rrb-stat-value">${d.price_text}</span></div>` : ""}
        ${d.rarity && d.rarity !== "common" ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Rarity</span><span class="rrb-stat-value">${d.rarity}</span></div>` : ""}
      `;
    } else if (fullItem.content_type === "spell") {
      statsHtml = `
        ${d.pf2e_rank !== undefined ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Rank</span><span class="rrb-stat-value">${d.pf2e_rank === 0 ? "Cantrip" : d.pf2e_rank}</span></div>` : ""}
        ${d.pf2e_cast_actions ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Cast</span><span class="rrb-stat-value">${d.pf2e_cast_actions}</span></div>` : ""}
        ${d.traditions?.length ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Traditions</span><span class="rrb-stat-value">${d.traditions.join(", ")}</span></div>` : ""}
        ${d.range ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Range</span><span class="rrb-stat-value">${d.range}</span></div>` : ""}
        ${d.duration ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Duration</span><span class="rrb-stat-value">${d.duration}</span></div>` : ""}
        ${d.pf2e_defense ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Defense</span><span class="rrb-stat-value">${d.pf2e_defense}</span></div>` : ""}
        ${d.damage_formula ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Damage</span><span class="rrb-stat-value">${d.damage_formula} ${d.damage_type || ""}</span></div>` : ""}
      `;
    } else if (fullItem.content_type === "monster") {
      const abilityScores = ["str","dex","con","int","wis","cha"].map(a => {
        const val = d[a] || 10;
        const mod = Math.floor((val - 10) / 2);
        const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
        return `<div class="rrb-ability"><div class="rrb-ability-label">${a.toUpperCase()}</div><div class="rrb-ability-value">${val}</div><div class="rrb-ability-mod">${modStr}</div></div>`;
      }).join("");
      statsHtml = `
        ${d.pf2e_level !== undefined ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Level</span><span class="rrb-stat-value">${d.pf2e_level}</span></div>` : ""}
        ${d.size ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Size</span><span class="rrb-stat-value">${d.size}</span></div>` : ""}
        ${d.monster_type ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Type</span><span class="rrb-stat-value">${d.monster_type}</span></div>` : ""}
        ${d.ac ? `<div class="rrb-stat-row"><span class="rrb-stat-label">AC</span><span class="rrb-stat-value">${d.ac}</span></div>` : ""}
        ${d.hp ? `<div class="rrb-stat-row"><span class="rrb-stat-label">HP</span><span class="rrb-stat-value">${d.hp}</span></div>` : ""}
        ${d.speed ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Speed</span><span class="rrb-stat-value">${d.speed}</span></div>` : ""}
        ${d.pf2e_perception !== undefined ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Perception</span><span class="rrb-stat-value">+${d.pf2e_perception}</span></div>` : ""}
        ${d.pf2e_fortitude !== undefined ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Fort / Ref / Will</span><span class="rrb-stat-value">+${d.pf2e_fortitude} / +${d.pf2e_reflex} / +${d.pf2e_will}</span></div>` : ""}
        <div class="rrb-ability-scores">${abilityScores}</div>
      `;
    } else if (fullItem.content_type === "feat") {
      statsHtml = `
        ${d.pf2e_feat_type ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Type</span><span class="rrb-stat-value">${d.pf2e_feat_type}</span></div>` : ""}
        ${d.pf2e_level ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Level</span><span class="rrb-stat-value">${d.pf2e_level}</span></div>` : ""}
        ${d.pf2e_action_cost ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Actions</span><span class="rrb-stat-value">${d.pf2e_action_cost}</span></div>` : ""}
        ${d.pf2e_trigger ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Trigger</span><span class="rrb-stat-value">${d.pf2e_trigger}</span></div>` : ""}
        ${d.prerequisites ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Prerequisites</span><span class="rrb-stat-value">${d.prerequisites}</span></div>` : ""}
      `;
    } else if (fullItem.content_type === "ancestry") {
      statsHtml = `
        ${d.hp ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Hit Points</span><span class="rrb-stat-value">${d.hp}</span></div>` : ""}
        ${d.size ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Size</span><span class="rrb-stat-value">${d.size}</span></div>` : ""}
        ${d.speed ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Speed</span><span class="rrb-stat-value">${d.speed} ft</span></div>` : ""}
        ${d.vision ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Vision</span><span class="rrb-stat-value">${d.vision}</span></div>` : ""}
        ${d.ability_boosts?.length ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Ability Boosts</span><span class="rrb-stat-value">${d.ability_boosts.join(", ")}</span></div>` : ""}
        ${d.ability_flaw ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Ability Flaw</span><span class="rrb-stat-value">${d.ability_flaw}</span></div>` : ""}
        ${d.languages?.length ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Languages</span><span class="rrb-stat-value">${Array.isArray(d.languages) ? d.languages.join(", ") : d.languages}</span></div>` : ""}
      `;
    } else if (fullItem.content_type === "heritage") {
      statsHtml = `
        ${d.ancestry ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Ancestry</span><span class="rrb-stat-value">${d.ancestry}</span></div>` : ""}
      `;
    } else if (fullItem.content_type === "background") {
      statsHtml = `
        ${d.pf2e_ability_boosts?.length ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Ability Boosts</span><span class="rrb-stat-value">${d.pf2e_ability_boosts.join(", ")}</span></div>` : ""}
        ${d.pf2e_trained_skill ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Trained Skill</span><span class="rrb-stat-value">${d.pf2e_trained_skill}</span></div>` : ""}
        ${d.pf2e_trained_lore ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Trained Lore</span><span class="rrb-stat-value">${d.pf2e_trained_lore}</span></div>` : ""}
        ${d.pf2e_feat ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Feat</span><span class="rrb-stat-value">${d.pf2e_feat}</span></div>` : ""}
      `;
    } else if (fullItem.content_type === "map") {
      const gridTypes = { 0: "Gridless", 1: "Square", 2: "Hex (Odd Col)", 3: "Hex (Even Col)", 4: "Hex (Odd Row)", 5: "Hex (Even Row)" };
      statsHtml = `
        ${d.map_width && d.map_height ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Dimensions</span><span class="rrb-stat-value">${d.map_width} × ${d.map_height} px</span></div>` : ""}
        ${d.grid_columns && d.grid_rows ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Grid</span><span class="rrb-stat-value">${d.grid_columns} × ${d.grid_rows} squares</span></div>` : ""}
        ${d.grid_type !== undefined ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Grid Type</span><span class="rrb-stat-value">${gridTypes[d.grid_type] || "Square"}</span></div>` : ""}
        ${d.grid_size ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Grid Size</span><span class="rrb-stat-value">${d.grid_size}px</span></div>` : ""}
        ${d.darkness_level ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Darkness</span><span class="rrb-stat-value">${(d.darkness_level * 100).toFixed(0)}%</span></div>` : ""}
        ${d.map_image_url ? `<div style="margin-top:0.5rem;"><img src="${d.map_image_url}" style="width:100%;border-radius:6px;border:1px solid var(--rrb-border-subtle);" /></div>` : ""}
      `;
    } else if (fullItem.content_type === "audio") {
      const dur = d.audio_duration ? `${Math.floor(d.audio_duration / 60)}:${(d.audio_duration % 60).toString().padStart(2, "0")}` : "";
      statsHtml = `
        ${d.category ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Category</span><span class="rrb-stat-value">${d.category}</span></div>` : ""}
        ${dur ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Duration</span><span class="rrb-stat-value">${dur}</span></div>` : ""}
        ${d.audio_format ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Format</span><span class="rrb-stat-value">${d.audio_format.toUpperCase()}</span></div>` : ""}
        ${d.loop !== undefined ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Loop</span><span class="rrb-stat-value">${d.loop ? "Yes" : "No"}</span></div>` : ""}
        ${d.mood ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Mood</span><span class="rrb-stat-value">${d.mood}</span></div>` : ""}
        ${d.environment ? `<div class="rrb-stat-row"><span class="rrb-stat-label">Environment</span><span class="rrb-stat-value">${d.environment}</span></div>` : ""}
        ${d.audio_url ? `<div style="margin-top:0.5rem;"><audio controls src="${d.audio_url}" style="width:100%;" preload="metadata"></audio></div>` : ""}
      `;
    }

    const tagsHtml = fullItem.tags?.length
      ? `<div class="rrb-preview-tags">${fullItem.tags.map(t => `<span class="rrb-tag">${t}</span>`).join("")}</div>`
      : "";

    this._html.find("#rrb-preview-content").html(`
      <div class="rrb-preview-top">
        ${imgHtml}
        <div class="rrb-preview-header">
          <h2 class="rrb-preview-name">${fullItem.name}</h2>
          <div class="rrb-preview-meta">
            <span class="rrb-badge rrb-badge-${fullItem.content_type}">${fullItem.content_type}</span>
            <span class="rrb-badge rrb-badge-version">v${fullItem.version}</span>
            ${fullItem.profiles?.username ? `<span class="rrb-author">by ${fullItem.profiles.username}</span>` : ""}
          </div>
          ${tagsHtml}
        </div>
      </div>
      ${fullItem.description ? `<div class="rrb-preview-description">${fullItem.description}</div>` : ""}
      ${statsHtml ? `<div class="rrb-preview-stats">${statsHtml}</div>` : ""}
      <button class="rrb-import-btn rrb-import-full" data-id="${fullItem.id}" data-name="${fullItem.name}">
        Import to Foundry
      </button>
    `);

    this._showScreen("preview");

    this._html.find(".rrb-import-full").click(async (e) => {
      const id = $(e.currentTarget).data("id");
      const name = $(e.currentTarget).data("name");
      const btn = $(e.currentTarget);
      btn.prop("disabled", true).text("Importing...");
      try {
        await HHImporter.importItem(id);
        btn.text("Imported!");
        ui.notifications.info(`Imported "${name}" successfully.`);
      } catch (err) {
        btn.prop("disabled", false).text("Import to Foundry");
        ui.notifications.error(`Import failed: ${err.message}`);
      }
    });
  }
}

// Pack methods
HHBrowserApp.prototype._loadPacks = async function() {
  const params = { system: "pf2e", page: this._page, limit: 20 };
  if (this._search) params.search = this._search;
  try {
    const data = await HHApi.getPacks(params);
    this._packs = data.packs || [];
    this._totalPages = data.pagination?.pages || 1;
  } catch (err) {
    ui.notifications.error("R&R Bazaar: " + err.message);
    this._packs = [];
  }
};

HHBrowserApp.prototype._renderPackList = function() {
  const list = this._html.find("#rrb-item-list");
  const showPagination = this._totalPages > 1;
  this._html.find(".rrb-pagination").toggle(showPagination);
  if (showPagination) {
    this._html.find("#rrb-page-info").text(this._page + " / " + this._totalPages);
    this._html.find("#rrb-prev-page").prop("disabled", this._page <= 1);
    this._html.find("#rrb-next-page").prop("disabled", this._page >= this._totalPages);
  }

  if (!this._packs || !this._packs.length) {
    list.html('<div class="rrb-status"><div class="rrb-status-icon">&#9672;</div><p>No packs found</p></div>');
    return;
  }

  let html2 = "";
  for (const pack of this._packs) {
    const imgHtml = pack.image_url
      ? '<img src="' + pack.image_url + '" class="rrb-item-img" alt="' + pack.name + '" />'
      : '<div class="rrb-item-img-placeholder">&#9672;</div>';
    const authorHtml = pack.profiles && pack.profiles.username
      ? '<span class="rrb-author">by ' + pack.profiles.username + '</span>' : "";
    const descHtml = pack.description
      ? '<div class="rrb-item-desc">' + pack.description + '</div>' : "";
    html2 += '<div class="rrb-item" data-id="' + pack.id + '">'
      + '<div class="rrb-item-art">' + imgHtml + '</div>'
      + '<div class="rrb-item-info">'
      + '<div class="rrb-item-name">' + pack.name + '</div>'
      + '<div class="rrb-item-meta">'
      + '<span class="rrb-badge" style="background:rgba(124,58,237,0.2);color:#c4b5fd;border:1px solid rgba(124,58,237,0.3);">pack</span>'
      + '<span class="rrb-badge rrb-badge-version">v' + pack.version + '</span>'
      + authorHtml + '</div>' + descHtml + '</div>'
      + '<div class="rrb-item-actions">'
      + '<button class="rrb-pack-view-btn rrb-preview-btn" data-id="' + pack.id + '">View</button>'
      + '<button class="rrb-pack-import-btn rrb-import-btn" data-id="' + pack.id + '" data-name="' + pack.name + '">Import</button>'
      + '</div></div>';
  }
  list.html(html2);

  const self = this;
  list.find(".rrb-pack-view-btn").click(function(e) {
    e.stopPropagation();
    const id = $(e.currentTarget).data("id");
    self._showPackPreview(id);
  });

  list.find(".rrb-pack-import-btn").click(async function(e) {
    e.stopPropagation();
    const id = $(e.currentTarget).data("id");
    const name = $(e.currentTarget).data("name");
    const btn = $(e.currentTarget);
    btn.prop("disabled", true).text("...");
    try {
      await HHImporter.importPack(id);
      btn.text("Done!");
      ui.notifications.info("Pack imported successfully.");
    } catch (err) {
      btn.prop("disabled", false).text("Import");
      ui.notifications.error("Pack import failed: " + err.message);
    }
  });
};

HHBrowserApp.prototype._showPackPreview = async function(packId) {
  let pack;
  try {
    pack = await HHApi.getPack(packId);
  } catch (err) {
    ui.notifications.error("Could not load pack details.");
    return;
  }

  this._html.find("#rrb-preview-title").text(pack.name);

  const imgHtml = pack.image_url
    ? '<img src="' + pack.image_url + '" class="rrb-preview-img" alt="' + pack.name + '" />'
    : '<div class="rrb-preview-img-placeholder">&#9672;</div>';

  const items = pack.pack_items || [];
  let itemsHtml = "";
  if (items.length) {
    let rows = "";
    const sorted = items.slice().sort(function(a, b) { return a.sort_order - b.sort_order; });
    for (const pi of sorted) {
      const item = pi.content_items;
      if (!item) continue;
      const thumbHtml = item.image_url
        ? '<img src="' + item.image_url + '" style="width:20px;height:20px;object-fit:cover;border-radius:3px;" />'
        : "";
      rows += '<div class="rrb-stat-row">'
        + '<span class="rrb-stat-label" style="display:flex;align-items:center;gap:0.4rem;">'
        + thumbHtml + item.name + '</span>'
        + '<span class="rrb-badge rrb-badge-' + item.content_type + '" style="font-size:0.62rem;">'
        + item.content_type + '</span></div>';
    }
    itemsHtml = '<div class="rrb-preview-stats">'
      + '<div style="font-family:Cinzel,serif;font-size:0.68rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--rrb-accent-violet-light);margin-bottom:0.5rem;">'
      + 'Pack Contents (' + items.length + ' items)</div>'
      + rows + '</div>';
  } else {
    itemsHtml = '<p style="color:var(--rrb-text-muted);font-size:0.8rem;">No items in this pack yet.</p>';
  }

  const tagsHtml = pack.tags && pack.tags.length
    ? '<div class="rrb-preview-tags">' + pack.tags.map(function(t) { return '<span class="rrb-tag">' + t + '</span>'; }).join("") + '</div>'
    : "";
  const authorHtml = pack.profiles && pack.profiles.username
    ? '<span class="rrb-author">by ' + pack.profiles.username + '</span>' : "";
  const descHtml = pack.description
    ? '<div class="rrb-preview-description">' + pack.description + '</div>' : "";

  this._html.find("#rrb-preview-content").html(
    '<div class="rrb-preview-top">' + imgHtml
    + '<div class="rrb-preview-header">'
    + '<h2 class="rrb-preview-name">' + pack.name + '</h2>'
    + '<div class="rrb-preview-meta">'
    + '<span class="rrb-badge" style="background:rgba(124,58,237,0.2);color:#c4b5fd;border:1px solid rgba(124,58,237,0.3);">pack</span>'
    + '<span class="rrb-badge rrb-badge-version">v' + pack.version + '</span>'
    + authorHtml + '</div>' + tagsHtml + '</div></div>'
    + descHtml + itemsHtml
    + '<button class="rrb-import-btn rrb-import-full" data-id="' + pack.id + '" data-name="' + pack.name + '">'
    + 'Import Entire Pack</button>'
  );

  this._showScreen("preview");

  const self = this;
  this._html.find(".rrb-import-full").click(async function(e) {
    const id = $(e.currentTarget).data("id");
    const name = $(e.currentTarget).data("name");
    const btn = $(e.currentTarget);
    btn.prop("disabled", true).text("Importing pack...");
    try {
      await HHImporter.importPack(id);
      btn.text("Pack Imported!");
      ui.notifications.info("Pack imported successfully.");
    } catch (err) {
      btn.prop("disabled", false).text("Import Entire Pack");
      ui.notifications.error("Pack import failed: " + err.message);
    }
  });
};

// ════════════════════════════════════════════════════════════════════════════
// IMPORTER — Maps all content types to PF2e system data structures
// ════════════════════════════════════════════════════════════════════════════

class HHImporter {
  static async importPack(packId) {
    const pack = await HHApi.getPack(packId);
    const items = pack.pack_items || [];

    if (!items.length) {
      throw new Error("This pack has no items to import.");
    }

    ui.notifications.info("Importing: " + pack.name + " (" + items.length + " items)...");

    const results = { success: [], failed: [] };
    const sorted = items.sort((a, b) => a.sort_order - b.sort_order);

    for (const packItem of sorted) {
      const item = packItem.content_items;
      if (!item) continue;
      try {
        await this.importItem(item.id);
        results.success.push(item.name);
      } catch (err) {
        console.warn(`HH PF2e | Failed to import "${item.name}":`, err);
        results.failed.push(item.name);
      }
    }

    if (results.failed.length) {
      ui.notifications.warn(`Pack imported with ${results.failed.length} error(s): ${results.failed.join(", ")}`);
    } else {
      ui.notifications.info("Pack imported: " + results.success.length + " items added.");
    }

    return results;
  }

  static async importItem(id) {
    const item = await HHApi.getContentItem(id);

    if (item.content_type === "monster") {
      return this.importMonster(item);
    }
    if (item.content_type === "journal") {
      return this.importJournal(item);
    }
    if (item.content_type === "map") {
      return this.importMap(item);
    }
    if (item.content_type === "audio") {
      return this.importAudio(item);
    }

    const itemData = this.mapToPf2e(item);
    const results = {};

    try {
      const compendiumName = game.settings.get(MODULE_ID, "compendiumName");
      let pack = game.packs.get(`world.${compendiumName}`);
      if (!pack) {
        pack = await CompendiumCollection.createCompendium({
          name: compendiumName,
          label: "Relics & Realms PF2e Imports",
          type: "Item", system: "pf2e",
        });
      }
      await pack.getIndex();
      const existing = pack.index.find(e => e.name === item.name);
      if (existing) {
        const doc = await pack.getDocument(existing._id);
        await doc.update(itemData);
        results.compendium = doc;
      } else {
        results.compendium = await Item.create(itemData, { pack: pack.collection });
      }
    } catch (err) { console.warn("HH PF2e | Failed to import to compendium:", err); }

    if (game.settings.get(MODULE_ID, "importToItems")) {
      try {
        const existing = game.items.find(i => i.getFlag(MODULE_ID, "sourceId") === item.id);
        if (existing) {
          await existing.update(itemData);
          results.worldItem = existing;
        } else {
          results.worldItem = await Item.create(itemData);
        }
      } catch (err) { console.warn("HH PF2e | Failed to import to world items:", err); }
    }

    return results;
  }

  // ── Journal (system agnostic) ──
  static async importJournal(item) {
    const d = item.data || {};
    const pages = d.pages || [{ title: item.name, content: item.description || "", sort_order: 0 }];

    const journalData = {
      name: item.name,
      img: item.image_url || null,
      flags: { [MODULE_ID]: { sourceId: item.id, version: item.version } },
      pages: pages.map((page, idx) => ({
        name: page.title || "Page " + (idx + 1),
        type: "text",
        sort_order: (page.sort_order || idx) * 100000,
        text: {
          content: page.content || "",
          format: 1,
        },
      })),
    };

    const results = {};
    if (game.settings.get(MODULE_ID, "importToItems")) {
      try {
        const existing = game.journal.find(j => j.getFlag(MODULE_ID, "sourceId") === item.id);
        if (existing) {
          await existing.update(journalData);
          results.journal = existing;
        } else {
          results.journal = await JournalEntry.create(journalData);
        }
      } catch (err) {
        console.warn("HH PF2e | Failed to import journal:", err);
      }
    }
    return results;
  }

  // ── Download helper (system agnostic) ──
  static async downloadToLocal(url, targetDir, fileName) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();

      try {
        await FilePicker.browse("data", targetDir);
      } catch {
        await FilePicker.createDirectory("data", targetDir);
      }

      const file = new File([blob], fileName, { type: blob.type });
      const result = await FilePicker.upload("data", targetDir, file);
      const path = result?.path || `${targetDir}/${fileName}`;
      console.log(`HH PF2e | Downloaded ${fileName} to ${path}`);
      return path;
    } catch (err) {
      console.warn(`HH PF2e | Failed to download ${url}:`, err);
      return null;
    }
  }

  // ── Audio (system agnostic) ──
  static async importAudio(item) {
    const d = item.data || {};
    const audioUrl = d.audio_url;
    if (!audioUrl) throw new Error("No audio file URL found.");

    const safeName = item.name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
    const soundDir = "relics-realms-audio";

    ui.notifications.info(`Downloading audio: ${item.name}...`);
    const ext = d.audio_format || audioUrl.match(/\.(ogg|wav|webm|mp3)(\?|$)/i)?.[1] || "ogg";
    const localPath = await this.downloadToLocal(
      audioUrl, soundDir, `${safeName}_${item.id.substring(0, 8)}.${ext}`
    );
    if (!localPath) throw new Error("Failed to download audio file.");

    const playlistName = "Relics & Realms Imports";
    let playlist = game.playlists.find(p => p.name === playlistName);
    if (!playlist) {
      playlist = await Playlist.create({
        name: playlistName,
        mode: 0,
        flags: { [MODULE_ID]: { managed: true } },
      });
    }

    const existingSound = playlist.sounds.find(s => s.getFlag(MODULE_ID, "sourceId") === item.id);
    const soundData = {
      name: item.name,
      path: localPath,
      volume: d.default_volume ?? 0.8,
      repeat: d.loop ?? true,
      flags: { [MODULE_ID]: { sourceId: item.id, version: item.version, category: d.category, mood: d.mood, environment: d.environment } },
    };

    if (existingSound) {
      await existingSound.update(soundData);
      ui.notifications.info(`Updated audio "${item.name}" in playlist.`);
    } else {
      await playlist.createEmbeddedDocuments("PlaylistSound", [soundData]);
      ui.notifications.info(`Added "${item.name}" to ${playlistName} playlist.`);
    }

    return { playlist, path: localPath };
  }

  // ── Map / Scene (system agnostic) ──
  static async importMap(item) {
    const d = item.data || {};
    console.log("HH PF2e | Map data keys:", Object.keys(d));
    console.log("HH PF2e | Walls:", d.walls?.length || 0, "Lights:", d.lights?.length || 0, "Sounds:", d.sounds?.length || 0);
    const imageUrl = d.map_image_url || item.image_url || null;
    const safeName = item.name.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 50);
    const mapDir = "relics-realms-maps";
    const soundDir = "relics-realms-maps/sounds";

    let localImagePath = null;
    if (imageUrl) {
      ui.notifications.info("Downloading map image...");
      const ext = imageUrl.match(/\.(png|jpe?g|webp)(\?|$)/i)?.[1] || "png";
      localImagePath = await this.downloadToLocal(
        imageUrl, mapDir, `${safeName}_${item.id.substring(0, 8)}.${ext}`
      );
      if (!localImagePath) localImagePath = imageUrl;
    }

    const sounds = d.sounds || [];
    const localSounds = [];
    if (sounds.length > 0) {
      ui.notifications.info(`Downloading ${sounds.length} sound file(s)...`);
      for (let i = 0; i < sounds.length; i++) {
        const sound = { ...sounds[i] };
        const soundUrl = (sound.audio_url && sound.audio_url.startsWith("http")) ? sound.audio_url
          : (sound.path && sound.path.startsWith("http")) ? sound.path
          : "";

        if (soundUrl) {
          const soundExt = soundUrl.match(/\.(ogg|wav|webm|mp3)(\?|$)/i)?.[1] || "ogg";
          const soundFileName = sound.original_filename
            ? sound.original_filename.replace(/[^a-zA-Z0-9._-]/g, "_")
            : `${safeName}_sound_${i}.${soundExt}`;
          ui.notifications.info(`Downloading sound ${i + 1}/${sounds.length}: ${soundFileName}`);
          const localPath = await this.downloadToLocal(soundUrl, soundDir, soundFileName);
          if (localPath) {
            sound.path = localPath;
            console.log(`HH PF2e | Sound ${i}: ${soundUrl} → ${localPath}`);
          }
        }
        delete sound.audio_url;
        delete sound.original_filename;
        delete sound.original_path;
        localSounds.push(sound);
      }
    }

    const sceneData = {
      name: item.name,
      img: localImagePath,
      background: { src: localImagePath },
      width: d.map_width || 4000,
      height: d.map_height || 3000,
      padding: d.scene_padding ?? 0.25,
      backgroundColor: d.background_color || "#000000",
      grid: {
        type: d.grid_type ?? 1,
        size: d.grid_size ?? 100,
        color: d.grid_color || "#000000",
        alpha: d.grid_opacity ?? 0.2,
      },
      darkness: d.darkness_level ?? 0,
      globalLight: d.has_global_illumination ?? false,
      tokenVision: d.token_vision ?? true,
      fogExploration: d.fog_exploration ?? true,
      navigation: true,
      walls: d.walls || [],
      lights: d.lights || [],
      sounds: localSounds,
      flags: { [MODULE_ID]: { sourceId: item.id, version: item.version } },
    };

    const results = {};
    try {
      const existing = game.scenes.find(s => s.getFlag(MODULE_ID, "sourceId") === item.id);
      if (existing) {
        await existing.update(sceneData);
        results.scene = existing;
        ui.notifications.info(`Updated scene "${item.name}".`);
      } else {
        results.scene = await Scene.create(sceneData);
        ui.notifications.info(`Created scene "${item.name}".`);
      }

      if (results.scene) {
        try {
          const thumb = await results.scene.createThumbnail();
          if (thumb?.thumb) {
            await results.scene.update({ thumb: thumb.thumb });
          }
        } catch (err) {
          console.warn("HH PF2e | Could not generate scene thumbnail:", err);
        }
      }
    } catch (err) {
      console.error("HH PF2e | Failed to import map as scene:", err);
      throw new Error("Scene import failed: " + err.message);
    }

    return results;
  }

  // ── Monster / Creature ──
  static async importMonster(item) {
    const actorData = this.mapMonsterToPf2e(item);
    const results = {};
    const inventory = item.data?.inventory || [];

    try {
      const compendiumName = game.settings.get(MODULE_ID, "compendiumName") + "-actors";
      let pack = game.packs.get(`world.${compendiumName}`);
      if (!pack) {
        pack = await CompendiumCollection.createCompendium({
          name: compendiumName,
          label: "Relics & Realms PF2e NPC Imports",
          type: "Actor", system: "pf2e",
        });
      }
      await pack.getIndex();
      const existing = pack.index.find(e => e.name === item.name);
      if (existing) {
        const doc = await pack.getDocument(existing._id);
        await doc.update(actorData);
        results.compendium = doc;
      } else {
        const created = await Actor.createDocuments([actorData], { pack: pack.collection });
        results.compendium = created[0];
      }
    } catch (err) { console.warn("HH PF2e | Failed to import monster to compendium:", err); }

    if (game.settings.get(MODULE_ID, "importToItems")) {
      try {
        const existing = game.actors.find(a => a.getFlag(MODULE_ID, "sourceId") === item.id);
        let actor;
        if (existing) {
          await existing.update(actorData);
          actor = existing;
        } else {
          actor = await Actor.create(actorData);
        }
        results.worldActor = actor;

        // Import inventory items onto the actor
        if (actor && inventory.length > 0) {
          for (const invItem of inventory) {
            try {
              const fullItem = await HHApi.getContentItem(invItem.content_item_id);
              const itemData = HHImporter.mapToPf2e(fullItem);
              await actor.createEmbeddedDocuments("Item", [itemData]);
            } catch (err) {
              console.warn("HH PF2e | Failed to import inventory item:", invItem.name, err);
            }
          }
        }
      } catch (err) { console.warn("HH PF2e | Failed to import monster to world:", err); }
    }

    return results;
  }

  // ════════════════════════════════════════════════════════════════════════
  // PF2e Item Mapping
  // ════════════════════════════════════════════════════════════════════════

  static mapToPf2e(item) {
    const base = {
      name: item.name,
      type: this.mapContentType(item.content_type),
      img: item.image_url || this.getDefaultIcon(item.content_type),
      system: { description: { value: item.description || "" } },
      flags: { [MODULE_ID]: { sourceId: item.id, version: item.version } },
    };
    const d = item.data || {};
    switch (item.content_type) {
      case "weapon": return this.mapWeapon(base, d);
      case "spell": return this.mapSpell(base, d);
      case "armor": return this.mapArmor(base, d);
      case "equipment": return this.mapEquipment(base, d);
      case "feat": return this.mapFeat(base, d);
      case "ancestry": return this.mapAncestry(base, d);
      case "heritage": return this.mapHeritage(base, d);
      case "background": return this.mapBackground(base, d);
      case "class": return this.mapClass(base, d);
      default: return base;
    }
  }

  static mapContentType(contentType) {
    const map = {
      weapon: "weapon", armor: "armor", equipment: "equipment",
      spell: "spell", feat: "feat", ancestry: "ancestry",
      heritage: "heritage", background: "background", class: "class",
      monster: "npc", journal: "journalentry",
    };
    return map[contentType] || "equipment";
  }

  static getDefaultIcon(contentType) {
    const icons = {
      weapon: "icons/svg/sword.svg", armor: "icons/svg/shield.svg",
      equipment: "icons/svg/item-bag.svg", spell: "icons/svg/lightning.svg",
      feat: "icons/svg/book.svg", ancestry: "icons/svg/mystery-man.svg",
      heritage: "icons/svg/mystery-man.svg", background: "icons/svg/ruins.svg",
      monster: "icons/svg/skull.svg", class: "icons/svg/statue.svg",
    };
    return icons[contentType] || "icons/svg/item-bag.svg";
  }

  // ── Weapon ──
  static mapWeapon(base, d) {
    const strikingDice = { "": 1, "striking": 2, "greater striking": 3, "major striking": 4 };
    const dice = strikingDice[d.pf2e_striking_rune || ""] || 1;
    const potency = d.pf2e_potency_rune || 0;
    const traits = this.buildTraitsObject(d.properties || []);

    const description = (base.system?.description?.value || "") +
      (d.special_effects ? `<p><em>${d.special_effects}</em></p>` : "") +
      (d.pf2e_property_runes?.length ? `<p><strong>Property Runes:</strong> ${d.pf2e_property_runes.join(", ")}</p>` : "") +
      (d.pf2e_custom_runes?.length ? `<p><strong>Custom Runes:</strong> ${d.pf2e_custom_runes.map(r => `${r.name}: ${r.effects}`).join("; ")}</p>` : "");

    return foundry.utils.mergeObject(base, {
      type: "weapon",
      system: {
        description: { value: description },
        category: d.weapon_category || "martial",
        group: d.pf2e_group || null,
        damage: {
          die: d.pf2e_damage_die || "d6",
          damageType: d.damage_type || "slashing",
          dice: dice,
        },
        range: d.range_normal || null,
        reload: { value: d.pf2e_reload && d.pf2e_reload !== "-" ? d.pf2e_reload : null },
        hands: { value: d.pf2e_hands || "1" },
        bulk: { value: this.parseBulk(d.pf2e_bulk) },
        level: { value: d.pf2e_level || 0 },
        price: this.parsePrice(d.pf2e_price_text),
        rarity: d.rarity || "common",
        traits: traits,
        potencyRune: { value: potency || null },
        strikingRune: { value: d.pf2e_striking_rune || null },
        propertyRune1: { value: d.pf2e_property_runes?.[0] || null },
        propertyRune2: { value: d.pf2e_property_runes?.[1] || null },
        propertyRune3: { value: d.pf2e_property_runes?.[2] || null },
        propertyRune4: { value: d.pf2e_property_runes?.[3] || null },
        hardness: d.pf2e_hardness || 0,
        hp: { value: d.pf2e_item_hp || 0, max: d.pf2e_item_hp || 0 },
      },
    });
  }

  // ── Armor ──
  static mapArmor(base, d) {
    const potency = d.pf2e_potency_rune || 0;
    const resilientMap = { "": null, "resilient": "resilient", "greater resilient": "greaterResilient", "major resilient": "majorResilient" };
    const traits = this.buildTraitsObject(d.traits || []);
    const groupMap = { "unarmored": "cloth", "light": "leather", "medium": "chain", "heavy": "plate" };

    const description = (base.system?.description?.value || "") +
      (d.special_effects ? `<p><em>${d.special_effects}</em></p>` : "") +
      (d.pf2e_property_runes?.length ? `<p><strong>Property Runes:</strong> ${d.pf2e_property_runes.join(", ")}</p>` : "") +
      (d.pf2e_custom_runes?.length ? `<p><strong>Custom Runes:</strong> ${d.pf2e_custom_runes.map(r => `${r.name}: ${r.effects}`).join("; ")}</p>` : "");

    return foundry.utils.mergeObject(base, {
      type: "armor",
      system: {
        description: { value: description },
        category: d.group || "light",
        group: groupMap[d.group] || null,
        acBonus: d.ac_bonus || 0,
        dexCap: d.dex_cap ?? 5,
        checkPenalty: d.check_penalty || 0,
        speedPenalty: d.speed_penalty || 0,
        strength: d.strength_threshold || 0,
        bulk: { value: this.parseBulk(d.bulk) },
        level: { value: d.level || 0 },
        price: this.parsePrice(d.price_text),
        rarity: d.rarity || "common",
        traits: traits,
        potencyRune: { value: potency || null },
        resiliencyRune: { value: resilientMap[d.pf2e_resilient_rune || ""] || null },
        propertyRune1: { value: d.pf2e_property_runes?.[0] || null },
        propertyRune2: { value: d.pf2e_property_runes?.[1] || null },
        propertyRune3: { value: d.pf2e_property_runes?.[2] || null },
        propertyRune4: { value: d.pf2e_property_runes?.[3] || null },
      },
    });
  }

  // ── Spell ──
  static mapSpell(base, d) {
    const traditions = {};
    (d.traditions || []).forEach(t => traditions[t.toLowerCase()] = true);

    return foundry.utils.mergeObject(base, {
      type: "spell",
      system: {
        description: base.system.description,
        level: { value: d.pf2e_rank ?? d.level ?? 1 },
        traditions: traditions,
        time: { value: d.pf2e_cast_actions || d.casting_time || "2" },
        range: { value: d.range || "" },
        duration: { value: d.duration || "" },
        defense: d.pf2e_defense ? { save: { statistic: d.pf2e_defense.toLowerCase(), basic: true } } : undefined,
        damage: d.damage_formula ? {
          "0": {
            formula: d.damage_formula,
            type: d.damage_type || "",
            kinds: ["damage"],
          },
        } : undefined,
        traits: this.buildTraitsObject(d.pf2e_traits || []),
      },
    });
  }

  // ── Equipment ──
  static mapEquipment(base, d) {
    return foundry.utils.mergeObject(base, {
      type: "equipment",
      system: {
        description: base.system.description,
        bulk: { value: this.parseBulk(d.pf2e_bulk) },
        level: { value: d.pf2e_level || 0 },
        price: this.parsePrice(d.pf2e_price_text),
        rarity: d.rarity || "common",
        traits: this.buildTraitsObject(d.pf2e_traits || []),
      },
    });
  }

  // ── Feat ──
  static mapFeat(base, d) {
    const actionMap = { "free action": "free", "reaction": "reaction", "1 action": 1, "2 actions": 2, "3 actions": 3 };

    return foundry.utils.mergeObject(base, {
      type: "feat",
      system: {
        description: base.system.description,
        level: { value: d.pf2e_level || 1 },
        featType: { value: d.pf2e_feat_type || "bonus" },
        actionType: { value: actionMap[d.pf2e_action_cost] !== undefined ? "action" : "passive" },
        actions: { value: actionMap[d.pf2e_action_cost] || null },
        prerequisites: { value: d.prerequisites ? [{ value: d.prerequisites }] : [] },
        traits: this.buildTraitsObject(d.pf2e_traits || []),
      },
    });
  }

  // ── Ancestry ──
  static mapAncestry(base, d) {
    return foundry.utils.mergeObject(base, {
      type: "ancestry",
      system: {
        description: base.system.description,
        hp: d.hp || 8,
        size: d.size || "med",
        speed: d.speed || 25,
        boosts: this.mapAbilityBoosts(d.ability_boosts || []),
        flaws: d.ability_flaw ? { "0": { value: [d.ability_flaw.substring(0, 3).toLowerCase()] } } : {},
        languages: { value: (d.languages || []).map(l => l.toLowerCase()), custom: "" },
        vision: d.vision || "normal",
        traits: this.buildTraitsObject([d.size || "medium", item?.name?.toLowerCase()].filter(Boolean)),
      },
    });
  }

  // ── Heritage ──
  static mapHeritage(base, d) {
    return foundry.utils.mergeObject(base, {
      type: "heritage",
      system: {
        description: base.system.description,
        ancestry: d.ancestry ? { name: d.ancestry } : null,
        traits: this.buildTraitsObject([]),
      },
    });
  }

  // ── Background ──
  static mapBackground(base, d) {
    return foundry.utils.mergeObject(base, {
      type: "background",
      system: {
        description: base.system.description,
        boosts: this.mapAbilityBoosts(d.pf2e_ability_boosts || []),
        trainedSkills: { value: d.pf2e_trained_skill ? [d.pf2e_trained_skill.toLowerCase().replace(/ /g, "-")] : [] },
        trainedLore: d.pf2e_trained_lore || "",
        traits: this.buildTraitsObject([]),
      },
    });
  }

  // ── Class ──
  static mapClass(base, d) {
    const rankMap = { "untrained": 0, "trained": 1, "expert": 2, "master": 3, "legendary": 4 };
    return foundry.utils.mergeObject(base, {
      type: "class",
      system: {
        description: base.system.description,
        keyAbility: { value: d.pf2e_key_ability ? [d.pf2e_key_ability.substring(0, 3).toLowerCase()] : ["str"] },
        hp: parseInt(d.hit_die?.replace(/\D/g, "")) || 8,
        perception: rankMap[d.pf2e_perception_rank] ?? 1,
        savingThrows: {
          fortitude: rankMap[d.pf2e_fortitude_rank] ?? 1,
          reflex: rankMap[d.pf2e_reflex_rank] ?? 1,
          will: rankMap[d.pf2e_will_rank] ?? 1,
        },
        classDC: rankMap[d.pf2e_class_dc_rank] ?? 1,
        traits: this.buildTraitsObject([]),
      },
    });
  }

  // ── Monster / NPC ──
  static mapMonsterToPf2e(item) {
    const d = item.data || {};
    const sizeMap = {
      tiny: "tiny", small: "sm", medium: "med",
      large: "lg", huge: "huge", gargantuan: "grg",
    };
    const size = sizeMap[d.size?.toLowerCase()] ?? "med";
    const speed = parseInt(d.speed) || 25;
    const level = d.pf2e_level ?? 1;

    return {
      name: item.name,
      type: "npc",
      img: item.image_url || "icons/svg/skull.svg",
      prototypeToken: {
        name: item.name,
        displayName: 20,
        actorLink: false,
        texture: {
          src: d.token_image_url || item.image_url || "icons/svg/skull.svg",
          scaleX: 1,
          scaleY: 1,
        },
        width: 1,
        height: 1,
        disposition: -1,
        displayBars: 20,
        bar1: { attribute: "attributes.hp" },
      },
      system: {
        abilities: {
          str: { mod: Math.floor(((d.str || 10) - 10) / 2) },
          dex: { mod: Math.floor(((d.dex || 10) - 10) / 2) },
          con: { mod: Math.floor(((d.con || 10) - 10) / 2) },
          int: { mod: Math.floor(((d.int || 10) - 10) / 2) },
          wis: { mod: Math.floor(((d.wis || 10) - 10) / 2) },
          cha: { mod: Math.floor(((d.cha || 10) - 10) / 2) },
        },
        attributes: {
          ac: { value: d.ac || 10 + level },
          hp: { value: d.hp || 10, max: d.hp || 10 },
          speed: { value: speed },
          allSaves: { value: "" },
        },
        details: {
          level: { value: level },
          alignment: { value: "" },
          publicNotes: item.description || "",
          privateNotes: "",
          creatureType: d.monster_type || "",
        },
        perception: { mod: d.pf2e_perception ?? 0 },
        saves: {
          fortitude: { value: d.pf2e_fortitude ?? 0 },
          reflex: { value: d.pf2e_reflex ?? 0 },
          will: { value: d.pf2e_will ?? 0 },
        },
        traits: {
          size: { value: size },
          value: d.pf2e_traits || [],
        },
      },
      flags: { [MODULE_ID]: { sourceId: item.id, version: item.version } },
    };
  }

  // ════════════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════════════

  static buildTraitsObject(traitArray) {
    return {
      value: (traitArray || []).map(t => t.toLowerCase()),
      custom: "",
    };
  }

  static parseBulk(bulkStr) {
    if (!bulkStr || bulkStr === "-") return 0;
    if (bulkStr === "L") return 0.1;
    return parseInt(bulkStr) || 0;
  }

  static parsePrice(priceText) {
    if (!priceText) return { value: { gp: 0 } };
    const match = priceText.match(/^([\d,]+)\s*(cp|sp|gp|pp)$/i);
    if (match) {
      const amount = parseInt(match[1].replace(/,/g, ""));
      const denom = match[2].toLowerCase();
      return { value: { [denom]: amount } };
    }
    // Try just a number (assume gp)
    const num = parseInt(priceText.replace(/[^\d]/g, ""));
    if (num) return { value: { gp: num } };
    return { value: { gp: 0 } };
  }

  static mapAbilityBoosts(boosts) {
    const result = {};
    (boosts || []).forEach((b, i) => {
      if (b.toLowerCase() === "free") {
        result[String(i)] = { value: [] };
      } else {
        result[String(i)] = { value: [b.substring(0, 3).toLowerCase()] };
      }
    });
    return result;
  }
}
