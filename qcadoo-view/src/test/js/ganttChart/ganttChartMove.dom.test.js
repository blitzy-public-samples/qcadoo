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
 * ganttChartMove.dom.html in chrome-headless-shell.
 *
 * Requirements: Node.js v22.23.2, which provides node:test and the global WebSocket, and the Chrome for Testing headless
 * shell 154.0.8037.57 as chrome-headless-shell on PATH. With the toolchain unpacked under /opt/qcadoo-toolchain, run
 * from the repository root:
 *
 *   TC=/opt/qcadoo-toolchain
 *   export PATH=$TC/node-v22.23.2-linux-x64/bin:$TC/chrome-headless-shell-linux64:$PATH
 *   node --test qcadoo/qcadoo-view/src/test/js/ganttChart/ganttChartMove.dom.test.js
 *
 * The runner starts chrome-headless-shell from PATH with a temporary gantt-dom-* profile, drives it over the DevTools
 * Protocol with the global WebSocket, and sends trusted mouse, touch and key input with Input.dispatchMouseEvent,
 * Input.dispatchTouchEvent and Input.dispatchKeyEvent. Before any case is registered it fails on a Node.js older than 22
 * or without the global WebSocket, on a missing fixture and on a case list that differs from EXPECTED_CASE_NAMES. The
 * run fails on a missing chrome-headless-shell, a failed case and a manifest case that did not run, such as one excluded
 * by a name, skip or only filter. SIGINT, SIGTERM and SIGHUP stop chrome-headless-shell, remove its profile and exit
 * with 128 + the signal number.
 */
'use strict';

// Node.js release the runner is pinned to.
const REQUIRED_NODE_VERSION = 'v22.23.2';

// Throws before node:test is loaded unless Node.js is at major version 22 or later and has the global WebSocket; the
// error names the running version and executable and the pinned toolchain directory.
(function assertRuntime() {
    const major = Number(process.versions.node.split('.')[0]);
    const hasWebSocket = typeof WebSocket === 'function';
    if (major >= 22 && hasWebSocket) {
        return;
    }
    throw new Error('ganttChartMove.dom.test.js requires Node.js ' + REQUIRED_NODE_VERSION
        + ' (major 22 or later, with the global WebSocket) but runs on Node.js ' + process.version + ' at '
        + process.execPath + (hasWebSocket ? '' : ', which has no global WebSocket')
        + '; put /opt/qcadoo-toolchain/node-v22.23.2-linux-x64/bin first on PATH');
}());

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const url = require('node:url');

// Executable name of the Chrome for Testing headless shell, resolved from PATH, and its pinned version and toolchain
// directory.
const CHROME_BINARY = 'chrome-headless-shell';
const CHROME_VERSION = '154.0.8037.57';
const CHROME_TOOLCHAIN_DIR = '/opt/qcadoo-toolchain/chrome-headless-shell-linux64';

// Milliseconds allowed for chrome-headless-shell to print its DevTools endpoint.
const CHROME_START_TIMEOUT_MS = 20000;

// Milliseconds allowed for chrome-headless-shell to exit after SIGTERM, and again after SIGKILL.
const CHROME_EXIT_TIMEOUT_MS = 5000;

// Retries, and milliseconds between them, of the removal of a Chrome profile directory whose files are busy.
const PROFILE_REMOVE_RETRIES = 10;
const PROFILE_REMOVE_RETRY_DELAY_MS = 100;

// Signals on which the runner stops chrome-headless-shell, removes its profile and exits with 128 + the signal number.
const TERMINATION_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

// Milliseconds allowed for the DevTools WebSocket to open.
const CONNECT_TIMEOUT_MS = 10000;

// Milliseconds allowed for the response to one DevTools command.
const COMMAND_TIMEOUT_MS = 15000;

// Milliseconds allowed for a page load after Page.navigate.
const PAGE_LOAD_TIMEOUT_MS = 15000;

// Milliseconds allowed for the before hook that starts the browser, for the after hook that waits for a start still in
// progress and stops the browser, and for one case.
const BEFORE_TIMEOUT_MS = 60000;
const AFTER_TIMEOUT_MS = BEFORE_TIMEOUT_MS + 30000;
const CASE_TIMEOUT_MS = 30000;

// Names of the DOM cases; CASES must hold exactly these names, each once, and every one of them must run.
const EXPECTED_CASE_NAMES = Object.freeze([
    'maintenance bar has no drag affordance and sends nothing',
    'drag positions snap to 30-minute steps',
    'the adjacent slot is reachable at H1 and H3',
    'H6 and D1 bars offer no drag',
    'an off-grid bar is selected by a click, restored by a cancel and dropped on the grid',
    'drop date does not depend on the browser time zone',
    "a press near the bar's edge that leaves the bar before 4 px still drags",
    'pointercancel during a pending press and during a drag restores the bar and sends nothing',
    'lostpointercapture without pointerup restores the bar',
    'a press under 4 px selects without dragging',
    'choosing a fully covered order in the collision box closes it, makes the bar topmost at its centre '
        + '(document.elementFromPoint), and a real drag sends its id',
    'the drag tooltip text follows successive targets',
    'a rejected drop hides the drag tooltip and shows the reason',
    'drop resolves the correct row in a scrolled pane',
    'drop outside the visible pane snaps back without a request',
    'row labels with markup render as text',
    'keyboard: a draggable bar is a named, described button that Tab reaches with a visible focus ring, and other bars '
        + 'take no focus',
    'keyboard: arrow keys move the focused bar in 30-minute steps and whole rows within the board, and Enter sends one '
        + 'moveItem',
    'keyboard: Escape, blur, a pointer press and an unchanged Enter cancel a keyboard move without a request, and Enter '
        + 'or Space on an idle bar selects it',
    'keyboard: an accepted keyboard move announces the saved move and moves the focus to the rebuilt bar',
    'pointer: an accepted drop announces the saved move, and a drag ended by pointercancel or by a drop outside the '
        + 'pane announces the cancellation',
    'a selected covered bar at z-index 220 rises to the drag layer (230) and stays topmost while dragged by pointer or '
        + 'moved by keyboard, and so does a focused bar',
    'a failed request without moveResult snaps back',
    'an accepted moveResult rebuilds the board',
    're-rendering the board during a drag cancels it and a later drag moves the new bar',
    'a re-render during a pending move keeps the chart blocked and anchors the rejection at the mounted bar',
    'malformed pointer input is ignored or cancels the press',
    'a late click after a drag is ignored and the next click selects',
    'a content request or loading indicator during a drag abandons the drag before any answer',
    'a re-render that moves the bar during a pending move anchors the rejection at its new place, and a later '
        + 're-render hides the rejection',
    'a click on another bar between a drag and its late click keeps the late click ignored',
    'a non-integral or out-of-range pointer id is ignored while the native pointer is active',
    'a malformed HTTP 200 moveItem reply snaps back through the transport error path',
    'a committed move whose chart cannot be refreshed answers with the error page: the bar returns, the error is shown '
        + 'and no second refresh is sent',
    'an accepted moveResult without a chart restores the bar and leaves the chart and its header unchanged'
]);

// Absolute path and file:// URL of the DOM fixture.
const FIXTURE_PATH = path.join(__dirname, 'ganttChartMove.dom.html');
const FIXTURE_URL = url.pathToFileURL(FIXTURE_PATH).href;

// Viewport of the emulated page, in CSS pixels.
const VIEWPORT = { width: 1024, height: 768 };

// Mouse position outside the 800 x 300 px chart host at which the pointer rests between interactions.
const PARK_POINT = { x: 1000, y: 740 };

// Element id prefix of Gantt items and of collision box entries.
const ITEM_ID_PREFIX = 'window.mainTab.gridLayout.gantt_item_';
const COLLISION_ENTRY_ID_PREFIX = 'window.mainTab.gridLayout.gantt_collisionItem_';

// Element id and component path of the Gantt component, the gantt component of the productionMaintenanceGantt view.
const GANTT_ID = 'window.mainTab.gridLayout.gantt';

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

// Resolves true once a promise settles, fulfilled or rejected, or false after timeoutMs; its timer is cleared either way.
function settlesWithin(promise, timeoutMs) {
    let timer = null;
    const timeout = new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
    });
    return Promise.race([promise.then(() => true, () => true), timeout]).finally(() => clearTimeout(timer));
}

// Starts chrome-headless-shell, passes a spawned process and the promise of its exit to onSpawn at once, and resolves
// with its process, the promise of its exit and its DevTools WebSocket URL.
function launchChrome(profileDir, onSpawn) {
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
        if (chrome.pid !== undefined) {
            onSpawn(chrome, exited);
        }
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            fail(new Error(CHROME_BINARY + ' printed no DevTools endpoint within ' + CHROME_START_TIMEOUT_MS + ' ms: '
                + stderr));
        }, CHROME_START_TIMEOUT_MS);

        // Rejects once; a started process is killed first and the rejection follows its exit, or CHROME_EXIT_TIMEOUT_MS
        // when it has not exited by then.
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
            const killed = isRunning(chrome) ? chrome.kill('SIGKILL') : null;
            settlesWithin(exited, CHROME_EXIT_TIMEOUT_MS).then((gone) => reject(gone ? error
                : new Error(error.message + '; ' + CHROME_BINARY + ' (pid ' + chrome.pid + ') did not exit within '
                    + CHROME_EXIT_TIMEOUT_MS + ' ms of SIGKILL; kill() returned ' + killed)));
        }

        chrome.once('error', (error) => {
            fail(new Error('Cannot start ' + CHROME_BINARY + ' from PATH: ' + error.message + '; put Chrome for Testing '
                + CHROME_VERSION + ' (' + CHROME_TOOLCHAIN_DIR + ') on PATH'));
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

// Opens a WebSocket to a DevTools endpoint and resolves with it once it is open. On an error, a close before open or no
// open within timeoutMs, removes its listeners and timer, closes the socket and rejects naming the endpoint, the failed
// phase and the elapsed milliseconds.
function connectWebSocket(endpoint, timeoutMs = CONNECT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        let socket;
        try {
            socket = new WebSocket(endpoint);
        } catch (error) {
            reject(new Error('Cannot connect to the DevTools endpoint ' + endpoint + ': ' + error.message));
            return;
        }
        const timer = setTimeout(() => fail('no open event within ' + timeoutMs + ' ms'), timeoutMs);

        // Removes the listeners and the timer.
        function detach() {
            clearTimeout(timer);
            socket.removeEventListener('open', onOpen);
            socket.removeEventListener('error', onError);
            socket.removeEventListener('close', onClose);
        }

        // Detaches, closes the socket and rejects with the failed phase.
        function fail(phase) {
            detach();
            socket.close();
            reject(new Error('Cannot connect to the DevTools endpoint ' + endpoint + ': ' + phase + ', '
                + (Date.now() - startedAt) + ' ms after connecting started'));
        }

        // Detaches and resolves with the open socket.
        function onOpen() {
            detach();
            resolve(socket);
        }

        // Fails with the error phase.
        function onError(event) {
            fail('WebSocket error' + (event && event.message ? ' (' + event.message + ')' : ''));
        }

        // Fails with the close code and reason.
        function onClose(event) {
            fail('closed before open (code ' + event.code + (event.reason ? ', reason ' + event.reason : '') + ')');
        }

        socket.addEventListener('open', onOpen);
        socket.addEventListener('error', onError);
        socket.addEventListener('close', onClose);
    });
}

