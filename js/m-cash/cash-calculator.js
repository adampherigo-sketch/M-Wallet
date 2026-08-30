/* =========================================================
   M-CASH
   Denomination calculator (ZG6)

   Pure integer-cent math. Given an amount and the current
   wallet inventory, suggest a spendable combination of the
   denominations the user actually holds — largest first,
   like a real cash drawer. No storage access here.
   ========================================================= */

(function () {
	"use strict";

	function definitions() {
		return window.MCashStorage
			? window.MCashStorage.getDenominationDefinitions()
			: [];
	}

	function normalizeQuantities(quantities) {
		return window.MCashStorage
			? window.MCashStorage.normalizeDenominationQuantities(quantities || {})
			: {};
	}

	/*
		Greedy largest-denomination-first breakdown, bounded by the
		quantity of each denomination the wallet currently holds.

		Returns:
		  { ok: true,  breakdown: { id: qty }, totalCents }
		  { ok: false, reason: "amount" | "unavailable", shortfallCents }
	*/
	function suggestBreakdown(amountCents, wallet) {
		const target = Math.round(Number(amountCents));

		if (!Number.isFinite(target) || target <= 0) {
			return { ok: false, reason: "amount" };
		}

		const available = normalizeQuantities(wallet && wallet.denominations);

		const ordered = definitions()
			.slice()
			.sort((a, b) => b.valueCents - a.valueCents);

		const breakdown = {};
		let remaining = target;

		ordered.forEach(function (denomination) {
			if (remaining <= 0) {
				return;
			}

			const held = available[denomination.id] || 0;
			if (held <= 0) {
				return;
			}

			const needed = Math.floor(remaining / denomination.valueCents);
			const take = Math.min(needed, held);

			if (take > 0) {
				breakdown[denomination.id] = take;
				remaining -= take * denomination.valueCents;
			}
		});

		if (remaining !== 0) {
			return {
				ok: false,
				reason: "unavailable",
				shortfallCents: remaining
			};
		}

		return {
			ok: true,
			breakdown: breakdown,
			totalCents: target
		};
	}

	function breakdownTotalCents(breakdown) {
		const map = definitions().reduce(function (lookup, denomination) {
			lookup[denomination.id] = denomination.valueCents;
			return lookup;
		}, {});

		return Object.keys(breakdown || {}).reduce(function (total, id) {
			return total + (map[id] || 0) * (Number(breakdown[id]) || 0);
		}, 0);
	}

	window.MCashCalculator = {
		suggestBreakdown: suggestBreakdown,
		breakdownTotalCents: breakdownTotalCents
	};
})();
