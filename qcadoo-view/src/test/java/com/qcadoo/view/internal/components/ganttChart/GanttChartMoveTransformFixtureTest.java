/**
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
package com.qcadoo.view.internal.components.ganttChart;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.Mockito.mock;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.TimeZone;

import org.joda.time.DateTimeZone;
import org.joda.time.LocalDateTime;
import org.joda.time.format.DateTimeFormat;
import org.joda.time.format.DateTimeFormatter;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import com.qcadoo.view.api.components.ganttChart.GanttChartItem;
import com.qcadoo.view.internal.components.ganttChart.GanttChartScaleImpl.ZoomLevel;

/**
 * Tests of the forward date-to-position transform against the shared fixture {@code /ganttChart/moveTransformFixtures.json},
 * which {@code ganttChartMoveTransform.test.js} also reads.
 * <p>
 * For every fixture target, {@link GanttChartScaleImpl#createGanttChartItem(String, String, Long, Date, Date)} must yield the
 * fixture's truncated cell position, the fixture's untruncated cell position must equal the wall-clock distance from the scale
 * start in cells, and the fixture must hold a non-DST entry for every {@link ZoomLevel}. Fixtures in {@code Europe/Warsaw} on
 * daylight-saving change days are checked for wall-clock placement across the change.
 * <p>
 * The resource must hold exactly the eight fixtures of {@code EXPECTED_FIXTURE_NAMES}, each once and with the zoom level, time
 * zone, daylight-saving transition and target count at the same index of the {@code EXPECTED_*} arrays, 44 targets in all. Only
 * {@code OFF_GRID_TARGET} lies off the move grid, and the {@code H1} and {@code D1} fixtures in {@code Europe/Warsaw} cover both
 * the spring-forward gap at {@code NONEXISTENT_WALL_CLOCK} and the fall-back overlap at {@code REPEATED_WALL_CLOCK}.
 * <p>
 * {@link #init()} starts every test with the JVM and Joda-Time default zones set to UTC. The tests that create a scale
 * switch both default zones to each fixture's zone before creating that fixture's scale, and {@link #restore()} restores the
 * zones found before the test.
 */
public class GanttChartMoveTransformFixtureTest {

    private static final String FIXTURE_RESOURCE = "/ganttChart/moveTransformFixtures.json";

    private static final String FIXTURE_ENCODING = "UTF-8";

    private static final String DATE_TIME_PATTERN = "yyyy-MM-dd HH:mm:ss";

    private static final String DATE_PATTERN = "yyyy-MM-dd";

    private static final String UTC_ZONE = "UTC";

    private static final String DST_ZONE = "Europe/Warsaw";

    private static final String SPRING_FORWARD = "springForward";

    private static final String FALL_BACK = "fallBack";

    private static final String H1_UTC = "H1-UTC";

    private static final String H3_UTC = "H3-UTC";

    private static final String H6_UTC = "H6-UTC";

    private static final String D1_UTC = "D1-UTC";

    private static final String H1_DST_SPRING_FORWARD = "H1-Europe/Warsaw-springForward";

    private static final String H1_DST_FALL_BACK = "H1-Europe/Warsaw-fallBack";

    private static final String D1_DST_SPRING_FORWARD = "D1-Europe/Warsaw-springForward";

    private static final String D1_DST_FALL_BACK = "D1-Europe/Warsaw-fallBack";

    private static final int EXPECTED_FIXTURE_COUNT = 8;

    private static final int EXPECTED_TARGET_COUNT = 44;

    private static final String[] EXPECTED_FIXTURE_NAMES = { H1_UTC, H3_UTC, H6_UTC, D1_UTC, H1_DST_SPRING_FORWARD,
            H1_DST_FALL_BACK, D1_DST_SPRING_FORWARD, D1_DST_FALL_BACK };

    private static final ZoomLevel[] EXPECTED_ZOOM_LEVELS = { ZoomLevel.H1, ZoomLevel.H3, ZoomLevel.H6, ZoomLevel.D1,
            ZoomLevel.H1, ZoomLevel.H1, ZoomLevel.D1, ZoomLevel.D1 };

    private static final String[] EXPECTED_TIME_ZONES = { UTC_ZONE, UTC_ZONE, UTC_ZONE, UTC_ZONE, DST_ZONE, DST_ZONE, DST_ZONE,
            DST_ZONE };

