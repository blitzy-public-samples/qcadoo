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
 * with 128 + the signal number; a write to stdout or stderr that fails with EPIPE, as it does once the reader of the
 * pipe has gone, does the same and exits with 141 (128 + SIGPIPE). Once stderr has failed, the runner writes nothing
 * more to it. The stderr line of such a termination names the case in progress; until the process exits, no further
 * case or hook runs, and a case or hook that fails during the termination is not reported as failed.
 *
 * Worker isolation: the run is this process, its ancestors and the processes an earlier check without an intrusion
 * admitted, each by itself, and this process and the members of its process group, each with its descendants; pid 1
 * and kernel threads are admitted with it. The runner tells two kinds of findings apart. Co-tenancy: a process of /proc
 * that is not admitted, a socket of /proc/net/tcp, tcp6, udp and udp6 that no admitted process holds, a process that
 * cannot be inspected, a /proc table that cannot be read and, unless the runner runs as root, /proc mounted with
 * hidepid, and, while chrome-headless-shell runs, a connection with an end at its DevTools listening address other than
 * the runner's own that has no socket, such as TIME_WAIT, that is in a state other than ESTABLISHED, or that leaves
 * ESTABLISHED before it counts as an intrusion; an entry without a socket that is there when the DevTools check starts
 * is not reported. Intrusion: a process of the run that is traced, and such a connection that every check finds
 * ESTABLISHED with a socket for at least DEVTOOLS_SESSION_GRACE_MS (1000 ms) from the check that first finds it. A
 * finding other than a DevTools one counts once an immediate second collection finds it again. The runner checks before
 * any case is registered and again before it starts chrome-headless-shell: co-tenancy is written to stderr as one
 * warning line per check, naming the number of findings and at most ISOLATION_OFFENDER_LIMIT of them, and the run
 * continues; an intrusion fails the run. From the first check until the after hook it looks for intrusions and DevTools
 * co-tenancy only, every 500 ms: each DevTools co-tenancy finding is written once, in one warning line per check that
 * finds new ones, and an intrusion stops chrome-headless-shell and fails every later case and the after hook.
 * Co-tenancy never stops the run or fails a case. In a private worker that holds only this run, such as
 * unshare --pid --fork --mount-proc --net with the loopback interface up, no co-tenancy arises and no warning is
 * written.
 */
'use strict';

// Node.js release the runner is pinned to.
const REQUIRED_NODE_VERSION = 'v22.23.2';

// Throws before node:test is loaded unless Node.js is at major version 22 or later and has the global WebSocket. Below
// major version 22 the error names the running version and executable and the pinned toolchain directory. From major
// version 22 on, a missing global WebSocket gives an error that names the running version and executable, says that
// the global WebSocket is disabled in this process, and names where --no-experimental-websocket (also written with
// underscores) was found, process.execArgv and process.env.NODE_OPTIONS, telling to remove it from the node command
// line and from NODE_OPTIONS respectively; when it was found in neither, the error names both and any --require or
// --import preload that deletes the global WebSocket.
(function assertRuntime() {
    const major = Number(process.versions.node.split('.')[0]);
    const hasWebSocket = typeof WebSocket === 'function';
    if (major >= 22 && hasWebSocket) {
        return;
    }
    if (major >= 22) {
        const disables = (option) => /^--no[-_]experimental[-_]websocket$/.test(option.replace(/^"(.*)"$/, '$1'));
        const places = [];
        if (process.execArgv.some(disables)) {
            places.push({ source: 'process.execArgv', remedy: 'the node command line' });
        }
        if ((process.env.NODE_OPTIONS || '').split(/\s+/).some(disables)) {
            places.push({ source: 'process.env.NODE_OPTIONS', remedy: 'NODE_OPTIONS' });
        }
        throw new Error('ganttChartMove.dom.test.js needs the global WebSocket, which is disabled in this process of '
            + 'Node.js ' + process.version + ' at ' + process.execPath + ': '
            + (places.length > 0
                ? '--no-experimental-websocket is set in ' + places.map((place) => place.source).join(' and ')
                    + '; remove it from ' + places.map((place) => place.remedy).join(' and ')
                : 'no --no-experimental-websocket appears in process.execArgv or process.env.NODE_OPTIONS; remove that '
                    + 'flag from the node command line and from NODE_OPTIONS, and remove any --require or --import '
                    + 'preload that deletes the global WebSocket'));
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

// Exit status, 128 + the number of SIGPIPE, with which the runner stops chrome-headless-shell, removes its profile and
// exits after a write to stdout or stderr fails with EPIPE, as it does once the reader of the pipe has closed it.
const CLOSED_PIPE_EXIT_STATUS = 128 + os.constants.signals.SIGPIPE;

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
    'a click on the covered part of a bar picked from the collision box reopens the box without a select event, and a '
        + 'click on its uncovered part selects the bar',
    'the drag tooltip text follows successive targets',
    'a rejected drop hides the drag tooltip and shows the reason',
    'drop resolves the correct row in a scrolled pane',
    'scrolling the pane during a drag keeps the bar, its target and the tooltip under the pointer, and the drop sends '
        + 'that target',
    'drop outside the visible pane snaps back without a request',
    'outside the drop area the drag tooltip and the status region hold only the release-to-cancel text and the bar '
        + 'waits at its pre-drag place, a return shows the target again, and a release outside sends nothing',
    'row labels with markup render as text',
    'keyboard: Tab reaches a draggable bar as a named, described button with a visible focus ring, bars that cannot '
        + 'move are named tab stops without a description, and a board without moves adds none',
    'keyboard: arrow keys move the focused bar in 30-minute steps and whole rows within the board, and Enter sends one '
        + 'moveItem',
    'keyboard: Escape, blur, a pointer press and an unchanged Enter cancel a keyboard move without a request, and Enter '
        + 'or Space on an idle bar selects it',
    'keyboard: an accepted keyboard move announces the saved move and moves the focus to the rebuilt bar',
    'pointer: an accepted drop announces the saved move, and a drag ended by pointercancel or by a drop outside the '
        + 'pane announces the cancellation',
    'a selected covered bar at z-index 220 rises to the drag layer (230) and stays topmost while dragged by pointer or '
        + 'moved by keyboard, and so does a focused bar',
    'keyboard: at H6 and D1 a bar with an id is a named button without a description that Tab reaches and Enter or '
        + 'Space selects, and an arrow key moves nothing',
    'aria-pressed follows the selected bar through Enter, the collision box, a click and a selectedEntityId answer, '
        + 'and a board without moves sets none',
    'keyboard focus scrolls a partly visible bar fully into the pane with the header and row names in sync, a '
        + 'focused covered bar is opaque and topmost up to its ring, and a mouse press scrolls nothing',
    'keyboard: a maintenance bar and a one-hour approved bar are named images that Tab reaches, show their tooltip '
        + 'while keyboard-focused, and neither select nor move',
    'bars of a board with moves bind no pointer, key or focus handler of their own, the rows container holds each '
        + 'delegated handler once across re-renders, and names without character references create no textarea',
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
    'a press whose bar cannot capture the pointer starts no drag and sends nothing',
    'a committed move whose chart cannot be refreshed answers with the error page: the bar returns, the error is shown '
        + 'and no second refresh is sent',
    'an accepted moveResult without a chart restores the bar and leaves the chart and its header unchanged',
    'bar labels on a move-enabled board stay inside their bars on one line from one left inset, end in an ellipsis '
        + 'when cut, and a 1-hour bar at H1 shows its label',
    'a narrow collision on a move-enabled board shows only its icon inside its box and leaves the event to its right '
        + 'hoverable, and wider collisions keep their label inside with an ellipsis when cut',
    'long row labels on a move-enabled board stay on one line with an ellipsis and carry the full row name as a title, '
        + 'and short ones stay centred beside their rows',
    'at the bottom of the pane of a move-enabled board the row names viewport matches the rows viewport and shows the '
        + 'last row name in full beside its row, with the default, an 11 px and a hidden scroll bar',
    'boards without item moves keep the previous bar label, collision label, row name, cell and row names viewport '
        + 'rendering',
    'a rejection tooltip sits 20 px below the restored bar and centred on it, and near the bottom of the window '
        + '20 px above the bar without covering it',
    'near the right edge of the window the drag tooltip and the rejection tooltip that follows it keep the 40 px '
        + 'margin',
    'on a move-enabled board the tooltip takes the stylesheet z-index 300 above the collision overlay and lets '
        + 'pointer events pass, and a board without moves keeps the inline z-index 100 and its placement',
    "a hover moved straight down from a bar onto the bar in the next row shows the lower bar's tooltip at "
        + 'once',
    'long unbroken order, product and event numbers wrap inside the tooltip, which stays inside the window',
    'rejection tooltip: after a rejected drop, hovering another order bar, the bar under the release point, the '
        + "maintenance bar or a collision item shows that item's own tooltip, and the rejected bar keeps the reason in "
        + 'place',
    'rejection tooltip: it stays through a rest and pointer moves up to 30 px, and a pointer move over 30 px, a press on '
        + 'an empty cell, Escape, a pane scroll and a window resize dismiss it',
    'rejection tooltip: after a rejected keyboard move, Tab to another bar dismisses it and leaves that bar uncovered',
    'rejection alert region: it holds the rejection until a dismissal or the next sent move, and an accepted pointer or '
        + 'keyboard move leaves it empty with the saved move announced',
    'a board without moves keeps its hover tooltip: it follows the pointer, keeps a visible body and hides on '
        + "mouseleave, while a move-enabled board shows the hovered item's own body"
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

// Page expression that is true when the element with id GANTT_ID exists, its jQuery data "blockUI.isBlocked" is falsy,
// and no .blockUI element exists anywhere under the fixture host #ganttHost.
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

// Largest number of findings an isolation error or co-tenancy warning names.
const ISOLATION_OFFENDER_LIMIT = 10;

// Interval of the isolation watch, which runs from the first isolation check until the after hook, in milliseconds.
const ISOLATION_WATCH_INTERVAL_MS = 500;

// Milliseconds a foreign connection to the DevTools port must stay ESTABLISHED with a socket, from the check that first
// finds it, before a later check that finds it again counts it as an intrusion.
const DEVTOOLS_SESSION_GRACE_MS = 2 * ISOLATION_WATCH_INTERVAL_MS;

// Isolation policy of the runner, as its isolation errors and co-tenancy warnings state it.
const ISOLATION_REQUIREMENT = 'ganttChartMove.dom.test.js stops the run when a process of this run is traced or when '
    + 'a connection other than its own stays ESTABLISHED at the DevTools port of ' + CHROME_BINARY + ' for at least '
    + DEVTOOLS_SESSION_GRACE_MS + ' ms, and only warns about processes and sockets outside this run and about other '
    + 'connections to that port that close sooner or have no socket; in a private worker that holds only this run, '
    + 'such as unshare --pid --fork --mount-proc --net with the loopback interface up, there are none and no warning '
    + 'is written';

// PF_KTHREAD, the flag of a kernel thread in the flags field of /proc/<pid>/stat.
const PF_KTHREAD = 0x00200000;

// Names of the TCP states of /proc/net/tcp and tcp6, by their hexadecimal code.
const TCP_STATE_NAMES = {
    '01': 'ESTABLISHED', '02': 'SYN_SENT', '03': 'SYN_RECV', '04': 'FIN_WAIT1', '05': 'FIN_WAIT2', '06': 'TIME_WAIT',
    '07': 'CLOSE', '08': 'CLOSE_WAIT', '09': 'LAST_ACK', '0A': 'LISTEN', '0B': 'CLOSING', '0C': 'NEW_SYN_RECV'
};

// State of the isolation watch: error is the intrusion it found, as an Error, and stopping the promise of the browser
// stop that intrusion began, which resolves with the stop error or null, both null until an intrusion; timer is its
// interval timer while it runs; devTools the DevTools port check of watchDevToolsPort while chrome-headless-shell
// runs; admitted the '<pid>:<start>' keys of the processes the isolation checks without an intrusion have admitted.
const isolation = { error: null, stopping: null, timer: null, devTools: null, admitted: new Set() };

// State of a termination of the run by terminate: reason and status are the reason and the exit status of the
// termination in progress, both null until one starts; runningCase is the name of the case whose run is in progress,
// or null.
const termination = { reason: null, status: null, runningCase: null };

// Promise that never settles, which a case or hook that starts or fails during a termination awaits; such a case or
// hook ends only when terminate exits the process.
const UNTIL_TERMINATED = new Promise(() => {});

// Names of the standard streams, 'stdout' and 'stderr', a write to which has failed; writeDiagnostic writes nothing
// once stderr is among them.
const brokenStdio = new Set();

// Writes text and a line break to stderr and returns true. Writes nothing and returns false once stderr is in
// brokenStdio or no longer writable; a write that throws adds stderr to brokenStdio.
function writeDiagnostic(text) {
    if (brokenStdio.has('stderr') || !process.stderr.writable) {
        return false;
    }
    try {
        process.stderr.write(text + '\n');
        return true;
    } catch (error) {
        brokenStdio.add('stderr');
        return false;
    }
}

// Reads /proc/<pid>/status of the process pid and returns { euid, tracer }: euid is the effective uid of its Uid: line
// and tracer its TracerPid: value, both decimal strings. Returns null for a process that has exited, and pushes
// 'process <pid> cannot be inspected' to violations and returns null when the file fails to read with an error other
// than ENOENT and ESRCH or lacks one of those fields.
function readProcessStatus(pid, violations) {
    let status;
    try {
        status = fs.readFileSync('/proc/' + pid + '/status', 'latin1');
    } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'ESRCH') {
            violations.push('process ' + pid + ' cannot be inspected');
        }
        return null;
    }
    const lines = status.split('\n').map((line) => line.split(/[ \t]+/).filter((field) => field !== ''));
    const uids = lines.find((line) => line[0] === 'Uid:');
    const tracer = lines.find((line) => line[0] === 'TracerPid:');
    if (!uids || uids.length !== 5 || !uids.slice(1).every((uid) => /^\d+$/.test(uid))
        || !tracer || tracer.length !== 2 || !/^\d+$/.test(tracer[1])) {
        violations.push('process ' + pid + ' cannot be inspected');
        return null;
    }
    return { euid: uids[2], tracer: tracer[1] };
}

// Reads /proc/<pid>/stat of every process of /proc, and with withStatus also its /proc/<pid>/status through
// readProcessStatus, and returns a Map from each pid, a string, to { ppid, pgid, start, kernel, euid, tracer }: ppid,
// pgid and start are the parent pid, the process group id and the start time (fields 4, 5 and 22 of stat), kernel
// whether the flags field of stat holds PF_KTHREAD, and euid and tracer the values of readProcessStatus, or null
// without withStatus; all but kernel are decimal strings or null. Pushes '/proc cannot be listed' to violations when
// /proc cannot be read, and 'process <pid> cannot be inspected' for a process whose files fail to read with an error
// other than ENOENT and ESRCH or lack one of those fields. A process that has exited is skipped.
function readProcesses(violations, withStatus) {
    const processes = new Map();
    let names;
    try {
        names = fs.readdirSync('/proc');
    } catch (error) {
        violations.push('/proc cannot be listed');
        return processes;
    }
    for (const pid of names.filter((name) => /^\d+$/.test(name))) {
        let stat;
        try {
            stat = fs.readFileSync('/proc/' + pid + '/stat', 'latin1');
        } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'ESRCH') {
                violations.push('process ' + pid + ' cannot be inspected');
            }
            continue;
        }
        // The fields after the parenthesised command name, from the state (field 3 of stat) on.
        const nameEnd = stat.lastIndexOf(')');
        const fields = stat.slice(nameEnd + 2).split(' ');
        if (nameEnd < 0 || fields.length < 20 || ![1, 2, 6, 19].every((index) => /^\d+$/.test(fields[index]))) {
            violations.push('process ' + pid + ' cannot be inspected');
            continue;
        }
        const status = withStatus ? readProcessStatus(pid, violations) : { euid: null, tracer: null };
        if (!status) {
            continue;
        }
        processes.set(pid, {
            ppid: fields[1],
            pgid: fields[2],
            start: fields[19],
            kernel: (Number(fields[6]) & PF_KTHREAD) !== 0,
            euid: status.euid,
            tracer: status.tracer
        });
    }
    return processes;
}

// Returns the pids from pid up through its parent, its parent's parent and so on, as far as processes holds them.
function ancestorChain(pid, processes) {
    const chain = [];
    let current = pid;
    while (processes.has(current) && !chain.includes(current)) {
        chain.push(current);
        current = processes.get(current).ppid;
    }
    return chain;
}

// Returns the Set of the pids of roots that processes holds and of all their descendants.
function descendantsOf(roots, processes) {
    const children = new Map();
    for (const [pid, info] of processes) {
        if (!children.has(info.ppid)) {
            children.set(info.ppid, []);
        }
        children.get(info.ppid).push(pid);
    }
    const members = new Set();
    const pending = roots.filter((pid) => processes.has(pid));
    while (pending.length > 0) {
        const pid = pending.pop();
        if (!members.has(pid)) {
            members.add(pid);
            pending.push(...(children.get(pid) || []));
        }
    }
    return members;
}

// Returns the inodes of the sockets the process pid holds, read from its /proc/<pid>/fd links; empty when unreadable.
function socketInodes(pid) {
    const inodes = new Set();
    let entries;
    try {
        entries = fs.readdirSync('/proc/' + pid + '/fd');
    } catch (error) {
        return inodes;
    }
    for (const entry of entries) {
        let link;
        try {
            link = fs.readlinkSync('/proc/' + pid + '/fd/' + entry);
        } catch (error) {
            // A descriptor closed while the links are read is skipped.
            continue;
        }
        const match = /^socket:\[(\d+)\]$/.exec(link);
        if (match) {
            inodes.add(match[1]);
        }
    }
    return inodes;
}

