/* =========================================================
   M-WALLET
   Money Management + Universal Popup
   money.js

   Savings System Upgrade
   Checking ↔ General Savings ↔ Savings Goals
   ========================================================= */


/* =========================================================
   1. SAVINGS HELPERS
   ========================================================= */

function getMoneyStorage() {

    return (
        window.MWalletStorage ||
        window.BudgetStorage ||
        null
    );

}


function formatMoneyCurrency(
    value
) {

    const storage =
        getMoneyStorage();


    let currency =
        "USD";


    try {

        currency =
            storage
                ?.load()
                ?.settings
                ?.currency ||
            "USD";

    }

    catch (error) {

        currency =
            "USD";

    }


    return new Intl.NumberFormat(
        "en-US",
        {
            style:
                "currency",

            currency
        }
    ).format(
        Number(
            value
        ) || 0
    );

}


function getGeneralSavingsBalance() {

    const storage =
        getMoneyStorage();


    if (
        storage &&
        typeof storage.getSavingsBalance ===
            "function"
    ) {

        return Number(
            storage.getSavingsBalance()
        ) || 0;

    }


    return 0;

}


function getSavingsGoalOptions() {

    const storage =
        getMoneyStorage();


    if (
        !storage ||
        typeof storage.getSavingsGoals !==
            "function"
    ) {

        return [];

    }


    return storage
        .getSavingsGoals()
        .map(
            goal => {

                const current =
                    Number(
                        goal.currentAmount
                    ) || 0;


                const target =
                    Number(
                        goal.targetAmount
                    ) || 0;


                return {

                    value:
                        goal.id,

                    label:
                        (
                            `${goal.name} — ` +
                            `${formatMoneyCurrency(
                                current
                            )} / ` +
                            `${formatMoneyCurrency(
                                target
                            )}`
                        )

                };

            }
        );

}


/* =========================================================
   2. MONEY FORM DEFINITIONS
   ========================================================= */

const MONEY_FORMS = {

    income: {

        title:
            "Add Income",

        fields: [

            {
                type: "text",
                name: "name",
                label: "Income Name / Source",
                placeholder: "Example: Amazon Paycheck",
                required: true
            },

            {
                type: "number",
                name: "amount",
                label: "Amount",
                placeholder: "0.00",
                min: "0.01",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "date",
                name: "date",
                label: "Income Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "select",
                name: "category",
                label: "Income Type",
                placeholder: "Select income type",
                required: true,

                options: [
                    "Employment",
                    "Self-Employment",
                    "Freelance",
                    "Side Gig",
                    "Tips",
                    "Benefits",
                    "Investment Income",
                    "Refund / Reimbursement",
                    "Gift",
                    "Other Income"
                ]
            },

            {
                type: "checkbox",
                name: "recurring",
                label: "Recurring Income"
            },

            {
                type: "select",
                name: "frequency",
                label: "Income Frequency",
                placeholder: "Select frequency",
                required: true,

                options: [

                    {
                        value: "weekly",
                        label: "Weekly"
                    },

                    {
                        value: "biweekly",
                        label: "Biweekly"
                    },

                    {
                        value: "twice-monthly",
                        label: "Twice Monthly"
                    },

                    {
                        value: "monthly",
                        label: "Monthly"
                    },

                    {
                        value: "custom",
                        label: "Custom"
                    }

                ],

                showWhen: {
                    field: "recurring",
                    equals: true
                }
            },

            {
                type: "number",
                name: "twiceMonthlyDay1",
                label: "First Pay Day",
                min: "1",
                max: "31",
                step: "1",
                value: "1",
                required: true,

                help:
                    "Day of the month for the first payment.",

                showWhen: {
                    field: "frequency",
                    equals: "twice-monthly"
                }
            },

            {
                type: "number",
                name: "twiceMonthlyDay2",
                label: "Second Pay Day",
                min: "1",
                max: "31",
                step: "1",
                value: "15",
                required: true,

                help:
                    "Day of the month for the second payment.",

                showWhen: {
                    field: "frequency",
                    equals: "twice-monthly"
                }
            },

            {
                type: "number",
                name: "customInterval",
                label: "Repeat Every",
                min: "1",
                step: "1",
                value: "1",
                required: true,

                showWhen: {
                    field: "frequency",
                    equals: "custom"
                }
            },

            {
                type: "select",
                name: "customUnit",
                label: "Custom Frequency Unit",
                placeholder: "Select unit",
                required: true,

                options: [

                    {
                        value: "days",
                        label: "Day(s)"
                    },

                    {
                        value: "weeks",
                        label: "Week(s)"
                    },

                    {
                        value: "months",
                        label: "Month(s)"
                    },

                    {
                        value: "years",
                        label: "Year(s)"
                    }

                ],

                showWhen: {
                    field: "frequency",
                    equals: "custom"
                }
            },

            {
                type: "date",
                name: "endDate",
                label: "Recurring End Date",

                help:
                    "Optional. Leave blank if this income continues indefinitely.",

                showWhen: {
                    field: "recurring",
                    equals: true
                }
            },

            {
                type: "textarea",
                name: "notes",
                label: "Notes",
                placeholder:
                    "Optional notes about this income"
            }

        ]

    },


    bill: {

        title:
            "Add Bill",

        fields: [

            {
                type: "text",
                name: "name",
                label: "Bill Name",
                placeholder: "Example: Phone Bill",
                required: true
            },

            {
                type: "date",
                name: "dueDate",
                label: "Due Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "number",
                name: "amount",
                label: "Amount",
                placeholder: "0.00",
                min: "0",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "select",
                name: "category",
                label: "Category",
                placeholder: "Select a category",
                required: true,

                options: [
                    "Housing",
                    "Utilities",
                    "Phone",
                    "Internet",
                    "Insurance",
                    "Transportation",
                    "Subscriptions",
                    "Debt",
                    "Health",
                    "Pets",
                    "Other"
                ]
            },

            {
                type: "checkbox",
                name: "recurring",
                label: "Repeats every month"
            }

        ]

    },


    expense: {

        title:
            "Add Expense",

        fields: [

            {
                type: "text",
                name: "name",
                label: "Expense Name",
                placeholder: "Example: Grocery Run",
                required: true
            },

            {
                type: "text",
                name: "merchant",
                label: "Merchant / Vendor / Payee / Place",
                placeholder: "Example: Walmart, REI, Netflix"
            },

            {
                type: "number",
                name: "amount",
                label: "Amount",
                placeholder: "0.00",
                min: "0.01",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "date",
                name: "date",
                label: "Expense Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "select",
                name: "category",
                label: "Category",
                placeholder: "Select a category",
                required: true,

                options: [
                    "Housing",
                    "Utilities",
                    "Groceries",
                    "Dining",
                    "Transportation",
                    "Shopping",
                    "Entertainment",
                    "Tickets & Events",
                    "Health",
                    "Personal Care",
                    "Household",
                    "Pets",
                    "Travel",
                    "Education",
                    "Gifts",
                    "Fees",
                    "Other"
                ]
            },

            {
                type: "text",
                name: "subcategory",
                label: "Subcategory",
                placeholder: "Example: Fuel, Fast Food, Concert Ticket"
            },

            {
                type: "textarea",
                name: "notes",
                label: "Notes",
                placeholder: "Optional notes about this expense"
            },

            {
                type: "checkbox",
                name: "recurring",
                label: "Recurring Expense"
            },

            {
                type: "select",
                name: "frequency",
                label: "Expense Frequency",
                placeholder: "Select frequency",
                required: true,

                options: [

                    {
                        value: "weekly",
                        label: "Weekly"
                    },

                    {
                        value: "biweekly",
                        label: "Biweekly"
                    },

                    {
                        value: "monthly",
                        label: "Monthly"
                    },

                    {
                        value: "yearly",
                        label: "Yearly"
                    }

                ],

                showWhen: {
                    field: "recurring",
                    equals: true
                }
            }

        ]

    },


    transaction: {

        title:
            "Add Transaction",

        fields: [

            {
                type: "text",
                name: "description",
                label: "Description",
                placeholder: "Example: Walmart",
                required: true
            },

            {
                type: "date",
                name: "date",
                label: "Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "select",
                name: "category",
                label: "Category",
                placeholder: "Select a category",
                required: true,

                options: [
                    "Income",
                    "Bills",
                    "Groceries",
                    "Dining",
                    "Transportation",
                    "Shopping",
                    "Entertainment",
                    "Health",
                    "Personal",
                    "Savings",
                    "Transfer",
                    "Other"
                ]
            },

            {
                type: "number",
                name: "amount",
                label: "Amount",
                placeholder: "0.00",
                step: "0.01",
                money: true,
                required: true,

                help:
                    "Use a negative number for money going out. Example: -25.50"
            }

        ]

    },


    /* =====================================================
       SAVINGS GOAL
       ===================================================== */

    "savings-goal": {

        title:
            "Add Savings Goal",

        fields: [

            {
                type: "text",
                name: "name",
                label: "Fund / Goal Name",
                placeholder: "Example: Fun Fund",
                required: true
            },

            {
                type: "number",
                name: "targetAmount",
                label: "Goal Amount",
                placeholder: "1000.00",
                min: "0.01",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "number",
                name: "currentAmount",
                label: "Allocated Amount",
                placeholder: "0.00",
                min: "0",
                step: "0.01",
                money: true,
                value: "0",
                required: true,

                help:
                    "Money assigned here comes from General Savings. Lowering this amount returns the difference to General Savings."
            },

            {
                type: "date",
                name: "targetDate",
                label: "Target Date",

                help:
                    "Optional."
            },

            {
                type: "textarea",
                name: "notes",
                label: "Notes",
                placeholder:
                    "Optional notes about this savings goal"
            }

        ]

    },


    /* =====================================================
       CHECKING → GENERAL SAVINGS
       ===================================================== */

    "savings-deposit": {

        title:
            "Add Money to Savings",

        fields: [

            {
                type: "number",
                name: "amount",
                label: "Amount to Move to Savings",
                placeholder: "0.00",
                min: "0.01",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "date",
                name: "date",
                label: "Transfer Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "textarea",
                name: "notes",
                label: "Notes",
                placeholder:
                    "Optional notes about this transfer"
            }

        ]

    },


    /* =====================================================
       GENERAL SAVINGS → CHECKING
       ===================================================== */

    "savings-withdrawal": {

        title:
            "Move Savings to Checking",

        fields: [

            {
                type: "number",
                name: "amount",
                label: "Amount to Return to Checking",
                placeholder: "0.00",
                min: "0.01",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "date",
                name: "date",
                label: "Transfer Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "textarea",
                name: "notes",
                label: "Notes",
                placeholder:
                    "Optional notes about this transfer"
            }

        ]

    },


    /* =====================================================
       GENERAL SAVINGS → FUND
       ===================================================== */

    "savings-allocation": {

        title:
            "Allocate Savings to Fund",

        fields: [

            {
                type: "select",
                name: "goalId",
                label: "Savings Fund",
                placeholder: "Select a fund",
                required: true,
                dynamicOptions:
                    getSavingsGoalOptions
            },

            {
                type: "number",
                name: "amount",
                label: "Amount to Allocate",
                placeholder: "0.00",
                min: "0.01",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "date",
                name: "date",
                label: "Allocation Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "textarea",
                name: "notes",
                label: "Notes",
                placeholder:
                    "Optional notes about this allocation"
            }

        ]

    },


    /* =====================================================
       FUND → GENERAL SAVINGS
       ===================================================== */

    "savings-release": {

        title:
            "Return Fund Money to Savings",

        fields: [

            {
                type: "select",
                name: "goalId",
                label: "Savings Fund",
                placeholder: "Select a fund",
                required: true,
                dynamicOptions:
                    getSavingsGoalOptions
            },

            {
                type: "number",
                name: "amount",
                label: "Amount to Return",
                placeholder: "0.00",
                min: "0.01",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "date",
                name: "date",
                label: "Transfer Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "textarea",
                name: "notes",
                label: "Notes",
                placeholder:
                    "Optional notes about returning this money"
            }

        ]

    },


    "starting-balance": {

        title:
            "Change Starting Balance",

        fields: [

            {
                type: "number",
                name: "balance",
                label: "Starting Balance",
                placeholder: "0.00",
                step: "0.01",
                money: true,
                required: true,

                help:
                    "This is the checking balance you are starting the selected month with."
            }

        ]

    }

};


