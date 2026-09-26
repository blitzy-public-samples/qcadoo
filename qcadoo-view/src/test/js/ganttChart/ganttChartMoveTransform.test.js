/*
 * ***************************************************************************
 * Copyright (c) 2010 Qcadoo Limited
 * Project: Qcadoo Framework
 * Version: 1.4
 *
 * This file is part of Qcadoo.
 *
 * Qcadoo is free software; you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation; either version 3 of the License,
 * or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty
 * of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 * ***************************************************************************
 */

/*
 * Unit tests of QCD.components.elements.GanttChartMoveTransform, run with the Node built-in test runner:
 *
 *   node --test qcadoo/qcadoo-view/src/test/js/ganttChart/ganttChartMoveTransform.test.js
 *
 * The script under test is loaded from qcadooView/public/js/crud/qcd/components/elements/gantt/ganttChart.js, and the
 * forward cell positions come from src/test/resources/ganttChart/moveTransformFixtures.json.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

// Absolute path of the Gantt chart script under test.
const SCRIPT_PATH = path.resolve(__dirname,
    '../../../main/resources/qcadooView/public/js/crud/qcd/components/elements/gantt/ganttChart.js');

// Absolute path of the shared forward-transform fixture.
const FIXTURE_PATH = path.resolve(__dirname, '../../resources/ganttChart/moveTransformFixtures.json');

// Cell width in pixels and grid step in minutes of the rendered chart.
const CELL_WIDTH = 25;
const GRID_MINUTES = 30;

// Names of every member the transform object exposes.
const TRANSFORM_MEMBERS = [
    'DRAG_THRESHOLD_PX',
    'buildMoveArgs',
    'escapeHtml',
    'formatWallClock',
    'gridStepPx',
    'isDraggable',
    'isValidDropPoint',
    'parseWallClock',
    'resolveDropRow',
    'resolveMoveOutcome',
    'snapMinutes',
    'toDropDate',
    'toPixelDelta'
];

vm.runInThisContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), { filename: url.pathToFileURL(SCRIPT_PATH).href });

const T = globalThis.QCD.components.elements.GanttChartMoveTransform;

assert.equal(typeof T, 'object', 'QCD.components.elements.GanttChartMoveTransform is an object');
assert.notEqual(T, null, 'QCD.components.elements.GanttChartMoveTransform is not null');
assert.deepEqual(Object.keys(T).sort(), TRANSFORM_MEMBERS, 'GanttChartMoveTransform exposes exactly its 13 members');

const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));

assert.ok(Array.isArray(FIXTURE.fixtures) && FIXTURE.fixtures.length > 0, 'the fixture file lists fixtures');

// Returns the wall-clock minutes of a "yyyy-MM-dd HH:mm:ss" date, failing the test when it does not parse.
function minutesOf(wallClock) {
    const minutes = T.parseWallClock(wallClock);
    assert.equal(typeof minutes, 'number', `${wallClock} parses to wall-clock minutes`);
    return minutes;
}

// Returns the fixtures computed without a DST transition, in the UTC zone.
function utcFixtures() {
    const fixtures = FIXTURE.fixtures.filter((fixture) => fixture.dstTransition === null);
    assert.ok(fixtures.length > 0, 'the fixture file holds UTC fixtures');
    return fixtures;
}

// Returns the fixtures computed across a DST transition in the Europe/Warsaw zone.
function warsawFixtures() {
    const fixtures = FIXTURE.fixtures.filter((fixture) => fixture.timeZone === 'Europe/Warsaw');
    assert.ok(fixtures.length > 0, 'the fixture file holds Europe/Warsaw fixtures');
    return fixtures;
}

// Returns the targets of a fixture that start on the 30-minute grid.
function onGridTargets(fixture) {
    const targets = fixture.targets.filter((target) => target.onGrid === true);
    assert.ok(targets.length >= 2, `${fixture.name} holds at least two on-grid targets`);
    return targets;
}

// Runs fn with process.env.TZ set to the given zone and restores the previous value afterwards.
function withTimeZone(timeZone, fn) {
    const hadTimeZone = Object.prototype.hasOwnProperty.call(process.env, 'TZ');
    const previousTimeZone = process.env.TZ;
    process.env.TZ = timeZone;
    try {
        return fn();
    } finally {
        if (hadTimeZone) {
            process.env.TZ = previousTimeZone;
        } else {
            delete process.env.TZ;
        }
    }
}

// Asserts the inverse transform returns every on-grid fixture date from its untruncated forward position.
test('inverse transform reverses forward math for every ZoomLevel', () => {
    const fixtures = utcFixtures();

    assert.deepEqual(fixtures.map((fixture) => fixture.zoomLevel).sort(), ['D1', 'H1', 'H3', 'H6'],
        'the UTC fixtures cover every ZoomLevel exactly once');

    for (const fixture of fixtures) {
        const hoursInterval = fixture.hoursInterval;
        const cellWidth = fixture.cellWidth;
        const gridMinutes = fixture.gridMinutes;
        const gridTargets = onGridTargets(fixture);

        for (const target of gridTargets) {
            assert.equal(T.toDropDate(fixture.scaleDateFrom, target.untruncatedCells * cellWidth, hoursInterval, cellWidth,
                gridMinutes), target.dateFrom, `${fixture.name}: scale start plus ${target.untruncatedCells} cells`);
        }

        for (const from of gridTargets) {
            for (const to of gridTargets) {
                assert.equal(T.toDropDate(from.dateFrom, (to.untruncatedCells - from.untruncatedCells) * cellWidth,
                    hoursInterval, cellWidth, gridMinutes), to.dateFrom,
                `${fixture.name}: drag from ${from.dateFrom} to ${to.dateFrom}`);
            }
        }

        for (const target of fixture.targets) {
            const deltaPx = T.toPixelDelta(fixture.scaleDateFrom, target.dateFrom, hoursInterval, cellWidth);
            assert.ok(Math.abs(deltaPx - target.untruncatedCells * cellWidth) < 1e-9,
                `${fixture.name}: pixel delta of ${target.dateFrom} is ${deltaPx}, expected ${target.untruncatedCells * cellWidth}`);
        }
    }
});

// Asserts one and two grid steps of pointer travel move the drop date by 30 and 60 minutes at every ZoomLevel.
test('adjacent 30-minute targets at every ZoomLevel', () => {
    for (const fixture of utcFixtures()) {
        const hoursInterval = fixture.hoursInterval;
        const base = onGridTargets(fixture)[0].dateFrom;
        const stepPx = T.gridStepPx(hoursInterval, CELL_WIDTH, GRID_MINUTES);

        for (const k of [-2, -1, 1, 2]) {
            const expected = T.formatWallClock(minutesOf(base) + GRID_MINUTES * k);
            assert.equal(T.toDropDate(base, k * stepPx, hoursInterval, CELL_WIDTH, GRID_MINUTES), expected,
                `${fixture.zoomLevel}: ${k} grid steps from ${base}`);
        }
    }

    assert.equal(T.toDropDate('2026-06-01 09:00:00', 12.5, 1, CELL_WIDTH, GRID_MINUTES), '2026-06-01 09:30:00');
    assert.equal(T.toDropDate('2026-06-02 00:00:00', -2 * T.gridStepPx(24, CELL_WIDTH, GRID_MINUTES), 24, CELL_WIDTH,
        GRID_MINUTES), '2026-06-01 23:00:00');
});

// Asserts a date recovered from the truncated forward position falls short of the true start by less than one quantum.
test('inverting truncated from misses by up to the quantum', () => {
    const truncatedTargetsByZoomLevel = {};

    for (const fixture of utcFixtures()) {
        const hoursInterval = fixture.hoursInterval;
        const scaleStart = minutesOf(fixture.scaleDateFrom);

        for (const target of fixture.targets) {
            if (target.truncatedCells !== target.untruncatedCells) {
                truncatedTargetsByZoomLevel[fixture.zoomLevel] = (truncatedTargetsByZoomLevel[fixture.zoomLevel] || 0) + 1;
                const shortfall = minutesOf(target.dateFrom) - (scaleStart + target.truncatedCells * hoursInterval * 60);
                assert.ok(shortfall > 0 && shortfall < fixture.quantumMinutes,
                    `${fixture.name}: ${target.dateFrom} shortfall ${shortfall} lies in (0, ${fixture.quantumMinutes})`);
            }
        }

        for (const target of onGridTargets(fixture)) {
            assert.equal(T.toDropDate(target.dateFrom, 0, hoursInterval, fixture.cellWidth, fixture.gridMinutes),
                target.dateFrom, `${fixture.name}: zero travel keeps ${target.dateFrom}`);
        }
    }

    assert.deepEqual(Object.keys(truncatedTargetsByZoomLevel).sort(), ['D1', 'H1', 'H3', 'H6'],
        'every ZoomLevel has a target whose forward position is truncated');
});

// Asserts drop dates across the Europe/Warsaw DST changes are wall-clock results identical in the UTC and Warsaw zones.
test('wall-clock results on DST-change days', () => {
    const fixtures = warsawFixtures();
    const springForwardFixtures = fixtures.filter((fixture) => typeof fixture.nonexistentWallClock === 'string');
    const fallBackFixtures = fixtures.filter((fixture) => typeof fixture.repeatedWallClock === 'string');

    assert.ok(springForwardFixtures.length > 0, 'a fixture names the nonexistent spring-forward wall-clock time');
    assert.ok(fallBackFixtures.length > 0, 'a fixture names the repeated fall-back wall-clock time');

    const collectResults = () => {
        const results = [];

        for (const fixture of fixtures) {
            const gridTargets = onGridTargets(fixture);
            const first = gridTargets[0];
            for (const target of gridTargets) {
                const actual = T.toDropDate(first.dateFrom, (target.untruncatedCells - first.untruncatedCells) * fixture.cellWidth,
                    fixture.hoursInterval, fixture.cellWidth, fixture.gridMinutes);
                assert.equal(actual, target.dateFrom, `${fixture.name}: drag from ${first.dateFrom} to ${target.dateFrom}`);
                results.push(actual);
            }
        }

        const springForward = T.toDropDate('2026-03-29 01:30:00', 25, 1, CELL_WIDTH, GRID_MINUTES);
        assert.equal(springForward, '2026-03-29 02:30:00');
        for (const fixture of springForwardFixtures) {
            assert.equal(springForward, fixture.nonexistentWallClock, `${fixture.name}: nonexistent wall-clock time`);
        }
        results.push(springForward);

        const fallBack = T.toDropDate('2026-10-25 01:30:00', 25, 1, CELL_WIDTH, GRID_MINUTES);
        assert.equal(fallBack, '2026-10-25 02:30:00');
        for (const fixture of fallBackFixtures) {
            assert.equal(fallBack, fixture.repeatedWallClock, `${fixture.name}: repeated wall-clock time`);
        }
        results.push(fallBack);

        return results;
    };
    const summerOffsetMinutes = () => new Date(Date.UTC(2026, 5, 1, 12, 0, 0)).getTimezoneOffset();
    const timeZoneBefore = process.env.TZ;

    const utcResults = withTimeZone('UTC', collectResults);
    const warsawResults = withTimeZone('Europe/Warsaw', collectResults);

    assert.equal(withTimeZone('UTC', summerOffsetMinutes), 0, 'the UTC run uses a zero zone offset');
    assert.equal(withTimeZone('Europe/Warsaw', summerOffsetMinutes), -120, 'the Europe/Warsaw run uses the CEST offset');
    assert.equal(process.env.TZ, timeZoneBefore, 'the process time zone is restored');
    assert.ok(utcResults.length > 2, 'the UTC run collected drop dates');
    assert.deepEqual(warsawResults, utcResults, 'drop dates do not depend on the process time zone');
});

// Asserts every drop date computed for any pointer travel lands on :00 or :30 with zero seconds.
test('drop dates always land on the 30-minute grid', () => {
    const gridDate = /^\d{4}-\d\d-\d\d \d\d:(00|30):00$/;
    const failures = [];
    let checked = 0;

    for (const hoursInterval of [1, 3, 6, 24]) {
        for (const base of ['2026-06-01 10:07:00', '2026-06-01 09:00:00']) {
            for (let i = 0; -300 + i * 0.37 <= 300; i++) {
                const deltaPx = -300 + i * 0.37;
                const dropDate = T.toDropDate(base, deltaPx, hoursInterval, CELL_WIDTH, GRID_MINUTES);
                checked++;
                if (typeof dropDate !== 'string' || !gridDate.test(dropDate)) {
                    failures.push(`h=${hoursInterval} base=${base} deltaPx=${deltaPx} -> ${dropDate}`);
                }
            }
        }
    }

    assert.ok(checked > 10000, `checked ${checked} pointer positions`);
    assert.deepEqual(failures, [], `off-grid drop dates:\n${failures.slice(0, 20).join('\n')}`);
});

// Asserts the drag threshold, the grid step width per ZoomLevel, and drag eligibility at H1 and H3 only.
test('dragging is enabled only where one grid step spans the drag threshold', () => {
    assert.equal(T.DRAG_THRESHOLD_PX, 4);
    assert.equal(T.gridStepPx(1, CELL_WIDTH, GRID_MINUTES), 12.5);

    for (const [hoursInterval, expectedStepPx] of [[3, 25 / 6], [6, 25 / 12], [24, 25 / 48]]) {
        const stepPx = T.gridStepPx(hoursInterval, CELL_WIDTH, GRID_MINUTES);
        assert.ok(Math.abs(stepPx - expectedStepPx) < 1e-12, `grid step at ${hoursInterval} h per cell is ${stepPx}`);
    }

    for (const [hoursInterval, expectedDraggable] of [[1, true], [3, true], [6, false], [24, false]]) {
        assert.equal(T.isDraggable({ id: 7 }, false, true, hoursInterval, CELL_WIDTH, GRID_MINUTES), expectedDraggable,
            `drag eligibility at ${hoursInterval} h per cell`);
        assert.equal(expectedDraggable, T.gridStepPx(hoursInterval, CELL_WIDTH, GRID_MINUTES) >= T.DRAG_THRESHOLD_PX,
            `drag eligibility at ${hoursInterval} h per cell follows the grid step width`);
    }
});

// Asserts items without an id, collision items, boards without moves and incomplete zoom input are never draggable.
test('isDraggable is false for items without id', () => {
    for (const item of [{ id: null }, { id: undefined }, {}]) {
        assert.equal(T.isDraggable(item, false, true, 1, CELL_WIDTH, GRID_MINUTES), false,
            `item ${JSON.stringify(item)} is not draggable`);
    }

    assert.equal(T.isDraggable({ id: 7 }, true, true, 1, CELL_WIDTH, GRID_MINUTES), false, 'a collision item is not draggable');
    assert.equal(T.isDraggable({ id: 7 }, false, false, 1, CELL_WIDTH, GRID_MINUTES), false,
        'an item is not draggable when the board disallows moves');
    assert.equal(T.isDraggable({ id: 7 }, false, 'true', 1, CELL_WIDTH, GRID_MINUTES), false,
        'allowItemMove must be the boolean true');
    assert.equal(T.isDraggable(null, false, true, 1, CELL_WIDTH, GRID_MINUTES), false, 'a missing item is not draggable');
    assert.equal(T.isDraggable({ id: 7 }, false, true, undefined, CELL_WIDTH, GRID_MINUTES), false,
        'an item is not draggable without an hours interval');
    assert.equal(T.isDraggable({ id: 7 }, false, true, 1, CELL_WIDTH, GRID_MINUTES), true,
        'an item with an id is draggable at H1');
});

// Asserts only non-zero integer number ids from -(2^53 - 1) to 2^53 - 1 are draggable, whatever the zoom level allows.
test('isDraggable is false for ids outside the safe-integer range', () => {
    for (const id of [7, 1, -1, 9007199254740991, -9007199254740991, JSON.parse('{"id":9007199254740991}').id]) {
        assert.equal(T.isDraggable({ id }, false, true, 1, CELL_WIDTH, GRID_MINUTES), true, `id ${id} is draggable at H1`);
        assert.equal(T.isDraggable({ id }, false, true, 3, CELL_WIDTH, GRID_MINUTES), true, `id ${id} is draggable at H3`);
    }

    const roundedId = JSON.parse('{"id":9007199254740993}').id;
    assert.equal(roundedId, 9007199254740992, 'JSON.parse rounds 9007199254740993 to 9007199254740992');

    const unsafeIds = [9007199254740992, -9007199254740992, roundedId, JSON.parse('{"id":12345678901234567890}').id, 1e300,
        -1e300, 7.5, -0.5, Number.MIN_VALUE, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '7', true,
        [7], { valueOf: () => 7 }, 0, -0, null, undefined];
    for (const id of unsafeIds) {
        assert.strictEqual(T.isDraggable({ id }, false, true, 1, CELL_WIDTH, GRID_MINUTES), false,
            `id ${typeof id === 'object' && id !== null ? JSON.stringify(id) : String(id)} is not draggable`);
    }

    const unsafeItem = {
        id: roundedId,
        row: 'L1',
        info: { name: 'ORD-X', dateFrom: '2026-06-01 09:00:00', dateTo: '2026-06-01 10:00:00' }
    };
    assert.equal(T.isDraggable(unsafeItem, false, true, 1, CELL_WIDTH, GRID_MINUTES), false,
        'an item whose id JSON.parse rounded is not draggable');
    assert.equal(T.isDraggable({ id: 9007199254740991 }, false, true, 6, CELL_WIDTH, GRID_MINUTES), false,
        'a safe id stays not draggable where one grid step is narrower than the drag threshold');
    assert.equal(T.isDraggable({ id: 9007199254740991 }, true, true, 1, CELL_WIDTH, GRID_MINUTES), false,
        'a collision item with a safe id is not draggable');
});

// Asserts &, <, >, " and ' are replaced by character references and other text passes unchanged.
test('escapeHtml encodes markup characters', () => {
    const expectedEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    for (const character of Object.keys(expectedEntities)) {
        assert.equal(T.escapeHtml(character), expectedEntities[character], `encoding of ${character}`);
    }

    const mixed = T.escapeHtml('<b a="1" c=\'2\'>&x</b>');
    assert.equal(mixed, '&lt;b a=&quot;1&quot; c=&#39;2&#39;&gt;&amp;x&lt;/b&gt;');
    assert.doesNotMatch(mixed, /[<>"']/);
    assert.doesNotMatch(mixed, /&(?!(amp|lt|gt|quot|#39);)/);

    assert.equal(T.escapeHtml('&amp;'), '&amp;amp;');
    assert.equal(T.escapeHtml('L1 order 42'), 'L1 order 42');
    assert.equal(T.escapeHtml(''), '');
    assert.equal(T.escapeHtml(null), '');
    assert.equal(T.escapeHtml(undefined), '');
    assert.equal(T.escapeHtml(42), '42');
});

// Asserts vertical content offsets resolve to the row under them and positions outside the rows resolve to null.
test('resolveDropRow maps content offsets to rows', () => {
    const rowNames = ['L1', 'L2', 'L3'];

    assert.equal(T.resolveDropRow(0, 30, rowNames), 'L1');
    assert.equal(T.resolveDropRow(29.9, 30, rowNames), 'L1');
    assert.equal(T.resolveDropRow(30, 30, rowNames), 'L2');
    assert.equal(T.resolveDropRow(89.9, 30, rowNames), 'L3');
    assert.equal(T.resolveDropRow(90, 30, rowNames), null);
    assert.equal(T.resolveDropRow(-1, 30, rowNames), null);
    assert.equal(T.resolveDropRow(Number.NaN, 30, rowNames), null);
    assert.equal(T.resolveDropRow('30', 30, rowNames), null);
    assert.equal(T.resolveDropRow(0, 30, []), null);
    assert.equal(T.resolveDropRow(0, 30, null), null);
});

// Asserts a drop point is valid only inside both the visible and the content rectangle.
test('isValidDropPoint requires both rectangles', () => {
    const visibleRect = { left: 100, top: 50, right: 500, bottom: 250 };
    const contentRect = { left: 0, top: 50, right: 300, bottom: 400 };

    assert.equal(T.isValidDropPoint({ x: 200, y: 100 }, visibleRect, contentRect), true, 'inside both rectangles');
    assert.equal(T.isValidDropPoint({ x: 400, y: 100 }, visibleRect, contentRect), false, 'inside the visible rectangle only');
    assert.equal(T.isValidDropPoint({ x: 50, y: 300 }, visibleRect, contentRect), false, 'inside the content rectangle only');
    assert.equal(T.isValidDropPoint({ x: 600, y: 500 }, visibleRect, contentRect), false, 'inside neither rectangle');

    assert.equal(T.isValidDropPoint({ x: 100, y: 50 }, visibleRect, contentRect), true, 'left and top edges are inside');
    assert.equal(T.isValidDropPoint({ x: 300, y: 100 }, visibleRect, contentRect), false, 'the right edge is outside');
    assert.equal(T.isValidDropPoint({ x: 200, y: 250 }, visibleRect, contentRect), false, 'the bottom edge is outside');

    assert.equal(T.isValidDropPoint(null, visibleRect, contentRect), false, 'a missing point is invalid');
    assert.equal(T.isValidDropPoint({ x: 200, y: 100 }, null, contentRect), false, 'a missing visible rectangle is invalid');
    assert.equal(T.isValidDropPoint({ x: 200, y: 100 }, visibleRect, undefined), false,
        'a missing content rectangle is invalid');
});

// Asserts the moveItem arguments are one JSON string with the target row, the drop date and the rendered originals.
test('buildMoveArgs carries target and rendered originals', () => {
    const item = {
        id: 7,
        row: 'L1',
        info: { name: 'ORD-7', dateFrom: '2026-06-01 09:00:00', dateTo: '2026-06-01 10:00:00' }
    };

    const args = T.buildMoveArgs(item, 'L2', '2026-06-01 10:30:00');

    assert.ok(Array.isArray(args), 'the arguments are an array');
    assert.equal(args.length, 1);
    assert.equal(typeof args[0], 'string');
    assert.deepEqual(JSON.parse(args[0]), {
        itemId: 7,
        row: 'L2',
        dateFrom: '2026-06-01 10:30:00',
        originalRow: 'L1',
        originalName: 'ORD-7',
        originalDateFrom: '2026-06-01 09:00:00',
        originalDateTo: '2026-06-01 10:00:00'
    });
});

// Asserts only an accepted move result avoids snap-back and every outcome carries the delivered message or null.
test('resolveMoveOutcome snaps back unless accepted', () => {
    assert.deepEqual(T.resolveMoveOutcome({ accepted: true }), { snapBack: false, message: null });
    assert.deepEqual(T.resolveMoveOutcome({ accepted: true, message: 'ok' }), { snapBack: false, message: 'ok' });
    assert.deepEqual(T.resolveMoveOutcome({ accepted: false, message: 'm' }), { snapBack: true, message: 'm' });
    assert.deepEqual(T.resolveMoveOutcome({ accepted: 'true', message: 'm' }), { snapBack: true, message: 'm' });
    assert.deepEqual(T.resolveMoveOutcome({}), { snapBack: true, message: null });
    assert.deepEqual(T.resolveMoveOutcome(null), { snapBack: true, message: null });
    assert.deepEqual(T.resolveMoveOutcome(undefined), { snapBack: true, message: null });
});

// Asserts malformed dates parse to null, propagate through the date conversions, and valid dates round-trip.
test('parseWallClock rejects malformed input and round-trips valid input', () => {
    for (const malformed of ['garbage', '2026-06-01', '', null, '2026-06-01 10:30', undefined, 1234]) {
        assert.equal(T.parseWallClock(malformed), null, `${JSON.stringify(malformed)} does not parse`);
    }

    assert.equal(T.parseWallClock('1970-01-01 00:00:00'), 0);
    assert.equal(T.parseWallClock('2026-06-01 10:30:00'), Date.UTC(2026, 5, 1, 10, 30, 0) / 60000);

    for (const valid of ['2026-06-01 00:00:00', '2028-02-29 23:30:00', '2026-12-31 23:30:00']) {
        assert.equal(T.formatWallClock(T.parseWallClock(valid)), valid, `${valid} round-trips`);
    }

    assert.equal(T.formatWallClock(0), '1970-01-01 00:00:00');
    for (const invalidMinutes of [Number.NaN, Number.POSITIVE_INFINITY, '60', null, undefined]) {
        assert.equal(T.formatWallClock(invalidMinutes), null, `${String(invalidMinutes)} does not format`);
    }

    assert.equal(T.toDropDate('garbage', 25, 1, CELL_WIDTH, GRID_MINUTES), null);
    assert.equal(T.toPixelDelta('garbage', '2026-06-01 10:00:00', 1, CELL_WIDTH), 0);
    assert.equal(T.toPixelDelta('2026-06-01 10:00:00', 'garbage', 1, CELL_WIDTH), 0);
});

// Asserts every year from 0000 to 0099, and sample later years, parse to their literal proleptic Gregorian date and
// format back to the same text; 0099, 0100 and 1999 lie in that order, with 1900 years from 0099 to 1999; drag steps
// keep literal-year wall-clock arithmetic, including the crossing from 0099-12-31 to 0100-01-01 and back; and parsing,
// drop dates and formatting give the same results under every tested process.env.TZ zone.
test('wall-clock years 0000 to 0099 keep their literal year', () => {
    // Minutes of five 400-year Gregorian cycles, 2000 years of 146097 days per cycle.
    const twoThousandYearsMinutes = 5 * 146097 * 1440;
    const years = [];
    for (let year = 0; year <= 99; year++) {
        years.push(year);
    }
    years.push(100, 400, 1582, 1900, 1970, 2026, 9999);

    for (const year of years) {
        const text = `${String(year).padStart(4, '0')}-03-01 10:30:00`;
        // Oracle: the same wall-clock date 2000 years later, where Date.UTC reads the year as written, minus 2000 years.
        const expectedMinutes = Date.UTC(year + 2000, 2, 1, 10, 30, 0) / 60000 - twoThousandYearsMinutes;
        assert.equal(T.parseWallClock(text), expectedMinutes, `${text} parses to its literal year`);
        assert.equal(T.formatWallClock(expectedMinutes), text, `${text} formats back to the same text`);
    }

    assert.ok(T.parseWallClock('0099-01-01 10:00:00') < T.parseWallClock('0100-01-01 00:00:00'),
        'year 0099 lies before year 0100');
    assert.ok(T.parseWallClock('0100-01-01 00:00:00') < T.parseWallClock('1999-01-01 10:00:00'),
        'year 0100 lies before year 1999');
    assert.equal(T.parseWallClock('1999-01-01 10:00:00') - T.parseWallClock('0099-01-01 10:00:00'),
        (Date.UTC(3999, 0, 1, 10, 0, 0) - Date.UTC(2099, 0, 1, 10, 0, 0)) / 60000, '0099 and 1999 lie 1900 years apart');

    assert.equal(T.toDropDate('0099-01-01 10:00:00', 12.5, 1, CELL_WIDTH, GRID_MINUTES), '0099-01-01 10:30:00');
    assert.equal(T.toDropDate('0099-12-31 23:30:00', 12.5, 1, CELL_WIDTH, GRID_MINUTES), '0100-01-01 00:00:00');
    assert.equal(T.toDropDate('0100-01-01 00:00:00', -12.5, 1, CELL_WIDTH, GRID_MINUTES), '0099-12-31 23:30:00');
    assert.equal(T.toDropDate('0000-01-01 00:00:00', 12.5, 1, CELL_WIDTH, GRID_MINUTES), '0000-01-01 00:30:00');
    assert.equal(T.toDropDate('0000-01-01 00:30:00', -12.5, 1, CELL_WIDTH, GRID_MINUTES), '0000-01-01 00:00:00');
    assert.equal(T.toDropDate('0050-06-01 09:00:00', 2 * T.gridStepPx(3, CELL_WIDTH, GRID_MINUTES), 3, CELL_WIDTH,
        GRID_MINUTES), '0050-06-01 10:00:00');
    assert.equal(T.toPixelDelta('0099-01-01 10:00:00', '0099-01-01 10:30:00', 1, CELL_WIDTH), 12.5);
    assert.equal(T.toPixelDelta('0099-12-31 23:30:00', '0100-01-01 00:00:00', 1, CELL_WIDTH), 12.5);

    const zoneResults = (timeZone) => withTimeZone(timeZone, () => [
        T.parseWallClock('0099-01-01 10:00:00'),
        T.toDropDate('0099-01-01 10:00:00', 12.5, 1, CELL_WIDTH, GRID_MINUTES),
        T.formatWallClock(T.parseWallClock('0000-02-29 12:00:00'))
    ]);
    const utcZoneResults = zoneResults('UTC');
    assert.deepEqual(utcZoneResults, [T.parseWallClock('0099-01-01 10:00:00'), '0099-01-01 10:30:00', '0000-02-29 12:00:00']);
    for (const timeZone of ['Asia/Tokyo', 'America/Los_Angeles', 'Europe/Warsaw', 'Pacific/Kiritimati']) {
        assert.deepEqual(zoneResults(timeZone), utcZoneResults, `years 0000 to 0099 do not depend on the ${timeZone} zone`);
    }
});

// Asserts dates that do not exist parse to null and give no drop date or pixel delta, leap days round-trip, and minutes
// before 0000-01-01 00:00:00 or from 10000-01-01 00:00:00 on neither format nor yield a drop date.
test('wall-clock dates outside the calendar or the years 0000 to 9999 are rejected', () => {
    const impossibleDates = ['0100-02-29 10:00:00', '1900-02-29 10:00:00', '2026-02-29 10:00:00', '2026-02-30 10:00:00',
        '2026-04-31 10:00:00', '2026-13-01 00:00:00', '2026-00-10 00:00:00', '2026-06-00 00:00:00', '2026-06-32 00:00:00',
        '2026-06-01 24:00:00', '2026-06-01 10:60:00', '2026-06-01 10:30:60', '0000-00-00 00:00:00', '9999-12-31 24:00:00'];
    for (const impossible of impossibleDates) {
        assert.equal(T.parseWallClock(impossible), null, `${impossible} does not parse`);
        assert.equal(T.toDropDate(impossible, 12.5, 1, CELL_WIDTH, GRID_MINUTES), null, `${impossible} gives no drop date`);
        assert.equal(T.toPixelDelta(impossible, '2026-06-01 10:00:00', 1, CELL_WIDTH), 0,
            `${impossible} as the original date gives no pixel delta`);
        assert.equal(T.toPixelDelta('2026-06-01 10:00:00', impossible, 1, CELL_WIDTH), 0,
            `${impossible} as the target date gives no pixel delta`);
    }

    for (const leapDay of ['0000-02-29 12:00:00', '0004-02-29 10:00:00', '0400-02-29 10:00:00', '2000-02-29 00:00:00',
        '2028-02-29 23:30:00']) {
        assert.equal(T.formatWallClock(T.parseWallClock(leapDay)), leapDay, `${leapDay} round-trips`);
    }

    const firstMinutes = T.parseWallClock('0000-01-01 00:00:00');
    const lastMinutes = T.parseWallClock('9999-12-31 23:59:00');
    assert.equal(firstMinutes, Date.UTC(2000, 0, 1, 0, 0, 0) / 60000 - 5 * 146097 * 1440);
    assert.equal(lastMinutes, Date.UTC(11999, 11, 31, 23, 59, 0) / 60000 - 5 * 146097 * 1440);
    assert.equal(T.formatWallClock(firstMinutes), '0000-01-01 00:00:00');
    assert.equal(T.formatWallClock(lastMinutes), '9999-12-31 23:59:00');
    const lastSecondMinutes = minutesOf('9999-12-31 23:59:59');
    assert.ok(Math.abs(lastSecondMinutes - (lastMinutes + 59 / 60)) < 1e-6, '9999-12-31 23:59:59 lies 59 s after 23:59:00');
    assert.equal(T.formatWallClock(lastSecondMinutes), '9999-12-31 23:59:59');

    for (const outOfRange of [firstMinutes - 1, firstMinutes - 1 / 60, firstMinutes - 400 * 525600, lastMinutes + 1,
        lastMinutes + 400 * 525600, 8.64e15 / 60000 + 1, -8.64e15 / 60000 - 1, Number.MAX_VALUE, -Number.MAX_VALUE]) {
        assert.equal(T.formatWallClock(outOfRange), null, `${outOfRange} wall-clock minutes do not format`);
    }

    assert.equal(T.toDropDate('0000-01-01 00:00:00', -12.5, 1, CELL_WIDTH, GRID_MINUTES), null);
    assert.equal(T.toDropDate('9999-12-31 23:30:00', 12.5, 1, CELL_WIDTH, GRID_MINUTES), null);
    assert.equal(T.toDropDate('9999-12-31 23:30:00', 0, 1, CELL_WIDTH, GRID_MINUTES), '9999-12-31 23:30:00');
    assert.equal(T.toDropDate('9999-12-31 23:30:00', -12.5, 1, CELL_WIDTH, GRID_MINUTES), '9999-12-31 23:00:00');
});

// Asserts minutes round to the nearest 30-minute multiple, with Math.round half-way behaviour and signed zero.
test('snapMinutes rounds to the nearest grid multiple', () => {
    const cases = [[0, 0], [14, 0], [15, 30], [44, 30], [45, 60], [46, 60], [-14, -0], [-15, -0], [-16, -30], [-46, -60]];

    for (const [minutes, expected] of cases) {
        const snapped = T.snapMinutes(minutes, GRID_MINUTES);
        assert.ok(Object.is(snapped, expected), `snapMinutes(${minutes}, 30) is ${Object.is(snapped, -0) ? '-0' : snapped}`);
        assert.ok(snapped % GRID_MINUTES === 0, `snapMinutes(${minutes}, 30) is a grid multiple`);
    }
});