// Minimal DevTools Protocol client over one browser-level WebSocket, with flat sessions.
class DevToolsClient {

    // Wraps a connected WebSocket; each command is allowed commandTimeoutMs for its response.
    constructor(socket, commandTimeoutMs = COMMAND_TIMEOUT_MS) {
        this.socket = socket;
        this.commandTimeoutMs = commandTimeoutMs;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
        this.closedError = null;
        socket.addEventListener('message', (event) => this.onMessage(event.data));
        socket.addEventListener('close', (event) => this.rejectAll(new Error('DevTools WebSocket closed (code '
            + event.code + ')')));
    }

    // Sends a command and resolves with its result. Rejects with its protocol error, with the send failure, when the
    // client is closed or its WebSocket is not open, and when no response arrives within commandTimeoutMs, naming the
    // method, the id and the session. Every outcome removes the pending entry and clears its timer, and a response
    // that arrives after the timeout is ignored.
    send(method, params, sessionId) {
        const id = this.nextId++;
        const message = { id, method, params: params || {} };
        if (sessionId) {
            message.sessionId = sessionId;
        }
        const label = method + ' (id ' + id + (sessionId ? ', session ' + sessionId : '') + ')';
        if (this.closedError) {
            return Promise.reject(new Error('Cannot send ' + label + ': ' + this.closedError.message));
        }
        if (this.socket.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('Cannot send ' + label + ': the DevTools WebSocket is not open (readyState '
                + this.socket.readyState + ')'));
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(label + ' received no response within ' + this.commandTimeoutMs + ' ms'));
            }, this.commandTimeoutMs);
            this.pending.set(id, { method, label, resolve, reject, timer });
            try {
                this.socket.send(JSON.stringify(message));
            } catch (error) {
                clearTimeout(timer);
                this.pending.delete(id);
                reject(new Error('Cannot send ' + label + ': ' + error.message));
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

    // Starts recording the next event of a session and returns {wait, cancel}. wait(timeoutMs) resolves with the
    // parameters of the event, at once when it has already arrived, or rejects when it does not arrive within timeoutMs;
    // cancel removes the listener and the timer and leaves a waiting promise unsettled.
    captureEvent(method, sessionId) {
        let received = null;
        let deliver = null;
        let timer = null;
        const remove = this.on(method, sessionId, (params) => {
            remove();
            if (deliver) {
                clearTimeout(timer);
                deliver(params);
            } else {
                received = { params };
            }
        });
        return {
            wait: (timeoutMs) => new Promise((resolve, reject) => {
                if (received) {
                    resolve(received.params);
                    return;
                }
                deliver = resolve;
                timer = setTimeout(() => {
                    remove();
                    reject(new Error('No ' + method + ' event within ' + timeoutMs + ' ms'));
                }, timeoutMs);
            }),
            cancel: () => {
                remove();
                clearTimeout(timer);
            }
        };
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
            clearTimeout(entry.timer);
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

    // Marks the client closed with an error, clears the timer of every command still awaiting a response and rejects it
    // with the error; later sends reject with the same error.
    rejectAll(error) {
        if (!this.closedError) {
            this.closedError = error;
        }
        for (const entry of this.pending.values()) {
            clearTimeout(entry.timer);
            entry.reject(new Error(entry.label + ': ' + error.message));
        }
        this.pending.clear();
    }

    // Rejects every pending and later command with an error naming the reason, when given, and closes the WebSocket.
    close(reason) {
        this.rejectAll(new Error('DevTools client closed' + (reason ? ': ' + reason : '')));
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
    const launched = await launchChrome(browser.profileDir, (chrome, exited) => {
        browser.process = chrome;
        browser.exited = exited;
    });
    browser.client = new DevToolsClient(await connectWebSocket(launched.endpoint));

    const { targetId } = await browser.client.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.client.send('Target.attachToTarget', { targetId, flatten: true });
    browser.sessionId = sessionId;

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',
        { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
}

// Returns whether a spawned chrome-headless-shell process has not exited.
function isRunning(chrome) {
    return !!chrome && chrome.pid !== undefined && chrome.exitCode === null && chrome.signalCode === null;
}

// Clears the process, exit promise, profile directory, DevTools client and page session of the browser.
function resetBrowser() {
    browser.process = null;
    browser.exited = null;
    browser.profileDir = null;
    browser.client = null;
    browser.sessionId = null;
}

// Removes a profile directory synchronously, retrying while its files are busy; returns the error of a failed removal,
// or null.
function removeProfile(profileDir) {
    if (!profileDir) {
        return null;
    }
    try {
        fs.rmSync(profileDir, {
            recursive: true,
            force: true,
            maxRetries: PROFILE_REMOVE_RETRIES,
            retryDelay: PROFILE_REMOVE_RETRY_DELAY_MS
        });
        return null;
    } catch (error) {
        return new Error('Cannot remove the Chrome profile ' + profileDir + ': ' + error.message);
    }
}

// Sends SIGTERM when graceful and SIGKILL at once otherwise, or when the process has not exited CHROME_EXIT_TIMEOUT_MS
// after SIGTERM; throws, naming the pid and kill()'s result, when it has not exited CHROME_EXIT_TIMEOUT_MS after SIGKILL.
async function stopChrome(chrome, exited, graceful) {
    if (graceful) {
        chrome.kill('SIGTERM');
        if (await settlesWithin(exited, CHROME_EXIT_TIMEOUT_MS)) {
            return;
        }
    }
    const killed = chrome.kill('SIGKILL');
    if (!(await settlesWithin(exited, CHROME_EXIT_TIMEOUT_MS))) {
        throw new Error(CHROME_BINARY + ' (pid ' + chrome.pid + ') did not exit within ' + CHROME_EXIT_TIMEOUT_MS
            + ' ms of SIGKILL' + (graceful ? ', sent ' + CHROME_EXIT_TIMEOUT_MS + ' ms after SIGTERM' : '')
            + '; kill() returned ' + killed);
    }
}

// Closes the DevTools client with a reason, stops a running chrome-headless-shell with stopChrome, then resets the
// browser fields and removes the profile directory whatever the outcome; throws the stop failure and the removal
// failure, each when present.
async function terminateBrowser(graceful, reason) {
    const { client, process: chrome, exited, profileDir } = browser;
    const failures = [];
    try {
        if (client) {
            client.close(reason);
        }
        if (isRunning(chrome)) {
            await stopChrome(chrome, exited, graceful);
        }
    } catch (error) {
        failures.push(error);
    } finally {
        resetBrowser();
        const removeError = removeProfile(profileDir);
        if (removeError) {
            failures.push(removeError);
        }
    }
    throwFailures(failures);
}

// Closes the DevTools client with a reason, sends SIGKILL to a running chrome-headless-shell, resets the browser fields
// and removes the profile directory synchronously; returns the error of a failed removal, or null.
function terminateBrowserSync(reason) {
    const { client, process: chrome, profileDir } = browser;
    if (client) {
        client.close(reason);
    }
    if (isRunning(chrome)) {
        chrome.kill('SIGKILL');
    }
    resetBrowser();
    return removeProfile(profileDir);
}

// Closes the DevTools connection, stops chrome-headless-shell with SIGTERM, and SIGKILL when needed, and removes the
// profile directory.
function stopBrowser() {
    return terminateBrowser(true, 'the browser is stopping');
}

// Sends a DevTools command to the page session; rejects when no DevTools client is connected.
function send(method, params) {
    if (!browser.client) {
        return Promise.reject(new Error('Cannot send ' + method + ': no DevTools client is connected'));
    }
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

// Navigates the page to a URL and waits up to PAGE_LOAD_TIMEOUT_MS after the navigation response for its load event.
// Cancels the load waiter and throws with the URL when Page.navigate rejects or answers with an errorText.
async function navigate(targetUrl) {
    if (!browser.client) {
        throw new Error('Cannot navigate to ' + targetUrl + ': no DevTools client is connected');
    }
    const loaded = browser.client.captureEvent('Page.loadEventFired', browser.sessionId);
    let response;
    try {
        response = await send('Page.navigate', { url: targetUrl });
    } catch (error) {
        loaded.cancel();
        throw new Error('Page.navigate to ' + targetUrl + ' failed: ' + error.message, { cause: error });
    }
    if (response && response.errorText) {
        loaded.cancel();
        throw new Error('Page.navigate to ' + targetUrl + ' failed: ' + response.errorText);
    }
    try {
        await loaded.wait(PAGE_LOAD_TIMEOUT_MS);
    } catch (error) {
        throw new Error('Page ' + targetUrl + ' did not load: ' + error.message, { cause: error });
    }
}

// Navigates to the fixture, renders a board, waits for its refresh answer and for the chart to unblock, asserts that
// the component path is GANTT_ID and that every recorded call, the refresh included, names GANTT_ID, rests the mouse
// outside the chart and asserts that the page recorded no error.
async function openBoard(name, overrides) {
    await navigate(FIXTURE_URL);
    await evaluate('window.__loadBoard(' + JSON.stringify(name) + ', '
        + (overrides === undefined ? 'undefined' : JSON.stringify(overrides)) + ')');
    await waitFor("window.__lastResponseApplied && __lastResponseApplied.eventName === 'refresh'");
    await waitFor(IS_UNBLOCKED_EXPR);
    assert.equal(await evaluate('window.__gantt.elementPath'), GANTT_ID);
    const calls = await evaluate('window.__calls.map(function (call) {'
        + ' return {eventName: call.eventName, component: call.component}; })');
    assert.ok(calls.some((call) => call.eventName === 'refresh'), 'recorded calls: ' + JSON.stringify(calls));
    for (const call of calls) {
        assert.equal(call.component, GANTT_ID, 'component of ' + call.eventName + ': ' + JSON.stringify(calls));
    }
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
// of recorded moveItem calls and that each names GANTT_ID, and returns them.
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
    for (const call of calls) {
        assert.equal(call.component, GANTT_ID, 'moveItem component: ' + JSON.stringify(calls));
    }
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

// Keyboard help and move announcement translations of the component options, as GanttChartComponentPattern delivers
// them; "{0}" in the help stands for the grid step in minutes.
const MOVE_A11Y_TRANSLATIONS = Object.freeze({
    'move.keyboardHelp': 'Press Enter or Space to select this item. Press an arrow key to move it by {0} minutes or by'
        + ' one row, then press Enter to confirm the move or Escape to cancel it.',
    'move.acceptedAnnouncement': 'Move saved. The chart shows the updated schedule.',
    'move.cancelledAnnouncement': 'Move cancelled. The item is back at its original place.'
});

// openBoard overrides that add MOVE_A11Y_TRANSLATIONS to the component options.
const A11Y_OVERRIDES = Object.freeze({ options: { translations: MOVE_A11Y_TRANSLATIONS } });

// Keyboard help text of a board with the 30-minute grid.
const KEYBOARD_HELP_30 = MOVE_A11Y_TRANSLATIONS['move.keyboardHelp'].replace('{0}', '30');

// Page expressions of the polite status and the assertive alert live regions of the chart.
const STATUS_REGION_EXPR = "document.querySelector('#ganttHost .ganttChartLiveRegion[role=status]')";
const ALERT_REGION_EXPR = "document.querySelector('#ganttHost .ganttChartLiveRegion[role=alert]')";

// Tab presses after which a case gives up reaching an element with the keyboard.
const MAX_TAB_PRESSES = 40;

// DevTools key definitions of the keys the keyboard cases press: key, code and Windows virtual key code, and for keys
// that insert text, the text of their keyDown event.
const KEY_DEFINITIONS = Object.freeze({
    Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
    Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
    Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
    Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }
});

// Presses and releases a key of KEY_DEFINITIONS with Input.dispatchKeyEvent, a keyDown with text for a key that inserts
// text and a rawKeyDown for any other key, followed by a keyUp, then waits for the page to render.
async function keyPress(name) {
    const definition = KEY_DEFINITIONS[name];
    assert.ok(definition, 'No key definition for ' + name);
    const params = {
        key: definition.key,
        code: definition.code,
        windowsVirtualKeyCode: definition.keyCode,
        nativeVirtualKeyCode: definition.keyCode
    };
    if (definition.text !== undefined) {
        await send('Input.dispatchKeyEvent',
            { ...params, type: 'keyDown', text: definition.text, unmodifiedText: definition.text });
    } else {
        await send('Input.dispatchKeyEvent', { ...params, type: 'rawKeyDown' });
    }
    await send('Input.dispatchKeyEvent', { ...params, type: 'keyUp' });
    await settle();
}

// Presses a key of KEY_DEFINITIONS the given number of times.
async function keyPresses(name, count) {
    for (let i = 0; i < count; i++) {
        await keyPress(name);
    }
}

// Runs steps with focus emulation enabled, under which the page keeps the focus of an active window, and disables it
// afterwards.
async function withFocus(steps) {
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    try {
        await steps();
    } finally {
        await send('Emulation.setFocusEmulationEnabled', { enabled: false });
    }
}

// Returns the tabindex, role, aria-label and aria-describedby attributes of the element of a page expression, each null
// when absent; throws when there is no element.
async function a11yAttributes(elementExpr) {
    const attributes = await evaluate('(function () { var element = ' + elementExpr + ';'
        + ' if (!element) { return null; }'
        + ' return {tabindex: element.getAttribute("tabindex"), role: element.getAttribute("role"),'
        + ' label: element.getAttribute("aria-label"), describedBy: element.getAttribute("aria-describedby")}; }())');
    assert.ok(attributes, 'No element for ' + elementExpr);
    return attributes;
}

// Returns the text content of the element of a page expression, or null when there is no element.
function elementText(elementExpr) {
    return evaluate('(function () { var element = ' + elementExpr + ';'
        + ' return element ? element.textContent : null; }())');
}

// Returns whether the element of a page expression is document.activeElement.
function isFocused(elementExpr) {
    return evaluate('(function () { var element = ' + elementExpr + ';'
        + ' return !!element && document.activeElement === element; }())');
}

// Focuses the element of a page expression with focus() and asserts that it has the focus.
async function focusElement(elementExpr) {
    await evaluate('(function () { var element = ' + elementExpr + '; if (element) { element.focus(); } return true; }())');
    await settle();
    assert.equal(await isFocused(elementExpr), true, 'focus on ' + elementExpr);
}

// Returns the computed z-index and outline of the element of a page expression and whether it matches :focus-visible.
async function focusStyle(elementExpr) {
    const style = await evaluate('(function () { var element = ' + elementExpr + ';'
        + ' if (!element) { return null; }'
        + ' var computed = getComputedStyle(element);'
        + ' return {zIndex: computed.zIndex, outlineStyle: computed.outlineStyle, outlineWidth: computed.outlineWidth,'
        + ' outlineColor: computed.outlineColor, outlineOffset: computed.outlineOffset,'
        + ' focusVisible: element.matches(":focus-visible")}; }())');
    assert.ok(style, 'No element for ' + elementExpr);
    return style;
}

// Returns the names of the recorded events in call order.
function eventNames() {
    return evaluate('window.__calls.map(function (call) { return call.eventName; })');
}

// Page expression of a short description of document.activeElement: its tag name, then its id when it has one.
const ACTIVE_ELEMENT_EXPR = '(function () { var element = document.activeElement;'
    + ' return element ? element.tagName + (element.id ? "#" + element.id : "") : "none"; }())';

// The DOM cases, each {name, run}; EXPECTED_CASE_NAMES lists their names.
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
            const computedStyle = () => evaluate('(function () { var style = getComputedStyle(' + barExpr(7) + ');'
                + ' return {touchAction: style.touchAction, zIndex: style.zIndex, opacity: style.opacity}; }())');
            const preDrag = await barStyle(7);
            assertDraggable(preDrag);
            assert.equal((await computedStyle()).touchAction, 'none');
            const preDragLeft = parseFloat(preDrag.left);
            const rect = await barRect(7);

            await press(rect.x, rect.y);
            for (const [dx] of horizontalSteps(3, 40)) {
                await move(rect.x + dx, rect.y);
                if (dx >= 4) {
                    const style = await barStyle(7);
                    assert.ok(style.classes.includes('ganttItemDragging'), 'classes at +' + dx + ' px: ' + style.classes.join(' '));
                    assert.ok(!style.classes.includes('ganttItemSelected'),
                        'classes at +' + dx + ' px: ' + style.classes.join(' '));
                    const computed = await computedStyle();
                    assert.equal(computed.zIndex, '230', 'z-index at +' + dx + ' px');
                    assert.equal(computed.opacity, '0.8', 'opacity at +' + dx + ' px');
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

            await evaluate('document.getElementById(' + JSON.stringify(ITEM_ID_PREFIX + 7) + ')'
                + '.releasePointerCapture(window.__lastPointerId)');
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

            const preDrag = await barStyle(7);
            assertDraggable(preDrag);
            const rect = await barRect(7);
            const target = { x: rect.x + 13, y: rect.y - ROW_HEIGHT_PX };
            await press(rect.x, rect.y);
            await move(rect.x + 5, rect.y - 5);
            await move(target.x, target.y);
            const targetRow = (await rowRects()).find((row) => target.x >= row.left && target.x < row.right
                && target.y >= row.top && target.y < row.bottom);
            assert.ok(targetRow, 'no row contains ' + JSON.stringify(target));
            assert.equal(targetRow.name, '<b>L&amp;1</b>');
            const dragging = await barStyle(7);
            assert.ok(dragging.classes.includes('ganttItemDragging'), 'classes: ' + dragging.classes.join(' '));

            const dragTooltip = await waitForVisibleTooltip();
            assert.ok(dragTooltip.text.includes('<b>L&amp;1</b>'), 'drag tooltip text: ' + dragTooltip.text);
            assert.ok(dragTooltip.text.includes('2026-06-01 09:30:00'), 'drag tooltip text: ' + dragTooltip.text);
            const tooltipBody = await evaluate('(function () {'
                + ' var body = document.querySelector(".ganttChartTooltip .ganttChartTooltipBody");'
                + ' var name = body.querySelector(".ganttItemDescriptionName");'
                + ' return {hasBold: body.querySelector("b") !== null, name: name ? name.textContent : null}; }())');
            assert.equal(tooltipBody.hasBold, false);
            assert.equal(tooltipBody.name, '<b>L&amp;1</b>');

            await move(rect.x, rect.y);
            await release(rect.x, rect.y);
            assert.equal((await tooltipState()).visible, false);
            await afterDrop(0);
            assertRestored(await barStyle(7), preDrag);
            assert.deepEqual(await evaluate('window.__calls.map(function (call) { return call.eventName; })'), ['refresh']);
            await assertNoPageErrors();
        }
    },
    {
        name: 'keyboard: a draggable bar is a named, described button that Tab reaches with a visible focus ring, and other bars '
            + 'take no focus',
        run: async () => {
            const helpExpr = 'document.getElementById(' + JSON.stringify(GANTT_ID + '_moveHelp') + ')';
            const helpStateExpr = '(function () { var help = ' + helpExpr + ';'
                + ' if (!help) { return null; }'
                + ' var computed = getComputedStyle(help);'
                + ' return {text: help.textContent, className: help.className, parentId: help.parentNode.id,'
                + ' position: computed.position, width: computed.width, height: computed.height,'
                + ' overflow: computed.overflow, clip: computed.clip,'
                + ' count: document.querySelectorAll("#ganttHost .ganttChartVisuallyHidden").length}; }())';
            const noAttributes = { tabindex: null, role: null, label: null, describedBy: null };
            await withFocus(async () => {
                await openBoard('h1', A11Y_OVERRIDES);
                const attributes = await a11yAttributes(barExpr(7));
                assert.equal(attributes.tabindex, '0');
                assert.equal(attributes.role, 'button');
                assert.equal(attributes.label, 'ORD-7, L1, Start 2026-06-01 09:00:00, End 2026-06-01 10:00:00');
                assert.equal(attributes.describedBy, GANTT_ID + '_moveHelp');
                const help = await evaluate(helpStateExpr);
                assert.deepEqual(help, {
                    text: KEYBOARD_HELP_30,
                    className: 'ganttChartVisuallyHidden',
                    parentId: GANTT_ID,
                    position: 'absolute',
                    width: '1px',
                    height: '1px',
                    overflow: 'hidden',
                    clip: 'rect(0px, 0px, 0px, 0px)',
                    count: 1
                });
                assert.deepEqual(await a11yAttributes(MAINTENANCE_BAR_EXPR), noAttributes);

                await evaluate('(function () { if (document.activeElement) { document.activeElement.blur(); }'
                    + ' return true; }())');
                const visited = [];
                let reached = false;
                for (let i = 0; i < MAX_TAB_PRESSES && !reached; i++) {
                    await keyPress('Tab');
                    visited.push(await evaluate(ACTIVE_ELEMENT_EXPR));
                    reached = await isFocused(barExpr(7));
                }
                assert.ok(reached, 'bar 7 not reached by Tab; focus order: ' + visited.join(' > '));
                assert.deepEqual(await focusStyle(barExpr(7)), {
                    zIndex: '220',
                    outlineStyle: 'solid',
                    outlineWidth: '2px',
                    outlineColor: 'rgb(0, 0, 0)',
                    outlineOffset: '-2px',
                    focusVisible: true
                });
                const focused = await barStyle(7);
                assert.ok(!focused.classes.includes('ganttItemDragging'), 'classes: ' + focused.classes.join(' '));
                assert.deepEqual(await eventNames(), ['refresh']);

                await evaluate('(function () { var board = window.__boardFor("h1");'
                    + ' var bar = board.items.filter(function (item) { return item.id === 7; })[0];'
                    + ' bar.info.name = "&lt;b&gt;ORD&amp;7&lt;/b&gt;"; bar.info.tooltip.header = bar.info.name;'
                    + ' window.__currentBoard = board; return true; }())');
                const seqBefore = await evaluate('window.__seq');
                await evaluate('window.__gantt.performInitialize(); true');
                await waitFor('window.__seq > ' + seqBefore + ' && window.__lastResponseApplied.eventName === "refresh"');
                await waitFor(IS_UNBLOCKED_EXPR);
                const decoded = await a11yAttributes(barExpr(7));
                assert.equal(decoded.label, '<b>ORD&7</b>, L1, Start 2026-06-01 09:00:00, End 2026-06-01 10:00:00');
                assert.equal(decoded.describedBy, GANTT_ID + '_moveHelp');
                assert.equal(await evaluate(barExpr(7) + '.querySelector("b") === null'), true);
                assert.deepEqual(await evaluate(helpStateExpr), help);

                await openBoard('h6', A11Y_OVERRIDES);
                assert.deepEqual(await a11yAttributes(barExpr(7)), noAttributes, 'h6 bar 7');

                await openBoard('moveDisabled', A11Y_OVERRIDES);
                assert.deepEqual(await a11yAttributes(barExpr(7)), noAttributes, 'moveDisabled bar 7');
                assert.deepEqual(await a11yAttributes(MAINTENANCE_BAR_EXPR), noAttributes, 'moveDisabled maintenance bar');
                assert.equal(await evaluate(helpExpr + ' === null'), true, 'keyboard help without item moves');
                assert.equal(await evaluate('document.querySelectorAll("#ganttHost .ganttChartVisuallyHidden,'
                    + ' #ganttHost .ganttChartLiveRegion").length'), 0);
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'keyboard: arrow keys move the focused bar in 30-minute steps and whole rows within the board, and Enter sends one '
            + 'moveItem',
        run: async () => {
            // Asserts the left and top of bar 7, its ganttItemDragging class and the text of the status live region.
            const assertKeyboardTarget = async (left, top, statusText) => {
                const style = await barStyle(7);
                assert.equal(style.left, left, 'left for ' + statusText);
                assert.equal(style.top, top, 'top for ' + statusText);
                assert.ok(style.classes.includes('ganttItemDragging'), 'classes: ' + style.classes.join(' '));
                assert.equal(await elementText(STATUS_REGION_EXPR), statusText);
            };
            await withFocus(async () => {
                await openBoard('h1', A11Y_OVERRIDES);
                const preDrag = await barStyle(7);
                const preDragLeft = parseFloat(preDrag.left);
                await focusElement(barExpr(7));

                await keyPresses('ArrowRight', 2);
                await assertKeyboardTarget((preDragLeft + 2 * GRID_STEP_H1_PX) + 'px', '1px', 'L1 Start 2026-06-01 10:00:00');
                const tooltip = await waitForVisibleTooltip();
                assert.ok(tooltip.text.includes('2026-06-01 10:00:00'), 'tooltip text: ' + tooltip.text);
                assert.ok(tooltip.text.includes('L1'), 'tooltip text: ' + tooltip.text);
                const tooltipTop = await evaluate('parseFloat(document.querySelector(".ganttChartTooltip").style.top)');
                assert.ok(Math.abs(tooltipTop - ((await barRect(7)).bottom + 20)) <= 1, 'tooltip top ' + tooltipTop);

                await keyPress('ArrowDown');
                await assertKeyboardTarget((preDragLeft + 2 * GRID_STEP_H1_PX) + 'px', '31px', 'L2 Start 2026-06-01 10:00:00');
                await keyPresses('ArrowDown', 2);
                await assertKeyboardTarget((preDragLeft + 2 * GRID_STEP_H1_PX) + 'px', '61px', 'L3 Start 2026-06-01 10:00:00');
                await keyPresses('ArrowUp', 3);
                await assertKeyboardTarget((preDragLeft + 2 * GRID_STEP_H1_PX) + 'px', '1px', 'L1 Start 2026-06-01 10:00:00');
                await keyPress('ArrowDown');
                await assertKeyboardTarget((preDragLeft + 2 * GRID_STEP_H1_PX) + 'px', '31px', 'L2 Start 2026-06-01 10:00:00');
                assert.deepEqual(await eventNames(), ['refresh']);

                await keyPress('Enter');
                const calls = await afterDrop(1);
                assert.equal(calls[0].component, GANTT_ID);
                assert.equal(calls[0].args.length, 1);
                assert.deepEqual(calls[0].payload, {
                    itemId: 7,
                    row: 'L2',
                    dateFrom: '2026-06-01 10:00:00',
                    originalRow: 'L1',
                    originalName: 'ORD-7',
                    originalDateFrom: '2026-06-01 09:00:00',
                    originalDateTo: '2026-06-01 10:00:00'
                });
                assertRestored(await barStyle(7), preDrag);
                assert.equal(await isFocused(barExpr(7)), true, 'focus after the rejection');
                const rejection = await waitForVisibleTooltip();
                assert.ok(rejection.text.includes('Move rejected'), 'tooltip text: ' + rejection.text);
                const alertText = await elementText(ALERT_REGION_EXPR);
                assert.ok(alertText.includes('Move rejected'), 'alert region: ' + alertText);
                assert.ok(alertText.includes('Rejected by fixture'), 'alert region: ' + alertText);
                await waitFor(IS_UNBLOCKED_EXPR);

                await keyPress('Escape');
                assert.equal((await tooltipState()).visible, false, 'rejection tooltip after Escape');
                assertRestored(await barStyle(7), preDrag);

                await keyPresses('ArrowLeft', 18);
                await assertKeyboardTarget((preDragLeft - 18 * GRID_STEP_H1_PX) + 'px', '1px', 'L1 Start 2026-06-01 00:00:00');
                await keyPress('ArrowLeft');
                await assertKeyboardTarget((preDragLeft - 18 * GRID_STEP_H1_PX) + 'px', '1px', 'L1 Start 2026-06-01 00:00:00');
                await keyPress('Escape');
                assertRestored(await barStyle(7), preDrag);

                await keyPresses('ArrowRight', 29);
                await assertKeyboardTarget((preDragLeft + 29 * GRID_STEP_H1_PX) + 'px', '1px', 'L1 Start 2026-06-01 23:30:00');
                await keyPress('ArrowRight');
                await assertKeyboardTarget((preDragLeft + 29 * GRID_STEP_H1_PX) + 'px', '1px', 'L1 Start 2026-06-01 23:30:00');
                await keyPress('Escape');
                assertRestored(await barStyle(7), preDrag);
                await afterDrop(1);
                assert.deepEqual(await eventNames(), ['refresh', 'moveItem']);

                await evaluate('(function () { var board = window.__boardFor("h1");'
                    + ' var bar = board.items.filter(function (item) { return item.id === 7; })[0];'
                    + ' bar.from = -1; bar.to = 0.5;'
                    + ' bar.info.dateFrom = "2026-05-31 23:00:00"; bar.info.dateTo = "2026-06-01 00:30:00";'
                    + ' window.__currentBoard = board; return true; }())');
                const seqBefore = await evaluate('window.__seq');
                await evaluate('window.__gantt.performInitialize(); true');
                await waitFor('window.__seq > ' + seqBefore + ' && window.__lastResponseApplied.eventName === "refresh"');
                await waitFor(IS_UNBLOCKED_EXPR);
                const early = await barStyle(7);
                assert.equal(early.left, '-26px');
                const statusBefore = await elementText(STATUS_REGION_EXPR);
                await focusElement(barExpr(7));
                await keyPress('ArrowLeft');
                const refused = await barStyle(7);
                assertRestored(refused, early);
                assert.equal(await elementText(STATUS_REGION_EXPR), statusBefore, 'status after a refused first step');
                await keyPress('ArrowRight');
                await assertKeyboardTarget((-26 + GRID_STEP_H1_PX) + 'px', '1px', 'L1 Start 2026-05-31 23:30:00');
                await keyPress('Escape');
                assertRestored(await barStyle(7), early);
                assert.deepEqual(await eventNames(), ['refresh', 'moveItem', 'refresh']);

                await openBoard('offGrid', A11Y_OVERRIDES);
                const offGrid = await barStyle(8);
                await focusElement(barExpr(8));
                await keyPress('ArrowLeft');
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L1 Start 2026-06-01 09:30:00');
                await keyPress('Escape');
                assertRestored(await barStyle(8), offGrid);
                await keyPress('ArrowRight');
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L1 Start 2026-06-01 10:30:00');
                await keyPress('Enter');
                const offGridCalls = await afterDrop(1);
                assert.equal(offGridCalls[0].payload.originalDateFrom, '2026-06-01 10:07:00');
                assert.equal(offGridCalls[0].payload.dateFrom, '2026-06-01 10:30:00');
                assertRestored(await barStyle(8), offGrid);
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'keyboard: Escape, blur, a pointer press and an unchanged Enter cancel a keyboard move without a request, and Enter '
            + 'or Space on an idle bar selects it',
        run: async () => {
            const cancelledText = MOVE_A11Y_TRANSLATIONS['move.cancelledAnnouncement'];
            await withFocus(async () => {
                await openBoard('h1', A11Y_OVERRIDES);
                const preDrag = await barStyle(7);
                // Asserts that bar 7 is back at its pre-drag place, the tooltip is hidden and the status live region
                // holds the cancellation.
                const assertCancelled = async (label) => {
                    assertRestored(await barStyle(7), preDrag);
                    assert.equal((await tooltipState()).visible, false, 'tooltip after ' + label);
                    assert.equal(await elementText(STATUS_REGION_EXPR), cancelledText, 'status after ' + label);
                };
                await focusElement(barExpr(7));

                await keyPress('ArrowRight');
                assert.ok((await barStyle(7)).classes.includes('ganttItemDragging'));
                await waitForVisibleTooltip();
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L1 Start 2026-06-01 09:30:00');
                await keyPress('Escape');
                await assertCancelled('Escape');
                assert.equal(await isFocused(barExpr(7)), true, 'focus after Escape');

                await keyPress('ArrowRight');
                assert.ok((await barStyle(7)).classes.includes('ganttItemDragging'));
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L1 Start 2026-06-01 09:30:00');
                await keyPress('Tab');
                assert.equal(await isFocused(barExpr(7)), false, 'focus after Tab');
                await assertCancelled('blur');

                await focusElement(barExpr(7));
                await keyPress('ArrowRight');
                await keyPress('ArrowLeft');
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L1 Start 2026-06-01 09:00:00');
                await keyPress('Enter');
                await assertCancelled('an unchanged Enter');
                await keyPress('ArrowDown');
                await keyPress('ArrowUp');
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L1 Start 2026-06-01 09:00:00');
                await keyPress('Space');
                await assertCancelled('an unchanged Space');
                assert.equal((await selectCalls()).length, 0, 'select calls after the cancels');

                await keyPress('Enter');
                await afterDrop(0);
                assert.equal((await selectCalls()).length, 1, 'select calls after Enter');
                const selected = await barStyle(7);
                assert.ok(selected.classes.includes('ganttItemSelected'), 'classes: ' + selected.classes.join(' '));
                assertRestored(selected, preDrag);
                await keyPress('Space');
                await afterDrop(0);
                assert.equal((await selectCalls()).length, 2, 'select calls after Space');

                await keyPress('ArrowRight');
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L1 Start 2026-06-01 09:30:00');
                const moved = await barRect(7);
                const pressPoint = { x: moved.left + 5, y: moved.y };
                await press(pressPoint.x, pressPoint.y);
                await assertCancelled('a pointer press');
                await release(pressPoint.x, pressPoint.y);
                await afterDrop(0);
                assertRestored(await barStyle(7), preDrag);
                assert.equal((await selectCalls()).length, 3, 'select calls after the pointer click');
                assert.deepEqual(await eventNames(), ['refresh', 'select', 'select', 'select']);
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'keyboard: an accepted keyboard move announces the saved move and moves the focus to the rebuilt bar',
        run: async () => {
            await withFocus(async () => {
                await openBoard('h1', A11Y_OVERRIDES);
                await evaluate('(function () { var board = window.__boardFor("h1");'
                    + ' var bar = board.items.filter(function (item) { return item.id === 7; })[0];'
                    + ' bar.row = "L2"; bar.from = 10; bar.to = 11;'
                    + ' bar.info.dateFrom = "2026-06-01 10:00:00"; bar.info.dateTo = "2026-06-01 11:00:00";'
                    + ' window.__nextMoveResponse = {kind: "accepted", board: board};'
                    + ' ' + barExpr(7) + '.__renderedBeforeMove = true; return true; }())');
                await focusElement(barExpr(7));
                await keyPresses('ArrowRight', 2);
                await keyPress('ArrowDown');
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L2 Start 2026-06-01 10:00:00');

                await keyPress('Enter');
                const calls = await afterDrop(1);
                assert.equal(calls[0].payload.itemId, 7);
                assert.equal(calls[0].payload.row, 'L2');
                assert.equal(calls[0].payload.dateFrom, '2026-06-01 10:00:00');
                await waitFor(IS_UNBLOCKED_EXPR);

                const rebuilt = await evaluate('(function () { var bar = ' + barExpr(7) + ';'
                    + ' var rows = document.querySelectorAll(".rowsContainer .ganttRowElement");'
                    + ' return {rebuilt: bar.__renderedBeforeMove !== true, inSecondRow: bar.parentNode === rows[1],'
                    + ' left: bar.style.left, top: bar.style.top, focused: document.activeElement === bar,'
                    + ' focusVisible: bar.matches(":focus-visible"), tabindex: bar.getAttribute("tabindex"),'
                    + ' label: bar.getAttribute("aria-label")}; }())');
                assert.deepEqual(rebuilt, {
                    rebuilt: true,
                    inSecondRow: true,
                    left: '249px',
                    top: '1px',
                    focused: true,
                    focusVisible: true,
                    tabindex: '0',
                    label: 'ORD-7, L2, Start 2026-06-01 10:00:00, End 2026-06-01 11:00:00'
                });
                assert.equal(await elementText(STATUS_REGION_EXPR), MOVE_A11Y_TRANSLATIONS['move.acceptedAnnouncement']);
                assert.equal(await elementText(ALERT_REGION_EXPR), '');
                assert.equal((await tooltipState()).visible, false);
                assert.ok(!(await barStyle(7)).classes.includes('ganttItemDragging'));
                await sleep(300);
                assert.deepEqual(await eventNames(), ['refresh', 'moveItem']);
                assert.equal(await isFocused(barExpr(7)), true, 'focus 300 ms after the answer');
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'pointer: an accepted drop announces the saved move, and a drag ended by pointercancel or by a drop outside the '
            + 'pane announces the cancellation',
        run: async () => {
            const acceptedText = MOVE_A11Y_TRANSLATIONS['move.acceptedAnnouncement'];
            const cancelledText = MOVE_A11Y_TRANSLATIONS['move.cancelledAnnouncement'];
            await openBoard('h1', A11Y_OVERRIDES);
            await evaluate('(function () { var board = window.__boardFor("h1");'
                + ' var bar = board.items.filter(function (item) { return item.id === 7; })[0];'
                + ' bar.row = "L2"; bar.from = 10.5; bar.to = 11.5;'
                + ' bar.info.dateFrom = "2026-06-01 10:30:00"; bar.info.dateTo = "2026-06-01 11:30:00";'
                + ' window.__nextMoveResponse = {kind: "accepted", board: board, hold: true}; return true; }())');
            const original = await barRect(7);
            const drop = await drag(original, [[10, 10], [25, 20], [40, ROW_HEIGHT_PX]], { release: false });
            assert.equal(await elementText(STATUS_REGION_EXPR), 'L2 Start 2026-06-01 10:30:00');
            await release(drop.x, drop.y);
            await waitFor('window.__calls.filter(function (call) { return call.eventName === "moveItem"; }).length === 1');
            assert.equal(await elementText(STATUS_REGION_EXPR), '', 'status while the move is pending');
            assert.equal(await evaluate('window.__releaseHeldMove()'), true);
            await afterDrop(1);
            await waitFor(IS_UNBLOCKED_EXPR);
            assert.equal(await elementText(STATUS_REGION_EXPR), acceptedText);
            assert.equal(await isFocused(barExpr(7)), false, 'focus after the accepted pointer drop');

            const preDrag = await barStyle(7);
            const rect = await barRect(7);
            await hover(PARK_POINT.x, PARK_POINT.y);
            await withTouch(async () => {
                await touchStart(rect.x, rect.y);
                await touchCancel();
            });
            assertRestored(await barStyle(7), preDrag);
            assert.equal(await elementText(STATUS_REGION_EXPR), acceptedText, 'status after a cancelled pending press');

            await withTouch(async () => {
                await touchStart(rect.x, rect.y);
                await touchMove(rect.x + 20, rect.y);
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L2 Start 2026-06-01 11:30:00');
                await touchCancel();
            });
            assertRestored(await barStyle(7), preDrag);
            assert.equal(await elementText(STATUS_REGION_EXPR), cancelledText, 'status after pointercancel');

            const wrapper = await wrapperRect();
            const namesDx = wrapper.left - 20 - rect.x;
            const outside = await drag(rect, [[-10, 0], [Math.round(namesDx / 2), 0], [namesDx, 0]], { release: false });
            assert.notEqual(await elementText(STATUS_REGION_EXPR), cancelledText, 'status during the drag');
            await release(outside.x, outside.y);
            assertRestored(await barStyle(7), preDrag);
            assert.equal(await elementText(STATUS_REGION_EXPR), cancelledText, 'status after the drop outside the pane');
            await afterDrop(1);
            assert.deepEqual(await eventNames(), ['refresh', 'moveItem']);
            await assertNoPageErrors();
        }
    },
    {
        name: 'a selected covered bar at z-index 220 rises to the drag layer (230) and stays topmost while dragged by pointer or '
            + 'moved by keyboard, and so does a focused bar',
        run: async () => {
            // Returns the computed z-index of the Gantt item with an id.
            const zIndex = (id) => evaluate('getComputedStyle(' + barExpr(id) + ').zIndex');
            // Asserts that the Gantt item with an id has the ganttItemDragging class and every other given class, computes
            // z-index 230 and is the element at the centre of its rectangle.
            const assertOnDragLayer = async (id, classes, label) => {
                const style = await barStyle(id);
                for (const name of ['ganttItemDragging'].concat(classes)) {
                    assert.ok(style.classes.includes(name), label + ' classes: ' + style.classes.join(' '));
                }
                assert.equal(await zIndex(id), '230', label + ' z-index');
                assert.equal(await isTopmostAt(barExpr(id), await barRect(id)), true, label + ' topmost at its centre');
            };
            await withFocus(async () => {
                await openBoard('covered', A11Y_OVERRIDES);
                const collisionRect = await elementRect("document.querySelector('.ganttCollisionItem')");
                await click(collisionRect.x, collisionRect.y);
                await waitFor(OVERLAY_VISIBLE_EXPR);
                const entryRect = await elementRect('document.getElementById('
                    + JSON.stringify(COLLISION_ENTRY_ID_PREFIX + 12) + ')');
                await click(entryRect.x, entryRect.y);
                await waitFor('!' + OVERLAY_VISIBLE_EXPR);
                const preDrag = await barStyle(12);
                assert.ok(preDrag.classes.includes('ganttItemSelected'), 'classes: ' + preDrag.classes.join(' '));
                assert.equal(await zIndex(12), '220', 'selected bar z-index');

                const rect = await barRect(12);
                await press(rect.x, rect.y);
                await move(rect.x + 13, rect.y);
                await assertOnDragLayer(12, ['ganttItemSelected'], 'pointer-dragged selected bar');
                await move(rect.x, rect.y);
                await release(rect.x, rect.y);
                await afterDrop(0);
                assertRestored(await barStyle(12), preDrag);
                assert.equal(await zIndex(12), '220', 'selected bar z-index after the release');

                await focusElement(barExpr(12));
                assert.equal(await zIndex(12), '220', 'focused selected bar z-index');
                await keyPress('ArrowRight');
                await assertOnDragLayer(12, ['ganttItemSelected'], 'keyboard-moved selected bar');
                await keyPress('Escape');
                assertRestored(await barStyle(12), preDrag);
                assert.equal(await zIndex(12), '220', 'selected bar z-index after Escape');

                const coveringPreDrag = await barStyle(11);
                assert.ok(!coveringPreDrag.classes.includes('ganttItemSelected'));
                await focusElement(barExpr(11));
                assert.equal(await zIndex(11), '220', 'focused bar z-index');
                await keyPress('ArrowRight');
                await assertOnDragLayer(11, [], 'keyboard-moved focused bar');
                await keyPress('Escape');
                assertRestored(await barStyle(11), coveringPreDrag);
                await afterDrop(0);
            });
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
            const accepted = await evaluate('(function () { var board = window.__boardFor("h1");'
                + ' var bar = board.items.filter(function (item) { return item.id === 7; })[0];'
                + ' bar.row = "L2"; bar.from = 10.5; bar.to = 11.5;'
                + ' bar.info.dateFrom = "2026-06-01 10:30:00"; bar.info.dateTo = "2026-06-01 11:30:00";'
                + ' window.__nextMoveResponse = {kind: "accepted", board: board};'
                + ' return {row: bar.row, dateFrom: bar.info.dateFrom, dateTo: bar.info.dateTo}; }())');
            // Records bar 7, the answer count and the event names right after an accepted moveResult is applied.
            await evaluate('(function () { var gantt = window.__gantt; var setValue = gantt.setValue;'
                + ' window.__acceptedSnapshot = null;'
                + ' gantt.setValue = function (value) { var result = setValue.apply(this, arguments);'
                + ' if (value && value.content && value.content.moveResult && value.content.moveResult.accepted === true) {'
                + ' var bar = ' + barExpr(7) + ';'
                + ' var rows = Array.prototype.slice.call(document.querySelectorAll(".rowsContainer .ganttRowElement"));'
                + ' window.__acceptedSnapshot = {rowIndex: bar ? rows.indexOf(bar.parentNode) : -1,'
                + ' left: bar ? bar.style.left : null, top: bar ? bar.style.top : null,'
                + ' classes: bar ? bar.className.split(/\\s+/).filter(function (name) { return name.length > 0; }) : [],'
                + ' seq: window.__seq, eventNames: window.__calls.map(function (call) { return call.eventName; })}; }'
                + ' return result; }; return true; }())');
            const wallClockMinutes = (text) => {
                const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
                assert.ok(match, 'not a wall-clock date: ' + text);
                return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]),
                    Number(match[5]), Number(match[6])) / 60000;
            };
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await drag(rect, [[10, 10], [25, 20], [40, ROW_HEIGHT_PX]]);
            const calls = await afterDrop(1);
            const payload = calls[0].payload;
            assert.equal(payload.itemId, 7);
            assert.equal(payload.originalRow, 'L1');
            assert.equal(payload.row, 'L2');
            assert.equal(payload.row, accepted.row);
            assert.equal(payload.dateFrom, '2026-06-01 10:30:00');
            assert.equal(payload.dateFrom, accepted.dateFrom);
            const originalDuration = wallClockMinutes(payload.originalDateTo) - wallClockMinutes(payload.originalDateFrom);
            assert.equal(originalDuration, 60);
            assert.equal(wallClockMinutes(accepted.dateTo) - wallClockMinutes(accepted.dateFrom), originalDuration);

            const snapshot = await evaluate('window.__acceptedSnapshot');
            assert.ok(snapshot, 'no accepted moveResult was applied');
            assert.deepEqual(snapshot.eventNames, ['refresh', 'moveItem']);
            assert.equal(snapshot.seq, 1);
            assert.equal(snapshot.rowIndex, 1);
            assert.equal(snapshot.left, '261.5px');
            assert.equal(snapshot.top, '1px');
            assert.ok(!snapshot.classes.includes('ganttItemDragging'), 'classes: ' + snapshot.classes.join(' '));

            await waitFor(IS_UNBLOCKED_EXPR);
            await sleep(500);
            assert.deepEqual(await evaluate('window.__calls.map(function (call) { return call.eventName; })'),
                ['refresh', 'moveItem']);
            assert.equal(await evaluate('window.__seq'), 2);
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
    },
    {
        name: 're-rendering the board during a drag cancels it and a later drag moves the new bar',
        run: async () => {
            await openBoard('h1');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await press(rect.x, rect.y);
            await move(rect.x + 20, rect.y);
            const dragging = await barStyle(7);
            assert.ok(dragging.classes.includes('ganttItemDragging'), 'classes: ' + dragging.classes.join(' '));
            await waitForVisibleTooltip();

            const seqBeforeRefresh = await evaluate('window.__seq');
            await evaluate('window.__gantt.performInitialize(); true');
            await waitFor('window.__seq > ' + seqBeforeRefresh
                + ' && window.__lastResponseApplied.eventName === "refresh"');
            await waitFor(IS_UNBLOCKED_EXPR);
            assert.equal((await tooltipState()).visible, false, 'drag tooltip after the re-render');
            assertRestored(await barStyle(7), preDrag);

            await move(rect.x + 30, rect.y);
            await release(rect.x + 30, rect.y);
            await afterDrop(0);
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await tooltipState()).visible, false, 'tooltip after the release');

            await drag(await barRect(7), [[13, 0]]);
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.itemId, 7);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 09:30:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'a re-render during a pending move keeps the chart blocked and anchors the rejection at the mounted bar',
        run: async () => {
            const isBlockedExpr = '!!jQuery(document.getElementById(' + JSON.stringify(GANTT_ID) + '))'
                + '.data("blockUI.isBlocked")';
            await openBoard('h1');
            await setNextMoveResponse({ kind: 'rejected', message: 'Shutdown window E-1', hold: true });
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await drag(rect, horizontalSteps(10, 40));
            await waitFor('window.__calls.filter(function (call) { return call.eventName === "moveItem"; })'
                + '.length === 1');
            assert.equal(await evaluate(isBlockedExpr), true, 'blocked while the move is pending');

            const seqBeforeRefresh = await evaluate('window.__seq');
            await evaluate('window.__gantt.performInitialize(); true');
            await waitFor('window.__seq > ' + seqBeforeRefresh
                + ' && window.__lastResponseApplied.eventName === "refresh"');
            await settle();
            assert.equal(await evaluate(isBlockedExpr), true, 'blocked after the re-render');
            await evaluate('window.__gantt.setComponentLoading(false); true');
            assert.equal(await evaluate(isBlockedExpr), true, 'blocked after setComponentLoading(false)');

            assert.equal(await evaluate('window.__releaseHeldMove()'), true);
            await afterDrop(1);
            assertRestored(await barStyle(7), preDrag);
            const rejection = await waitForVisibleTooltip();
            assert.ok(rejection.text.includes('Move rejected'), 'tooltip text: ' + rejection.text);
            assert.ok(rejection.text.includes('Shutdown window E-1'), 'tooltip text: ' + rejection.text);

            const mounted = await barRect(7);
            const anchor = await evaluate('(function () { var tooltip = document.querySelector(".ganttChartTooltip");'
                + ' return {x: parseFloat(tooltip.style.left) + jQuery(tooltip).width() / 2,'
                + ' top: parseFloat(tooltip.style.top)}; }())');
            assert.ok(Math.abs(anchor.x - mounted.x) <= 1,
                'tooltip anchor x ' + anchor.x + ', mounted bar centre ' + mounted.x);
            assert.ok(Math.abs(anchor.top - (mounted.bottom + 20)) <= 1,
                'tooltip top ' + anchor.top + ', mounted bar bottom ' + mounted.bottom);

            await waitFor(IS_UNBLOCKED_EXPR);
            assert.equal(await isUnblocked(), true);
            await assertNoPageErrors();
        }
    },
    {
        name: 'malformed pointer input is ignored or cancels the press',
        run: async () => {
            await openBoard('h1');
            await evaluate('document.addEventListener("pointerdown", function (event) {'
                + ' window.__lastPointerId = event.pointerId; }, true); true');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);
            // Triggers a jQuery event on bar 7 whose originalEvent is the given object literal; returns the text of a
            // thrown error, or null.
            const trigger = (type, originalEvent) => evaluate('(function () { try {'
                + ' jQuery(' + barExpr(7) + ').trigger(jQuery.Event(' + JSON.stringify(type) + ', {originalEvent: '
                + originalEvent + '})); return null; } catch (error) { return String(error); } }())');

            await press(rect.x, rect.y);
            assert.equal(typeof await evaluate('window.__lastPointerId'), 'number');
            assert.equal(await trigger('pointermove',
                '{pointerId: window.__lastPointerId, clientX: NaN, clientY: NaN}'), null);
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await tooltipState()).visible, false, 'tooltip after the malformed pointermove');
            for (const [dx] of horizontalSteps(5, 10)) {
                await move(rect.x + dx, rect.y);
            }
            assertRestored(await barStyle(7), preDrag);
            await release(rect.x + 10, rect.y);
            await afterDrop(0);
            assertRestored(await barStyle(7), preDrag);

            await press(rect.x, rect.y);
            await move(rect.x + 20, rect.y);
            const dragging = await barStyle(7);
            assert.ok(dragging.classes.includes('ganttItemDragging'), 'classes: ' + dragging.classes.join(' '));
            assert.equal(await trigger('pointerup', '{pointerId: window.__lastPointerId, clientX: Infinity, clientY: '
                + rect.y + '}'), null);
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await tooltipState()).visible, false, 'tooltip after the malformed pointerup');
            await release(rect.x + 20, rect.y);
            await afterDrop(0);
            assertRestored(await barStyle(7), preDrag);

            const malformedPresses = [
                '{pointerId: NaN, button: 0, clientX: ' + rect.x + ', clientY: ' + rect.y + '}',
                '{pointerId: "1", button: 0, clientX: ' + rect.x + ', clientY: ' + rect.y + '}',
                '{pointerId: 987654, button: 0, clientX: ' + rect.x + ', clientY: ' + rect.y + '}',
                '{pointerId: 1, button: 0, clientX: NaN, clientY: ' + rect.y + '}',
                '{pointerId: 1, button: 0, clientX: ' + rect.x + ', clientY: Infinity}',
                // Well-formed press of the mouse pointer while no button is held, which the bar cannot capture.
                '{pointerId: window.__lastPointerId, button: 0, clientX: ' + rect.x + ', clientY: ' + rect.y + '}'
            ];
            for (const originalEvent of malformedPresses) {
                assert.equal(await trigger('pointerdown', originalEvent), null, 'pointerdown ' + originalEvent);
                assert.equal(await trigger('pointermove', '{pointerId: window.__lastPointerId, clientX: ' + (rect.x + 20)
                    + ', clientY: ' + rect.y + '}'), null, 'pointermove after ' + originalEvent);
                assertRestored(await barStyle(7), preDrag);
            }
            await assertNoPageErrors();

            await drag(await barRect(7), [[13, 0]]);
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.itemId, 7);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 09:30:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'a late click after a drag is ignored and the next click selects',
        run: async () => {
            await openBoard('h1');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await withTouch(async () => {
                await touchStart(rect.x, rect.y);
                await touchMove(rect.x + 20, rect.y);
                const dragging = await barStyle(7);
                assert.ok(dragging.classes.includes('ganttItemDragging'), 'classes: ' + dragging.classes.join(' '));
                await touchMove(rect.x, rect.y);
                await touchEvent('touchEnd', []);
            });
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await selectCalls()).length, 0, 'select calls after the drag');

            await sleep(50);
            await evaluate(barExpr(7) + '.click(); true');
            await afterDrop(0);
            assert.equal((await selectCalls()).length, 0, 'select calls after the late click');
            const afterLateClick = await barStyle(7);
            assert.ok(!afterLateClick.classes.includes('ganttItemSelected'),
                'classes: ' + afterLateClick.classes.join(' '));

            await click(rect.x, rect.y);
            await afterDrop(0);
            assert.equal((await selectCalls()).length, 1, 'select calls after the next click');
            const selected = await barStyle(7);
            assertRestored(selected, preDrag);
            assert.ok(selected.classes.includes('ganttItemSelected'), 'classes: ' + selected.classes.join(' '));
            await assertNoPageErrors();
        }
    },
    {
        name: 'a content request or loading indicator during a drag abandons the drag before any answer',
        run: async () => {
            await openBoard('h1');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);
            // Runs a page call and, in the same page task, returns the state of bar 7 and of the tooltip.
            const stateAfter = (call) => evaluate('(function () { var bar = ' + barExpr(7) + '; ' + call + ';'
                + ' var tooltip = document.querySelector(".ganttChartTooltip");'
                + ' return {connected: document.documentElement.contains(bar),'
                + ' dragging: bar.classList.contains("ganttItemDragging"), left: bar.style.left, top: bar.style.top,'
                + ' tooltipVisible: parseFloat(getComputedStyle(tooltip).opacity) > 0'
                + ' && tooltip.style.top !== "-1000px"}; }())');
            const calls = [
                { expr: 'window.__gantt.performInitialize()', refresh: true },
                { expr: 'window.__gantt.onDateChanged()', refresh: true },
                { expr: 'window.__gantt.setComponentLoading(true)', refresh: false }
            ];

            for (const call of calls) {
                await press(rect.x, rect.y);
                await move(rect.x + 20, rect.y);
                const dragging = await barStyle(7);
                assert.ok(dragging.classes.includes('ganttItemDragging'), call.expr + ' classes: ' + dragging.classes.join(' '));
                await waitForVisibleTooltip();

                const seqBefore = await evaluate('window.__seq');
                const state = await stateAfter(call.expr);
                assert.equal(state.connected, true, call.expr + ': bar still rendered');
                assert.equal(state.dragging, false, call.expr + ': dragging class');
                assert.equal(state.left, preDrag.left, call.expr + ': left');
                assert.equal(state.top, preDrag.top, call.expr + ': top');
                assert.equal(state.tooltipVisible, false, call.expr + ': tooltip');

                if (call.refresh) {
                    await waitFor('window.__seq > ' + seqBefore + ' && window.__lastResponseApplied.eventName === "refresh"');
                } else {
                    await evaluate('window.__gantt.setComponentLoading(false); true');
                }
                await waitFor(IS_UNBLOCKED_EXPR);
                await move(rect.x + 30, rect.y);
                await release(rect.x + 30, rect.y);
                await afterDrop(0);
                assertRestored(await barStyle(7), preDrag);
                await hover(PARK_POINT.x, PARK_POINT.y);
            }

            await drag(await barRect(7), [[13, 0]]);
            const moves = await afterDrop(1);
            assert.equal(moves[0].payload.itemId, 7);
            assert.equal(moves[0].payload.dateFrom, '2026-06-01 09:30:00');
            await assertNoPageErrors();
        }
    },
    {
        name: 'a re-render that moves the bar during a pending move anchors the rejection at its new place, and a later '
            + 're-render hides the rejection',
        run: async () => {
            const isBlockedExpr = '!!jQuery(document.getElementById(' + JSON.stringify(GANTT_ID) + '))'
                + '.data("blockUI.isBlocked")';
            await openBoard('h1');
            await setNextMoveResponse({ kind: 'rejected', message: 'Shutdown window E-1', hold: true });
            const preDrag = await barStyle(7);

            await drag(await barRect(7), horizontalSteps(10, 40));
            await waitFor('window.__calls.filter(function (call) { return call.eventName === "moveItem"; })'
                + '.length === 1');
            await hover(PARK_POINT.x, PARK_POINT.y);

            await evaluate('(function () { var board = window.__boardFor("h1");'
                + ' var bar = board.items.filter(function (item) { return item.id === 7; })[0];'
                + ' bar.from = 11; bar.to = 12;'
                + ' bar.info.dateFrom = "2026-06-01 11:00:00"; bar.info.dateTo = "2026-06-01 12:00:00";'
                + ' window.__currentBoard = board; return true; }())');
            let seqBefore = await evaluate('window.__seq');
            await evaluate('window.__gantt.performInitialize(); true');
            await waitFor('window.__seq > ' + seqBefore + ' && window.__lastResponseApplied.eventName === "refresh"');
            const moved = await barStyle(7);
            assert.notEqual(moved.left, preDrag.left, 'left after the re-render');
            assert.equal(await evaluate(isBlockedExpr), true, 'blocked after the re-render');

            assert.equal(await evaluate('window.__releaseHeldMove()'), true);
            await afterDrop(1);
            const rejected = await barStyle(7);
            assertRestored(rejected, moved);
            const rejection = await waitForVisibleTooltip();
            assert.ok(rejection.text.includes('Move rejected'), 'tooltip text: ' + rejection.text);
            assert.ok(rejection.text.includes('Shutdown window E-1'), 'tooltip text: ' + rejection.text);
            const mounted = await barRect(7);
            const anchor = await evaluate('(function () { var tooltip = document.querySelector(".ganttChartTooltip");'
                + ' return {x: parseFloat(tooltip.style.left) + jQuery(tooltip).width() / 2,'
                + ' top: parseFloat(tooltip.style.top)}; }())');
            assert.ok(Math.abs(anchor.x - mounted.x) <= 1,
                'tooltip anchor x ' + anchor.x + ', mounted bar centre ' + mounted.x);
            assert.ok(Math.abs(anchor.top - (mounted.bottom + 20)) <= 1,
                'tooltip top ' + anchor.top + ', mounted bar bottom ' + mounted.bottom);
            await waitFor(IS_UNBLOCKED_EXPR);

            await evaluate('window.__currentBoard = window.__boardFor("h1"); true');
            seqBefore = await evaluate('window.__seq');
            await evaluate('window.__gantt.performInitialize(); true');
            await waitFor('window.__seq > ' + seqBefore + ' && window.__lastResponseApplied.eventName === "refresh"');
            assert.equal((await tooltipState()).visible, false, 'rejection tooltip after the later re-render');
            assertRestored(await barStyle(7), preDrag);
            await waitFor(IS_UNBLOCKED_EXPR);
            await assertNoPageErrors();
        }
    },
    {
        name: 'a click on another bar between a drag and its late click keeps the late click ignored',
        run: async () => {
            await openBoard('h1');
            await evaluate('(function () { var board = window.__boardFor("h1");'
                + ' var extra = JSON.parse(JSON.stringify(board.items.filter(function (item) { return item.id === 7; })[0]));'
                + ' extra.id = 9; extra.row = "L3"; extra.info.name = "ORD-9"; extra.info.tooltip.header = "ORD-9";'
                + ' board.items.push(extra); window.__currentBoard = board; return true; }())');
            const seqBefore = await evaluate('window.__seq');
            await evaluate('window.__gantt.performInitialize(); true');
            await waitFor('window.__seq > ' + seqBefore + ' && window.__lastResponseApplied.eventName === "refresh"');
            await waitFor(IS_UNBLOCKED_EXPR);
            const preDrag = await barStyle(7);
            const rect7 = await barRect(7);
            const rect9 = await barRect(9);

            await withTouch(async () => {
                await touchStart(rect7.x, rect7.y);
                await touchMove(rect7.x + 20, rect7.y);
                const dragging = await barStyle(7);
                assert.ok(dragging.classes.includes('ganttItemDragging'), 'classes: ' + dragging.classes.join(' '));
                await touchMove(rect7.x, rect7.y);
                await touchEvent('touchEnd', []);
            });
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await selectCalls()).length, 0, 'select calls after the drag');

            await click(rect9.x, rect9.y);
            await afterDrop(0);
            assert.equal((await selectCalls()).length, 1, 'select calls after the click on bar 9');
            assert.ok((await barStyle(9)).classes.includes('ganttItemSelected'), 'bar 9 selected');

            await evaluate(barExpr(7) + '.click(); true');
            await afterDrop(0);
            assert.equal((await selectCalls()).length, 1, 'select calls after the late click on bar 7');
            assert.ok(!(await barStyle(7)).classes.includes('ganttItemSelected'), 'bar 7 not selected');

            await click(rect7.x, rect7.y);
            await afterDrop(0);
            assert.equal((await selectCalls()).length, 2, 'select calls after the next click on bar 7');
            assert.ok((await barStyle(7)).classes.includes('ganttItemSelected'), 'bar 7 selected');
            await assertNoPageErrors();
        }
    },
    {
        name: 'a non-integral or out-of-range pointer id is ignored while the native pointer is active',
        run: async () => {
            await openBoard('h1');
            await evaluate('document.addEventListener("pointerdown", function (event) {'
                + ' window.__lastPointerId = event.pointerId; }, true); true');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);
            const rows = await rowRects();
            const emptyPoint = { x: rows[2].left + 50, y: (rows[2].top + rows[2].bottom) / 2 };
            // Triggers a jQuery pointerdown on bar 7 whose originalEvent carries the given pointer id expression;
            // returns the text of a thrown error, or null.
            const triggerPress = (pointerIdExpr) => evaluate('(function () { try {'
                + ' jQuery(' + barExpr(7) + ').trigger(jQuery.Event("pointerdown", {originalEvent: {pointerId: '
                + pointerIdExpr + ', button: 0, clientX: ' + rect.x + ', clientY: ' + rect.y + '}}));'
                + ' return null; } catch (error) { return String(error); } }())');

            for (const pointerIdExpr of ['window.__lastPointerId + 0.5', 'window.__lastPointerId + 4294967296']) {
                await press(emptyPoint.x, emptyPoint.y);
                assert.equal(typeof await evaluate('window.__lastPointerId'), 'number');
                assert.equal(await triggerPress(pointerIdExpr), null, 'pointerdown with id ' + pointerIdExpr);
                assert.equal(await evaluate(barExpr(7) + '.hasPointerCapture(window.__lastPointerId)'), false,
                    'capture after the pointerdown with id ' + pointerIdExpr);
                await move(emptyPoint.x + 5, emptyPoint.y);
                await release(emptyPoint.x + 5, emptyPoint.y);
                await afterDrop(0);
                assertRestored(await barStyle(7), preDrag);
            }

            await drag(await barRect(7), [[13, 0]]);
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.itemId, 7);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 09:30:00');
            await assertNoPageErrors();
        }

    },
    {
        name: 'a malformed HTTP 200 moveItem reply snaps back through the transport error path',
        run: async () => {
            await openBoard('h1');
            await setNextMoveResponse({ kind: 'httpReply', status: 200, body: 'not-json' });
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await drag(rect, horizontalSteps(10, 40));
            const calls = await afterDrop(1);
            await waitFor('(function () { var bar = ' + barExpr(7) + ';'
                + ' return bar.style.left === ' + JSON.stringify(preDrag.left)
                + ' && bar.style.top === ' + JSON.stringify(preDrag.top)
                + ' && !bar.classList.contains("ganttItemDragging") && ' + IS_UNBLOCKED_EXPR + '; }())');
            assertRestored(await barStyle(7), preDrag);
            assert.equal(await isUnblocked(), true);

            const requests = await evaluate('window.__httpRequests');
            assert.equal(requests.length, 1, 'HTTP requests: ' + JSON.stringify(requests));
            assert.equal(requests[0].method, 'POST');
            assert.equal(requests[0].url, '/page/cmmsMachineParts/productionMaintenanceGantt.html');
            assert.equal(requests[0].async, true);
            assert.equal(requests[0].headers['Content-Type'], 'application/json; charset=utf-8');
            const requestBody = JSON.parse(requests[0].body);
            assert.equal(requestBody.event.name, 'moveItem');
            assert.deepEqual(requestBody.event.args, calls[0].args);
            assert.deepEqual(await evaluate('window.__messages'),
                [{ type: 'failure', content: 'connection error: parsererror' }]);
            assert.deepEqual(await evaluate('window.__headerButtonCalls'), ['block', 'unblock']);
            await assertNoPageErrors();

            // A null next response answers the next moveItem with the fixture's default response.
            await setNextMoveResponse(null);
            await drag(await barRect(7), horizontalSteps(10, 40));
            const nextCalls = await afterDrop(2);
            assert.equal(nextCalls[1].payload.itemId, 7);
            await waitFor(IS_UNBLOCKED_EXPR);
            assert.equal((await evaluate('window.__httpRequests')).length, 1);
            await assertNoPageErrors();
        }
    },
    {
        name: 'a committed move whose chart cannot be refreshed answers with the error page: the bar returns, the '
            + 'error is shown and no second refresh is sent',
        run: async () => {
            // Message of the framework error page, as QCDConnector.showErrorMessage passes it to showMessage.
            const errorPageMessage = {
                title: 'An error occurred in the system',
                content: 'An error has occurred in the system. Please contact us or, if you are using the OS version, '
                    + 'see the logs.',
                type: 'failure'
            };
            await openBoard('h1');
            await setNextMoveResponse({ kind: 'serverError' });
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await drag(rect, horizontalSteps(10, 40));
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.itemId, 7);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 10:30:00');
            await waitFor('(function () { var bar = ' + barExpr(7) + ';'
                + ' return bar.style.left === ' + JSON.stringify(preDrag.left)
                + ' && bar.style.top === ' + JSON.stringify(preDrag.top)
                + ' && !bar.classList.contains("ganttItemDragging") && ' + IS_UNBLOCKED_EXPR + '; }())');
            assertRestored(await barStyle(7), preDrag);
            assert.deepEqual(await evaluate('window.__messages'), [errorPageMessage]);
            assert.equal((await tooltipState()).visible, false);

            await sleep(500);
            assert.deepEqual(await evaluate('window.__calls.map(function (call) { return call.eventName; })'),
                ['refresh', 'moveItem']);
            assert.deepEqual(await evaluate('window.__messages'), [errorPageMessage]);
            assert.equal(await isUnblocked(), true);
            await assertNoPageErrors();
        }
    },
    {
        name: 'an accepted moveResult without a chart restores the bar and leaves the chart and its header unchanged',
        run: async () => {
            const headerParametersExpr = 'window.__gantt.getComponentValue().headerParameters';
            const rowNames = async () => (await rowRects()).map((row) => row.name);
            await openBoard('h1');
            await setNextMoveResponse({ kind: 'acceptedWithoutBoard' });
            const headerBefore = await evaluate(headerParametersExpr);
            assert.equal(headerBefore.scale, 'H1');
            assert.ok(typeof headerBefore.dateFrom === 'string' && headerBefore.dateFrom.length > 0,
                'header dateFrom: ' + JSON.stringify(headerBefore.dateFrom));
            assert.ok(typeof headerBefore.dateTo === 'string' && headerBefore.dateTo.length > 0,
                'header dateTo: ' + JSON.stringify(headerBefore.dateTo));
            const rowsBefore = await rowNames();
            assert.deepEqual(rowsBefore, ['L1', 'L2', 'L3']);
            // Marks the rendered element of bar 7, which a rebuilt chart replaces.
            await evaluate(barExpr(7) + '.__renderedBeforeMove = true; true');
            const preDrag = await barStyle(7);
            const rect = await barRect(7);

            await drag(rect, horizontalSteps(10, 40));
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.itemId, 7);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 10:30:00');
            await waitFor('(function () { var bar = ' + barExpr(7) + ';'
                + ' return bar.style.left === ' + JSON.stringify(preDrag.left)
                + ' && bar.style.top === ' + JSON.stringify(preDrag.top)
                + ' && !bar.classList.contains("ganttItemDragging") && ' + IS_UNBLOCKED_EXPR + '; }())');
            assertRestored(await barStyle(7), preDrag);
            assert.equal(await evaluate(barExpr(7) + '.__renderedBeforeMove === true'), true, 'bar 7 re-rendered');
            assert.deepEqual(await evaluate(headerParametersExpr), headerBefore);
            assert.deepEqual(await rowNames(), rowsBefore);
            assert.equal((await tooltipState()).visible, false);
            assert.deepEqual(await evaluate('window.__messages'), []);

            await sleep(500);
            assert.deepEqual(await evaluate('window.__calls.map(function (call) { return call.eventName; })'),
                ['refresh', 'moveItem']);
            assert.deepEqual(await evaluate('window.__messages'), []);
            assert.equal(await isUnblocked(), true);
            await assertNoPageErrors();
        }
    }
];