/* =========================================================
   3. MODAL STATE
   ========================================================= */

let currentMoneyAction =
    null;


let currentEditingIncomeId =
    null;


let currentEditingExpenseId =
    null;


let currentEditingSavingsGoalId =
    null;


let originalFormState =
    null;


let lastFocusedElement =
    null;


/* =========================================================
   4. DOM REFERENCES
   ========================================================= */

const moneyModal =
    document.getElementById(
        "money-modal"
    );


const moneyModalTitle =
    document.getElementById(
        "money-modal-title"
    );


const moneyModalBody =
    document.getElementById(
        "money-modal-body"
    );


const moneyModalForm =
    document.getElementById(
        "money-modal-form"
    );


const moneyModalUndo =
    document.getElementById(
        "money-modal-undo"
    );


const moneyModalSave =
    document.getElementById(
        "money-modal-save"
    );


const moneyModalStatus =
    document.getElementById(
        "money-modal-status"
    );


/* =========================================================
   5. ACTION ALIASES
   ========================================================= */

function normalizeMoneyAction(
    action
) {

    if (
        action ===
        "paycheck"
    ) {

        return "income";

    }


    return action;

}


/* =========================================================
   6. SELECTED MONTH / YEAR
   ========================================================= */

function getSelectedBudgetPeriod() {

    const monthSelect =
        document.getElementById(
            "month-select"
        );


    const yearSelect =
        document.getElementById(
            "year-select"
        );


    const now =
        new Date();


    const month =
        monthSelect?.value ||
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const year =
        yearSelect?.value ||
        String(
            now.getFullYear()
        );


    return {

        month,

        year,

        key:
            `${year}-${month}`

    };

}


/* =========================================================
   7. DEFAULT DATE
   ========================================================= */