    private static final String[] EXPECTED_DST_TRANSITIONS = { null, null, null, null, SPRING_FORWARD, FALL_BACK, SPRING_FORWARD,
            FALL_BACK };

    private static final int[] EXPECTED_TARGET_COUNTS = { 7, 6, 6, 6, 5, 5, 5, 4 };

    private static final String[] SPRING_FORWARD_FIXTURE_NAMES = { H1_DST_SPRING_FORWARD, D1_DST_SPRING_FORWARD };

    private static final String[] FALL_BACK_FIXTURE_NAMES = { H1_DST_FALL_BACK, D1_DST_FALL_BACK };

    private static final String OFF_GRID_TARGET = H1_UTC + " / 2026-06-01 10:07:00";

    private static final String NONEXISTENT_WALL_CLOCK = "2026-03-29 02:30:00";

    private static final String REPEATED_WALL_CLOCK = "2026-10-25 02:30:00";

    private static final String ROW_NAME = "row";

    private static final String ITEM_NAME = "name";

    private static final Long ENTITY_ID = 1L;

    private static final double DELTA = 1e-9;

    private static final int PRECISION = 10;

    private static final int CELL_WIDTH = 25;

    private static final int MINUTES_PER_HOUR = 60;

    private static final long MILLIS_PER_MINUTE = 60000L;

    private static final long MILLIS_PER_HOUR = 3600000L;

    private TimeZone defaultTimeZone;

    private DateTimeZone defaultDateTimeZone;

    @Before
    public final void init() {
        defaultTimeZone = TimeZone.getDefault();
        defaultDateTimeZone = DateTimeZone.getDefault();

        useZone(UTC_ZONE);
    }

    @After
    public final void restore() {
        TimeZone.setDefault(defaultTimeZone);
        DateTimeZone.setDefault(defaultDateTimeZone);
    }

    @Test
    public final void shouldMatchForwardTransformForEveryFixture() throws Exception {
        // given
        JSONArray fixtures = loadFixtures();
        int checkedTargets = 0;
        List<String> offGridTargets = new ArrayList<String>();

        for (int i = 0; i < fixtures.length(); i++) {
            JSONObject fixture = fixtures.getJSONObject(i);
            GanttChartScaleImpl scale = createScale(fixture);
            int hoursInterval = fixture.getInt("hoursInterval");
            int gridMinutes = fixture.getInt("gridMinutes");
            LocalDateTime scaleStart = wallClock(fixture.getString("scaleDateFrom"));
            JSONArray targets = fixture.getJSONArray("targets");

            for (int j = 0; j < targets.length(); j++) {
                JSONObject target = targets.getJSONObject(j);
                String dateFrom = target.getString("dateFrom");
                double untruncatedCells = target.getDouble("untruncatedCells");
                double truncatedCells = target.getDouble("truncatedCells");
                LocalDateTime targetWallClock = wallClock(dateFrom);
                Date date = parseDate(dateFrom);

                // when
                GanttChartItem item = scale.createGanttChartItem(ROW_NAME, ITEM_NAME, ENTITY_ID, date, date);

                // then
                assertEquals(describe(fixture, target, "from"), truncatedCells, item.getFrom(), DELTA);
                assertEquals(describe(fixture, target, "to"), truncatedCells, item.getTo(), DELTA);
                assertEquals(describe(fixture, target, "dateFrom"), dateFrom, item.getDateFrom());
                assertEquals(describe(fixture, target, "dateTo"), dateFrom, item.getDateTo());
                assertEquals(describe(fixture, target, "untruncatedCells as wall-clock distance"),
                        toCells(wallClockMillisBetween(scaleStart, targetWallClock), hoursInterval), untruncatedCells, DELTA);
                assertEquals(describe(fixture, target, "truncatedCells as untruncatedCells truncated to 0.1 cell"),
                        Math.floor(untruncatedCells * PRECISION + DELTA) / PRECISION, truncatedCells, DELTA);
                assertTrue(describe(fixture, target, "truncation is not negative"), untruncatedCells - truncatedCells >= -DELTA);
                assertTrue(describe(fixture, target, "truncation is below 0.1 cell"),
                        untruncatedCells - truncatedCells < 1.0 / PRECISION);
                assertEquals(describe(fixture, target, "onGrid"), target.getBoolean("onGrid"),
                        isOnGrid(targetWallClock, gridMinutes));

                if (!target.getBoolean("onGrid")) {
                    offGridTargets.add(fixture.getString("name") + " / " + dateFrom);
                }

                checkedTargets++;
            }
        }

        assertEquals("Checked fixture targets", EXPECTED_TARGET_COUNT, checkedTargets);
        assertEquals("Off-grid fixture targets", Collections.singletonList(OFF_GRID_TARGET), offGridTargets);
    }

