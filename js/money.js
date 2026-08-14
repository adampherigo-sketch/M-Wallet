/* =========================================================
   M-WALLET
   Money Management + Universal Popup
   money.js
   Phase 2.2 - Expense Edit + Delete
   ========================================================= */


/* =========================================================
   1. MONEY FORM DEFINITIONS
   ========================================================= */

const MONEY_FORMS = {

    income: {

        title: "Add Income",

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

        title: "Add Bill",

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


    /* =====================================================
       P2.2 EXPENSE MANAGEMENT
       ===================================================== */

    expense: {

        title: "Add Expense",

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

        title: "Add Transaction",

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


    "savings-goal": {

        title: "Add Savings Goal",

        fields: [

            {
                type: "text",
                name: "name",
                label: "Goal Name",
                placeholder: "Example: Emergency Fund",
                required: true
            },

            {
                type: "number",
                name: "targetAmount",
                label: "Target Amount",
                placeholder: "0.00",
                min: "0",
                step: "0.01",
                money: true,
                required: true
            },

            {
                type: "number",
                name: "currentAmount",
                label: "Current Amount",
                placeholder: "0.00",
                min: "0",
                step: "0.01",
                money: true,
                value: "0",
                required: true
            }

        ]

    },


    "savings-deposit": {

        title: "Add Money to Savings",

        fields: [

            {
                type: "number",
                name: "amount",
                label: "Amount to Add",
                placeholder: "0.00",
                min: "0.01",
                step: "0.01",
                money: true,
                required: true
            }

        ]

    },


    "starting-balance": {

        title: "Change Starting Balance",

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
   2. MODAL STATE
   ========================================================= */

let currentMoneyAction =
    null;

let currentEditingIncomeId =
    null;

let currentEditingExpenseId =
    null;

let originalFormState =
    null;

let lastFocusedElement =
    null;


/* =========================================================
   3. DOM REFERENCES
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
   4. STORAGE
   ========================================================= */

function getMoneyStorage() {

    return (
        window.MWalletStorage ||
        window.BudgetStorage ||
        null
    );

}


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
        `${String(day).padStart(2, "0")}`
    );

}


/* =========================================================
   8. CREATE FIELD WRAPPER
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
   9. CREATE MONEY FIELD
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
            field.help;


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
        field.min !== undefined
    ) {

        input.min =
            field.min;

    }


    if (
        field.max !== undefined
    ) {

        input.max =
            field.max;

    }


    if (
        field.step !== undefined
    ) {

        input.step =
            field.step;

    }


    if (
        field.value !== undefined
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


    field.options.forEach(
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
                field.value !== undefined &&
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
        field.value !== undefined
    ) {

        textarea.value =
            field.value;

    }


    return textarea;

}


/* =========================================================
   13. GET FIELD VALUE
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
   14. CONDITIONAL FIELDS
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
   15. RENDER MONEY FORM
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
   16. POPULATE FORM
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
                        value ?? "";

                }

            }
        );


    updateConditionalMoneyFields();

}


/* =========================================================
   17. OPEN MONEY MODAL
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
        options.record &&
        (
            currentEditingIncomeId ||
            currentEditingExpenseId
        )
    ) {

        populateMoneyForm(
            options.record
        );


        if (
            currentEditingIncomeId
        ) {

            moneyModalTitle.textContent =
                "Edit Income";

        }


        if (
            currentEditingExpenseId
        ) {

            moneyModalTitle.textContent =
                "Edit Expense";

        }


        if (
            moneyModalSave
        ) {

            moneyModalSave.textContent =
                "💾 Save Changes";

        }

    }

    else {

        moneyModalTitle.textContent =
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
   18. OPEN INCOME EDITOR
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
   19. OPEN EXPENSE EDITOR
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
   20. CLOSE MONEY MODAL
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
   21. CAPTURE FORM STATE
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
   22. UNDO FORM CHANGES
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


    showMoneyStatus(
        "Changes undone.",
        "success"
    );

}


/* =========================================================
   23. GET FORM DATA
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

            data[key] =
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
   24. CREATE MONEY RECORD
   ========================================================= */

function createMoneyRecord() {

    const period =
        getSelectedBudgetPeriod();


    const formData =
        getMoneyFormData();


    const editingId =
        currentEditingIncomeId ||
        currentEditingExpenseId;


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
       INCOME CLEANUP
       ----------------------------------------------------- */

    if (
        currentMoneyAction ===
        "income"
    ) {

        record.incomeType =
            "income";


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
       EXPENSE CLEANUP
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


    return record;

}


/* =========================================================
   25. CREATE UNIQUE ID
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
   26. SAVE MONEY FORM
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


    const record =
        createMoneyRecord();


    try {

        const savedRecord =
            saveMoneyRecord(
                record
            );


        const detail =
            savedRecord ||
            record;


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


        showMoneyStatus(

            (
                wasEditingIncome ||
                wasEditingExpense
            )

                ? "✓ Changes Saved"

                : "✓ Saved",

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
            "Unable to save. Please try again.",
            "error"
        );

    }

}


/* =========================================================
   27. SAVE MONEY RECORD
   ========================================================= */

function saveMoneyRecord(
    record
) {

    const storage =
        getMoneyStorage();


    /* -----------------------------------------------------
       EDIT EXISTING INCOME
       ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       EDIT EXISTING EXPENSE
       ----------------------------------------------------- */

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


    /* -----------------------------------------------------
       CREATE NEW RECORD
       ----------------------------------------------------- */

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
   28. DELETE INCOME
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

        console.warn(
            `Income record not found: ${incomeId}`
        );

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
   29. DELETE EXPENSE
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

        console.warn(
            `Expense record not found: ${expenseId}`
        );

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


    if (
        typeof storage.deleteExpense !==
            "function"
    ) {

        console.error(
            "Expense deletion is not available in storage.js."
        );

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
   30. DISPATCH SHARED MONEY EVENTS
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
   31. LOCAL STORAGE FALLBACK
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

        console.warn(
            "Could not read existing M-Wallet money records.",
            error
        );


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
   32. STATUS MESSAGE
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
   33. CLEAR STATUS
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
   34. INCOME EDIT / DELETE BUTTONS
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
   35. EXPENSE EDIT / DELETE BUTTONS
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
   36. MONEY ACTION BUTTONS
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
   37. CONDITIONAL FIELD CHANGES
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


            clearMoneyStatus();

        }
    );

}


/* =========================================================
   38. CLOSE BUTTON / OVERLAY
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
   39. ESCAPE KEY
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
   40. UNDO BUTTON
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
   41. SAVE / FORM SUBMIT
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
   42. CLEAR STATUS WHILE TYPING
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
   43. EXPOSE MONEY MANAGER
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

    }

};


/* =========================================================
   44. DEVELOPMENT HELPER
   ========================================================= */

console.log(
    "M-Wallet money manager loaded - P2.2 Expense Edit/Delete ready."
);


/* =========================================================
   END MONEY.JS
   ========================================================= */