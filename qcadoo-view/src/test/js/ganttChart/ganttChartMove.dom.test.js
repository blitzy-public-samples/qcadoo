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
 * DOM tests of the Gantt chart item drag layer, run with the Node built-in test runner against the real widget stack of
 * ganttChartMove.dom.html in chrome-headless-shell:
 *
 *   node --test qcadoo/qcadoo-view/src/test/js/ganttChart/ganttChartMove.dom.test.js
 *
 * The runner starts chrome-headless-shell from PATH with a temporary profile, drives it over the DevTools Protocol with
 * the global WebSocket, and sends trusted mouse and touch input with Input.dispatchMouseEvent and
 * Input.dispatchTouchEvent. A missing chrome-headless-shell, a failed case or a case count other than 18 fails the run.
 */
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const url = require('node:url');

// Executable name of the Chrome for Testing headless shell, resolved from PATH.
const CHROME_BINARY = 'chrome-headless-shell';

// Milliseconds allowed for chrome-headless-shell to print its DevTools endpoint.
const CHROME_START_TIMEOUT_MS = 20000;

// Milliseconds allowed for chrome-headless-shell to exit after it is asked to stop.
const CHROME_EXIT_TIMEOUT_MS = 5000;

// Milliseconds allowed for a page load after Page.navigate.
const PAGE_LOAD_TIMEOUT_MS = 15000;

// Number of registered cases.
const EXPECTED_CASE_COUNT = 18;

// file:// URL of the DOM fixture.
const FIXTURE_URL = url.pathToFileURL(path.join(__dirname, 'ganttChartMove.dom.html')).href;

// Viewport of the emulated page, in CSS pixels.
const VIEWPORT = { width: 1024, height: 768 };

// Mouse position outside the 800 x 300 px chart host at which the pointer rests between interactions.
const PARK_POINT = { x: 1000, y: 740 };

// Element id prefix of Gantt items and of collision box entries.
const ITEM_ID_PREFIX = 'window.mainTab.gantt_item_';
const COLLISION_ENTRY_ID_PREFIX = 'window.mainTab.gantt_collisionItem_';

// Element id of the Gantt component.
const GANTT_ID = 'window.mainTab.gantt';

// Row height and horizontal width of one 30-minute grid step at H1, in pixels.
const ROW_HEIGHT_PX = 30;
const GRID_STEP_H1_PX = 12.5;

// Page expression that is true when the Gantt component is not blocked and no blockUI element remains inside it.
const IS_UNBLOCKED_EXPR = '(function () {'
    + ' var element = document.getElementById(' + JSON.stringify(GANTT_ID) + ');'
    + ' return !!element && !jQuery(element).data("blockUI.isBlocked")'
    + ' && document.querySelectorAll("#ganttHost .blockUI").length === 0;'
    + ' }())';

// Chrome process, profile directory, DevTools client and page session shared by every case.
const browser = {
    process: null,
    exited: null,
    profileDir: null,
    client: null,
    sessionId: null
};

// Resolves after the given number of milliseconds.
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Starts chrome-headless-shell and resolves with its process, a promise of its exit and its DevTools WebSocket URL.
function launchChrome(profileDir) {
    return new Promise((resolve, reject) => {
        const args = [
            '--remote-debugging-port=0',
            '--user-data-dir=' + profileDir,
            '--no-first-run',
            '--no-default-browser-check',
            '--allow-file-access-from-files',
            '--disable-dev-shm-usage',
            ...(process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : []),
            'about:blank'
        ];
        const chrome = childProcess.spawn(CHROME_BINARY, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        const exited = new Promise((resolveExit) => chrome.once('exit', (code, signal) => resolveExit({ code, signal })));
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            fail(new Error(CHROME_BINARY + ' printed no DevTools endpoint within ' + CHROME_START_TIMEOUT_MS + ' ms: '
                + stderr));
        }, CHROME_START_TIMEOUT_MS);

        // Rejects once; a started process is killed first and the rejection follows its exit.
        function fail(error) {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            if (chrome.pid === undefined) {
                reject(error);
                return;
            }
            if (chrome.exitCode === null && chrome.signalCode === null) {
                chrome.kill('SIGKILL');
            }
            exited.then(() => reject(error));
        }

        chrome.once('error', (error) => {
            fail(new Error('Cannot start ' + CHROME_BINARY + ' from PATH: ' + error.message));
        });
        chrome.once('exit', (code, signal) => {
            fail(new Error(CHROME_BINARY + ' exited (code ' + code + ', signal ' + signal
                + ') before printing its DevTools endpoint: ' + stderr));
        });
        chrome.stderr.setEncoding('utf8');
        chrome.stderr.on('data', (chunk) => {
            if (settled) {
                return;
            }
            stderr += chunk;
            const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
            if (match) {
                settled = true;
                clearTimeout(timer);
                resolve({ process: chrome, exited, endpoint: match[1] });
            }
        });
    });
}

