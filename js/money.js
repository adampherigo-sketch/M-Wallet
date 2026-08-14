/* =========================================================
   BUDGET TRACKER
   Money Management + Universal Popup
   money.js
   ========================================================= */


/* =========================================================
   1. MONEY FORM DEFINITIONS
   ========================================================= */

/*
    Each Money Management action points to one of these
    form configurations.

    money.js uses these definitions to build the popup
    dynamically instead of keeping seven separate modals.
*/

const MONEY_FORMS = {

    /* -----------------------------------------------------
       PAYCHECK
       ----------------------------------------------------- */
    paycheck: {
        title: "Add Paycheck",

        fields: [
            {
                type: "text",
                name: "name",
                label: "Paycheck Name",
                placeholder: "Example: Amazon Paycheck",
                required: true
            },

            {
                type: "date",
                name: "payDate",
                label: "Pay Date",
                required: true,
                useSelectedMonth: true
            },

            {
                type: "number",
                name: "hours",
                label: "Hours Worked",
                placeholder: "0",
                min: "0",
                step: "0.1",
                required: true
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
            }
        ]
    },


    /* -----------------------------------------------------
       BILL
       ----------------------------------------------------- */
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


    /* -----------------------------------------------------
       EXPENSE
       ----------------------------------------------------- */
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
                required: true,

                options: [
                    "Groceries",
                    "Dining",
                    "Transportation",
                    "Shopping",
                    "Entertainment",
                    "Health",
                    "Personal Care",
                    "Household",
                    "Pets",
                    "Travel",
                    "Other"
                ]
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
            }
        ]
    },


    /* -----------------------------------------------------
       TRANSACTION
       ----------------------------------------------------- */
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

                help: "Use a negative number for money going out. Example: -25.50"
            }
        ]
    },


    /* -----------------------------------------------------
       SAVINGS GOAL
       ----------------------------------------------------- */
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


    /* -----------------------------------------------------
       ADD MONEY TO SAVINGS
       ----------------------------------------------------- */
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


    /* -----------------------------------------------------
       STARTING BALANCE
       ----------------------------------------------------- */
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

                help: "This is the checking balance you are starting the selected month with."
            }
        ]
    }

};


/* =========================================================
   2. MODAL STATE
   ========================================================= */

let currentMoneyAction = null;

/*
    Stores what was inside the form when the popup opened.

    Undo uses this to restore everything.
*/
let originalFormState = null;


/*
    Remember which button opened the popup so keyboard
    focus can return to it after closing.
*/
let lastFocusedElement = null;


/* =========================================================
   3. DOM REFERENCES
   ========================================================= */

const moneyModal =
    document.getElementById("money-modal");

const moneyModalTitle =
    document.getElementById("money-modal-title");

const moneyModalBody =
    document.getElementById("money-modal-body");

const moneyModalForm =
    document.getElementById("money-modal-form");

const moneyModalUndo =
    document.getElementById("money-modal-undo");

const moneyModalStatus =
    document.getElementById("money-modal-status");


/* =========================================================
   4. GET SELECTED BUDGET MONTH
   ========================================================= */

function getSelectedBudgetPeriod() {

    const monthSelect =
        document.getElementById("month-select");

    const yearSelect =
        document.getElementById("year-select");


    const now = new Date();


    const month =
        monthSelect?.value ||
        String(now.getMonth() + 1).padStart(2, "0");


    const year =
        yearSelect?.value ||
        String(now.getFullYear());


    return {
        month,
        year,
        key: `${year}-${month}`
    };

}


/* =========================================================
   5. DEFAULT DATE
   ========================================================= */

/*
    Gives date fields a sensible date inside whatever
    month/year the user currently has selected.
*/