function getDefaultDateForSelectedMonth() {

    const {
        month,
        year
    } =
        getSelectedBudgetPeriod();


    const now =
        new Date();


    const currentMonth =
        String(
            now.getMonth() + 1
        ).padStart(
            2,
            "0"
        );


    const currentYear =
        String(
            now.getFullYear()
        );


    let day =
        1;


    if (
        month === currentMonth &&
        year === currentYear
    ) {

        day =
            now.getDate();

    }


    const finalDayOfMonth =
        new Date(
            Number(year),
            Number(month),
            0
        ).getDate();


    day =
        Math.min(
            day,
            finalDayOfMonth
        );


    return (
        `${year}-` +
        `${month}-` +
        `${String(
            day
        ).padStart(
            2,
            "0"
        )}`
    );

}


/* =========================================================
   8. FIELD WRAPPER
   ========================================================= */

function createFieldWrapper(
    field
) {

    const wrapper =
        document.createElement(
            "div"
        );


    wrapper.className =
        field.type ===
            "checkbox"

            ? "form-group checkbox"

            : "form-group";


    wrapper.dataset.moneyField =
        field.name;


    wrapper._moneyFieldConfig =
        field;


    return wrapper;

}


/* =========================================================
   9. CREATE FORM FIELD
   ========================================================= */

function createMoneyField(
    field
) {

    const wrapper =
        createFieldWrapper(
            field
        );


    if (
        field.type ===
        "checkbox"
    ) {

        const input =
            document.createElement(
                "input"
            );


        input.type =
            "checkbox";


        input.id =
            `money-${field.name}`;


        input.name =
            field.name;


        input.checked =
            Boolean(
                field.checked
            );


        const label =
            document.createElement(
                "label"
            );


        label.htmlFor =
            input.id;


        label.textContent =
            field.label;


        wrapper.append(
            input,
            label
        );


        return wrapper;

    }


    const label =
        document.createElement(
            "label"
        );


    label.htmlFor =
        `money-${field.name}`;


    label.textContent =
        field.label;


    wrapper.appendChild(
        label
    );


    if (
        field.type ===
        "select"
    ) {

        wrapper.appendChild(
            buildSelect(
                field
            )
        );

    }

    else if (
        field.type ===
        "textarea"
    ) {

        wrapper.appendChild(
            buildTextarea(
                field
            )
        );

    }

    else {

        if (
            field.money
        ) {

            const moneyWrapper =
                document.createElement(
                    "div"
                );


            moneyWrapper.className =
                "money-input-wrapper";


            const symbol =
                document.createElement(
                    "span"
                );


            symbol.className =
                "money-input-symbol";


            symbol.textContent =
                "$";


            moneyWrapper.append(
                symbol,
                buildInput(
                    field
                )
            );


            wrapper.appendChild(
                moneyWrapper
            );

        }

        else {

            wrapper.appendChild(
                buildInput(
                    field
                )
            );

        }

    }


    if (
        field.help
    ) {

        const help =
            document.createElement(
                "small"
            );


        help.className =
            "form-help";


        help.textContent =
            typeof field.help ===
                "function"

                ? field.help()

                : field.help;


        wrapper.appendChild(
            help
        );

    }


    return wrapper;

}


/* =========================================================
   10. BUILD INPUT
   ========================================================= */

function buildInput(
    field
) {

    const input =
        document.createElement(
            "input"
        );


    input.type =
        field.type;


    input.id =
        `money-${field.name}`;


    input.name =
        field.name;


    if (
        field.placeholder
    ) {

        input.placeholder =
            field.placeholder;

    }


    if (
        field.required
    ) {

        input.required =
            true;

    }


    if (
        field.min !==
        undefined
    ) {

        input.min =
            field.min;

    }


    if (
        field.max !==
        undefined
    ) {

        input.max =
            field.max;

    }


    if (
        field.step !==
        undefined
    ) {

        input.step =
            field.step;

    }


    if (
        field.value !==
        undefined
    ) {

        input.value =
            field.value;

    }


    if (
        field.type ===
            "date" &&
        field.useSelectedMonth
    ) {

        input.value =
            getDefaultDateForSelectedMonth();

    }


    return input;

}


/* =========================================================
   11. BUILD SELECT
   ========================================================= */

function buildSelect(
    field
) {

    const select =
        document.createElement(
            "select"
        );


    select.id =
        `money-${field.name}`;


    select.name =
        field.name;


    if (
        field.required
    ) {

        select.required =
            true;

    }


    const placeholderOption =
        document.createElement(
            "option"
        );


    placeholderOption.value =
        "";


    placeholderOption.textContent =
        field.placeholder ||
        "Select an option";


    placeholderOption.disabled =
        true;


    placeholderOption.selected =
        true;


    select.appendChild(
        placeholderOption
    );


    const options =
        typeof field.dynamicOptions ===
            "function"

            ? field.dynamicOptions()

            : (
                field.options ||
                []
            );


    options.forEach(
        optionDefinition => {

            const option =
                document.createElement(
                    "option"
                );


            if (
                typeof optionDefinition ===
                "object"
            ) {

                option.value =
                    optionDefinition.value;


                option.textContent =
                    optionDefinition.label;

            }

            else {

                option.value =
                    optionDefinition;


                option.textContent =
                    optionDefinition;

            }


            if (
                field.value !==
                    undefined &&
                String(
                    field.value
                ) ===
                String(
                    option.value
                )
            ) {

                option.selected =
                    true;


                placeholderOption.selected =
                    false;

            }


            select.appendChild(
                option
            );

        }
    );


    return select;

}


/* =========================================================
   12. BUILD TEXTAREA
   ========================================================= */

function buildTextarea(
    field
) {

    const textarea =
        document.createElement(
            "textarea"
        );


    textarea.id =
        `money-${field.name}`;


    textarea.name =
        field.name;


    if (
        field.placeholder
    ) {

        textarea.placeholder =
            field.placeholder;

    }


    if (
        field.required
    ) {

        textarea.required =
            true;

    }


    if (
        field.value !==
        undefined
    ) {

        textarea.value =
            field.value;

    }


    return textarea;

}


/* =========================================================
   13. SAVINGS CONTEXT BOX
   ========================================================= */

function createSavingsContextBox(
    action
) {

    const savingsBalance =
        getGeneralSavingsBalance();


    let title =
        "";


    let message =
        "";


    switch (
        action
    ) {

        case "savings-deposit":

            title =
                `General Savings: ${formatMoneyCurrency(
                    savingsBalance
                )}`;


            message =
                "Money added here moves out of your Checking balance and into General Savings.";

            break;


        case "savings-withdrawal":

            title =
                `Available Savings: ${formatMoneyCurrency(
                    savingsBalance
                )}`;


            message =
                "Money withdrawn here leaves General Savings and is added back to your Checking balance.";

            break;


        case "savings-allocation":

            title =
                `Available to Allocate: ${formatMoneyCurrency(
                    savingsBalance
                )}`;


            message =
                "This moves money from General Savings into one of your savings funds. Your total savings does not change.";

            break;


        case "savings-release":

            title =
                `General Savings: ${formatMoneyCurrency(
                    savingsBalance
                )}`;


            message =
                "This returns money from a savings fund back into General Savings.";

            break;


        case "savings-goal":

            title =
                `General Savings: ${formatMoneyCurrency(
                    savingsBalance
                )}`;


            message =
                "Fund balances are allocated from General Savings. Editing the allocated amount moves only the difference.";

            break;


        default:

            return null;

    }


    const box =
        document.createElement(
            "div"
        );


    box.className =
        "savings-form-context";


    box.innerHTML = `

        <strong>
            ${escapeMoneyHTML(
                title
            )}
        </strong>

        <span>
            ${escapeMoneyHTML(
                message
            )}
        </span>

    `;


    return box;

}