// Throws, naming the absolute path, unless the DOM fixture exists and is a regular file.
function assertFixtureFile(fixturePath) {
    let stats;
    try {
        stats = fs.statSync(fixturePath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error('The DOM fixture ' + fixturePath + ' does not exist');
        }
        throw new Error('Cannot read the DOM fixture ' + fixturePath + ': ' + error.message, { cause: error });
    }
    if (!stats.isFile()) {
        throw new Error('The DOM fixture ' + fixturePath + ' is not a regular file');
    }
}

// Throws unless every entry of cases has a non-empty string name and a run function, the names are unique and they are
// exactly expectedNames; the error lists every invalid entry and every missing, unexpected and duplicate name.
function assertCaseManifest(cases, expectedNames) {
    const expected = new Set(expectedNames);
    const seen = new Set();
    const problems = [];
    cases.forEach((c, index) => {
        const name = c ? c.name : undefined;
        if (typeof name !== 'string' || name.length === 0) {
            problems.push('entry ' + index + ' has no name');
            return;
        }
        if (typeof c.run !== 'function') {
            problems.push('entry ' + index + ' ' + JSON.stringify(name) + ' has no run function');
        }
        if (seen.has(name)) {
            problems.push('duplicate ' + JSON.stringify(name));
        }
        seen.add(name);
    });
    for (const name of expectedNames) {
        if (!seen.has(name)) {
            problems.push('missing ' + JSON.stringify(name));
        }
    }
    for (const name of seen) {
        if (!expected.has(name)) {
            problems.push('unexpected ' + JSON.stringify(name));
        }
    }
    if (cases.length !== expectedNames.length) {
        problems.push(cases.length + ' entries for ' + expectedNames.length + ' names');
    }
    if (problems.length > 0) {
        throw new Error('CASES does not match EXPECTED_CASE_NAMES:\n  ' + problems.join('\n  '));
    }
}

