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
'use strict';

// node:test reporter for the GanttChartMoveTransform unit tests.
//
// It prints one line per test result and every diagnostic, measures the line coverage of the
// QCD.components.elements.GanttChartMoveTransform object literal in gantt/ganttChart.js, and sets process.exitCode to 1
// when any of these holds:
//   - a test fails, is skipped or is marked todo;
//   - no top-level test case reported a result; a result named after its own test file reports the file, not a case;
//   - no coverage event arrived, or the coverage entry, the declaration or the end of the object literal is missing;
//   - fewer than 90% of the reported lines inside the object literal ran at least once.
// Lines outside the object literal are not counted. The last output line is "pass N fail N skipped N todo N".
//
// Usage, from the repository root:
//   node --test --experimental-test-coverage --test-coverage-include='**/gantt/ganttChart.js' \
//     --test-reporter=./qcadoo/qcadoo-view/src/test/js/ganttChart/moveTransformCoverageReporter.js \
//     qcadoo/qcadoo-view/src/test/js/ganttChart/ganttChartMoveTransform.test.js

const fs = require('node:fs');
const path = require('node:path');

// Suffix, with "/" separators, of the coverage entry path of the measured script.
const TARGET_PATH_SUFFIX = 'gantt/ganttChart.js';

// Statement start that declares the measured object literal.
const DECLARATION = 'QCD.components.elements.GanttChartMoveTransform =';

// Minimum fraction of covered lines inside the measured object literal.
const MIN_LINE_RATE = 0.9;

// Characters after which a "/" starts a regular expression literal.
const REGEX_PRECEDING_CHARACTERS = '(,=:[!&|?{};+-*%<>~^';

// Keywords after which a "/" starts a regular expression literal.
const REGEX_PRECEDING_KEYWORDS = ['return', 'typeof', 'case', 'delete', 'void', 'throw', 'new', 'in', 'instanceof', 'do',
    'else', 'yield', 'await'];

// Output labels per test outcome; "file" is a passed result of a test file that reported no test case.
const OUTCOME_LABELS = { pass: 'PASS', fail: 'FAIL', skipped: 'SKIPPED', todo: 'TODO', file: 'FILE' };

// Returns the 1-based number of the first line that starts, after indentation, with the declaration, or -1 when none does.
function findDeclarationLine(source) {
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index++) {
        if (lines[index].trimStart().startsWith(DECLARATION)) {
            return index + 1;
        }
    }
    return -1;
}

// Returns the 1-based line holding the brace that closes the first "{" after the declaration on the given line,
// or -1 when there is no "{" or no matching "}".
function findBlockEndLine(source, declarationLine) {
    const declarationIndex = source.indexOf(DECLARATION, offsetOfLine(source, declarationLine));
    if (declarationIndex < 0) {
        return -1;
    }
    const openBraceIndex = source.indexOf('{', declarationIndex + DECLARATION.length);
    if (openBraceIndex < 0) {
        return -1;
    }
    const closeBraceIndex = findClosingBrace(source, openBraceIndex + 1);
    return closeBraceIndex < 0 ? -1 : lineOfOffset(source, closeBraceIndex);
}

// Counts the reported lines inside [startLine, endLine] and those among them that ran at least once, and lists the rest.
function computeBlockCoverage(lineReports, startLine, endLine) {
    let total = 0;
    let covered = 0;
    const uncovered = [];
    for (const report of lineReports) {
        if (report && report.line >= startLine && report.line <= endLine) {
            total++;
            if (report.count > 0) {
                covered++;
            } else {
                uncovered.push(report.line);
            }
        }
    }
    uncovered.sort((left, right) => left - right);
    return { total, covered, uncovered };
}

// Returns the offset of the first character of the given 1-based line.
function offsetOfLine(source, line) {
    let offset = 0;
    for (let current = 1; current < line; current++) {
        const lineBreak = source.indexOf('\n', offset);
        if (lineBreak < 0) {
            return source.length;
        }
        offset = lineBreak + 1;
    }
    return offset;
}

// Returns the 1-based line of the character at the given offset.
function lineOfOffset(source, offset) {
    let line = 1;
    for (let index = 0; index < offset; index++) {
        if (source[index] === '\n') {
            line++;
        }
    }
    return line;
}

