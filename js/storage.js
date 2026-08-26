/* =========================================================
   M-WALLET
   Local Storage / Data Management
   storage.js

   Savings System Upgrade
   Version 5

   Checking ↔ General Savings ↔ Savings Goals
   ========================================================= */

/*
    DEFAULT CATEGORY LIBRARY (P2.6.1)

    Single canonical definition of the official M-Wallet system
    category/subcategory taxonomy. This is intentionally the only
    place the default taxonomy is listed; BudgetStorage.getDefaultCategories()
    stamps every entry with system: true and enabled: true, and
    seedDefaultCategories() merges any missing default ids into
    data.settings.categories without touching existing entries.
*/
const DEFAULT_CATEGORIES = [

    { id: "housing", name: "Housing", subcategories: [
        { id: "rent", name: "Rent" },
        { id: "mortgage", name: "Mortgage" },
        { id: "home-repairs", name: "Home Repairs" },
        { id: "furniture", name: "Furniture" },
        { id: "home-improvement", name: "Home Improvement" },
        { id: "property-fees", name: "Property Fees" },
        { id: "other-housing", name: "Other Housing" }
    ] },

    { id: "utilities", name: "Utilities", subcategories: [
        { id: "electric", name: "Electric" },
        { id: "water", name: "Water" },
        { id: "gas", name: "Gas" },
        { id: "internet", name: "Internet" },
        { id: "phone", name: "Phone" },
        { id: "trash", name: "Trash" },
        { id: "sewer", name: "Sewer" },
        { id: "other-utilities", name: "Other Utilities" }
    ] },

    { id: "groceries", name: "Groceries", subcategories: [
        { id: "food", name: "Food" },
        { id: "produce", name: "Produce" },
        { id: "meat", name: "Meat" },
        { id: "snacks", name: "Snacks" },
        { id: "drinks", name: "Drinks" },
        { id: "household-groceries", name: "Household Supplies" },
        { id: "other-groceries", name: "Other Groceries" }
    ] },

    { id: "dining", name: "Dining", subcategories: [
        { id: "restaurants", name: "Restaurants" },
        { id: "fast-food", name: "Fast Food" },
        { id: "coffee", name: "Coffee" },
        { id: "delivery", name: "Food Delivery" },
        { id: "bars", name: "Bars" },
        { id: "other-dining", name: "Other Dining" }
    ] },

    { id: "transportation", name: "Transportation", subcategories: [
        { id: "fuel", name: "Fuel" },
        { id: "public-transit", name: "Public Transit" },
        { id: "rideshare", name: "Rideshare" },
        { id: "parking", name: "Parking" },
        { id: "tolls", name: "Tolls" },
        { id: "vehicle-maintenance", name: "Vehicle Maintenance" },
        { id: "vehicle-repair", name: "Vehicle Repair" },
        { id: "other-transportation", name: "Other Transportation" }
    ] },

    { id: "health", name: "Health", subcategories: [
        { id: "doctor", name: "Doctor" },
        { id: "pharmacy", name: "Pharmacy" },
        { id: "dental", name: "Dental" },
        { id: "vision", name: "Vision" },
        { id: "therapy", name: "Therapy" },
        { id: "medical-equipment", name: "Medical Equipment" },
        { id: "hospital", name: "Hospital" },
        { id: "other-health", name: "Other Health" }
    ] },

    { id: "pets", name: "Pets", subcategories: [
        { id: "pet-food", name: "Food" },
        { id: "vet", name: "Vet" },
        { id: "pet-medication", name: "Medication" },
        { id: "pet-supplies", name: "Supplies" },
        { id: "grooming", name: "Grooming" },
        { id: "boarding", name: "Boarding" },
        { id: "other-pets", name: "Other Pets" }
    ] },

    { id: "shopping", name: "Shopping", subcategories: [
        { id: "clothing", name: "Clothing" },
        { id: "electronics", name: "Electronics" },
        { id: "home-goods", name: "Home Goods" },
        { id: "personal-items", name: "Personal Items" },
        { id: "online-shopping", name: "Online Shopping" },
        { id: "other-shopping", name: "Other Shopping" }
    ] },

    { id: "entertainment", name: "Entertainment", subcategories: [
        { id: "movies", name: "Movies" },
        { id: "gaming", name: "Gaming" },
        { id: "streaming", name: "Streaming" },
        { id: "hobbies", name: "Hobbies" },
        { id: "nightlife", name: "Nightlife" },
        { id: "other-entertainment", name: "Other Entertainment" }
    ] },

    { id: "personal-care", name: "Personal Care", subcategories: [
        { id: "hair", name: "Hair" },
        { id: "grooming", name: "Grooming" },
        { id: "skincare", name: "Skincare" },
        { id: "beauty", name: "Beauty" },
        { id: "massage", name: "Massage" },
        { id: "other-personal-care", name: "Other Personal Care" }
    ] },

    { id: "travel", name: "Travel", subcategories: [
        { id: "lodging", name: "Lodging" },
        { id: "flights", name: "Flights" },
        { id: "train", name: "Train" },
        { id: "rental-car", name: "Rental Car" },
        { id: "travel-food", name: "Travel Food" },
        { id: "travel-activities", name: "Activities" },
        { id: "other-travel", name: "Other Travel" }
    ] },

    { id: "education", name: "Education", subcategories: [
        { id: "tuition", name: "Tuition" },
        { id: "books", name: "Books" },
        { id: "courses", name: "Courses" },
        { id: "supplies", name: "School Supplies" },
        { id: "certifications", name: "Certifications" },
        { id: "other-education", name: "Other Education" }
    ] },

    { id: "subscriptions", name: "Subscriptions", subcategories: [
        { id: "streaming-subscription", name: "Streaming" },
        { id: "software", name: "Software" },
        { id: "membership", name: "Memberships" },
        { id: "cloud-storage", name: "Cloud Storage" },
        { id: "news-media", name: "News & Media" },
        { id: "other-subscriptions", name: "Other Subscriptions" }
    ] },

    { id: "gifts", name: "Gifts", subcategories: [
        { id: "birthday", name: "Birthday" },
        { id: "holiday", name: "Holiday" },
        { id: "charity", name: "Charity / Donations" },
        { id: "personal-gifts", name: "Personal Gifts" },
        { id: "other-gifts", name: "Other Gifts" }
    ] },

    { id: "tickets-events", name: "Tickets & Events", subcategories: [
        { id: "concerts", name: "Concerts" },
        { id: "festivals", name: "Festivals" },
        { id: "sporting-events", name: "Sporting Events" },
        { id: "theater", name: "Theater" },
        { id: "conventions", name: "Conventions" },
        { id: "event-tickets", name: "Other Event Tickets" }
    ] },

    { id: "debt", name: "Debt", subcategories: [
        { id: "credit-card", name: "Credit Card" },
        { id: "personal-loan", name: "Personal Loan" },
        { id: "student-loan", name: "Student Loan" },
        { id: "medical-debt", name: "Medical Debt" },
        { id: "other-debt", name: "Other Debt" }
    ] },

    { id: "insurance", name: "Insurance", subcategories: [
        { id: "auto-insurance", name: "Auto Insurance" },
        { id: "health-insurance", name: "Health Insurance" },
        { id: "renters-insurance", name: "Renters Insurance" },
        { id: "home-insurance", name: "Home Insurance" },
        { id: "life-insurance", name: "Life Insurance" },
        { id: "other-insurance", name: "Other Insurance" }
    ] },

    { id: "taxes", name: "Taxes", subcategories: [
        { id: "income-tax", name: "Income Tax" },
        { id: "property-tax", name: "Property Tax" },
        { id: "tax-preparation", name: "Tax Preparation" },
        { id: "fees-penalties", name: "Fees & Penalties" },
        { id: "other-taxes", name: "Other Taxes" }
    ] },

    { id: "fees", name: "Fees", subcategories: [
        { id: "bank-fees", name: "Bank Fees" },
        { id: "late-fees", name: "Late Fees" },
        { id: "service-fees", name: "Service Fees" },
        { id: "atm-fees", name: "ATM Fees" },
        { id: "other-fees", name: "Other Fees" }
    ] },

    { id: "household", name: "Household", subcategories: [
        { id: "cleaning-supplies", name: "Cleaning Supplies" },
        { id: "paper-products", name: "Paper Products" },
        { id: "tools", name: "Tools" },
        { id: "household-maintenance", name: "Maintenance" },
        { id: "other-household", name: "Other Household" }
    ] },

    { id: "other", name: "Other", subcategories: [
        { id: "miscellaneous", name: "Miscellaneous" },
        { id: "uncategorized", name: "Uncategorized" }
    ] }

];

/*
    LEGACY CATEGORY ALIASES (P2.6.2)

    Unambiguous, hand-audited aliases only. Each key is a legacy
    Bill/Expense/Transaction "category" string (trimmed, lowercased)
    that does not literally match a default category name but has
    always meant one specific category/subcategory pair in this app
    (e.g. the Bill form's "Phone" option is really Utilities/Phone).

    Deliberately excluded, per audit:
      - "Tickets & Events" / "Personal Care" need no alias; they are
        exact (case-insensitive) matches on default category names
        already handled by resolveCategoryId.
      - "Rent" is never used as a category value anywhere in the
        app (only as a Bill/Expense name), so no alias is added for
        it to avoid guessing at an unused mapping.
      - "Income", "Bills", "Personal", "Savings", "Transfer" are
        Manual Transaction classification labels, not spending
        categories, and are intentionally never aliased here.
*/
const CATEGORY_ALIASES = {
    "phone": { categoryId: "utilities", subcategoryId: "phone" },
    "internet": { categoryId: "utilities", subcategoryId: "internet" }
};

