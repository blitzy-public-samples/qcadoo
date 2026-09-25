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
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.mockito.Matchers.any;
import static org.mockito.Matchers.anyDouble;
import static org.mockito.Matchers.anyString;
import static org.mockito.Matchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.util.ReflectionTestUtils.getField;
import static org.springframework.test.util.ReflectionTestUtils.setField;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Matchers;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.stubbing.Answer;

import com.qcadoo.localization.api.TranslationService;
import com.qcadoo.view.api.ViewDefinitionState;
import com.qcadoo.view.api.components.ganttChart.GanttChartItem;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemResolver;
import com.qcadoo.view.api.components.ganttChart.GanttChartScale;
import com.qcadoo.view.internal.ComponentDefinition;
import com.qcadoo.view.internal.ComponentOption;
import com.qcadoo.view.internal.api.InternalViewDefinition;

/**
 * Tests of the {@code moveItem} event of {@link GanttChartComponentState}: its registration next to the existing events, the
 * framework checks of a drop and their rejection reasons, the mutation of the dropped item through
 * {@link GanttChartModifiableItem}, the {@link GanttChartMoveRequest} exposed to listeners, {@code acceptMove} and
 * {@code rejectMove}, and the rendered {@code moveResult}.
 * <p>
 * Every test runs with UTC as the default JVM and Joda-Time zone unless it switches to {@code Europe/Warsaw}; both defaults
 * are restored after each test.
 */
public class GanttChartComponentStateMoveItemTest {

    private static final String PLUGIN_IDENTIFIER = "testPlugin";

    private static final String VIEW_NAME = "testView";

    private static final String COMPONENT_NAME = "gantt";

    private static final String TRANSLATION_PATH = PLUGIN_IDENTIFIER + "." + VIEW_NAME + "." + COMPONENT_NAME;

    private static final String MOVE_ERROR_FALLBACK_PREFIX = "qcadooView.gantt.move.error.";

    private static final String TRANSLATED_PREFIX = "translated:";

    private static final String MOVE_ITEM = "moveItem";

    private static final String REFRESH = "refresh";

    private static final String INITIALIZE = "initialize";

    private static final String SELECT = "select";

    private static final String MOVE_RESULT = "moveResult";

    private static final String ACCEPTED = "accepted";

    private static final String MESSAGE = "message";

    private static final String ITEM_ID = "itemId";

    private static final String NOT_HANDLED = "notHandled";

    private static final String MOVE_DISABLED = "moveDisabled";

    private static final String INVALID_REQUEST = "invalidRequest";

    private static final String NONEXISTENT_TIME = "nonexistentTime";

    private static final String ITEM_NOT_MOVABLE = "itemNotMovable";

    private static final String TARGET_ROW_UNKNOWN = "targetRowUnknown";

    private static final String OFF_GRID = "offGrid";

    private static final String ORIGIN_ROW = "L1";

    private static final String TARGET_ROW = "L2";

    private static final String UNKNOWN_ROW = "L9";

    private static final String MOVED_ITEM_NAME = "O-1";

    private static final String MAINTENANCE_ITEM_NAME = "E-1";

    private static final Long MOVED_ITEM_ID = 7L;

    private static final Long UNKNOWN_ITEM_ID = 99L;

    private static final String CONTEXT_SCHEDULE_ID = "productionLineScheduleId";

    private static final String SCHEDULE_ID = "5";

    private static final String HEADER_DATE_FROM = "2026-06-01";

    private static final String HEADER_DATE_TO = "2026-06-02";

    private static final String ORIGINAL_DATE_FROM = "2026-06-01 09:00:00";

    private static final String ORIGINAL_DATE_TO = "2026-06-01 10:00:00";

    private static final String DROP_DATE_FROM = "2026-06-01 10:30:00";

    private static final String DROP_DATE_TO = "2026-06-01 11:30:00";

    private static final String WARSAW = "Europe/Warsaw";

    private static final String UTC = "UTC";

    private static final double DELTA = 0.0;

    private static final Set<String> BOARD_KEYS = new HashSet<String>(Arrays.asList("zoomLevel", "dateFrom", "dateTo", "scale",
            "stripsOrientation", "itemsBorderWidth", "rows", "items", "collisions"));

    @Mock
    private InternalViewDefinition viewDefinition;

    @Mock
    private TranslationService translationService;

    @Mock
    private GanttChartItemResolver resolver;

    private TimeZone savedTimeZone;

    private DateTimeZone savedJodaTimeZone;