// Opens a WebSocket and resolves once it is connected.
function connectWebSocket(endpoint) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(endpoint);
        const onError = () => reject(new Error('Cannot connect to the DevTools endpoint ' + endpoint));
        socket.addEventListener('error', onError, { once: true });
        socket.addEventListener('open', () => {
            socket.removeEventListener('error', onError);
            resolve(socket);
        }, { once: true });
    });
}

// Minimal DevTools Protocol client over one browser-level WebSocket, with flat sessions.
class DevToolsClient {

    // Wraps a connected WebSocket.
    constructor(socket) {
        this.socket = socket;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        socket.addEventListener('message', (event) => this.onMessage(event.data));
        socket.addEventListener('close', () => this.rejectAll(new Error('DevTools WebSocket closed')));
    }

    // Sends a command, resolving with its result or rejecting with its error.
    send(method, params, sessionId) {
        const id = this.nextId++;
        const message = { id, method, params: params || {} };
        if (sessionId) {
            message.sessionId = sessionId;
        }
        return new Promise((resolve, reject) => {
            this.pending.set(id, { method, resolve, reject });
            try {
                this.socket.send(JSON.stringify(message));
            } catch (error) {
                this.pending.delete(id);
                reject(error);
            }
        });
    }

    // Registers a listener of an event of a session and returns the function that removes it.
    on(method, sessionId, listener) {
        const key = DevToolsClient.eventKey(method, sessionId);
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(listener);
        return () => this.listeners.get(key).delete(listener);
    }

    // Resolves with the parameters of the next event of a session, or rejects after the timeout.
    waitForEvent(method, sessionId, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                remove();
                reject(new Error('No ' + method + ' event within ' + timeoutMs + ' ms'));
            }, timeoutMs);
            const remove = this.on(method, sessionId, (params) => {
                clearTimeout(timer);
                remove();
                resolve(params);
            });
        });
    }

    // Dispatches a command response to its caller and an event to its listeners.
    onMessage(data) {
        const message = JSON.parse(typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
        if (message.id !== undefined) {
            const entry = this.pending.get(message.id);
            if (!entry) {
                return;
            }
            this.pending.delete(message.id);
            if (message.error) {
                entry.reject(new Error(entry.method + ' failed: ' + message.error.message
                    + (message.error.data ? ' (' + message.error.data + ')' : '')));
            } else {
                entry.resolve(message.result);
            }
            return;
        }
        const listeners = this.listeners.get(DevToolsClient.eventKey(message.method, message.sessionId));
        if (listeners) {
            for (const listener of Array.from(listeners)) {
                listener(message.params);
            }
        }
    }

    // Rejects every command still awaiting a response.
    rejectAll(error) {
        for (const entry of this.pending.values()) {
            entry.reject(error);
        }
        this.pending.clear();
    }

    // Closes the WebSocket.
    close() {
        this.socket.close();
    }

    // Returns the listener key of an event of a session.
    static eventKey(method, sessionId) {
        return method + '|' + (sessionId || '');
    }
}

// Starts chrome-headless-shell, attaches to a new page and enables the Page and Runtime domains at a 1024 x 768 viewport.
async function startBrowser() {
    browser.profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gantt-dom-'));
    const launched = await launchChrome(browser.profileDir);
    browser.process = launched.process;
    browser.exited = launched.exited;
    browser.client = new DevToolsClient(await connectWebSocket(launched.endpoint));

    const { targetId } = await browser.client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.client.send('Target.attachToTarget', { targetId, flatten: true });
    browser.sessionId = sessionId;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',
        { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
}

// Closes the DevTools connection, stops chrome-headless-shell and removes the profile directory.
async function stopBrowser() {
    if (browser.client) {
        browser.client.close();
        browser.client = null;
    }
    if (browser.process) {
        const chrome = browser.process;
        if (chrome.exitCode === null && chrome.signalCode === null) {
            chrome.kill('SIGTERM');
            const stopped = await Promise.race([browser.exited.then(() => true), sleep(CHROME_EXIT_TIMEOUT_MS).then(() => false)]);
            if (!stopped) {
                chrome.kill('SIGKILL');
                await browser.exited;
            }
        }
        browser.process = null;
    }
    if (browser.profileDir) {
        fs.rmSync(browser.profileDir, { recursive: true, force: true });
        browser.profileDir = null;
    }
}

// Sends a DevTools command to the page session.
function send(method, params) {
    return browser.client.send(method, params, browser.sessionId);
}

// Evaluates an expression in the page, awaiting a returned promise, and returns its value; throws with the exception
// text when the evaluation throws.
async function evaluate(expression) {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) {
        const details = response.exceptionDetails;
        const text = details.exception && details.exception.description ? details.exception.description : details.text;
        throw new Error('Page evaluation failed: ' + text + '\nExpression: ' + expression);
    }
    return response.result.value;
}