// Names of the cases whose run started and of the cases whose run resolved.
const execution = { started: new Set(), completed: new Set() };

// Returns the error listing the manifest cases whose run never started, or null when every one started.
function neverStartedError() {
    const missing = EXPECTED_CASE_NAMES.filter((name) => !execution.started.has(name));
    if (missing.length === 0) {
        return null;
    }
    return new Error(missing.length + ' of ' + EXPECTED_CASE_NAMES.length + ' DOM cases never started: '
        + missing.map((name) => JSON.stringify(name)).join(', '));
}

// Throws the only error of a list, or one AggregateError joining the messages of several; returns on an empty list.
function throwFailures(failures) {
    if (failures.length === 1) {
        throw failures[0];
    }
    if (failures.length > 1) {
        throw new AggregateError(failures, failures.map((error) => error.message).join('\n'));
    }
}

// Sets a failing exit code, unless one is set, and writes one stderr line when the number of cases whose run resolved
// differs from the number of manifest names.
function reportIncompleteRun() {
    const completed = execution.completed.size;
    if (completed === EXPECTED_CASE_NAMES.length) {
        return;
    }
    process.stderr.write('ganttChartMove.dom.test.js: ' + completed + ' of ' + EXPECTED_CASE_NAMES.length
        + ' DOM cases ran to completion\n');
    if (!process.exitCode) {
        process.exitCode = 1;
    }
}