function getDefaultDateForSelectedMonth() {

    const { month, year } =
        getSelectedBudgetPeriod();


    const now =
        new Date();


    let day = 1;


    /*
        If the user is looking at the current month,
        default to today's day.
    */

    const currentMonth =
        String(now.getMonth() + 1).padStart(2, "0");

    const currentYear =
        String(now.getFullYear());


    if (
        month === currentMonth &&
        year === currentYear
    ) {
        day = now.getDate();
    }


    /*
        Protect against impossible dates.

        Example:
        selected month = February
        today = August 31
    */

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
   6. BUILD FORM FIELD
   ========================================================= */

function createMoneyField(field) {

    /* -----------------------------------------------------
       CHECKBOX
       ----------------------------------------------------- */

    if (field.type === "checkbox") {

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "form-group checkbox";


        const input =
            document.createElement("input");

        input.type =
            "checkbox";

        input.id =
            `money-${field.name}`;

        input.name =
            field.name;


        const label =
            document.createElement("label");

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


    /* -----------------------------------------------------
       NORMAL FIELD WRAPPER
       ----------------------------------------------------- */

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "form-group";


    const label =
        document.createElement("label");

    label.htmlFor =
        `money-${field.name}`;

    label.textContent =
        field.label;


    wrapper.appendChild(label);


    /* -----------------------------------------------------
       DROPDOWN
       ----------------------------------------------------- */

    if (field.type === "select") {

        const select =
            document.createElement("select");

        select.id =
            `money-${field.name}`;

        select.name =
            field.name;


        if (field.required) {
            select.required = true;
        }


        /*
            Empty option
        */

        const placeholderOption =
            document.createElement("option");

        placeholderOption.value = "";
        placeholderOption.textContent =
            "Select a category";

        placeholderOption.disabled = true;
        placeholderOption.selected = true;


        select.appendChild(
            placeholderOption
        );


        /*
            Category options
        */

        field.options.forEach(optionText => {

            const option =
                document.createElement("option");

            option.value =
                optionText;

            option.textContent =
                optionText;


            select.appendChild(
                option
            );

        });


        wrapper.appendChild(
            select
        );
    }


    /* -----------------------------------------------------
       INPUT
       ----------------------------------------------------- */

    else {

        /*
            Money inputs receive a dollar-sign wrapper.
        */

        if (field.money) {

            const moneyWrapper =
                document.createElement("div");

            moneyWrapper.className =
                "money-input-wrapper";


            const symbol =
                document.createElement("span");

            symbol.className =
                "money-input-symbol";

            symbol.textContent =
                "$";


            const input =
                buildInput(field);


            moneyWrapper.append(
                symbol,
                input
            );


            wrapper.appendChild(
                moneyWrapper
            );

        }

        else {

            wrapper.appendChild(
                buildInput(field)
            );

        }

    }


    /* -----------------------------------------------------
       HELP TEXT
       ----------------------------------------------------- */

    if (field.help) {

        const help =
            document.createElement("small");

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
   7. BUILD INPUT
   ========================================================= */

function buildInput(field) {

    const input =
        document.createElement("input");


    input.type =
        field.type;

    input.id =
        `money-${field.name}`;

    input.name =
        field.name;


    if (field.placeholder) {

        input.placeholder =
            field.placeholder;

    }


    if (field.required) {

        input.required =
            true;

    }


    if (field.min !== undefined) {

        input.min =
            field.min;

    }


    if (field.max !== undefined) {

        input.max =
            field.max;

    }


    if (field.step !== undefined) {

        input.step =
            field.step;

    }


    if (field.value !== undefined) {

        input.value =
            field.value;

    }


    /*
        Automatically fill date fields using the
        selected month.
    */

    if (
        field.type === "date" &&
        field.useSelectedMonth
    ) {

        input.value =
            getDefaultDateForSelectedMonth();

    }


    return input;

}


/* =========================================================
   8. BUILD FULL FORM
   ========================================================= */

function renderMoneyForm(action) {

    const config =
        MONEY_FORMS[action];


    if (!config) {

        console.error(
            `Unknown money action: ${action}`
        );

        return false;
    }


    /*
        Clear the previous form.
    */

    moneyModalBody.innerHTML = "";


    /*
        Change popup title.
    */

    moneyModalTitle.textContent =
        config.title;


    /*
        Build each field.
    */

    config.fields.forEach(field => {

        const element =
            createMoneyField(field);


        moneyModalBody.appendChild(
            element
        );

    });


    return true;

}


/* =========================================================
   9. OPEN MONEY POPUP
   ========================================================= */

function openMoneyModal(action) {

    const config =
        MONEY_FORMS[action];


    if (!config) {

        console.error(
            `Cannot open unknown money form: ${action}`
        );

        return;
    }


    currentMoneyAction =
        action;


    lastFocusedElement =
        document.activeElement;


    /*
        Build the requested form.
    */

    const rendered =
        renderMoneyForm(action);


    if (!rendered) {
        return;
    }


    /*
        Clear previous status.
    */

    clearMoneyStatus();


    /*
        Show popup.
    */

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


    /*
        Save original state AFTER defaults have been created.
    */

    originalFormState =
        captureMoneyFormState();


    /*
        Focus first input.
    */

    requestAnimationFrame(() => {

        const firstInput =
            moneyModalBody.querySelector(
                "input, select, textarea"
            );


        if (firstInput) {
            firstInput.focus();
        }

    });

}


/* =========================================================
   10. CLOSE MONEY POPUP
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

    originalFormState =
        null;


    /*
        Return keyboard focus to the button that opened it.
    */

    if (
        lastFocusedElement &&
        typeof lastFocusedElement.focus === "function"
    ) {

        lastFocusedElement.focus();

    }


    lastFocusedElement =
        null;

}


/* =========================================================
   11. CAPTURE FORM STATE
   ========================================================= */

/*
    This creates a snapshot of every form field.

    Undo restores this exact snapshot.
*/

function captureMoneyFormState() {

    const fields =
        moneyModalBody.querySelectorAll(
            "input, select, textarea"
        );


    const state = [];


    fields.forEach(field => {

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

    });


    return state;

}


/* =========================================================
   12. UNDO FORM CHANGES
   ========================================================= */

function undoMoneyForm() {

    if (!originalFormState) {
        return;
    }


    originalFormState.forEach(savedField => {

        const field =
            moneyModalBody.querySelector(
                `[name="${savedField.name}"]`
            );


        if (!field) {
            return;
        }


        if (
            savedField.type === "checkbox"
        ) {

            field.checked =
                savedField.checked;

        }

        else {

            field.value =
                savedField.value;

        }

    });


    showMoneyStatus(
        "Changes undone.",
        "success"
    );

}


/* =========================================================
   13. READ FORM DATA
   ========================================================= */

function getMoneyFormData() {

    const formData =
        new FormData(
            moneyModalForm
        );


    const data = {};


    /*
        Standard inputs.
    */

    formData.forEach(
        (value, key) => {

            data[key] =
                value;

        }
    );


    /*
        Checkboxes don't appear in FormData when unchecked,
        so handle them manually.
    */

    moneyModalBody
        .querySelectorAll(
            'input[type="checkbox"]'
        )
        .forEach(checkbox => {

            data[checkbox.name] =
                checkbox.checked;

        });


    /*
        Convert number fields into actual numbers.
    */

    moneyModalBody
        .querySelectorAll(
            'input[type="number"]'
        )
        .forEach(input => {

            if (
                input.value !== ""
            ) {

                data[input.name] =
                    Number(input.value);

            }

        });


    return data;

}


/* =========================================================
   14. CREATE MONEY RECORD
   ========================================================= */

function createMoneyRecord() {

    const period =
        getSelectedBudgetPeriod();


    const formData =
        getMoneyFormData();


    return {

        id:
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
            new Date().toISOString(),

        ...formData

    };

}


/* =========================================================
   15. CREATE UNIQUE ID
   ========================================================= */

function createMoneyId() {

    /*
        Modern browser method.
    */

    if (
        window.crypto &&
        typeof window.crypto.randomUUID === "function"
    ) {

        return crypto.randomUUID();

    }


    /*
        Fallback.
    */

    return (
        Date.now().toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .slice(2, 9)
    );

}


/* =========================================================
   16. SAVE MONEY FORM
   ========================================================= */

function saveMoneyForm(event) {

    event.preventDefault();


    /*
        Make sure browser validation passes.
    */

    if (
        !moneyModalForm.reportValidity()
    ) {

        showMoneyStatus(
            "Please complete the required fields.",
            "error"
        );

        return;
    }


    if (!currentMoneyAction) {

        showMoneyStatus(
            "Unable to determine what you are saving.",
            "error"
        );

        return;
    }


    const record =
        createMoneyRecord();


    /*
        Save the record.

        Once storage.js is upgraded, that file can expose
        BudgetStorage.saveMoneyEntry() and money.js will
        automatically use it.

        Until then we have a safe localStorage fallback.
    */

    try {

        saveMoneyRecord(
            record
        );


        /*
            Let the rest of the app know money changed.

            app.js can listen to this later and refresh
            the Dashboard immediately.
        */

        document.dispatchEvent(

            new CustomEvent(
                "budget:money-saved",
                {
                    detail: record
                }
            )

        );


        showMoneyStatus(
            "✓ Saved",
            "success"
        );


        /*
            Close shortly after showing confirmation.
        */

        window.setTimeout(() => {

            closeMoneyModal();

        }, 450);

    }

    catch (error) {

        console.error(
            "Unable to save money entry:",
            error
        );


        showMoneyStatus(
            "Unable to save. Please try again.",
            "error"
        );

    }

}


/* =========================================================
   17. SAVE RECORD
   ========================================================= */

function saveMoneyRecord(record) {

    /*
        FUTURE STORAGE.JS CONNECTION

        If storage.js exposes this function,
        use it instead of our fallback.
    */

    if (
        window.BudgetStorage &&
        typeof window.BudgetStorage.saveMoneyEntry === "function"
    ) {

        window.BudgetStorage.saveMoneyEntry(
            record
        );

        return;
    }


    /*
        Temporary fallback.

        This means the Save button ALREADY works before
        we update storage.js.

        storage.js will become the official owner of this
        data in the next step.
    */

    saveMoneyRecordFallback(
        record
    );

}


/* =========================================================
   18. LOCAL STORAGE FALLBACK
   ========================================================= */

const MONEY_FALLBACK_STORAGE_KEY =
    "budgetTrackerMoneyEntries";


function saveMoneyRecordFallback(record) {

    let records = [];


    try {

        const saved =
            localStorage.getItem(
                MONEY_FALLBACK_STORAGE_KEY
            );


        if (saved) {

            records =
                JSON.parse(saved);

        }

    }

    catch (error) {

        console.warn(
            "Could not read existing money records.",
            error
        );

        records = [];

    }


    if (!Array.isArray(records)) {
        records = [];
    }


    /*
        Starting balance behaves differently.

        There should only be one starting balance
        for each month.
    */

    if (
        record.type === "starting-balance"
    ) {

        records =
            records.filter(existingRecord => {

                return !(
                    existingRecord.type ===
                        "starting-balance" &&

                    existingRecord.monthKey ===
                        record.monthKey
                );

            });

    }


    records.push(
        record
    );


    localStorage.setItem(
        MONEY_FALLBACK_STORAGE_KEY,
        JSON.stringify(records)
    );

}


/* =========================================================
   19. STATUS MESSAGE
   ========================================================= */

function showMoneyStatus(
    message,
    type = "success"
) {

    if (!moneyModalStatus) {
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
   20. CLEAR STATUS
   ========================================================= */

function clearMoneyStatus() {

    if (!moneyModalStatus) {
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
   21. MONEY ACTION BUTTONS
   ========================================================= */

/*
    Event delegation means EVERY button containing:

        data-money-action="paycheck"

    automatically works.

    This includes:
    - Money Management cards
    - Budget +Add buttons
    - Transaction button
    - Savings buttons
    - Settings Starting Balance
*/

document.addEventListener(
    "click",
    event => {

        const actionButton =
            event.target.closest(
                "[data-money-action]"
            );


        if (!actionButton) {
            return;
        }


        const action =
            actionButton.dataset.moneyAction;


        if (!MONEY_FORMS[action]) {

            console.warn(
                `No money form exists for: ${action}`
            );

            return;
        }


        openMoneyModal(
            action
        );

    }
);


/* =========================================================
   22. RED X + OVERLAY CLOSE
   ========================================================= */

/*
    Both the red X and the dark overlay contain:

        data-money-modal-close
*/

document.addEventListener(
    "click",
    event => {

        const closeButton =
            event.target.closest(
                "[data-money-modal-close]"
            );


        if (!closeButton) {
            return;
        }


        closeMoneyModal();

    }
);


/* =========================================================
   23. ESCAPE KEY CLOSE
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key !== "Escape"
        ) {
            return;
        }


        if (
            !moneyModal.classList.contains(
                "active"
            )
        ) {
            return;
        }


        closeMoneyModal();

    }
);


/* =========================================================
   24. UNDO BUTTON
   ========================================================= */

if (moneyModalUndo) {

    moneyModalUndo.addEventListener(
        "click",
        undoMoneyForm
    );

}


/* =========================================================
   25. SAVE BUTTON / FORM SUBMIT
   ========================================================= */

if (moneyModalForm) {

    moneyModalForm.addEventListener(
        "submit",
        saveMoneyForm
    );

}


/* =========================================================
   26. CLEAR STATUS WHEN USER TYPES
   ========================================================= */

if (moneyModalBody) {

    moneyModalBody.addEventListener(
        "input",
        () => {

            clearMoneyStatus();

        }
    );

}


/* =========================================================
   27. EXPOSE FUNCTIONS
   ========================================================= */

/*
    These are useful later when we add:
    - editing transactions
    - editing bills
    - editing paychecks
    - app.js refreshes
*/

window.MoneyManager = {

    open:
        openMoneyModal,

    close:
        closeMoneyModal,

    undo:
        undoMoneyForm,

    getFormData:
        getMoneyFormData,

    getSelectedPeriod:
        getSelectedBudgetPeriod

};


/* =========================================================
   END MONEY.JS
   ========================================================= */