    @Test
    public final void shouldCoverEveryZoomLevel() throws Exception {
        // given
        JSONArray fixtures = loadFixtures();
        ZoomLevel[] zoomLevels = ZoomLevel.values();

        // when
        JSONObject[] nonDstFixtures = new JSONObject[zoomLevels.length];
        for (int i = 0; i < zoomLevels.length; i++) {
            nonDstFixtures[i] = findNonDstFixture(fixtures, zoomLevels[i]);
        }

        // then
        assertFixtureSet(fixtures);

        for (int i = 0; i < zoomLevels.length; i++) {
            if (nonDstFixtures[i] == null) {
                fail("No non-DST fixture for zoom level " + zoomLevels[i]);
            }
            assertFixtureParameters(nonDstFixtures[i], zoomLevels[i]);
        }

        for (int i = 0; i < fixtures.length(); i++) {
            JSONObject fixture = fixtures.getJSONObject(i);
            ZoomLevel zoomLevel = ZoomLevel.valueOf(fixture.getString("zoomLevel"));

            assertNotNull(fixture.getString("name") + ": zoomLevel", zoomLevel);
            assertFixtureParameters(fixture, zoomLevel);
        }
    }

    @Test
    public final void shouldPlaceWallClockTimesAcrossDstChange() throws Exception {
        // given
        JSONArray fixtures = loadFixtures();
        List<JSONObject> dstFixtures = new ArrayList<JSONObject>();
        List<String> springForwardFixtures = new ArrayList<String>();
        List<String> fallBackFixtures = new ArrayList<String>();

        for (int i = 0; i < fixtures.length(); i++) {
            JSONObject fixture = fixtures.getJSONObject(i);

            if (!fixture.isNull("dstTransition")) {
                dstFixtures.add(fixture);

                if (DST_ZONE.equals(fixture.getString("timeZone"))) {
                    if (SPRING_FORWARD.equals(fixture.getString("dstTransition"))) {
                        springForwardFixtures.add(fixture.getString("name"));
                    } else if (FALL_BACK.equals(fixture.getString("dstTransition"))) {
                        fallBackFixtures.add(fixture.getString("name"));
                    }
                }
            }
        }

        assertEquals("Fixtures with a dstTransition", SPRING_FORWARD_FIXTURE_NAMES.length + FALL_BACK_FIXTURE_NAMES.length,
                dstFixtures.size());
        assertFixtureNames(DST_ZONE + " " + SPRING_FORWARD + " fixtures", SPRING_FORWARD_FIXTURE_NAMES, springForwardFixtures);
        assertFixtureNames(DST_ZONE + " " + FALL_BACK + " fixtures", FALL_BACK_FIXTURE_NAMES, fallBackFixtures);

        List<String> checkedGaps = new ArrayList<String>();
        List<String> checkedOverlaps = new ArrayList<String>();

        for (JSONObject fixture : dstFixtures) {
            GanttChartScaleImpl scale = createScale(fixture);
            DateTimeZone zone = DateTimeZone.forID(fixture.getString("timeZone"));
            int hoursInterval = fixture.getInt("hoursInterval");
            long quantumMillis = fixture.getInt("quantumMinutes") * MILLIS_PER_MINUTE;
            LocalDateTime scaleStart = wallClock(fixture.getString("scaleDateFrom"));
            LocalDateTime scaleEnd = wallClock(fixture.getString("scaleDateTo"));
            JSONArray targets = fixture.getJSONArray("targets");

            assertDstTransition(fixture, zone, scaleStart, scaleEnd);

            JSONObject previousTarget = null;

            for (int j = 0; j < targets.length(); j++) {
                JSONObject target = targets.getJSONObject(j);
                Date date = parseDate(target.getString("dateFrom"));

                // when
                GanttChartItem item = scale.createGanttChartItem(ROW_NAME, ITEM_NAME, ENTITY_ID, date, date);

                // then
                assertEquals(describe(fixture, target, "from"), target.getDouble("truncatedCells"), item.getFrom(), DELTA);

                if (previousTarget != null) {
                    assertConsecutiveTargets(fixture, scaleStart, previousTarget, target, hoursInterval, quantumMillis);
                }

                previousTarget = target;
            }

            if (hasValue(fixture, "nonexistentWallClock")) {
                String nonexistentWallClock = fixture.getString("nonexistentWallClock");

                assertEquals(fixture.getString("name") + ": nonexistentWallClock", NONEXISTENT_WALL_CLOCK, nonexistentWallClock);
                assertTrue(fixture.getString("name") + ": " + nonexistentWallClock + " lies in a gap",
                        zone.isLocalDateTimeGap(wallClock(nonexistentWallClock)));

                for (int j = 0; j < targets.length(); j++) {
                    assertFalse(fixture.getString("name") + ": target at nonexistent " + nonexistentWallClock,
                            nonexistentWallClock.equals(targets.getJSONObject(j).getString("dateFrom")));
                }

                checkedGaps.add(fixture.getString("name"));
            }

            if (hasValue(fixture, "repeatedWallClock")) {
                String repeatedWallClock = fixture.getString("repeatedWallClock");

                assertEquals(fixture.getString("name") + ": repeatedWallClock", REPEATED_WALL_CLOCK, repeatedWallClock);

                long earlierOccurrence = wallClock(repeatedWallClock).toDateTime(zone).withEarlierOffsetAtOverlap().getMillis();
                long laterOccurrence = wallClock(repeatedWallClock).toDateTime(zone).withLaterOffsetAtOverlap().getMillis();

                assertEquals(fixture.getString("name") + ": " + repeatedWallClock + " occurs twice, one hour apart",
                        MILLIS_PER_HOUR, laterOccurrence - earlierOccurrence);

                checkedOverlaps.add(fixture.getString("name"));
            }
        }

        assertFixtureNames("Fixtures with a checked nonexistentWallClock", SPRING_FORWARD_FIXTURE_NAMES, checkedGaps);
        assertFixtureNames("Fixtures with a checked repeatedWallClock", FALL_BACK_FIXTURE_NAMES, checkedOverlaps);
    }