/* =========================================================
   14. GET FIELD VALUE
   ========================================================= */

function getMoneyFieldValue(
    fieldName
) {

    const field =
        moneyModalBody.querySelector(
            `[name="${fieldName}"]`
        );


    if (!field) {

        return undefined;

    }


    if (
        field.type ===
        "checkbox"
    ) {

        return field.checked;

    }


    return field.value;

}


/* =========================================================
   15. CONDITIONAL FIELDS
   ========================================================= */

function shouldShowMoneyField(
    field
) {

    if (
        !field.showWhen
    ) {

        return true;

    }


    const controllingValue =
        getMoneyFieldValue(
            field.showWhen.field
        );


    return (
        controllingValue ===
        field.showWhen.equals
    );

}


function updateConditionalMoneyFields() {

    const wrappers =
        moneyModalBody.querySelectorAll(
            "[data-money-field]"
        );


    wrappers.forEach(
        wrapper => {

            const field =
                wrapper
                    ._moneyFieldConfig;


            if (!field) {

                return;

            }


            const visible =
                shouldShowMoneyField(
                    field
                );


            wrapper.hidden =
                !visible;


            wrapper
                .querySelectorAll(
                    "input, select, textarea"
                )
                .forEach(
                    control => {

                        control.disabled =
                            !visible;


                        control.required =
                            Boolean(
                                visible &&
                                field.required
                            );

                    }
                );

        }
    );

}


/* =========================================================
   16. UPDATE SAVINGS FORM INFORMATION
   ========================================================= */

function updateSavingsFormInformation() {

    if (
        currentMoneyAction !==
            "savings-allocation" &&
        currentMoneyAction !==
            "savings-release"
    ) {

        return;

    }


    const goalId =
        getMoneyFieldValue(
            "goalId"
        );


    if (!goalId) {

        return;

    }


    const storage =
        getMoneyStorage();


    if (
        !storage ||
        typeof storage.getSavingsGoalById !==
            "function"
    ) {

        return;

    }


    const goal =
        storage.getSavingsGoalById(
            goalId
        );


    if (!goal) {

        return;

    }


    const amountField =
        moneyModalBody.querySelector(
            '[data-money-field="amount"]'
        );


    if (!amountField) {

        return;

    }


    let helper =
        amountField.querySelector(
            ".savings-dynamic-help"
        );


    if (!helper) {

        helper =
            document.createElement(
                "small"
            );


        helper.className =
            "form-help savings-dynamic-help";


        amountField.appendChild(
            helper
        );

    }


    if (
        currentMoneyAction ===
        "savings-release"
    ) {

        helper.textContent =
            (
                `${goal.name} currently contains ` +
                `${formatMoneyCurrency(
                    goal.currentAmount
                )}.`
            );

    }

    else {

        const remaining =
            Math.max(
                (
                    Number(
                        goal.targetAmount
                    ) || 0
                )
                -
                (
                    Number(
                        goal.currentAmount
                    ) || 0
                ),
                0
            );


        helper.textContent =
            (
                `${goal.name} needs ` +
                `${formatMoneyCurrency(
                    remaining
                )} more to reach its goal.`
            );

    }

}


/* =========================================================
   17. RENDER MONEY FORM
   ========================================================= */

function renderMoneyForm(
    action
) {

    const config =
        MONEY_FORMS[
            action
        ];


    if (!config) {

        console.error(
            `Unknown money action: ${action}`
        );


        return false;

    }


    moneyModalBody.innerHTML =
        "";


    moneyModalTitle.textContent =
        config.title;


    const savingsContext =
        createSavingsContextBox(
            action
        );


    if (
        savingsContext
    ) {

        moneyModalBody.appendChild(
            savingsContext
        );

    }


    config.fields.forEach(
        field => {

            moneyModalBody.appendChild(
                createMoneyField(
                    field
                )
            );

        }
    );


    updateConditionalMoneyFields();


    return true;

}


/* =========================================================
   18. POPULATE FORM
   ========================================================= */

function populateMoneyForm(
    record
) {

    if (!record) {

        return;

    }


    const values = {

        ...record,

        twiceMonthlyDay1:
            Array.isArray(
                record.twiceMonthlyDays
            )
                ? record.twiceMonthlyDays[0]
                : 1,

        twiceMonthlyDay2:
            Array.isArray(
                record.twiceMonthlyDays
            )
                ? record.twiceMonthlyDays[1]
                : 15

    };


    moneyModalBody
        .querySelectorAll(
            "input, select, textarea"
        )
        .forEach(
            field => {

                if (
                    !field.name
                ) {

                    return;

                }


                if (
                    !Object.prototype
                        .hasOwnProperty
                        .call(
                            values,
                            field.name
                        )
                ) {

                    return;

                }


                const value =
                    values[
                        field.name
                    ];


                if (
                    field.type ===
                    "checkbox"
                ) {

                    field.checked =
                        Boolean(
                            value
                        );

                }

                else {

                    field.value =
                        value ??
                        "";

                }

            }
        );


    updateConditionalMoneyFields();


    updateSavingsFormInformation();

}


/* =========================================================
   19. OPEN MONEY MODAL
   ========================================================= */

function openMoneyModal(
    action,
    options = {}
) {

    const normalizedAction =
        normalizeMoneyAction(
            action
        );


    const config =
        MONEY_FORMS[
            normalizedAction
        ];


    if (!config) {

        console.error(
            `Cannot open unknown money form: ${action}`
        );


        return;

    }


    currentMoneyAction =
        normalizedAction;


    currentEditingIncomeId =
        (
            normalizedAction ===
                "income" &&
            options.editingId
        )
            ? options.editingId
            : null;


    currentEditingExpenseId =
        (
            normalizedAction ===
                "expense" &&
            options.editingId
        )
            ? options.editingId
            : null;


    currentEditingSavingsGoalId =
        (
            normalizedAction ===
                "savings-goal" &&
            options.editingId
        )
            ? options.editingId
            : null;


    lastFocusedElement =
        document.activeElement;


    if (
        !renderMoneyForm(
            normalizedAction
        )
    ) {

        return;

    }


    if (
        options.record
    ) {

        populateMoneyForm(
            options.record
        );

    }


    if (
        currentEditingIncomeId
    ) {

        moneyModalTitle.textContent =
            "Edit Income";


        moneyModalSave.textContent =
            "💾 Save Changes";

    }

    else if (
        currentEditingExpenseId
    ) {

        moneyModalTitle.textContent =
            "Edit Expense";


        moneyModalSave.textContent =
            "💾 Save Changes";

    }

    else if (
        currentEditingSavingsGoalId
    ) {

        moneyModalTitle.textContent =
            "Edit Savings Fund";


        moneyModalSave.textContent =
            "💾 Save Changes";

    }

    else {

        moneyModalTitle.textContent =
            options.title ||
            config.title;


        if (
            moneyModalSave
        ) {

            moneyModalSave.textContent =
                "💾 Save";

        }

    }


    clearMoneyStatus();


    moneyModal.classList.add(
        "active"
    );


    moneyModal.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.classList.add(
        "modal-open"
    );


    originalFormState =
        captureMoneyFormState();


    requestAnimationFrame(
        () => {

            const firstInput =
                moneyModalBody.querySelector(
                    "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)"
                );


            if (
                firstInput
            ) {

                firstInput.focus();

            }

        }
    );

}