// Promise and error of the browser start, and whether the after hook has begun.
const lifecycle = { starting: null, startError: null, stopping: false };

assertFixtureFile(FIXTURE_PATH);
assertCaseManifest(CASES, EXPECTED_CASE_NAMES);

// Starts the browser unless the after hook has begun, recording the start and its error.
before(async () => {
    if (lifecycle.stopping) {
        return;
    }
    lifecycle.starting = startBrowser().catch((error) => {
        lifecycle.startError = error;
        throw error;
    });
    await lifecycle.starting;
}, { timeout: BEFORE_TIMEOUT_MS });

// Waits up to BEFORE_TIMEOUT_MS for a browser start still in progress, stops the browser, then fails the run with the
// start error, the stop error and the list of manifest cases that never started, each when present.
after(async () => {
    lifecycle.stopping = true;
    const failures = [];
    if (lifecycle.starting && !(await settlesWithin(lifecycle.starting, BEFORE_TIMEOUT_MS))) {
        failures.push(new Error('The browser start did not settle within ' + BEFORE_TIMEOUT_MS + ' ms'));
    }
    if (lifecycle.startError) {
        failures.push(lifecycle.startError);
    }
    try {
        await stopBrowser();
    } catch (error) {
        failures.push(error);
    }
    const gateError = neverStartedError();
    if (gateError) {
        failures.push(gateError);
    }
    throwFailures(failures);
}, { timeout: AFTER_TIMEOUT_MS });