    /**
     * Asserts that the fixtures are exactly the expected fixture set: {@code EXPECTED_FIXTURE_COUNT} fixtures, each name of
     * {@code EXPECTED_FIXTURE_NAMES} occurring once with the zoom level, time zone, daylight-saving transition and target count
     * at the same index of the {@code EXPECTED_*} arrays, and {@code EXPECTED_TARGET_COUNT} targets in all.
     */
    private void assertFixtureSet(final JSONArray fixtures) throws JSONException {
        assertEquals("Fixture count", EXPECTED_FIXTURE_COUNT, fixtures.length());

        int targetCount = 0;

        for (int i = 0; i < EXPECTED_FIXTURE_NAMES.length; i++) {
            String name = EXPECTED_FIXTURE_NAMES[i];
            JSONObject fixture = findFixtureByName(fixtures, name);
            int targets = fixture.getJSONArray("targets").length();

            assertEquals(name + ": zoomLevel", EXPECTED_ZOOM_LEVELS[i].name(), fixture.getString("zoomLevel"));
            assertEquals(name + ": timeZone", EXPECTED_TIME_ZONES[i], fixture.getString("timeZone"));

            if (EXPECTED_DST_TRANSITIONS[i] == null) {
                assertTrue(name + ": dstTransition is null", fixture.isNull("dstTransition"));
            } else {
                assertEquals(name + ": dstTransition", EXPECTED_DST_TRANSITIONS[i], fixture.getString("dstTransition"));
            }

            assertEquals(name + ": target count", EXPECTED_TARGET_COUNTS[i], targets);

            targetCount += targets;
        }

        assertEquals("Target count of all fixtures", EXPECTED_TARGET_COUNT, targetCount);
    }

    /**
     * Asserts that the names are the expected names, each occurring once, in any order.
     */
    private void assertFixtureNames(final String description, final String[] expectedNames, final List<String> names) {
        assertEquals(description + ": count in " + names, expectedNames.length, names.size());

        for (String expectedName : expectedNames) {
            assertTrue(description + ": " + expectedName + " in " + names, names.contains(expectedName));
        }
    }