/* =========================================================
   20. INCOME EDITOR
   ========================================================= */

function openIncomeEditor(
    incomeId
) {

    const storage =
        getMoneyStorage();


    if (
        !storage ||
        typeof storage.getIncomeById !==
            "function"
    ) {

        console.error(
            "Income editing is not available."
        );


        return;

    }


    const income =
        storage.getIncomeById(
            incomeId
        );


    if (!income) {

        console.warn(
            `Income record not found: ${incomeId}`
        );


        return;

    }


    openMoneyModal(
        "income",
        {
            editingId:
                income.id,

            record:
                income
        }
    );

}


/* =========================================================
   21. EXPENSE EDITOR
   ========================================================= */

function openExpenseEditor(
    expenseId
) {

    const storage =
        getMoneyStorage();


    if (
        !storage ||
        typeof storage.getExpenseById !==
            "function"
    ) {

        console.error(
            "Expense editing is not available."
        );


        return;

    }


    const expense =
        storage.getExpenseById(
            expenseId
        );


    if (!expense) {

        console.warn(
            `Expense record not found: ${expenseId}`
        );


        return;

    }


    openMoneyModal(
        "expense",
        {
            editingId:
                expense.id,

            record:
                expense
        }
    );

}


/* =========================================================
   22. SAVINGS GOAL EDITOR
   ========================================================= */

function openSavingsGoalEditor(
    goalId
) {

    const storage =
        getMoneyStorage();


    if (
        !storage ||
        typeof storage.getSavingsGoalById !==
            "function"
    ) {

        console.error(
            "Savings goal editing is not available."
        );


        return;

    }


    const goal =
        storage.getSavingsGoalById(
            goalId
        );


    if (!goal) {

        console.warn(
            `Savings goal not found: ${goalId}`
        );


        return;

    }


    openMoneyModal(
        "savings-goal",
        {
            editingId:
                goal.id,

            record:
                goal
        }
    );

}


/* =========================================================
   23. OPEN SAVINGS ALLOCATION
   ========================================================= */

function openSavingsAllocation(
    goalId = null
) {

    openMoneyModal(
        "savings-allocation",
        {

            record:
                goalId
                    ? {
                        goalId
                    }
                    : null

        }
    );

}


/* =========================================================
   24. OPEN SAVINGS RELEASE
   ========================================================= */

function openSavingsRelease(
    goalId = null
) {

    openMoneyModal(
        "savings-release",
        {

            record:
                goalId
                    ? {
                        goalId
                    }
                    : null

        }
    );

}


/* =========================================================
   25. CLOSE MONEY MODAL
   ========================================================= */

function closeMoneyModal() {

    if (!moneyModal) {

        return;

    }


    moneyModal.classList.remove(
        "active"
    );


    moneyModal.setAttribute(
        "aria-hidden",
        "true"
    );


    document.body.classList.remove(
        "modal-open"
    );


    clearMoneyStatus();


    currentMoneyAction =
        null;


    currentEditingIncomeId =
        null;


    currentEditingExpenseId =
        null;


    currentEditingSavingsGoalId =
        null;


    originalFormState =
        null;


    if (
        moneyModalSave
    ) {

        moneyModalSave.textContent =
            "💾 Save";

    }


    if (
        lastFocusedElement &&
        typeof lastFocusedElement.focus ===
            "function"
    ) {

        lastFocusedElement.focus();

    }


    lastFocusedElement =
        null;

}


/* =========================================================
   26. CAPTURE FORM STATE
   ========================================================= */

function captureMoneyFormState() {

    const fields =
        moneyModalBody.querySelectorAll(
            "input, select, textarea"
        );


    const state =
        [];


    fields.forEach(
        field => {

            state.push({

                name:
                    field.name,

                type:
                    field.type,

                value:
                    field.value,

                checked:
                    field.checked

            });

        }
    );


    return state;

}


/* =========================================================
   27. UNDO FORM CHANGES
   ========================================================= */

function undoMoneyForm() {

    if (
        !originalFormState
    ) {

        return;

    }


    originalFormState.forEach(
        savedField => {

            const field =
                moneyModalBody.querySelector(
                    `[name="${savedField.name}"]`
                );


            if (!field) {

                return;

            }


            if (
                savedField.type ===
                "checkbox"
            ) {

                field.checked =
                    savedField.checked;

            }

            else {

                field.value =
                    savedField.value;

            }

        }
    );


    updateConditionalMoneyFields();


    updateSavingsFormInformation();


    showMoneyStatus(
        "Changes undone.",
        "success"
    );

}


/* =========================================================
   28. GET FORM DATA
   ========================================================= */

function getMoneyFormData() {

    const formData =
        new FormData(
            moneyModalForm
        );


    const data =
        {};


    formData.forEach(
        (
            value,
            key
        ) => {

            data[
                key
            ] =
                value;

        }
    );


    moneyModalBody
        .querySelectorAll(
            'input[type="checkbox"]'
        )
        .forEach(
            checkbox => {

                data[
                    checkbox.name
                ] =
                    checkbox.checked;

            }
        );


    moneyModalBody
        .querySelectorAll(
            'input[type="number"]'
        )
        .forEach(
            input => {

                if (
                    input.disabled
                ) {

                    return;

                }


                if (
                    input.value !==
                    ""
                ) {

                    data[
                        input.name
                    ] =
                        Number(
                            input.value
                        );

                }

            }
        );


    return data;

}


/* =========================================================
   29. CREATE MONEY RECORD
   ========================================================= */

