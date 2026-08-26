/* =========================================================
   M-CASH
   Feature Entry / Initialization
   cash.js
   ========================================================= */

const MCash = {

	initialized: false,


	init() {

		if (this.initialized) {
			return;
		}

		if (
			window.MCashUI &&
			typeof window.MCashUI.init ===
				"function"
		) {
			window.MCashUI.init();
		}

		this.initialized = true;
	}

};

window.MCash =
	MCash;