// Polls a page expression every 20 ms until it is truthy and returns its value; throws with the expression on timeout.
async function waitFor(predicateExpr, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await evaluate(predicateExpr);
        if (value) {
            return value;
        }
        if (Date.now() >= deadline) {
            throw new Error('Timed out after ' + timeoutMs + ' ms waiting for: ' + predicateExpr);
        }
        await sleep(20);
    }
}

// Resolves after the page has rendered two animation frames.
function settle() {
    return evaluate('new Promise(function (resolve) {'
        + ' requestAnimationFrame(function () { requestAnimationFrame(function () { resolve(true); }); }); })');
}

// Navigates to the fixture, renders a board, waits for its refresh answer and for the chart to unblock, rests the
// mouse outside the chart and asserts that the page recorded no error.
async function openBoard(name, overrides) {
    const loaded = browser.client.waitForEvent('Page.loadEventFired', browser.sessionId, PAGE_LOAD_TIMEOUT_MS);
    await send('Page.navigate', { url: FIXTURE_URL });
    await loaded;
    await evaluate('window.__loadBoard(' + JSON.stringify(name) + ', '
        + (overrides === undefined ? 'undefined' : JSON.stringify(overrides)) + ')');
    await waitFor("window.__lastResponseApplied && __lastResponseApplied.eventName === 'refresh'");
    await waitFor(IS_UNBLOCKED_EXPR);
    await hover(PARK_POINT.x, PARK_POINT.y);
    await assertNoPageErrors();
}

// Asserts that window.__pageErrors is empty.
async function assertNoPageErrors() {
    assert.deepEqual(await evaluate('window.__pageErrors'), []);
}

// Dispatches one mouse event and waits for the page to render.
async function mouseEvent(params) {
    await send('Input.dispatchMouseEvent', params);
    await settle();
}