function createMoneyRecord() {

    const period =
        getSelectedBudgetPeriod();


    const formData =
        getMoneyFormData();


    const editingId =

        currentEditingIncomeId ||

        currentEditingExpenseId ||

        currentEditingSavingsGoalId;


    const record = {

        id:
            editingId ||
            createMoneyId(),

        type:
            currentMoneyAction,

        monthKey:
            period.key,

        month:
            period.month,

        year:
            period.year,

        createdAt:
            new Date()
                .toISOString(),

        ...formData

    };


    /* -----------------------------------------------------
       INCOME
       ----------------------------------------------------- */

    if (
        currentMoneyAction ===
        "income"
    ) {

        record.incomeType =
            "income";


        record.amount =
            Math.abs(
                Number(
                    record.amount
                ) || 0
            );


        if (
            !record.recurring
        ) {

            record.frequency =
                "";


            record.endDate =
                "";


            record.customInterval =
                1;


            record.customUnit =
                "months";


            record.twiceMonthlyDays =
                [
                    1,
                    15
                ];

        }

        else {

            if (
                record.frequency ===
                "twice-monthly"
            ) {

                record.twiceMonthlyDays =
                    [

                        Number(
                            record.twiceMonthlyDay1
                        ) || 1,

                        Number(
                            record.twiceMonthlyDay2
                        ) || 15

                    ];

            }

            else {

                record.twiceMonthlyDays =
                    [
                        1,
                        15
                    ];

            }


            if (
                record.frequency !==
                "custom"
            ) {

                record.customInterval =
                    1;


                record.customUnit =
                    "months";

            }

        }


        delete record.twiceMonthlyDay1;


        delete record.twiceMonthlyDay2;

    }


    /* -----------------------------------------------------
       EXPENSE
       ----------------------------------------------------- */

    if (
        currentMoneyAction ===
        "expense"
    ) {

        record.name =
            String(
                record.name ||
                "Expense"
            ).trim();


        record.merchant =
            String(
                record.merchant ||
                ""
            ).trim();


        record.subcategory =
            String(
                record.subcategory ||
                ""
            ).trim();


        record.notes =
            String(
                record.notes ||
                ""
            ).trim();


        record.amount =
            Math.abs(
                Number(
                    record.amount
                ) || 0
            );


        if (
            !record.recurring
        ) {

            record.frequency =
                "";

        }

    }


    /* -----------------------------------------------------
       SAVINGS GOAL
       ----------------------------------------------------- */

    if (
        currentMoneyAction ===
        "savings-goal"
    ) {

        record.name =
            String(
                record.name ||
                "Savings Goal"
            ).trim();


        record.targetAmount =
            Math.abs(
                Number(
                    record.targetAmount
                ) || 0
            );


        record.currentAmount =
            Math.abs(
                Number(
                    record.currentAmount
                ) || 0
            );


        record.notes =
            String(
                record.notes ||
                ""
            ).trim();

    }


    /* -----------------------------------------------------
       SAVINGS MONEY MOVEMENTS
       ----------------------------------------------------- */

    if (
        [
            "savings-deposit",
            "savings-withdrawal",
            "savings-allocation",
            "savings-release"
        ].includes(
            currentMoneyAction
        )
    ) {

        record.amount =
            Math.abs(
                Number(
                    record.amount
                ) || 0
            );


        record.notes =
            String(
                record.notes ||
                ""
            ).trim();

    }


    return record;

}


/* =========================================================
   30. CREATE UNIQUE ID
   ========================================================= */

function createMoneyId() {

    if (
        window.crypto &&
        typeof window.crypto.randomUUID ===
            "function"
    ) {

        return window.crypto
            .randomUUID();

    }


    return (
        Date.now()
            .toString(36)
        +
        "-"
        +
        Math.random()
            .toString(36)
            .slice(
                2,
                9
            )
    );

}


/* =========================================================
   31. VALIDATE SAVINGS ACTION
   ========================================================= */

function validateSavingsRecord(
    record
) {

    const storage =
        getMoneyStorage();


    if (
        !storage
    ) {

        return;

    }


    if (
        record.type ===
        "savings-withdrawal"
    ) {

        const available =
            typeof storage.getSavingsBalance ===
                "function"

                ? storage.getSavingsBalance()

                : 0;


        if (
            record.amount >
            available
        ) {

            throw new Error(
                `You only have ${formatMoneyCurrency(
                    available
                )} available in General Savings.`
            );

        }

    }


    if (
        record.type ===
        "savings-allocation"
    ) {

        const available =
            typeof storage.getSavingsBalance ===
                "function"

                ? storage.getSavingsBalance()

                : 0;


        if (
            record.amount >
            available
        ) {

            throw new Error(
                `You only have ${formatMoneyCurrency(
                    available
                )} available to allocate.`
            );

        }

    }


    if (
        record.type ===
        "savings-release"
    ) {

        const goal =
            typeof storage.getSavingsGoalById ===
                "function"

                ? storage.getSavingsGoalById(
                    record.goalId
                )

                : null;


        if (!goal) {

            throw new Error(
                "Please select a valid savings fund."
            );

        }


        const available =
            Number(
                goal.currentAmount
            ) || 0;


        if (
            record.amount >
            available
        ) {

            throw new Error(
                `${goal.name} only contains ${formatMoneyCurrency(
                    available
                )}.`
            );

        }

    }

}


/* =========================================================
   32. SAVE MONEY FORM
   ========================================================= */

function saveMoneyForm(
    event
) {

    event.preventDefault();


    updateConditionalMoneyFields();


    if (
        !moneyModalForm
            .reportValidity()
    ) {

        showMoneyStatus(
            "Please complete the required fields.",
            "error"
        );


        return;

    }


    if (
        !currentMoneyAction
    ) {

        showMoneyStatus(
            "Unable to determine what you are saving.",
            "error"
        );


        return;

    }


    const wasEditingIncome =
        Boolean(
            currentEditingIncomeId
        );


    const wasEditingExpense =
        Boolean(
            currentEditingExpenseId
        );


    const wasEditingSavingsGoal =
        Boolean(
            currentEditingSavingsGoalId
        );


    const actionBeforeSave =
        currentMoneyAction;


    const record =
        createMoneyRecord();


    try {

        validateSavingsRecord(
            record
        );


        const savedRecord =
            saveMoneyRecord(
                record
            );


        const detail = {

            action:
                actionBeforeSave,

            record:
                savedRecord ||
                record,

            savedRecord:
                savedRecord ||
                record

        };


        dispatchMoneyChangeEvents(
            detail
        );


        if (
            wasEditingIncome
        ) {

            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:income-updated",
                    {
                        detail
                    }
                )

            );

        }


        if (
            wasEditingExpense
        ) {

            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:expense-updated",
                    {
                        detail
                    }
                )

            );

        }


        if (
            wasEditingSavingsGoal
        ) {

            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:savings-goal-updated",
                    {
                        detail
                    }
                )

            );

        }


        if (
            actionBeforeSave.startsWith(
                "savings"
            )
        ) {

            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:savings-updated",
                    {
                        detail
                    }
                )

            );

        }


        showMoneyStatus(
            getMoneySuccessMessage(
                actionBeforeSave,
                {
                    wasEditingIncome,
                    wasEditingExpense,
                    wasEditingSavingsGoal
                }
            ),
            "success"
        );


        window.setTimeout(
            () => {

                closeMoneyModal();

            },
            450
        );

    }

    catch (error) {

        console.error(
            "Unable to save M-Wallet money entry:",
            error
        );


        showMoneyStatus(
            error?.message ||
            "Unable to save. Please try again.",
            "error"
        );

    }

}


/* =========================================================
   33. SUCCESS MESSAGE
   ========================================================= */

function getMoneySuccessMessage(
    action,
    state = {}
) {

    if (
        state.wasEditingIncome ||
        state.wasEditingExpense
    ) {

        return "✓ Changes Saved";

    }


    if (
        state.wasEditingSavingsGoal
    ) {

        return "✓ Savings Fund Updated";

    }


    switch (
        action
    ) {

        case "savings-deposit":

            return "✓ Added to General Savings";


        case "savings-withdrawal":

            return "✓ Money Returned to Checking";


        case "savings-allocation":

            return "✓ Savings Allocated to Fund";


        case "savings-release":

            return "✓ Money Returned to General Savings";


        case "savings-goal":

            return "✓ Savings Fund Created";


        default:

            return "✓ Saved";

    }

}


/* =========================================================
   34. SAVE MONEY RECORD
   ========================================================= */