// Returns the entries of the tables /proc/net/<protocol> of protocols as { protocol, state, local, remote, localPort,
// remotePort, uid, inode }: state is the hexadecimal state code in upper case, local and remote the address:port fields
// in upper case as the table writes them, localPort and remotePort their decimal ports, uid and inode decimal strings.
// A missing table is skipped. Throws when a table cannot be read or holds a line that is not an entry.
function socketTable(protocols) {
    const entries = [];
    for (const protocol of protocols) {
        const table = '/proc/net/' + protocol;
        let text;
        try {
            text = fs.readFileSync(table, 'latin1');
        } catch (error) {
            if (error.code === 'ENOENT') {
                continue;
            }
            throw new Error(table + ' cannot be read (' + error.code + ')');
        }
        for (const line of text.split('\n').slice(1)) {
            const fields = line.split(/[ \t]+/).filter((field) => field !== '');
            if (fields.length === 0) {
                continue;
            }
            const local = /^[0-9A-F]+:([0-9A-F]{4})$/i.exec(fields[1] || '');
            const remote = /^[0-9A-F]+:([0-9A-F]{4})$/i.exec(fields[2] || '');
            if (!local || !remote || !/^[0-9A-F]{2}$/i.test(fields[3] || '') || !/^\d+$/.test(fields[7] || '')
                || !/^\d+$/.test(fields[9] || '')) {
                throw new Error(table + ' holds a line that is not a socket entry');
            }
            entries.push({
                protocol,
                state: fields[3].toUpperCase(),
                local: fields[1].toUpperCase(),
                remote: fields[2].toUpperCase(),
                localPort: parseInt(local[1], 16),
                remotePort: parseInt(remote[1], 16),
                uid: fields[7],
                inode: fields[9]
            });
        }
    }
    return entries;
}

// Collects the isolation findings once. remembered holds the '<pid>:<start>' keys of the processes an earlier
// collection without an intrusion admitted. The run is this process with its ancestors, the remembered processes that
// still run, each by itself, and this process and the members of its process group when that id is not 0, each with
// all its descendants. A process is admitted when it belongs to the run or is pid 1 or a kernel thread. Returns
// { coTenancy, intrusion, admitted }: admitted holds the keys of the admitted processes; intrusion holds
// 'process <pid> is traced by process <tracer>' for every process of the run whose TracerPid is not 0; coTenancy is
// empty unless full is true and then holds, in this order:
//   - '/proc/self/mountinfo cannot be read, ...' when that file cannot be read or is empty;
//   - unless the runner runs as root, '/proc is mounted with hidepid=<value>, ...' for every hidepid option other than
//     hidepid=0 and hidepid=off in the mount options (field 6) or the super options (the last field) of a
//     /proc/self/mountinfo line whose mount point (field 5) is /proc;
//   - the entries of readProcesses and readProcessStatus;
//   - the message of socketTable when a table of /proc/net/tcp, tcp6, udp and udp6 cannot be read or parsed;
//   - 'process <pid> (uid <uid>) is not part of this run' for every process that is not admitted, naming its effective
//     uid;
//   - 'a <protocol> socket on local port <port> (uid <uid>) belongs to no process of this run' for every socket of those
//     tables whose inode is not 0 and that no admitted process holds.
// Without full, it reads /proc/<pid>/stat of every process and /proc/<pid>/status of the processes of the run only, and
// reads neither /proc/self/mountinfo, the socket tables nor any process's descriptors.
// Entries name pids, uids, ports and /proc paths only, never a command line, an environment or an argument value.
function isolationViolationsOnce(remembered, full) {
    const coTenancy = [];
    const intrusion = [];
    if (full) {
        const effectiveUid = String(process.geteuid());
        let mountinfo = '';
        try {
            mountinfo = fs.readFileSync('/proc/self/mountinfo', 'utf8');
        } catch (error) {
            mountinfo = '';
        }
        if (mountinfo === '') {
            coTenancy.push('/proc/self/mountinfo cannot be read, so the process list cannot be checked');
        } else if (effectiveUid !== '0') {
            for (const line of mountinfo.split('\n')) {
                const fields = line.split(' ');
                if (fields[4] !== '/proc') {
                    continue;
                }
                for (const option of (fields[5] + ',' + fields[fields.length - 1]).split(',')) {
                    const value = option.startsWith('hidepid=') ? option.slice('hidepid='.length) : null;
                    if (value !== null && value !== '0' && value !== 'off') {
                        coTenancy.push('/proc is mounted with hidepid=' + value
                            + ", so other accounts' processes cannot be listed");
                    }
                }
            }
        }
    }

    const processes = readProcesses(full ? coTenancy : [], full);
    const self = String(process.pid);
    const chain = ancestorChain(self, processes);
    const group = processes.has(self) ? processes.get(self).pgid : '0';
    const key = (pid) => pid + ':' + processes.get(pid).start;
    const roots = [self];
    for (const [pid, info] of processes) {
        if (group !== '0' && info.pgid === group) {
            roots.push(pid);
        }
    }
    const run = descendantsOf(roots, processes);
    for (const pid of processes.keys()) {
        if (chain.includes(pid) || remembered.has(key(pid))) {
            run.add(pid);
        }
    }

    let table = [];
    if (full) {
        try {
            table = socketTable(['tcp', 'tcp6', 'udp', 'udp6']);
        } catch (error) {
            coTenancy.push(error.message);
        }
    }

    const isAdmitted = (pid) => run.has(pid) || pid === '1' || processes.get(pid).kernel;
    const holders = new Map();
    const admitted = new Set();
    for (const [pid, info] of processes) {
        if (full) {
            for (const inode of socketInodes(pid)) {
                if (!holders.has(inode)) {
                    holders.set(inode, []);
                }
                holders.get(inode).push(pid);
            }
        }
        if (isAdmitted(pid)) {
            admitted.add(key(pid));
        } else if (full) {
            coTenancy.push('process ' + pid + ' (uid ' + info.euid + ') is not part of this run');
        }
    }
    for (const pid of run) {
        const status = full ? processes.get(pid) : readProcessStatus(pid, []);
        if (status && status.tracer !== '0') {
            intrusion.push('process ' + pid + ' is traced by process ' + status.tracer);
        }
    }
    for (const entry of table) {
        if (entry.inode !== '0' && !(holders.get(entry.inode) || []).some(isAdmitted)) {
            coTenancy.push('a ' + entry.protocol + ' socket on local port ' + entry.localPort + ' (uid ' + entry.uid
                + ') belongs to no process of this run');
        }
    }
    return { coTenancy, intrusion, admitted };
}

// Returns the isolation findings { coTenancy, intrusion } of isolationViolationsOnce(isolation.admitted, full): each
// list is empty when a first collection finds nothing, and otherwise holds the findings of that collection that a
// second one, made at once, finds again. When no intrusion remains, adds the keys of the processes the first
// collection admitted to isolation.admitted.
function workerIsolation(full) {
    const first = isolationViolationsOnce(isolation.admitted, full);
    let coTenancy = [...new Set(first.coTenancy)];
    let intrusion = [...new Set(first.intrusion)];
    if (coTenancy.length > 0 || intrusion.length > 0) {
        const second = isolationViolationsOnce(isolation.admitted, full);
        const again = new Set(second.coTenancy.concat(second.intrusion));
        coTenancy = coTenancy.filter((finding) => again.has(finding));
        intrusion = intrusion.filter((finding) => again.has(finding));
    }
    if (intrusion.length === 0) {
        first.admitted.forEach((admittedKey) => isolation.admitted.add(admittedKey));
    }
    return { coTenancy, intrusion };
}

// Returns at most ISOLATION_OFFENDER_LIMIT of the findings joined with '; ', and the number of the others.
function isolationReport(findings) {
    const more = findings.length > ISOLATION_OFFENDER_LIMIT
        ? '; and ' + (findings.length - ISOLATION_OFFENDER_LIMIT) + ' more' : '';
    return findings.slice(0, ISOLATION_OFFENDER_LIMIT).join('; ') + more;
}

// Writes one warning line to stderr with writeDiagnostic naming purpose, the step the check precedes or the time it
// runs, the number of co-tenancy findings, the findings as isolationReport gives them, that the run continues, that
// processes outside this run can reach the DevTools endpoint of chrome-headless-shell, and ISOLATION_REQUIREMENT. Line
// breaks inside the text become spaces.
function warnCoTenancy(purpose, coTenancy) {
    const count = coTenancy.length;
    const line = 'ganttChartMove.dom.test.js warning ' + purpose + ': ' + count + ' co-tenancy finding'
        + (count === 1 ? '' : 's') + ': ' + isolationReport(coTenancy) + '. The run continues, and processes outside '
        + 'this run can reach the DevTools endpoint of ' + CHROME_BINARY + '. ' + ISOLATION_REQUIREMENT;
    writeDiagnostic(line.replace(/[\r\n]+/g, ' '));
}

// Checks isolation with workerIsolation(true). Writes the co-tenancy findings, when there are any, with warnCoTenancy,
// then throws when an intrusion remains; the error names purpose, the step the check precedes, the intrusions as
// isolationReport gives them and ISOLATION_REQUIREMENT.
function assertIsolatedWorker(purpose) {
    const { coTenancy, intrusion } = workerIsolation(true);
    if (coTenancy.length > 0) {
        warnCoTenancy(purpose, coTenancy);
    }
    if (intrusion.length > 0) {
        throw new Error('ganttChartMove.dom.test.js stops ' + purpose + ': worker isolation check failed: '
            + isolationReport(intrusion) + '. ' + ISOLATION_REQUIREMENT);
    }
}

// Starts checking the DevTools port port of the running chrome-headless-shell: notes its listening sockets, the
// runner's own connections to them (the entries of /proc/net/tcp and tcp6 whose inode is a socket of this process) and
// the entries without a socket (inode 0), such as TIME_WAIT entries, already at a listening address, records them in
// isolation.devTools with an empty sessions Map, from the key of each foreign ESTABLISHED entry with a socket to
// { since, connection }, and an empty warned Set of the co-tenancy findings already reported, and runs checkIsolation
// at once. Throws when the tables show no listening socket of the port or no connection of the runner to it.
function watchDevToolsPort(port) {
    const table = socketTable(['tcp', 'tcp6']);
    const listening = new Set(table.filter((entry) => entry.state === '0A' && entry.localPort === port)
        .map((entry) => entry.local));
    const inodes = socketInodes(process.pid);
    const own = new Set(table.filter((entry) => inodes.has(entry.inode) && listening.has(entry.remote))
        .map((entry) => entry.local));
    if (listening.size === 0 || own.size === 0) {
        throw new Error('ganttChartMove.dom.test.js cannot find '
            + (listening.size === 0 ? 'the listening socket of' : 'its own connection to') + ' the DevTools port '
            + port + ' in /proc/net/tcp and tcp6');
    }
    const key = (entry) => entry.protocol + ' ' + entry.local + ' ' + entry.remote;
    const foreign = (entry) => entry.state !== '0A' && (listening.has(entry.local) || listening.has(entry.remote))
        && !own.has(entry.local) && !own.has(entry.remote);
    isolation.devTools = {
        port,
        listening,
        foreign,
        key,
        earlier: new Set(table.filter((entry) => foreign(entry) && entry.inode === '0').map(key)),
        sessions: new Map(),
        warned: new Set()
    };
    checkIsolation();
}

// Returns the DevTools findings { coTenancy, intrusion } while watchDevToolsPort checks a port, and two empty lists
// otherwise. A foreign entry is an entry of /proc/net/tcp and tcp6, in any state but LISTEN, one end of which is a
// listening address of the port and neither end of which is one of the runner's own connections, other than the
// entries without a socket noted by watchDevToolsPort; <connection> below is 'a <protocol> connection from port <peer>
// to the DevTools port <port>'. The time of a check is performance.now() when it starts.
//   - A foreign entry in ESTABLISHED state with a socket (inode other than 0) is added to watch.sessions with the time
//     of the check that first finds it. intrusion holds '<connection> (ESTABLISHED) that stayed open for at least
//     DEVTOOLS_SESSION_GRACE_MS ms' for each one this check finds at least DEVTOOLS_SESSION_GRACE_MS after that time.
//   - coTenancy holds '<connection> (<state>)' for every other foreign entry, with or without a socket, and
//     '<connection> (ESTABLISHED) that closed within <elapsed> ms' for every entry of watch.sessions this check does
//     not find ESTABLISHED with a socket, elapsed being the milliseconds since the check that first found it, rounded
//     up; that entry is removed from watch.sessions.
//   - coTenancy holds the message of socketTable when those tables cannot be read or parsed; intrusion is then empty
//     and watch.sessions is unchanged.
// coTenancy leaves out the findings of watch.warned, holds each finding once, and every finding it holds is added to
// watch.warned.
function devToolsPortViolations() {
    const watch = isolation.devTools;
    const findings = { coTenancy: [], intrusion: [] };
    if (!watch) {
        return findings;
    }
    const warn = (finding) => {
        if (!watch.warned.has(finding)) {
            watch.warned.add(finding);
            findings.coTenancy.push(finding);
        }
    };
    const now = performance.now();
    let table;
    try {
        table = socketTable(['tcp', 'tcp6']);
    } catch (error) {
        warn(error.message);
        return findings;
    }
    const established = new Set();
    for (const entry of table) {
        const entryKey = watch.key(entry);
        if (!watch.foreign(entry) || watch.earlier.has(entryKey)) {
            continue;
        }
        const peerPort = watch.listening.has(entry.local) ? entry.remotePort : entry.localPort;
        const connection = 'a ' + entry.protocol + ' connection from port ' + peerPort + ' to the DevTools port '
            + watch.port;
        if (entry.state !== '01' || entry.inode === '0') {
            warn(connection + ' (' + (TCP_STATE_NAMES[entry.state] || entry.state) + ')');
            continue;
        }
        established.add(entryKey);
        if (!watch.sessions.has(entryKey)) {
            watch.sessions.set(entryKey, { since: now, connection });
        } else if (now - watch.sessions.get(entryKey).since >= DEVTOOLS_SESSION_GRACE_MS) {
            findings.intrusion.push(connection + ' (ESTABLISHED) that stayed open for at least '
                + DEVTOOLS_SESSION_GRACE_MS + ' ms');
        }
    }
    for (const [entryKey, session] of watch.sessions) {
        if (!established.has(entryKey)) {
            watch.sessions.delete(entryKey);
            warn(session.connection + ' (ESTABLISHED) that closed within ' + Math.ceil(now - session.since) + ' ms');
        }
    }
    return findings;
}

// Collects the findings of devToolsPortViolations() and workerIsolation(false), which finds intrusions only, writes the
// co-tenancy findings of devToolsPortViolations, when there are any, with warnCoTenancy, and hands the intrusions of
// both to failIsolation when there are any. An error thrown while collecting counts as an intrusion. Does nothing once
// isolation.error is set.
function checkIsolation() {
    if (isolation.error) {
        return;
    }
    let coTenancy = [];
    let intrusions;
    try {
        const devTools = devToolsPortViolations();
        coTenancy = devTools.coTenancy;
        intrusions = [...new Set(workerIsolation(false).intrusion.concat(devTools.intrusion))];
    } catch (error) {
        intrusions = [error.message];
    }
    if (coTenancy.length > 0) {
        warnCoTenancy('while ' + CHROME_BINARY + ' runs', coTenancy);
    }
    if (intrusions.length > 0) {
        failIsolation(intrusions);
    }
}

// Acts on the first call only: stops the isolation watch, records isolation.error, which names the intrusions as
// isolationReport gives them, writes it to stderr with writeDiagnostic, sets process.exitCode to 1 and stops the
// browser with terminateBrowser, recording the promise of that stop in isolation.stopping. From then on every case
// fails before it runs and the after hook fails.
function failIsolation(intrusions) {
    if (isolation.error) {
        return;
    }
    stopIsolationWatch();
    isolation.error = new Error('ganttChartMove.dom.test.js stopped the run: worker isolation check failed while it '
        + 'ran: ' + isolationReport(intrusions) + '. ' + ISOLATION_REQUIREMENT);
    process.exitCode = 1;
    writeDiagnostic(isolation.error.message);
    isolation.stopping = terminateBrowser(false, isolation.error.message).then(() => null, (error) => error);
}

// Runs checkIsolation, which looks for intrusions only, every ISOLATION_WATCH_INTERVAL_MS until stopIsolationWatch or
// failIsolation.
function startIsolationWatch() {
    isolation.timer = setInterval(checkIsolation, ISOLATION_WATCH_INTERVAL_MS);
    isolation.timer.unref();
}

// Stops the isolation watch.
function stopIsolationWatch() {
    clearInterval(isolation.timer);
    isolation.timer = null;
}

