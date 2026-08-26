const CASH_DENOMINATIONS = [
	{ id: "bill-1", type: "bill", label: "$1", valueCents: 100, order: 1 },
	{ id: "bill-2", type: "bill", label: "$2", valueCents: 200, order: 2 },
	{ id: "bill-5", type: "bill", label: "$5", valueCents: 500, order: 3 },
	{ id: "bill-10", type: "bill", label: "$10", valueCents: 1000, order: 4 },
	{ id: "bill-20", type: "bill", label: "$20", valueCents: 2000, order: 5 },
	{ id: "bill-50", type: "bill", label: "$50", valueCents: 5000, order: 6 },
	{ id: "bill-100", type: "bill", label: "$100", valueCents: 10000, order: 7 },
	{ id: "coin-penny", type: "coin", label: "Penny", valueCents: 1, order: 8 },
	{ id: "coin-nickel", type: "coin", label: "Nickel", valueCents: 5, order: 9 },
	{ id: "coin-dime", type: "coin", label: "Dime", valueCents: 10, order: 10 },
	{ id: "coin-quarter", type: "coin", label: "Quarter", valueCents: 25, order: 11 },
	{ id: "coin-half-dollar", type: "coin", label: "Half Dollar", valueCents: 50, order: 12 },
	{ id: "coin-dollar", type: "coin", label: "Dollar Coin", valueCents: 100, order: 13 }
];

function normalizeQuantity(value) {
	if (typeof value === "string") {
		const normalized = value.trim();

		if (!/^\+?\d+$/.test(normalized)) {
			return 0;
		}

		value = Number(normalized);
	}

	if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
		return 0;
	}

	return value;
}

function getDenominationDefinitions() {
	return CASH_DENOMINATIONS.map(denomination => ({ ...denomination }));
}

function createEmptyWallet() {
	return {
		denominations: CASH_DENOMINATIONS.reduce((quantities, denomination) => {
			quantities[denomination.id] = 0;
			return quantities;
		}, {})
	};
}

function normalizeDenominationQuantities(quantities = {}) {
	const normalized = {};

	CASH_DENOMINATIONS.forEach(denomination => {
		normalized[denomination.id] = normalizeQuantity(
			quantities[denomination.id]
		);
	});

	return normalized;
}

function normalizeWallet(wallet = {}) {
	return {
		denominations: normalizeDenominationQuantities(
			wallet.denominations
		)
	};
}

function calculateTotalCashCents(wallet = {}) {
	const quantities = normalizeDenominationQuantities(
		wallet.denominations
	);

	return CASH_DENOMINATIONS.reduce(
		(total, denomination) => (
			total + denomination.valueCents * quantities[denomination.id]
		),
		0
	);
}

window.MCashStorage = {
	getDenominationDefinitions,
	createEmptyWallet,
	normalizeQuantity,
	normalizeDenominationQuantities,
	normalizeWallet,
	calculateTotalCashCents
};