    @Before
    public final void init() {
        MockitoAnnotations.initMocks(this);

        savedTimeZone = TimeZone.getDefault();
        savedJodaTimeZone = DateTimeZone.getDefault();
        useZone(UTC);

        when(viewDefinition.getPluginIdentifier()).thenReturn(PLUGIN_IDENTIFIER);
        when(viewDefinition.getName()).thenReturn(VIEW_NAME);

        // (code, secondCode, locale, args...) answers with secondCode, the qcadooView.gantt.* fallback key.
        when(translationService.translate(anyString(), anyString(), any(Locale.class), Matchers.<String> anyVararg()))
                .thenAnswer(new Answer<String>() {

                    @Override
                    public String answer(final InvocationOnMock invocation) {
                        return (String) invocation.getArguments()[1];
                    }

                });
        // (code, locale, args...) answers with "translated:" followed by the code.
        when(translationService.translate(anyString(), any(Locale.class), Matchers.<String> anyVararg())).thenAnswer(
                new Answer<String>() {

                    @Override
                    public String answer(final InvocationOnMock invocation) {
                        return TRANSLATED_PREFIX + invocation.getArguments()[0];
                    }

                });
    }

    @After
    public final void restore() {
        TimeZone.setDefault(savedTimeZone);
        DateTimeZone.setDefault(savedJodaTimeZone);
    }

    /** Sets both the default JVM time zone and the default Joda-Time zone. */
    private void useZone(final String zoneId) {
        TimeZone.setDefault(TimeZone.getTimeZone(zoneId));
        DateTimeZone.setDefault(DateTimeZone.forID(zoneId));
    }