    private void assertFixtureParameters(final JSONObject fixture, final ZoomLevel zoomLevel) throws JSONException {
        String name = fixture.getString("name");
        int hoursInterval = fixture.getInt("hoursInterval");
        int gridMinutes = fixture.getInt("gridMinutes");
        int stepMinutes = fixture.getInt("stepMinutes");
        int quantumMinutes = fixture.getInt("quantumMinutes");

        assertEquals(name + ": zoomLevel", zoomLevel.name(), fixture.getString("zoomLevel"));
        assertEquals(name + ": hoursInterval", zoomLevel.getHoursInterval(), hoursInterval);
        assertEquals(name + ": cellWidth", CELL_WIDTH, fixture.getInt("cellWidth"));
        assertEquals(name + ": gridMinutes", GanttChartComponentPattern.MOVE_GRID_MINUTES, gridMinutes);
        assertEquals(name + ": quantumMinutes", hoursInterval * MINUTES_PER_HOUR / PRECISION, quantumMinutes);
        assertTrue(name + ": stepMinutes is positive", stepMinutes > 0);
        assertEquals(name + ": stepMinutes is a multiple of gridMinutes", 0, stepMinutes % gridMinutes);
        assertEquals(name + ": stepMinutes is a multiple of quantumMinutes", 0, stepMinutes % quantumMinutes);
        assertEquals(name + ": stepMinutes is the least common multiple of gridMinutes and quantumMinutes",
                leastCommonMultiple(gridMinutes, quantumMinutes), stepMinutes);
        assertTrue(name + ": targets", fixture.getJSONArray("targets").length() >= 1);
    }

    private void assertDstTransition(final JSONObject fixture, final DateTimeZone zone, final LocalDateTime scaleStart,
            final LocalDateTime scaleEnd) throws JSONException {
        String name = fixture.getString("name");
        String dstTransition = fixture.getString("dstTransition");
        int startOffset = zone.getOffset(scaleStart.toDateTime(zone));
        int endOffset = zone.getOffset(scaleEnd.toDateTime(zone));

        if (SPRING_FORWARD.equals(dstTransition)) {
            assertTrue(name + ": zone offset rises between scale start and end", endOffset > startOffset);
        } else if (FALL_BACK.equals(dstTransition)) {
            assertTrue(name + ": zone offset falls between scale start and end", endOffset < startOffset);
        } else {
            fail(name + ": unknown dstTransition " + dstTransition);
        }
    }

    private void assertConsecutiveTargets(final JSONObject fixture, final LocalDateTime scaleStart, final JSONObject previous,
            final JSONObject next, final int hoursInterval, final long quantumMillis) throws JSONException {
        LocalDateTime previousWallClock = wallClock(previous.getString("dateFrom"));
        LocalDateTime nextWallClock = wallClock(next.getString("dateFrom"));
        double expectedCells = toCells(wallClockMillisBetween(previousWallClock, nextWallClock), hoursInterval);
        String message = describe(fixture, next, "cells after " + previous.getString("dateFrom"));

        assertEquals(message + " (untruncated)", expectedCells,
                next.getDouble("untruncatedCells") - previous.getDouble("untruncatedCells"), DELTA);

        if (wallClockMillisBetween(scaleStart, previousWallClock) % quantumMillis == 0
                && wallClockMillisBetween(scaleStart, nextWallClock) % quantumMillis == 0) {
            assertEquals(message + " (truncated)", expectedCells,
                    next.getDouble("truncatedCells") - previous.getDouble("truncatedCells"), DELTA);
        }
    }

