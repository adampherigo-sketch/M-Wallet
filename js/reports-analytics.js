"use strict";

/* =========================================================
   M-WALLET  ·  ZEVARYN GRID
   ZG7 — Reports analytics (pure display helpers)

   These helpers ONLY reshape data that js/app.js already
   derived from the real M-Wallet storage (collectReportData).
   They introduce no new accounting: no stored totals, no
   second source of truth. Every number in here is a
   re-presentation of income / bills / expenses / savings
   sums that renderReports() computed with the existing
   semantics.

   Exposed as window.ReportAnalytics and unit-tested in
   tests/report-analytics.test.js.
   ========================================================= */

(function (global) {

    var MONTH_ABBR = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];


    function toFiniteNumber(value) {

        var n = Number(value);

        return Number.isFinite(n)
            ? n
            : 0;
    }


    function monthKeyParts(monthKey) {

        var parts =
            String(monthKey || "").split("-");

        return {
            year: Number(parts[0]),
            month: Number(parts[1])
        };
    }


    function daysInMonth(year, month) {

        if (
            !Number.isFinite(year) ||
            !Number.isFinite(month) ||
            month < 1 ||
            month > 12
        ) {
            return 31;
        }

        // Day 0 of the next month === last day of this month.
        return new Date(year, month, 0).getDate();
    }


    /* -----------------------------------------------------
       sumValues({ key: amount }) -> number
       ----------------------------------------------------- */

    function sumValues(breakdown) {

        if (
            !breakdown ||
            typeof breakdown !== "object"
        ) {
            return 0;
        }

        return Object.keys(breakdown).reduce(
            function (total, key) {
                return total + toFiniteNumber(breakdown[key]);
            },
            0
        );
    }


    /* -----------------------------------------------------
       topEntries({ name: amount }, limit)
         -> [{ name, amount }] sorted desc, amount > 0
       ----------------------------------------------------- */

    function topEntries(breakdown, limit) {

        if (
            !breakdown ||
            typeof breakdown !== "object"
        ) {
            return [];
        }

        var entries = Object.keys(breakdown)
            .map(function (name) {
                return {
                    name: String(name),
                    amount: toFiniteNumber(breakdown[name])
                };
            })
            .filter(function (entry) {
                return entry.amount > 0;
            })
            .sort(function (a, b) {
                return b.amount - a.amount;
            });

        if (
            Number.isFinite(limit) &&
            limit > 0
        ) {
            return entries.slice(0, limit);
        }

        return entries;
    }


    /* -----------------------------------------------------
       buildTrendSeries(reportData, selection)

       Monthly selection -> one point per calendar day,
       value = reportData.spendingByDate[YYYY-MM-DD].

       Yearly / range selection -> one point per month in
       reportData.timeline, value = row.spending
       (|bills| + |expenses| for that month).

       Never invents data: days / months with no spending
       are zero-height points, not gaps.
       ----------------------------------------------------- */

    function buildTrendSeries(reportData, selection) {

        var data = reportData || {};
        var sel = selection || {};

        var points = [];
        var mode = "monthly";
        var unitLabel = "Spending per month";

        if (sel.type === "monthly") {

            mode = "daily";
            unitLabel = "Spending per day";

            var parts = monthKeyParts(sel.monthKey);
            var totalDays = daysInMonth(parts.year, parts.month);
            var byDate = data.spendingByDate || {};

            var monthLabel =
                MONTH_ABBR[parts.month - 1] || "";

            for (var day = 1; day <= totalDays; day++) {

                var dayKey =
                    parts.year +
                    "-" +
                    String(parts.month).padStart(2, "0") +
                    "-" +
                    String(day).padStart(2, "0");

                var dayValue = toFiniteNumber(byDate[dayKey]);

                points.push({
                    label: String(day),
                    fullLabel: (monthLabel + " " + day).trim(),
                    value: dayValue > 0 ? dayValue : 0,
                    showLabel:
                        day === 1 ||
                        day === totalDays ||
                        day % 5 === 0
                });
            }

        } else {

            var timeline =
                Array.isArray(data.timeline)
                    ? data.timeline
                    : [];

            points = timeline.map(function (row, index) {

                var rowParts = monthKeyParts(row.monthKey);

                var abbr =
                    MONTH_ABBR[rowParts.month - 1] ||
                    String(row.monthKey || "");

                var spend = toFiniteNumber(row.spending);

                var yearSuffix =
                    Number.isFinite(rowParts.year)
                        ? " " + rowParts.year
                        : "";

                return {
                    label: abbr,
                    fullLabel: (abbr + yearSuffix).trim(),
                    value: spend > 0 ? spend : 0,
                    showLabel:
                        timeline.length <= 12 ||
                        index === 0 ||
                        index === timeline.length - 1 ||
                        index % 2 === 0
                };
            });
        }

        var values = points.map(function (point) {
            return point.value;
        });

        var max = values.reduce(function (currentMax, value) {
            return value > currentMax ? value : currentMax;
        }, 0);

        var total = values.reduce(function (running, value) {
            return running + value;
        }, 0);

        var pointsWithValue = values.filter(function (value) {
            return value > 0;
        }).length;

        return {
            mode: mode,
            unitLabel: unitLabel,
            points: points,
            max: max,
            total: total,
            hasData: total > 0,
            pointsWithValue: pointsWithValue
        };
    }


    /* -----------------------------------------------------
       buildCategoryTree(categories, subcategories)

       categories:    { catName: amount }  (authoritative totals)
       subcategories: { catName: { subName: amount } }

       -> [{ name, total, percent, subs: [{ name, total, percent }] }]
          sorted desc, percent = share of categorized spending.
       ----------------------------------------------------- */

    function buildCategoryTree(categories, subcategories) {

        var cats = categories || {};
        var subs = subcategories || {};

        var rows = Object.keys(cats)
            .map(function (name) {
                return {
                    name: String(name),
                    total: toFiniteNumber(cats[name])
                };
            })
            .filter(function (row) {
                return row.total > 0;
            })
            .sort(function (a, b) {
                return b.total - a.total;
            });

        var grandTotal = rows.reduce(function (running, row) {
            return running + row.total;
        }, 0);

        return rows.map(function (row) {

            var subMap = subs[row.name] || {};

            var subRows = Object.keys(subMap)
                .map(function (subName) {
                    return {
                        name: String(subName),
                        total: toFiniteNumber(subMap[subName])
                    };
                })
                .filter(function (subRow) {
                    return subRow.total > 0;
                })
                .sort(function (a, b) {
                    return b.total - a.total;
                })
                .map(function (subRow) {
                    return {
                        name: subRow.name,
                        total: subRow.total,
                        percent:
                            row.total > 0
                                ? (subRow.total / row.total) * 100
                                : 0
                    };
                });

            return {
                name: row.name,
                total: row.total,
                percent:
                    grandTotal > 0
                        ? (row.total / grandTotal) * 100
                        : 0,
                subs: subRows
            };
        });
    }


    global.ReportAnalytics = {
        sumValues: sumValues,
        topEntries: topEntries,
        buildTrendSeries: buildTrendSeries,
        buildCategoryTree: buildCategoryTree
    };

})(
    typeof window !== "undefined"
        ? window
        : this
);
