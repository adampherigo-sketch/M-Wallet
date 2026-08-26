const MCashUI = {

	initialized: false,


	init() {

		if (this.initialized) {
			return;
		}

		const root =
			document.getElementById(
				"m-cash-root"
			);

		if (!root) {
			return;
		}

		root.innerHTML = `
			<div class="page-heading">
				<div>
					<h2>M-Cash</h2>
					<p>Cash management will be available here.</p>
				</div>
				<button
					type="button"
					class="secondary-button"
					data-m-cash-return
				>
					Back to Home
				</button>
			</div>

			<section class="dashboard-section m-cash-placeholder">
				<div class="m-cash-placeholder-icon" aria-hidden="true">$</div>
				<h3>M-Cash</h3>
				<p>This area is ready for the next M-Cash milestone.</p>
			</section>
		`;

		const returnButton =
			root.querySelector(
				"[data-m-cash-return]"
			);

		if (returnButton) {
			returnButton.addEventListener(
				"click",
				() => {
					window.BudgetNavigation?.showPage(
						"home"
					);
				}
			);
		}

		this.initialized = true;
	}

};

window.MCashUI =
	MCashUI;