// Presses the left mouse button at a point.
function press(x, y) {
    return mouseEvent({ type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
}

// Moves the mouse with the left button held to a point.
function move(x, y) {
    return mouseEvent({ type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
}

// Releases the left mouse button at a point.
function release(x, y) {
    return mouseEvent({ type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

// Moves the mouse without a held button to a point.
function hover(x, y) {
    return mouseEvent({ type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
}

// Clicks the left mouse button at a point.
async function click(x, y) {
    await hover(x, y);
    await press(x, y);
    await release(x, y);
}

// Presses at a point, moves by each [dx, dy] offset from that point in turn and, unless options.release is false,
// releases at the last position; returns the last position.
async function drag(from, deltas, options = { release: true }) {
    let point = { x: from.x, y: from.y };
    await press(point.x, point.y);
    for (const [dx, dy] of deltas) {
        point = { x: from.x + dx, y: from.y + (dy || 0) };
        await move(point.x, point.y);
    }
    if (options.release !== false) {
        await release(point.x, point.y);
    }
    return point;
}

// Dispatches one touch event and waits for the page to render.
async function touchEvent(type, touchPoints) {
    await send('Input.dispatchTouchEvent', { type, touchPoints });
    await settle();
}

// Starts a touch at a point.
function touchStart(x, y) {
    return touchEvent('touchStart', [{ x, y, id: 1 }]);
}

// Moves the touch to a point.
function touchMove(x, y) {
    return touchEvent('touchMove', [{ x, y, id: 1 }]);
}

// Cancels the touch.
function touchCancel() {
    return touchEvent('touchCancel', []);
}

// Runs touch steps with touch emulation enabled and disables it afterwards.
async function withTouch(steps) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    try {
        await steps();
    } finally {
        await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
}

// Returns the page expression of the element of the Gantt item with an id.
function barExpr(id) {
    return 'document.getElementById(' + JSON.stringify(ITEM_ID_PREFIX + id) + ')';
}

// Page expression of the id-less maintenance bar in the second row.
const MAINTENANCE_BAR_EXPR = "document.querySelectorAll('.rowsContainer .ganttRowElement')[1]"
    + ".querySelector('.ganttItem:not([id])')";

// Returns the viewport rectangle and centre of the element of a page expression; throws when there is no element.
async function elementRect(elementExpr) {
    const rect = await evaluate('(function () { var element = ' + elementExpr + ';'
        + ' if (!element) { return null; }'
        + ' var rect = element.getBoundingClientRect();'
        + ' return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,'
        + ' width: rect.width, height: rect.height,'
        + ' x: rect.left + rect.width / 2, y: rect.top + rect.height / 2}; }())');
    assert.ok(rect, 'No element for ' + elementExpr);
    return rect;
}

// Returns the inline left, top and cursor and the class list of the element of a page expression.
async function elementStyle(elementExpr) {
    const style = await evaluate('(function () { var element = ' + elementExpr + ';'
        + ' if (!element) { return null; }'
        + ' return {left: element.style.left, top: element.style.top, cursor: element.style.cursor,'
        + ' classes: element.className.split(/\\s+/).filter(function (name) { return name.length > 0; })}; }())');
    assert.ok(style, 'No element for ' + elementExpr);
    return style;
}

// Returns the viewport rectangle and centre of the Gantt item with an id.
function barRect(id) {
    return elementRect(barExpr(id));
}

// Returns the inline left, top and cursor and the class list of the Gantt item with an id.
function barStyle(id) {
    return elementStyle(barExpr(id));
}

// Returns the name and viewport rectangle of every row, in display order.
function rowRects() {
    return evaluate('(function () {'
        + ' var names = document.querySelectorAll(".ganttRowNamesConteiner .ganttRowNameElement");'
        + ' return Array.prototype.map.call(document.querySelectorAll(".rowsContainer .ganttRowElement"),'
        + ' function (row, index) { var rect = row.getBoundingClientRect();'
        + ' return {name: names[index] ? names[index].textContent : null,'
        + ' left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom}; }); }())');
}

// Returns the viewport rectangle of the visible client area of the rows scroll pane, scroll bars excluded.
function wrapperRect() {
    return evaluate('(function () { var wrapper = document.querySelector(".rowsContainerWrapper");'
        + ' var rect = wrapper.getBoundingClientRect();'
        + ' return {left: rect.left, top: rect.top, right: rect.left + wrapper.clientWidth,'
        + ' bottom: rect.top + wrapper.clientHeight}; }())');
}

// Page expression of the visibility and body text of the chart tooltip.
const TOOLTIP_STATE_EXPR = '(function () { var tooltip = document.querySelector(".ganttChartTooltip");'
    + ' return {visible: parseFloat(getComputedStyle(tooltip).opacity) > 0 && tooltip.style.top !== "-1000px",'
    + ' text: tooltip.querySelector(".ganttChartTooltipBody").textContent}; }())';

// Returns the visibility and body text of the chart tooltip.
function tooltipState() {
    return evaluate(TOOLTIP_STATE_EXPR);
}

// Waits until the chart tooltip is visible and returns its state.
function waitForVisibleTooltip() {
    return waitFor('(function () { var state = ' + TOOLTIP_STATE_EXPR + '; return state.visible ? state : null; }())');
}

// Returns the recorded moveItem calls, each with its parsed JSON payload.
function moveCalls() {
    return evaluate('window.__calls.filter(function (call) { return call.eventName === "moveItem"; })'
        + '.map(function (call) { return {eventName: call.eventName, component: call.component, args: call.args,'
        + ' payload: JSON.parse(call.args[0])}; })');
}

// Returns the recorded select calls.
function selectCalls() {
    return evaluate('window.__calls.filter(function (call) { return call.eventName === "select"; })');
}

// Returns whether the Gantt component is unblocked and free of blockUI elements.
function isUnblocked() {
    return evaluate(IS_UNBLOCKED_EXPR);
}

// Waits until the moveItem answer is applied when moves are expected, or 100 ms when none is, then asserts the number
// of recorded moveItem calls and returns them.
async function afterDrop(expectedMoveCount) {
    if (expectedMoveCount > 0) {
        await waitFor('window.__calls.filter(function (call) { return call.eventName === "moveItem"; }).length === '
            + expectedMoveCount + ' && window.__lastResponseApplied !== null'
            + ' && window.__lastResponseApplied.eventName === "moveItem" && window.__seq === window.__calls.length');
    } else {
        await sleep(100);
    }
    const calls = await moveCalls();
    assert.equal(calls.length, expectedMoveCount, 'moveItem calls: ' + JSON.stringify(calls));
    return calls;
}

// Asserts that an item is at its pre-drag left and top and has no ganttItemDragging class.
function assertRestored(style, preDrag) {
    assert.equal(style.left, preDrag.left);
    assert.equal(style.top, preDrag.top);
    assert.ok(!style.classes.includes('ganttItemDragging'), 'classes: ' + style.classes.join(' '));
}

// Asserts that an item offers no drag affordance.
function assertNotDraggable(style) {
    assert.ok(!style.classes.includes('ganttItemDraggable'), 'classes: ' + style.classes.join(' '));
    assert.notEqual(style.cursor, 'move');
}


// Asserts that an item offers the drag affordance.
function assertDraggable(style) {
    assert.ok(style.classes.includes('ganttItemDraggable'), 'classes: ' + style.classes.join(' '));
    assert.equal(style.cursor, 'move');
}

// Sets the answer of the next moveItem event in the page.
function setNextMoveResponse(response) {
    return evaluate('window.__nextMoveResponse = ' + JSON.stringify(response) + '; true');
}

// Page expression that is true when the collision box overlay is displayed.
const OVERLAY_VISIBLE_EXPR = '(function () { var overlay = document.querySelector(".collisionInfoBoxOverlay");'
    + ' return !!overlay && getComputedStyle(overlay).display !== "none"; }())';

// Returns whether the element at a viewport point is the element of a page expression or one of its descendants.
function isTopmostAt(elementExpr, point) {
    return evaluate('(function () { var element = ' + elementExpr + ';'
        + ' var hit = document.elementFromPoint(' + point.x + ', ' + point.y + ');'
        + ' return !!element && !!hit && (hit === element || element.contains(hit)); }())');
}

// Returns the horizontal offsets [dx, 0] from step to limit in increments of step, ending exactly at limit.
function horizontalSteps(step, limit) {
    const deltas = [];
    for (let dx = step; dx < limit; dx += step) {
        deltas.push([dx, 0]);
    }
    deltas.push([limit, 0]);
    return deltas;
}

// The 18 DOM cases, each {name, run}.
const CASES = [
    {
        name: 'maintenance bar has no drag affordance and sends nothing',
        run: async () => {
            await openBoard('h1');
            const maintenanceStyle = await elementStyle(MAINTENANCE_BAR_EXPR);
            assertNotDraggable(maintenanceStyle);
            const maintenanceRect = await elementRect(MAINTENANCE_BAR_EXPR);
            await drag(maintenanceRect, horizontalSteps(10, 40));
            await afterDrop(0);
            const maintenanceAfter = await elementStyle(MAINTENANCE_BAR_EXPR);
            assert.equal(maintenanceAfter.left, maintenanceStyle.left);
            assert.equal(maintenanceAfter.top, maintenanceStyle.top);
            await assertNoPageErrors();

            await openBoard('moveDisabled');
            const disabledStyle = await barStyle(7);
            assertNotDraggable(disabledStyle);
            await drag(await barRect(7), horizontalSteps(10, 40));
            await afterDrop(0);
            assertRestored(await barStyle(7), disabledStyle);
            await assertNoPageErrors();
        }
    },
    {
        name: 'drag positions snap to 30-minute steps',
        run: async () => {
            await openBoard('h1');
            const preDrag = await barStyle(7);
            assertDraggable(preDrag);
            const preDragLeft = parseFloat(preDrag.left);
            const rect = await barRect(7);

            await press(rect.x, rect.y);
            for (const [dx] of horizontalSteps(3, 40)) {
                await move(rect.x + dx, rect.y);
                if (dx >= 4) {
                    const style = await barStyle(7);
                    assert.ok(style.classes.includes('ganttItemDragging'), 'classes at +' + dx + ' px: ' + style.classes.join(' '));
                    const steps = (parseFloat(style.left) - preDragLeft) / GRID_STEP_H1_PX;
                    assert.ok(Math.abs(steps - Math.round(steps)) * GRID_STEP_H1_PX <= 0.01,
                        'offset at +' + dx + ' px is ' + (parseFloat(style.left) - preDragLeft) + ' px');
                }
            }
            assert.equal(parseFloat((await barStyle(7)).left) - preDragLeft, 3 * GRID_STEP_H1_PX);
            await release(rect.x + 40, rect.y);

            const calls = await afterDrop(1);
            assert.match(calls[0].payload.dateFrom, /:(00|30):00$/);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 10:30:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'the adjacent slot is reachable at H1 and H3',
        run: async () => {
            for (const [board, dx] of [['h1', 13], ['h3', 5]]) {
                await openBoard(board);
                assertDraggable(await barStyle(7));
                await drag(await barRect(7), [[dx, 0]]);
                const calls = await afterDrop(1);
                assert.equal(calls[0].payload.itemId, 7);
                assert.equal(calls[0].payload.originalDateFrom, '2026-06-01 09:00:00');
                assert.equal(calls[0].payload.dateFrom, '2026-06-01 09:30:00', board + ' +' + dx + ' px');
                await assertNoPageErrors();
            }
        }
    },
    {
        name: 'H6 and D1 bars offer no drag',
        run: async () => {
            for (const board of ['h6', 'd1']) {
                await openBoard(board);
                const preDrag = await barStyle(7);
                assertNotDraggable(preDrag);
                await drag(await barRect(7), horizontalSteps(10, 40));
                await afterDrop(0);
                assertRestored(await barStyle(7), preDrag);
                await assertNoPageErrors();
            }
        }
    },
    {
        name: 'an off-grid bar is selected by a click, restored by a cancel and dropped on the grid',
        run: async () => {
            await openBoard('offGrid');
            const preDrag = await barStyle(8);
            assertDraggable(preDrag);
            assert.equal(preDrag.left, '251.5px');
            const rect = await barRect(8);

            await click(rect.x, rect.y);
            await afterDrop(0);
            assert.equal((await selectCalls()).length, 1);
            assert.ok((await barStyle(8)).classes.includes('ganttItemSelected'));

            await withTouch(async () => {
                await touchStart(rect.x, rect.y);
                await touchMove(rect.x + 20, rect.y);
                const dragging = await barStyle(8);
                assert.ok(dragging.classes.includes('ganttItemDragging'), 'classes: ' + dragging.classes.join(' '));
                assert.notEqual(dragging.left, preDrag.left);
                await touchCancel();
            });
            const cancelled = await barStyle(8);
            assertRestored(cancelled, preDrag);
            assert.equal(cancelled.left, '251.5px');
            await afterDrop(0);

            await drag(await barRect(8), [[13, 0]]);
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.originalDateFrom, '2026-06-01 10:07:00');
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 10:30:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'drop date does not depend on the browser time zone',
        run: async () => {
            const zones = [
                { timezoneId: 'Europe/Warsaw', hourOfGapTime: 3 },
                { timezoneId: 'UTC', hourOfGapTime: 2 }
            ];
            try {
                for (const zone of zones) {
                    await send('Emulation.setTimezoneOverride', { timezoneId: zone.timezoneId });
                    await openBoard('dst');
                    assert.equal(await evaluate('Intl.DateTimeFormat().resolvedOptions().timeZone'), zone.timezoneId);
                    assert.equal(await evaluate('new Date(2026, 2, 29, 2, 30).getHours()'), zone.hourOfGapTime);
                    await drag(await barRect(7), [[10, 0], [25, 0]]);
                    const calls = await afterDrop(1);
                    assert.equal(calls[0].payload.originalDateFrom, '2026-03-29 01:30:00');
                    assert.equal(calls[0].payload.dateFrom, '2026-03-29 02:30:00', zone.timezoneId);
                    await assertNoPageErrors();
                }
            } finally {
                await send('Emulation.setTimezoneOverride', { timezoneId: '' });
            }
        }
    },
    {
        name: "a press near the bar's edge that leaves the bar before 4 px still drags",
        run: async () => {
            await openBoard('h1');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);
            const start = { x: rect.right - 1, y: rect.y };

            await press(start.x, start.y);
            await move(start.x + 2, start.y);
            assert.ok(start.x + 2 >= rect.right, 'pointer at ' + (start.x + 2) + ' is outside the bar ending at ' + rect.right);
            const pending = await barStyle(7);
            assert.ok(!pending.classes.includes('ganttItemDragging'), 'classes: ' + pending.classes.join(' '));
            assert.equal(pending.left, preDrag.left);

            await move(start.x + 13, start.y);
            const active = await barStyle(7);
            assert.ok(active.classes.includes('ganttItemDragging'), 'classes: ' + active.classes.join(' '));
            await release(start.x + 13, start.y);

            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 09:30:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'pointercancel during a pending press and during a drag restores the bar and sends nothing',
        run: async () => {
            await openBoard('h1');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await withTouch(async () => {
                await touchStart(rect.x, rect.y);
                await touchCancel();
            });
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await tooltipState()).visible, false);
            await afterDrop(0);

            await withTouch(async () => {
                await touchStart(rect.x, rect.y);
                await touchMove(rect.x + 20, rect.y);
                const dragging = await barStyle(7);
                assert.ok(dragging.classes.includes('ganttItemDragging'), 'classes: ' + dragging.classes.join(' '));
                assert.equal(dragging.left, (parseFloat(preDrag.left) + 2 * GRID_STEP_H1_PX) + 'px');
                await touchCancel();
            });
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await tooltipState()).visible, false);
            await afterDrop(0);
            await assertNoPageErrors();
        }
    },
    {
        name: 'lostpointercapture without pointerup restores the bar',
        run: async () => {
            await openBoard('h1');
            await evaluate('document.addEventListener("pointerdown", function (event) {'
                + ' window.__lastPointerId = event.pointerId; }, true); true');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await press(rect.x, rect.y);
            await move(rect.x + 20, rect.y);
            const dragging = await barStyle(7);
            assert.ok(dragging.classes.includes('ganttItemDragging'), 'classes: ' + dragging.classes.join(' '));
            assert.equal(typeof await evaluate('window.__lastPointerId'), 'number');

            await evaluate("document.getElementById('window.mainTab.gantt_item_7').releasePointerCapture(window.__lastPointerId)");
            assert.equal(await evaluate(barExpr(7) + '.hasPointerCapture(window.__lastPointerId)'), false);
            // Moves the held pointer by 1 px, at which the browser dispatches the pending lostpointercapture.
            await move(rect.x + 21, rect.y);
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await tooltipState()).visible, false);

            await release(rect.x + 21, rect.y);
            await afterDrop(0);
            assertRestored(await barStyle(7), preDrag);
            await assertNoPageErrors();
        }
    },

    {
        name: 'a press under 4 px selects without dragging',
        run: async () => {
            await openBoard('h1');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await press(rect.x, rect.y);
            await move(rect.x + 3, rect.y);
            const pending = await barStyle(7);
            assert.ok(!pending.classes.includes('ganttItemDragging'), 'classes: ' + pending.classes.join(' '));
            assert.equal(pending.left, preDrag.left);
            await release(rect.x + 3, rect.y);

            await afterDrop(0);
            assert.equal((await selectCalls()).length, 1);
            const selected = await barStyle(7);
            assertRestored(selected, preDrag);
            assert.ok(selected.classes.includes('ganttItemSelected'), 'classes: ' + selected.classes.join(' '));
            await assertNoPageErrors();
        }
    },
    {
        name: 'choosing a fully covered order in the collision box closes it, makes the bar topmost at its centre '
            + '(document.elementFromPoint), and a real drag sends its id',
        run: async () => {
            await openBoard('covered');
            const collisionExpr = "document.querySelector('.ganttCollisionItem')";
            const coveredRect = await barRect(12);
            assert.equal(await isTopmostAt(collisionExpr, coveredRect), true);

            const collisionRect = await elementRect(collisionExpr);
            await click(collisionRect.x, collisionRect.y);
            await waitFor(OVERLAY_VISIBLE_EXPR);

            const entryExpr = 'document.getElementById(' + JSON.stringify(COLLISION_ENTRY_ID_PREFIX + 12) + ')';
            const entryRect = await elementRect(entryExpr);
            await click(entryRect.x, entryRect.y);
            await waitFor('!' + OVERLAY_VISIBLE_EXPR);
            const selected = await barStyle(12);
            assert.ok(selected.classes.includes('ganttItemSelected'), 'classes: ' + selected.classes.join(' '));
            assertDraggable(selected);

            const rect = await barRect(12);
            assert.equal(await isTopmostAt(barExpr(12), rect), true);
            await hover(rect.x, rect.y);
            await drag(rect, [[13, 0]]);
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.itemId, 12);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 10:30:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'the drag tooltip text follows successive targets',
        run: async () => {
            await openBoard('h1');
            const rect = await barRect(7);
            const steps = [
                { dx: 13, dy: 0, date: '2026-06-01 09:30:00', row: 'L1' },
                { dx: 26, dy: 0, date: '2026-06-01 10:00:00', row: 'L1' },
                { dx: 26, dy: ROW_HEIGHT_PX, date: '2026-06-01 10:00:00', row: 'L2' }
            ];

            await press(rect.x, rect.y);
            let previousText = null;
            for (const step of steps) {
                await move(rect.x + step.dx, rect.y + step.dy);
                const state = await waitForVisibleTooltip();
                assert.ok(state.text.includes(step.date), 'tooltip text: ' + state.text);
                assert.ok(state.text.includes(step.row), 'tooltip text: ' + state.text);
                assert.notEqual(state.text, previousText);
                previousText = state.text;
            }
            await release(rect.x + 26, rect.y + ROW_HEIGHT_PX);

            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.row, 'L2');
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 10:00:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'a rejected drop hides the drag tooltip and shows the reason',
        run: async () => {
            await openBoard('h1');
            await setNextMoveResponse({ kind: 'rejected', message: 'Shutdown window E-1' });
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await drag(rect, horizontalSteps(10, 40), { release: false });
            const dragTooltip = await waitForVisibleTooltip();
            assert.ok(dragTooltip.text.includes('2026-06-01 10:30:00'), 'drag tooltip text: ' + dragTooltip.text);
            await release(rect.x + 40, rect.y);

            await afterDrop(1);
            assertRestored(await barStyle(7), preDrag);
            const rejection = await waitForVisibleTooltip();
            assert.ok(rejection.text.includes('Move rejected'), 'tooltip text: ' + rejection.text);
            assert.ok(rejection.text.includes('Shutdown window E-1'), 'tooltip text: ' + rejection.text);
            assert.ok(!rejection.text.includes('2026-06-01 10:30:00'), 'tooltip text: ' + rejection.text);
            await waitFor(IS_UNBLOCKED_EXPR);
            assert.equal(await isUnblocked(), true);
            await assertNoPageErrors();
        }
    },
    {
        name: 'drop resolves the correct row in a scrolled pane',
        run: async () => {
            await openBoard('scrolled');
            const scroll = await evaluate('(function () { var wrapper = document.querySelector(".rowsContainerWrapper");'
                + ' wrapper.scrollTop = 270; wrapper.scrollLeft = 700; wrapper.dispatchEvent(new Event("scroll"));'
                + ' return {top: wrapper.scrollTop, left: wrapper.scrollLeft,'
                + ' namesTop: document.querySelector(".ganttRowNamesConteiner").scrollTop}; }())');
            assert.deepEqual(scroll, { top: 270, left: 700, namesTop: 270 });
            await settle();

            const rect = await barRect(21);
            const wrapper = await wrapperRect();
            assert.ok(rect.left >= wrapper.left && rect.right <= wrapper.right && rect.top >= wrapper.top
                && rect.bottom <= wrapper.bottom, 'bar ' + JSON.stringify(rect) + ' inside ' + JSON.stringify(wrapper));

            await hover(rect.x, rect.y);
            const drop = await drag(rect, [[5, 10], [13, ROW_HEIGHT_PX], [13, 2 * ROW_HEIGHT_PX]]);
            assert.ok(drop.y < wrapper.bottom, 'release point ' + JSON.stringify(drop) + ' inside ' + JSON.stringify(wrapper));
            const rows = await rowRects();
            const targetRow = rows.find((row) => drop.x >= row.left && drop.x < row.right && drop.y >= row.top
                && drop.y < row.bottom);
            assert.ok(targetRow, 'no row contains ' + JSON.stringify(drop));
            assert.equal(targetRow.name, 'L14');

            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.row, targetRow.name);
            assert.equal(calls[0].payload.originalRow, 'L12');
            assert.equal(calls[0].payload.dateFrom, '2026-06-02 10:30:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'drop outside the visible pane snaps back without a request',
        run: async () => {
            await openBoard('h1');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);
            const wrapper = await wrapperRect();

            const namesPoint = { x: wrapper.left - 20, y: rect.y };
            const namesDx = namesPoint.x - rect.x;
            await drag(rect, [[-10, 0], [Math.round(namesDx / 2), 0], [namesDx, 0]]);
            assert.equal(await evaluate('!!document.elementFromPoint(' + namesPoint.x + ', ' + namesPoint.y
                + ').closest(".ganttRowNamesWrapper")'), true);
            assertRestored(await barStyle(7), preDrag);
            await afterDrop(0);

            const belowDy = wrapper.bottom + 20 - rect.y;
            await drag(rect, [[13, 10], [13, Math.round(belowDy / 2)], [13, belowDy]]);
            assertRestored(await barStyle(7), preDrag);
            await afterDrop(0);
            assertRestored(await barStyle(7), preDrag);
            await assertNoPageErrors();
        }
    },
    {
        name: 'row labels with markup render as text',
        run: async () => {
            await openBoard('markupRows');
            const label = await evaluate('(function () {'
                + ' var label = document.querySelector(".ganttRowNamesConteiner .ganttRowNameElement");'
                + ' return {text: label.textContent, hasBold: label.querySelector("b") !== null}; }())');
            assert.equal(label.text, '<b>L&amp;1</b>');
            assert.equal(label.hasBold, false);
            await assertNoPageErrors();
        }
    },
    {
        name: 'a failed request without moveResult snaps back',
        run: async () => {
            await openBoard('h1');
            await setNextMoveResponse({ kind: 'failure' });
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await drag(rect, horizontalSteps(10, 40));
            await afterDrop(1);
            await waitFor('(function () { var bar = ' + barExpr(7) + ';'
                + ' return bar.style.left === ' + JSON.stringify(preDrag.left)
                + ' && bar.style.top === ' + JSON.stringify(preDrag.top)
                + ' && !bar.classList.contains("ganttItemDragging") && ' + IS_UNBLOCKED_EXPR + '; }())');
            assertRestored(await barStyle(7), preDrag);
            assert.equal(await isUnblocked(), true);
            await assertNoPageErrors();
        }
    },
    {
        name: 'an accepted moveResult rebuilds the board',
        run: async () => {
            await openBoard('h1');
            await evaluate('(function () { var board = window.__boardFor("h1");'
                + ' var bar = board.items.filter(function (item) { return item.id === 7; })[0];'
                + ' bar.row = "L2"; bar.from = 10.5; bar.to = 11.5;'
                + ' bar.info.dateFrom = "2026-06-01 10:30:00"; bar.info.dateTo = "2026-06-01 11:30:00";'
                + ' window.__nextMoveResponse = {kind: "accepted", board: board}; return true; }())');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await drag(rect, [[10, 10], [30, 20], [50, ROW_HEIGHT_PX], [65, ROW_HEIGHT_PX]]);
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.row, 'L2');

            await waitFor(IS_UNBLOCKED_EXPR);
            const placement = await evaluate('(function () { var bar = ' + barExpr(7) + ';'
                + ' var rows = document.querySelectorAll(".rowsContainer .ganttRowElement");'
                + ' return {inSecondRow: bar.parentNode === rows[1], left: bar.style.left, top: bar.style.top}; }())');
            assert.equal(placement.inSecondRow, true);
            assert.equal(placement.left, '261.5px');
            assert.notDeepEqual({ left: placement.left, top: placement.top }, { left: preDrag.left, top: preDrag.top });
            const rebuilt = await barStyle(7);
            assert.ok(!rebuilt.classes.includes('ganttItemDragging'), 'classes: ' + rebuilt.classes.join(' '));
            assert.equal(await isUnblocked(), true);
            await assertNoPageErrors();
        }
    }
];

if (CASES.length !== EXPECTED_CASE_COUNT) {
    throw new Error('Expected ' + EXPECTED_CASE_COUNT + ' DOM cases, found ' + CASES.length);
}

before(startBrowser, { timeout: 60000 });
after(stopBrowser, { timeout: 30000 });

// Kills a still running chrome-headless-shell and removes its profile directory when the test process exits.
process.on('exit', () => {
    if (browser.process && browser.process.exitCode === null && browser.process.signalCode === null) {
        browser.process.kill('SIGKILL');
    }
    if (browser.profileDir) {
        fs.rmSync(browser.profileDir, { recursive: true, force: true });
    }
});

for (const c of CASES) {
    test(c.name, { timeout: 30000 }, c.run);
}