    /**
     * Stubs the resolver with a board of two rows for the given day: row {@code L1} holds the order item {@code O-1} (entity
     * id 7, 09:00-10:00) and the maintenance item {@code E-1} (no entity id, 12:00-13:00); row {@code L2} is empty. Dates
     * are computed in the default zone at resolve time, and every call builds new items with the scale it receives.
     */
    private void stubResolverForDay(final int year, final int month, final int day) {
        doAnswer(new Answer<Map<String, List<GanttChartItem>>>() {

            @Override
            public Map<String, List<GanttChartItem>> answer(final InvocationOnMock invocation) {
                GanttChartScale scale = (GanttChartScale) invocation.getArguments()[0];

                List<GanttChartItem> originRowItems = new ArrayList<GanttChartItem>();
                originRowItems.add(scale.createGanttChartItem(ORIGIN_ROW, MOVED_ITEM_NAME, MOVED_ITEM_ID, new DateTime(year,
                        month, day, 9, 0).toDate(), new DateTime(year, month, day, 10, 0).toDate()));
                originRowItems.add(scale.createGanttChartItem(ORIGIN_ROW, MAINTENANCE_ITEM_NAME, null, new DateTime(year,
                        month, day, 12, 0).toDate(), new DateTime(year, month, day, 13, 0).toDate()));

                Map<String, List<GanttChartItem>> board = new LinkedHashMap<String, List<GanttChartItem>>();
                board.put(ORIGIN_ROW, originRowItems);
                board.put(TARGET_ROW, new ArrayList<GanttChartItem>());
                return board;
            }

        }).when(resolver).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /** Stubs the resolver to return the given board on every call. */
    private void stubResolverWith(final Map<String, List<GanttChartItem>> board) {
        doReturn(board).when(resolver).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /** Creates a board holding the given item on row {@code L1} and an empty row {@code L2}. */
    private Map<String, List<GanttChartItem>> boardWithOriginRowItem(final GanttChartItem item) {
        List<GanttChartItem> originRowItems = new ArrayList<GanttChartItem>();
        originRowItems.add(item);

        Map<String, List<GanttChartItem>> board = new LinkedHashMap<String, List<GanttChartItem>>();
        board.put(ORIGIN_ROW, originRowItems);
        board.put(TARGET_ROW, new ArrayList<GanttChartItem>());
        return board;
    }

    /** Creates a mocked modifiable item on row {@code L1} named {@code O-1} with the given entity id and dates. */
    private GanttChartModifiableItem mockModifiableItem(final Long entityId, final String dateFrom, final String dateTo) {
        GanttChartModifiableItem item = mock(GanttChartModifiableItem.class);
        when(item.getEntityId()).thenReturn(entityId);
        when(item.getRowName()).thenReturn(ORIGIN_ROW);
        when(item.getName()).thenReturn(MOVED_ITEM_NAME);
        when(item.getDateFrom()).thenReturn(dateFrom);
        when(item.getDateTo()).thenReturn(dateTo);
        when(item.getFrom()).thenReturn(9.0);
        when(item.getTo()).thenReturn(10.0);
        return item;
    }

    /** Verifies that none of the four {@link GanttChartModifiableItem} setters was called on the item. */
    private void verifyNotMutated(final GanttChartModifiableItem item) {
        verify(item, never()).setDateFrom(anyString());
        verify(item, never()).setDateTo(anyString());
        verify(item, never()).setFrom(anyDouble());
        verify(item, never()).setTo(anyDouble());
    }

    /** Creates an initialized state at zoom level H1 for the given header dates, with the component context. */
    private GanttChartComponentState createState(final boolean allowItemMove, final String headerDateFrom,
            final String headerDateTo) throws Exception {
        return createState(allowItemMove, headerDateFrom, headerDateTo, true);
    }

    /**
     * Creates a pattern named {@code gantt} with the {@code resolver} and {@code allowItemMove} options, and a state of it
     * initialized in {@link Locale#ENGLISH} at zoom level H1 for the given header dates. With {@code withContext} the state
     * receives the context {@code {"productionLineScheduleId":"5"}}; without it the request carries no context.
     */
    private GanttChartComponentState createState(final boolean allowItemMove, final String headerDateFrom,
            final String headerDateTo, final boolean withContext) throws Exception {
        ComponentDefinition definition = new ComponentDefinition();
        definition.setName(COMPONENT_NAME);
        definition.setViewDefinition(viewDefinition);
        definition.setTranslationService(translationService);

        GanttChartComponentPattern pattern = new GanttChartComponentPattern(definition);
        pattern.addOption(new ComponentOption("resolver", Collections.singletonMap("value", GanttChartItemResolver.class
                .getName())));
        pattern.addOption(new ComponentOption("allowItemMove", Collections.singletonMap("value", String
                .valueOf(allowItemMove))));
        pattern.initializeComponent();

        GanttChartComponentState state = new GanttChartComponentState(resolver, pattern);
        state.setTranslationService(translationService);
        state.setTranslationPath(TRANSLATION_PATH);
        state.setName(COMPONENT_NAME);

        JSONObject headerParameters = new JSONObject();
        headerParameters.put("scale", "H1");
        headerParameters.put("dateFrom", headerDateFrom);
        headerParameters.put("dateTo", headerDateTo);

        JSONObject content = new JSONObject();
        content.put("headerParameters", headerParameters);

        JSONObject json = new JSONObject();
        json.put("content", content);
        if (withContext) {
            JSONObject context = new JSONObject();
            context.put(CONTEXT_SCHEDULE_ID, SCHEDULE_ID);
            json.put("context", context);
        }

        state.initialize(json, Locale.ENGLISH);
        return state;
    }

    /** Stubs the resolver for 2026-06-01 and creates a move-enabled state for 2026-06-01 to 2026-06-02. */
    private GanttChartComponentState createDefaultState() throws Exception {
        stubResolverForDay(2026, 6, 1);
        return createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
    }

    /**
     * Builds a moveItem payload with the originals of {@code O-1} on 2026-06-01; a null {@code dateFrom} leaves the key out.
     */
    private String payload(final Object itemId, final String row, final String dateFrom) throws JSONException {
        return payload(itemId, row, dateFrom, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
    }

    /**
     * Builds a moveItem payload with the original row {@code L1} and name {@code O-1}; a null {@code dateFrom} leaves the
     * key out.
     */
    private String payload(final Object itemId, final String row, final String dateFrom, final String originalDateFrom,
            final String originalDateTo) throws JSONException {
        JSONObject payload = new JSONObject();
        payload.put(ITEM_ID, itemId);
        payload.put("row", row);
        if (dateFrom != null) {
            payload.put("dateFrom", dateFrom);
        }
        payload.put("originalRow", ORIGIN_ROW);
        payload.put("originalName", MOVED_ITEM_NAME);
        payload.put("originalDateFrom", originalDateFrom);
        payload.put("originalDateTo", originalDateTo);
        return payload.toString();
    }

    /** Builds the payload of a drop of {@code O-1} onto row {@code L2} at 2026-06-01 10:30:00. */
    private String validPayload() throws JSONException {
        return payload(MOVED_ITEM_ID, TARGET_ROW, DROP_DATE_FROM);
    }

    /** Performs the moveItem event with the given arguments. */
    private void move(final GanttChartComponentState state, final String... args) {
        state.performEvent(mock(ViewDefinitionState.class), MOVE_ITEM, args);
    }

    /** Performs the given event without arguments. */
    private void perform(final GanttChartComponentState state, final String event) {
        state.performEvent(mock(ViewDefinitionState.class), event);
    }

    private JSONObject content(final GanttChartComponentState state) throws JSONException {
        return state.render().getJSONObject("content");
    }

    private JSONObject moveResult(final GanttChartComponentState state) throws JSONException {
        return content(state).getJSONObject(MOVE_RESULT);
    }

    private Set<String> keySet(final JSONObject json) {
        Set<String> keys = new HashSet<String>();
        Iterator<?> iterator = json.keys();
        while (iterator.hasNext()) {
            keys.add((String) iterator.next());
        }
        return keys;
    }

    /**
     * Asserts that the rendered move result is rejected with the fallback key of {@code move.error.<reason>} and that no move
     * request is exposed.
     */
    private void assertRejectedBy(final String caseName, final GanttChartComponentState state, final String reason)
            throws JSONException {
        JSONObject result = moveResult(state);
        assertFalse(caseName, result.getBoolean(ACCEPTED));
        assertEquals(caseName, MOVE_ERROR_FALLBACK_PREFIX + reason, result.getString(MESSAGE));
        assertNull(caseName, state.getMoveRequest());
    }

    private void assertRejectedBy(final GanttChartComponentState state, final String reason) throws JSONException {
        assertRejectedBy(reason, state, reason);
    }

    private long utcMillis(final int year, final int month, final int day, final int hour, final int minute) {
        return new DateTime(year, month, day, hour, minute, DateTimeZone.UTC).getMillis();
    }

    private Date defaultZoneDate(final int year, final int month, final int day, final int hour, final int minute) {
        return new DateTime(year, month, day, hour, minute).toDate();
    }


    /**
     * The state registers exactly one handler each for refresh, initialize, select and moveItem, and all four run on one
     * state: refresh renders the rows, and moveItem renders a moveResult.
     */
    @Test
    public final void shouldRegisterMoveItemAlongsideExistingEvents() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        Map<?, ?> eventHandlers = (Map<?, ?>) getField(getField(state, "eventHandlerHolder"), "eventHandlers");

        // when
        perform(state, REFRESH);
        JSONObject contentAfterRefresh = content(state);
        perform(state, INITIALIZE);
        perform(state, SELECT);
        move(state, validPayload());
        JSONObject contentAfterMove = content(state);

        // then
        assertEquals(new HashSet<Object>(Arrays.<Object> asList(REFRESH, INITIALIZE, SELECT, MOVE_ITEM)), new HashSet<Object>(
                eventHandlers.keySet()));
        assertEquals(1, ((List<?>) eventHandlers.get(MOVE_ITEM)).size());
        assertEquals(1, ((List<?>) eventHandlers.get(REFRESH)).size());
        assertEquals(1, ((List<?>) eventHandlers.get(INITIALIZE)).size());
        assertEquals(1, ((List<?>) eventHandlers.get(SELECT)).size());

        assertTrue(contentAfterRefresh.has("rows"));
        assertEquals(2, contentAfterRefresh.getJSONArray("rows").length());
        assertFalse(contentAfterRefresh.has(MOVE_RESULT));

        assertTrue(contentAfterMove.has(MOVE_RESULT));
        assertNotNull(state.getMoveRequest());
        verify(resolver, times(3)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * The dropped item receives the new dates and the forward-transform positions of the scale through the four
     * {@link GanttChartModifiableItem} setters, and becomes the item of the move request for the target row.
     */
    @Test
    public final void shouldMutateDroppedItemThroughModifiableItemAndExposeMoveRequest() throws Exception {
        // given
        GanttChartModifiableItem mockItem = mockModifiableItem(MOVED_ITEM_ID, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
        stubResolverWith(boardWithOriginRowItem(mockItem));
        GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);

        // when
        move(state, validPayload());

        // then
        ArgumentCaptor<GanttChartScale> scaleCaptor = ArgumentCaptor.forClass(GanttChartScale.class);
        verify(resolver).resolve(scaleCaptor.capture(), any(JSONObject.class), eq(Locale.ENGLISH));
        GanttChartItem expected = scaleCaptor.getValue().createGanttChartItem(TARGET_ROW, MOVED_ITEM_NAME, MOVED_ITEM_ID,
                defaultZoneDate(2026, 6, 1, 10, 30), defaultZoneDate(2026, 6, 1, 11, 30));
        assertEquals(10.5, expected.getFrom(), DELTA);
        assertEquals(11.5, expected.getTo(), DELTA);

        verify(mockItem).setDateFrom(DROP_DATE_FROM);
        verify(mockItem).setDateTo(DROP_DATE_TO);
        verify(mockItem).setFrom(expected.getFrom());
        verify(mockItem).setTo(expected.getTo());

        GanttChartMoveRequest moveRequest = state.getMoveRequest();
        assertNotNull(moveRequest);
        assertSame(mockItem, moveRequest.getItem());
        assertEquals(TARGET_ROW, moveRequest.getTargetRowName());
    }

    /**
     * The move request carries the entity id, the component context the resolver received, the originals sent by the client
     * and the new dates; returned dates and contexts are copies. A request without a context exposes an empty context.
     */
    @Test
    public final void shouldExposeComponentContextAndOriginalsInMoveRequest() throws Exception {
        // given
        stubResolverForDay(2026, 6, 1);
        GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        GanttChartComponentState stateWithoutContext = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO, false);

        // when
        move(state, validPayload());
        move(stateWithoutContext, validPayload());

        // then
        GanttChartMoveRequest moveRequest = state.getMoveRequest();
        assertNotNull(moveRequest);
        assertEquals(Long.valueOf(7L), moveRequest.getItemId());
        assertEquals(MOVED_ITEM_NAME, moveRequest.getItem().getName());
        assertEquals(TARGET_ROW, moveRequest.getTargetRowName());
        assertEquals(SCHEDULE_ID, moveRequest.getContext().getString(CONTEXT_SCHEDULE_ID));
        assertEquals(ORIGIN_ROW, moveRequest.getOriginalRowName());
        assertEquals(MOVED_ITEM_NAME, moveRequest.getOriginalName());
        assertEquals(ORIGINAL_DATE_FROM, moveRequest.getOriginalDateFrom());
        assertEquals(ORIGINAL_DATE_TO, moveRequest.getOriginalDateTo());
        assertEquals(utcMillis(2026, 6, 1, 10, 30), moveRequest.getDateFrom().getTime());
        assertEquals(utcMillis(2026, 6, 1, 11, 30), moveRequest.getDateTo().getTime());

        ArgumentCaptor<JSONObject> contextCaptor = ArgumentCaptor.forClass(JSONObject.class);
        verify(resolver, times(2)).resolve(any(GanttChartScale.class), contextCaptor.capture(), eq(Locale.ENGLISH));
        assertEquals(contextCaptor.getAllValues().get(0).toString(), moveRequest.getContext().toString());
        assertNull(contextCaptor.getAllValues().get(1));

        moveRequest.getDateFrom().setTime(0L);
        moveRequest.getDateTo().setTime(0L);
        moveRequest.getContext().put(CONTEXT_SCHEDULE_ID, "99");
        assertEquals(utcMillis(2026, 6, 1, 10, 30), moveRequest.getDateFrom().getTime());
        assertEquals(utcMillis(2026, 6, 1, 11, 30), moveRequest.getDateTo().getTime());
        assertEquals(SCHEDULE_ID, moveRequest.getContext().getString(CONTEXT_SCHEDULE_ID));

        GanttChartMoveRequest moveRequestWithoutContext = stateWithoutContext.getMoveRequest();
        assertNotNull(moveRequestWithoutContext);
        assertEquals(0, moveRequestWithoutContext.getContext().length());
    }

    /**
     * acceptMove re-resolves the board and renders rows, items and collisions together with an accepted moveResult for the
     * moved item.
     */
    @Test
    public final void shouldRefreshBoardAndRenderAcceptedMoveResult() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        move(state, validPayload());

        // when
        state.acceptMove();

        // then
        JSONObject content = content(state);
        JSONArray rows = content.getJSONArray("rows");
        assertEquals(2, rows.length());
        assertEquals(ORIGIN_ROW, rows.getString(0));
        assertEquals(TARGET_ROW, rows.getString(1));
        assertEquals(2, content.getJSONArray("items").length());
        assertEquals(0, content.getJSONArray("collisions").length());

        JSONObject moveResult = content.getJSONObject(MOVE_RESULT);
        assertTrue(moveResult.getBoolean(ACCEPTED));
        assertEquals(7L, moveResult.getLong(ITEM_ID));
        assertFalse(moveResult.has(MESSAGE));

        verify(resolver, times(2)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * A move result whose item id cannot be written as JSON (a non-finite number) makes acceptMove fail with an
     * {@link IllegalStateException} caused by the {@link JSONException}.
     */
    @Test
    public final void shouldFailWithIllegalStateWhenMoveResultItemIdIsNotWritable() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        move(state, validPayload());
        setField(state, "moveResult", new JSONObject() {

            @Override
            public Object opt(final String key) {
                return Double.valueOf(Double.NaN);
            }

        });

        // when
        IllegalStateException thrown = null;
        try {
            state.acceptMove();
        } catch (IllegalStateException e) {
            thrown = e;
        }

        // then
        assertNotNull(thrown);
        assertTrue(thrown.getCause() instanceof JSONException);
    }

    /**
     * No drop can name an item without an entity id: a null item id is an invalid request that never reaches the resolver,
     * and a numeric id that matches no resolved item, on a board holding only id-less or missing items, is rejected as not
     * movable while the id-less item stays unchanged.
     */
    @Test
    public final void shouldRejectMoveForItemWithoutEntityId() throws Exception {
        // given
        GanttChartComponentState nullIdState = createDefaultState();

        GanttChartComponentState unknownIdState = createDefaultState();

        GanttChartModifiableItem maintenanceItem = mockModifiableItem(null, "2026-06-01 12:00:00", "2026-06-01 13:00:00");
        List<GanttChartItem> maintenanceRowItems = new ArrayList<GanttChartItem>();
        maintenanceRowItems.add(maintenanceItem);
        maintenanceRowItems.add(null);
        Map<String, List<GanttChartItem>> maintenanceBoard = new LinkedHashMap<String, List<GanttChartItem>>();
        maintenanceBoard.put(ORIGIN_ROW, maintenanceRowItems);
        maintenanceBoard.put(TARGET_ROW, null);

        // when
        move(nullIdState, payload(JSONObject.NULL, TARGET_ROW, DROP_DATE_FROM));
        move(unknownIdState, payload(UNKNOWN_ITEM_ID, TARGET_ROW, DROP_DATE_FROM));

        stubResolverWith(maintenanceBoard);
        GanttChartComponentState maintenanceOnlyState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        move(maintenanceOnlyState, payload(MOVED_ITEM_ID, ORIGIN_ROW, DROP_DATE_FROM));

        stubResolverWith(null);
        GanttChartComponentState emptyBoardState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        move(emptyBoardState, validPayload());

        // then
        assertRejectedBy("null item id", nullIdState, INVALID_REQUEST);
        assertRejectedBy("unknown item id", unknownIdState, ITEM_NOT_MOVABLE);
        assertEquals(99L, moveResult(unknownIdState).getLong(ITEM_ID));
        assertRejectedBy("board of id-less items", maintenanceOnlyState, ITEM_NOT_MOVABLE);
        assertRejectedBy("no resolved board", emptyBoardState, ITEM_NOT_MOVABLE);
        verifyNotMutated(maintenanceItem);
        verify(resolver, times(3)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }


    /**
     * A drop start whose minute is not a multiple of {@link GanttChartComponentPattern#MOVE_GRID_MINUTES} or whose seconds are
     * not 0 is rejected as off the grid, with the grid step as translation argument; starts at :00 and :30 pass.
     */
    @Test
    public final void shouldRejectOffGridDate() throws Exception {
        // given
        GanttChartComponentState offMinuteState = createDefaultState();
        GanttChartComponentState offSecondState = createDefaultState();
        GanttChartComponentState fullHourState = createDefaultState();
        GanttChartComponentState halfHourState = createDefaultState();

        // when
        move(offMinuteState, payload(MOVED_ITEM_ID, TARGET_ROW, "2026-06-01 10:07:00"));
        move(offSecondState, payload(MOVED_ITEM_ID, TARGET_ROW, "2026-06-01 10:30:15"));
        move(fullHourState, payload(MOVED_ITEM_ID, TARGET_ROW, "2026-06-01 11:00:00"));
        move(halfHourState, payload(MOVED_ITEM_ID, TARGET_ROW, DROP_DATE_FROM));

        // then
        assertEquals(30, GanttChartComponentPattern.MOVE_GRID_MINUTES);
        assertRejectedBy("10:07:00", offMinuteState, OFF_GRID);
        assertRejectedBy("10:30:15", offSecondState, OFF_GRID);
        verify(translationService, times(2)).translate(TRANSLATION_PATH + ".move.error." + OFF_GRID,
                MOVE_ERROR_FALLBACK_PREFIX + OFF_GRID, Locale.ENGLISH, "30");

        assertNotNull(fullHourState.getMoveRequest());
        assertEquals(utcMillis(2026, 6, 1, 11, 0), fullHourState.getMoveRequest().getDateFrom().getTime());
        assertNotNull(halfHourState.getMoveRequest());
        assertEquals(utcMillis(2026, 6, 1, 10, 30), halfHourState.getMoveRequest().getDateFrom().getTime());
    }

    /**
     * In {@code Europe/Warsaw}, 02:30 on the spring-forward day does not exist, and its drop is rejected as a nonexistent time
     * before any item is resolved.
     */
    @Test
    public final void shouldRejectNonexistentLocalTimeInDstGap() throws Exception {
        // given
        useZone(WARSAW);
        stubResolverForDay(2026, 3, 29);
        GanttChartComponentState state = createState(true, "2026-03-29", "2026-03-30");

        // when
        move(state, payload(MOVED_ITEM_ID, TARGET_ROW, "2026-03-29 02:30:00", "2026-03-29 09:00:00", "2026-03-29 10:00:00"));

        // then
        assertRejectedBy(state, NONEXISTENT_TIME);
        assertEquals(7L, moveResult(state).getLong(ITEM_ID));
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * In {@code Europe/Warsaw}, 02:30 on the fall-back day occurs twice, and its drop resolves to the earlier occurrence
     * (00:30 UTC), keeping the item's one-hour duration.
     */
    @Test
    public final void shouldUseEarlierOffsetInDstOverlap() throws Exception {
        // given
        useZone(WARSAW);
        stubResolverForDay(2026, 10, 25);
        GanttChartComponentState state = createState(true, "2026-10-25", "2026-10-26");

        // when
        move(state, payload(MOVED_ITEM_ID, TARGET_ROW, "2026-10-25 02:30:00", "2026-10-25 09:00:00", "2026-10-25 10:00:00"));

        // then
        GanttChartMoveRequest moveRequest = state.getMoveRequest();
        assertNotNull(moveRequest);
        assertEquals(utcMillis(2026, 10, 25, 0, 30), moveRequest.getDateFrom().getTime());
        assertEquals(utcMillis(2026, 10, 25, 1, 30), moveRequest.getDateTo().getTime());
        assertEquals("2026-10-25 02:30:00", moveRequest.getItem().getDateFrom());
        assertEquals("2026-10-25 02:30:00", moveRequest.getItem().getDateTo());
        assertEquals("2026-10-25 09:00:00", moveRequest.getOriginalDateFrom());
        assertEquals("2026-10-25 10:00:00", moveRequest.getOriginalDateTo());
        assertEquals(TARGET_ROW, moveRequest.getTargetRowName());
    }

    /** A board whose pattern does not allow item moves rejects every drop without resolving items. */
    @Test
    public final void shouldRejectMoveWhenItemMoveNotAllowed() throws Exception {
        // given
        stubResolverForDay(2026, 6, 1);
        GanttChartComponentState state = createState(false, HEADER_DATE_FROM, HEADER_DATE_TO);

        // when
        move(state, validPayload());

        // then
        assertRejectedBy(state, MOVE_DISABLED);
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /** A drop onto a row that is not a key of the resolved board is rejected as an unknown target row. */
    @Test
    public final void shouldRejectMoveToUnknownRow() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();

        // when
        move(state, payload(MOVED_ITEM_ID, UNKNOWN_ROW, DROP_DATE_FROM));

        // then
        assertRejectedBy(state, TARGET_ROW_UNKNOWN);
        assertEquals(7L, moveResult(state).getLong(ITEM_ID));
    }


    /**
     * Missing or null arguments, non-JSON text, a payload without {@code dateFrom}, an unparseable {@code dateFrom}, a
     * non-numeric item id, a board whose scale carries a global error and a resolved item without a parseable start are each
     * rejected as an invalid request; only the last case reaches the resolver, and its item stays unchanged.
     */
    @Test
    public final void shouldRejectMalformedPayload() throws Exception {
        // given
        String[][] malformedArgs = { new String[0], new String[] { null }, new String[] { "not json" },
                new String[] { payload(MOVED_ITEM_ID, TARGET_ROW, null) },
                new String[] { payload(MOVED_ITEM_ID, TARGET_ROW, "2026-06-01 25:99:00") },
                new String[] { payload("abc", TARGET_ROW, DROP_DATE_FROM) } };
        String[] caseNames = { "no arguments", "null argument", "not json", "without dateFrom", "unparseable dateFrom",
                "non-numeric itemId" };
        List<GanttChartComponentState> malformedStates = new ArrayList<GanttChartComponentState>();
        for (int index = 0; index < malformedArgs.length; index++) {
            malformedStates.add(createDefaultState());
        }

        GanttChartComponentState invalidScaleState = createState(true, "2026-06-02", "2026-06-01");

        GanttChartModifiableItem itemWithoutStart = mockModifiableItem(MOVED_ITEM_ID, null, ORIGINAL_DATE_TO);
        stubResolverWith(boardWithOriginRowItem(itemWithoutStart));
        GanttChartComponentState itemWithoutStartState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);

        // when
        for (int index = 0; index < malformedArgs.length; index++) {
            move(malformedStates.get(index), malformedArgs[index]);
        }
        move(invalidScaleState, validPayload());
        move(itemWithoutStartState, validPayload());

        // then
        for (int index = 0; index < malformedArgs.length; index++) {
            assertRejectedBy(caseNames[index], malformedStates.get(index), INVALID_REQUEST);
        }
        assertRejectedBy("invalid scale", invalidScaleState, INVALID_REQUEST);
        assertRejectedBy("item without start", itemWithoutStartState, INVALID_REQUEST);
        verifyNotMutated(itemWithoutStart);
        verify(resolver, times(1)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * rejectMove HTML-escapes each argument, translates the full key with the escaped arguments, and renders a rejected
     * moveResult carrying that message; a null argument array translates without arguments.
     */
    @Test
    public final void shouldEscapeRejectionArguments() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        GanttChartComponentState stateWithoutArguments = createDefaultState();
        move(state, validPayload());
        move(stateWithoutArguments, validPayload());

        // when
        state.rejectMove("some.key", "<b>");
        stateWithoutArguments.rejectMove("other.key", (String[]) null);

        // then
        verify(translationService).translate("some.key", Locale.ENGLISH, "&lt;b&gt;");
        JSONObject moveResult = moveResult(state);
        assertEquals(TRANSLATED_PREFIX + "some.key", moveResult.getString(MESSAGE));
        assertFalse(moveResult.getBoolean(ACCEPTED));
        assertEquals(7L, moveResult.getLong(ITEM_ID));
        assertEquals(Collections.singleton(MOVE_RESULT), keySet(content(state)));

        verify(translationService).translate("other.key", Locale.ENGLISH);
        JSONObject moveResultWithoutArguments = moveResult(stateWithoutArguments);
        assertEquals(TRANSLATED_PREFIX + "other.key", moveResultWithoutArguments.getString(MESSAGE));
        assertFalse(moveResultWithoutArguments.getBoolean(ACCEPTED));
    }

    /** A drop that passes the framework checks stays rejected as not handled until a listener accepts or rejects it. */
    @Test
    public final void shouldRejectByDefaultWhenNoListenerDecides() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();

        // when
        move(state, validPayload());

        // then
        JSONObject moveResult = moveResult(state);
        assertFalse(moveResult.getBoolean(ACCEPTED));
        assertEquals(MOVE_ERROR_FALLBACK_PREFIX + NOT_HANDLED, moveResult.getString(MESSAGE));
        assertEquals(7L, moveResult.getLong(ITEM_ID));
        assertNotNull(state.getMoveRequest());
    }

    /** A rejected drop renders a content holding only the moveResult with the item id, the rejection and its message. */
    @Test
    public final void shouldRenderOnlyMoveResultWhenRejected() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();

        // when
        move(state, payload(MOVED_ITEM_ID, UNKNOWN_ROW, DROP_DATE_FROM));

        // then
        JSONObject content = content(state);
        assertEquals(Collections.singleton(MOVE_RESULT), keySet(content));

        JSONObject moveResult = content.getJSONObject(MOVE_RESULT);
        assertEquals(new HashSet<String>(Arrays.asList(ITEM_ID, ACCEPTED, MESSAGE)), keySet(moveResult));
        assertEquals(7L, moveResult.getLong(ITEM_ID));
        assertFalse(moveResult.getBoolean(ACCEPTED));
        assertEquals(MOVE_ERROR_FALLBACK_PREFIX + TARGET_ROW_UNKNOWN, moveResult.getString(MESSAGE));
    }

    /**
     * refresh, initialize and select render the board keys only, with no moveResult and no move request.
     */
    @Test
    public final void shouldRenderUnchangedContentForRefreshInitializeAndSelect() throws Exception {
        // given
        GanttChartComponentState refreshState = createDefaultState();
        GanttChartComponentState initializeState = createDefaultState();
        GanttChartComponentState selectState = createDefaultState();

        // when
        perform(refreshState, REFRESH);
        perform(initializeState, INITIALIZE);
        perform(selectState, REFRESH);
        perform(selectState, SELECT);

        // then
        JSONObject refreshContent = content(refreshState);
        assertEquals(BOARD_KEYS, keySet(refreshContent));
        assertFalse(refreshContent.has(MOVE_RESULT));
        assertEquals("H1", refreshContent.getString("zoomLevel"));
        assertEquals(2, refreshContent.getJSONArray("items").length());
        assertNull(refreshState.getMoveRequest());

        JSONObject initializeContent = content(initializeState);
        assertEquals(BOARD_KEYS, keySet(initializeContent));
        assertFalse(initializeContent.has(MOVE_RESULT));
        assertEquals("H3", initializeContent.getString("zoomLevel"));
        assertNull(initializeState.getMoveRequest());

        JSONObject selectContent = selectState.renderContent();
        assertEquals(BOARD_KEYS, keySet(selectContent));
        assertFalse(selectContent.has(MOVE_RESULT));
        assertNull(selectState.getMoveRequest());
    }

    /**
     * After each framework rejection reason the state exposes no move request, including a rejection that follows a valid
     * drop on the same state; after a valid drop it exposes one.
     */
    @Test
    public final void shouldReturnNoMoveRequestAfterEachFrameworkRejection() throws Exception {
        // given
        stubResolverForDay(2026, 6, 1);
        GanttChartComponentState moveDisabledState = createState(false, HEADER_DATE_FROM, HEADER_DATE_TO);
        GanttChartComponentState invalidRequestState = createDefaultState();
        GanttChartComponentState itemNotMovableState = createDefaultState();
        GanttChartComponentState targetRowUnknownState = createDefaultState();
        GanttChartComponentState offGridState = createDefaultState();
        GanttChartComponentState validThenOffGridState = createDefaultState();
        GanttChartComponentState validState = createDefaultState();

        // when
        move(moveDisabledState, validPayload());
        move(invalidRequestState, "not json");
        move(itemNotMovableState, payload(UNKNOWN_ITEM_ID, TARGET_ROW, DROP_DATE_FROM));
        move(targetRowUnknownState, payload(MOVED_ITEM_ID, UNKNOWN_ROW, DROP_DATE_FROM));
        move(offGridState, payload(MOVED_ITEM_ID, TARGET_ROW, "2026-06-01 10:07:00"));
        move(validThenOffGridState, validPayload());
        GanttChartMoveRequest firstMoveRequest = validThenOffGridState.getMoveRequest();
        move(validThenOffGridState, payload(MOVED_ITEM_ID, TARGET_ROW, "2026-06-01 10:07:00"));
        move(validState, validPayload());

        useZone(WARSAW);
        stubResolverForDay(2026, 3, 29);
        GanttChartComponentState nonexistentTimeState = createState(true, "2026-03-29", "2026-03-30");
        move(nonexistentTimeState, payload(MOVED_ITEM_ID, TARGET_ROW, "2026-03-29 02:30:00", "2026-03-29 09:00:00",
                "2026-03-29 10:00:00"));

        // then
        assertRejectedBy(moveDisabledState, MOVE_DISABLED);
        assertRejectedBy(invalidRequestState, INVALID_REQUEST);
        assertRejectedBy(itemNotMovableState, ITEM_NOT_MOVABLE);
        assertRejectedBy(targetRowUnknownState, TARGET_ROW_UNKNOWN);
        assertRejectedBy(offGridState, OFF_GRID);
        assertNotNull(firstMoveRequest);
        assertRejectedBy("valid then off grid", validThenOffGridState, OFF_GRID);
        assertRejectedBy(nonexistentTimeState, NONEXISTENT_TIME);

        assertNotNull(validState.getMoveRequest());
        assertEquals(TARGET_ROW, validState.getMoveRequest().getTargetRowName());
    }

}

