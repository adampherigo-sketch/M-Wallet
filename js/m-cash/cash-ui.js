/* =========================================================
   M-CASH  ·  ZEVARYN GRID  (ZG6)
   Cash-drawer interface rendered into #m-cash-root.

   Source of truth: storage.getCashState()
     { initialized, wallet:{denominations}, savings:{denominations},
       history:[], settings:{} }
   All totals are integer cents via MCashStorage.calculateTotalCashCents.
   ========================================================= */

const MCashUI = {

	initialized: false,

	/* internal sub-view router: home | add | spend | savings | recount */
	view: "home",

	/* working quantity map for the current data-entry sub-view */
	draft: null,
	draftPurpose: "",
	draftAmount: "",
	notice: null,


	/* ---------------------------------------------------- */

	getStorage() {
		return window.MWalletStorage || window.BudgetStorage || null;
	},

	getCashStorage() {
		return window.MCashStorage || null;
	},

	denominations() {
		const cs = this.getCashStorage();
		return cs ? cs.getDenominationDefinitions() : [];
	},

	totalCents(quantities) {
		const cs = this.getCashStorage();
		if (!cs) {
			return 0;
		}
		return cs.calculateTotalCashCents({ denominations: quantities || {} });
	},

	formatCents(cents) {
		const amount = (Number(cents) || 0) / 100;
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD"
		}).format(amount);
	},

	escape(value) {
		return String(value == null ? "" : value)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#039;");
	},

	denominationLabel(denomination) {
		if (denomination.type === "bill") {
			return "Number of " + denomination.label + " bills";
		}
		return "Number of " + denomination.label.toLowerCase() + " coins";
	},

	todayKey() {
		const now = new Date();
		return (
			now.getFullYear() +
			"-" +
			String(now.getMonth() + 1).padStart(2, "0") +
			"-" +
			String(now.getDate()).padStart(2, "0")
		);
	},

	formatDate(dateKey) {
		if (!dateKey) {
			return "";
		}
		const parts = String(dateKey).split("-");
		if (parts.length !== 3) {
			return String(dateKey);
		}
		const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
		if (Number.isNaN(date.getTime())) {
			return String(dateKey);
		}
		return new Intl.DateTimeFormat("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric"
		}).format(date);
	},


	/* ================= state read / commit ================= */

	readState() {
		const storage = this.getStorage();
		const cs = this.getCashStorage();

		if (!storage || !cs || typeof storage.getCashState !== "function") {
			return {
				initialized: false,
				wallet: cs ? cs.createEmptyWallet() : { denominations: {} },
				savings: { denominations: cs ? cs.createEmptyWallet().denominations : {} },
				history: [],
				settings: {}
			};
		}

		return storage.getCashState();
	},

	emptyQuantities() {
		return this.denominations().reduce((map, denomination) => {
			map[denomination.id] = 0;
			return map;
		}, {});
	},

	cloneQuantities(quantities) {
		const cs = this.getCashStorage();
		return cs
			? cs.normalizeDenominationQuantities(quantities || {})
			: {};
	},

	/*
		Persist a new cash state and refresh the rest of the app so
		the Dashboard M-Cash card / Total Balance stay state-driven.
	*/
	commit(nextState, historyEntry) {
		const storage = this.getStorage();
		if (!storage || typeof storage.saveCashState !== "function") {
			this.notice = { tone: "error", text: "M-Cash could not be saved." };
			return false;
		}

		if (historyEntry) {
			nextState.history = [
				{
					id: "mc-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
					date: this.todayKey(),
					...historyEntry
				},
				...(Array.isArray(nextState.history) ? nextState.history : [])
			].slice(0, 60);
		}

		const saved = storage.saveCashState(nextState);
		if (!saved) {
			this.notice = { tone: "error", text: "M-Cash could not be saved. Your existing cash data is unchanged." };
			return false;
		}

		if (window.BudgetApp && typeof window.BudgetApp.refresh === "function") {
			window.BudgetApp.refresh();
		}

		return true;
	},


	/* ================= lifecycle ================= */

	init() {
		if (this.initialized) {
			return;
		}

		const root = document.getElementById("m-cash-root");
		if (!root) {
			return;
		}

		this.root = root;

		root.addEventListener("click", (event) => this.handleClick(event));
		root.addEventListener("input", (event) => this.handleInput(event));
		root.addEventListener("submit", (event) => event.preventDefault());

		document.addEventListener("mwallet:page-changed", (event) => {
			if (event.detail && event.detail.page === "m-cash") {
				this.view = "home";
				this.draft = null;
				this.notice = null;
				this.render();
			}
		});

		document.addEventListener("mwallet:app-refreshed", () => {
			if (this.view === "home") {
				this.render();
			}
		});

		this.initialized = true;
		this.render();
	},

	go(view) {
		this.view = view;
		this.notice = null;

		const state = this.readState();

		if (view === "add") {
			this.draft = this.emptyQuantities();
		}
		else if (view === "savings") {
			this.draft = this.emptyQuantities();
			this.savingsDirection = "to-savings";
		}
		else if (view === "recount") {
			this.draft = this.cloneQuantities(state.wallet.denominations);
		}
		else if (view === "spend") {
			this.draft = null;
			this.draftAmount = "";
			this.draftPurpose = "";
			this.spendSuggestion = null;
		}
		else {
			this.draft = null;
		}

		this.render();
	},


	/* ================= events ================= */

	handleClick(event) {
		const el = event.target.closest("[data-mc-action]");
		if (!el) {
			return;
		}
		const action = el.dataset.mcAction;

		if (action === "home") { this.go("home"); return; }
		if (action === "add") { this.go("add"); return; }
		if (action === "spend") { this.go("spend"); return; }
		if (action === "savings") { this.go("savings"); return; }
		if (action === "recount") { this.go("recount"); return; }

		if (action === "return-home") {
			window.BudgetNavigation && window.BudgetNavigation.showPage("home");
			return;
		}

		if (action === "step") {
			const id = el.dataset.mcId;
			const delta = Number(el.dataset.mcDelta) || 0;
			if (this.draft && id) {
				const next = Math.max(0, (Number(this.draft[id]) || 0) + delta);
				this.draft[id] = next;
				this.updateDraftUI(id);
			}
			return;
		}

		if (action === "savings-direction") {
			this.savingsDirection = el.dataset.mcDirection;
			this.draft = this.emptyQuantities();
			this.render();
			return;
		}

		if (action === "suggest") { this.runSuggestion(); return; }
		if (action === "commit-add") { this.commitAdd(); return; }
		if (action === "commit-spend") { this.commitSpend(); return; }
		if (action === "commit-savings") { this.commitSavings(); return; }
		if (action === "commit-recount") { this.commitRecount(); return; }
		if (action === "reset-cash") { this.resetCash(); return; }
	},

	handleInput(event) {
		const field = event.target;

		if (field.matches("[data-mc-qty]")) {
			const id = field.dataset.mcQty;
			const raw = field.value.trim();
			const value = /^\d+$/.test(raw) ? Number(raw) : 0;
			if (this.draft) {
				this.draft[id] = Math.max(0, value);
				this.updateDraftUI(id);
			}
			return;
		}

		if (field.matches("[data-mc-amount]")) {
			this.draftAmount = field.value;
			this.spendSuggestion = null;
			const btn = this.root.querySelector('[data-mc-action="commit-spend"]');
			if (btn) { btn.disabled = true; }
			const box = this.root.querySelector("#mc-suggestion");
			if (box) { box.innerHTML = ""; }
			return;
		}

		if (field.matches("[data-mc-purpose]")) {
			this.draftPurpose = field.value;
			return;
		}
	},

	updateDraftUI(changedId) {
		if (changedId) {
			const sub = this.root.querySelector('[data-mc-subtotal="' + changedId + '"]');
			const stepper = this.root.querySelector('[data-mc-value="' + changedId + '"]');
			const input = this.root.querySelector('[data-mc-qty="' + changedId + '"]');
			const cs = this.getCashStorage();
			const denomination = this.denominations().find((d) => d.id === changedId);
			if (sub && denomination) {
				sub.textContent = this.formatCents(denomination.valueCents * (this.draft[changedId] || 0));
			}
			if (stepper) {
				stepper.textContent = String(this.draft[changedId] || 0);
			}
			if (input && String(input.value) !== String(this.draft[changedId] || 0)) {
				input.value = this.draft[changedId] || 0;
			}
			void cs;
		}

		const totalEl = this.root.querySelector("#mc-draft-total");
		if (totalEl && this.draft) {
			totalEl.textContent = this.formatCents(this.totalCents(this.draft));
		}
	},


	/* ================= operations ================= */

	draftIsEmpty() {
		return Object.keys(this.draft || {}).every((id) => (this.draft[id] || 0) === 0);
	},

	commitAdd() {
		if (this.draftIsEmpty()) {
			this.notice = { tone: "error", text: "Enter at least one bill or coin to add." };
			this.render();
			return;
		}

		const state = this.readState();
		const wallet = this.cloneQuantities(state.wallet.denominations);
		let addedCents = 0;

		this.denominations().forEach((denomination) => {
			const qty = this.draft[denomination.id] || 0;
			wallet[denomination.id] = (wallet[denomination.id] || 0) + qty;
			addedCents += denomination.valueCents * qty;
		});

		state.wallet = { denominations: wallet };
		state.initialized = true;

		if (this.commit(state, {
			type: "add",
			label: "Added cash",
			amountCents: addedCents
		})) {
			this.notice = { tone: "ok", text: "Added " + this.formatCents(addedCents) + " to M-Cash." };
			this.go("home");
		}
		else {
			this.render();
		}
	},

	runSuggestion() {
		this.notice = null;
		const amountCents = Math.round(parseFloat(this.draftAmount) * 100);

		if (!Number.isFinite(amountCents) || amountCents <= 0) {
			this.spendSuggestion = { ok: false, reason: "amount" };
			this.renderSuggestion();
			return;
		}

		const state = this.readState();
		this.spendSuggestion = window.MCashCalculator
			? window.MCashCalculator.suggestBreakdown(amountCents, state.wallet)
			: { ok: false, reason: "amount" };

		this.renderSuggestion();
	},

	commitSpend() {
		const suggestion = this.spendSuggestion;
		if (!suggestion || !suggestion.ok) {
			return;
		}

		const state = this.readState();
		const wallet = this.cloneQuantities(state.wallet.denominations);

		const insufficient = Object.keys(suggestion.breakdown).some(
			(id) => (suggestion.breakdown[id] || 0) > (wallet[id] || 0)
		);
		if (insufficient) {
			this.notice = { tone: "error", text: "Your cash changed — recalculate the combination." };
			this.spendSuggestion = null;
			this.render();
			return;
		}

		Object.keys(suggestion.breakdown).forEach((id) => {
			wallet[id] = (wallet[id] || 0) - suggestion.breakdown[id];
		});

		state.wallet = { denominations: wallet };

		const purpose = String(this.draftPurpose || "").trim();

		if (this.commit(state, {
			type: "spend",
			label: purpose ? purpose : "Cash spent",
			amountCents: -suggestion.totalCents
		})) {
			this.notice = { tone: "ok", text: "Removed " + this.formatCents(suggestion.totalCents) + " from M-Cash." };
			this.go("home");
		}
		else {
			this.render();
		}
	},

	commitSavings() {
		if (this.draftIsEmpty()) {
			this.notice = { tone: "error", text: "Choose the bills or coins to move." };
			this.render();
			return;
		}

		const state = this.readState();
		const direction = this.savingsDirection === "to-wallet" ? "to-wallet" : "to-savings";

		const result = window.MCashSavings
			? window.MCashSavings.moveDenominations(state, this.draft, direction)
			: { ok: false, reason: "amount" };

		if (!result.ok) {
			this.notice = {
				tone: "error",
				text: result.reason === "insufficient"
					? "You don't have that much cash " + (direction === "to-wallet" ? "in Cash Savings." : "available.")
					: "Choose the bills or coins to move."
			};
			this.render();
			return;
		}

		const movedCents = this.totalCents(this.draft);
		state.wallet = { denominations: result.wallet };
		state.savings = { denominations: result.savings };

		if (this.commit(state, {
			type: direction === "to-wallet" ? "unsave" : "save",
			label: direction === "to-wallet" ? "Moved from Cash Savings" : "Moved to Cash Savings",
			amountCents: direction === "to-wallet" ? movedCents : -movedCents
		})) {
			this.notice = {
				tone: "ok",
				text: (direction === "to-wallet" ? "Returned " : "Set aside ") + this.formatCents(movedCents) + "."
			};
			this.go("home");
		}
		else {
			this.render();
		}
	},

	commitRecount() {
		const state = this.readState();
		const wallet = this.cloneQuantities(this.draft);
		state.wallet = { denominations: wallet };
		state.initialized = true;

		if (this.commit(state, {
			type: "recount",
			label: "Recounted cash",
			amountCents: this.totalCents(wallet)
		})) {
			this.notice = { tone: "ok", text: "Cash inventory updated." };
			this.go("home");
		}
		else {
			this.render();
		}
	},

	resetCash() {
		/* native confirm — matches the rest of the app's destructive flows */
		if (!window.confirm("Reset M-Cash? This clears every bill and coin count and Cash Savings.")) {
			return;
		}

		const cs = this.getCashStorage();
		const state = this.readState();
		state.wallet = cs ? cs.createEmptyWallet() : { denominations: {} };
		state.savings = { denominations: cs ? cs.createEmptyWallet().denominations : {} };
		state.initialized = false;

		if (this.commit(state, { type: "recount", label: "Reset M-Cash", amountCents: 0 })) {
			this.notice = { tone: "ok", text: "M-Cash was reset." };
			this.go("home");
		}
		else {
			this.render();
		}
	},


	/* ================= rendering ================= */

	render() {
		if (!this.root) {
			this.root = document.getElementById("m-cash-root");
		}
		if (!this.root) {
			return;
		}

		const state = this.readState();
		let body = "";

		if (this.view === "add") { body = this.renderAdd(state); }
		else if (this.view === "spend") { body = this.renderSpend(state); }
		else if (this.view === "savings") { body = this.renderSavings(state); }
		else if (this.view === "recount") { body = this.renderRecount(state); }
		else { body = this.renderHome(state); }

		this.root.innerHTML = `
			<div class="page-heading zg-mc-heading">
				<div>
					<span class="z-eyebrow">M-Wallet / M-Cash</span>
					<h2>M-Cash</h2>
					<p>Track the physical cash you have on hand.</p>
				</div>
			</div>

			<nav class="zg-mc-nav" aria-label="M-Cash sections">
				${this.navButton("home", "Overview")}
				${this.navButton("add", "Add Cash")}
				${this.navButton("spend", "Calculator")}
				${this.navButton("savings", "Cash Savings")}
				${this.navButton("recount", "Recount")}
				<button type="button" class="zg-mc-nav-btn zg-mc-nav-btn--exit" data-mc-action="return-home">Back to Wallet</button>
			</nav>

			${this.noticeHTML()}

			<div class="zg-mc">${body}</div>
		`;

		this.notice = null;
	},

	navButton(view, label) {
		const active = this.view === view ? " is-active" : "";
		return `<button type="button" class="zg-mc-nav-btn${active}" data-mc-action="${view}"${
			this.view === view ? ' aria-current="page"' : ""
		}>${label}</button>`;
	},

	noticeHTML() {
		if (!this.notice) {
			return "";
		}
		return `<p class="zg-mc-notice zg-mc-notice--${this.escape(this.notice.tone)}">${this.escape(this.notice.text)}</p>`;
	},

	/* ---- denomination tiles / rows ---- */

	denominationGroup(type, quantities, opts) {
		const options = opts || {};
		const rows = this.denominations()
			.filter((denomination) => denomination.type === type)
			.map((denomination) => {
				const qty = Number(quantities[denomination.id]) || 0;
				const subtotal = denomination.valueCents * qty;

				if (options.editable) {
					return `
						<div class="zg-mc-denom zg-mc-denom--edit">
							<div class="zg-mc-denom-face">
								<strong>${this.escape(denomination.label)}</strong>
								<small>${denomination.type === "bill" ? "bill" : "coin"}</small>
							</div>
							<div class="zg-mc-stepper">
								<button type="button" class="zg-mc-step" data-mc-action="step" data-mc-id="${denomination.id}" data-mc-delta="-1" aria-label="Decrease ${this.escape(this.denominationLabel(denomination))}">&minus;</button>
								<input
									type="text"
									inputmode="numeric"
									class="zg-mc-qty"
									data-mc-qty="${denomination.id}"
									data-mc-value="${denomination.id}"
									value="${qty}"
									aria-label="${this.escape(this.denominationLabel(denomination))}"
								>
								<button type="button" class="zg-mc-step" data-mc-action="step" data-mc-id="${denomination.id}" data-mc-delta="1" aria-label="Increase ${this.escape(this.denominationLabel(denomination))}">+</button>
							</div>
							<span class="zg-mc-denom-sub" data-mc-subtotal="${denomination.id}">${this.formatCents(subtotal)}</span>
						</div>
					`;
				}

				return `
					<div class="zg-mc-denom${qty === 0 ? " is-zero" : ""}">
						<strong class="zg-mc-denom-label">${this.escape(denomination.label)}</strong>
						<span class="zg-mc-denom-qty">${qty}<small>${denomination.type === "bill" ? (qty === 1 ? "bill" : "bills") : (qty === 1 ? "coin" : "coins")}</small></span>
						<span class="zg-mc-denom-sub">${this.formatCents(subtotal)}</span>
					</div>
				`;
			})
			.join("");

		return `
			<section class="zg-mc-card">
				<span class="z-eyebrow">${type === "bill" ? "Bills" : "Coins"}</span>
				<div class="zg-mc-denom-grid${options.editable ? " is-edit" : ""}">${rows}</div>
			</section>
		`;
	},

	/* ---- HOME ---- */

	renderHome(state) {
		const walletCents = this.totalCents(state.wallet.denominations);
		const savedCents = this.totalCents(state.savings.denominations);
		const totalCents = walletCents + savedCents;

		const savingsCard = savedCents > 0
			? `
				<section class="zg-mc-card zg-mc-savings">
					<span class="z-eyebrow">Cash Savings</span>
					<div class="zg-mc-savings-grid">
						<div><span>Set aside</span><strong>${this.formatCents(savedCents)}</strong></div>
						<div><span>Available to spend</span><strong class="is-teal">${this.formatCents(walletCents)}</strong></div>
					</div>
					<button type="button" class="zg-mc-link" data-mc-action="savings">Manage Cash Savings</button>
				</section>
			`
			: "";

		const history = Array.isArray(state.history) ? state.history : [];
		const activityCard = history.length === 0
			? ""
			: `
				<section class="zg-mc-card">
					<span class="z-eyebrow">Cash Activity</span>
					<div class="zg-mc-activity">
						${history.slice(0, 8).map((entry) => {
							const cents = Number(entry.amountCents) || 0;
							const tone = cents > 0 ? "in" : (cents < 0 ? "out" : "flat");
							return `
								<div class="zg-mc-act-row zg-mc-act-row--${tone}">
									<div>
										<strong>${this.escape(entry.label || "Cash change")}</strong>
										<span>${this.escape(this.formatDate(entry.date))}</span>
									</div>
									<span class="zg-mc-act-amount">${cents === 0 ? "&mdash;" : (cents > 0 ? "+" : "&minus;") + this.formatCents(Math.abs(cents)).replace("-", "")}</span>
								</div>
							`;
						}).join("")}
					</div>
				</section>
			`;

		const emptyHint = (walletCents === 0 && savedCents === 0)
			? `<p class="zg-mc-empty">No cash tracked yet. Use <strong>Recount</strong> to enter what's in your wallet, or <strong>Add Cash</strong> as you get it.</p>`
			: "";

		return `
			<section class="zg-mc-card zg-mc-hero">
				<span class="z-eyebrow">M-Cash Balance</span>
				<p class="zg-mc-hero-value">${this.formatCents(totalCents)}</p>
				<p class="zg-mc-hero-sub">Physical cash currently tracked${savedCents > 0 ? ` &middot; ${this.formatCents(walletCents)} available` : ""}</p>
			</section>

			<div class="zg-mc-actions">
				<button type="button" class="zg-mc-action" data-mc-action="add"><span aria-hidden="true">＋</span> Add Cash</button>
				<button type="button" class="zg-mc-action" data-mc-action="spend"><span aria-hidden="true">▦</span> Calculator</button>
				<button type="button" class="zg-mc-action" data-mc-action="savings"><span aria-hidden="true">◈</span> Cash Savings</button>
				<button type="button" class="zg-mc-action" data-mc-action="recount"><span aria-hidden="true">↻</span> Recount</button>
			</div>

			${emptyHint}
			${this.denominationGroup("bill", state.wallet.denominations, {})}
			${this.denominationGroup("coin", state.wallet.denominations, {})}
			${savingsCard}
			${activityCard}
		`;
	},

	/* ---- ADD CASH ---- */

	renderAdd(state) {
		void state;
		return `
			<section class="zg-mc-card">
				<span class="z-eyebrow">Add Cash</span>
				<p class="zg-mc-lead">Enter the bills and coins you're adding. This is added to your current inventory.</p>
				${this.denominationGroup("bill", this.draft, { editable: true })}
				${this.denominationGroup("coin", this.draft, { editable: true })}
				<div class="zg-mc-total-row">
					<span>Amount added</span>
					<strong id="mc-draft-total">${this.formatCents(this.totalCents(this.draft))}</strong>
				</div>
				<div class="zg-mc-form-actions">
					<button type="button" class="zg-mc-btn" data-mc-action="home">Cancel</button>
					<button type="button" class="zg-mc-btn zg-mc-btn--primary" data-mc-action="commit-add">Add Cash</button>
				</div>
			</section>
		`;
	},

	/* ---- CALCULATOR / SPEND ---- */

	renderSpend(state) {
		return `
			<section class="zg-mc-card">
				<span class="z-eyebrow">Cash Calculator</span>
				<p class="zg-mc-lead">Enter an amount and M-Cash suggests a combination from the cash you hold.</p>

				<div class="zg-mc-field">
					<label for="mc-amount">Amount needed</label>
					<input type="text" inputmode="decimal" id="mc-amount" data-mc-amount placeholder="0.00" value="${this.escape(this.draftAmount)}">
				</div>
				<div class="zg-mc-field">
					<label for="mc-purpose">Purpose <span class="zg-mc-optional">— optional</span></label>
					<input type="text" id="mc-purpose" data-mc-purpose placeholder="Example: Dinner" value="${this.escape(this.draftPurpose)}">
				</div>

				<div class="zg-mc-total-row">
					<span>Available cash</span>
					<strong>${this.formatCents(this.totalCents(state.wallet.denominations))}</strong>
				</div>

				<div class="zg-mc-form-actions">
					<button type="button" class="zg-mc-btn" data-mc-action="home">Cancel</button>
					<button type="button" class="zg-mc-btn zg-mc-btn--primary" data-mc-action="suggest">Suggest combination</button>
				</div>

				<div id="mc-suggestion" class="zg-mc-suggestion">${this.suggestionHTML()}</div>
			</section>
		`;
	},

	renderSuggestion() {
		const box = this.root.querySelector("#mc-suggestion");
		if (box) {
			box.innerHTML = this.suggestionHTML();
		}
	},

	suggestionHTML() {
		const suggestion = this.spendSuggestion;
		if (!suggestion) {
			return "";
		}

		if (!suggestion.ok) {
			if (suggestion.reason === "amount") {
				return `<p class="zg-mc-suggestion-msg">Enter an amount greater than zero.</p>`;
			}
			return `<p class="zg-mc-suggestion-msg">Exact cash combination unavailable. Try a different amount or add more denominations.</p>`;
		}

		const denomMap = this.denominations().reduce((map, d) => { map[d.id] = d; return map; }, {});
		const rows = Object.keys(suggestion.breakdown)
			.sort((a, b) => denomMap[b].valueCents - denomMap[a].valueCents)
			.map((id) => `
				<div class="zg-mc-sug-row">
					<span>${this.escape(denomMap[id].label)} <small>&times; ${suggestion.breakdown[id]}</small></span>
					<span>${this.formatCents(denomMap[id].valueCents * suggestion.breakdown[id])}</span>
				</div>
			`).join("");

		return `
			<div class="zg-mc-sug">
				<span class="z-eyebrow">Suggested cash</span>
				${rows}
				<div class="zg-mc-sug-total">
					<span>Total</span>
					<strong>${this.formatCents(suggestion.totalCents)}</strong>
				</div>
				<div class="zg-mc-form-actions">
					<button type="button" class="zg-mc-btn zg-mc-btn--primary" data-mc-action="commit-spend">Accept &amp; remove from M-Cash</button>
				</div>
			</div>
		`;
	},

	/* ---- CASH SAVINGS ---- */

	renderSavings(state) {
		const walletCents = this.totalCents(state.wallet.denominations);
		const savedCents = this.totalCents(state.savings.denominations);
		const direction = this.savingsDirection === "to-wallet" ? "to-wallet" : "to-savings";
		const sourceQuantities = direction === "to-wallet"
			? state.savings.denominations
			: state.wallet.denominations;

		void sourceQuantities;

		return `
			<section class="zg-mc-card zg-mc-savings">
				<span class="z-eyebrow">Cash Savings</span>
				<p class="zg-mc-lead">Set physical cash aside from your spending inventory. Total M-Cash never changes — only how much is available.</p>
				<div class="zg-mc-savings-grid">
					<div><span>Set aside</span><strong>${this.formatCents(savedCents)}</strong></div>
					<div><span>Available to spend</span><strong class="is-teal">${this.formatCents(walletCents)}</strong></div>
					<div><span>Total M-Cash</span><strong>${this.formatCents(walletCents + savedCents)}</strong></div>
				</div>
			</section>

			<section class="zg-mc-card">
				<div class="zg-mc-toggle" role="group" aria-label="Direction">
					<button type="button" class="zg-mc-toggle-btn${direction === "to-savings" ? " is-active" : ""}" data-mc-action="savings-direction" data-mc-direction="to-savings" aria-pressed="${direction === "to-savings"}">Move to savings</button>
					<button type="button" class="zg-mc-toggle-btn${direction === "to-wallet" ? " is-active" : ""}" data-mc-action="savings-direction" data-mc-direction="to-wallet" aria-pressed="${direction === "to-wallet"}">Return to spending</button>
				</div>
				<p class="zg-mc-lead">${direction === "to-savings"
					? "Choose bills and coins to move out of spending cash."
					: "Choose bills and coins to move back into spending cash."}</p>
				${this.denominationGroup("bill", this.draft, { editable: true })}
				${this.denominationGroup("coin", this.draft, { editable: true })}
				<div class="zg-mc-total-row">
					<span>Amount to move</span>
					<strong id="mc-draft-total">${this.formatCents(this.totalCents(this.draft))}</strong>
				</div>
				<div class="zg-mc-form-actions">
					<button type="button" class="zg-mc-btn" data-mc-action="home">Cancel</button>
					<button type="button" class="zg-mc-btn zg-mc-btn--primary" data-mc-action="commit-savings">${direction === "to-savings" ? "Move to Cash Savings" : "Return to spending"}</button>
				</div>
			</section>
		`;
	},

	/* ---- RECOUNT / STARTING BALANCE ---- */

	renderRecount(state) {
		const initialised = state.initialized === true;
		return `
			<section class="zg-mc-card">
				<span class="z-eyebrow">${initialised ? "Recount Cash" : "Starting Cash Balance"}</span>
				<p class="zg-mc-lead">Enter the exact number of each denomination you currently have. This replaces the current spending inventory.</p>
				${this.denominationGroup("bill", this.draft, { editable: true })}
				${this.denominationGroup("coin", this.draft, { editable: true })}
				<div class="zg-mc-total-row">
					<span>${initialised ? "Counted total" : "Starting total"}</span>
					<strong id="mc-draft-total">${this.formatCents(this.totalCents(this.draft))}</strong>
				</div>
				<div class="zg-mc-form-actions">
					<button type="button" class="zg-mc-btn" data-mc-action="home">Cancel</button>
					<button type="button" class="zg-mc-btn zg-mc-btn--primary" data-mc-action="commit-recount">${initialised ? "Save recount" : "Save starting balance"}</button>
				</div>
			</section>

			<section class="zg-mc-card">
				<span class="z-eyebrow">Danger zone</span>
				<p class="zg-mc-lead">Clear every bill and coin count and Cash Savings.</p>
				<div class="zg-mc-form-actions">
					<button type="button" class="zg-mc-btn zg-mc-btn--danger" data-mc-action="reset-cash">Reset M-Cash</button>
				</div>
			</section>
		`;
	}

};

window.MCashUI = MCashUI;