// Returns the offset of the "}" that closes a brace opened just before `from`, or -1 when the source ends first.
// Braces inside strings, template literal text, comments and regular expression literals are not counted.
function findClosingBrace(source, from) {
    let depth = 1;
    let previousCharacter = '';
    let previousWord = '';
    let index = from;
    while (index < source.length) {
        const character = source[index];
        const nextCharacter = source[index + 1];
        if (/\s/.test(character)) {
            index++;
        } else if (character === '/' && nextCharacter === '/') {
            index = skipLineComment(source, index);
        } else if (character === '/' && nextCharacter === '*') {
            index = skipBlockComment(source, index);
        } else if (character === '"' || character === '\'') {
            index = skipQuoted(source, index);
            previousCharacter = character;
            previousWord = '';
        } else if (character === '`') {
            index = skipTemplate(source, index);
            previousCharacter = character;
            previousWord = '';
        } else if (isWordCharacter(character)) {
            const wordEnd = skipWord(source, index);
            previousWord = source.slice(index, wordEnd);
            previousCharacter = source[wordEnd - 1];
            index = wordEnd;
        } else {
            const regexEnd = character === '/' && startsRegex(previousCharacter, previousWord) ? skipRegex(source, index) : -1;
            if (regexEnd > 0) {
                index = regexEnd;
            } else {
                if (character === '{') {
                    depth++;
                } else if (character === '}') {
                    depth--;
                    if (depth === 0) {
                        return index;
                    }
                }
                index++;
            }
            previousCharacter = character;
            previousWord = '';
        }
    }
    return -1;
}

// Checks whether a "/" after the given previous significant character or word starts a regular expression literal.
function startsRegex(previousCharacter, previousWord) {
    if (previousWord !== '') {
        return REGEX_PRECEDING_KEYWORDS.indexOf(previousWord) >= 0;
    }
    return previousCharacter === '' || REGEX_PRECEDING_CHARACTERS.indexOf(previousCharacter) >= 0;
}

// Checks whether a character belongs to an identifier, keyword or number.
function isWordCharacter(character) {
    return /[\w$\u0080-\uffff]/.test(character);
}

// Returns the offset after the identifier, keyword or number starting at `index`.
function skipWord(source, index) {
    let end = index;
    while (end < source.length && isWordCharacter(source[end])) {
        end++;
    }
    return end;
}

// Returns the offset of the line break ending the "//" comment starting at `index`, or the source length.
function skipLineComment(source, index) {
    const lineBreak = source.indexOf('\n', index);
    return lineBreak < 0 ? source.length : lineBreak;
}

// Returns the offset after the "*/" ending the block comment starting at `index`, or the source length.
function skipBlockComment(source, index) {
    const end = source.indexOf('*/', index + 2);
    return end < 0 ? source.length : end + 2;
}

// Returns the offset after the closing quote of the string starting at `index`, or the source length.
function skipQuoted(source, index) {
    const quote = source[index];
    let position = index + 1;
    while (position < source.length) {
        const character = source[position];
        if (character === '\\') {
            position += 2;
        } else if (character === quote) {
            return position + 1;
        } else {
            position++;
        }
    }
    return source.length;
}

// Returns the offset after the closing backtick of the template literal starting at `index`, or the source length.
// Each "${...}" substitution is skipped as code up to its matching "}".
function skipTemplate(source, index) {
    let position = index + 1;
    while (position < source.length) {
        const character = source[position];
        if (character === '\\') {
            position += 2;
        } else if (character === '`') {
            return position + 1;
        } else if (character === '$' && source[position + 1] === '{') {
            const substitutionEnd = findClosingBrace(source, position + 2);
            if (substitutionEnd < 0) {
                return source.length;
            }
            position = substitutionEnd + 1;
        } else {
            position++;
        }
    }
    return source.length;
}

// Returns the offset after the closing "/" of the regular expression literal starting at `index`, or -1 when the line
// ends first. Escaped characters and "[...]" classes are skipped.
function skipRegex(source, index) {
    let position = index + 1;
    let inClass = false;
    while (position < source.length) {
        const character = source[position];
        if (character === '\n' || character === '\r') {
            return -1;
        }
        if (character === '\\') {
            position += 2;
        } else {
            if (inClass) {
                inClass = character !== ']';
            } else if (character === '[') {
                inClass = true;
            } else if (character === '/') {
                return position + 1;
            }
            position++;
        }
    }
    return -1;
}