// Kills a still running chrome-headless-shell and removes its profile directory synchronously, writing a failed removal
// to stderr with a failing exit code, then fails an incomplete run, when the test process exits.
process.on('exit', () => {
    const removeError = terminateBrowserSync('the test process is exiting');
    if (removeError) {
        process.stderr.write('ganttChartMove.dom.test.js: ' + removeError.message + '\n');
        if (!process.exitCode) {
            process.exitCode = 1;
        }
    }
    reportIncompleteRun();
});

// Signal whose cleanup is in progress, or null.
let terminatingSignal = null;

// Returns 128 + the number of a signal.
function signalExitStatus(signal) {
    return 128 + os.constants.signals[signal];
}

// On the first termination signal, writes it to stderr, closes the DevTools client, sends SIGKILL to
// chrome-headless-shell, waits up to CHROME_EXIT_TIMEOUT_MS for its exit, removes the profile, writes the outcome to
// stderr and exits with 128 + the signal number. A signal received while that cleanup runs kills and removes
// synchronously and exits at once with the status of the first signal.
function onTerminationSignal(signal) {
    if (terminatingSignal !== null) {
        const removeError = terminateBrowserSync(signal + ' received during cleanup');
        process.stderr.write('ganttChartMove.dom.test.js: ' + signal + ' received during cleanup; '
            + (removeError ? removeError.message : 'profile removed') + '; exiting with status '
            + signalExitStatus(terminatingSignal) + '\n');
        process.exit(signalExitStatus(terminatingSignal));
        return;
    }
    terminatingSignal = signal;
    const status = signalExitStatus(signal);
    process.stderr.write('ganttChartMove.dom.test.js: ' + signal + ' received; stopping ' + CHROME_BINARY + '\n');
    terminateBrowser(false, signal + ' received').then(() => {
        process.stderr.write('ganttChartMove.dom.test.js: ' + CHROME_BINARY
            + ' stopped and its profile removed; exiting with status ' + status + '\n');
        process.exit(status);
    }, (error) => {
        process.stderr.write('ganttChartMove.dom.test.js: cleanup after ' + signal + ' failed: ' + error.message
            + '; exiting with status ' + status + '\n');
        process.exit(status);
    });
}

for (const signal of TERMINATION_SIGNALS) {
    process.on(signal, onTerminationSignal);
}

// Registers every case; each records its name when its run starts and when its run resolves.
for (const c of CASES) {
    test(c.name, { timeout: CASE_TIMEOUT_MS }, async () => {
        execution.started.add(c.name);
        await c.run();
        execution.completed.add(c.name);
    });
}