const BudgetStorage = {

    storageKey: "mWalletData",

    legacyStorageKeys: [
        "budgetTrackerData"
    ],

    version: 5,


    /* =====================================================
       1. BASIC HELPERS
       ===================================================== */

    now() {

        return new Date()
            .toISOString();

    },


    toNumber(value) {

        const number =
            Number(value);


        return Number.isFinite(number)
            ? number
            : 0;

    },


    toPositiveNumber(value) {

        return Math.abs(
            this.toNumber(value)
        );

    },


    normalizeString(
        value,
        fallback = ""
    ) {

        const text =
            String(
                value ?? ""
            ).trim();


        return text || fallback;

    },


    // Deep-copies plain JSON-safe data so callers can't mutate
    // internal storage state without going through a save().
    cloneJSON(
        value
    ) {

        return JSON.parse(
            JSON.stringify(
                value
            )
        );

    },


    generateId(
        prefix = "item"
    ) {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID ===
                "function"
        ) {

            return (
                `${prefix}-` +
                window.crypto.randomUUID()
            );

        }


        return (
            `${prefix}-` +
            `${Date.now()}-` +
            `${Math.random()
                .toString(16)
                .slice(2)}`
        );

    },


    getRecordId(
        item,
        prefix
    ) {

        return (
            item?.id ||
            this.generateId(prefix)
        );

    },


    isDateString(value) {

        return (
            typeof value === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(
                value
            )
        );

    },


    formatDateUTC(date) {

        const year =
            date.getUTCFullYear();


        const month =
            String(
                date.getUTCMonth() + 1
            ).padStart(
                2,
                "0"
            );


        const day =
            String(
                date.getUTCDate()
            ).padStart(
                2,
                "0"
            );


        return (
            `${year}-` +
            `${month}-` +
            `${day}`
        );

    },


    parseDateUTC(dateValue) {

        if (
            !this.isDateString(
                dateValue
            )
        ) {

            return null;

        }


        const [
            year,
            month,
            day
        ] =
            dateValue
                .split("-")
                .map(Number);


        const date =
            new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day
                )
            );


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return null;

        }


        return date;

    },


    addDays(
        dateValue,
        amount
    ) {

        const date =
            this.parseDateUTC(
                dateValue
            );


        if (!date) {

            return dateValue;

        }


        date.setUTCDate(
            date.getUTCDate() +
            Number(
                amount || 0
            )
        );


        return this.formatDateUTC(
            date
        );

    },


    daysInMonth(
        year,
        month
    ) {

        return new Date(
            Date.UTC(
                Number(year),
                Number(month),
                0
            )
        ).getUTCDate();

    },


    addMonthsClamped(
        dateValue,
        amount
    ) {

        const date =
            this.parseDateUTC(
                dateValue
            );


        if (!date) {

            return dateValue;

        }


        const originalDay =
            date.getUTCDate();


        const target =
            new Date(
                Date.UTC(
                    date.getUTCFullYear(),
                    date.getUTCMonth() +
                        Number(
                            amount || 0
                        ),
                    1
                )
            );


        const finalDay =
            Math.min(

                originalDay,

                this.daysInMonth(
                    target.getUTCFullYear(),
                    target.getUTCMonth() + 1
                )

            );


        target.setUTCDate(
            finalDay
        );


        return this.formatDateUTC(
            target
        );

    },


    addYearsClamped(
        dateValue,
        amount
    ) {

        return this.addMonthsClamped(

            dateValue,

            Number(
                amount || 0
            ) * 12

        );

    },


    getCurrentMonthKey() {

        const today =
            new Date();


        const year =
            today.getFullYear();


        const month =
            String(
                today.getMonth() + 1
            ).padStart(
                2,
                "0"
            );


        return (
            `${year}-` +
            `${month}`
        );

    },


    getTodayDate() {

        const today =
            new Date();


        const year =
            today.getFullYear();


        const month =
            String(
                today.getMonth() + 1
            ).padStart(
                2,
                "0"
            );


        const day =
            String(
                today.getDate()
            ).padStart(
                2,
                "0"
            );


        return (
            `${year}-` +
            `${month}-` +
            `${day}`
        );

    },


    getSelectedMonthKey() {

        const monthSelect =
            document.getElementById(
                "month-select"
            );


        const yearSelect =
            document.getElementById(
                "year-select"
            );


        if (
            monthSelect?.value &&
            yearSelect?.value
        ) {

            return (
                `${yearSelect.value}-` +
                `${monthSelect.value}`
            );

        }


        return this.getCurrentMonthKey();

    },


    getMonthKeyFromDate(
        dateValue
    ) {

        if (
            this.isDateString(
                dateValue
            )
        ) {

            return dateValue.slice(
                0,
                7
            );

        }


        const date =
            new Date(
                dateValue
            );


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return this
                .getSelectedMonthKey();

        }


        const year =
            date.getFullYear();


        const month =
            String(
                date.getMonth() + 1
            ).padStart(
                2,
                "0"
            );


        return (
            `${year}-` +
            `${month}`
        );

    },


    getDefaultDateForMonth(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return (
            `${monthKey}-01`
        );

    },


    getMonthStart(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return (
            `${monthKey}-01`
        );

    },


    getMonthEnd(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const [
            year,
            month
        ] =
            monthKey
                .split("-")
                .map(Number);


        return (
            `${monthKey}-` +
            `${String(
                this.daysInMonth(
                    year,
                    month
                )
            ).padStart(
                2,
                "0"
            )}`
        );

    },


    getYearStart(year) {

        return (
            `${String(year)}-01-01`
        );

    },


    getYearEnd(year) {

        return (
            `${String(year)}-12-31`
        );

    },


    isDateInRange(
        dateValue,
        startDate,
        endDate
    ) {

        return Boolean(

            dateValue &&

            dateValue >=
                startDate &&

            dateValue <=
                endDate

        );

    },


    getCashStorage() {

        return window.MCashStorage || null;

    },


    /* =====================================================
       2. DEFAULT DATA
       ===================================================== */

    createDefaultCashState() {

        const cashStorage =
            this.getCashStorage();


        const emptyWallet =
            cashStorage
                ? cashStorage.createEmptyWallet()
                : { denominations: {} };


        return {

            initialized:
                false,


            wallet:
                emptyWallet,


            savings:
                {
                    denominations:
                        { ...emptyWallet.denominations }
                },


            history: [],


            settings: {}

        };

    },

    createDefaultData() {

        return {

            version:
                this.version,


            migrations: {

                savingsAccountV5:
                    true,

                categoriesV1:
                    true,

                categoriesResolutionV1:
                    true

            },


            settings: {

                currency:
                    "USD",

                currencySymbol:
                    "$",

                firstDayOfWeek:
                    "sunday",

                /*
                    P2.6.0 established the structure; P2.6.1 seeds
                    it with the default system category library.
                */
                categories: {

                    version:
                        1,

                    list:
                        this.seedDefaultCategories(
                            []
                        )

                }

            },


            income: [],

            expenses: [],

            months: {},

            savingsGoals: [],

            savingsTransfers: [],


            cash:
                this.createDefaultCashState(),


            accounts: {

                checking: {

                    name:
                        "Checking",

                    balance:
                        0

                },


                savings: {

                    name:
                        "General Savings",

                    balance:
                        0

                }

            }

        };

    },


    createDefaultMonth(
        monthKey
    ) {

        return {

            monthKey,

            startingBalance:
                0,

            endingBalance:
                0,


            paychecks: [],

            bills: [],

            expenses: [],

            transactions: [],

            savingsDeposits: [],


            /*
                Kept for older versions of M-Wallet.

                Internal Savings → Goal transfers now live
                globally in data.savingsTransfers.
            */

            savingsTransfers: [],


            notes:
                "",


            createdAt:
                this.now(),

            updatedAt:
                this.now()

        };

    },


    /* =====================================================
       3. NORMALIZATION
       ===================================================== */

    normalizeMonth(
        month,
        monthKey
    ) {

        if (
            !month ||
            typeof month !==
                "object"
        ) {

            return this
                .createDefaultMonth(
                    monthKey
                );

        }


        month.monthKey =
            month.monthKey ||
            monthKey;


        month.startingBalance =
            this.toNumber(
                month.startingBalance
            );


        month.endingBalance =
            this.toNumber(
                month.endingBalance
            );


        [
            "paychecks",
            "bills",
            "expenses",
            "transactions"
        ].forEach(
            key => {

                if (
                    !Array.isArray(
                        month[key]
                    )
                ) {

                    month[key] =
                        [];

                }

            }
        );


        if (
            !Array.isArray(
                month.savingsDeposits
            )
        ) {

            month.savingsDeposits =

                Array.isArray(
                    month.savingsTransfers
                )

                    ? [
                        ...month.savingsTransfers
                    ]

                    : [];

        }


        month.savingsDeposits =
            month.savingsDeposits.map(
                deposit =>
                    this.normalizeSavingsDeposit(
                        deposit,
                        monthKey
                    )
            );


        /*
            Monthly savingsTransfers remains a compatibility
            alias only.

            New internal goal allocations live in the
            global data.savingsTransfers array.
        */

        month.savingsTransfers =
            month.savingsDeposits;


        month.notes =
            typeof month.notes ===
                "string"

                ? month.notes

                : "";


        month.createdAt =
            month.createdAt ||
            this.now();


        month.updatedAt =
            month.updatedAt ||
            this.now();


        return month;

    },


    normalizeIncome(
        income
    ) {

        const recurring =
            Boolean(
                income?.recurring
            );


        const frequency =
            recurring

                ? this.normalizeString(
                    income?.frequency,
                    "monthly"
                )

                : "";


        return {

            id:
                this.getRecordId(
                    income,
                    "income"
                ),


            name:
                this.normalizeString(

                    income?.name ||
                    income?.source,

                    "Income"

                ),


            source:
                this.normalizeString(

                    income?.source ||
                    income?.name,

                    "Income"

                ),


            amount:
                this.toPositiveNumber(
                    income?.amount
                ),


            date:
                this.isDateString(
                    income?.date
                )

                    ? income.date

                    : this
                        .getDefaultDateForMonth(),


            category:
                this.normalizeString(
                    income?.category,
                    "Other Income"
                ),


            incomeType:
                this.normalizeString(
                    income?.incomeType,
                    "income"
                ),


            recurring,

            frequency,


            twiceMonthlyDays:

                Array.isArray(
                    income?.twiceMonthlyDays
                )

                    ? [

                        Math.min(
                            31,
                            Math.max(
                                1,
                                Number(
                                    income.twiceMonthlyDays[0]
                                ) || 1
                            )
                        ),

                        Math.min(
                            31,
                            Math.max(
                                1,
                                Number(
                                    income.twiceMonthlyDays[1]
                                ) || 15
                            )
                        )

                    ]

                    : [
                        1,
                        15
                    ],


            customInterval:
                Math.max(
                    1,
                    Number(
                        income?.customInterval
                    ) || 1
                ),


            customUnit:
                this.normalizeString(
                    income?.customUnit,
                    "months"
                ),


            endDate:
                this.isDateString(
                    income?.endDate
                )

                    ? income.endDate

                    : "",


            notes:
                this.normalizeString(
                    income?.notes
                ),


            legacyPaycheckId:
                income?.legacyPaycheckId ||
                null,


            legacyMonthKey:
                income?.legacyMonthKey ||
                null,


            createdAt:
                income?.createdAt ||
                this.now(),


            updatedAt:
                income?.updatedAt ||
                this.now()

        };

    },


    normalizeExpense(
        expense
    ) {

        const recurring =
            Boolean(
                expense?.recurring
            );


        const frequency =
            recurring

                ? this.normalizeString(
                    expense?.frequency,
                    "monthly"
                )

                : "";


        return {

            id:
                this.getRecordId(
                    expense,
                    "expense"
                ),


            name:
                this.normalizeString(
                    expense?.name,
                    "Expense"
                ),


            merchant:
                this.normalizeString(

                    expense?.merchant ||
                    expense?.vendor ||
                    expense?.payee ||
                    expense?.place

                ),


            amount:
                this.toPositiveNumber(
                    expense?.amount
                ),


            date:
                this.isDateString(
                    expense?.date
                )

                    ? expense.date

                    : this
                        .getDefaultDateForMonth(),


            category:
                this.normalizeString(
                    expense?.category,
                    "Other"
                ),


            subcategory:
                this.normalizeString(
                    expense?.subcategory
                ),


            /*
                P2.6.2: classification ids resolved from the legacy
                category/subcategory strings above. Preserved as-is
                on every normalization pass; never (re)computed here.
            */
            categoryId:
                expense?.categoryId ||
                null,

            subcategoryId:
                expense?.subcategoryId ||
                null,


            paymentMethod:
                this.normalizeString(
                    expense?.paymentMethod,
                    "Checking"
                ),


            recurring,

            frequency,


            customInterval:
                Math.max(
                    1,
                    Number(
                        expense?.customInterval
                    ) || 1
                ),


            customUnit:
                this.normalizeString(
                    expense?.customUnit,
                    "months"
                ),


            endDate:
                this.isDateString(
                    expense?.endDate
                )

                    ? expense.endDate

                    : "",


            notes:
                this.normalizeString(
                    expense?.notes
                ),


            legacyExpenseId:
                expense?.legacyExpenseId ||
                null,


            legacyMonthKey:
                expense?.legacyMonthKey ||
                null,


            createdAt:
                expense?.createdAt ||
                this.now(),


            updatedAt:
                expense?.updatedAt ||
                this.now()

        };

    },


    normalizeSavingsGoal(
        goal
    ) {

        const targetAmount =
            this.toPositiveNumber(
                goal?.targetAmount
            );


        const currentAmount =
            this.toPositiveNumber(
                goal?.currentAmount
            );


        return {

            id:
                this.getRecordId(
                    goal,
                    "goal"
                ),


            name:
                this.normalizeString(
                    goal?.name,
                    "Savings Goal"
                ),


            targetAmount,

            currentAmount,


            createdMonthKey:
                goal?.createdMonthKey ||
                goal?.monthKey ||
                this.getSelectedMonthKey(),


            targetDate:
                this.isDateString(
                    goal?.targetDate
                )

                    ? goal.targetDate

                    : "",


            notes:
                this.normalizeString(
                    goal?.notes
                ),


            completed:
                targetAmount > 0 &&
                currentAmount >=
                    targetAmount,


            createdAt:
                goal?.createdAt ||
                this.now(),


            updatedAt:
                goal?.updatedAt ||
                this.now()

        };

    },


    normalizeSavingsDeposit(
        deposit,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const goalId =
            deposit?.goalId ||
            null;


        const rawAmount =
            this.toNumber(
                deposit?.amount
            );


        let transferType =
            this.normalizeString(
                deposit?.transferType ||
                deposit?.type
            );


        if (
            !transferType
        ) {

            if (
                goalId
            ) {

                transferType =
                    "goal-deposit";

            }

            else if (
                rawAmount < 0
            ) {

                transferType =
                    "withdrawal";

            }

            else {

                transferType =
                    "deposit";

            }

        }


        let amount =
            rawAmount;


        if (
            transferType ===
            "withdrawal"
        ) {

            amount =
                -this.toPositiveNumber(
                    rawAmount
                );

        }

        else {

            amount =
                this.toPositiveNumber(
                    rawAmount
                );

        }


        const direction =

            transferType ===
                "withdrawal"

                ? "savings-to-checking"

                : goalId

                    ? "checking-to-goal"

                    : "checking-to-savings";


        return {

            id:
                this.getRecordId(
                    deposit,
                    "savings-deposit"
                ),


            goalId,

            name:
                this.normalizeString(

                    deposit?.name,

                    transferType ===
                        "withdrawal"

                        ? "Savings Withdrawal"

                        : goalId

                            ? "Savings Goal Deposit"

                            : "Savings Deposit"

                ),


            date:
                this.isDateString(
                    deposit?.date
                )

                    ? deposit.date

                    : this
                        .getDefaultDateForMonth(
                            monthKey
                        ),


            monthKey:
                deposit?.monthKey ||
                monthKey,


            amount,

            transferType,

            direction,


            notes:
                this.normalizeString(
                    deposit?.notes
                ),


            createdAt:
                deposit?.createdAt ||
                this.now(),


            updatedAt:
                deposit?.updatedAt ||
                deposit?.createdAt ||
                this.now()

        };

    },


    normalizeSavingsTransfer(
        transfer
    ) {

        const type =
            this.normalizeString(
                transfer?.type,
                "savings-to-goal"
            );


        const date =
            this.isDateString(
                transfer?.date
            )

                ? transfer.date

                : this.getTodayDate();


        return {

            id:
                this.getRecordId(
                    transfer,
                    "savings-transfer"
                ),


            type,


            goalId:
                transfer?.goalId ||
                null,


            goalName:
                this.normalizeString(
                    transfer?.goalName
                ),


            amount:
                this.toPositiveNumber(
                    transfer?.amount
                ),


            date,

            monthKey:
                transfer?.monthKey ||
                this.getMonthKeyFromDate(
                    date
                ),


            notes:
                this.normalizeString(
                    transfer?.notes
                ),


            createdAt:
                transfer?.createdAt ||
                this.now()

        };

    },


    /*
        DEFAULT CATEGORY LIBRARY ACCESSOR (P2.6.1)

        Returns a fresh, deep clone of the canonical DEFAULT_CATEGORIES
        taxonomy with system: true / enabled: true stamped on every
        category and subcategory. Callers can never mutate the shared
        constant through this accessor.
    */
    getDefaultCategories() {

        return DEFAULT_CATEGORIES.map(
            category => ({

                id:
                    category.id,

                name:
                    category.name,

                system:
                    true,

                enabled:
                    true,

                subcategories:
                    category.subcategories.map(
                        subcategory => ({

                            id:
                                subcategory.id,

                            name:
                                subcategory.name,

                            system:
                                true,

                            enabled:
                                true

                        })
                    )

            })
        );

    },


    /*
        DEFAULT CATEGORY SEEDING (P2.6.1)

        Merges the default system library into an already-normalized
        category list. Any default category/subcategory id that is
        not yet present is appended as system: true, enabled: true.
        Anything already present (custom categories, custom
        subcategories, and any user enabled/disabled preference on a
        system entry) is left completely untouched. Running this
        repeatedly against its own output is a no-op, so seeding is
        idempotent and safe to run on every normalization.
    */
    seedDefaultCategories(
        list
    ) {

        const merged =
            list.map(
                category => ({

                    ...category,

                    subcategories:
                        category.subcategories.map(
                            subcategory => (
                                { ...subcategory }
                            )
                        )

                })
            );


        this.getDefaultCategories().forEach(
            defaultCategory => {

                const nameKey =
                    defaultCategory.name.toLowerCase();

                let existing =
                    merged.find(
                        category =>
                            category.id ===
                            defaultCategory.id
                    );


                if (
                    !existing
                ) {

                    // A different category already owns this name.
                    const nameTaken =
                        merged.some(
                            category =>
                                category.name.toLowerCase() ===
                                nameKey
                        );


                    if (
                        nameTaken
                    ) {
                        return;
                    }


                    existing = {

                        id:
                            defaultCategory.id,

                        name:
                            defaultCategory.name,

                        system:
                            true,

                        enabled:
                            true,

                        subcategories:
                            []

                    };

                    merged.push(
                        existing
                    );

                }


                defaultCategory.subcategories.forEach(
                    defaultSubcategory => {

                        const subNameKey =
                            defaultSubcategory.name.toLowerCase();

                        const hasSubcategory =
                            existing.subcategories.some(
                                subcategory =>
                                    subcategory.id ===
                                        defaultSubcategory.id ||
                                    subcategory.name.toLowerCase() ===
                                        subNameKey
                            );


                        if (
                            !hasSubcategory
                        ) {

                            existing.subcategories.push(
                                {

                                    id:
                                        defaultSubcategory.id,

                                    name:
                                        defaultSubcategory.name,

                                    system:
                                        true,

                                    enabled:
                                        true

                                }
                            );

                        }

                    }
                );

            }
        );


        return merged;

    },


    /*
        LEGACY CATEGORY RESOLUTION (P2.6.2)

        Pure, deterministic helpers that resolve a legacy category/
        subcategory string to the stable ids introduced in P2.6.0/
        P2.6.1. Matching is trimmed + case-insensitive only — never
        fuzzy — so a typo such as "Grocerries" is left unresolved
        rather than silently guessed at. Callers pass the current
        categories list explicitly so these stay pure and testable.
    */
    resolveCategoryId(
        categoryList,
        rawCategory
    ) {

        const key =
            String(
                rawCategory ?? ""
            ).trim().toLowerCase();


        if (
            !key
        ) {
            return null;
        }


        const alias =
            CATEGORY_ALIASES[
                key
            ];


        if (
            alias
        ) {
            return alias.categoryId;
        }


        const list =
            Array.isArray(
                categoryList
            )
                ? categoryList
                : [];


        const match =
            list.find(
                category =>
                    category.name
                        .trim()
                        .toLowerCase() ===
                    key
            );


        return match
            ? match.id
            : null;

    },


    resolveSubcategoryId(
        categoryList,
        categoryId,
        rawSubcategory
    ) {

        const key =
            String(
                rawSubcategory ?? ""
            ).trim().toLowerCase();


        if (
            !key ||
            !categoryId
        ) {
            return null;
        }


        const list =
            Array.isArray(
                categoryList
            )
                ? categoryList
                : [];


        const category =
            list.find(
                item =>
                    item.id ===
                    categoryId
            );


        if (
            !category
        ) {
            return null;
        }


        const subcategories =
            Array.isArray(
                category.subcategories
            )
                ? category.subcategories
                : [];


        const match =
            subcategories.find(
                subcategory =>
                    subcategory.name
                        .trim()
                        .toLowerCase() ===
                    key
            );


        return match
            ? match.id
            : null;

    },


    /*
        Resolves a legacy category string and (optionally) a legacy
        subcategory string together in one call, honoring aliases
        that already imply a specific subcategory (e.g. "Phone").
    */
    resolveCategoryIds(
        categoryList,
        rawCategory,
        rawSubcategory
    ) {

        const key =
            String(
                rawCategory ?? ""
            ).trim().toLowerCase();


        const alias =
            key
                ? CATEGORY_ALIASES[
                    key
                ]
                : null;


        if (
            alias
        ) {

            const subcategoryId =
                alias.subcategoryId ||
                this.resolveSubcategoryId(
                    categoryList,
                    alias.categoryId,
                    rawSubcategory
                );


            return {

                categoryId:
                    alias.categoryId,

                subcategoryId:
                    subcategoryId ||
                    null

            };

        }


        const categoryId =
            this.resolveCategoryId(
                categoryList,
                rawCategory
            );


        if (
            !categoryId
        ) {

            return {

                categoryId:
                    null,

                subcategoryId:
                    null

            };

        }


        return {

            categoryId,

            subcategoryId:
                this.resolveSubcategoryId(
                    categoryList,
                    categoryId,
                    rawSubcategory
                )

        };

    },


    /*
        CATEGORY CONFIGURATION NORMALIZATION (P2.6.0 / P2.6.1)

        Normalizes data.settings.categories only. It never
        touches expense/bill/transaction category strings —
        legacy resolution is a separate, later phase (P2.6.2).

        As of P2.6.1, this also seeds the default system category
        library (seedDefaultCategories) after normalizing whatever
        was already persisted, so defaults can be safely introduced
        without ever overwriting custom categories, custom
        subcategories, or a user's enabled/disabled preferences.
    */
    normalizeCategoryConfig(
        config
    ) {

        const source =
            config &&
            typeof config === "object"
                ? config
                : {};


        const rawList =
            Array.isArray(
                source.list
            )
                ? source.list
                : [];


        const seenIds =
            new Set();

        const seenNames =
            new Set();

        const list =
            [];


        rawList.forEach(
            raw => {

                const category =
                    this.normalizeCategory(
                        raw
                    );


                if (
                    !category
                ) {
                    return;
                }


                const nameKey =
                    category.name.toLowerCase();


                /*
                    Conservative dedupe: first valid entry wins.
                    Later entries sharing an id or a trimmed,
                    case-insensitive name are dropped rather than
                    merged, so malformed persisted data can never
                    silently combine two distinct categories.
                */
                if (
                    seenIds.has(
                        category.id
                    ) ||
                    seenNames.has(
                        nameKey
                    )
                ) {
                    return;
                }


                seenIds.add(
                    category.id
                );

                seenNames.add(
                    nameKey
                );

                list.push(
                    category
                );

            }
        );


        return {

            version:
                Number(
                    source.version
                ) || 1,

            list:
                this.seedDefaultCategories(
                    list
                )

        };

    },


    normalizeCategory(
        raw
    ) {

        if (
            !raw ||
            typeof raw !== "object"
        ) {
            return null;
        }


        const id =
            String(
                raw.id ?? ""
            ).trim();

        const name =
            String(
                raw.name ?? ""
            ).trim();


        // Malformed entries are dropped, never replaced with a
        // randomly generated stand-in category.
        if (
            !id ||
            !name
        ) {
            return null;
        }


        const rawSubcategories =
            Array.isArray(
                raw.subcategories
            )
                ? raw.subcategories
                : [];


        const seenIds =
            new Set();

        const seenNames =
            new Set();

        const subcategories =
            [];


        rawSubcategories.forEach(
            rawSub => {

                const subcategory =
                    this.normalizeSubcategory(
                        rawSub
                    );


                if (
                    !subcategory
                ) {
                    return;
                }


                const nameKey =
                    subcategory.name.toLowerCase();


                if (
                    seenIds.has(
                        subcategory.id
                    ) ||
                    seenNames.has(
                        nameKey
                    )
                ) {
                    return;
                }


                seenIds.add(
                    subcategory.id
                );

                seenNames.add(
                    nameKey
                );

                subcategories.push(
                    subcategory
                );

            }
        );


        return {

            id,

            name,

            system:
                Boolean(
                    raw.system
                ),

            enabled:
                raw.enabled !== false,

            subcategories

        };

    },


    normalizeSubcategory(
        raw
    ) {

        if (
            !raw ||
            typeof raw !== "object"
        ) {
            return null;
        }


        const id =
            String(
                raw.id ?? ""
            ).trim();

        const name =
            String(
                raw.name ?? ""
            ).trim();


        if (
            !id ||
            !name
        ) {
            return null;
        }


        return {

            id,

            name,

            system:
                Boolean(
                    raw.system
                ),

            enabled:
                raw.enabled !== false

        };

    },


    /* =====================================================
       4. MIGRATIONS
       ===================================================== */

    normalizeCashState(
        cash
    ) {

        const cashStorage =
            this.getCashStorage();


        const defaults =
            this.createDefaultCashState();


        if (
            !cashStorage
        ) {

            return defaults;

        }


        const source =
            cash &&
            typeof cash ===
                "object"
                ? cash
                : {};


        const wallet =
            cashStorage.normalizeWallet(
                source.wallet
            );


        const savingsSource =
            source.savings &&
            typeof source.savings ===
                "object"
                ? source.savings
                : {};


        return {

            initialized:
                source.initialized === true,


            wallet,


            savings:
                {
                    denominations:
                        cashStorage.normalizeDenominationQuantities(
                            savingsSource.denominations
                        )
                },


            history:
                Array.isArray(
                    source.history
                )
                    ? this.cloneJSON(
                        source.history
                    )
                    : [],


            settings:
                source.settings &&
                typeof source.settings ===
                    "object"
                    ? this.cloneJSON(
                        source.settings
                    )
                    : {}

        };

    },

    migrateLegacyPaychecks(
        data
    ) {

        Object.entries(
            data.months
        ).forEach(
            ([
                monthKey,
                month
            ]) => {

                month.paychecks.forEach(
                    paycheck => {

                        const alreadyMigrated =
                            data.income.some(
                                item =>
                                    item.legacyPaycheckId ===
                                    paycheck.id
                            );


                        if (
                            alreadyMigrated
                        ) {

                            return;

                        }


                        data.income.push(

                            this.normalizeIncome({

                                id:
                                    this.generateId(
                                        "income"
                                    ),

                                name:
                                    paycheck.name ||
                                    "Paycheck",

                                source:
                                    paycheck.name ||
                                    "Paycheck",

                                amount:
                                    paycheck.amount,

                                date:
                                    paycheck.payDate ||
                                    this.getDefaultDateForMonth(
                                        monthKey
                                    ),

                                category:
                                    "Employment",

                                incomeType:
                                    "paycheck",

                                recurring:
                                    false,

                                notes:
                                    paycheck.notes ||
                                    "",

                                legacyPaycheckId:
                                    paycheck.id,

                                legacyMonthKey:
                                    monthKey,

                                createdAt:
                                    paycheck.createdAt ||
                                    this.now()

                            })

                        );

                    }
                );

            }
        );

    },


    migrateLegacyExpenses(
        data
    ) {

        Object.entries(
            data.months
        ).forEach(
            ([
                monthKey,
                month
            ]) => {

                month.expenses.forEach(
                    expense => {

                        const alreadyMigrated =
                            data.expenses.some(
                                item =>
                                    item.legacyExpenseId ===
                                    expense.id
                            );


                        if (
                            alreadyMigrated
                        ) {

                            return;

                        }


                        data.expenses.push(

                            this.normalizeExpense({

                                ...expense,

                                id:
                                    this.generateId(
                                        "expense"
                                    ),

                                date:
                                    expense.date ||
                                    this.getDefaultDateForMonth(
                                        monthKey
                                    ),

                                recurring:
                                    Boolean(
                                        expense.recurring
                                    ),

                                frequency:
                                    expense.frequency ||
                                    (
                                        expense.recurring
                                            ? "monthly"
                                            : ""
                                    ),

                                legacyExpenseId:
                                    expense.id,

                                legacyMonthKey:
                                    monthKey

                            })

                        );

                    }
                );

            }
        );

    },


    migrateSavingsAccountV5(
        data,
        previousVersion
    ) {

        if (
            data.migrations
                ?.savingsAccountV5
        ) {

            return;

        }


        let legacyGeneralSavings =
            0;


        Object.values(
            data.months ||
            {}
        ).forEach(
            month => {

                const deposits =
                    Array.isArray(
                        month.savingsDeposits
                    )

                        ? month.savingsDeposits

                        : [];


                deposits.forEach(
                    deposit => {

                        /*
                            Goal deposits already exist inside
                            goal.currentAmount.

                            Only unallocated/general deposits
                            become the new General Savings pool.
                        */

                        if (
                            !deposit.goalId
                        ) {

                            legacyGeneralSavings +=
                                this.toNumber(
                                    deposit.amount
                                );

                        }

                    }
                );

            }
        );


        const existingBalance =
            this.toNumber(
                data.accounts
                    ?.savings
                    ?.balance
            );


        /*
            accounts.savings.balance existed before v5 but
            was not actively used by M-Wallet.

            For v4 and older, rebuild it from saved general
            savings deposits.
        */

        if (
            Number(
                previousVersion
            ) < 5
        ) {

            data.accounts.savings.balance =
                Math.max(
                    0,
                    legacyGeneralSavings
                );

        }

        else {

            data.accounts.savings.balance =
                Math.max(
                    0,
                    existingBalance
                );

        }


        data.migrations =
            data.migrations ||
            {};


        data.migrations.savingsAccountV5 =
            true;

    },


    /*
        P2.6.0 only establishes data.settings.categories.

        It intentionally does NOT resolve legacy expense/bill/
        transaction category strings to IDs (that is P2.6.2),
        and it must never auto-create permanent custom categories
        from unmatched legacy strings such as "Grocerries" —
        unresolved strings stay untouched until a deliberate
        future migration rule or user action handles them.
    */
    migrateCategoriesV1(
        data
    ) {

        if (
            data.migrations
                ?.categoriesV1
        ) {
            return;
        }


        data.settings =
            data.settings ||
            {};

        data.settings.categories =
            this.normalizeCategoryConfig(
                data.settings.categories
            );


        data.migrations =
            data.migrations ||
            {};

        data.migrations.categoriesV1 =
            true;

    },


    /*
        P2.6.2 resolves legacy Expense/Bill/Manual Transaction
        category (and Expense/Bill subcategory) strings to the
        stable ids from data.settings.categories, using only exact
        trimmed/case-insensitive matches and the hand-audited
        CATEGORY_ALIASES table. It never touches the original
        category/subcategory/merchant strings, never creates
        custom categories for unresolved values, and only adds an
        id to a record that does not already have one — so running
        it again is a no-op and already-resolved ids never change.

        This inspects every stored month (not just the selected
        one) plus the global expenses array.
    */
    migrateCategoriesResolutionV1(
        data
    ) {

        if (
            data.migrations
                ?.categoriesResolutionV1
        ) {
            return;
        }


        const categoryList =
            data.settings
                ?.categories
                ?.list ||
            [];


        (
            Array.isArray(
                data.expenses
            )
                ? data.expenses
                : []
        ).forEach(
            expense => {

                if (
                    expense.categoryId
                ) {
                    return;
                }


                const resolved =
                    this.resolveCategoryIds(
                        categoryList,
                        expense.category,
                        expense.subcategory
                    );


                if (
                    resolved.categoryId
                ) {
                    expense.categoryId =
                        resolved.categoryId;
                }


                if (
                    resolved.subcategoryId
                ) {
                    expense.subcategoryId =
                        resolved.subcategoryId;
                }

            }
        );


        Object.values(
            data.months ||
                {}
        ).forEach(
            month => {

                (
                    Array.isArray(
                        month.bills
                    )
                        ? month.bills
                        : []
                ).forEach(
                    bill => {

                        if (
                            bill.categoryId
                        ) {
                            return;
                        }


                        const resolved =
                            this.resolveCategoryIds(
                                categoryList,
                                bill.category,
                                bill.subcategory
                            );


                        if (
                            resolved.categoryId
                        ) {
                            bill.categoryId =
                                resolved.categoryId;
                        }


                        if (
                            resolved.subcategoryId
                        ) {
                            bill.subcategoryId =
                                resolved.subcategoryId;
                        }

                    }
                );


                (
                    Array.isArray(
                        month.transactions
                    )
                        ? month.transactions
                        : []
                ).forEach(
                    transaction => {

                        if (
                            transaction.categoryId
                        ) {
                            return;
                        }


                        // Manual transactions get categoryId only; no subcategory support yet.
                        const categoryId =
                            this.resolveCategoryId(
                                categoryList,
                                transaction.category
                            );


                        if (
                            categoryId
                        ) {
                            transaction.categoryId =
                                categoryId;
                        }

                    }
                );

            }
        );


        data.migrations =
            data.migrations ||
            {};

        data.migrations.categoriesResolutionV1 =
            true;

    },


    normalizeData(
        data
    ) {

        if (
            !data ||
            typeof data !==
                "object"
        ) {

            return this
                .createDefaultData();

        }


        const previousVersion =
            Number(
                data.version
            ) || 0;


        const defaults =
            this.createDefaultData();


        data.settings = {

            ...defaults.settings,

            ...(data.settings || {})

        };


        data.settings.categories =
            this.normalizeCategoryConfig(
                data.settings.categories
            );


        data.migrations = {

            ...(data.migrations || {})

        };


        if (
            !data.months ||
            typeof data.months !==
                "object"
        ) {

            data.months =
                {};

        }


        if (
            !Array.isArray(
                data.income
            )
        ) {

            data.income =
                [];

        }


        if (
            !Array.isArray(
                data.expenses
            )
        ) {

            data.expenses =
                [];

        }


        if (
            !Array.isArray(
                data.savingsGoals
            )
        ) {

            data.savingsGoals =
                [];

        }


        if (
            !Array.isArray(
                data.savingsTransfers
            )
        ) {

            data.savingsTransfers =
                [];

        }


        data.income =
            data.income.map(
                item =>
                    this.normalizeIncome(
                        item
                    )
            );


        data.expenses =
            data.expenses.map(
                item =>
                    this.normalizeExpense(
                        item
                    )
            );


        data.savingsGoals =
            data.savingsGoals.map(
                goal =>
                    this.normalizeSavingsGoal(
                        goal
                    )
            );


        data.savingsTransfers =
            data.savingsTransfers.map(
                transfer =>
                    this.normalizeSavingsTransfer(
                        transfer
                    )
            );


        data.cash =
            this.normalizeCashState(
                data.cash
            );


        if (
            !data.accounts ||
            typeof data.accounts !==
                "object"
        ) {

            data.accounts =
                {};

        }


        data.accounts.checking = {

            ...defaults.accounts.checking,

            ...(data.accounts.checking || {})

        };


        data.accounts.savings = {

            ...defaults.accounts.savings,

            ...(data.accounts.savings || {})

        };


        data.accounts.checking.balance =
            this.toNumber(
                data.accounts
                    .checking
                    .balance
            );


        data.accounts.savings.balance =
            Math.max(
                0,
                this.toNumber(
                    data.accounts
                        .savings
                        .balance
                )
            );


        Object.keys(
            data.months
        ).forEach(
            monthKey => {

                data.months[
                    monthKey
                ] =
                    this.normalizeMonth(

                        data.months[
                            monthKey
                        ],

                        monthKey

                    );

            }
        );


        this.migrateLegacyPaychecks(
            data
        );


        this.migrateLegacyExpenses(
            data
        );


        this.migrateSavingsAccountV5(
            data,
            previousVersion
        );


        this.migrateCategoriesV1(
            data
        );


        this.migrateCategoriesResolutionV1(
            data
        );


        data.version =
            this.version;


        return data;

    },


    /* =====================================================
       5. LOAD / SAVE
       ===================================================== */

    load() {

        let savedData =
            localStorage.getItem(
                this.storageKey
            );


        let sourceKey =
            this.storageKey;


        if (
            !savedData
        ) {

            for (
                const legacyKey
                of this.legacyStorageKeys
            ) {

                const legacyData =
                    localStorage.getItem(
                        legacyKey
                    );


                if (
                    legacyData
                ) {

                    savedData =
                        legacyData;

                    sourceKey =
                        legacyKey;

                    break;

                }

            }

        }


        if (
            !savedData
        ) {

            const defaultData =
                this.createDefaultData();


            this.save(
                defaultData
            );


            return defaultData;

        }


        try {

            const parsedData =
                JSON.parse(
                    savedData
                );


            const normalizedData =
                this.normalizeData(
                    parsedData
                );


            this.save(
                normalizedData
            );


            return normalizedData;

        }

        catch (
            error
        ) {

            console.error(
                "M-Wallet could not load saved data:",
                error
            );


            /*
                IMPORTANT:
                Never overwrite corrupted user data.

                Preserve the raw storage contents first so
                they can potentially be recovered later.
            */

            try {

                const recoveryPrefix =
                    `${this.storageKey}-recovery-`;


                let existingBackupKey =
                    null;


                /*
                    Check whether this exact corrupted dataset
                    has already been preserved.
                */

                for (
                    let index = 0;
                    index < localStorage.length;
                    index += 1
                ) {

                    const key =
                        localStorage.key(
                            index
                        );


                    if (
                        key &&
                        key.startsWith(
                            recoveryPrefix
                        ) &&
                        !key.endsWith(
                            "-source"
                        )
                    ) {

                        const existingData =
                            localStorage.getItem(
                                key
                            );


                        if (
                            existingData ===
                            savedData
                        ) {

                            existingBackupKey =
                                key;

                            break;

                        }

                    }

                }


                if (
                    existingBackupKey
                ) {

                    console.warn(
                        "M-Wallet corrupted data was already preserved:",
                        existingBackupKey
                    );

                }

                else {

                    const backupKey =
                        `${recoveryPrefix}${Date.now()}`;


                    localStorage.setItem(
                        backupKey,
                        savedData
                    );


                    localStorage.setItem(
                        `${backupKey}-source`,
                        sourceKey
                    );


                    console.warn(
                        "M-Wallet preserved corrupted data for recovery:",
                        backupKey
                    );

                }

            }

            catch (
                backupError
            ) {

                console.error(
                    "M-Wallet could not create a recovery backup:",
                    backupError
                );

            }


            /*
                Return a temporary clean dataset so the app
                can continue loading.

                DO NOT save it here.

                Saving would overwrite the user's original
                corrupted data.
            */

            const recoveryData =
                this.createDefaultData();


            recoveryData.recoveryMode =
                true;


            recoveryData.recoveryError =
                "Saved M-Wallet data could not be read. The original data was preserved for recovery.";


            return recoveryData;

        }

    },


    save(data) {

        /*
            RECOVERY MODE SAFETY LOCK

            Never allow temporary recovery data to overwrite
            the user's original stored M-Wallet data.
        */

        if (
            data?.recoveryMode ===
            true
        ) {

            console.warn(
                "M-Wallet save blocked because recovery mode is active. Original stored data was preserved."
            );


            return false;

        }


        try {

            localStorage.setItem(

                this.storageKey,

                JSON.stringify(
                    data
                )

            );


            return true;

        }

        catch (
            error
        ) {

            console.error(
                "M-Wallet could not save data:",
                error
            );


            return false;

        }

    },


    getCashState() {

        const data =
            this.load();


        return this.cloneJSON(
            data.cash
        );

    },


    saveCashState(
        cashState
    ) {

        const data =
            this.load();


        if (
            data.recoveryMode === true
        ) {

            return false;

        }


        data.cash =
            this.normalizeCashState(
                cashState
            );


        if (
            !this.save(
                data
            )
        ) {

            return false;

        }


        return this.cloneJSON(
            data.cash
        );

    },


    getCashWallet() {

        return this.cloneJSON(
            this.getCashState()
                .wallet
        );

    },


    saveCashWallet(
        wallet
    ) {

        const cashState =
            this.getCashState();


        cashState.wallet =
            wallet;


        const savedState =
            this.saveCashState(
                cashState
            );


        return savedState
            ? this.cloneJSON(
                savedState.wallet
            )
            : false;

    },


    ensureMonthInData(
        data,
        monthKey
    ) {

        if (
            !data.months[
                monthKey
            ]
        ) {

            data.months[
                monthKey
            ] =
                this.createDefaultMonth(
                    monthKey
                );

        }


        data.months[
            monthKey
        ] =
            this.normalizeMonth(

                data.months[
                    monthKey
                ],

                monthKey

            );


        return data.months[
            monthKey
        ];

    },


    getMonth(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const data =
            this.load();


        const month =
            this.ensureMonthInData(
                data,
                monthKey
            );


        this.save(
            data
        );


        return month;

    },


    getSelectedMonth() {

        return this.getMonth(
            this.getSelectedMonthKey()
        );

    },


    saveMonth(
        monthKey,
        monthData
    ) {

        const data =
            this.load();


        const normalizedMonth =
            this.normalizeMonth(
                monthData,
                monthKey
            );


        normalizedMonth.updatedAt =
            this.now();


        data.months[
            monthKey
        ] =
            normalizedMonth;


        const saved =
            this.save(
                data
            );


        if (
            !saved
        ) {

            return false;

        }


        return normalizedMonth;

    },


    /* =====================================================
       6. STARTING BALANCE
       ===================================================== */

    setStartingBalance(
        amount,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        month.startingBalance =
            this.toNumber(
                amount
            );


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        const syncedBalance =
            this.syncCheckingAccountBalance(
                monthKey
            );


        if (
            syncedBalance === null
        ) {

            return null;

        }


        return month.startingBalance;

    },


    getStartingBalance(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this.toNumber(

            this.getMonth(
                monthKey
            ).startingBalance

        );

    },


    /* =====================================================
       7. INCOME
       ===================================================== */

    addIncome(income) {

        const data =
            this.load();


        const newIncome =
            this.normalizeIncome({

                ...income,

                id:
                    income?.id ||
                    this.generateId(
                        "income"
                    ),

                createdAt:
                    income?.createdAt ||
                    this.now(),

                updatedAt:
                    this.now()

            });


        data.income.push(
            newIncome
        );


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return newIncome;

    },


    getIncome() {

        return [
            ...this.load().income
        ];

    },


    getIncomeById(
        incomeId
    ) {

        return (
            this.load()
                .income
                .find(
                    item =>
                        item.id ===
                        incomeId
                )
            ||
            null
        );

    },


    updateIncome(
        incomeId,
        updates
    ) {

        const data =
            this.load();


        const index =
            data.income.findIndex(
                item =>
                    item.id ===
                    incomeId
            );


        if (
            index === -1
        ) {

            return null;

        }


        const existing =
            data.income[
                index
            ];


        const updated =
            this.normalizeIncome({

                ...existing,

                ...updates,

                id:
                    existing.id,

                createdAt:
                    existing.createdAt,

                legacyPaycheckId:
                    existing
                        .legacyPaycheckId,

                legacyMonthKey:
                    existing
                        .legacyMonthKey,

                updatedAt:
                    this.now()

            });


        data.income[
            index
        ] =
            updated;


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return updated;

    },


    deleteIncome(
        incomeId
    ) {

        const data =
            this.load();


        const before =
            data.income.length;


        data.income =
            data.income.filter(
                item =>
                    item.id !==
                    incomeId
            );


        if (
            !this.save(
                data
            )
        ) {

            return false;

        }


        return (
            data.income.length !==
            before
        );

    },


    makeIncomeOccurrence(
        income,
        date
    ) {

        return {

            ...income,

            id:
                income.id,

            sourceId:
                income.id,

            occurrenceId:
                `${income.id}@${date}`,

            date,

            isOccurrence:
                income.recurring ||
                date !== income.date

        };

    },


    getCustomNextDate(
        currentDate,
        interval,
        unit
    ) {

        const amount =
            Math.max(
                1,
                Number(
                    interval
                ) || 1
            );


        switch (
            unit
        ) {

            case "days":

                return this.addDays(
                    currentDate,
                    amount
                );


            case "weeks":

                return this.addDays(
                    currentDate,
                    amount * 7
                );


            case "years":

                return this.addYearsClamped(
                    currentDate,
                    amount
                );


            case "months":

            default:

                return this.addMonthsClamped(
                    currentDate,
                    amount
                );

        }

    },


    getTwiceMonthlyIncomeOccurrences(
        income,
        rangeStart,
        rangeEnd
    ) {

        const results =
            [];


        const [
            startYear,
            startMonth
        ] =
            rangeStart
                .slice(
                    0,
                    7
                )
                .split("-")
                .map(Number);


        const [
            endYear,
            endMonth
        ] =
            rangeEnd
                .slice(
                    0,
                    7
                )
                .split("-")
                .map(Number);


        const firstMonthIndex =
            (
                startYear * 12
            ) +
            startMonth -
            1;


        const lastMonthIndex =
            (
                endYear * 12
            ) +
            endMonth -
            1;


        const days =
            Array.isArray(
                income.twiceMonthlyDays
            )

                ? income.twiceMonthlyDays

                : [
                    1,
                    15
                ];


        for (
            let monthIndex =
                firstMonthIndex;

            monthIndex <=
                lastMonthIndex;

            monthIndex +=
                1
        ) {

            const year =
                Math.floor(
                    monthIndex / 12
                );


            const month =
                (
                    monthIndex %
                    12
                ) + 1;


            const maxDay =
                this.daysInMonth(
                    year,
                    month
                );


            days.forEach(
                dayValue => {

                    const day =
                        Math.min(

                            maxDay,

                            Math.max(
                                1,
                                Number(
                                    dayValue
                                ) || 1
                            )

                        );


                    const date =

                        `${year}-` +

                        `${String(
                            month
                        ).padStart(
                            2,
                            "0"
                        )}-` +

                        `${String(
                            day
                        ).padStart(
                            2,
                            "0"
                        )}`;


                    if (
                        date <
                        income.date
                    ) {

                        return;

                    }


                    if (
                        income.endDate &&
                        date >
                            income.endDate
                    ) {

                        return;

                    }


                    if (
                        !this.isDateInRange(
                            date,
                            rangeStart,
                            rangeEnd
                        )
                    ) {

                        return;

                    }


                    results.push(

                        this.makeIncomeOccurrence(
                            income,
                            date
                        )

                    );

                }
            );

        }


        return results;

    },


    getIncomeOccurrencesForRange(
        rangeStart,
        rangeEnd
    ) {

        const results =
            [];


        this.getIncome()
            .forEach(
                income => {

                    if (
                        !income.recurring
                    ) {

                        if (
                            this.isDateInRange(
                                income.date,
                                rangeStart,
                                rangeEnd
                            )
                        ) {

                            results.push(

                                this.makeIncomeOccurrence(
                                    income,
                                    income.date
                                )

                            );

                        }


                        return;

                    }


                    if (
                        income.frequency ===
                        "twice-monthly"
                    ) {

                        results.push(

                            ...this
                                .getTwiceMonthlyIncomeOccurrences(
                                    income,
                                    rangeStart,
                                    rangeEnd
                                )

                        );


                        return;

                    }


                    let date =
                        income.date;


                    let safety =
                        0;


                    while (
                        date <=
                            rangeEnd &&

                        safety <
                            20000
                    ) {

                        if (
                            (
                                !income.endDate ||
                                date <=
                                    income.endDate
                            )
                            &&
                            date >=
                                rangeStart
                        ) {

                            results.push(

                                this.makeIncomeOccurrence(
                                    income,
                                    date
                                )

                            );

                        }


                        if (
                            income.endDate &&
                            date >=
                                income.endDate
                        ) {

                            break;

                        }


                        switch (
                            income.frequency
                        ) {

                            case "weekly":

                                date =
                                    this.addDays(
                                        date,
                                        7
                                    );

                                break;


                            case "biweekly":

                                date =
                                    this.addDays(
                                        date,
                                        14
                                    );

                                break;


                            case "monthly":

                                date =
                                    this.addMonthsClamped(
                                        date,
                                        1
                                    );

                                break;


                            case "custom":

                                date =
                                    this.getCustomNextDate(

                                        date,

                                        income.customInterval,

                                        income.customUnit

                                    );

                                break;


                            default:

                                date =
                                    this.addMonthsClamped(
                                        date,
                                        1
                                    );

                        }


                        safety +=
                            1;

                    }

                }
            );


        return results.sort(
            (
                a,
                b
            ) =>
                String(
                    a.date
                ).localeCompare(
                    String(
                        b.date
                    )
                )
        );

    },


    getIncomeForMonth(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getIncomeOccurrencesForRange(

                this.getMonthStart(
                    monthKey
                ),

                this.getMonthEnd(
                    monthKey
                )

            );

    },


    getIncomeForYear(
        year
    ) {

        return this
            .getIncomeOccurrencesForRange(

                this.getYearStart(
                    year
                ),

                this.getYearEnd(
                    year
                )

            );

    },


    getMonthlyIncomeTotal(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getIncomeForMonth(
                monthKey
            )
            .reduce(
                (
                    total,
                    income
                ) =>

                    total +
                    this.toNumber(
                        income.amount
                    ),

                0
            );

    },


    getYearlyIncomeTotal(
        year
    ) {

        return this
            .getIncomeForYear(
                year
            )
            .reduce(
                (
                    total,
                    income
                ) =>

                    total +
                    this.toNumber(
                        income.amount
                    ),

                0
            );

    },


    /* =====================================================
       8. LEGACY PAYCHECK COMPATIBILITY
       ===================================================== */

    addPaycheck(
        paycheck,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const newPaycheck = {

            id:
                this.getRecordId(
                    paycheck,
                    "paycheck"
                ),

            name:
                paycheck.name ||
                "Paycheck",

            payDate:
                paycheck.payDate ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            hours:
                this.toNumber(
                    paycheck.hours
                ),

            amount:
                this.toPositiveNumber(
                    paycheck.amount
                ),

            notes:
                paycheck.notes ||
                "",

            createdAt:
                paycheck.createdAt ||
                this.now()

        };


        month.paychecks.push(
            newPaycheck
        );


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        const linked =
            this.getIncome()
                .find(
                    item =>
                        item.legacyPaycheckId ===
                        newPaycheck.id
                );


        if (
            !linked
        ) {

            const linkedIncome =
                this.addIncome({

                    name:
                        newPaycheck.name,

                    source:
                        newPaycheck.name,

                    amount:
                        newPaycheck.amount,

                    date:
                        newPaycheck.payDate,

                    category:
                        "Employment",

                    incomeType:
                        "paycheck",

                    recurring:
                        false,

                    notes:
                        newPaycheck.notes,

                    legacyPaycheckId:
                        newPaycheck.id,

                    legacyMonthKey:
                        monthKey,

                    createdAt:
                        newPaycheck.createdAt

                });


            if (
                !linkedIncome
            ) {

                return null;

            }

        }


        return newPaycheck;

    },


    getPaychecks(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).paychecks
        ];

    },


    updatePaycheck(
        paycheckId,
        updates,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const paycheck =
            month.paychecks.find(
                item =>
                    item.id ===
                    paycheckId
            );


        if (
            !paycheck
        ) {

            return null;

        }


        Object.assign(
            paycheck,
            updates
        );


        paycheck.hours =
            this.toNumber(
                paycheck.hours
            );


        paycheck.amount =
            this.toPositiveNumber(
                paycheck.amount
            );


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        const linkedIncome =
            this.getIncome()
                .find(
                    item =>
                        item.legacyPaycheckId ===
                        paycheckId
                );


        if (
            linkedIncome
        ) {

            const updatedIncome =
                this.updateIncome(

                    linkedIncome.id,

                    {

                        name:
                            paycheck.name,

                        source:
                            paycheck.name,

                        amount:
                            paycheck.amount,

                        date:
                            paycheck.payDate,

                        notes:
                            paycheck.notes

                    }

                );


            if (
                !updatedIncome
            ) {

                return null;

            }

        }


        return paycheck;

    },


    deletePaycheck(
        paycheckId,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const before =
            month.paychecks.length;


        month.paychecks =
            month.paychecks.filter(
                item =>
                    item.id !==
                    paycheckId
            );


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return false;

        }


        const linkedIncome =
            this.getIncome()
                .find(
                    item =>
                        item.legacyPaycheckId ===
                        paycheckId
                );


        if (
            linkedIncome
        ) {

            if (
                !this.deleteIncome(
                    linkedIncome.id
                )
            ) {

                return false;

            }

        }


        return (
            month.paychecks.length !==
            before
        );

    },


    getPaycheckIncome(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getPaychecks(
                monthKey
            )
            .reduce(
                (
                    total,
                    paycheck
                ) =>

                    total +
                    this.toNumber(
                        paycheck.amount
                    ),

                0
            );

    },


    /* =====================================================
       9. BILLS
       ===================================================== */

    addBill(
        bill,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const newBill = {

            id:
                this.getRecordId(
                    bill,
                    "bill"
                ),

            name:
                this.normalizeString(
                    bill.name,
                    "Bill"
                ),

            dueDate:
                bill.dueDate ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            amount:
                this.toPositiveNumber(
                    bill.amount
                ),

            category:
                this.normalizeString(
                    bill.category,
                    "Other"
                ),

            subcategory:
                this.normalizeString(
                    bill.subcategory
                ),

            /*
                P2.6.3: mirrors the categoryId/subcategoryId
                passthrough normalizeExpense already applies (P2.6.2)
                so new bills can persist centralized classification.
            */
            categoryId:
                bill.categoryId ||
                null,

            subcategoryId:
                bill.subcategoryId ||
                null,

            merchant:
                this.normalizeString(
                    bill.merchant
                ),

            paid:
                Boolean(
                    bill.paid
                ),

            paidDate:
                bill.paidDate ||
                "",

            recurring:
                Boolean(
                    bill.recurring
                ),

            frequency:
                this.normalizeString(

                    bill.frequency,

                    bill.recurring
                        ? "monthly"
                        : ""

                ),

            notes:
                this.normalizeString(
                    bill.notes
                ),

            createdAt:
                bill.createdAt ||
                this.now(),

            updatedAt:
                this.now()

        };


        month.bills.push(
            newBill
        );


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        return newBill;

    },


    getBills(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).bills
        ];

    },


    updateBill(
        billId,
        updates,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const bill =
            month.bills.find(
                item =>
                    item.id ===
                    billId
            );


        if (
            !bill
        ) {

            return null;

        }


        Object.assign(
            bill,
            updates
        );


        bill.amount =
            this.toPositiveNumber(
                bill.amount
            );


        bill.recurring =
            Boolean(
                bill.recurring
            );


        bill.updatedAt =
            this.now();


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        return bill;

    },


    markBillPaid(
        billId,
        paid = true,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const bill =
            month.bills.find(
                item =>
                    item.id ===
                    billId
            );


        if (
            !bill
        ) {

            return null;

        }


        bill.paid =
            Boolean(
                paid
            );


        bill.paidDate =
            paid

                ? this.getTodayDate()

                : "";


        bill.updatedAt =
            this.now();


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        return bill;

    },


    deleteBill(
        billId,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const before =
            month.bills.length;


        month.bills =
            month.bills.filter(
                item =>
                    item.id !==
                    billId
            );


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return false;

        }


        return (
            month.bills.length !==
            before
        );

    },


    /* =====================================================
       10. EXPENSES
       ===================================================== */

    addExpense(
        expense
    ) {

        const data =
            this.load();


        const newExpense =
            this.normalizeExpense({

                ...expense,

                id:
                    expense?.id ||
                    this.generateId(
                        "expense"
                    ),

                createdAt:
                    expense?.createdAt ||
                    this.now(),

                updatedAt:
                    this.now()

            });


        data.expenses.push(
            newExpense
        );


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return newExpense;

    },


    getExpenseRecords() {

        return [
            ...this.load().expenses
        ];

    },


    getExpenseById(
        expenseId
    ) {

        return (
            this.load()
                .expenses
                .find(
                    item =>
                        item.id ===
                        expenseId
                )
            ||
            null
        );

    },


    updateExpense(
        expenseId,
        updates
    ) {

        const data =
            this.load();


        const index =
            data.expenses.findIndex(
                item =>
                    item.id ===
                    expenseId
            );


        if (
            index === -1
        ) {

            return null;

        }


        const existing =
            data.expenses[
                index
            ];


        const updated =
            this.normalizeExpense({

                ...existing,

                ...updates,

                id:
                    existing.id,

                createdAt:
                    existing.createdAt,

                legacyExpenseId:
                    existing
                        .legacyExpenseId,

                legacyMonthKey:
                    existing
                        .legacyMonthKey,

                updatedAt:
                    this.now()

            });


        data.expenses[
            index
        ] =
            updated;


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return updated;

    },


    deleteExpense(
        expenseId
    ) {

        const data =
            this.load();


        const expense =
            data.expenses.find(
                item =>
                    item.id ===
                    expenseId
            );


        if (
            !expense
        ) {

            return false;

        }


        data.expenses =
            data.expenses.filter(
                item =>
                    item.id !==
                    expenseId
            );


        if (
            expense.legacyExpenseId &&
            expense.legacyMonthKey &&
            data.months[
                expense.legacyMonthKey
            ]
        ) {

            data.months[
                expense.legacyMonthKey
            ].expenses =

                data.months[
                    expense.legacyMonthKey
                ].expenses.filter(
                    item =>
                        item.id !==
                        expense.legacyExpenseId
                );

        }


        if (
            !this.save(
                data
            )
        ) {

            return false;

        }


        return true;

    },


    makeExpenseOccurrence(
        expense,
        date
    ) {

        return {

            ...expense,

            id:
                expense.id,

            sourceId:
                expense.id,

            occurrenceId:
                `${expense.id}@${date}`,

            date,

            isOccurrence:
                expense.recurring ||
                date !== expense.date

        };

    },


    getExpenseOccurrencesForRange(
        rangeStart,
        rangeEnd
    ) {

        const results =
            [];


        this.getExpenseRecords()
            .forEach(
                expense => {

                    if (
                        !expense.recurring
                    ) {

                        if (
                            this.isDateInRange(
                                expense.date,
                                rangeStart,
                                rangeEnd
                            )
                        ) {

                            results.push(

                                this.makeExpenseOccurrence(
                                    expense,
                                    expense.date
                                )

                            );

                        }


                        return;

                    }


                    let date =
                        expense.date;


                    let safety =
                        0;


                    while (
                        date <=
                            rangeEnd &&

                        safety <
                            20000
                    ) {

                        if (
                            (
                                !expense.endDate ||
                                date <=
                                    expense.endDate
                            )
                            &&
                            date >=
                                rangeStart
                        ) {

                            results.push(

                                this.makeExpenseOccurrence(
                                    expense,
                                    date
                                )

                            );

                        }


                        if (
                            expense.endDate &&
                            date >=
                                expense.endDate
                        ) {

                            break;

                        }


                        switch (
                            expense.frequency
                        ) {

                            case "weekly":

                                date =
                                    this.addDays(
                                        date,
                                        7
                                    );

                                break;


                            case "biweekly":

                                date =
                                    this.addDays(
                                        date,
                                        14
                                    );

                                break;


                            case "yearly":

                                date =
                                    this.addYearsClamped(
                                        date,
                                        1
                                    );

                                break;


                            case "custom":

                                date =
                                    this.getCustomNextDate(

                                        date,

                                        expense.customInterval,

                                        expense.customUnit

                                    );

                                break;


                            case "monthly":

                            default:

                                date =
                                    this.addMonthsClamped(
                                        date,
                                        1
                                    );

                                break;

                        }


                        safety +=
                            1;

                    }

                }
            );


        return results.sort(
            (
                a,
                b
            ) =>
                String(
                    a.date
                ).localeCompare(
                    String(
                        b.date
                    )
                )
        );

    },


    getExpensesForMonth(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getExpenseOccurrencesForRange(

                this.getMonthStart(
                    monthKey
                ),

                this.getMonthEnd(
                    monthKey
                )

            );

    },


    getExpensesForYear(
        year
    ) {

        return this
            .getExpenseOccurrencesForRange(

                this.getYearStart(
                    year
                ),

                this.getYearEnd(
                    year
                )

            );

    },


    getExpenses(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getExpensesForMonth(
                monthKey
            );

    },


    getMonthlyExpenseTotal(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getExpensesForMonth(
                monthKey
            )
            .reduce(
                (
                    total,
                    expense
                ) =>

                    total +
                    this.toNumber(
                        expense.amount
                    ),

                0
            );

    },


    getYearlyExpenseTotal(
        year
    ) {

        return this
            .getExpensesForYear(
                year
            )
            .reduce(
                (
                    total,
                    expense
                ) =>

                    total +
                    this.toNumber(
                        expense.amount
                    ),

                0
            );

    },


    /* =====================================================
       11. MANUAL TRANSACTIONS
       ===================================================== */

    addTransaction(
        transaction,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const newTransaction = {

            id:
                this.getRecordId(
                    transaction,
                    "transaction"
                ),

            description:
                transaction.description ||
                transaction.name ||
                "Transaction",

            date:
                transaction.date ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            category:
                transaction.category ||
                "Other",

            amount:
                this.toNumber(
                    transaction.amount
                ),

            notes:
                transaction.notes ||
                "",

            createdAt:
                transaction.createdAt ||
                this.now(),

            updatedAt:
                this.now()

        };


        month.transactions.push(
            newTransaction
        );


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        return newTransaction;

    },


    getManualTransactions(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).transactions
        ];

    },


    updateTransaction(
        transactionId,
        updates,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const transaction =
            month.transactions.find(
                item =>
                    item.id ===
                    transactionId
            );


        if (
            !transaction
        ) {

            return null;

        }


        Object.assign(
            transaction,
            updates
        );


        transaction.amount =
            this.toNumber(
                transaction.amount
            );


        transaction.updatedAt =
            this.now();


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        return transaction;

    },


    deleteTransaction(
        transactionId,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const before =
            month.transactions.length;


        month.transactions =
            month.transactions.filter(
                item =>
                    item.id !==
                    transactionId
            );


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return false;

        }


        return (
            month.transactions.length !==
            before
        );

    },


    getManualTransactionIncome(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getManualTransactions(
                monthKey
            )
            .filter(
                transaction =>
                    this.toNumber(
                        transaction.amount
                    ) > 0
            )
            .reduce(
                (
                    total,
                    transaction
                ) =>

                    total +
                    this.toNumber(
                        transaction.amount
                    ),

                0
            );

    },


    getManualTransactionExpenses(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getManualTransactions(
                monthKey
            )
            .filter(
                transaction =>
                    this.toNumber(
                        transaction.amount
                    ) < 0
            )
            .reduce(
                (
                    total,
                    transaction
                ) =>

                    total +
                    Math.abs(
                        this.toNumber(
                            transaction.amount
                        )
                    ),

                0
            );

    },


    /* =====================================================
       12. SAVINGS ACCOUNT
       ===================================================== */

    getSavingsBalance() {

        const data =
            this.load();


        return Math.max(
            0,
            this.toNumber(
                data.accounts
                    ?.savings
                    ?.balance
            )
        );

    },


    getCheckingAccountBalance() {

        return this.toNumber(
            this.load()
                .accounts
                ?.checking
                ?.balance
        );

    },


    getAllocatedSavingsTotal() {

        return this
            .getSavingsGoals()
            .reduce(
                (
                    total,
                    goal
                ) =>

                    total +
                    this.toPositiveNumber(
                        goal.currentAmount
                    ),

                0
            );

    },


    getTotalSavingsBalance() {

        return (

            this.getSavingsBalance()

            +

            this.getAllocatedSavingsTotal()

        );

    },


    syncCheckingAccountBalance(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const endingBalance =
            this.calculateEndingBalance(
                monthKey
            );


        const data =
            this.load();


        data.accounts.checking.balance =
            this.toNumber(
                endingBalance
            );


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return endingBalance;

    },


    /* =====================================================
       13. SAVINGS GOALS
       ===================================================== */

    getSavingsGoals() {

        return [
            ...this.load()
                .savingsGoals
        ];

    },


    getSavingsGoalById(
        goalId
    ) {

        return (
            this.load()
                .savingsGoals
                .find(
                    goal =>
                        goal.id ===
                        goalId
                )
            ||
            null
        );

    },


    getSavingsGoalsCreatedInMonth(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getSavingsGoals()
            .filter(
                goal =>
                    goal.createdMonthKey ===
                    monthKey
            );

    },


    addSavingsGoal(
        goal,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const data =
            this.load();


        const requestedStartingAmount =
            this.toPositiveNumber(
                goal?.currentAmount
            );


        const newGoal =
            this.normalizeSavingsGoal({

                ...goal,

                id:
                    goal?.id ||
                    this.generateId(
                        "goal"
                    ),

                currentAmount:
                    0,

                createdMonthKey:
                    goal?.monthKey ||
                    monthKey,

                createdAt:
                    goal?.createdAt ||
                    this.now(),

                updatedAt:
                    this.now()

            });


        data.savingsGoals.push(
            newGoal
        );


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        /*
            If a goal is created with a starting amount,
            fund it from General Savings instead of creating
            money from nowhere.
        */

        if (
            requestedStartingAmount >
            0
        ) {

            try {

                return this
                    .allocateSavingsToGoal(

                        newGoal.id,

                        requestedStartingAmount,

                        {
                            date:
                                this.getTodayDate(),

                            notes:
                                "Starting savings goal allocation"
                        }

                    );

            }

            catch (error) {

                this.deleteSavingsGoal(
                    newGoal.id
                );


                throw error;

            }

        }


        return newGoal;

    },


    updateSavingsGoal(
        goalId,
        updates
    ) {

        const data =
            this.load();


        const goal =
            data.savingsGoals.find(
                item =>
                    item.id ===
                    goalId
            );


        if (
            !goal
        ) {

            return null;

        }


        const oldCurrent =
            this.toPositiveNumber(
                goal.currentAmount
            );


        const hasCurrentAmountUpdate =
            Object.prototype
                .hasOwnProperty
                .call(
                    updates || {},
                    "currentAmount"
                );


        const newCurrent =
            hasCurrentAmountUpdate

                ? this.toPositiveNumber(
                    updates.currentAmount
                )

                : oldCurrent;


        const difference =
            newCurrent -
            oldCurrent;


        if (
            difference > 0
        ) {

            const available =
                this.toPositiveNumber(
                    data.accounts
                        .savings
                        .balance
                );


            if (
                difference >
                available
            ) {

                throw new Error(
                    "Not enough General Savings to increase this fund."
                );

            }


            data.accounts
                .savings
                .balance -=
                    difference;


            data.savingsTransfers.push(

                this.normalizeSavingsTransfer({

                    type:
                        "savings-to-goal",

                    goalId:
                        goal.id,

                    goalName:
                        goal.name,

                    amount:
                        difference,

                    date:
                        updates?.date ||
                        this.getTodayDate(),

                    notes:
                        "Savings goal balance edited"

                })

            );

        }


        if (
            difference < 0
        ) {

            const returnedAmount =
                Math.abs(
                    difference
                );


            data.accounts
                .savings
                .balance +=
                    returnedAmount;


            data.savingsTransfers.push(

                this.normalizeSavingsTransfer({

                    type:
                        "goal-to-savings",

                    goalId:
                        goal.id,

                    goalName:
                        goal.name,

                    amount:
                        returnedAmount,

                    date:
                        updates?.date ||
                        this.getTodayDate(),

                    notes:
                        "Savings goal balance edited"

                })

            );

        }


        Object.assign(
            goal,
            updates
        );


        goal.name =
            this.normalizeString(
                goal.name,
                "Savings Goal"
            );


        goal.targetAmount =
            this.toPositiveNumber(
                goal.targetAmount
            );


        goal.currentAmount =
            newCurrent;


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >=
                goal.targetAmount;


        goal.updatedAt =
            this.now();


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return goal;

    },


    addToSavingsGoal(
        goalId,
        amount
    ) {

        const data =
            this.load();


        const goal =
            data.savingsGoals.find(
                item =>
                    item.id ===
                    goalId
            );


        if (
            !goal
        ) {

            return null;

        }


        goal.currentAmount =
            Math.max(
                0,
                this.toPositiveNumber(
                    goal.currentAmount
                )
                +
                this.toNumber(
                    amount
                )
            );


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >=
                goal.targetAmount;


        goal.updatedAt =
            this.now();


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return goal;

    },


    deleteSavingsGoal(
        goalId
    ) {

        const data =
            this.load();


        const goal =
            data.savingsGoals.find(
                item =>
                    item.id ===
                    goalId
            );


        if (
            !goal
        ) {

            return false;

        }


        /*
            Money currently allocated to a deleted fund
            returns to General Savings.
        */

        const returnedAmount =
            this.toPositiveNumber(
                goal.currentAmount
            );


        if (
            returnedAmount >
            0
        ) {

            data.accounts
                .savings
                .balance +=
                    returnedAmount;


            data.savingsTransfers.push(

                this.normalizeSavingsTransfer({

                    type:
                        "goal-to-savings",

                    goalId:
                        goal.id,

                    goalName:
                        goal.name,

                    amount:
                        returnedAmount,

                    date:
                        this.getTodayDate(),

                    notes:
                        "Savings goal deleted - funds returned to General Savings"

                })

            );

        }


        data.savingsGoals =
            data.savingsGoals.filter(
                item =>
                    item.id !==
                    goalId
            );


        if (
            !this.save(
                data
            )
        ) {

            return false;

        }


        return true;

    },


    /* =====================================================
       14. GENERAL SAVINGS DEPOSITS / WITHDRAWALS
       ===================================================== */

    addSavingsDeposit(
        deposit,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const data =
            this.load();


        const month =
            this.ensureMonthInData(
                data,
                monthKey
            );


        const normalized =
            this.normalizeSavingsDeposit(
                deposit,
                monthKey
            );


        const amount =
            this.toNumber(
                normalized.amount
            );


        /*
            CHECKING → GOAL

            Legacy compatibility.

            New UI should generally put money into
            General Savings first and then allocate it.
        */

        if (
            normalized.goalId
        ) {

            const goal =
                data.savingsGoals.find(
                    item =>
                        item.id ===
                        normalized.goalId
                );


            if (
                !goal
            ) {

                throw new Error(
                    "Savings goal was not found."
                );

            }


            normalized.transferType =
                "goal-deposit";


            normalized.direction =
                "checking-to-goal";


            normalized.amount =
                this.toPositiveNumber(
                    amount
                );


            goal.currentAmount +=
                normalized.amount;


            goal.completed =
                goal.targetAmount > 0 &&
                goal.currentAmount >=
                    goal.targetAmount;


            goal.updatedAt =
                this.now();

        }


        /*
            SAVINGS → CHECKING
        */

        else if (
            normalized.transferType ===
            "withdrawal" ||
            amount < 0
        ) {

            const withdrawalAmount =
                this.toPositiveNumber(
                    amount
                );


            const currentSavings =
                this.toPositiveNumber(
                    data.accounts
                        .savings
                        .balance
                );


            if (
                withdrawalAmount >
                currentSavings
            ) {

                throw new Error(
                    "You cannot withdraw more than your General Savings balance."
                );

            }


            normalized.transferType =
                "withdrawal";


            normalized.direction =
                "savings-to-checking";


            normalized.amount =
                -withdrawalAmount;


            data.accounts
                .savings
                .balance -=
                    withdrawalAmount;

        }


        /*
            CHECKING → GENERAL SAVINGS
        */

        else {

            const depositAmount =
                this.toPositiveNumber(
                    amount
                );


            normalized.transferType =
                "deposit";


            normalized.direction =
                "checking-to-savings";


            normalized.amount =
                depositAmount;


            data.accounts
                .savings
                .balance +=
                    depositAmount;

        }


        month.savingsDeposits.push(
            normalized
        );


        month.savingsTransfers =
            month.savingsDeposits;


        month.updatedAt =
            this.now();


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        if (
            this.syncCheckingAccountBalance(
                monthKey
            ) === null
        ) {

            return null;

        }


        return normalized;

    },


    depositToSavings(
        amount,
        options = {}
    ) {

        const date =
            options.date ||
            this.getTodayDate();


        const monthKey =
            options.monthKey ||
            this.getMonthKeyFromDate(
                date
            );


        return this.addSavingsDeposit(

            {

                name:
                    options.name ||
                    "Savings Deposit",

                amount:
                    this.toPositiveNumber(
                        amount
                    ),

                date,

                transferType:
                    "deposit",

                notes:
                    options.notes ||
                    ""

            },

            monthKey

        );

    },


    withdrawFromSavings(
        amount,
        options = {}
    ) {

        const withdrawalAmount =
            this.toPositiveNumber(
                amount
            );


        if (
            withdrawalAmount <=
            0
        ) {

            throw new Error(
                "Enter an amount greater than zero."
            );

        }


        if (
            withdrawalAmount >
            this.getSavingsBalance()
        ) {

            throw new Error(
                "You cannot withdraw more than your General Savings balance."
            );

        }


        const date =
            options.date ||
            this.getTodayDate();


        const monthKey =
            options.monthKey ||
            this.getMonthKeyFromDate(
                date
            );


        return this.addSavingsDeposit(

            {

                name:
                    options.name ||
                    "Savings Withdrawal",

                amount:
                    -withdrawalAmount,

                date,

                transferType:
                    "withdrawal",

                notes:
                    options.notes ||
                    ""

            },

            monthKey

        );

    },


    setSavingsBalance(
        newBalance,
        options = {}
    ) {

        const targetBalance =
            this.toPositiveNumber(
                newBalance
            );


        const currentBalance =
            this.getSavingsBalance();


        const difference =
            targetBalance -
            currentBalance;


        if (
            difference === 0
        ) {

            return {

                balance:
                    currentBalance,

                changed:
                    false

            };

        }


        if (
            difference > 0
        ) {

            const transfer =
                this.depositToSavings(

                    difference,

                    {

                        ...options,

                        name:
                            options.name ||
                            "Savings Balance Adjustment",

                        notes:
                            options.notes ||
                            "General Savings balance increased"

                    }

                );


            return {

                balance:
                    this.getSavingsBalance(),

                changed:
                    true,

                transfer

            };

        }


        const transfer =
            this.withdrawFromSavings(

                Math.abs(
                    difference
                ),

                {

                    ...options,

                    name:
                        options.name ||
                        "Savings Balance Adjustment",

                    notes:
                        options.notes ||
                        "General Savings balance decreased"

                }

            );


        return {

            balance:
                this.getSavingsBalance(),

            changed:
                true,

            transfer

        };

    },


    getSavingsDeposits(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).savingsDeposits
        ];

    },


    deleteSavingsDeposit(
        depositId,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const data =
            this.load();


        const month =
            this.ensureMonthInData(
                data,
                monthKey
            );


        const deposit =
            month.savingsDeposits.find(
                item =>
                    item.id ===
                    depositId
            );


        if (
            !deposit
        ) {

            return false;

        }


        /*
            Reverse the original financial effect.
        */

        if (
            deposit.goalId
        ) {

            const goal =
                data.savingsGoals.find(
                    item =>
                        item.id ===
                        deposit.goalId
                );


            if (
                goal
            ) {

                goal.currentAmount =
                    Math.max(
                        0,
                        this.toPositiveNumber(
                            goal.currentAmount
                        )
                        -
                        this.toPositiveNumber(
                            deposit.amount
                        )
                    );


                goal.completed =
                    goal.targetAmount > 0 &&
                    goal.currentAmount >=
                        goal.targetAmount;


                goal.updatedAt =
                    this.now();

            }

        }

        else if (
            this.toNumber(
                deposit.amount
            ) < 0
        ) {

            /*
                Deleting a withdrawal puts the money
                back into General Savings.
            */

            data.accounts
                .savings
                .balance +=
                    this.toPositiveNumber(
                        deposit.amount
                    );

        }

        else {

            /*
                Deleting an old deposit removes that money
                from General Savings.

                If it has already been allocated to goals,
                prevent General Savings from becoming
                negative.
            */

            const amount =
                this.toPositiveNumber(
                    deposit.amount
                );


            if (
                amount >
                data.accounts
                    .savings
                    .balance
            ) {

                throw new Error(
                    "This savings deposit cannot be deleted because some of that money is currently allocated to a savings goal."
                );

            }


            data.accounts
                .savings
                .balance -=
                    amount;

        }


        month.savingsDeposits =
            month.savingsDeposits.filter(
                item =>
                    item.id !==
                    depositId
            );


        month.savingsTransfers =
            month.savingsDeposits;


        month.updatedAt =
            this.now();


        if (
            !this.save(
                data
            )
        ) {

            return false;

        }


        if (
            this.syncCheckingAccountBalance(
                monthKey
            ) === null
        ) {

            return false;

        }


        return true;

    },


    /* =====================================================
       15. SAVINGS GOAL ALLOCATIONS
       ===================================================== */

    allocateSavingsToGoal(
        goalId,
        amount,
        options = {}
    ) {

        const allocationAmount =
            this.toPositiveNumber(
                amount
            );


        if (
            allocationAmount <=
            0
        ) {

            throw new Error(
                "Enter an amount greater than zero."
            );

        }


        const data =
            this.load();


        const goal =
            data.savingsGoals.find(
                item =>
                    item.id ===
                    goalId
            );


        if (
            !goal
        ) {

            throw new Error(
                "Savings goal was not found."
            );

        }


        const availableSavings =
            this.toPositiveNumber(
                data.accounts
                    .savings
                    .balance
            );


        if (
            allocationAmount >
            availableSavings
        ) {

            throw new Error(
                "You cannot allocate more than your General Savings balance."
            );

        }


        data.accounts
            .savings
            .balance -=
                allocationAmount;


        goal.currentAmount =
            this.toPositiveNumber(
                goal.currentAmount
            )
            +
            allocationAmount;


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >=
                goal.targetAmount;


        goal.updatedAt =
            this.now();


        const transfer =
            this.normalizeSavingsTransfer({

                type:
                    "savings-to-goal",

                goalId:
                    goal.id,

                goalName:
                    goal.name,

                amount:
                    allocationAmount,

                date:
                    options.date ||
                    this.getTodayDate(),

                notes:
                    options.notes ||
                    ""

            });


        data.savingsTransfers.push(
            transfer
        );


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return {

            goal,

            transfer,

            savingsBalance:
                data.accounts
                    .savings
                    .balance,

            totalSavings:
                data.accounts
                    .savings
                    .balance
                +
                data.savingsGoals.reduce(
                    (
                        total,
                        item
                    ) =>

                        total +
                        this.toPositiveNumber(
                            item.currentAmount
                        ),

                    0
                )

        };

    },


    releaseSavingsFromGoal(
        goalId,
        amount,
        options = {}
    ) {

        const releaseAmount =
            this.toPositiveNumber(
                amount
            );


        if (
            releaseAmount <=
            0
        ) {

            throw new Error(
                "Enter an amount greater than zero."
            );

        }


        const data =
            this.load();


        const goal =
            data.savingsGoals.find(
                item =>
                    item.id ===
                    goalId
            );


        if (
            !goal
        ) {

            throw new Error(
                "Savings goal was not found."
            );

        }


        const currentGoalAmount =
            this.toPositiveNumber(
                goal.currentAmount
            );


        if (
            releaseAmount >
            currentGoalAmount
        ) {

            throw new Error(
                "You cannot remove more than this savings goal currently contains."
            );

        }


        goal.currentAmount -=
            releaseAmount;


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >=
                goal.targetAmount;


        goal.updatedAt =
            this.now();


        data.accounts
            .savings
            .balance +=
                releaseAmount;


        const transfer =
            this.normalizeSavingsTransfer({

                type:
                    "goal-to-savings",

                goalId:
                    goal.id,

                goalName:
                    goal.name,

                amount:
                    releaseAmount,

                date:
                    options.date ||
                    this.getTodayDate(),

                notes:
                    options.notes ||
                    ""

            });


        data.savingsTransfers.push(
            transfer
        );


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return {

            goal,

            transfer,

            savingsBalance:
                data.accounts
                    .savings
                    .balance

        };

    },


    getSavingsTransfers(
        monthKey = null
    ) {

        const transfers =
            this.load()
                .savingsTransfers;


        if (
            !monthKey
        ) {

            return [
                ...transfers
            ];

        }


        return transfers.filter(
            transfer =>
                transfer.monthKey ===
                monthKey
        );

    },


    addSavingsTransfer(
        transfer,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        /*
            Compatibility with older code.

            An older "savings transfer" means money moving
            from Checking into Savings.
        */

        return this
            .addSavingsDeposit(
                transfer,
                monthKey
            );

    },


    deleteSavingsTransfer(
        transferId,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .deleteSavingsDeposit(
                transferId,
                monthKey
            );

    },


    /* =====================================================
       16. MONEY.JS SAVE ROUTER
       ===================================================== */

    saveMoneyEntry(
        record
    ) {

        if (
            !record?.type
        ) {

            throw new Error(
                "Money entry is missing a type."
            );

        }


        const monthKey =
            record.monthKey ||
            this.getSelectedMonthKey();


        switch (
            record.type
        ) {

            case "income":

                return this.addIncome(
                    record
                );


            case "paycheck":

                return this.addPaycheck(
                    record,
                    monthKey
                );


            case "bill":

                return this.addBill(
                    record,
                    monthKey
                );


            case "expense":

                return this.addExpense(
                    record
                );


            case "transaction":

                return this.addTransaction(
                    record,
                    monthKey
                );


            case "savings-goal":

                return this.addSavingsGoal(
                    record,
                    monthKey
                );


            case "savings-deposit":

                return this.addSavingsDeposit(
                    record,
                    monthKey
                );


            case "savings-withdrawal":

                return this.withdrawFromSavings(

                    record.amount,

                    {

                        date:
                            record.date,

                        monthKey,

                        name:
                            record.name,

                        notes:
                            record.notes

                    }

                );


            case "savings-allocation":

                return this.allocateSavingsToGoal(

                    record.goalId,

                    record.amount,

                    {

                        date:
                            record.date,

                        notes:
                            record.notes

                    }

                );


            case "savings-release":

                return this.releaseSavingsFromGoal(

                    record.goalId,

                    record.amount,

                    {

                        date:
                            record.date,

                        notes:
                            record.notes

                    }

                );


            case "starting-balance":

                return this.setStartingBalance(
                    record.balance,
                    monthKey
                );


            default:

                throw new Error(
                    `Unknown money entry type: ${record.type}`
                );

        }

    },


    /* =====================================================
       17. TOTALS
       ===================================================== */

    getTotalIncome(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return (

            this.getMonthlyIncomeTotal(
                monthKey
            )

            +

            this.getManualTransactionIncome(
                monthKey
            )

        );

    },


    getTotalBills(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getBills(
                monthKey
            )
            .reduce(
                (
                    total,
                    bill
                ) =>

                    total +
                    this.toNumber(
                        bill.amount
                    ),

                0
            );

    },


    getTotalExpenses(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return (

            this.getMonthlyExpenseTotal(
                monthKey
            )

            +

            this.getManualTransactionExpenses(
                monthKey
            )

        );

    },


    /*
        Signed savings movement:

        +100 = Checking → Savings
        -100 = Savings → Checking

        Goal allocations are NOT included because they stay
        inside Savings and do not affect Checking.
    */

    getTotalSavingsDeposits(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getSavingsDeposits(
                monthKey
            )
            .reduce(
                (
                    total,
                    deposit
                ) =>

                    total +
                    this.toNumber(
                        deposit.amount
                    ),

                0
            );

    },


    getTotalSavingsTransfers(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        return this
            .getTotalSavingsDeposits(
                monthKey
            );

    },


    calculateEndingBalance(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const endingBalance =

            this.toNumber(
                month.startingBalance
            )

            +

            this.getTotalIncome(
                monthKey
            )

            -

            this.getTotalBills(
                monthKey
            )

            -

            this.getTotalExpenses(
                monthKey
            )

            -

            this.getTotalSavingsDeposits(
                monthKey
            );


        month.endingBalance =
            endingBalance;


        if (
            !this.saveMonth(
                monthKey,
                month
            )
        ) {

            return null;

        }


        return endingBalance;

    },


    getMonthlySummary(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const startingBalance =
            this.toNumber(
                month.startingBalance
            );


        const income =
            this.getTotalIncome(
                monthKey
            );


        const bills =
            this.getTotalBills(
                monthKey
            );


        const expenses =
            this.getTotalExpenses(
                monthKey
            );


        const savings =
            this.getTotalSavingsDeposits(
                monthKey
            );


        const endingBalance =

            startingBalance

            + income

            - bills

            - expenses

            - savings;


        return {

            monthKey,

            startingBalance,

            income,

            bills,

            expenses,

            savings,

            endingBalance,

            remaining:

                income

                - bills

                - expenses

                - savings

        };

    },


    /* =====================================================
       18. COMBINED ACTIVITY
       ===================================================== */

    getTransactions(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const transactions =
            [];


        /* -------------------------------------------------
           INCOME
           ------------------------------------------------- */

        this.getIncomeForMonth(
            monthKey
        ).forEach(
            income => {

                transactions.push({

                    id:
                        income.occurrenceId ||
                        income.id,

                    sourceId:
                        income.sourceId ||
                        income.id,

                    sourceType:
                        "income",

                    type:
                        "income",

                    name:
                        income.name ||
                        income.source,

                    description:
                        income.name ||
                        income.source,

                    date:
                        income.date,

                    amount:
                        this.toPositiveNumber(
                            income.amount
                        ),

                    category:
                        income.category,

                    recurring:
                        income.recurring,

                    frequency:
                        income.frequency

                });

            }
        );


        /* -------------------------------------------------
           BILLS
           ------------------------------------------------- */

        month.bills.forEach(
            bill => {

                transactions.push({

                    id:
                        bill.id,

                    sourceType:
                        "bill",

                    type:
                        "bill",

                    name:
                        bill.name,

                    description:
                        bill.name,

                    date:
                        bill.dueDate,

                    amount:
                        -this.toPositiveNumber(
                            bill.amount
                        ),

                    category:
                        bill.category,

                    subcategory:
                        bill.subcategory ||
                        "",

                    merchant:
                        bill.merchant ||
                        "",

                    paid:
                        bill.paid

                });

            }
        );


        /* -------------------------------------------------
           EXPENSES
           ------------------------------------------------- */

        this.getExpensesForMonth(
            monthKey
        ).forEach(
            expense => {

                transactions.push({

                    id:
                        expense.occurrenceId ||
                        expense.id,

                    sourceId:
                        expense.sourceId ||
                        expense.id,

                    sourceType:
                        "expense",

                    type:
                        "expense",

                    name:
                        expense.name,

                    description:
                        expense.name,

                    date:
                        expense.date,

                    amount:
                        -this.toPositiveNumber(
                            expense.amount
                        ),

                    merchant:
                        expense.merchant,

                    category:
                        expense.category,

                    subcategory:
                        expense.subcategory,

                    recurring:
                        expense.recurring,

                    frequency:
                        expense.frequency,

                    notes:
                        expense.notes

                });

            }
        );


        /* -------------------------------------------------
           MANUAL TRANSACTIONS
           ------------------------------------------------- */

        month.transactions.forEach(
            transaction => {

                const amount =
                    this.toNumber(
                        transaction.amount
                    );


                transactions.push({

                    id:
                        transaction.id,

                    sourceType:
                        "transaction",

                    type:
                        amount >= 0
                            ? "income"
                            : "expense",

                    name:
                        transaction.description,

                    description:
                        transaction.description,

                    date:
                        transaction.date,

                    amount,

                    category:
                        transaction.category

                });

            }
        );


        /* -------------------------------------------------
           CHECKING ↔ SAVINGS
           ------------------------------------------------- */

        month.savingsDeposits.forEach(
            deposit => {

                const savingsMovement =
                    this.toNumber(
                        deposit.amount
                    );


                const checkingMovement =
                    -savingsMovement;


                const isWithdrawal =
                    savingsMovement < 0;


                transactions.push({

                    id:
                        deposit.id,

                    sourceType:
                        "savings-deposit",

                    type:
                        isWithdrawal
                            ? "income"
                            : "savings",

                    transferType:
                        deposit.transferType,

                    direction:
                        deposit.direction,

                    goalId:
                        deposit.goalId,

                    name:
                        deposit.name,

                    description:
                        deposit.name,

                    date:
                        deposit.date,

                    amount:
                        checkingMovement,

                    savingsAmount:
                        savingsMovement,

                    category:
                        "Savings",

                    notes:
                        deposit.notes

                });

            }
        );


        transactions.sort(
            (
                a,
                b
            ) =>

                String(
                    b.date || ""
                ).localeCompare(
                    String(
                        a.date || ""
                    )
                )
        );


        return transactions;

    },


    getRunningBalance(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        let balance =
            this.getStartingBalance(
                monthKey
            );


        const transactions =
            this.getTransactions(
                monthKey
            ).sort(
                (
                    a,
                    b
                ) =>

                    String(
                        a.date || ""
                    ).localeCompare(
                        String(
                            b.date || ""
                        )
                    )
            );


        return transactions.map(
            transaction => {

                const balanceBefore =
                    balance;


                balance +=
                    this.toNumber(
                        transaction.amount
                    );


                return {

                    ...transaction,

                    balanceBefore,

                    balanceAfter:
                        balance

                };

            }
        );

    },


    /* =====================================================
       19. MONTH SNAPSHOT
       ===================================================== */

    getMonthSnapshot(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        return {

            monthKey,


            startingBalance:
                this.toNumber(
                    month.startingBalance
                ),


            income:
                this.getIncomeForMonth(
                    monthKey
                ),


            paychecks:
                this.getPaychecks(
                    monthKey
                ),


            bills:
                this.getBills(
                    monthKey
                ),


            expenses:
                this.getExpensesForMonth(
                    monthKey
                ),


            manualTransactions:
                this.getManualTransactions(
                    monthKey
                ),


            savingsDeposits:
                this.getSavingsDeposits(
                    monthKey
                ),


            savingsTransfers:
                this.getSavingsTransfers(
                    monthKey
                ),


            savingsGoals:
                this.getSavingsGoals(),


            generalSavingsBalance:
                this.getSavingsBalance(),


            allocatedSavings:
                this.getAllocatedSavingsTotal(),


            totalSavingsBalance:
                this.getTotalSavingsBalance(),


            transactions:
                this.getTransactions(
                    monthKey
                ),


            summary:
                this.getMonthlySummary(
                    monthKey
                )

        };

    },


    /* =====================================================
       20. MONTH ROLLOVER
       ===================================================== */

    rolloverMonth(
        previousMonthKey,
        newMonthKey
    ) {

        const previousMonth =
            this.getMonth(
                previousMonthKey
            );


        const previousEndingBalance =
            this.calculateEndingBalance(
                previousMonthKey
            );


        if (
            previousEndingBalance === null
        ) {

            return null;

        }


        const data =
            this.load();


        if (
            data.months[
                newMonthKey
            ]
        ) {

            return data.months[
                newMonthKey
            ];

        }


        const newMonth =
            this.createDefaultMonth(
                newMonthKey
            );


        newMonth.startingBalance =
            previousEndingBalance;


        /*
            Income and expenses recur dynamically.

            Savings balances persist globally.

            Bills still use the existing monthly rollover.
        */

        newMonth.bills =

            previousMonth.bills

                .filter(
                    bill =>
                        bill.recurring
                )

                .map(
                    bill => {

                        const originalDay =
                            bill.dueDate
                                ?.slice(-2) ||
                            "01";


                        const [
                            year,
                            month
                        ] =
                            newMonthKey
                                .split("-")
                                .map(Number);


                        const safeDay =
                            Math.min(

                                Number(
                                    originalDay
                                ),

                                this.daysInMonth(
                                    year,
                                    month
                                )

                            );


                        return {

                            ...bill,

                            id:
                                this.generateId(
                                    "bill"
                                ),

                            dueDate:
                                `${newMonthKey}-` +
                                `${String(
                                    safeDay
                                ).padStart(
                                    2,
                                    "0"
                                )}`,

                            paid:
                                false,

                            paidDate:
                                "",

                            createdAt:
                                this.now(),

                            updatedAt:
                                this.now()

                        };

                    }
                );


        data.months[
            newMonthKey
        ] =
            newMonth;


        if (
            !this.save(
                data
            )
        ) {

            return null;

        }


        return newMonth;

    },


    /* =====================================================
       21. MONTH UTILITIES
       ===================================================== */

    monthExists(
        monthKey
    ) {

        return Boolean(
            this.load()
                .months[
                    monthKey
                ]
        );

    },


    getMonthKeys() {

        return Object.keys(
            this.load().months
        ).sort();

    },


    /* =====================================================
       22. EXPORT / IMPORT / RESET
       ===================================================== */

    exportData() {

        return JSON.stringify(
            this.load(),
            null,
            2
        );

    },


    importData(
        jsonData
    ) {

        try {

            const parsedData =

                typeof jsonData ===
                    "string"

                    ? JSON.parse(
                        jsonData
                    )

                    : jsonData;


            if (
                !parsedData ||
                typeof parsedData !==
                    "object"
            ) {

                throw new Error(
                    "Invalid M-Wallet data."
                );

            }


            const normalized =
                this.normalizeData(
                    parsedData
                );


            return Boolean(
                this.save(
                    normalized
                )
            );

        }

        catch (
            error
        ) {

            console.error(
                "Unable to import M-Wallet data:",
                error
            );


            return false;

        }

    },


    clearAllData() {
        const defaultData =
            this.createDefaultData();


        if (
            !this.save(
                defaultData
            )
        ) {

            return null;

        }


        this.legacyStorageKeys
            .forEach(
                key => {

                    localStorage.removeItem(
                        key
                    );

                }
            );


        localStorage.removeItem(
            "budgetTrackerMoneyEntries"
        );


        localStorage.removeItem(
            "mWalletMoneyEntries"
        );


        return defaultData;

    },


    /* =====================================================
       CATEGORIES (P2.6.0)

       Centralized category/subcategory configuration store.
       Read helpers return cloned data so callers cannot
       mutate internal state without going through a storage
       method below. Legacy expense/bill/transaction category
       strings are untouched here (see P2.6.2).
       ===================================================== */

    getCategories(
        options = {}
    ) {

        const data =
            this.load();

        const list =
            data.settings
                ?.categories
                ?.list ||
            [];

        const enabledOnly =
            Boolean(
                options.enabledOnly
            );

        const filtered =
            enabledOnly
                ? list.filter(
                    category =>
                        category.enabled
                )
                : list;

        return this.cloneJSON(
            filtered
        );

    },


    getCategory(
        categoryId
    ) {

        const data =
            this.load();

        const category =
            (
                data.settings
                    ?.categories
                    ?.list ||
                []
            ).find(
                item =>
                    item.id ===
                    categoryId
            );

        return category
            ? this.cloneJSON(
                category
            )
            : null;

    },


    getSubcategories(
        categoryId,
        options = {}
    ) {

        const category =
            this.getCategory(
                categoryId
            );


        if (
            !category
        ) {
            return [];
        }


        const enabledOnly =
            Boolean(
                options.enabledOnly
            );

        const list =
            Array.isArray(
                category.subcategories
            )
                ? category.subcategories
                : [];

        return enabledOnly
            ? list.filter(
                subcategory =>
                    subcategory.enabled
            )
            : list;

    },


    getSubcategory(
        categoryId,
        subcategoryId
    ) {

        const subcategories =
            this.getSubcategories(
                categoryId
            );

        return (
            subcategories.find(
                item =>
                    item.id ===
                    subcategoryId
            ) ||
            null
        );

    },


    addCustomCategory(
        name
    ) {

        const trimmedName =
            String(
                name ?? ""
            ).trim();


        if (
            !trimmedName
        ) {
            return null;
        }


        const data =
            this.load();

        const list =
            data.settings.categories.list;

        const nameKey =
            trimmedName.toLowerCase();

        const isDuplicate =
            list.some(
                category =>
                    category.name.toLowerCase() ===
                    nameKey
            );


        if (
            isDuplicate
        ) {
            return null;
        }


        const category = {

            id:
                this.generateId(
                    "category"
                ),

            name:
                trimmedName,

            system:
                false,

            enabled:
                true,

            subcategories:
                []

        };


        list.push(
            category
        );


        if (
            !this.save(
                data
            )
        ) {
            return null;
        }


        return this.getCategory(
            category.id
        );

    },


    renameCategory(
        categoryId,
        name
    ) {

        const trimmedName =
            String(
                name ?? ""
            ).trim();


        if (
            !trimmedName
        ) {
            return null;
        }


        const data =
            this.load();

        const list =
            data.settings.categories.list;

        const category =
            list.find(
                item =>
                    item.id ===
                    categoryId
            );


        if (
            !category
        ) {
            return null;
        }


        const nameKey =
            trimmedName.toLowerCase();

        const isDuplicate =
            list.some(
                item =>
                    item.id !==
                        categoryId &&
                    item.name.toLowerCase() ===
                        nameKey
            );


        if (
            isDuplicate
        ) {
            return null;
        }


        category.name =
            trimmedName;


        if (
            !this.save(
                data
            )
        ) {
            return null;
        }


        return this.getCategory(
            categoryId
        );

    },


    setCategoryEnabled(
        categoryId,
        enabled
    ) {

        const data =
            this.load();

        const category =
            data.settings.categories.list.find(
                item =>
                    item.id ===
                    categoryId
            );


        if (
            !category
        ) {
            return false;
        }


        category.enabled =
            Boolean(
                enabled
            );


        return this.save(
            data
        );

    },


    deleteCustomCategory(
        categoryId
    ) {

        const data =
            this.load();

        const list =
            data.settings.categories.list;

        const category =
            list.find(
                item =>
                    item.id ===
                    categoryId
            );


        if (
            !category
        ) {
            return false;
        }


        // System categories can be disabled but never deleted.
        if (
            category.system
        ) {
            return false;
        }


        const before =
            list.length;

        data.settings.categories.list =
            list.filter(
                item =>
                    item.id !==
                    categoryId
            );


        if (
            !this.save(
                data
            )
        ) {
            return false;
        }


        return (
            data.settings.categories.list.length !==
            before
        );

    },


    addCustomSubcategory(
        categoryId,
        name
    ) {

        const trimmedName =
            String(
                name ?? ""
            ).trim();


        if (
            !trimmedName
        ) {
            return null;
        }


        const data =
            this.load();

        const category =
            data.settings.categories.list.find(
                item =>
                    item.id ===
                    categoryId
            );


        if (
            !category
        ) {
            return null;
        }


        category.subcategories =
            Array.isArray(
                category.subcategories
            )
                ? category.subcategories
                : [];


        const nameKey =
            trimmedName.toLowerCase();

        const isDuplicate =
            category.subcategories.some(
                item =>
                    item.name.toLowerCase() ===
                    nameKey
            );


        if (
            isDuplicate
        ) {
            return null;
        }


        const subcategory = {

            id:
                this.generateId(
                    "subcategory"
                ),

            name:
                trimmedName,

            system:
                false,

            enabled:
                true

        };


        category.subcategories.push(
            subcategory
        );


        if (
            !this.save(
                data
            )
        ) {
            return null;
        }


        return this.getSubcategory(
            categoryId,
            subcategory.id
        );

    },


    renameSubcategory(
        categoryId,
        subcategoryId,
        name
    ) {

        const trimmedName =
            String(
                name ?? ""
            ).trim();


        if (
            !trimmedName
        ) {
            return null;
        }


        const data =
            this.load();

        const category =
            data.settings.categories.list.find(
                item =>
                    item.id ===
                    categoryId
            );


        if (
            !category ||
            !Array.isArray(
                category.subcategories
            )
        ) {
            return null;
        }


        const subcategory =
            category.subcategories.find(
                item =>
                    item.id ===
                    subcategoryId
            );


        if (
            !subcategory
        ) {
            return null;
        }


        const nameKey =
            trimmedName.toLowerCase();

        const isDuplicate =
            category.subcategories.some(
                item =>
                    item.id !==
                        subcategoryId &&
                    item.name.toLowerCase() ===
                        nameKey
            );


        if (
            isDuplicate
        ) {
            return null;
        }


        subcategory.name =
            trimmedName;


        if (
            !this.save(
                data
            )
        ) {
            return null;
        }


        return this.getSubcategory(
            categoryId,
            subcategoryId
        );

    },


    setSubcategoryEnabled(
        categoryId,
        subcategoryId,
        enabled
    ) {

        const data =
            this.load();

        const category =
            data.settings.categories.list.find(
                item =>
                    item.id ===
                    categoryId
            );

        const subcategory =
            category
                ?.subcategories
                ?.find(
                    item =>
                        item.id ===
                        subcategoryId
                );


        if (
            !subcategory
        ) {
            return false;
        }


        subcategory.enabled =
            Boolean(
                enabled
            );


        return this.save(
            data
        );

    },


    deleteCustomSubcategory(
        categoryId,
        subcategoryId
    ) {

        const data =
            this.load();

        const category =
            data.settings.categories.list.find(
                item =>
                    item.id ===
                    categoryId
            );


        if (
            !category ||
            !Array.isArray(
                category.subcategories
            )
        ) {
            return false;
        }


        const subcategory =
            category.subcategories.find(
                item =>
                    item.id ===
                    subcategoryId
            );


        if (
            !subcategory
        ) {
            return false;
        }


        // System subcategories can be disabled but never deleted.
        if (
            subcategory.system
        ) {
            return false;
        }


        const before =
            category.subcategories.length;

        category.subcategories =
            category.subcategories.filter(
                item =>
                    item.id !==
                    subcategoryId
            );


        if (
            !this.save(
                data
            )
        ) {
            return false;
        }


        return (
            category.subcategories.length !==
            before
        );

    }

};


/* =========================================================
   23. GLOBAL CONNECTIONS
   ========================================================= */

window.BudgetStorage =
    BudgetStorage;


window.MWalletStorage =
    BudgetStorage;


/* =========================================================
   24. INITIALIZE STORAGE
   ========================================================= */

BudgetStorage.load();


console.log(
    "M-Wallet storage v5 loaded - Savings Account + Goal Allocation System ready."
);