// Formats ascending line numbers as comma-separated numbers and "first-last" ranges, or "none" when the list is empty.
function formatLineRanges(lines) {
    if (lines.length === 0) {
        return 'none';
    }
    const ranges = [];
    let first = lines[0];
    let last = lines[0];
    for (let index = 1; index <= lines.length; index++) {
        const line = lines[index];
        if (line === last + 1) {
            last = line;
        } else {
            ranges.push(first === last ? String(first) : first + '-' + last);
            first = line;
            last = line;
        }
    }
    return ranges.join(', ');
}

// Formats a covered/total fraction as a percentage truncated to two decimals.
function formatPercent(covered, total) {
    return (Math.floor((covered * 10000) / total) / 100).toFixed(2);
}

// Evaluates the coverage summary of a test:coverage event against the measured object literal.
// Returns the output lines and whether the coverage gate passed.
function evaluateCoverage(summary) {
    const output = [];
    const failed = (message) => {
        output.push('ERROR ' + message);
        return { output, passed: false };
    };

    const files = summary && Array.isArray(summary.files) ? summary.files : [];
    const entry = files.find((file) => {
        return file && typeof file.path === 'string' && file.path.replace(/\\/g, '/').endsWith(TARGET_PATH_SUFFIX);
    });
    if (!entry) {
        return failed('no coverage entry for ' + TARGET_PATH_SUFFIX
            + '; run with --test-coverage-include=\'**/' + TARGET_PATH_SUFFIX + '\'');
    }

    let source;
    try {
        source = fs.readFileSync(entry.path, 'utf8');
    } catch (error) {
        return failed('cannot read ' + entry.path + ': ' + error.message);
    }

    const startLine = findDeclarationLine(source);
    if (startLine < 0) {
        return failed('no line in ' + entry.path + ' starts with "' + DECLARATION + '"');
    }
    const endLine = findBlockEndLine(source, startLine);
    if (endLine < 0) {
        return failed('no closing brace for the object literal declared on line ' + startLine + ' of ' + entry.path);
    }

    const workingDirectory = summary.workingDirectory || process.cwd();
    output.push('Coverage source: ' + path.relative(workingDirectory, entry.path).replace(/\\/g, '/'));

    const coverage = computeBlockCoverage(Array.isArray(entry.lines) ? entry.lines : [], startLine, endLine);
    if (coverage.total === 0) {
        return failed('no coverage lines reported for lines ' + startLine + '-' + endLine + ' of ' + entry.path);
    }

    output.push('GanttChartMoveTransform line coverage: ' + formatPercent(coverage.covered, coverage.total) + '% ('
        + coverage.covered + '/' + coverage.total + ', lines ' + startLine + '-' + endLine + ')');
    output.push('Uncovered lines: ' + formatLineRanges(coverage.uncovered));

    if (coverage.covered / coverage.total < MIN_LINE_RATE) {
        return failed('GanttChartMoveTransform line coverage is below ' + (MIN_LINE_RATE * 100).toFixed(2) + '%');
    }
    return { output, passed: true };
}

// Formats a test duration in milliseconds with three decimals, or "?" when it is missing.
function formatDuration(details) {
    const duration = details ? details.duration_ms : undefined;
    return typeof duration === 'number' && isFinite(duration) ? duration.toFixed(3) : '?';
}

// Returns the indented lines of a multi-line text.
function indentLines(text, indent) {
    return String(text).split('\n').map((line) => {
        return indent + line;
    });
}

// Returns the stack frame lines ("at ...") of a stack trace.
function stackFrames(stack) {
    if (typeof stack !== 'string') {
        return [];
    }
    return stack.split('\n').filter((line) => {
        return /^\s*at\s/.test(line);
    });
}

// Describes a test failure error: its message, the message of its cause when that differs, and the stack frames of the
// error and of its cause.
function describeError(error, indent) {
    if (error === undefined || error === null) {
        return [];
    }
    if (typeof error !== 'object') {
        return indentLines(String(error), indent);
    }
    const message = error.message !== undefined ? String(error.message) : String(error);
    const lines = indentLines(message, indent);

    const cause = error.cause;
    const causeIsObject = cause !== null && typeof cause === 'object';
    if (cause !== undefined && cause !== null) {
        const causeMessage = causeIsObject ? String(cause.message !== undefined ? cause.message : cause) : String(cause);
        if (causeMessage !== message) {
            lines.push.apply(lines, indentLines('cause: ' + causeMessage, indent));
        }
    }

    const frames = stackFrames(error.stack);
    const causeFrames = causeIsObject ? stackFrames(cause.stack) : [];
    for (const frame of causeFrames) {
        if (frames.indexOf(frame) < 0) {
            frames.push(frame);
        }
    }
    for (const frame of frames) {
        lines.push(indent + frame.trim());
    }
    return lines;
}