function saveMoneyRecord(
    record
) {

    const storage =
        getMoneyStorage();


    if (
        currentMoneyAction ===
            "income" &&
        currentEditingIncomeId
    ) {

        if (
            !storage ||
            typeof storage.updateIncome !==
                "function"
        ) {

            throw new Error(
                "Income editing is not available in storage.js."
            );

        }


        return storage.updateIncome(
            currentEditingIncomeId,
            record
        );

    }


    if (
        currentMoneyAction ===
            "expense" &&
        currentEditingExpenseId
    ) {

        if (
            !storage ||
            typeof storage.updateExpense !==
                "function"
        ) {

            throw new Error(
                "Expense editing is not available in storage.js."
            );

        }


        return storage.updateExpense(
            currentEditingExpenseId,
            record
        );

    }


    if (
        currentMoneyAction ===
            "savings-goal" &&
        currentEditingSavingsGoalId
    ) {

        if (
            !storage ||
            typeof storage.updateSavingsGoal !==
                "function"
        ) {

            throw new Error(
                "Savings goal editing is not available in storage.js."
            );

        }


        return storage.updateSavingsGoal(
            currentEditingSavingsGoalId,
            record
        );

    }


    if (
        storage &&
        typeof storage.saveMoneyEntry ===
            "function"
    ) {

        return storage.saveMoneyEntry(
            record
        );

    }


    return saveMoneyRecordFallback(
        record
    );

}


/* =========================================================
   35. DELETE INCOME
   ========================================================= */

function deleteIncomeRecord(
    incomeId
) {

    const storage =
        getMoneyStorage();


    if (
        !storage ||
        typeof storage.getIncomeById !==
            "function"
    ) {

        console.error(
            "Income deletion is not available."
        );


        return false;

    }


    const income =
        storage.getIncomeById(
            incomeId
        );


    if (!income) {

        return false;

    }


    const confirmed =
        window.confirm(
            `Delete "${income.name || income.source || "this income"}"?`
        );


    if (!confirmed) {

        return false;

    }


    let deleted =
        false;


    if (
        income.legacyPaycheckId &&
        typeof storage.deletePaycheck ===
            "function"
    ) {

        const monthKey =
            income.date
                ? income.date.slice(
                    0,
                    7
                )
                : storage
                    .getSelectedMonthKey();


        deleted =
            Boolean(
                storage.deletePaycheck(
                    income.legacyPaycheckId,
                    monthKey
                )
            );

    }

    else if (
        typeof storage.deleteIncome ===
            "function"
    ) {

        deleted =
            Boolean(
                storage.deleteIncome(
                    incomeId
                )
            );

    }


    if (!deleted) {

        return false;

    }


    const detail = {

        type:
            "income",

        action:
            "delete",

        id:
            incomeId,

        record:
            income

    };


    dispatchMoneyChangeEvents(
        detail
    );


    document.dispatchEvent(

        new CustomEvent(
            "mwallet:income-deleted",
            {
                detail
            }
        )

    );


    return true;

}


/* =========================================================
   36. DELETE EXPENSE
   ========================================================= */

function deleteExpenseRecord(
    expenseId
) {

    const storage =
        getMoneyStorage();


    if (
        !storage ||
        typeof storage.getExpenseById !==
            "function"
    ) {

        console.error(
            "Expense deletion is not available."
        );


        return false;

    }


    const expense =
        storage.getExpenseById(
            expenseId
        );


    if (!expense) {

        return false;

    }


    let message =
        `Delete "${expense.name || "this expense"}"?`;


    if (
        expense.recurring
    ) {

        message =
            `Delete recurring expense "${expense.name || "this expense"}" and all of its generated occurrences?`;

    }


    const confirmed =
        window.confirm(
            message
        );


    if (!confirmed) {

        return false;

    }


    const deleted =
        Boolean(
            storage.deleteExpense(
                expenseId
            )
        );


    if (!deleted) {

        return false;

    }


    const detail = {

        type:
            "expense",

        action:
            "delete",

        id:
            expenseId,

        record:
            expense

    };


    dispatchMoneyChangeEvents(
        detail
    );


    document.dispatchEvent(

        new CustomEvent(
            "mwallet:expense-deleted",
            {
                detail
            }
        )

    );


    return true;

}


/* =========================================================
   37. DELETE SAVINGS GOAL
   ========================================================= */

function deleteSavingsGoalRecord(
    goalId
) {

    const storage =
        getMoneyStorage();


    if (
        !storage ||
        typeof storage.getSavingsGoalById !==
            "function" ||
        typeof storage.deleteSavingsGoal !==
            "function"
    ) {

        console.error(
            "Savings goal deletion is not available."
        );


        return false;

    }


    const goal =
        storage.getSavingsGoalById(
            goalId
        );


    if (!goal) {

        return false;

    }


    const currentAmount =
        Number(
            goal.currentAmount
        ) || 0;


    let message =
        `Delete "${goal.name}"?`;


    if (
        currentAmount >
        0
    ) {

        message =
            (
                `Delete "${goal.name}"? ` +
                `${formatMoneyCurrency(
                    currentAmount
                )} will be returned to General Savings.`
            );

    }


    const confirmed =
        window.confirm(
            message
        );


    if (!confirmed) {

        return false;

    }


    const deleted =
        Boolean(
            storage.deleteSavingsGoal(
                goalId
            )
        );


    if (!deleted) {

        return false;

    }


    const detail = {

        type:
            "savings-goal",

        action:
            "delete",

        id:
            goalId,

        record:
            goal

    };


    dispatchMoneyChangeEvents(
        detail
    );


    document.dispatchEvent(

        new CustomEvent(
            "mwallet:savings-updated",
            {
                detail
            }
        )

    );


    document.dispatchEvent(

        new CustomEvent(
            "mwallet:savings-goal-deleted",
            {
                detail
            }
        )

    );


    return true;

}


/* =========================================================
   38. SHARED MONEY EVENTS
   ========================================================= */

function dispatchMoneyChangeEvents(
    detail
) {

    document.dispatchEvent(

        new CustomEvent(
            "budget:money-saved",
            {
                detail
            }
        )

    );


    document.dispatchEvent(

        new CustomEvent(
            "mwallet:money-saved",
            {
                detail
            }
        )

    );

}


/* =========================================================
   39. FALLBACK STORAGE
   ========================================================= */

const MONEY_FALLBACK_STORAGE_KEY =
    "mWalletMoneyEntries";


function saveMoneyRecordFallback(
    record
) {

    let records =
        [];


    try {

        const saved =
            localStorage.getItem(
                MONEY_FALLBACK_STORAGE_KEY
            );


        if (
            saved
        ) {

            records =
                JSON.parse(
                    saved
                );

        }

    }

    catch (error) {

        records =
            [];

    }


    if (
        !Array.isArray(
            records
        )
    ) {

        records =
            [];

    }


    if (
        record.type ===
        "starting-balance"
    ) {

        records =
            records.filter(
                existingRecord => {

                    return !(

                        existingRecord.type ===
                            "starting-balance"

                        &&

                        existingRecord.monthKey ===
                            record.monthKey

                    );

                }
            );

    }


    records.push(
        record
    );


    localStorage.setItem(

        MONEY_FALLBACK_STORAGE_KEY,

        JSON.stringify(
            records
        )

    );


    return record;

}


