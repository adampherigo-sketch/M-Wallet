/* =========================================================
   M-WALLET
   Local Storage / Data Management
   storage.js
   Phase 2.2 - Income + Expense Management
   ========================================================= */

const BudgetStorage = {

    storageKey: "mWalletData",

    legacyStorageKeys: [
        "budgetTrackerData"
    ],

    version: 4,


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


    /* =====================================================
       2. DEFAULT DATA
       ===================================================== */

    createDefaultData() {

        return {

            version:
                this.version,


            settings: {

                currency:
                    "USD",

                currencySymbol:
                    "$",

                firstDayOfWeek:
                    "sunday"

            },


            income: [],

            expenses: [],

            months: {},

            savingsGoals: [],


            accounts: {

                checking: {

                    name:
                        "Checking",

                    balance:
                        0

                },


                savings: {

                    name:
                        "Savings",

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


            /*
                Legacy monthly collections remain
                available for compatibility.
            */

            paychecks: [],

            bills: [],

            expenses: [],

            transactions: [],

            savingsDeposits: [],

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
       3. NORMALIZATION / MIGRATION
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


        const defaults =
            this.createDefaultData();


        data.settings = {

            ...defaults.settings,

            ...(data.settings || {})

        };


        if (
            !data.months ||
            typeof data.months !==
                "object"
        ) {

            data.months =
                {};

        }


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


        if (
            !data.accounts ||
            typeof data.accounts !==
                "object"
        ) {

            data.accounts =
                defaults.accounts;

        }


        this.migrateLegacyPaychecks(
            data
        );


        this.migrateLegacyExpenses(
            data
        );


        data.version =
            this.version;


        return data;

    },


    /* =====================================================
       4. LOAD / SAVE
       ===================================================== */

    load() {

        let savedData =
            localStorage.getItem(
                this.storageKey
            );


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


            const defaultData =
                this.createDefaultData();


            this.save(
                defaultData
            );


            return defaultData;

        }

    },


    save(data) {

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


    getMonth(
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const data =
            this.load();


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


            this.save(
                data
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


        this.save(
            data
        );


        return normalizedMonth;

    },


    /* =====================================================
       5. STARTING BALANCE
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


        this.saveMonth(
            monthKey,
            month
        );


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
       6. INCOME
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


        this.save(
            data
        );


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


        this.save(
            data
        );


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


        this.save(
            data
        );


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
       7. LEGACY PAYCHECK COMPATIBILITY
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


        this.saveMonth(
            monthKey,
            month
        );


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


        this.saveMonth(
            monthKey,
            month
        );


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


        this.saveMonth(
            monthKey,
            month
        );


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

            this.deleteIncome(
                linkedIncome.id
            );

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
       8. BILLS
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


        this.saveMonth(
            monthKey,
            month
        );


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


        this.saveMonth(
            monthKey,
            month
        );


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

                ? this.now()
                    .split("T")[0]

                : "";


        bill.updatedAt =
            this.now();


        this.saveMonth(
            monthKey,
            month
        );


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


        this.saveMonth(
            monthKey,
            month
        );


        return (
            month.bills.length !==
            before
        );

    },


    /* =====================================================
       9. EXPENSES - P2.2
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


        this.save(
            data
        );


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


        this.save(
            data
        );


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


        this.save(
            data
        );


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


    /*
        Compatibility:
        app.js already calls getExpenses().
    */

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
       10. MANUAL TRANSACTIONS
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


        this.saveMonth(
            monthKey,
            month
        );


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


        this.saveMonth(
            monthKey,
            month
        );


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


        this.saveMonth(
            monthKey,
            month
        );


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
       11. SAVINGS GOALS
       ===================================================== */

    getSavingsGoals() {

        return [
            ...this.load()
                .savingsGoals
        ];

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


        const targetAmount =
            this.toPositiveNumber(
                goal.targetAmount
            );


        const currentAmount =
            this.toPositiveNumber(
                goal.currentAmount
            );


        const newGoal = {

            id:
                this.getRecordId(
                    goal,
                    "goal"
                ),

            name:
                goal.name ||
                "Savings Goal",

            targetAmount,

            currentAmount,

            createdMonthKey:
                goal.monthKey ||
                monthKey,

            targetDate:
                goal.targetDate ||
                "",

            notes:
                goal.notes ||
                "",

            completed:
                targetAmount > 0 &&
                currentAmount >=
                    targetAmount,

            createdAt:
                goal.createdAt ||
                this.now(),

            updatedAt:
                this.now()

        };


        data.savingsGoals.push(
            newGoal
        );


        this.save(
            data
        );


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


        Object.assign(
            goal,
            updates
        );


        goal.targetAmount =
            this.toPositiveNumber(
                goal.targetAmount
            );


        goal.currentAmount =
            this.toPositiveNumber(
                goal.currentAmount
            );


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >=
                goal.targetAmount;


        goal.updatedAt =
            this.now();


        this.save(
            data
        );


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


        goal.currentAmount +=
            this.toNumber(
                amount
            );


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >=
                goal.targetAmount;


        goal.updatedAt =
            this.now();


        this.save(
            data
        );


        return goal;

    },


    deleteSavingsGoal(
        goalId
    ) {

        const data =
            this.load();


        const before =
            data.savingsGoals.length;


        data.savingsGoals =
            data.savingsGoals.filter(
                goal =>
                    goal.id !==
                    goalId
            );


        this.save(
            data
        );


        return (
            data.savingsGoals.length !==
            before
        );

    },


    /* =====================================================
       12. SAVINGS DEPOSITS
       ===================================================== */

    addSavingsDeposit(
        deposit,
        monthKey =
            this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const amount =
            this.toPositiveNumber(
                deposit.amount
            );


        const newDeposit = {

            id:
                this.getRecordId(
                    deposit,
                    "savings-deposit"
                ),

            goalId:
                deposit.goalId ||
                null,

            name:
                deposit.name ||
                "Savings Deposit",

            date:
                deposit.date ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            amount,

            notes:
                deposit.notes ||
                "",

            createdAt:
                deposit.createdAt ||
                this.now()

        };


        month.savingsDeposits.push(
            newDeposit
        );


        month.savingsTransfers =
            month.savingsDeposits;


        this.saveMonth(
            monthKey,
            month
        );


        if (
            newDeposit.goalId
        ) {

            this.addToSavingsGoal(

                newDeposit.goalId,

                amount

            );

        }


        return newDeposit;

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

        const month =
            this.getMonth(
                monthKey
            );


        const before =
            month.savingsDeposits
                .length;


        month.savingsDeposits =
            month.savingsDeposits.filter(
                item =>
                    item.id !==
                    depositId
            );


        month.savingsTransfers =
            month.savingsDeposits;


        this.saveMonth(
            monthKey,
            month
        );


        return (
            month.savingsDeposits
                .length !==
            before
        );

    },


    addSavingsTransfer(
        transfer,
        monthKey =
            this.getSelectedMonthKey()
    ) {

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
       13. MONEY.JS SAVE ROUTER
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
       14. TOTALS
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


        this.saveMonth(
            monthKey,
            month
        );


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
       15. COMBINED ACTIVITY
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


        /* INCOME */

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


        /* BILLS */

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


        /* EXPENSES */

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


        /* MANUAL TRANSACTIONS */

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


        /* SAVINGS */

        month.savingsDeposits.forEach(
            deposit => {

                transactions.push({

                    id:
                        deposit.id,

                    sourceType:
                        "savings-deposit",

                    type:
                        "savings",

                    name:
                        deposit.name,

                    description:
                        deposit.name,

                    date:
                        deposit.date,

                    amount:
                        -this.toPositiveNumber(
                            deposit.amount
                        ),

                    category:
                        "Savings"

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
       16. MONTH SNAPSHOT
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


            savingsGoals:
                this.getSavingsGoals(),


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
       17. MONTH ROLLOVER
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
            Income and expenses now recur dynamically,
            so they are NOT copied month-to-month.

            Bills still use the original rollover system.
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


        this.save(
            data
        );


        return newMonth;

    },


    /* =====================================================
       18. MONTH UTILITIES
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
       19. EXPORT / IMPORT / RESET
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


            this.save(
                normalized
            );


            return true;

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

        localStorage.removeItem(
            this.storageKey
        );


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


        const defaultData =
            this.createDefaultData();


        this.save(
            defaultData
        );


        return defaultData;

    }

};


/* =========================================================
   20. GLOBAL CONNECTIONS
   ========================================================= */

window.BudgetStorage =
    BudgetStorage;


window.MWalletStorage =
    BudgetStorage;

/* =========================================================
   21. INITIALIZE STORAGE
   ========================================================= */

BudgetStorage.load();


console.log(
    "M-Wallet storage v4 loaded - P2.2 Expense Management ready."
);