// Checks whether a test:pass or test:fail event reports a whole test file: its name resolves to its own file path.
function isFileResult(data) {
    return typeof data.name === 'string' && typeof data.file === 'string' && data.name !== ''
        && path.resolve(data.name) === path.resolve(data.file);
}

// Classifies a test:pass or test:fail event as pass, fail, skipped, todo or file and returns its output lines.
// A passed file result is "file"; a failed file result is "fail".
function describeTestResult(type, data) {
    const nesting = typeof data.nesting === 'number' && data.nesting > 0 ? data.nesting : 0;
    const indent = '  '.repeat(nesting);
    const isTodo = data.todo !== undefined && data.todo !== false;
    const isSkipped = data.skip !== undefined && data.skip !== false;

    let outcome;
    let reason;
    if (isTodo) {
        outcome = 'todo';
        reason = data.todo;
    } else if (isSkipped) {
        outcome = 'skipped';
        reason = data.skip;
    } else if (type === 'test:fail') {
        outcome = 'fail';
    } else {
        outcome = isFileResult(data) ? 'file' : 'pass';
    }

    const name = data.name !== undefined ? data.name : '<unnamed test>';
    const suffix = typeof reason === 'string' && reason !== '' ? ' # ' + reason : '';
    const lines = [indent + OUTCOME_LABELS[outcome] + ' ' + name + ' (' + formatDuration(data.details) + ' ms)' + suffix];
    if (type === 'test:fail') {
        lines.push.apply(lines, describeError(data.details ? data.details.error : undefined, indent + '  '));
    }
    return { outcome, lines };
}

// Reports test results and diagnostics, gates the GanttChartMoveTransform line coverage, and fails the run on any failed,
// skipped or todo test, on zero top-level tests and on missing coverage data.
module.exports = async function* moveTransformCoverageReporter(source) {
    let pass = 0;
    let fail = 0;
    let skipped = 0;
    let todo = 0;
    let topLevelTests = 0;
    let coverageSeen = false;

    for await (const event of source) {
        const type = event ? event.type : undefined;
        const data = event && event.data ? event.data : {};

        if (type === 'test:pass' || type === 'test:fail') {
            // Counts top-level test cases; results of whole test files are not test cases.
            if (data.nesting === 0 && !isFileResult(data)) {
                topLevelTests++;
            }
            const result = describeTestResult(type, data);
            if (result.outcome === 'pass') {
                pass++;
            } else if (result.outcome === 'fail') {
                fail++;
                process.exitCode = 1;
            } else if (result.outcome === 'skipped') {
                skipped++;
                process.exitCode = 1;
            } else if (result.outcome === 'todo') {
                todo++;
                process.exitCode = 1;
            }
            for (const line of result.lines) {
                yield line + '\n';
            }
        } else if (type === 'test:diagnostic') {
            yield '# ' + data.message + '\n';
        } else if (type === 'test:coverage') {
            coverageSeen = true;
            const result = evaluateCoverage(data.summary);
            for (const line of result.output) {
                yield line + '\n';
            }
            if (!result.passed) {
                process.exitCode = 1;
            }
        }
    }

    // Checks the run-level conditions after the last event.
    if (skipped > 0 || todo > 0) {
        yield 'ERROR skipped and todo tests are not allowed (skipped ' + skipped + ', todo ' + todo + ')\n';
        process.exitCode = 1;
    }
    if (topLevelTests === 0) {
        yield 'ERROR no top-level test case reported a result\n';
        process.exitCode = 1;
    }
    if (!coverageSeen) {
        yield 'ERROR no coverage data; run with --experimental-test-coverage\n';
        process.exitCode = 1;
    }
    yield 'pass ' + pass + ' fail ' + fail + ' skipped ' + skipped + ' todo ' + todo + '\n';
};