    /**
     * Reads the fixture resource and returns its {@code fixtures} array.
     */
    private JSONArray loadFixtures() throws IOException, JSONException {
        InputStream in = getClass().getResourceAsStream(FIXTURE_RESOURCE);
        assertNotNull("Missing fixture resource " + FIXTURE_RESOURCE, in);

        StringBuilder text = new StringBuilder();
        BufferedReader reader = new BufferedReader(new InputStreamReader(in, FIXTURE_ENCODING));
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                text.append(line).append('\n');
            }
        } finally {
            reader.close();
        }

        JSONArray fixtures = new JSONObject(text.toString()).getJSONArray("fixtures");
        assertTrue("Fixture resource " + FIXTURE_RESOURCE + " holds no fixtures", fixtures.length() >= 1);

        return fixtures;
    }

    /**
     * Returns the first fixture of the given zoom level whose {@code dstTransition} is null, or null when there is none.
     */
    private JSONObject findNonDstFixture(final JSONArray fixtures, final ZoomLevel zoomLevel) throws JSONException {
        for (int i = 0; i < fixtures.length(); i++) {
            JSONObject fixture = fixtures.getJSONObject(i);

            if (zoomLevel.name().equals(fixture.getString("zoomLevel")) && fixture.isNull("dstTransition")) {
                return fixture;
            }
        }

        return null;
    }

    /**
     * Returns the fixture with the given name, failing unless exactly one fixture has that name.
     */
    private JSONObject findFixtureByName(final JSONArray fixtures, final String name) throws JSONException {
        JSONObject found = null;
        int occurrences = 0;

        for (int i = 0; i < fixtures.length(); i++) {
            JSONObject fixture = fixtures.getJSONObject(i);

            if (name.equals(fixture.getString("name"))) {
                found = fixture;
                occurrences++;
            }
        }

        assertEquals("Fixtures named " + name, 1, occurrences);

        return found;
    }

    /**
     * Sets the JVM and Joda-Time default zones to the given zone.
     */
    private void useZone(final String timeZoneId) {
        TimeZone timeZone = TimeZone.getTimeZone(timeZoneId);
        assertEquals("Unknown time zone " + timeZoneId, timeZoneId, timeZone.getID());

        TimeZone.setDefault(timeZone);
        DateTimeZone.setDefault(DateTimeZone.forID(timeZoneId));
    }

    /**
     * Switches the default zones to the fixture's zone and creates the fixture's scale in that zone.
     */
    private GanttChartScaleImpl createScale(final JSONObject fixture) throws JSONException, ParseException {
        useZone(fixture.getString("timeZone"));

        Date scaleDateFrom = parseDate(fixture.getString("scaleDateFrom"));
        Date scaleDateTo = parseDate(fixture.getString("scaleDateTo"));

        return new GanttChartScaleImpl(mock(GanttChartComponentState.class), ZoomLevel.valueOf(fixture.getString("zoomLevel")),
                scaleDateFrom, scaleDateTo);
    }

    /**
     * Parses a {@code yyyy-MM-dd} or {@code yyyy-MM-dd HH:mm:ss} string in the current default zone.
     */
    private Date parseDate(final String value) throws ParseException {
        SimpleDateFormat format = new SimpleDateFormat(patternFor(value));
        format.setLenient(false);

        return format.parse(value);
    }

    /**
     * Parses a {@code yyyy-MM-dd} or {@code yyyy-MM-dd HH:mm:ss} string as a zone-free wall-clock time; a date-only string
     * yields midnight.
     */
    private LocalDateTime wallClock(final String value) {
        DateTimeFormatter formatter = DateTimeFormat.forPattern(patternFor(value));

        return formatter.parseLocalDateTime(value);
    }

    private String patternFor(final String value) {
        if (value.length() == DATE_PATTERN.length()) {
            return DATE_PATTERN;
        }

        return DATE_TIME_PATTERN;
    }

    /**
     * Returns the wall-clock distance between two wall-clock times in milliseconds, measured in UTC.
     */
    private long wallClockMillisBetween(final LocalDateTime from, final LocalDateTime to) {
        return to.toDateTime(DateTimeZone.UTC).getMillis() - from.toDateTime(DateTimeZone.UTC).getMillis();
    }

    private double toCells(final long millis, final int hoursInterval) {
        return millis / (hoursInterval * (double) MILLIS_PER_HOUR);
    }

    private boolean isOnGrid(final LocalDateTime wallClock, final int gridMinutes) {
        return wallClock.getMinuteOfHour() % gridMinutes == 0 && wallClock.getSecondOfMinute() == 0;
    }

    private int leastCommonMultiple(final int first, final int second) {
        int a = first;
        int b = second;

        while (b != 0) {
            int remainder = a % b;
            a = b;
            b = remainder;
        }

        return first / a * second;
    }

    private boolean hasValue(final JSONObject fixture, final String key) {
        return fixture.has(key) && !fixture.isNull(key);
    }

    private String describe(final JSONObject fixture, final JSONObject target, final String subject) throws JSONException {
        return fixture.getString("name") + " / " + target.getString("dateFrom") + ": " + subject;
    }

}
