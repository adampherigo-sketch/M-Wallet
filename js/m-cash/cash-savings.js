/* =========================================================
   M-CASH
   Cash Savings (ZG6)

   Cash Savings is an *allocation* of the physical cash the
   user already holds — the same denomination model, tracked
   in cash.savings.denominations. Moving cash in or out of
   Cash Savings never changes total M-Cash; it only changes
   how much is available to spend.

     total     = wallet + savings   (unchanged by a move)
     available = wallet
     saved     = savings

   Pure helpers — the caller persists via storage.saveCashState.
   ========================================================= */

(function () {
	"use strict";

	function normalize(quantities) {
		return window.MCashStorage
			? window.MCashStorage.normalizeDenominationQuantities(quantities || {})
			: {};
	}

	function definitions() {
		return window.MCashStorage
			? window.MCashStorage.getDenominationDefinitions()
			: [];
	}

	function totalCents(quantities) {
		const q = normalize(quantities);
		return definitions().reduce(function (total, denomination) {
			return total + denomination.valueCents * (q[denomination.id] || 0);
		}, 0);
	}

	function isEmpty(quantities) {
		const q = normalize(quantities);
		return Object.keys(q).every(function (id) {
			return (q[id] || 0) === 0;
		});
	}

	/*
		direction: "to-savings"  moves wallet -> savings
		           "to-wallet"   moves savings -> wallet

		Returns { ok: true, wallet, savings } with fresh normalized
		quantity maps, or { ok: false, reason: "amount" | "insufficient" }.
	*/
	function moveDenominations(state, moves, direction) {
		const wallet = normalize(state && state.wallet && state.wallet.denominations);
		const savings = normalize(state && state.savings && state.savings.denominations);
		const requested = normalize(moves);

		if (isEmpty(requested)) {
			return { ok: false, reason: "amount" };
		}

		const from = direction === "to-wallet" ? savings : wallet;
		const to = direction === "to-wallet" ? wallet : savings;

		const insufficient = definitions().some(function (denomination) {
			return (requested[denomination.id] || 0) > (from[denomination.id] || 0);
		});

		if (insufficient) {
			return { ok: false, reason: "insufficient" };
		}

		definitions().forEach(function (denomination) {
			const amount = requested[denomination.id] || 0;
			from[denomination.id] = (from[denomination.id] || 0) - amount;
			to[denomination.id] = (to[denomination.id] || 0) + amount;
		});

		return {
			ok: true,
			wallet: direction === "to-wallet" ? to : from,
			savings: direction === "to-wallet" ? from : to
		};
	}

	window.MCashSavings = {
		totalCents: totalCents,
		isEmpty: isEmpty,
		moveDenominations: moveDenominations
	};
})();