// Starts chrome-headless-shell, passes a spawned process and the promise of its exit to onSpawn at once, and resolves
// with its process, the promise of its exit and its DevTools WebSocket URL. Before the start, assertIsolatedWorker
// writes co-tenancy findings as a warning line to stderr. Rejects without starting it once the isolation watch has
// found an intrusion and when assertIsolatedWorker finds one.
function launchChrome(profileDir, onSpawn) {
    return new Promise((resolve, reject) => {
        if (isolation.error) {
            throw isolation.error;
        }
        assertIsolatedWorker('before it starts ' + CHROME_BINARY);
        const args = [
            '--remote-debugging-port=0',
            '--user-data-dir=' + profileDir,
            '--no-first-run',
            '--no-default-browser-check',
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
            // The endpoint counts once its line has ended.
            const match = /DevTools listening on (ws:\/\/\S+)\r?\n/.exec(stderr);
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

    // Dispatches a command response to its caller and an event to its listeners. A frame that is not a JSON object
    // closes the client with close: every pending and later command rejects with an error naming the frame's length
    // and the parse failure, and the WebSocket is closed.
    onMessage(data) {
        const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf8');
        let message;
        try {
            message = JSON.parse(text);
        } catch (error) {
            this.close('the DevTools WebSocket sent a frame of ' + text.length + ' characters that is not JSON ('
                + error.message + ')');
            return;
        }
        if (message === null || typeof message !== 'object' || Array.isArray(message)) {
            this.close('the DevTools WebSocket sent a frame of ' + text.length + ' characters that is not a JSON '
                + 'object');
            return;
        }
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

// Starts chrome-headless-shell, connects to it, has the isolation watch check its DevTools port (watchDevToolsPort),
// attaches to a new page and enables the Page and Runtime domains at a 1024 x 768 viewport.
async function startBrowser() {
    browser.profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gantt-dom-'));
    const launched = await launchChrome(browser.profileDir, (chrome, exited) => {
        browser.process = chrome;
        browser.exited = exited;
    });
    browser.client = new DevToolsClient(await connectWebSocket(launched.endpoint));
    watchDevToolsPort(Number(new URL(launched.endpoint).port || 80));

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

// Clears the process, exit promise, profile directory, DevTools client and page session of the browser, and stops the
// isolation watch's check of its DevTools port.
function resetBrowser() {
    isolation.devTools = null;
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

// Accessible name of the maintenance bar on a board that allows moves: its label, decoded tooltip content lines, row,
// start and end.
const MAINTENANCE_BAR_LABEL = 'PE-1, Type: Inspection & cleaning, state: New, Requires shutdown: yes, L2, '
    + 'Start 2026-06-01 12:00:00, End 2026-06-01 14:00:00';

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

// Sets the scroll offsets of the rows scroll pane and dispatches its scroll event.
function scrollPane(left, top) {
    return evaluate('(function () { var wrapper = document.querySelector(".rowsContainerWrapper");'
        + ' wrapper.scrollTop = ' + top + '; wrapper.scrollLeft = ' + left + ';'
        + ' wrapper.dispatchEvent(new Event("scroll")); return true; }())');
}

// Turns the mouse wheel at a point by deltaX and deltaY pixels with the left button held.
function wheelWithButtonHeld(x, y, deltaX, deltaY) {
    return mouseEvent({ type: 'mouseWheel', x, y, deltaX, deltaY, button: 'left', buttons: 1 });
}

// Page expression of the chart tooltip element.
const TOOLTIP_EXPR = 'document.querySelector(".ganttChartTooltip")';

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

// Drag tooltip and status text while the pointer lies outside the drop area: the move.releaseToCancel translation of
// the fixture's base options.
const RELEASE_TO_CANCEL_TEXT = 'Outside the chart. Release to cancel the move.';

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

// Page expression of the rows container of the chart.
const ROWS_CONTAINER_EXPR = "document.querySelector('#ganttHost .rowsContainer')";

// Page expression of the only Gantt item of the approved board.
const APPROVED_BAR_EXPR = "document.querySelector('#ganttHost .rowsContainer .ganttItem')";

// Pointer, key and focus event types that no Gantt item of a board with moves handles by itself.
const DELEGATED_EVENT_TYPES = Object.freeze(['pointerdown', 'pointermove', 'pointerup', 'pointercancel',
    'lostpointercapture', 'keydown', 'focus', 'blur', 'focusin', 'focusout']);

// Returns the aria-pressed attribute of the element of a page expression, or null when absent; throws when there is no
// element.
async function ariaPressed(elementExpr) {
    const state = await evaluate('(function () { var element = ' + elementExpr + ';'
        + ' return element ? {pressed: element.getAttribute("aria-pressed")} : null; }())');
    assert.ok(state, 'No element for ' + elementExpr);
    return state.pressed;
}

// Removes the focus from document.activeElement, presses Tab until the element of a page expression has the focus and
// returns the focus order; fails after MAX_TAB_PRESSES presses.
async function tabUntilFocused(elementExpr) {
    await evaluate('(function () { if (document.activeElement) { document.activeElement.blur(); } return true; }())');
    const visited = [];
    for (let i = 0; i < MAX_TAB_PRESSES; i++) {
        await keyPress('Tab');
        visited.push(await evaluate(ACTIVE_ELEMENT_EXPR));
        if (await isFocused(elementExpr)) {
            return visited;
        }
    }
    assert.fail(elementExpr + ' not reached by Tab; focus order: ' + visited.join(' > '));
}

// Returns the computed and inline opacity of the element of a page expression.
async function opacityOf(elementExpr) {
    const opacity = await evaluate('(function () { var element = ' + elementExpr + ';'
        + ' return element ? {computed: getComputedStyle(element).opacity, inline: element.style.opacity} : null; }())');
    assert.ok(opacity, 'No element for ' + elementExpr);
    return opacity;
}

// Returns the scroll offsets of the rows scroll pane, of the time header and of the row names.
function paneScroll() {
    return evaluate('(function () { var wrapper = document.querySelector(".rowsContainerWrapper");'
        + ' return {left: wrapper.scrollLeft, top: wrapper.scrollTop,'
        + ' headerLeft: document.querySelector(".ganttTopRow").scrollLeft,'
        + ' namesTop: document.querySelector(".ganttRowNamesConteiner").scrollTop}; }())');
}

// Returns the jQuery event types bound on the element of a page expression, each with the selectors of its handlers,
// null for a directly bound handler, in jQuery's handler order.
async function jqueryHandlers(elementExpr) {
    const handlers = await evaluate('(function () { var element = ' + elementExpr + ';'
        + ' if (!element) { return null; }'
        + ' var events = jQuery._data(element, "events") || {}; var result = {};'
        + ' Object.keys(events).forEach(function (type) {'
        + ' result[type] = events[type].map(function (handler) { return handler.selector || null; }); });'
        + ' return result; }())');
    assert.ok(handlers, 'No element for ' + elementExpr);
    return handlers;
}

// Returns the sorted types of the native event listeners of the element of a page expression, jQuery's included, read
// with DOMDebugger.getEventListeners.
async function nativeListenerTypes(elementExpr) {
    const response = await send('Runtime.evaluate', { expression: elementExpr, returnByValue: false });
    assert.ok(response.result && response.result.objectId, 'No element for ' + elementExpr);
    try {
        const { listeners } = await send('DOMDebugger.getEventListeners', { objectId: response.result.objectId });
        return listeners.map((listener) => listener.type).sort();
    } finally {
        await send('Runtime.releaseObject', { objectId: response.result.objectId });
    }
}

// Re-renders the board from window.__currentBoard with performInitialize and waits for its refresh answer and for the
// chart to unblock.
async function rerenderBoard() {
    const seqBefore = await evaluate('window.__seq');
    await evaluate('window.__gantt.performInitialize(); true');
    await waitFor('window.__seq > ' + seqBefore + ' && window.__lastResponseApplied.eventName === "refresh"');
    await waitFor(IS_UNBLOCKED_EXPR);
}

// Row indexes of the labels board, and the 60-character number of its 4-hour order bar 205.
const LABELS_ROWS = Object.freeze({ PMG_A: 1, PMG_B: 2, PMG_C: 3, PMG_D: 5, PMG_E: 6 });
const LONG_ORDER_NUMBER = 'PMG-ORDER-WITH-A-SIXTY-CHARACTER-NUMBER-0123456789-ABCDEFGHI';

// Left offset in pixels of a bar label's text from the bar's left border edge on a move-enabled board: the 1 px item
// border of the fixture boards and the 3 px label padding; for a collision with the withIcon class, the 1 px border and
// the 32 px left padding gantt.css gives its label.
const LABEL_TEXT_INSET_PX = 4;
const COLLISION_TEXT_INSET_PX = 33;

// Returns the page expression of the element at an index, 0 when omitted, among the elements matching a selector in the
// row at an index of the rows pane.
function rowItemExpr(rowIndex, selector, index) {
    return "document.querySelectorAll('.rowsContainer .ganttRowElement')[" + rowIndex + ']'
        + '.querySelectorAll(' + JSON.stringify(selector) + ')[' + (index || 0) + ']';
}

// Returns, for the Gantt item of a page expression and its .ganttItemContent label: the viewport rectangles of both, the
// label text, the offset of the rendered text from the item's left edge (null without text), the label's client and
// scroll sizes, its computed line height, white-space, overflow, text-overflow, text-align and padding, its style
// attribute, the item's computed and inline overflow and classes, and the viewport rectangle of every descendant of
// the item; throws when there is no such item or label.
async function itemLabelState(itemExpr) {
    const state = await evaluate('(function () { var item = ' + itemExpr + ';'
        + ' var label = item ? item.querySelector(".ganttItemContent") : null;'
        + ' if (!label) { return null; }'
        + ' var rectOf = function (element) { var rect = element.getBoundingClientRect();'
        + ' return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom}; };'
        + ' var range = document.createRange(); range.selectNodeContents(label);'
        + ' var textRects = range.getClientRects();'
        + ' var computed = getComputedStyle(label);'
        + ' return {item: rectOf(item), label: rectOf(label), text: label.textContent,'
        + ' textLeft: textRects.length > 0 ? textRects[0].left - item.getBoundingClientRect().left : null,'
        + ' clientWidth: label.clientWidth, scrollWidth: label.scrollWidth, clientHeight: label.clientHeight,'
        + ' scrollHeight: label.scrollHeight, lineHeight: parseFloat(computed.lineHeight),'
        + ' whiteSpace: computed.whiteSpace, overflowX: computed.overflowX, overflowY: computed.overflowY,'
        + ' textOverflow: computed.textOverflow, textAlign: computed.textAlign, paddingLeft: computed.paddingLeft,'
        + ' paddingRight: computed.paddingRight, labelStyle: label.getAttribute("style"),'
        + ' itemOverflow: getComputedStyle(item).overflow, itemInlineOverflow: item.style.overflow,'
        + ' classes: item.className.split(/\\s+/).filter(function (name) { return name.length > 0; }),'
        + ' descendants: Array.prototype.map.call(item.querySelectorAll("*"), rectOf)}; }())');
    assert.ok(state, 'No item label for ' + itemExpr);
    return state;
}

// Asserts that a viewport rectangle lies inside another, edges included, within 0.01 px.
function assertRectInside(inner, outer, message) {
    const tolerance = 0.01;
    assert.ok(inner.left >= outer.left - tolerance && inner.right <= outer.right + tolerance
        && inner.top >= outer.top - tolerance && inner.bottom <= outer.bottom + tolerance,
        message + ': ' + JSON.stringify(inner) + ' inside ' + JSON.stringify(outer));
}

// Returns, for every row name element in display order: its text and title attribute, client and scroll sizes,
// computed line height, white-space, overflow, text-overflow and padding, style attribute, viewport rectangle, the left
// and right edges of its rendered text, and the top and bottom of the row element at the same index.
function rowNameStates() {
    return evaluate('(function () {'
        + ' var rows = document.querySelectorAll(".rowsContainer .ganttRowElement");'
        + ' var names = document.querySelectorAll(".ganttRowNamesConteiner .ganttRowNameElement");'
        + ' return Array.prototype.map.call(names, function (name, index) {'
        + ' var computed = getComputedStyle(name); var rect = name.getBoundingClientRect();'
        + ' var range = document.createRange(); range.selectNodeContents(name); var text = range.getBoundingClientRect();'
        + ' var row = rows[index] ? rows[index].getBoundingClientRect() : null;'
        + ' return {text: name.textContent, title: name.getAttribute("title"), clientWidth: name.clientWidth,'
        + ' scrollWidth: name.scrollWidth, clientHeight: name.clientHeight, scrollHeight: name.scrollHeight,'
        + ' lineHeight: parseFloat(computed.lineHeight), whiteSpace: computed.whiteSpace,'
        + ' overflowX: computed.overflowX, overflowY: computed.overflowY, textOverflow: computed.textOverflow,'
        + ' paddingLeft: computed.paddingLeft, paddingRight: computed.paddingRight, style: name.getAttribute("style"),'
        + ' left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, textLeft: text.left,'
        + ' textRight: text.right, rowTop: row ? row.top : null, rowBottom: row ? row.bottom : null}; }); }())');
}

// Scrolls the rows pane to its bottom, dispatches its scroll event and returns: the scroll tops, client heights and scroll
// heights of the pane and of the row names viewport, the height of the pane's horizontal scroll bar (its offset height
// less its client height), the viewport bottoms of both client areas, and the viewport rectangles of the last row and
// the last row name.
function scrollPaneToBottom() {
    return evaluate('(function () { var pane = document.querySelector(".rowsContainerWrapper");'
        + ' var names = document.querySelector(".ganttRowNamesConteiner");'
        + ' pane.scrollTop = pane.scrollHeight; pane.dispatchEvent(new Event("scroll"));'
        + ' var rows = document.querySelectorAll(".rowsContainer .ganttRowElement");'
        + ' var nameElements = names.querySelectorAll(".ganttRowNameElement");'
        + ' var rectOf = function (element) { var rect = element.getBoundingClientRect();'
        + ' return {left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom}; };'
        + ' return {paneScrollTop: pane.scrollTop, namesScrollTop: names.scrollTop,'
        + ' paneClientHeight: pane.clientHeight, namesClientHeight: names.clientHeight,'
        + ' paneScrollHeight: pane.scrollHeight, namesScrollHeight: names.scrollHeight,'
        + ' paneScrollBar: pane.offsetHeight - pane.clientHeight,'
        + ' paneBottom: pane.getBoundingClientRect().top + pane.clientTop + pane.clientHeight,'
        + ' namesBottom: names.getBoundingClientRect().top + names.clientTop + names.clientHeight,'
        + ' lastRow: rectOf(rows[rows.length - 1]), lastName: rectOf(nameElements[nameElements.length - 1])}; }())');
}

// Asserts that a bar label is one nowrap line clipped with an ellipsis, left-aligned and inside its bar.
function assertFittedLabel(state, message) {
    const context = message + ' ' + JSON.stringify(state);
    assert.equal(state.whiteSpace, 'nowrap', context);
    assert.equal(state.overflowX, 'hidden', context);
    assert.equal(state.overflowY, 'hidden', context);
    assert.equal(state.textOverflow, 'ellipsis', context);
    assert.equal(state.textAlign, 'left', context);
    assert.equal(state.clientHeight, state.lineHeight, context);
    assert.ok(state.scrollHeight <= state.clientHeight, context);
    assertRectInside(state.label, state.item, message);
}

// Runs steps with the emulated viewport set to a width and height, and restores VIEWPORT afterwards.
async function withViewport(width, height, steps) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    try {
        await steps();
    } finally {
        await send('Emulation.setDeviceMetricsOverride',
            { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
    }
}

// Returns the window.innerWidth and innerHeight of the page and the client width and height of its document element.
function windowSize() {
    return evaluate('({innerWidth: window.innerWidth, innerHeight: window.innerHeight,'
        + ' clientWidth: document.documentElement.clientWidth, clientHeight: document.documentElement.clientHeight})');
}

// Returns whether two viewport rectangles share an area larger than zero.
function rectsOverlap(a, b) {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

// Returns whether the element of a page expression is topmost at a viewport point while the chart tooltip takes pointer
// events; the inline pointer-events of the tooltip is set to auto for the hit test and restored afterwards.
function isTopmostWithTooltipHitAt(elementExpr, point) {
    return evaluate('(function () { var tooltip = ' + TOOLTIP_EXPR + '; var inline = tooltip.style.pointerEvents;'
        + ' tooltip.style.pointerEvents = "auto";'
        + ' try { var element = ' + elementExpr + ';'
        + ' var hit = document.elementFromPoint(' + point.x + ', ' + point.y + ');'
        + ' return !!element && !!hit && (hit === element || element.contains(hit)); }'
        + ' finally { tooltip.style.pointerEvents = inline; } }())');
}

// Returns the inline and computed z-index, pointer-events, overflow-wrap and word-break of the chart tooltip, and its
// inline left and top and jQuery content width.
function tooltipStyle() {
    return evaluate('(function () { var tooltip = ' + TOOLTIP_EXPR + '; var computed = getComputedStyle(tooltip);'
        + ' return {inlineZIndex: tooltip.style.zIndex, zIndex: computed.zIndex,'
        + ' inlinePointerEvents: tooltip.style.pointerEvents, pointerEvents: computed.pointerEvents,'
        + ' inlineOverflowWrap: tooltip.style.overflowWrap, overflowWrap: computed.overflowWrap,'
        + ' inlineWordBreak: tooltip.style.wordBreak, wordBreak: computed.wordBreak,'
        + ' left: tooltip.style.left, top: tooltip.style.top, contentWidth: jQuery(tooltip).width()}; }())');
}

// Page expression of the layout of the chart tooltip: its viewport rectangle, scroll and client width, text content,
// and each descendant element and text node whose viewport rectangle is not empty and passes an edge of the tooltip
// rectangle by more than 0.5 px, as {node, left, top, right, bottom}.
const TOOLTIP_CONTAINMENT_EXPR = '(function () { var tooltip = ' + TOOLTIP_EXPR + ';'
    + ' var box = tooltip.getBoundingClientRect(); var outside = []; var range = document.createRange();'
    + ' function check(label, rect) { if (rect.width === 0 && rect.height === 0) { return; }'
    + ' if (rect.left < box.left - 0.5 || rect.top < box.top - 0.5 || rect.right > box.right + 0.5'
    + ' || rect.bottom > box.bottom + 0.5) { outside.push({node: label, left: rect.left, top: rect.top,'
    + ' right: rect.right, bottom: rect.bottom}); } }'
    + ' var walker = document.createTreeWalker(tooltip, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);'
    + ' for (var node = walker.nextNode(); node; node = walker.nextNode()) {'
    + ' if (node.nodeType === 1) { check(node.tagName + "." + node.className, node.getBoundingClientRect()); }'
    + ' else { range.selectNodeContents(node);'
    + ' check("text " + JSON.stringify(node.nodeValue.substring(0, 24)), range.getBoundingClientRect()); } }'
    + ' return {left: box.left, top: box.top, right: box.right, bottom: box.bottom,'
    + ' scrollWidth: tooltip.scrollWidth, clientWidth: tooltip.clientWidth,'
    + ' text: tooltip.textContent, outside: outside}; }())';

// Returns a string of a length made of a prefix followed by as many copies of a filler character as the length needs.
function unbrokenText(prefix, filler, length) {
    return prefix + filler.repeat(length - prefix.length);
}

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
        name: 'a click on the covered part of a bar picked from the collision box reopens the box without a select event, '
            + 'and a click on its uncovered part selects the bar',
        run: async () => {
            await openBoard('covered');
            const collisionExpr = "document.querySelector('.ganttCollisionItem')";
            const entryExpr = (id) => 'document.getElementById(' + JSON.stringify(COLLISION_ENTRY_ID_PREFIX + id) + ')';
            const hasClass = (elementExpr, name) => evaluate(elementExpr + '.classList.contains(' + JSON.stringify(name) + ')');
            // Clicks the entry of a bar in the open collision box and waits until the box has closed.
            const pick = async (id) => {
                const entryRect = await elementRect(entryExpr(id));
                await click(entryRect.x, entryRect.y);
                await waitFor('!' + OVERLAY_VISIBLE_EXPR);
            };

            const collisionRect = await elementRect(collisionExpr);
            await click(collisionRect.x, collisionRect.y);
            await waitFor(OVERLAY_VISIBLE_EXPR);
            await pick(12);
            assert.equal((await selectCalls()).length, 1, 'select calls after picking bar 12');
            assert.equal(await hasClass(barExpr(12), 'ganttItemSelected'), true);

            // The selected bar 12 lies over its collision item, which has the same rectangle.
            const coveredRect = await barRect(12);
            for (const edge of ['left', 'top', 'right', 'bottom']) {
                assert.ok(Math.abs(coveredRect[edge] - collisionRect[edge]) < 0.01, edge + ' of bar 12 '
                    + JSON.stringify(coveredRect) + ' and of the collision item ' + JSON.stringify(collisionRect));
            }
            assert.equal(await isTopmostAt(barExpr(12), coveredRect), true);
            await click(coveredRect.x, coveredRect.y);
            await waitFor(OVERLAY_VISIBLE_EXPR);
            assert.equal((await selectCalls()).length, 1, 'select calls after the click on bar 12');
            assert.equal(await hasClass(barExpr(12), 'ganttItemSelected'), true);
            assert.equal(await hasClass(entryExpr(12), 'ganttItemSelected'), true);
            assert.equal(await hasClass(entryExpr(11), 'ganttItemSelected'), false);

            await pick(11);
            assert.equal((await selectCalls()).length, 2, 'select calls after picking bar 11');
            assert.equal(await hasClass(barExpr(11), 'ganttItemSelected'), true);
            assert.equal(await hasClass(barExpr(12), 'ganttItemSelected'), false);

            // The selected bar 11 lies over the collision item from 10:00 to 11:00 and is uncovered from 09:00 to 10:00.
            const coveredPart = { x: collisionRect.x, y: collisionRect.y };
            assert.equal(await isTopmostAt(barExpr(11), coveredPart), true);
            await click(coveredPart.x, coveredPart.y);
            await waitFor(OVERLAY_VISIBLE_EXPR);
            assert.equal((await selectCalls()).length, 2, 'select calls after the click on the covered part of bar 11');
            assert.equal(await hasClass(entryExpr(11), 'ganttItemSelected'), true);
            const closeRect = await elementRect("document.querySelector('.collisionInfoBoxHeaderCloseButton')");
            await click(closeRect.x, closeRect.y);
            await waitFor('!' + OVERLAY_VISIBLE_EXPR);

            const coveringRect = await barRect(11);
            const uncoveredPart = { x: coveringRect.left + GRID_STEP_H1_PX, y: coveringRect.y };
            assert.ok(uncoveredPart.x < collisionRect.left, 'point ' + JSON.stringify(uncoveredPart)
                + ' left of the collision item ' + JSON.stringify(collisionRect));
            assert.equal(await isTopmostAt(barExpr(11), uncoveredPart), true);
            await click(uncoveredPart.x, uncoveredPart.y);
            await afterDrop(0);
            assert.equal(await evaluate(OVERLAY_VISIBLE_EXPR), false, 'overlay after the click on the uncovered part');
            assert.equal((await selectCalls()).length, 3, 'select calls after the click on the uncovered part of bar 11');
            assert.equal(await hasClass(barExpr(11), 'ganttItemSelected'), true);
            assert.equal(await hasClass(barExpr(12), 'ganttItemSelected'), false);
            assert.deepEqual(await eventNames(), ['refresh', 'select', 'select', 'select']);
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
        name: 'scrolling the pane during a drag keeps the bar, its target and the tooltip under the pointer, and the drop '
            + 'sends that target',
        run: async () => {
            await openBoard('scrolled');
            await scrollPane(700, 270);
            await settle();
            assert.deepEqual(await paneScroll(), { left: 700, top: 270, headerLeft: 700, namesTop: 270 });
            const preDrag = await barStyle(21);
            const preDragLeft = parseFloat(preDrag.left);
            const rect = await barRect(21);
            // The pointer ends 25 px, two grid steps, right of the press, over bar 21 moved to 11:00.
            const pointer = { x: rect.x + 2 * GRID_STEP_H1_PX, y: rect.y };

            await hover(rect.x, rect.y);
            await press(rect.x, rect.y);
            await move(rect.x + 5, rect.y);
            await move(pointer.x, pointer.y);
            assert.equal(await elementText(STATUS_REGION_EXPR), 'L12 Start 2026-06-02 11:00:00');
            const dragged = await barStyle(21);
            assert.ok(dragged.classes.includes('ganttItemDragging'), 'classes: ' + dragged.classes.join(' '));
            assert.equal(parseFloat(dragged.left) - preDragLeft, 2 * GRID_STEP_H1_PX);
            const beforeWheel = await barRect(21);

            // A horizontal wheel turn of 100 px, 8 grid steps or 4 hours at H1, with the button held and no pointer move.
            await wheelWithButtonHeld(pointer.x, pointer.y, 100, 0);
            await waitFor('(function () { var wrapper = document.querySelector(".rowsContainerWrapper");'
                + ' var status = ' + STATUS_REGION_EXPR + ';'
                + ' return wrapper.scrollLeft === 800 && status.textContent === "L12 Start 2026-06-02 15:00:00"; }())');
            await settle();
            assert.deepEqual(await paneScroll(), { left: 800, top: 270, headerLeft: 800, namesTop: 270 });
            let tooltip = await waitForVisibleTooltip();
            assert.ok(tooltip.text.includes('2026-06-02 15:00:00') && tooltip.text.includes('L12'),
                'tooltip text after the horizontal wheel: ' + tooltip.text);
            let style = await barStyle(21);
            assert.ok(style.classes.includes('ganttItemDragging'), 'classes: ' + style.classes.join(' '));
            assert.equal(parseFloat(style.left) - preDragLeft, 10 * GRID_STEP_H1_PX, 'left after the horizontal wheel');
            assert.equal(style.top, preDrag.top);
            let after = await barRect(21);
            assert.ok(Math.abs(after.left - beforeWheel.left) < 0.01 && Math.abs(after.top - beforeWheel.top) < 0.01,
                'bar ' + JSON.stringify(after) + ' stays under the pointer at ' + JSON.stringify(beforeWheel));

            // A vertical wheel turn of one row with the button held and no pointer move.
            await wheelWithButtonHeld(pointer.x, pointer.y, 0, ROW_HEIGHT_PX);
            await waitFor('(function () { var wrapper = document.querySelector(".rowsContainerWrapper");'
                + ' var status = ' + STATUS_REGION_EXPR + ';'
                + ' return wrapper.scrollTop === 300 && status.textContent === "L13 Start 2026-06-02 15:00:00"; }())');
            await settle();
            assert.deepEqual(await paneScroll(), { left: 800, top: 300, headerLeft: 800, namesTop: 300 });
            tooltip = await waitForVisibleTooltip();
            assert.ok(tooltip.text.includes('2026-06-02 15:00:00') && tooltip.text.includes('L13'),
                'tooltip text after the vertical wheel: ' + tooltip.text);
            style = await barStyle(21);
            assert.equal(parseFloat(style.left) - preDragLeft, 10 * GRID_STEP_H1_PX, 'left after the vertical wheel');
            assert.equal(style.top, (1 + ROW_HEIGHT_PX) + 'px');
            after = await barRect(21);
            assert.ok(Math.abs(after.left - beforeWheel.left) < 0.01 && Math.abs(after.top - beforeWheel.top) < 0.01,
                'bar ' + JSON.stringify(after) + ' stays under the pointer at ' + JSON.stringify(beforeWheel));

            // The next pointer sample, 1 px further, agrees with the target the scroll gave.
            await move(pointer.x + 1, pointer.y);
            assert.equal(await elementText(STATUS_REGION_EXPR), 'L13 Start 2026-06-02 15:00:00');
            style = await barStyle(21);
            assert.equal(parseFloat(style.left) - preDragLeft, 10 * GRID_STEP_H1_PX, 'left after the 1 px move');
            assert.equal(style.top, (1 + ROW_HEIGHT_PX) + 'px');
            assert.equal((await moveCalls()).length, 0);

            await release(pointer.x + 1, pointer.y);
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.itemId, 21);
            assert.equal(calls[0].payload.row, 'L13');
            assert.equal(calls[0].payload.originalRow, 'L12');
            assert.equal(calls[0].payload.dateFrom, '2026-06-02 15:00:00');
            assert.equal(calls[0].payload.originalDateFrom, '2026-06-02 10:00:00');
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
        name: 'outside the drop area the drag tooltip and the status region hold only the release-to-cancel text and the '
            + 'bar waits at its pre-drag place, a return shows the target again, and a release outside sends nothing',
        run: async () => {
            const cancelledText = MOVE_A11Y_TRANSLATIONS['move.cancelledAnnouncement'];
            const insideText = 'L1 Start 2026-06-01 09:30:00';
            await openBoard('h1', A11Y_OVERRIDES);
            const preDrag = await barStyle(7);
            const rect = await barRect(7);
            const wrapper = await wrapperRect();
            const rows = await rowRects();
            const rowsBottom = rows[rows.length - 1].bottom;
            assert.ok(rowsBottom + 21 < wrapper.bottom, 'rows end at ' + rowsBottom + ' inside the pane ending at '
                + wrapper.bottom);
            const inside = { x: rect.x + 13, y: rect.y };
            const outsidePoints = [
                { label: 'row-name column', x: wrapper.left - 20, y: rect.y, region: '.ganttRowNamesWrapper' },
                { label: 'timeline header', x: rect.x + 13, y: wrapper.top - 15, region: '.ganttTopRow' },
                { label: 'below the rows', x: rect.x + 13, y: rowsBottom + 20, region: '.rowsContainerWrapper' },
                { label: 'below the pane', x: rect.x + 13, y: wrapper.bottom + 20, region: null }
            ];
            // Returns the inline left and top of the chart tooltip.
            const tooltipPosition = () => evaluate('(function () { var tooltip = document.querySelector(".ganttChartTooltip");'
                + ' return {left: tooltip.style.left, top: tooltip.style.top}; }())');
            // Asserts that the tooltip and the status region hold exactly the release-to-cancel text, with no row and no
            // date, and that the bar keeps the drag layer at its pre-drag left and top.
            const assertOutside = async (label) => {
                const tooltip = await waitForVisibleTooltip();
                assert.equal(tooltip.text, RELEASE_TO_CANCEL_TEXT, label + ' tooltip');
                assert.equal(await elementText(STATUS_REGION_EXPR), RELEASE_TO_CANCEL_TEXT, label + ' status');
                const style = await barStyle(7);
                assert.equal(style.left, preDrag.left, label + ' left');
                assert.equal(style.top, preDrag.top, label + ' top');
                assert.ok(style.classes.includes('ganttItemDragging'), label + ' classes: ' + style.classes.join(' '));
                assert.equal(await evaluate('getComputedStyle(' + barExpr(7) + ').zIndex'), '230', label + ' z-index');
            };
            // Asserts that the tooltip and the status region name the target at the inside point and that the bar
            // stands one grid step right of its pre-drag left.
            const assertInside = async (label) => {
                const tooltip = await waitForVisibleTooltip();
                assert.ok(tooltip.text.includes('L1') && tooltip.text.includes('2026-06-01 09:30:00'),
                    label + ' tooltip: ' + tooltip.text);
                assert.equal(await elementText(STATUS_REGION_EXPR), insideText, label + ' status');
                const style = await barStyle(7);
                assert.equal(parseFloat(style.left) - parseFloat(preDrag.left), GRID_STEP_H1_PX, label + ' left');
                assert.equal(style.top, preDrag.top, label + ' top');
            };

            // The first sample past the threshold already lies outside the drop area.
            await press(rect.x, rect.y);
            await move(outsidePoints[0].x, outsidePoints[0].y);
            await assertOutside('first sample in the ' + outsidePoints[0].label);

            for (const point of outsidePoints) {
                await move(inside.x, inside.y);
                await assertInside('inside before the ' + point.label);
                await move(point.x, point.y);
                if (point.region !== null) {
                    assert.equal(await evaluate('!!document.elementFromPoint(' + point.x + ', ' + point.y + ').closest('
                        + JSON.stringify(point.region) + ')'), true, point.label + ' lies in ' + point.region);
                }
                await assertOutside(point.label);
                const firstPosition = await tooltipPosition();
                await move(point.x + 3, point.y + 1);
                await assertOutside(point.label + ', second sample');
                assert.notDeepEqual(await tooltipPosition(), firstPosition, point.label + ' tooltip follows the pointer');
            }

            await move(inside.x, inside.y);
            await assertInside('inside before the release');
            const releasePoint = outsidePoints[0];
            await move(releasePoint.x, releasePoint.y);
            await assertOutside('release point');
            await release(releasePoint.x, releasePoint.y);
            assertRestored(await barStyle(7), preDrag);
            assert.equal((await tooltipState()).visible, false);
            assert.equal(await elementText(STATUS_REGION_EXPR), cancelledText, 'status after the release outside');
            await afterDrop(0);
            assertRestored(await barStyle(7), preDrag);
            assert.deepEqual(await eventNames(), ['refresh']);
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
        name: 'keyboard: Tab reaches a draggable bar as a named, described button with a visible focus ring, bars that cannot '
            + 'move are named tab stops without a description, and a board without moves adds none',
        run: async () => {
            const helpExpr = 'document.getElementById(' + JSON.stringify(GANTT_ID + '_moveHelp') + ')';
            const helpStateExpr = '(function () { var help = ' + helpExpr + ';'
                + ' if (!help) { return null; }'
                + ' var computed = getComputedStyle(help);'
                + ' return {text: help.textContent, className: help.className, parentId: help.parentNode.id,'
                + ' position: computed.position, width: computed.width, height: computed.height,'
                + ' overflow: computed.overflow, clip: computed.clip,'
                + ' count: document.querySelectorAll("#ganttHost .ganttChartMoveHelp").length}; }())';
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
                    className: 'ganttChartMoveHelp',
                    parentId: GANTT_ID,
                    position: 'absolute',
                    width: '1px',
                    height: '1px',
                    overflow: 'hidden',
                    clip: 'rect(0px, 0px, 0px, 0px)',
                    count: 1
                });
                assert.deepEqual(await a11yAttributes(MAINTENANCE_BAR_EXPR), {
                    tabindex: '0',
                    role: 'img',
                    label: MAINTENANCE_BAR_LABEL,
                    describedBy: null
                });

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
                assert.deepEqual(await a11yAttributes(barExpr(7)), {
                    tabindex: '0',
                    role: 'button',
                    label: 'ORD-7, L1, Start 2026-06-01 06:00:00, End 2026-06-01 12:00:00',
                    describedBy: null
                }, 'h6 bar 7');

                await openBoard('moveDisabled', A11Y_OVERRIDES);
                assert.deepEqual(await a11yAttributes(barExpr(7)), noAttributes, 'moveDisabled bar 7');
                assert.deepEqual(await a11yAttributes(MAINTENANCE_BAR_EXPR), noAttributes, 'moveDisabled maintenance bar');
                assert.equal(await evaluate(helpExpr + ' === null'), true, 'keyboard help without item moves');
                assert.equal(await evaluate('document.querySelectorAll("#ganttHost .ganttChartMoveHelp,'
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
                assert.equal(await isFocused(MAINTENANCE_BAR_EXPR), true, 'maintenance bar focus after Tab');
                assertRestored(await barStyle(7), preDrag);
                assert.equal(await elementText(STATUS_REGION_EXPR), cancelledText, 'status after blur');
                const focusTooltip = await tooltipState();
                assert.equal(focusTooltip.visible, true, 'maintenance bar tooltip after blur');
                assert.ok(focusTooltip.text.startsWith('PE-1'), 'tooltip after blur: ' + focusTooltip.text);

                await focusElement(barExpr(7));
                assert.equal((await tooltipState()).visible, false, 'tooltip after the maintenance bar blur');
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
        name: 'keyboard: at H6 and D1 a bar with an id is a named button without a description that Tab reaches and Enter or '
            + 'Space selects, and an arrow key moves nothing',
        run: async () => {
            const labels = {
                h6: 'ORD-7, L1, Start 2026-06-01 06:00:00, End 2026-06-01 12:00:00',
                d1: 'ORD-7, L1, Start 2026-06-02 00:00:00, End 2026-06-03 00:00:00'
            };
            await withFocus(async () => {
                for (const board of ['h6', 'd1']) {
                    await openBoard(board, A11Y_OVERRIDES);
                    assert.deepEqual(await a11yAttributes(barExpr(7)),
                        { tabindex: '0', role: 'button', label: labels[board], describedBy: null }, board);
                    assert.equal(await ariaPressed(barExpr(7)), 'false', board + ' aria-pressed');
                    const preKey = await barStyle(7);
                    assertNotDraggable(preKey);
                    assert.equal(preKey.cursor, 'pointer', board + ' cursor');

                    await tabUntilFocused(barExpr(7));
                    const ring = await focusStyle(barExpr(7));
                    assert.equal(ring.focusVisible, true, board + ' focus-visible');
                    assert.equal(ring.outlineStyle, 'solid', board + ' ring');
                    assert.equal(ring.outlineWidth, '2px', board + ' ring width');
                    assert.equal(ring.zIndex, '220', board + ' focused z-index');

                    await keyPress('Enter');
                    await afterDrop(0);
                    assert.equal((await selectCalls()).length, 1, board + ' select calls after Enter');
                    const selected = await barStyle(7);
                    assert.ok(selected.classes.includes('ganttItemSelected'), board + ' classes: ' + selected.classes.join(' '));
                    assert.equal(await ariaPressed(barExpr(7)), 'true', board + ' aria-pressed after Enter');

                    await keyPress('ArrowRight');
                    await afterDrop(0);
                    const afterArrow = await barStyle(7);
                    assert.ok(!afterArrow.classes.includes('ganttItemDragging'), board + ' classes: '
                        + afterArrow.classes.join(' '));
                    assert.equal(afterArrow.left, preKey.left, board + ' left after ArrowRight');
                    assert.equal(afterArrow.top, preKey.top, board + ' top after ArrowRight');
                    assert.equal((await tooltipState()).visible, false, board + ' tooltip after ArrowRight');
                    assert.equal(await elementText(STATUS_REGION_EXPR), '', board + ' status after ArrowRight');

                    await keyPress('Space');
                    await afterDrop(0);
                    assert.equal((await selectCalls()).length, 2, board + ' select calls after Space');
                    assert.equal(await isFocused(barExpr(7)), true, board + ' focus after the keys');
                    assert.deepEqual(await eventNames(), ['refresh', 'select', 'select'], board + ' events');
                    await assertNoPageErrors();
                }
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'aria-pressed follows the selected bar through Enter, the collision box, a click and a selectedEntityId answer, '
            + 'and a board without moves sets none',
        run: async () => {
            // Returns the aria-pressed attributes of bars 11 and 12.
            const pressedStates = async () => ({ 11: await ariaPressed(barExpr(11)), 12: await ariaPressed(barExpr(12)) });
            await withFocus(async () => {
                await openBoard('covered', A11Y_OVERRIDES);
                assert.deepEqual(await pressedStates(), { 11: 'false', 12: 'false' }, 'initial');

                const collisionRect = await elementRect("document.querySelector('.ganttCollisionItem')");
                await click(collisionRect.x, collisionRect.y);
                await waitFor(OVERLAY_VISIBLE_EXPR);
                const entryRect = await elementRect('document.getElementById('
                    + JSON.stringify(COLLISION_ENTRY_ID_PREFIX + 12) + ')');
                await click(entryRect.x, entryRect.y);
                await waitFor('!' + OVERLAY_VISIBLE_EXPR);
                assert.deepEqual(await pressedStates(), { 11: 'false', 12: 'true' }, 'after choosing bar 12 in the box');
                assert.ok((await barStyle(12)).classes.includes('ganttItemSelected'));

                await focusElement(barExpr(11));
                await keyPress('Enter');
                await afterDrop(0);
                assert.deepEqual(await pressedStates(), { 11: 'true', 12: 'false' }, 'after Enter on bar 11');
                assert.ok((await barStyle(11)).classes.includes('ganttItemSelected'));
                assert.ok(!(await barStyle(12)).classes.includes('ganttItemSelected'));

                await evaluate('(function () { var value = JSON.parse(JSON.stringify(window.__currentBoard));'
                    + ' value.selectedEntityId = 12; window.__gantt.setComponentValue(value); return true; }())');
                await waitFor(IS_UNBLOCKED_EXPR);
                assert.deepEqual(await pressedStates(), { 11: 'false', 12: 'true' }, 'after a selectedEntityId answer');
                assert.ok((await barStyle(12)).classes.includes('ganttItemSelected'));

                const coveringRect = await barRect(11);
                await click(coveringRect.left + 10, coveringRect.y);
                await afterDrop(0);
                assert.deepEqual(await pressedStates(), { 11: 'true', 12: 'false' }, 'after a click on bar 11');
                assert.ok(!(await barStyle(12)).classes.includes('ganttItemSelected'));
                assert.deepEqual(await eventNames(), ['refresh', 'select', 'select', 'select']);
                await assertNoPageErrors();

                await openBoard('moveDisabled', A11Y_OVERRIDES);
                const disabledRect = await barRect(7);
                await click(disabledRect.x, disabledRect.y);
                await afterDrop(0);
                assert.ok((await barStyle(7)).classes.includes('ganttItemSelected'), 'moveDisabled bar 7 selected');
                assert.equal(await ariaPressed(barExpr(7)), null, 'moveDisabled bar 7 aria-pressed');
                assert.deepEqual(await a11yAttributes(barExpr(7)),
                    { tabindex: null, role: null, label: null, describedBy: null }, 'moveDisabled bar 7');
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'keyboard focus scrolls a partly visible bar fully into the pane with the header and row names in sync, a '
            + 'focused covered bar is opaque and topmost up to its ring, and a mouse press scrolls nothing',
        run: async () => {
            // Scrolls the pane of the scrolled board so that bar 21 lies in the visible rows with its right edge 10 px
            // beyond the visible pane, and returns the pane scroll and that overflow.
            const scrollBarPartlyOut = () => evaluate('(function () {'
                + ' var wrapper = document.querySelector(".rowsContainerWrapper"); var bar = ' + barExpr(21) + ';'
                + ' wrapper.scrollTop = 270; wrapper.scrollLeft = 0;'
                + ' var contentRight = bar.getBoundingClientRect().right - wrapper.getBoundingClientRect().left;'
                + ' wrapper.scrollLeft = contentRight - wrapper.clientWidth - 10;'
                + ' wrapper.dispatchEvent(new Event("scroll"));'
                + ' return {left: wrapper.scrollLeft, overflow: bar.getBoundingClientRect().right'
                + ' - (wrapper.getBoundingClientRect().left + wrapper.clientWidth)}; }())');
            // Asserts that a rectangle lies inside the visible pane.
            const assertInsidePane = (rect, pane, label) => {
                assert.ok(rect.left >= pane.left && rect.right <= pane.right && rect.top >= pane.top
                    && rect.bottom <= pane.bottom, label + ': bar ' + JSON.stringify(rect) + ' pane ' + JSON.stringify(pane));
            };
            await withFocus(async () => {
                await openBoard('scrolled', A11Y_OVERRIDES);
                const partly = await scrollBarPartlyOut();
                assert.ok(Math.abs(partly.overflow - 10) <= 1, 'overflow before the focus: ' + JSON.stringify(partly));
                await settle();

                await tabUntilFocused(barExpr(21));
                await settle();
                assertInsidePane(await barRect(21), await wrapperRect(), 'after the keyboard focus');
                const scrolled = await paneScroll();
                assert.ok(scrolled.left > partly.left, 'pane scroll ' + JSON.stringify(scrolled));
                assert.equal(scrolled.headerLeft, scrolled.left, 'time header scroll');
                assert.equal(scrolled.namesTop, scrolled.top, 'row names scroll');
                assert.equal(scrolled.top, 270, 'vertical pane scroll');
                assert.equal((await opacityOf(barExpr(21))).computed, '1', 'focused bar opacity');

                await evaluate('(function () { document.activeElement.blur(); return true; }())');
                const beforePress = await scrollBarPartlyOut();
                await settle();
                const partlyRect = await barRect(21);
                await click(partlyRect.left + 5, partlyRect.y);
                await afterDrop(0);
                assert.equal((await selectCalls()).length, 1, 'select calls after the click');
                assert.equal((await paneScroll()).left, beforePress.left, 'pane scroll after a mouse click');
                await assertNoPageErrors();

                await openBoard('covered', A11Y_OVERRIDES);
                await tabUntilFocused(barExpr(12));
                const rect = await barRect(12);
                assert.deepEqual(await opacityOf(barExpr(12)), { computed: '1', inline: '1' }, 'focused covered bar');
                const ring = await focusStyle(barExpr(12));
                assert.equal(ring.zIndex, '220');
                assert.equal(ring.outlineStyle, 'solid');
                assert.equal(ring.outlineWidth, '2px');
                for (const inset of [1, 3]) {
                    const points = {
                        left: { x: rect.left + inset, y: rect.y },
                        right: { x: rect.right - inset, y: rect.y },
                        top: { x: rect.x, y: rect.top + inset },
                        bottom: { x: rect.x, y: rect.bottom - inset }
                    };
                    for (const [edge, point] of Object.entries(points)) {
                        assert.equal(await isTopmostAt(barExpr(12), point), true, inset + ' px inside the ' + edge + ' edge');
                    }
                }
                assert.equal(await isTopmostAt(barExpr(12), rect), true, 'topmost at the centre');

                await keyPress('ArrowRight');
                assert.deepEqual(await opacityOf(barExpr(12)), { computed: '0.8', inline: '' }, 'keyboard-moved bar');
                await keyPress('Escape');
                assert.deepEqual(await opacityOf(barExpr(12)), { computed: '1', inline: '1' }, 'bar after Escape');

                await evaluate('(function () { document.activeElement.blur(); return true; }())');
                await settle();
                assert.deepEqual(await opacityOf(barExpr(12)), { computed: '0.7', inline: '' }, 'bar after the blur');
                assert.equal((await focusStyle(barExpr(12))).zIndex, 'auto', 'z-index after the blur');
                assert.equal(await isTopmostAt("document.querySelector('.ganttCollisionItem')", rect), true,
                    'collision item topmost after the blur');
                await afterDrop(0);
                assert.deepEqual(await eventNames(), ['refresh']);
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'keyboard: a maintenance bar and a one-hour approved bar are named images that Tab reaches, show their tooltip '
            + 'while keyboard-focused, and neither select nor move',
        run: async () => {
            await withFocus(async () => {
                await openBoard('h1', A11Y_OVERRIDES);
                assert.deepEqual(await a11yAttributes(MAINTENANCE_BAR_EXPR),
                    { tabindex: '0', role: 'img', label: MAINTENANCE_BAR_LABEL, describedBy: null });
                assert.equal(await ariaPressed(MAINTENANCE_BAR_EXPR), null, 'maintenance bar aria-pressed');
                const preKey = await elementStyle(MAINTENANCE_BAR_EXPR);

                const visited = await tabUntilFocused(MAINTENANCE_BAR_EXPR);
                assert.ok(visited.includes('DIV#' + ITEM_ID_PREFIX + 7), 'focus order: ' + visited.join(' > '));
                const tooltip = await waitForVisibleTooltip();
                for (const text of ['PE-1', 'Type: Inspection & cleaning, state: New', 'Requires shutdown: yes',
                    '2026-06-01 12:00:00', '2026-06-01 14:00:00']) {
                    assert.ok(tooltip.text.includes(text), 'tooltip text: ' + tooltip.text);
                }
                const barBottom = (await elementRect(MAINTENANCE_BAR_EXPR)).bottom;
                const tooltipTop = (await elementRect("document.querySelector('#ganttHost .ganttChartTooltip')")).top;
                assert.ok(tooltipTop >= barBottom, 'tooltip top ' + tooltipTop + ', bar bottom ' + barBottom);
                assert.equal(await elementText(STATUS_REGION_EXPR), '', 'status with the focus tooltip');
                assert.equal(await elementText(ALERT_REGION_EXPR), '', 'alert with the focus tooltip');
                const ring = await focusStyle(MAINTENANCE_BAR_EXPR);
                assert.equal(ring.outlineStyle, 'solid');
                assert.equal(ring.zIndex, '220');
                assert.equal((await opacityOf(MAINTENANCE_BAR_EXPR)).computed, '1');

                for (const key of ['Enter', 'Space', 'ArrowRight']) {
                    await keyPress(key);
                    await afterDrop(0);
                    const style = await elementStyle(MAINTENANCE_BAR_EXPR);
                    assert.ok(!style.classes.includes('ganttItemSelected') && !style.classes.includes('ganttItemDragging'),
                        key + ' classes: ' + style.classes.join(' '));
                    assert.equal(style.left, preKey.left, key + ' left');
                    assert.equal(style.top, preKey.top, key + ' top');
                    assert.equal(await isFocused(MAINTENANCE_BAR_EXPR), true, key + ' focus');
                    assert.ok((await tooltipState()).text.startsWith('PE-1'), key + ' tooltip');
                }
                assert.deepEqual(await eventNames(), ['refresh']);

                await keyPress('Escape');
                assert.equal((await tooltipState()).visible, false, 'tooltip after Escape');
                assert.equal(await isFocused(MAINTENANCE_BAR_EXPR), true, 'focus after Escape');

                await focusElement(barExpr(7));
                await keyPress('Tab');
                assert.equal(await isFocused(MAINTENANCE_BAR_EXPR), true, 'focus after Tab from bar 7');
                assert.equal((await waitForVisibleTooltip()).text.startsWith('PE-1'), true);
                await evaluate('(function () { document.activeElement.blur(); return true; }())');
                await settle();
                assert.equal((await tooltipState()).visible, false, 'tooltip after the blur');
                assert.deepEqual(await opacityOf(MAINTENANCE_BAR_EXPR), { computed: '0.7', inline: '' });

                await focusElement(barExpr(7));
                await keyPress('Tab');
                assert.ok((await waitForVisibleTooltip()).text.startsWith('PE-1'));
                const orderRect = await barRect(7);
                await hover(orderRect.x, orderRect.y);
                const hovered = await waitForVisibleTooltip();
                assert.ok(hovered.text.startsWith('ORD-7'), 'tooltip over bar 7: ' + hovered.text);
                await hover(PARK_POINT.x, PARK_POINT.y);
                assert.equal((await tooltipState()).visible, false, 'tooltip after the mouse left bar 7');

                await evaluate('(function () { document.activeElement.blur(); return true; }())');
                const maintenanceRect = await elementRect(MAINTENANCE_BAR_EXPR);
                await click(maintenanceRect.x, maintenanceRect.y);
                await hover(PARK_POINT.x, PARK_POINT.y);
                assert.equal(await isFocused(MAINTENANCE_BAR_EXPR), true, 'focus after a mouse click');
                const mouseFocus = await focusStyle(MAINTENANCE_BAR_EXPR);
                assert.equal(mouseFocus.focusVisible, false, 'focus-visible after a mouse click');
                assert.equal(mouseFocus.zIndex, 'auto', 'z-index after a mouse click');
                assert.equal(mouseFocus.outlineStyle, 'none', 'ring after a mouse click');
                assert.deepEqual(await opacityOf(MAINTENANCE_BAR_EXPR), { computed: '0.7', inline: '' });
                assert.equal((await tooltipState()).visible, false, 'tooltip after a mouse click');
                assert.deepEqual(await eventNames(), ['refresh']);
                await assertNoPageErrors();

                await openBoard('approved', A11Y_OVERRIDES);
                assert.deepEqual(await a11yAttributes(APPROVED_BAR_EXPR), {
                    tabindex: '0',
                    role: 'img',
                    label: 'ORD-31, Product: PRD-31 - Bolt & nut, L1, Start 2026-06-01 09:00:00, End 2026-06-01 10:00:00',
                    describedBy: null
                });
                assert.equal(await elementText(APPROVED_BAR_EXPR), 'ORD-31', 'approved bar text');
                const approvedWidth = (await elementRect(APPROVED_BAR_EXPR)).width;
                assert.ok(approvedWidth <= 30, 'approved bar width ' + approvedWidth + ' px cuts its label');
                assert.equal(await ariaPressed(APPROVED_BAR_EXPR), null, 'approved bar aria-pressed');
                const approvedStyle = await elementStyle(APPROVED_BAR_EXPR);
                assertNotDraggable(approvedStyle);
                assert.equal(approvedStyle.cursor, '', 'approved bar cursor');
                assert.equal(await evaluate(APPROVED_BAR_EXPR + '.hasAttribute("id")'), false, 'approved bar id');
                await tabUntilFocused(APPROVED_BAR_EXPR);
                const approvedTooltip = await waitForVisibleTooltip();
                assert.ok(approvedTooltip.text.includes('Product: PRD-31 - Bolt & nut'), 'tooltip: ' + approvedTooltip.text);
                await keyPress('Enter');
                await afterDrop(0);
                assert.deepEqual(await eventNames(), ['refresh']);
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'bars of a board with moves bind no pointer, key or focus handler of their own, the rows container holds each '
            + 'delegated handler once across re-renders, and names without character references create no textarea',
        run: async () => {
            // Asserts that the element of a page expression handles none of DELEGATED_EVENT_TYPES itself.
            const assertNoOwnHandlers = async (elementExpr, label) => {
                const jqueryTypes = Object.keys(await jqueryHandlers(elementExpr));
                const nativeTypes = await nativeListenerTypes(elementExpr);
                for (const type of DELEGATED_EVENT_TYPES) {
                    assert.ok(!jqueryTypes.includes(type), label + ' jQuery types: ' + jqueryTypes.join(' '));
                    assert.ok(!nativeTypes.includes(type), label + ' native types: ' + nativeTypes.join(' '));
                }
            };
            const delegated = {
                pointerdown: ['.ganttItemDraggable'],
                pointermove: ['.ganttItemDraggable'],
                pointerup: ['.ganttItemDraggable'],
                pointercancel: ['.ganttItemDraggable'],
                lostpointercapture: ['.ganttItemDraggable'],
                keydown: ['.ganttItem[tabindex]'],
                pointerover: ['.ganttItem']
            };
            // Asserts that the rows container holds exactly the delegated jQuery handlers and one native focusin and
            // focusout listener.
            const assertDelegation = async (label) => {
                assert.deepEqual(await jqueryHandlers(ROWS_CONTAINER_EXPR), delegated, label);
                const nativeTypes = await nativeListenerTypes(ROWS_CONTAINER_EXPR);
                assert.equal(nativeTypes.filter((type) => type === 'focusin').length, 1, label + ': ' + nativeTypes.join(' '));
                assert.equal(nativeTypes.filter((type) => type === 'focusout').length, 1, label + ': ' + nativeTypes.join(' '));
            };

            await openBoard('h1', A11Y_OVERRIDES);
            assertDraggable(await barStyle(7));
            await assertNoOwnHandlers(barExpr(7), 'bar 7');
            await assertNoOwnHandlers(MAINTENANCE_BAR_EXPR, 'maintenance bar');
            await assertDelegation('first render');
            await rerenderBoard();
            await assertNoOwnHandlers(barExpr(7), 'bar 7 after a re-render');
            await assertDelegation('after a re-render');
            await assertNoPageErrors();

            await openBoard('moveDisabled', A11Y_OVERRIDES);
            assert.deepEqual(await jqueryHandlers(ROWS_CONTAINER_EXPR), {}, 'moveDisabled rows container');
            const disabledTypes = await nativeListenerTypes(ROWS_CONTAINER_EXPR);
            assert.ok(!disabledTypes.includes('focusin') && !disabledTypes.includes('focusout'),
                'moveDisabled rows container native types: ' + disabledTypes.join(' '));
            await assertNoOwnHandlers(barExpr(7), 'moveDisabled bar 7');
            await assertNoPageErrors();

            await navigate(FIXTURE_URL);
            await evaluate('(function () { var createElement = document.createElement; window.__textareaCount = 0;'
                + ' document.createElement = function (tagName) {'
                + ' if (String(tagName).toLowerCase() === "textarea") { window.__textareaCount += 1; }'
                + ' return createElement.apply(document, arguments); }; return true; }())');
            await evaluate('window.__loadBoard("h3", ' + JSON.stringify(A11Y_OVERRIDES) + ')');
            await waitFor("window.__lastResponseApplied && __lastResponseApplied.eventName === 'refresh'");
            await waitFor(IS_UNBLOCKED_EXPR);
            assert.equal((await a11yAttributes(barExpr(7))).label,
                'ORD-7, L1, Start 2026-06-01 09:00:00, End 2026-06-01 12:00:00');
            await rerenderBoard();
            assert.equal(await evaluate('window.__textareaCount'), 0, 'textareas for names without references');

            await evaluate('(function () { var board = window.__boardFor("h3"); board.items[0].info.name = "ORD&amp;7";'
                + ' window.__currentBoard = board; return true; }())');
            await rerenderBoard();
            assert.equal((await a11yAttributes(barExpr(7))).label,
                'ORD&7, L1, Start 2026-06-01 09:00:00, End 2026-06-01 12:00:00');
            await rerenderBoard();
            assert.equal(await evaluate('window.__textareaCount'), 1, 'textareas after two re-renders of an encoded name');
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
            const anchor = await elementRect(TOOLTIP_EXPR);
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
            const anchor = await elementRect(TOOLTIP_EXPR);
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
        name: 'a press whose bar cannot capture the pointer starts no drag and sends nothing',
        run: async () => {
            await openBoard('h1');
            await evaluate('window.__pressDebugMessages = []; (function () { var debug = QCD.debug;'
                + ' QCD.debug = function (message) { window.__pressDebugMessages.push(String(message)); debug(message); };'
                + ' }()); true');
            // Returns the recorded QCD.debug messages of ignored presses and clears the record.
            const takeIgnoredPressMessages = async () => (await evaluate('window.__pressDebugMessages.splice(0)'))
                .filter((message) => message.startsWith('Gantt item press ignored: '));
            const preDrag = await barStyle(7);
            // Own setPointerCapture properties of bar 7 under which a press cannot capture the pointer, each with the
            // QCD.debug message the ignored press logs.
            const captureOverrides = [
                {
                    description: 'no setPointerCapture method',
                    valueExpr: 'undefined',
                    message: /cannot be captured: the item has no setPointerCapture method$/
                },
                {
                    description: 'a setPointerCapture that throws',
                    valueExpr: 'function () { throw new Error("capture refused by the DOM case"); }',
                    message: /cannot be captured: Error: capture refused by the DOM case$/
                },
                {
                    description: 'a setPointerCapture that leaves hasPointerCapture false',
                    valueExpr: 'function () {}',
                    message: /is not captured by the item$/
                }
            ];

            for (const { description, valueExpr, message } of captureOverrides) {
                await evaluate(barExpr(7) + '.setPointerCapture = ' + valueExpr + '; true');
                assert.equal(await evaluate('Object.prototype.hasOwnProperty.call(' + barExpr(7) + ', "setPointerCapture")'),
                    true, description + ': own setPointerCapture');
                const last = await drag(await barRect(7), horizontalSteps(10, 40), { release: false });
                const held = await barStyle(7);
                assert.equal(held.left, preDrag.left, description + ': left during the drag');
                assert.equal(held.top, preDrag.top, description + ': top during the drag');
                assert.ok(!held.classes.includes('ganttItemDragging'),
                    description + ': classes during the drag: ' + held.classes.join(' '));
                await release(last.x, last.y);
                await afterDrop(0);
                assertRestored(await barStyle(7), preDrag);
                const ignoredPressMessages = await takeIgnoredPressMessages();
                assert.equal(ignoredPressMessages.length, 1, description + ': ' + JSON.stringify(ignoredPressMessages));
                assert.match(ignoredPressMessages[0], message, description);
            }

            assert.equal(await evaluate('delete ' + barExpr(7) + '.setPointerCapture'), true);
            assert.equal(await evaluate('typeof ' + barExpr(7) + '.setPointerCapture'), 'function');
            await drag(await barRect(7), [[13, 0]]);
            const calls = await afterDrop(1);
            assert.equal(calls[0].payload.itemId, 7);
            assert.equal(calls[0].payload.dateFrom, '2026-06-01 09:30:00');
            assert.deepEqual(await takeIgnoredPressMessages(), []);
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
    },
    {
        name: 'bar labels on a move-enabled board stay inside their bars on one line from one left inset, end in an '
            + 'ellipsis when cut, and a 1-hour bar at H1 shows its label',
        run: async () => {
            await openBoard('labels');
            const maintenanceBarExpr = (index) => rowItemExpr(LABELS_ROWS.PMG_B, '.ganttItem:not([id])', index);
            const labelled = [
                { expr: barExpr(202), text: 'PMG-labels-A1', cut: true },
                { expr: barExpr(203), text: 'PMG-labels-A2', cut: true },
                { expr: barExpr(204), text: 'PMG-labels-A3', cut: true },
                { expr: barExpr(205), text: LONG_ORDER_NUMBER, cut: true },
                { expr: maintenanceBarExpr(0), text: 'PMG-QA-SHUT', cut: true },
                { expr: maintenanceBarExpr(1), text: 'PMG-EV-SHUTDOWN', cut: true },
                { expr: barExpr(211), text: 'ORD-9', cut: false }
            ];
            for (const bar of labelled) {
                const state = await itemLabelState(bar.expr);
                const context = bar.text + ' ' + JSON.stringify(state);
                assert.equal(state.text, bar.text, context);
                assertFittedLabel(state, bar.text);
                assert.equal(state.paddingLeft, '3px', context);
                assert.equal(state.paddingRight, '3px', context);
                assert.ok(Math.abs(state.textLeft - LABEL_TEXT_INSET_PX) < 0.01, context);
                assert.equal(state.scrollWidth > state.clientWidth, bar.cut, context);
            }

            const halfHour = await itemLabelState(barExpr(201));
            assert.equal(halfHour.text, '', JSON.stringify(halfHour));
            assertRectInside(halfHour.label, halfHour.item, 'PMG-labels-A0');
            await assertNoPageErrors();
        }
    },
    {
        name: 'a narrow collision on a move-enabled board shows only its icon inside its box and leaves the event to its '
            + 'right hoverable, and wider collisions keep their label inside with an ellipsis when cut',
        run: async () => {
            await openBoard('labels');
            const collisionExpr = (rowIndex) => rowItemExpr(rowIndex, '.ganttCollisionItem');
            const narrow = await itemLabelState(collisionExpr(LABELS_ROWS.PMG_C));
            const narrowContext = 'narrow collision ' + JSON.stringify(narrow);
            assert.ok(narrow.classes.includes('withIcon'), narrowContext);
            assert.equal(narrow.text, '', narrowContext);
            assert.equal(narrow.itemOverflow, 'hidden', narrowContext);
            for (const rect of narrow.descendants) {
                assertRectInside(rect, narrow.item, 'narrow collision descendant');
            }

            const eventExpr = rowItemExpr(LABELS_ROWS.PMG_C, '.ganttItem:not([id])');
            const eventRect = await elementRect(eventExpr);
            const besideCollision = { x: narrow.item.right + 3, y: (narrow.item.top + narrow.item.bottom) / 2 };
            assert.ok(besideCollision.x < eventRect.right, JSON.stringify(besideCollision) + ' ' + JSON.stringify(eventRect));
            assert.equal(await isTopmostAt(eventExpr, besideCollision), true, 'event topmost beside the collision');
            await hover(besideCollision.x, besideCollision.y);
            const eventStyle = await elementStyle(eventExpr);
            assert.ok(eventStyle.classes.includes('ganttItemHovered'), 'classes: ' + eventStyle.classes.join(' '));
            const eventTooltip = await waitForVisibleTooltip();
            assert.ok(eventTooltip.text.includes('PMG-EV-DIVISION'), 'tooltip text: ' + eventTooltip.text);
            await hover(PARK_POINT.x, PARK_POINT.y);
            assert.equal(await isTopmostAt(collisionExpr(LABELS_ROWS.PMG_C),
                { x: narrow.item.right - 3, y: besideCollision.y }), true, 'collision topmost inside its box');

            for (const wide of [{ row: LABELS_ROWS.PMG_D, cut: false }, { row: LABELS_ROWS.PMG_E, cut: true }]) {
                const state = await itemLabelState(collisionExpr(wide.row));
                const context = 'collision on row ' + wide.row + ' ' + JSON.stringify(state);
                assert.equal(state.text, 'Collision', context);
                assert.ok(state.classes.includes('withIcon'), context);
                assert.equal(state.itemOverflow, 'hidden', context);
                assertFittedLabel(state, 'collision on row ' + wide.row);
                assert.equal(state.paddingLeft, '32px', context);
                assert.equal(state.paddingRight, '3px', context);
                assert.ok(Math.abs(state.textLeft - COLLISION_TEXT_INSET_PX) < 0.01, context);
                assert.equal(state.scrollWidth > state.clientWidth, wide.cut, context);
                for (const rect of state.descendants) {
                    assertRectInside(rect, state.item, 'collision descendant on row ' + wide.row);
                }
            }
            await assertNoPageErrors();
        }
    },
    {
        name: 'long row labels on a move-enabled board stay on one line with an ellipsis and carry the full row name as '
            + 'a title, and short ones stay centred beside their rows',
        run: async () => {
            await openBoard('labels');
            const names = await rowNameStates();
            assert.deepEqual(names.map((name) => name.text), await evaluate('window.__boards.labels.board.rows.slice()'));
            const longNames = ['PMG line with a long spaced number', 'PMG-UXL-LONG-NUMBER-WITHOUT-SPACES-0123456789',
                'PMG line with a long spaced number that the row names column cannot show in full'];
            for (const name of names) {
                const context = JSON.stringify(name);
                assert.equal(name.title, name.text, context);
                assert.equal(name.whiteSpace, 'nowrap', context);
                assert.equal(name.overflowX, 'hidden', context);
                assert.equal(name.overflowY, 'hidden', context);
                assert.equal(name.textOverflow, 'ellipsis', context);
                assert.equal(name.paddingLeft, '3px', context);
                assert.equal(name.paddingRight, '3px', context);
                assert.equal(name.clientHeight, name.lineHeight, context);
                assert.ok(name.scrollHeight <= name.clientHeight, context);
                assert.ok(Math.abs(name.top - name.rowTop) < 0.01 && Math.abs(name.bottom - name.rowBottom) < 0.01, context);
                if (longNames.includes(name.text)) {
                    assert.ok(name.scrollWidth > name.clientWidth, context);
                } else {
                    assert.ok(name.scrollWidth <= name.clientWidth, context);
                    assert.ok(Math.abs((name.textLeft + name.textRight) / 2 - (name.left + name.right) / 2) <= 0.5, context);
                }
            }
            await assertNoPageErrors();
        }
    },
    {
        name: 'at the bottom of the pane of a move-enabled board the row names viewport matches the rows viewport and '
            + 'shows the last row name in full beside its row, with the default, an 11 px and a hidden scroll bar',
        run: async () => {
            await openBoard('labels');
            // Replaces the scroll bar style of the rows pane and resizes the chart to the fixture host, as a layout
            // change does.
            const setPaneScrollBarStyle = (css) => evaluate('(function () {'
                + ' var style = document.getElementById("paneScrollBarStyle");'
                + ' if (!style) { style = document.createElement("style"); style.id = "paneScrollBarStyle";'
                + ' document.head.appendChild(style); }'
                + ' style.textContent = ' + JSON.stringify(css) + ';'
                + ' window.__gantt.updateSize(800, 300); return true; }())');
            const scrollBars = [
                { label: 'default scroll bar', css: null, height: null },
                { label: '11 px scroll bar', css: '.rowsContainerWrapper::-webkit-scrollbar { width: 11px; height: 11px; }',
                    height: 11 },
                { label: 'hidden scroll bar', css: '.rowsContainerWrapper { scrollbar-width: none; }', height: 0 }
            ];
            for (const scrollBar of scrollBars) {
                if (scrollBar.css !== null) {
                    await setPaneScrollBarStyle(scrollBar.css);
                    await settle();
                }
                const state = await scrollPaneToBottom();
                const context = scrollBar.label + ' ' + JSON.stringify(state);
                if (scrollBar.height !== null) {
                    assert.equal(state.paneScrollBar, scrollBar.height, context);
                }
                assert.ok(state.paneScrollTop > 0, context);
                assert.equal(state.namesClientHeight, state.paneClientHeight, context);
                assert.equal(state.namesScrollHeight, state.paneScrollHeight, context);
                assert.equal(state.namesScrollTop, state.paneScrollTop, context);
                assert.ok(Math.abs(state.lastName.top - state.lastRow.top) < 0.01, 'top ' + context);
                assert.ok(Math.abs(state.lastName.bottom - state.lastRow.bottom) < 0.01, 'bottom ' + context);
                assert.ok(state.lastName.bottom <= state.namesBottom + 0.01, context);
                assert.ok(state.lastRow.bottom <= state.paneBottom + 0.01, context);
            }
            await assertNoPageErrors();
        }
    },
    {
        name: 'boards without item moves keep the previous bar label, collision label, row name, cell and row names '
            + 'viewport rendering',
        run: async () => {
            // Inline properties that the label fitting of move-enabled boards sets on labels and row names.
            const fittedStyle = /white-space|overflow|text-align|right|padding/;
            // Returns the style attributes of every cell and the row names viewport height against the rows pane's
            // offset height and horizontal overflow.
            const layoutState = () => evaluate('(function () { var pane = document.querySelector(".rowsContainerWrapper");'
                + ' return {cellStyles: Array.prototype.map.call(document.querySelectorAll(".ganttCellElement"),'
                + ' function (cell) { return cell.getAttribute("style"); }),'
                + ' namesClientHeight: document.querySelector(".ganttRowNamesConteiner").clientHeight,'
                + ' paneOffsetHeight: pane.offsetHeight,'
                + ' paneOverflows: document.querySelector(".rowsContainer").offsetWidth > pane.offsetWidth}; }())');
            // Asserts the previous row name, cell and row names viewport rendering of the loaded board.
            const assertPreviousRows = async (board) => {
                for (const name of await rowNameStates()) {
                    const context = board + ' row name ' + JSON.stringify(name);
                    assert.equal(name.title, null, context);
                    assert.ok(!fittedStyle.test(name.style), context);
                    assert.equal(name.whiteSpace, 'normal', context);
                }
                const layout = await layoutState();
                assert.ok(layout.cellStyles.length > 0, board);
                for (const style of layout.cellStyles) {
                    assert.ok(!/vertical-align/.test(style), board + ' cell style ' + style);
                }
                assert.equal(layout.paneOverflows, true, board + ' ' + JSON.stringify(layout));
                assert.equal(layout.namesClientHeight, layout.paneOffsetHeight - 16, board + ' ' + JSON.stringify(layout));
            };

            await openBoard('moveDisabled');
            const hourBar = await itemLabelState(barExpr(7));
            assert.equal(hourBar.text, '', JSON.stringify(hourBar));
            assert.ok(!fittedStyle.test(hourBar.labelStyle), JSON.stringify(hourBar));
            const maintenance = await itemLabelState(MAINTENANCE_BAR_EXPR);
            assert.equal(maintenance.text, 'PE-1', JSON.stringify(maintenance));
            assert.ok(!fittedStyle.test(maintenance.labelStyle), JSON.stringify(maintenance));
            assert.equal(maintenance.whiteSpace, 'normal', JSON.stringify(maintenance));
            await assertPreviousRows('moveDisabled');
            await assertNoPageErrors();

            await openBoard('labels', { options: { allowItemMove: false } });
            assert.equal((await itemLabelState(barExpr(202))).text, '');
            const threeHours = await itemLabelState(barExpr(204));
            assert.equal(threeHours.text, 'PMG-labels-A3', JSON.stringify(threeHours));
            assert.ok(!fittedStyle.test(threeHours.labelStyle), JSON.stringify(threeHours));
            assert.equal(threeHours.whiteSpace, 'normal', JSON.stringify(threeHours));
            const narrow = await itemLabelState(rowItemExpr(LABELS_ROWS.PMG_C, '.ganttCollisionItem'));
            assert.equal(narrow.text, 'Collision', JSON.stringify(narrow));
            assert.equal(narrow.itemOverflow, 'visible', JSON.stringify(narrow));
            assert.equal(narrow.itemInlineOverflow, '', JSON.stringify(narrow));
            assert.ok(!fittedStyle.test(narrow.labelStyle), JSON.stringify(narrow));
            await assertPreviousRows('labels without item moves');
            await assertNoPageErrors();
        }
    },
    {
        name: 'a rejection tooltip sits 20 px below the restored bar and centred on it, and near the bottom of the window '
            + '20 px above the bar without covering it',
        run: async () => {
            // Drags bar 7 four grid steps to the right, has the drop rejected and returns the viewport rectangles of
            // the restored bar and of the rejection tooltip.
            const rejectDrag = async () => {
                await setNextMoveResponse({ kind: 'rejected', message: 'Outside working hours' });
                const preDrag = await barStyle(7);
                await drag(await barRect(7), horizontalSteps(10, 40));
                await afterDrop(1);
                assertRestored(await barStyle(7), preDrag);
                const rejection = await waitForVisibleTooltip();
                assert.ok(rejection.text.includes('Outside working hours'), 'tooltip text: ' + rejection.text);
                const placed = { bar: await barRect(7), tooltip: await elementRect(TOOLTIP_EXPR) };
                assert.equal((await tooltipState()).visible, true, 'rejection tooltip while measured');
                await waitFor(IS_UNBLOCKED_EXPR);
                return placed;
            };

            await openBoard('h1');
            const below = await rejectDrag();
            assert.ok(Math.abs(below.tooltip.top - (below.bar.bottom + 20)) <= 1,
                'tooltip top ' + below.tooltip.top + ', bar bottom ' + below.bar.bottom);
            assert.ok(Math.abs(below.tooltip.x - below.bar.x) <= 1,
                'tooltip centre ' + below.tooltip.x + ', bar centre ' + below.bar.x);
            assert.equal(rectsOverlap(below.tooltip, below.bar), false, JSON.stringify(below));
            await assertNoPageErrors();

            const height = Math.ceil(below.bar.bottom) + 60;
            assert.ok(below.bar.top - 20 - below.tooltip.height >= 0, 'room above the bar: ' + JSON.stringify(below));
            await withViewport(VIEWPORT.width, height, async () => {
                await openBoard('h1');
                const size = await windowSize();
                assert.equal(size.clientHeight, height, 'window size: ' + JSON.stringify(size));
                const above = await rejectDrag();
                assert.ok(above.bar.bottom + 20 + above.tooltip.height > size.clientHeight - 20,
                    'a tooltip below the bar would pass the bottom margin: ' + JSON.stringify(above));
                assert.equal(rectsOverlap(above.tooltip, above.bar), false, JSON.stringify(above));
                assert.ok(Math.abs(above.tooltip.bottom - (above.bar.top - 20)) <= 1,
                    'tooltip bottom ' + above.tooltip.bottom + ', bar top ' + above.bar.top);
                assert.ok(Math.abs(above.tooltip.x - above.bar.x) <= 1,
                    'tooltip centre ' + above.tooltip.x + ', bar centre ' + above.bar.x);
                assert.equal(await isTopmostWithTooltipHitAt(barExpr(7), above.bar), true, 'bar topmost at its centre');
                await assertNoPageErrors();
            });
        }
    },
    {
        name: 'near the right edge of the window the drag tooltip and the rejection tooltip that follows it keep the 40 px '
            + 'margin',
        run: async () => {
            const message = 'Shutdown window PMG-QA-SHUT overlaps the target slot of line L1 from 10:30 to 11:30';
            await openBoard('h1');
            const width = Math.round((await barRect(7)).right + 60);
            await withViewport(width, VIEWPORT.height, async () => {
                await openBoard('h1');
                const size = await windowSize();
                assert.equal(size.clientWidth, width, 'window size: ' + JSON.stringify(size));
                assert.equal(size.innerWidth, width, 'window size: ' + JSON.stringify(size));
                const limit = width - 40;
                await setNextMoveResponse({ kind: 'rejected', message });
                const preDrag = await barStyle(7);
                const bar = await barRect(7);

                await drag(bar, horizontalSteps(10, 40), { release: false });
                const dragState = await waitForVisibleTooltip();
                assert.ok(dragState.text.includes('2026-06-01 10:30:00'), 'drag tooltip text: ' + dragState.text);
                const dragTooltip = await elementRect(TOOLTIP_EXPR);
                assert.ok(bar.x + 40 + dragTooltip.width / 2 > limit,
                    'a drag tooltip centred on the pointer would pass the margin: ' + JSON.stringify(dragTooltip));
                assert.ok(Math.abs(dragTooltip.right - limit) <= 0.01,
                    'drag tooltip right ' + dragTooltip.right + ', window width ' + width);

                await release(bar.x + 40, bar.y);
                await afterDrop(1);
                assertRestored(await barStyle(7), preDrag);
                const rejection = await waitForVisibleTooltip();
                assert.ok(rejection.text.includes(message), 'tooltip text: ' + rejection.text);
                const rejectionTooltip = await elementRect(TOOLTIP_EXPR);
                const restored = await barRect(7);
                assert.ok(Math.abs(rejectionTooltip.right - limit) <= 0.01,
                    'rejection tooltip right ' + rejectionTooltip.right + ', window width ' + width);
                assert.ok(rejectionTooltip.left >= 20, 'rejection tooltip left ' + rejectionTooltip.left);
                assert.ok(Math.abs(rejectionTooltip.top - (restored.bottom + 20)) <= 1,
                    'rejection tooltip top ' + rejectionTooltip.top + ', bar bottom ' + restored.bottom);
                await waitFor(IS_UNBLOCKED_EXPR);
                await assertNoPageErrors();
            });
        }
    },
    {
        name: 'on a move-enabled board the tooltip takes the stylesheet z-index 300 above the collision overlay and lets '
            + 'pointer events pass, and a board without moves keeps the inline z-index 100 and its placement',
        run: async () => {
            const overlayExpr = "document.querySelector('.collisionInfoBoxOverlay')";
            await openBoard('covered');
            const moveLayout = await tooltipStyle();
            assert.equal(moveLayout.inlineZIndex, '', JSON.stringify(moveLayout));
            assert.equal(moveLayout.zIndex, '300', JSON.stringify(moveLayout));
            assert.equal(moveLayout.inlinePointerEvents, 'none', JSON.stringify(moveLayout));
            assert.equal(moveLayout.pointerEvents, 'none', JSON.stringify(moveLayout));
            assert.equal(moveLayout.inlineOverflowWrap, 'anywhere', JSON.stringify(moveLayout));
            assert.equal(moveLayout.inlineWordBreak, 'break-word', JSON.stringify(moveLayout));

            await setNextMoveResponse({ kind: 'rejected', message: 'Shutdown window E-1', hold: true });
            const bar = await barRect(11);
            const grab = { x: bar.left + 12, y: bar.y };
            assert.equal(await isTopmostAt(barExpr(11), grab), true, 'bar 11 topmost at ' + JSON.stringify(grab));
            await drag(grab, horizontalSteps(10, 40));
            await waitFor('window.__calls.filter(function (call) { return call.eventName === "moveItem"; })'
                + '.length === 1');
            await hover(PARK_POINT.x, PARK_POINT.y);
            await evaluate('jQuery(document.querySelector(".ganttCollisionItem")).click(); true');
            await waitFor(OVERLAY_VISIBLE_EXPR);
            assert.equal(await evaluate('window.__releaseHeldMove()'), true);
            await afterDrop(1);
            const rejection = await waitForVisibleTooltip();
            assert.ok(rejection.text.includes('Shutdown window E-1'), 'tooltip text: ' + rejection.text);
            await waitFor(IS_UNBLOCKED_EXPR);
            assert.equal(await evaluate(OVERLAY_VISIBLE_EXPR), true, 'overlay after the rejection');

            const tooltip = await elementRect(TOOLTIP_EXPR);
            const overlay = await elementRect(overlayExpr);
            assert.ok(rectsOverlap(tooltip, overlay),
                'tooltip ' + JSON.stringify(tooltip) + ', overlay ' + JSON.stringify(overlay));
            const shown = await tooltipStyle();
            assert.equal(shown.inlineZIndex, '', JSON.stringify(shown));
            assert.equal(shown.zIndex, '300', JSON.stringify(shown));
            assert.equal(shown.pointerEvents, 'none', JSON.stringify(shown));
            assert.equal(await isTopmostWithTooltipHitAt(TOOLTIP_EXPR, tooltip), true, 'tooltip above the overlay');
            assert.equal(await isTopmostAt(overlayExpr, tooltip), true, 'pointer events pass to the overlay');
            assert.equal((await tooltipStyle()).inlinePointerEvents, 'none',
                'inline pointer-events after the hit test');
            await assertNoPageErrors();

            await openBoard('moveDisabled');
            const legacy = await tooltipStyle();
            assert.equal(legacy.inlineZIndex, '100', JSON.stringify(legacy));
            assert.equal(legacy.zIndex, '100', JSON.stringify(legacy));
            assert.equal(legacy.inlinePointerEvents, '', JSON.stringify(legacy));
            assert.equal(legacy.pointerEvents, 'auto', JSON.stringify(legacy));
            assert.equal(legacy.inlineOverflowWrap, '', JSON.stringify(legacy));
            assert.equal(legacy.inlineWordBreak, '', JSON.stringify(legacy));
            const rect = await barRect(7);
            const point = { x: Math.round(rect.x), y: Math.round(rect.y) };
            await hover(point.x, point.y);
            await waitForVisibleTooltip();
            const placed = await tooltipStyle();
            assert.ok(Math.abs(parseFloat(placed.left) - (point.x - placed.contentWidth / 2)) <= 1,
                'legacy tooltip left ' + placed.left + ', content width ' + placed.contentWidth
                + ', pointer ' + point.x);
            assert.equal(parseFloat(placed.top), point.y + 20,
                'legacy tooltip top ' + placed.top + ', pointer ' + point.y);
            await assertNoPageErrors();
        }
    },
    {
        name: "a hover moved straight down from a bar onto the bar in the next row shows the lower bar's tooltip at "
            + 'once',
        run: async () => {
            const board = await evaluate('window.__boardFor("h1")');
            const lowerBar = JSON.parse(JSON.stringify(board.items.find((item) => item.id === 7)));
            lowerBar.row = 'L2';
            lowerBar.id = 9;
            lowerBar.info.name = 'ORD-9';
            lowerBar.info.tooltip.header = 'ORD-9';
            await openBoard('h1', { board: { items: board.items.concat([lowerBar]) } });
            assertDraggable(await barStyle(9));
            const upper = await barRect(7);
            const lower = await barRect(9);
            assert.ok(Math.abs(lower.x - upper.x) < 0.5 && Math.abs(lower.y - upper.y - ROW_HEIGHT_PX) < 0.5,
                'bars ' + JSON.stringify({ upper, lower }));

            const point = { x: Math.round(upper.x), y: Math.round(upper.y) };
            await hover(point.x, point.y);
            const upperTooltip = await waitForVisibleTooltip();
            assert.ok(upperTooltip.text.includes('ORD-7'), 'tooltip text: ' + upperTooltip.text);
            const tooltip = await elementRect(TOOLTIP_EXPR);
            assert.ok(tooltip.left <= point.x && point.x <= tooltip.right
                && tooltip.top <= point.y + ROW_HEIGHT_PX && point.y + ROW_HEIGHT_PX <= tooltip.bottom,
                'the tooltip covers the lower bar centre: ' + JSON.stringify({ tooltip, point }));

            await hover(point.x, point.y + ROW_HEIGHT_PX);
            const lowerTooltip = await waitFor('(function () { var state = ' + TOOLTIP_STATE_EXPR + ';'
                + ' return state.visible && state.text.indexOf("ORD-9") >= 0 ? state : null; }())', 1000);
            assert.ok(!lowerTooltip.text.includes('ORD-7'), 'tooltip text: ' + lowerTooltip.text);
            assert.equal(await evaluate(barExpr(9) + '.classList.contains("ganttItemHovered")'), true,
                'lower bar hovered');
            assert.equal(await evaluate(barExpr(7) + '.classList.contains("ganttItemHovered")'), false,
                'upper bar left');
            await assertNoPageErrors();
        }
    },
    {
        name: 'long unbroken order, product and event numbers wrap inside the tooltip, which stays inside the window',
        run: async () => {
            const orderNumber = unbrokenText('PMG-LONG-', 'X', 255);
            const productLine = unbrokenText('PMGUXLONGNOHYPHEN', 'Y', 184);
            const eventNumber = unbrokenText('PMG-UX-EV-LONGNUMBER', 'Z', 80);
            const board = await evaluate('window.__boardFor("h1")');
            board.items.find((item) => item.id === 7).info.tooltip = { header: orderNumber, content: [productLine] };
            board.items.find((item) => item.id === undefined).info.tooltip = { header: eventNumber, content: [] };
            await openBoard('h1', { board: { items: board.items } });

            const targets = [
                { expr: barExpr(7), texts: [orderNumber, productLine] },
                { expr: MAINTENANCE_BAR_EXPR, texts: [eventNumber] }
            ];
            for (const target of targets) {
                await hover(PARK_POINT.x, PARK_POINT.y);
                assert.equal((await tooltipState()).visible, false, 'tooltip before hovering ' + target.expr);
                const rect = await elementRect(target.expr);
                await hover(Math.round(rect.x), Math.round(rect.y));
                await waitForVisibleTooltip();
                const layout = await evaluate(TOOLTIP_CONTAINMENT_EXPR);
                const size = await windowSize();
                for (const text of target.texts) {
                    assert.ok(layout.text.includes(text), 'tooltip text of ' + target.expr + ': ' + layout.text);
                }
                assert.deepEqual(layout.outside, [], 'nodes outside the tooltip of ' + target.expr);
                assert.ok(layout.scrollWidth <= layout.clientWidth,
                    'tooltip scroll and client width: ' + JSON.stringify(layout));
                assert.ok(layout.left >= 0 && layout.top >= 0 && layout.right <= size.clientWidth
                    && layout.bottom <= size.clientHeight,
                    'tooltip ' + JSON.stringify(layout) + ', window ' + JSON.stringify(size));
            }
            await assertNoPageErrors();
        }
    },
    {
        name: 'rejection tooltip: after a rejected drop, hovering another order bar, the bar under the release point, the '
            + "maintenance bar or a collision item shows that item's own tooltip, and the rejected bar keeps the reason in "
            + 'place',
        run: async () => {
            const reason = 'Outside working hours';
            // Drags from a point through the offsets and releases, waits for the rejection with the reason and for the
            // chart to unblock, asserts that the rejection tooltip is visible and returns the release point.
            const rejectDrop = async (from, deltas) => {
                await setNextMoveResponse({ kind: 'rejected', message: reason });
                const moveCount = (await moveCalls()).length;
                const drop = await drag(from, deltas);
                await afterDrop(moveCount + 1);
                await waitFor(IS_UNBLOCKED_EXPR);
                const rejection = await waitForVisibleTooltip();
                assert.ok(rejection.text.includes('Move rejected') && rejection.text.includes(reason),
                    'tooltip text after the drop at ' + JSON.stringify(drop) + ': ' + rejection.text);
                return drop;
            };
            // Rests the pointer at a point, asserts that the rejection is still shown, then hovers a target at most 30 px
            // from that point and returns the tooltip state there.
            const hoverFrom = async (rest, target) => {
                const distance = Math.hypot(target.x - rest.x, target.y - rest.y);
                assert.ok(distance <= 30, 'distance ' + distance + ' px from ' + JSON.stringify(rest));
                await hover(rest.x, rest.y);
                const resting = await tooltipState();
                assert.ok(resting.visible && resting.text.includes(reason), 'tooltip at rest: ' + JSON.stringify(resting));
                await hover(target.x, target.y);
                return tooltipState();
            };
            // Asserts that a tooltip state is visible, holds every given text and holds no rejection.
            const assertOwnTooltip = (state, texts, label) => {
                assert.equal(state.visible, true, label + ': tooltip visible');
                for (const text of texts) {
                    assert.ok(state.text.includes(text), label + ': tooltip text ' + state.text);
                }
                assert.ok(!state.text.includes('Move rejected') && !state.text.includes(reason),
                    label + ': tooltip text ' + state.text);
            };
            // Returns the inline left and top of the chart tooltip.
            const tooltipPosition = () => evaluate('(function () { var tooltip = document.querySelector(".ganttChartTooltip");'
                + ' return {left: tooltip.style.left, top: tooltip.style.top}; }())');

            await openBoard('neighbours');
            const bar7 = await barRect(7);
            const bar9 = await barRect(9);
            const maintenance = await elementRect(MAINTENANCE_BAR_EXPR);

            let drop = await rejectDrop(bar7, horizontalSteps(10, 40));
            assertOwnTooltip(await hoverFrom(drop, { x: bar9.left + 5, y: bar9.top + 5 }),
                ['ORD-9', '2026-06-01 10:30:00', '2026-06-01 11:30:00'], 'bar 9');

            await hover(PARK_POINT.x, PARK_POINT.y);
            drop = await rejectDrop(bar7, [[10, 10], [25, 20], [40, ROW_HEIGHT_PX]]);
            assert.equal(await isTopmostAt(barExpr(9), drop), true, 'bar 9 under the release point ' + JSON.stringify(drop));
            await hover(drop.x + 1, drop.y);
            assertOwnTooltip(await tooltipState(), ['ORD-9', '2026-06-01 10:30:00'], 'bar 9 under the release point');

            await hover(PARK_POINT.x, PARK_POINT.y);
            const gap = { x: (bar9.right + maintenance.left) / 2, y: maintenance.y };
            drop = await rejectDrop(bar7, [[10, 10], [gap.x - bar7.x - 10, ROW_HEIGHT_PX], [gap.x - bar7.x, gap.y - bar7.y]]);
            assertOwnTooltip(await hoverFrom(drop, { x: maintenance.left + 8, y: maintenance.y }),
                ['PE-1', '2026-06-01 12:00:00', '2026-06-01 14:00:00'], 'PE-1');

            await hover(PARK_POINT.x, PARK_POINT.y);
            drop = await rejectDrop(bar7, [[10, 0], [26, 0]]);
            const anchored = await tooltipPosition();
            const onRejectedBar = [{ x: bar7.x + 6, y: bar7.y }, { x: bar7.x + 2, y: bar7.y + 3 }];
            await hoverFrom(drop, onRejectedBar[0]);
            for (const target of onRejectedBar) {
                await hover(target.x, target.y);
                const state = await tooltipState();
                assert.ok(state.visible && state.text.includes('Move rejected') && state.text.includes(reason),
                    'rejected bar at ' + JSON.stringify(target) + ': ' + JSON.stringify(state));
                assert.deepEqual(await tooltipPosition(), anchored, 'rejection anchor with the pointer on the rejected bar');
            }

            await openBoard('covered');
            const covering = await barRect(11);
            const collisionRect = await elementRect("document.querySelector('.ganttCollisionItem')");
            assert.ok(covering.left + 8 < collisionRect.left, 'press point left of the collision item');
            await rejectDrop({ x: covering.left + 8, y: covering.y }, [[5, 10], [13, ROW_HEIGHT_PX]]);
            assertOwnTooltip(await hoverFrom({ x: collisionRect.x, y: collisionRect.y + 20 }, collisionRect),
                ['2026-06-01 10:00:00', '2026-06-01 11:00:00'], 'collision item');
            await assertNoPageErrors();
        }
    },
    {
        name: 'rejection tooltip: it stays through a rest and pointer moves up to 30 px, and a pointer move over 30 px, a press on '
            + 'an empty cell, Escape, a pane scroll and a window resize dismiss it',
        run: async () => {
            const reason = 'Shutdown window E-1';
            // Drags from a point through the offsets and releases, waits for the rejection with the reason and for the
            // chart to unblock, asserts that the rejection tooltip is visible and returns the release point.
            const rejectDrop = async (from, deltas) => {
                await setNextMoveResponse({ kind: 'rejected', message: reason });
                const moveCount = (await moveCalls()).length;
                const drop = await drag(from, deltas);
                await afterDrop(moveCount + 1);
                await waitFor(IS_UNBLOCKED_EXPR);
                const rejection = await waitForVisibleTooltip();
                assert.ok(rejection.text.includes(reason), 'tooltip text: ' + rejection.text);
                return drop;
            };
            // Asserts that the rejection tooltip is visible with the reason.
            const assertShown = async (label) => {
                const state = await tooltipState();
                assert.ok(state.visible && state.text.includes('Move rejected') && state.text.includes(reason),
                    label + ': ' + JSON.stringify(state));
            };
            // Asserts that the tooltip is hidden and the alert live region is empty.
            const assertDismissed = async (label) => {
                assert.equal((await tooltipState()).visible, false, 'tooltip after ' + label);
                assert.equal(await elementText(ALERT_REGION_EXPR), '', 'alert region after ' + label);
            };

            await openBoard('h1');
            const bar7 = await barRect(7);
            let drop = await rejectDrop(bar7, horizontalSteps(10, 40));
            await hover(drop.x, drop.y);
            await sleep(1000);
            await assertShown('a rest of 1 s');
            for (const [dx, dy] of [[20, 0], [10, 25], [-20, 10], [0, 0]]) {
                await hover(drop.x + dx, drop.y + dy);
                await assertShown('a move to ' + dx + ', ' + dy + ' px from the rest point');
            }
            await hover(drop.x + 35, drop.y);
            await assertDismissed('a move of 35 px');

            drop = await rejectDrop(bar7, horizontalSteps(10, 40));
            await hover(drop.x, drop.y);
            await assertShown('the rest before the press');
            await press(drop.x, drop.y);
            await assertDismissed('a press on an empty cell');
            await release(drop.x, drop.y);
            assert.equal((await selectCalls()).length, 0, 'select calls after the press on an empty cell');

            await rejectDrop(bar7, horizontalSteps(10, 40));
            await withFocus(async () => {
                await keyPress('Escape');
            });
            await assertDismissed('Escape');

            await openBoard('scrolled');
            await evaluate('(function () { var wrapper = document.querySelector(".rowsContainerWrapper");'
                + ' wrapper.scrollTop = 270; wrapper.scrollLeft = 700; wrapper.dispatchEvent(new Event("scroll"));'
                + ' return true; }())');
            await settle();
            await rejectDrop(await barRect(21), [[5, 0], [13, 0]]);
            await evaluate('document.querySelector(".rowsContainerWrapper").dispatchEvent(new Event("scroll")); true');
            await settle();
            await assertShown('a scroll event at the position of the rejection');
            await evaluate('(function () { var wrapper = document.querySelector(".rowsContainerWrapper");'
                + ' wrapper.scrollTop = 300; wrapper.dispatchEvent(new Event("scroll")); return true; }())');
            await settle();
            await assertDismissed('a pane scroll');

            await openBoard('h1');
            await rejectDrop(bar7, horizontalSteps(10, 40));
            try {
                await send('Emulation.setDeviceMetricsOverride',
                    { width: VIEWPORT.width - 100, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
                await waitFor('(' + TOOLTIP_STATE_EXPR + ').visible === false');
            } finally {
                await send('Emulation.setDeviceMetricsOverride',
                    { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false });
            }
            await assertDismissed('a window resize');
            await waitFor('window.innerWidth === ' + VIEWPORT.width);
            await assertNoPageErrors();
        }
    },
    {
        name: 'rejection tooltip: after a rejected keyboard move, Tab to another bar dismisses it and leaves that bar uncovered',
        run: async () => {
            await withFocus(async () => {
                await openBoard('neighbours', A11Y_OVERRIDES);
                await focusElement(barExpr(7));
                await keyPress('ArrowDown');
                await keyPress('Enter');
                await afterDrop(1);
                await waitFor(IS_UNBLOCKED_EXPR);
                assert.equal(await isFocused(barExpr(7)), true, 'focus after the rejection');
                const rejection = await waitForVisibleTooltip();
                assert.ok(rejection.text.includes('Move rejected') && rejection.text.includes('Rejected by fixture'),
                    'tooltip text: ' + rejection.text);
                assert.equal(await elementText(ALERT_REGION_EXPR), 'Move rejected Rejected by fixture');

                await keyPress('Tab');
                assert.equal(await isFocused(barExpr(9)), true, 'focus after Tab: ' + await evaluate(ACTIVE_ELEMENT_EXPR));
                assert.equal((await tooltipState()).visible, false, 'rejection tooltip after Tab');
                assert.equal(await elementText(ALERT_REGION_EXPR), '', 'alert region after Tab');
                const bar9 = await barRect(9);
                for (const point of [bar9, { x: bar9.right - 1, y: bar9.bottom - 1 }]) {
                    assert.equal(await isTopmostAt(barExpr(9), point), true, 'bar 9 topmost at ' + JSON.stringify(point));
                }
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'rejection alert region: it holds the rejection until a dismissal or the next sent move, and an accepted pointer or '
            + 'keyboard move leaves it empty with the saved move announced',
        run: async () => {
            const acceptedText = MOVE_A11Y_TRANSLATIONS['move.acceptedAnnouncement'];
            // Sets the next moveItem answer to an accepted board, held until released, with bar 7 on a row for the hour
            // from a start.
            const holdAcceptedMove = (row, from, dateFrom, dateTo) => evaluate('(function () {'
                + ' var board = window.__boardFor("h1");'
                + ' var bar = board.items.filter(function (item) { return item.id === 7; })[0];'
                + ' bar.row = ' + JSON.stringify(row) + '; bar.from = ' + from + '; bar.to = ' + (from + 1) + ';'
                + ' bar.info.dateFrom = ' + JSON.stringify(dateFrom) + '; bar.info.dateTo = ' + JSON.stringify(dateTo) + ';'
                + ' window.__nextMoveResponse = {kind: "accepted", board: board, hold: true}; return true; }())');
            // Waits for the held moveItem with a count, asserts that both live regions are empty while it is pending,
            // releases its answer, waits for the rebuilt board and asserts the accepted announcement and an empty alert
            // region.
            const answerAcceptedMove = async (count, label) => {
                await waitFor('window.__calls.filter(function (call) { return call.eventName === "moveItem"; }).length === '
                    + count);
                assert.equal(await elementText(ALERT_REGION_EXPR), '', 'alert region while the ' + label + ' is pending');
                assert.equal(await elementText(STATUS_REGION_EXPR), '', 'status region while the ' + label + ' is pending');
                assert.equal(await evaluate('window.__releaseHeldMove()'), true);
                await afterDrop(count);
                await waitFor(IS_UNBLOCKED_EXPR);
                assert.equal(await elementText(ALERT_REGION_EXPR), '', 'alert region after the accepted ' + label);
                assert.equal(await elementText(STATUS_REGION_EXPR), acceptedText, 'status region after the accepted ' + label);
            };
            await withFocus(async () => {
                await openBoard('h1', A11Y_OVERRIDES);
                await setNextMoveResponse({ kind: 'rejected', message: 'Shutdown window E-1' });
                const rect = await barRect(7);
                let drop = await drag(rect, horizontalSteps(10, 40));
                await afterDrop(1);
                await waitFor(IS_UNBLOCKED_EXPR);
                assert.equal(await elementText(ALERT_REGION_EXPR), 'Move rejected Shutdown window E-1',
                    'alert region after the rejection');
                await hover(drop.x, drop.y);
                await hover(drop.x + 40, drop.y);
                assert.equal((await tooltipState()).visible, false, 'rejection tooltip after a move of 40 px');
                assert.equal(await elementText(ALERT_REGION_EXPR), '', 'alert region after the dismissal');

                drop = await drag(rect, horizontalSteps(10, 40));
                await afterDrop(2);
                await waitFor(IS_UNBLOCKED_EXPR);
                assert.equal(await elementText(ALERT_REGION_EXPR), 'Move rejected Shutdown window E-1',
                    'alert region after the second rejection');
                await holdAcceptedMove('L2', 10.5, '2026-06-01 10:30:00', '2026-06-01 11:30:00');
                await drag(rect, [[10, 10], [25, 20], [40, ROW_HEIGHT_PX]]);
                await answerAcceptedMove(3, 'pointer move');
                await hover(PARK_POINT.x, PARK_POINT.y);

                await setNextMoveResponse({ kind: 'rejected', message: 'Outside working hours' });
                await focusElement(barExpr(7));
                await keyPress('ArrowUp');
                await keyPress('Enter');
                await afterDrop(4);
                await waitFor(IS_UNBLOCKED_EXPR);
                assert.equal(await elementText(ALERT_REGION_EXPR), 'Move rejected Outside working hours',
                    'alert region after the keyboard rejection');
                await keyPress('ArrowRight');
                assert.equal(await elementText(STATUS_REGION_EXPR), 'L2 Start 2026-06-01 11:00:00');
                assert.equal(await elementText(ALERT_REGION_EXPR), 'Move rejected Outside working hours',
                    'alert region during the next keyboard move');
                await holdAcceptedMove('L2', 11, '2026-06-01 11:00:00', '2026-06-01 12:00:00');
                await keyPress('Enter');
                await answerAcceptedMove(5, 'keyboard move');
            });
            await assertNoPageErrors();
        }
    },
    {
        name: 'a board without moves keeps its hover tooltip: it follows the pointer, keeps a visible body and hides on '
            + "mouseleave, while a move-enabled board shows the hovered item's own body",
        run: async () => {
            // Triggers a jQuery mousemove at a viewport point on the element of a page expression.
            const triggerMouseMove = (elementExpr, point) => evaluate('(function () { jQuery(' + elementExpr + ')'
                + '.trigger(jQuery.Event("mousemove", {clientX: ' + point.x + ', clientY: ' + point.y + '}));'
                + ' return true; }())');
            // Returns the inline left of the chart tooltip in pixels.
            const tooltipLeft = () => evaluate('parseFloat(document.querySelector(".ganttChartTooltip").style.left)');

            await openBoard('moveDisabled');
            const bar7 = await barRect(7);
            const maintenance = await elementRect(MAINTENANCE_BAR_EXPR);
            await hover(bar7.x, bar7.y);
            const hovered = await waitForVisibleTooltip();
            for (const text of ['ORD-7', '2026-06-01 09:00:00', '2026-06-01 10:00:00']) {
                assert.ok(hovered.text.includes(text), 'bar 7 tooltip text: ' + hovered.text);
            }
            const left = await tooltipLeft();
            await hover(bar7.x + 4, bar7.y);
            assert.ok(Math.abs(await tooltipLeft() - (left + 4)) <= 0.5, 'tooltip left after a move of 4 px');
            assert.equal((await tooltipState()).text, hovered.text);
            await hover(PARK_POINT.x, PARK_POINT.y);
            assert.equal((await tooltipState()).visible, false, 'tooltip after mouseleave');

            await hover(maintenance.x, maintenance.y);
            const maintenanceText = (await waitForVisibleTooltip()).text;
            assert.ok(maintenanceText.includes('PE-1'), 'PE-1 tooltip text: ' + maintenanceText);
            await triggerMouseMove(barExpr(7), bar7);
            const kept = await tooltipState();
            assert.equal(kept.visible, true);
            assert.equal(kept.text, maintenanceText, 'body after a mousemove of bar 7 without a mouseleave');
            assert.equal(await evaluate('document.querySelectorAll("#ganttHost .ganttChartLiveRegion").length'), 0);
            await hover(PARK_POINT.x, PARK_POINT.y);
            assert.equal((await tooltipState()).visible, false, 'tooltip after leaving PE-1');

            await openBoard('h1');
            await hover(maintenance.x, maintenance.y);
            assert.ok((await waitForVisibleTooltip()).text.includes('PE-1'));
            await triggerMouseMove(barExpr(7), bar7);
            const replaced = await tooltipState();
            assert.equal(replaced.visible, true);
            assert.ok(replaced.text.includes('ORD-7') && !replaced.text.includes('PE-1'),
                'body after a mousemove of bar 7 on the move-enabled board: ' + replaced.text);
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

// Sets a failing exit code, unless one is set, and writes one stderr line with writeDiagnostic when the number of cases
// whose run resolved differs from the number of manifest names.
function reportIncompleteRun() {
    const completed = execution.completed.size;
    if (completed === EXPECTED_CASE_NAMES.length) {
        return;
    }
    writeDiagnostic('ganttChartMove.dom.test.js: ' + completed + ' of ' + EXPECTED_CASE_NAMES.length
        + ' DOM cases ran to completion');
    if (!process.exitCode) {
        process.exitCode = 1;
    }
}

// Promise and error of the browser start, and whether the after hook has begun.
const lifecycle = { starting: null, startError: null, stopping: false };

assertFixtureFile(FIXTURE_PATH);
assertCaseManifest(CASES, EXPECTED_CASE_NAMES);
assertIsolatedWorker('before it registers a case');
startIsolationWatch();

// Starts the browser unless the after hook has begun, recording the start and its error. During a termination by
// terminate it starts nothing, and a start that fails then does not fail the hook; either way the hook awaits
// UNTIL_TERMINATED and never settles.
before(async () => {
    if (lifecycle.stopping) {
        return;
    }
    if (termination.status !== null) {
        await UNTIL_TERMINATED;
    }
    lifecycle.starting = startBrowser().catch((error) => {
        lifecycle.startError = error;
        throw error;
    });
    try {
        await lifecycle.starting;
    } catch (error) {
        if (termination.status !== null) {
            await UNTIL_TERMINATED;
        }
        throw error;
    }
}, { timeout: BEFORE_TIMEOUT_MS });

// Stops the isolation watch, waits up to BEFORE_TIMEOUT_MS for a browser start still in progress, waits for a stop the
// isolation watch began, stops the browser, then fails the run with the start error, the error of the watch's stop,
// the intrusion the watch found, the stop error and the list of manifest cases that never started, each when present;
// co-tenancy findings never fail it. When a termination by terminate is in progress as it starts, it stops only the
// isolation watch; when one is in progress before it would throw, it throws nothing. Either way it awaits
// UNTIL_TERMINATED and never settles.
after(async () => {
    lifecycle.stopping = true;
    stopIsolationWatch();
    if (termination.status !== null) {
        await UNTIL_TERMINATED;
    }
    const failures = [];
    if (lifecycle.starting && !(await settlesWithin(lifecycle.starting, BEFORE_TIMEOUT_MS))) {
        failures.push(new Error('The browser start did not settle within ' + BEFORE_TIMEOUT_MS + ' ms'));
    }
    if (lifecycle.startError) {
        failures.push(lifecycle.startError);
    }
    if (isolation.stopping) {
        const isolationStopError = await isolation.stopping;
        if (isolationStopError) {
            failures.push(isolationStopError);
        }
    }
    if (isolation.error) {
        failures.push(isolation.error);
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
    if (termination.status !== null) {
        await UNTIL_TERMINATED;
    }
    throwFailures(failures);
}, { timeout: AFTER_TIMEOUT_MS });

// Kills a still running chrome-headless-shell and removes its profile directory synchronously, writing a failed removal
// to stderr with writeDiagnostic and a failing exit code, then fails an incomplete run, when the test process exits.
process.on('exit', () => {
    const removeError = terminateBrowserSync('the test process is exiting');
    if (removeError) {
        writeDiagnostic('ganttChartMove.dom.test.js: ' + removeError.message);
        if (!process.exitCode) {
            process.exitCode = 1;
        }
    }
    reportIncompleteRun();
});

// Returns 128 + the number of a signal.
function signalExitStatus(signal) {
    return 128 + os.constants.signals[signal];
}

// Ends the run with an exit status. On the first call, records reason and status in termination, stops the isolation
// watch, and closes the DevTools client and sends SIGKILL to chrome-headless-shell through terminateBrowser before it
// writes anything; then writes reason, and the case whose run is in progress when there is one, with writeDiagnostic,
// waits up to CHROME_EXIT_TIMEOUT_MS for chrome-headless-shell to exit, removes the profile, writes the outcome and
// exits with status. A call while that cleanup runs kills chrome-headless-shell and removes the profile synchronously
// with terminateBrowserSync, writes its reason and the outcome and exits at once with the status of the first call.
function terminate(reason, status) {
    if (termination.status !== null) {
        const removeError = terminateBrowserSync(reason + ' during cleanup');
        writeDiagnostic('ganttChartMove.dom.test.js: ' + reason + ' during cleanup; '
            + (removeError ? removeError.message : 'profile removed') + '; exiting with status ' + termination.status);
        process.exit(termination.status);
        return;
    }
    termination.reason = reason;
    termination.status = status;
    stopIsolationWatch();
    const stopped = terminateBrowser(false, reason);
    writeDiagnostic('ganttChartMove.dom.test.js: ' + reason
        + (termination.runningCase === null ? '' : ' during case ' + JSON.stringify(termination.runningCase))
        + '; stopping ' + CHROME_BINARY);
    stopped.then(() => {
        writeDiagnostic('ganttChartMove.dom.test.js: ' + CHROME_BINARY
            + ' stopped and its profile removed; exiting with status ' + status);
        process.exit(status);
    }, (error) => {
        writeDiagnostic('ganttChartMove.dom.test.js: cleanup after ' + reason + ' failed: ' + error.message
            + '; exiting with status ' + status);
        process.exit(status);
    });
}

// Ends the run with terminate on a termination signal, with the reason '<signal> received' and 128 + the signal
// number.
function onTerminationSignal(signal) {
    terminate(signal + ' received', signalExitStatus(signal));
}

// Adds the stream name, 'stdout' or 'stderr', to brokenStdio on a write error. EPIPE, which a write gets once the
// reader of the pipe has closed it, ends the run with terminate and CLOSED_PIPE_EXIT_STATUS unless a termination is in
// progress; any other error is written with writeDiagnostic.
function onStdioError(name, error) {
    brokenStdio.add(name);
    const code = error && error.code ? error.code : String(error);
    if (code === 'EPIPE') {
        if (termination.status === null) {
            terminate('the reader of ' + name + ' closed its pipe (EPIPE)', CLOSED_PIPE_EXIT_STATUS);
        }
        return;
    }
    writeDiagnostic('ganttChartMove.dom.test.js: a write to ' + name + ' failed (' + code + '); nothing more is '
        + 'written to it');
}

// Kills chrome-headless-shell and removes its profile synchronously with terminateBrowserSync when an uncaught
// exception is raised while a termination is in progress, before Node.js handles that exception.
function onUncaughtExceptionDuringTermination() {
    if (termination.status !== null) {
        terminateBrowserSync(termination.reason + '; an uncaught exception was raised during cleanup');
    }
}

for (const signal of TERMINATION_SIGNALS) {
    process.on(signal, onTerminationSignal);
}
process.stdout.on('error', (error) => onStdioError('stdout', error));
process.stderr.on('error', (error) => onStdioError('stderr', error));
process.on('uncaughtExceptionMonitor', onUncaughtExceptionDuringTermination);

// Registers every case; each records its name when its run starts and when its run resolves, and fails before it runs
// once the isolation watch has found an intrusion; co-tenancy findings never fail a case. While its run is in progress
// its name is termination.runningCase. A case that starts during a termination by terminate does not run, and one whose
// run fails during a termination does not fail; both await UNTIL_TERMINATED and never settle.
for (const c of CASES) {
    test(c.name, { timeout: CASE_TIMEOUT_MS }, async () => {
        if (termination.status !== null) {
            await UNTIL_TERMINATED;
        }
        execution.started.add(c.name);
        if (isolation.error) {
            throw isolation.error;
        }
        termination.runningCase = c.name;
        try {
            await c.run();
        } catch (error) {
            if (termination.status !== null) {
                await UNTIL_TERMINATED;
            }
            throw error;
        } finally {
            termination.runningCase = null;
        }
        execution.completed.add(c.name);
    });
}