/* =========================================================
   40. STATUS MESSAGE
   ========================================================= */

function showMoneyStatus(
    message,
    type = "success"
) {

    if (
        !moneyModalStatus
    ) {

        return;

    }


    moneyModalStatus.textContent =
        message;


    moneyModalStatus.classList.remove(
        "success",
        "error"
    );


    moneyModalStatus.classList.add(
        type
    );

}


/* =========================================================
   41. CLEAR STATUS
   ========================================================= */

function clearMoneyStatus() {

    if (
        !moneyModalStatus
    ) {

        return;

    }


    moneyModalStatus.textContent =
        "";


    moneyModalStatus.classList.remove(
        "success",
        "error"
    );

}


/* =========================================================
   42. ESCAPE HTML
   ========================================================= */

function escapeMoneyHTML(
    value
) {

    return String(
        value ??
        ""
    )

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


/* =========================================================
   43. INCOME EDIT / DELETE BUTTONS
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        const editButton =
            event.target.closest(
                "[data-income-edit]"
            );


        if (
            editButton
        ) {

            event.preventDefault();


            const incomeId =
                editButton.dataset
                    .incomeEdit;


            if (
                incomeId
            ) {

                openIncomeEditor(
                    incomeId
                );

            }


            return;

        }


        const deleteButton =
            event.target.closest(
                "[data-income-delete]"
            );


        if (
            !deleteButton
        ) {

            return;

        }


        event.preventDefault();


        const incomeId =
            deleteButton.dataset
                .incomeDelete;


        if (
            incomeId
        ) {

            deleteIncomeRecord(
                incomeId
            );

        }

    }
);


/* =========================================================
   44. EXPENSE EDIT / DELETE BUTTONS
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        const editButton =
            event.target.closest(
                "[data-expense-edit]"
            );


        if (
            editButton
        ) {

            event.preventDefault();


            const expenseId =
                editButton.dataset
                    .expenseEdit;


            if (
                expenseId
            ) {

                openExpenseEditor(
                    expenseId
                );

            }


            return;

        }


        const deleteButton =
            event.target.closest(
                "[data-expense-delete]"
            );


        if (
            !deleteButton
        ) {

            return;

        }


        event.preventDefault();


        const expenseId =
            deleteButton.dataset
                .expenseDelete;


        if (
            expenseId
        ) {

            deleteExpenseRecord(
                expenseId
            );

        }

    }
);


/* =========================================================
   45. SAVINGS GOAL ACTION BUTTONS
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        const editButton =
            event.target.closest(
                "[data-savings-goal-edit]"
            );


        if (
            editButton
        ) {

            event.preventDefault();


            openSavingsGoalEditor(
                editButton.dataset
                    .savingsGoalEdit
            );


            return;

        }


        const allocateButton =
            event.target.closest(
                "[data-savings-allocate]"
            );


        if (
            allocateButton
        ) {

            event.preventDefault();


            openSavingsAllocation(
                allocateButton.dataset
                    .savingsAllocate
            );


            return;

        }


        const releaseButton =
            event.target.closest(
                "[data-savings-release]"
            );


        if (
            releaseButton
        ) {

            event.preventDefault();


            openSavingsRelease(
                releaseButton.dataset
                    .savingsRelease
            );


            return;

        }


        const deleteButton =
            event.target.closest(
                "[data-savings-goal-delete]"
            );


        if (
            deleteButton
        ) {

            event.preventDefault();


            deleteSavingsGoalRecord(
                deleteButton.dataset
                    .savingsGoalDelete
            );

        }

    }
);


/* =========================================================
   46. MONEY ACTION BUTTONS
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        const actionButton =
            event.target.closest(
                "[data-money-action]"
            );


        if (
            !actionButton
        ) {

            return;

        }


        const requestedAction =
            actionButton.dataset
                .moneyAction;


        const action =
            normalizeMoneyAction(
                requestedAction
            );


        if (
            !MONEY_FORMS[
                action
            ]
        ) {

            console.warn(
                `No money form exists for: ${requestedAction}`
            );


            return;

        }


        openMoneyModal(
            action
        );

    }
);


/* =========================================================
   47. CONDITIONAL / SAVINGS FIELD CHANGES
   ========================================================= */

if (
    moneyModalBody
) {

    moneyModalBody.addEventListener(
        "change",
        event => {

            const field =
                event.target.closest(
                    "input, select, textarea"
                );


            if (!field) {

                return;

            }


            updateConditionalMoneyFields();


            updateSavingsFormInformation();


            clearMoneyStatus();

        }
    );

}


/* =========================================================
   48. CLOSE BUTTON / OVERLAY
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        const closeButton =
            event.target.closest(
                "[data-money-modal-close]"
            );


        if (
            !closeButton
        ) {

            return;

        }


        closeMoneyModal();

    }
);


/* =========================================================
   49. ESCAPE KEY
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key !==
            "Escape"
        ) {

            return;

        }


        if (
            !moneyModal ||
            !moneyModal
                .classList
                .contains(
                    "active"
                )
        ) {

            return;

        }


        closeMoneyModal();

    }
);


/* =========================================================
   50. UNDO
   ========================================================= */

if (
    moneyModalUndo
) {

    moneyModalUndo.addEventListener(
        "click",
        undoMoneyForm
    );

}


/* =========================================================
   51. FORM SUBMIT
   ========================================================= */

if (
    moneyModalForm
) {

    moneyModalForm.addEventListener(
        "submit",
        saveMoneyForm
    );

}


/* =========================================================
   52. CLEAR STATUS WHILE TYPING
   ========================================================= */

if (
    moneyModalBody
) {

    moneyModalBody.addEventListener(
        "input",
        () => {

            clearMoneyStatus();

        }
    );

}


/* =========================================================
   53. EXPOSE MONEY MANAGER
   ========================================================= */

window.MoneyManager = {

    open:
        openMoneyModal,


    editIncome:
        openIncomeEditor,


    deleteIncome:
        deleteIncomeRecord,


    editExpense:
        openExpenseEditor,


    deleteExpense:
        deleteExpenseRecord,


    editSavingsGoal:
        openSavingsGoalEditor,


    deleteSavingsGoal:
        deleteSavingsGoalRecord,


    allocateSavings:
        openSavingsAllocation,


    releaseSavings:
        openSavingsRelease,


    close:
        closeMoneyModal,


    undo:
        undoMoneyForm,


    getFormData:
        getMoneyFormData,


    getSelectedPeriod:
        getSelectedBudgetPeriod,


    refreshConditionalFields:
        updateConditionalMoneyFields,


    normalizeAction:
        normalizeMoneyAction,


    isEditingIncome() {

        return Boolean(
            currentEditingIncomeId
        );

    },


    isEditingExpense() {

        return Boolean(
            currentEditingExpenseId
        );

    },


    isEditingSavingsGoal() {

        return Boolean(
            currentEditingSavingsGoalId
        );

    }

};


/* =========================================================
   54. DEVELOPMENT HELPER
   ========================================================= */

console.log(
    "M-Wallet money manager loaded - Savings Transfer + Allocation System ready."
);


/* =========================================================
   END MONEY.JS
   ========================================================= */