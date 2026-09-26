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
import static org.junit.Assert.assertNotSame;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;
import static org.mockito.Matchers.any;
import static org.mockito.Matchers.anyDouble;
import static org.mockito.Matchers.anyString;
import static org.mockito.Matchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;
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
import org.springframework.context.ApplicationContext;

import com.qcadoo.localization.api.TranslationService;
import com.qcadoo.view.api.ComponentState;
import com.qcadoo.view.api.ComponentState.MessageType;
import com.qcadoo.view.api.ViewDefinitionState;
import com.qcadoo.view.api.components.ganttChart.GanttChartItem;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemResolver;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemTooltipBuilder;
import com.qcadoo.view.api.components.ganttChart.GanttChartScale;
import com.qcadoo.view.internal.ComponentDefinition;
import com.qcadoo.view.internal.ComponentOption;
import com.qcadoo.view.internal.FieldEntityIdChangeListener;
import com.qcadoo.view.internal.api.InternalViewDefinition;
import com.qcadoo.view.internal.hooks.ViewEventListenerHook;

/**
 * Tests of the {@code moveItem} event of {@link GanttChartComponentState}: its registration next to the existing events, the
 * framework checks of a drop and their rejection reasons, the mutation of the dropped item through
 * {@link GanttChartModifiableItem}, the {@link GanttChartMoveRequest} exposed to listeners, {@code acceptMove} and
 * {@code rejectMove}, the rendered {@code moveResult}, the move results rendered when the handler or a listener fails, and
 * the exceptions {@code acceptMove} and {@code render} throw when the refresh of an accepted move or its chart rendering
 * fails.
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

    /** Strict JSON text of a drop of {@code O-1} (entity id 7) onto row {@code L2} at 2026-06-01 10:30:00. */
    private static final String VALID_PAYLOAD_TEXT = "{\"itemId\":7,\"row\":\"L2\",\"dateFrom\":\"2026-06-01 10:30:00\","
            + "\"originalRow\":\"L1\",\"originalName\":\"O-1\",\"originalDateFrom\":\"2026-06-01 09:00:00\","
            + "\"originalDateTo\":\"2026-06-01 10:00:00\"}";

    /** Payload keys whose values must be JSON strings. */
    private static final List<String> PAYLOAD_TEXT_KEYS = Collections.unmodifiableList(Arrays.asList("row", "dateFrom",
            "originalRow", "originalName", "originalDateFrom", "originalDateTo"));

    private static final String WARSAW = "Europe/Warsaw";

    private static final String UTC = "UTC";

    private static final String INTERNAL_ERROR_MESSAGE = "qcadooView.errorPage.error.internalError.explanation";

    private static final String EXCEPTION_DETAIL = "ERROR: relation \"orders_productionlinescheduleposition\" <b>at</b> line 1";

    private static final double DELTA = 0.0;

    private static final Set<String> BOARD_KEYS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList("zoomLevel",
            "dateFrom", "dateTo", "scale", "stripsOrientation", "itemsBorderWidth", "rows", "items", "collisions")));

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
     * Creates the state of {@link #createState(boolean, String, String, boolean, Long)} without a selected entity id.
     */
    private GanttChartComponentState createState(final boolean allowItemMove, final String headerDateFrom,
            final String headerDateTo, final boolean withContext) throws Exception {
        return createState(allowItemMove, headerDateFrom, headerDateTo, withContext, null);
    }

    /**
     * Creates a pattern named {@code gantt} with the {@code resolver} and {@code allowItemMove} options, and a state of it
     * initialized in {@link Locale#ENGLISH} at zoom level H1 for the given header dates. With {@code withContext} the state
     * receives the context {@code {"productionLineScheduleId":"5"}}; without it the request carries no context. A non-null
     * {@code selectedEntityId} is sent in the content as the selected entity id.
     */
    private GanttChartComponentState createState(final boolean allowItemMove, final String headerDateFrom,
            final String headerDateTo, final boolean withContext, final Long selectedEntityId) throws Exception {
        GanttChartComponentState state = createUninitializedState(allowItemMove);

        JSONObject headerParameters = new JSONObject();
        headerParameters.put("scale", "H1");
        headerParameters.put("dateFrom", headerDateFrom);
        headerParameters.put("dateTo", headerDateTo);

        JSONObject content = new JSONObject();
        content.put("headerParameters", headerParameters);
        if (selectedEntityId != null) {
            content.put("selectedEntityId", selectedEntityId);
        }

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

    /**
     * Creates a pattern named {@code gantt} with the {@code resolver} and {@code allowItemMove} options, and a state of it with
     * the translation service, translation path and name set, not yet initialized.
     */
    private GanttChartComponentState createUninitializedState(final boolean allowItemMove) throws Exception {
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

    /** Returns {@link #VALID_PAYLOAD_TEXT} with its only occurrence of {@code target} replaced by {@code replacement}. */
    private String validPayloadTextWith(final String target, final String replacement) {
        int index = VALID_PAYLOAD_TEXT.indexOf(target);
        assertTrue(target, index >= 0 && VALID_PAYLOAD_TEXT.indexOf(target, index + 1) < 0);
        return VALID_PAYLOAD_TEXT.replace(target, replacement);
    }

    /** Returns {@link #VALID_PAYLOAD_TEXT} with {@code key} set to {@code value}, or without {@code key} for a null value. */
    private String validPayloadWith(final String key, final Object value) throws JSONException {
        JSONObject payload = new JSONObject(VALID_PAYLOAD_TEXT);
        if (value == null) {
            payload.remove(key);
        } else {
            payload.put(key, value);
        }
        return payload.toString();
    }

    /**
     * Performs moveItem with each case's payload as the only argument, each on a fresh move-enabled state for 2026-06-01 to
     * 2026-06-02 answered by the current resolver stub.
     *
     * @return the states by case name, in case order
     */
    private Map<String, GanttChartComponentState> moveEachOnFreshState(final Map<String, String> payloadByCase)
            throws Exception {
        Map<String, GanttChartComponentState> stateByCase = new LinkedHashMap<String, GanttChartComponentState>();
        for (Map.Entry<String, String> payloadCase : payloadByCase.entrySet()) {
            GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
            move(state, payloadCase.getValue());
            stateByCase.put(payloadCase.getKey(), state);
        }
        return stateByCase;
    }

    /**
     * Asserts that each case's state rejected its move as an invalid request without a move request, with a null item id in
     * its moveResult when {@code expectedItemId} is null, else with that item id.
     */
    private void assertInvalidRequestForEach(final Map<String, GanttChartComponentState> stateByCase, final Long expectedItemId)
            throws JSONException {
        for (Map.Entry<String, GanttChartComponentState> stateCase : stateByCase.entrySet()) {
            assertRejectedBy(stateCase.getKey(), stateCase.getValue(), INVALID_REQUEST);
            JSONObject result = moveResult(stateCase.getValue());
            if (expectedItemId == null) {
                assertTrue(stateCase.getKey(), result.isNull(ITEM_ID));
            } else {
                assertEquals(stateCase.getKey(), expectedItemId.longValue(), result.getLong(ITEM_ID));
            }
        }
    }

    /**
     * Stubs the resolver with a board whose row {@code L1} holds {@code O-1} (entity id 7) created through the received scale
     * from the given instants, through the tooltip overload when {@code withTooltip} is true, and whose row {@code L2} is
     * empty.
     */
    private void stubResolverWithScaleItem(final Date itemDateFrom, final Date itemDateTo, final boolean withTooltip) {
        doAnswer(new Answer<Map<String, List<GanttChartItem>>>() {

            @Override
            public Map<String, List<GanttChartItem>> answer(final InvocationOnMock invocation) {
                GanttChartScale receivedScale = (GanttChartScale) invocation.getArguments()[0];
                GanttChartItem item;
                if (withTooltip) {
                    item = receivedScale.createGanttChartItem(ORIGIN_ROW, MOVED_ITEM_NAME, new GanttChartItemTooltipBuilder()
                            .withHeader(MOVED_ITEM_NAME).build(), MOVED_ITEM_ID, itemDateFrom, itemDateTo);
                } else {
                    item = receivedScale.createGanttChartItem(ORIGIN_ROW, MOVED_ITEM_NAME, MOVED_ITEM_ID, itemDateFrom,
                            itemDateTo);
                }
                return boardWithOriginRowItem(item);
            }

        }).when(resolver).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
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
     * refresh, initialize, select and moveItem run in that order on one state whose selected entity id is 7 and which has a
     * registered field listener. After each event the cumulative effect is exactly that of one handler per event: refresh
     * resolves the board once and renders its two rows without a moveResult; initialize resolves it a second time at zoom
     * level H3; select notifies the listener once with 7 and resolves nothing; moveItem resolves a third time, renders a
     * moveResult and exposes a move request, and the listener stays notified once.
     */
    @Test
    public final void shouldRegisterMoveItemAlongsideExistingEvents() throws Exception {
        // given
        stubResolverForDay(2026, 6, 1);
        GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO, true, MOVED_ITEM_ID);
        FieldEntityIdChangeListener selectListener = mock(FieldEntityIdChangeListener.class);
        state.addFieldEntityIdChangeListener("selectListener", selectListener);

        // when
        perform(state, REFRESH);

        // then
        verify(resolver, times(1)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        JSONObject contentAfterRefresh = content(state);
        assertEquals(2, contentAfterRefresh.getJSONArray("rows").length());
        assertFalse(contentAfterRefresh.has(MOVE_RESULT));
        verify(selectListener, never()).onFieldEntityIdChange(Matchers.<Long> any());

        // when
        perform(state, INITIALIZE);

        // then
        verify(resolver, times(2)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        assertEquals("H3", content(state).getString("zoomLevel"));
        verify(selectListener, never()).onFieldEntityIdChange(Matchers.<Long> any());

        // when
        perform(state, SELECT);

        // then
        verify(selectListener, times(1)).onFieldEntityIdChange(7L);
        verifyNoMoreInteractions(selectListener);
        verify(resolver, times(2)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));

        // when
        move(state, validPayload());

        // then
        verify(resolver, times(3)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        assertTrue(content(state).has(MOVE_RESULT));
        assertNotNull(state.getMoveRequest());
        verify(selectListener, times(1)).onFieldEntityIdChange(7L);
        verifyNoMoreInteractions(selectListener);
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
     * Creates a move request of {@code O-1} from row {@code L1} at 09:00-10:00 onto row {@code L2} at 10:30-11:30 on
     * 2026-06-01, with dates in the default zone, for the given item and context.
     */
    private GanttChartMoveRequest createMoveRequest(final GanttChartItem item, final JSONObject context) {
        return new GanttChartMoveRequest(item, TARGET_ROW, ORIGIN_ROW, MOVED_ITEM_NAME, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO,
                defaultZoneDate(2026, 6, 1, 10, 30), defaultZoneDate(2026, 6, 1, 11, 30), context);
    }

    /**
     * Creates a move request with a mocked item and the given context, and returns the {@link IllegalStateException} the
     * constructor throws, or null when it throws none.
     */
    private IllegalStateException moveRequestFailure(final JSONObject context) {
        try {
            createMoveRequest(mock(GanttChartItem.class), context);
        } catch (IllegalStateException e) {
            return e;
        }
        return null;
    }

    /**
     * A move request built directly keeps copies of the constructor's dates and context: after construction, setting both
     * given dates to 0, changing the schedule id of the given context, adding a key to it and changing a value of its nested
     * object leave the request's dates and context unchanged. The request keeps the given item, returns its entity id, and
     * returns a new context object on every call.
     */
    @Test
    public final void shouldCopyConstructorDatesAndContextIntoMoveRequest() throws Exception {
        // given
        GanttChartItem item = mock(GanttChartItem.class);
        when(item.getEntityId()).thenReturn(MOVED_ITEM_ID);
        Date dateFrom = defaultZoneDate(2026, 6, 1, 10, 30);
        Date dateTo = defaultZoneDate(2026, 6, 1, 11, 30);
        JSONObject nested = new JSONObject();
        nested.put("key", "value");
        JSONObject context = new JSONObject();
        context.put(CONTEXT_SCHEDULE_ID, SCHEDULE_ID);
        context.put("nested", nested);
        GanttChartMoveRequest moveRequest = new GanttChartMoveRequest(item, TARGET_ROW, ORIGIN_ROW, MOVED_ITEM_NAME,
                ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO, dateFrom, dateTo, context);

        // when
        dateFrom.setTime(0L);
        dateTo.setTime(0L);
        context.put(CONTEXT_SCHEDULE_ID, "99");
        context.put("added", "value");
        context.getJSONObject("nested").put("key", "changed");

        // then
        assertEquals(utcMillis(2026, 6, 1, 10, 30), moveRequest.getDateFrom().getTime());
        assertEquals(utcMillis(2026, 6, 1, 11, 30), moveRequest.getDateTo().getTime());

        JSONObject requestContext = moveRequest.getContext();
        assertEquals(SCHEDULE_ID, requestContext.getString(CONTEXT_SCHEDULE_ID));
        assertFalse(requestContext.has("added"));
        assertEquals("value", requestContext.getJSONObject("nested").getString("key"));
        assertNotSame(moveRequest.getContext(), moveRequest.getContext());

        assertSame(item, moveRequest.getItem());
        assertEquals(Long.valueOf(7L), moveRequest.getItemId());
        assertEquals(TARGET_ROW, moveRequest.getTargetRowName());
        assertEquals(ORIGIN_ROW, moveRequest.getOriginalRowName());
        assertEquals(MOVED_ITEM_NAME, moveRequest.getOriginalName());
        assertEquals(ORIGINAL_DATE_FROM, moveRequest.getOriginalDateFrom());
        assertEquals(ORIGINAL_DATE_TO, moveRequest.getOriginalDateTo());
    }

    /**
     * A move request built directly without a context returns an empty context, and a change of a returned context does not
     * reach the next one.
     */
    @Test
    public final void shouldExposeEmptyContextForMoveRequestWithoutContext() throws Exception {
        // given
        GanttChartMoveRequest moveRequest = createMoveRequest(mock(GanttChartItem.class), null);

        // when
        JSONObject firstContext = moveRequest.getContext();
        firstContext.put(CONTEXT_SCHEDULE_ID, SCHEDULE_ID);

        // then
        assertEquals(0, moveRequest.getContext().length());
    }

    /**
     * A context whose JSON text cannot be parsed makes the move request constructor fail with an {@link IllegalStateException}
     * caused by the {@link JSONException}; a context whose JSON text cannot be written (its {@code toString} returns null)
     * makes it fail with an {@link IllegalStateException} without a cause.
     */
    @Test
    public final void shouldFailWithIllegalStateWhenMoveRequestContextCannotBeCopied() throws Exception {
        // given
        JSONObject unparseableContext = new JSONObject() {

            @Override
            public String toString() {
                return "{";
            }

        };
        JSONObject unwritableContext = new JSONObject() {

            @Override
            public String toString() {
                return null;
            }

        };

        // when
        IllegalStateException unparseableFailure = moveRequestFailure(unparseableContext);
        IllegalStateException unwritableFailure = moveRequestFailure(unwritableContext);

        // then
        assertNotNull(unparseableFailure);
        assertTrue(unparseableFailure.getCause() instanceof JSONException);
        assertNotNull(unwritableFailure);
        assertNull(unwritableFailure.getCause());
    }

    /**
     * Stubs the resolver with the board of 2026-06-01 before and after the drop of {@code O-1} onto row {@code L2} at 10:30.
     * The first call returns {@code O-1} (entity id 7) on row {@code L1} at 09:00-10:00; every later call returns it on row
     * {@code L2} at 10:30-11:30. Both boards hold the maintenance item {@code E-1} (no entity id) on row {@code L1} at
     * 12:00-13:00. Dates are computed in the default zone, and every call builds new items with the scale it receives.
     */
    private void stubResolverBeforeAndAfterMove() {
        doAnswer(new Answer<Map<String, List<GanttChartItem>>>() {

            private int calls;

            @Override
            public Map<String, List<GanttChartItem>> answer(final InvocationOnMock invocation) {
                GanttChartScale scale = (GanttChartScale) invocation.getArguments()[0];
                calls++;

                List<GanttChartItem> originRowItems = new ArrayList<GanttChartItem>();
                List<GanttChartItem> targetRowItems = new ArrayList<GanttChartItem>();
                if (calls == 1) {
                    originRowItems.add(scale.createGanttChartItem(ORIGIN_ROW, MOVED_ITEM_NAME, MOVED_ITEM_ID,
                            defaultZoneDate(2026, 6, 1, 9, 0), defaultZoneDate(2026, 6, 1, 10, 0)));
                } else {
                    targetRowItems.add(scale.createGanttChartItem(TARGET_ROW, MOVED_ITEM_NAME, MOVED_ITEM_ID,
                            defaultZoneDate(2026, 6, 1, 10, 30), defaultZoneDate(2026, 6, 1, 11, 30)));
                }
                originRowItems.add(scale.createGanttChartItem(ORIGIN_ROW, MAINTENANCE_ITEM_NAME, null,
                        defaultZoneDate(2026, 6, 1, 12, 0), defaultZoneDate(2026, 6, 1, 13, 0)));

                Map<String, List<GanttChartItem>> board = new LinkedHashMap<String, List<GanttChartItem>>();
                board.put(ORIGIN_ROW, originRowItems);
                board.put(TARGET_ROW, targetRowItems);
                return board;
            }

        }).when(resolver).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /** Returns the rendered items whose {@code row} is the given row name, in rendering order. */
    private List<JSONObject> renderedItemsOnRow(final JSONArray items, final String rowName) throws JSONException {
        List<JSONObject> rowItems = new ArrayList<JSONObject>();
        for (int index = 0; index < items.length(); index++) {
            JSONObject item = items.getJSONObject(index);
            if (rowName.equals(item.getString("row"))) {
                rowItems.add(item);
            }
        }
        return rowItems;
    }

    /**
     * acceptMove re-resolves the board and renders the rows, items and collisions of that second resolve together with an
     * accepted moveResult for the moved item: {@code O-1} (entity id 7) is the only item on row {@code L2}, at 10:30-11:30
     * with the positions 10.5 to 11.5, and the maintenance item {@code E-1} is the only item on row {@code L1}.
     */
    @Test
    public final void shouldRefreshBoardAndRenderAcceptedMoveResult() throws Exception {
        // given
        stubResolverBeforeAndAfterMove();
        GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        move(state, validPayload());

        // when
        state.acceptMove();

        // then
        JSONObject content = content(state);
        JSONArray rows = content.getJSONArray("rows");
        assertEquals(2, rows.length());
        assertEquals(ORIGIN_ROW, rows.getString(0));
        assertEquals(TARGET_ROW, rows.getString(1));
        JSONArray items = content.getJSONArray("items");
        assertEquals(2, items.length());
        assertEquals(0, content.getJSONArray("collisions").length());

        List<JSONObject> targetRowItems = renderedItemsOnRow(items, TARGET_ROW);
        assertEquals(1, targetRowItems.size());
        JSONObject movedItem = targetRowItems.get(0);
        assertEquals(7L, movedItem.getLong("id"));
        assertEquals(MOVED_ITEM_NAME, movedItem.getJSONObject("info").getString("name"));
        assertEquals(DROP_DATE_FROM, movedItem.getJSONObject("info").getString("dateFrom"));
        assertEquals(DROP_DATE_TO, movedItem.getJSONObject("info").getString("dateTo"));
        assertEquals(10.5, movedItem.getDouble("from"), DELTA);
        assertEquals(11.5, movedItem.getDouble("to"), DELTA);

        List<JSONObject> originRowItems = renderedItemsOnRow(items, ORIGIN_ROW);
        assertEquals(1, originRowItems.size());
        assertFalse(originRowItems.get(0).has("id"));
        assertEquals(MAINTENANCE_ITEM_NAME, originRowItems.get(0).getJSONObject("info").getString("name"));

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
     * A runtime exception thrown while the built-in handler resolves the items does not leave the moveItem event: no move
     * request is exposed, the content is only a "not handled" moveResult for the dropped item, the component carries no
     * message and reports no error, and no rendered text carries the exception's message.
     */
    @Test
    public final void shouldRejectAsNotHandledWithoutMessageWhenBuiltInHandlerFails() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        doThrow(new IllegalStateException(EXCEPTION_DETAIL)).when(resolver).resolve(any(GanttChartScale.class),
                any(JSONObject.class), any(Locale.class));

        // when
        move(state, validPayload());

        // then
        JSONObject rendered = state.render();
        JSONObject content = rendered.getJSONObject("content");
        assertEquals(Collections.singleton(MOVE_RESULT), keySet(content));
        JSONObject result = content.getJSONObject(MOVE_RESULT);
        assertEquals(new HashSet<String>(Arrays.asList(ITEM_ID, ACCEPTED, MESSAGE)), keySet(result));
        assertFalse(result.getBoolean(ACCEPTED));
        assertEquals(7L, result.getLong(ITEM_ID));
        assertEquals(MOVE_ERROR_FALLBACK_PREFIX + "notHandled", result.getString(MESSAGE));
        assertNull(state.getMoveRequest());
        assertFalse(state.isHasError());

        assertNoMessages(rendered);
        assertFalse(rendered.toString().contains(EXCEPTION_DETAIL));
    }

    /**
     * A runtime exception thrown by a mutation setter of the dropped item does not leave the moveItem event: the content is
     * only a "not handled" moveResult, no move request is exposed, and the component carries no message.
     */
    @Test
    public final void shouldRejectAsNotHandledWhenDroppedItemMutationFails() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        GanttChartModifiableItem mockItem = mockModifiableItem(MOVED_ITEM_ID, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
        doThrow(new IllegalArgumentException(EXCEPTION_DETAIL)).when(mockItem).setDateFrom(anyString());
        stubResolverWith(boardWithOriginRowItem(mockItem));

        // when
        move(state, validPayload());

        // then
        JSONObject rendered = state.render();
        JSONObject result = rendered.getJSONObject("content").getJSONObject(MOVE_RESULT);
        assertFalse(result.getBoolean(ACCEPTED));
        assertEquals(MOVE_ERROR_FALLBACK_PREFIX + "notHandled", result.getString(MESSAGE));
        assertNull(state.getMoveRequest());
        assertNoMessages(rendered);
        assertFalse(rendered.toString().contains(EXCEPTION_DETAIL));
    }

    /**
     * A moveItem listener that throws leaves the event without an exception: the content is only the "not handled"
     * moveResult of the built-in handler, the failure message is added to the view and none to the component, and no
     * rendered text carries the exception's message.
     */
    @Test
    public final void shouldKeepMoveNotHandledWhenListenerThrows() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        registerMoveListener(state, new MoveListenerAction() {

            @Override
            public void run(final GanttChartComponentState gantt) {
                throw new IllegalStateException(EXCEPTION_DETAIL);
            }

        });
        ViewDefinitionState view = mock(ViewDefinitionState.class);

        // when
        state.performEvent(view, MOVE_ITEM, validPayload());

        // then
        JSONObject rendered = state.render();
        JSONObject content = rendered.getJSONObject("content");
        assertEquals(Collections.singleton(MOVE_RESULT), keySet(content));
        JSONObject result = content.getJSONObject(MOVE_RESULT);
        assertFalse(result.getBoolean(ACCEPTED));
        assertEquals(MOVE_ERROR_FALLBACK_PREFIX + "notHandled", result.getString(MESSAGE));
        verify(view).addMessage(INTERNAL_ERROR_MESSAGE, MessageType.FAILURE);
        assertNoMessages(rendered);
        assertFalse(rendered.toString().contains(EXCEPTION_DETAIL));
    }

    /**
     * When the refresh of acceptMove fails with a runtime exception, acceptMove rethrows that same exception and the resolver
     * runs exactly twice (the built-in handler and the refresh); render then throws an {@link IllegalStateException} whose
     * message names item 7 and does not carry the resolver exception's message.
     */
    @Test
    public final void shouldRethrowRefreshFailureAndFailRenderWhenRefreshFailsAfterAccept() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        move(state, validPayload());
        IllegalStateException refreshFailure = new IllegalStateException(EXCEPTION_DETAIL);
        doThrow(refreshFailure).when(resolver).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));

        // when
        RuntimeException thrown = null;
        try {
            state.acceptMove();
        } catch (RuntimeException e) {
            thrown = e;
        }

        // then
        assertSame(refreshFailure, thrown);
        verify(resolver, times(2)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));

        IllegalStateException renderFailure = renderIllegalStateFailure(state);
        assertNotNull(renderFailure);
        assertTrue(renderFailure.getMessage(), renderFailure.getMessage().contains("item " + MOVED_ITEM_ID + " "));
        assertFalse(renderFailure.getMessage().contains(EXCEPTION_DETAIL));
    }

    /**
     * When the refreshed chart of an accepted move holds an item that cannot be written as JSON, acceptMove returns normally
     * and render throws that item's {@link JSONException}.
     */
    @Test
    public final void shouldRethrowUnrenderableItemFailureWhenAcceptedChartFailsToRender() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        move(state, validPayload());
        GanttChartItem unrenderableItem = mock(GanttChartItem.class);
        JSONException itemFailure = new JSONException(EXCEPTION_DETAIL);
        when(unrenderableItem.getAsJson()).thenThrow(itemFailure);
        stubResolverWith(boardWithOriginRowItem(unrenderableItem));
        state.acceptMove();

        // when
        JSONException thrown = null;
        try {
            state.render();
        } catch (JSONException e) {
            thrown = e;
        }

        // then
        assertSame(itemFailure, thrown);
        verify(unrenderableItem, times(1)).getAsJson();
    }

    /**
     * A moveItem listener that accepts the move while the refresh fails leaves the event without an exception: the view
     * receives the internal-error failure message, and render throws an {@link IllegalStateException} whose message names
     * item 7 and does not carry the resolver exception's message.
     */
    @Test
    public final void shouldAddInternalErrorAndFailRenderWhenListenerAcceptsAndRefreshFails() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        registerMoveListener(state, new MoveListenerAction() {

            @Override
            public void run(final GanttChartComponentState gantt) {
                doThrow(new IllegalStateException(EXCEPTION_DETAIL)).when(resolver).resolve(any(GanttChartScale.class),
                        any(JSONObject.class), any(Locale.class));
                gantt.acceptMove();
            }

        });
        ViewDefinitionState view = mock(ViewDefinitionState.class);

        // when
        state.performEvent(view, MOVE_ITEM, validPayload());

        // then
        verify(view).addMessage(INTERNAL_ERROR_MESSAGE, MessageType.FAILURE);

        IllegalStateException renderFailure = renderIllegalStateFailure(state);
        assertNotNull(renderFailure);
        assertTrue(renderFailure.getMessage(), renderFailure.getMessage().contains("item " + MOVED_ITEM_ID + " "));
        assertFalse(renderFailure.getMessage().contains(EXCEPTION_DETAIL));
    }

    /**
     * A moveItem listener that accepts the move with a working refresh renders, in the same event, the refreshed rows,
     * items and collisions together with an accepted moveResult that has exactly the keys itemId and accepted.
     */
    @Test
    public final void shouldRenderRefreshedChartWithAcceptedMoveResultWhenListenerAccepts() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();
        registerMoveListener(state, new MoveListenerAction() {

            @Override
            public void run(final GanttChartComponentState gantt) {
                gantt.acceptMove();
            }

        });

        // when
        state.performEvent(mock(ViewDefinitionState.class), MOVE_ITEM, validPayload());

        // then
        JSONObject rendered = state.render();
        JSONObject content = rendered.getJSONObject("content");
        assertTrue(keySet(content).containsAll(BOARD_KEYS));
        assertEquals(2, content.getJSONArray("rows").length());
        assertEquals(2, content.getJSONArray("items").length());
        JSONObject result = content.getJSONObject(MOVE_RESULT);
        assertEquals(new HashSet<String>(Arrays.asList(ITEM_ID, ACCEPTED)), keySet(result));
        assertTrue(result.getBoolean(ACCEPTED));
        assertNoMessages(rendered);
        verify(resolver, times(2)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * acceptMove without a moveItem event in the request only re-resolves the board: the content is the unchanged chart
     * without a moveResult key, and the resolver runs once.
     */
    @Test
    public final void shouldOnlyRefreshBoardWhenAcceptMoveRunsWithoutMove() throws Exception {
        // given
        GanttChartComponentState state = createDefaultState();

        // when
        state.acceptMove();

        // then
        JSONObject rendered = state.render();
        JSONObject content = rendered.getJSONObject("content");
        assertEquals(BOARD_KEYS, keySet(content));
        assertEquals(2, content.getJSONArray("rows").length());
        assertEquals(2, content.getJSONArray("items").length());
        assertNull(state.getMoveRequest());
        assertNoMessages(rendered);
        verify(resolver, times(1)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * Renders the state and returns the {@link IllegalStateException} that render throws, or null when render returns.
     */
    private IllegalStateException renderIllegalStateFailure(final GanttChartComponentState state) throws JSONException {
        try {
            state.render();
        } catch (IllegalStateException e) {
            return e;
        }
        return null;
    }

    /** Asserts that the rendered component carries an empty message list. */
    private void assertNoMessages(final JSONObject rendered) throws JSONException {
        assertEquals(0, rendered.getJSONArray("messages").length());
    }

    /**
     * Registers on the state a moveItem listener hook, as a view definition does, whose listener runs the given action with
     * the component state.
     */
    private void registerMoveListener(final GanttChartComponentState state, final MoveListenerAction action) throws Exception {
        ApplicationContext applicationContext = mock(ApplicationContext.class);
        when(applicationContext.getBean(MoveListener.class)).thenReturn(new MoveListener(action));
        state.registerCustomEvent(new ViewEventListenerHook(MOVE_ITEM, MoveListener.class.getName(), MOVE_ITEM, null,
                applicationContext));
    }

    /** Action run by {@link MoveListener} with the Gantt chart component state. */
    private interface MoveListenerAction {

        void run(GanttChartComponentState gantt);

    }

    /** moveItem listener bean that runs its action with the event's component state. */
    public static class MoveListener {

        private final MoveListenerAction action;

        public MoveListener(final MoveListenerAction action) {
            this.action = action;
        }

        public void moveItem(final ViewDefinitionState view, final ComponentState state, final String[] args) {
            action.run((GanttChartComponentState) state);
        }

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
     * A resolved item with the requested entity id that is a plain {@link GanttChartItem}, not a
     * {@link GanttChartModifiableItem}, is rejected as not movable for that id, without a move request and without reading
     * its dates.
     */
    @Test
    public final void shouldRejectMoveForMatchingItemThatIsNotModifiable() throws Exception {
        // given
        GanttChartItem plainItem = mock(GanttChartItem.class);
        when(plainItem.getEntityId()).thenReturn(MOVED_ITEM_ID);
        when(plainItem.getRowName()).thenReturn(ORIGIN_ROW);
        when(plainItem.getName()).thenReturn(MOVED_ITEM_NAME);
        when(plainItem.getDateFrom()).thenReturn(ORIGINAL_DATE_FROM);
        when(plainItem.getDateTo()).thenReturn(ORIGINAL_DATE_TO);
        stubResolverWith(boardWithOriginRowItem(plainItem));
        GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);

        // when
        move(state, validPayload());

        // then
        assertRejectedBy(state, ITEM_NOT_MOVABLE);
        assertEquals(7L, moveResult(state).getLong(ITEM_ID));
        verify(plainItem, never()).getDateFrom();
        verify(plainItem, never()).getDateTo();
        verify(resolver, times(1)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
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

    /**
     * In {@code Europe/Warsaw}, two items both shown from 02:30 to 03:30 on the fall-back day keep the durations of the
     * instants the resolver created them from: one hour for the item starting in the later occurrence of 02:30 (01:30 UTC),
     * two hours for the item starting in the earlier one (00:30 UTC), created through the tooltip overload.
     */
    @Test
    public final void shouldKeepRecordedDurationOfItemStartingInDstOverlap() throws Exception {
        // given
        useZone(WARSAW);
        String payload = payload(MOVED_ITEM_ID, TARGET_ROW, "2026-10-26 10:00:00", "2026-10-25 02:30:00",
                "2026-10-25 03:30:00");

        // when
        stubResolverWithScaleItem(new Date(utcMillis(2026, 10, 25, 1, 30)), new Date(utcMillis(2026, 10, 25, 2, 30)), false);
        GanttChartComponentState laterOccurrenceState = createState(true, "2026-10-25", "2026-10-27");
        move(laterOccurrenceState, payload);

        stubResolverWithScaleItem(new Date(utcMillis(2026, 10, 25, 0, 30)), new Date(utcMillis(2026, 10, 25, 2, 30)), true);
        GanttChartComponentState earlierOccurrenceState = createState(true, "2026-10-25", "2026-10-27");
        move(earlierOccurrenceState, payload);

        // then
        GanttChartMoveRequest laterOccurrenceMove = laterOccurrenceState.getMoveRequest();
        assertNotNull(laterOccurrenceMove);
        assertEquals(utcMillis(2026, 10, 26, 9, 0), laterOccurrenceMove.getDateFrom().getTime());
        assertEquals(utcMillis(2026, 10, 26, 10, 0), laterOccurrenceMove.getDateTo().getTime());
        assertEquals("2026-10-26 10:00:00", laterOccurrenceMove.getItem().getDateFrom());
        assertEquals("2026-10-26 11:00:00", laterOccurrenceMove.getItem().getDateTo());

        GanttChartMoveRequest earlierOccurrenceMove = earlierOccurrenceState.getMoveRequest();
        assertNotNull(earlierOccurrenceMove);
        assertEquals(utcMillis(2026, 10, 26, 9, 0), earlierOccurrenceMove.getDateFrom().getTime());
        assertEquals(utcMillis(2026, 10, 26, 11, 0), earlierOccurrenceMove.getDateTo().getTime());
        assertEquals("2026-10-26 12:00:00", earlierOccurrenceMove.getItem().getDateTo());
    }

    /**
     * In {@code Europe/Warsaw}, a resolved item not created through the received scale whose start or end falls in the
     * repeated hour of the fall-back day, or whose start falls in the skipped hour of the spring-forward day, is an invalid
     * request carrying the item id and stays unchanged; such an item spanning the fall-back change with unambiguous dates
     * keeps its real four-hour duration.
     */
    @Test
    public final void shouldRejectUnrecordedResolvedItemWithDateThatIsNotUnambiguous() throws Exception {
        // given
        useZone(WARSAW);
        String[][] itemDates = { { "start in the repeated hour", "2026-10-25 02:30:00", "2026-10-25 03:30:00" },
                { "end in the repeated hour", "2026-10-25 01:30:00", "2026-10-25 02:15:00" },
                { "start in the skipped hour", "2026-03-29 02:30:00", "2026-03-29 04:00:00" } };
        List<GanttChartModifiableItem> items = new ArrayList<GanttChartModifiableItem>();
        for (String[] dates : itemDates) {
            items.add(mockModifiableItem(MOVED_ITEM_ID, dates[1], dates[2]));
        }
        GanttChartModifiableItem spanningItem = mockModifiableItem(MOVED_ITEM_ID, "2026-10-25 01:00:00", "2026-10-25 04:00:00");
        String payload = payload(MOVED_ITEM_ID, TARGET_ROW, "2026-10-26 10:00:00");
        List<GanttChartComponentState> states = new ArrayList<GanttChartComponentState>();

        // when
        for (GanttChartModifiableItem item : items) {
            stubResolverWith(boardWithOriginRowItem(item));
            GanttChartComponentState state = createState(true, "2026-10-25", "2026-10-27");
            move(state, payload);
            states.add(state);
        }
        stubResolverWith(boardWithOriginRowItem(spanningItem));
        GanttChartComponentState spanningState = createState(true, "2026-10-25", "2026-10-27");
        move(spanningState, payload);

        // then
        for (int index = 0; index < itemDates.length; index++) {
            assertRejectedBy(itemDates[index][0], states.get(index), INVALID_REQUEST);
            assertEquals(itemDates[index][0], 7L, moveResult(states.get(index)).getLong(ITEM_ID));
            verifyNotMutated(items.get(index));
        }
        GanttChartMoveRequest spanningMove = spanningState.getMoveRequest();
        assertNotNull(spanningMove);
        assertEquals(utcMillis(2026, 10, 26, 13, 0), spanningMove.getDateTo().getTime());
        verify(spanningItem).setDateTo("2026-10-26 14:00:00");
    }

    /**
     * An item whose dates the resolver changed after creating it through the received scale keeps the duration of its
     * changed dates, two hours, instead of the one hour it was created with.
     */
    @Test
    public final void shouldUseItemDatesWhenResolverChangesRecordedItem() throws Exception {
        // given
        doAnswer(new Answer<Map<String, List<GanttChartItem>>>() {

            @Override
            public Map<String, List<GanttChartItem>> answer(final InvocationOnMock invocation) {
                GanttChartScale receivedScale = (GanttChartScale) invocation.getArguments()[0];
                GanttChartModifiableItem item = (GanttChartModifiableItem) receivedScale.createGanttChartItem(ORIGIN_ROW,
                        MOVED_ITEM_NAME, MOVED_ITEM_ID, defaultZoneDate(2026, 6, 1, 9, 0), defaultZoneDate(2026, 6, 1, 10, 0));
                item.setDateTo("2026-06-01 11:00:00");
                return boardWithOriginRowItem(item);
            }

        }).when(resolver).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);

        // when
        move(state, validPayload());

        // then
        GanttChartMoveRequest moveRequest = state.getMoveRequest();
        assertNotNull(moveRequest);
        assertEquals(utcMillis(2026, 6, 1, 10, 30), moveRequest.getDateFrom().getTime());
        assertEquals(utcMillis(2026, 6, 1, 12, 30), moveRequest.getDateTo().getTime());
        assertEquals("2026-06-01 12:30:00", moveRequest.getItem().getDateTo());
    }

    /**
     * The resolver called by moveItem receives a scale that reads and writes the component's scale: it reports the header
     * range and an unset dates flag, and the dates flag and range it sets are what the resolver sees on the next refresh.
     */
    @Test
    public final void shouldHandResolverScaleThatDelegatesToComponentScale() throws Exception {
        // given
        final List<Object[]> observations = new ArrayList<Object[]>();
        doAnswer(new Answer<Map<String, List<GanttChartItem>>>() {

            @Override
            public Map<String, List<GanttChartItem>> answer(final InvocationOnMock invocation) {
                GanttChartScale receivedScale = (GanttChartScale) invocation.getArguments()[0];
                observations.add(new Object[] { receivedScale.getDateFrom(), receivedScale.getDateTo(),
                        receivedScale.getIsDatesSet() });
                if (observations.size() == 1) {
                    receivedScale.setIsDatesSet(Boolean.TRUE);
                    receivedScale.setDateFrom(new Date(utcMillis(2026, 5, 31, 12, 0)));
                    receivedScale.setDateTo(new Date(utcMillis(2026, 6, 3, 12, 0)));
                }
                return boardWithOriginRowItem(receivedScale.createGanttChartItem(ORIGIN_ROW, MOVED_ITEM_NAME, MOVED_ITEM_ID,
                        defaultZoneDate(2026, 6, 1, 9, 0), defaultZoneDate(2026, 6, 1, 10, 0)));
            }

        }).when(resolver).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);

        // when
        move(state, validPayload());
        perform(state, REFRESH);

        // then
        assertNotNull(state.getMoveRequest());
        assertEquals(2, observations.size());
        assertEquals(utcMillis(2026, 6, 1, 0, 0), ((Date) observations.get(0)[0]).getTime());
        assertEquals(new DateTime(2026, 6, 2, 23, 59, 59, DateTimeZone.UTC).getMillis(), ((Date) observations.get(0)[1])
                .getTime());
        assertNull(observations.get(0)[2]);
        assertEquals(utcMillis(2026, 5, 31, 0, 0), ((Date) observations.get(1)[0]).getTime());
        assertEquals(utcMillis(2026, 6, 3, 0, 0), ((Date) observations.get(1)[1]).getTime());
        assertEquals(Boolean.TRUE, observations.get(1)[2]);
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
     * A null argument array, an empty one, a null argument and a valid payload followed by a second argument are each
     * rejected as an invalid request with a null item id, before the resolver runs.
     */
    @Test
    public final void shouldRejectMalformedEventArguments() throws Exception {
        // given
        GanttChartModifiableItem item = mockModifiableItem(MOVED_ITEM_ID, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
        stubResolverWith(boardWithOriginRowItem(item));
        GanttChartComponentState nullArrayState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        GanttChartComponentState emptyArrayState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        GanttChartComponentState nullArgumentState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        GanttChartComponentState twoArgumentsState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);

        // when
        move(nullArrayState, (String[]) null);
        move(emptyArrayState);
        move(nullArgumentState, new String[] { null });
        move(twoArgumentsState, VALID_PAYLOAD_TEXT, VALID_PAYLOAD_TEXT);

        // then
        assertRejectedBy("null argument array", nullArrayState, INVALID_REQUEST);
        assertRejectedBy("empty argument array", emptyArrayState, INVALID_REQUEST);
        assertRejectedBy("null argument", nullArgumentState, INVALID_REQUEST);
        assertRejectedBy("two arguments", twoArgumentsState, INVALID_REQUEST);
        assertTrue(moveResult(nullArrayState).isNull(ITEM_ID));
        assertTrue(moveResult(twoArgumentsState).isNull(ITEM_ID));
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        verifyNotMutated(item);
    }

    /**
     * A payload is read in strict JSON syntax as exactly one object: text that is not JSON, content after the object (text,
     * a second value, a comment), a leading comment, unquoted names, single-quoted strings, a trailing comma, a repeated key,
     * {@code =} or {@code ;} separators, an array, a JSON string and a truncated object are each rejected as an invalid
     * request with a null item id, before the resolver runs; the same payload in strict syntax is accepted.
     */
    @Test
    public final void shouldRejectPayloadThatIsNotOneStrictJsonObject() throws Exception {
        // given
        GanttChartModifiableItem item = mockModifiableItem(MOVED_ITEM_ID, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
        stubResolverWith(boardWithOriginRowItem(item));

        Map<String, String> payloadByCase = new LinkedHashMap<String, String>();
        payloadByCase.put("not json", "not json");
        payloadByCase.put("text after the object", VALID_PAYLOAD_TEXT + " garbage");
        payloadByCase.put("second value after the object", VALID_PAYLOAD_TEXT + "{}");
        payloadByCase.put("comment after the object", VALID_PAYLOAD_TEXT + "/* comment */");
        payloadByCase.put("comment before the object", "// comment\n" + VALID_PAYLOAD_TEXT);
        payloadByCase.put("unquoted name", validPayloadTextWith("\"itemId\":7", "itemId:7"));
        payloadByCase.put("single-quoted string", validPayloadTextWith("\"L2\"", "'L2'"));
        payloadByCase.put("trailing comma", validPayloadTextWith("10:00:00\"}", "10:00:00\",}"));
        payloadByCase.put("repeated key", validPayloadTextWith("\"itemId\":7,", "\"itemId\":7,\"itemId\":7,"));
        payloadByCase.put("equals separator", validPayloadTextWith("\"row\":", "\"row\"="));
        payloadByCase.put("semicolon separator", validPayloadTextWith(",\"row\"", ";\"row\""));
        payloadByCase.put("array", "[" + VALID_PAYLOAD_TEXT + "]");
        payloadByCase.put("JSON string", JSONObject.quote(VALID_PAYLOAD_TEXT));
        payloadByCase.put("truncated object", VALID_PAYLOAD_TEXT.substring(0, VALID_PAYLOAD_TEXT.length() - 1));

        // when
        Map<String, GanttChartComponentState> stateByCase = moveEachOnFreshState(payloadByCase);

        // then
        assertInvalidRequestForEach(stateByCase, null);
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        verifyNotMutated(item);

        GanttChartComponentState strictState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        move(strictState, VALID_PAYLOAD_TEXT);
        assertNotNull(strictState.getMoveRequest());
        assertEquals(TARGET_ROW, strictState.getMoveRequest().getTargetRowName());
        assertEquals(utcMillis(2026, 6, 1, 11, 30), strictState.getMoveRequest().getDateTo().getTime());
    }

    /**
     * Each of the seven payload keys, left out or set to JSON null, makes the payload an invalid request with a null item id,
     * before the resolver runs and without any mutation of the item.
     */
    @Test
    public final void shouldRejectPayloadWithoutRequiredKey() throws Exception {
        // given
        GanttChartModifiableItem item = mockModifiableItem(MOVED_ITEM_ID, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
        stubResolverWith(boardWithOriginRowItem(item));

        List<String> requiredKeys = new ArrayList<String>();
        requiredKeys.add(ITEM_ID);
        requiredKeys.addAll(PAYLOAD_TEXT_KEYS);

        Map<String, String> payloadByCase = new LinkedHashMap<String, String>();
        for (String key : requiredKeys) {
            payloadByCase.put("without " + key, validPayloadWith(key, null));
            payloadByCase.put(key + " null", validPayloadWith(key, JSONObject.NULL));
        }

        // when
        Map<String, GanttChartComponentState> stateByCase = moveEachOnFreshState(payloadByCase);

        // then
        assertEquals(14, stateByCase.size());
        assertInvalidRequestForEach(stateByCase, null);
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        verifyNotMutated(item);
    }

    /**
     * Each of {@code row}, {@code dateFrom}, {@code originalRow}, {@code originalName}, {@code originalDateFrom} and
     * {@code originalDateTo} given as a JSON number, boolean, object or array makes the payload an invalid request with a null
     * item id, before the resolver runs; a numeric {@code row} is rejected even when its digits name a resolved row, which the
     * same digits as a JSON string reach.
     */
    @Test
    public final void shouldRejectPayloadTextValueThatIsNotJsonString() throws Exception {
        // given
        GanttChartModifiableItem item = mockModifiableItem(MOVED_ITEM_ID, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
        Map<String, List<GanttChartItem>> board = boardWithOriginRowItem(item);
        board.put("12", new ArrayList<GanttChartItem>());
        stubResolverWith(board);

        Map<String, String> payloadByCase = new LinkedHashMap<String, String>();
        for (String key : PAYLOAD_TEXT_KEYS) {
            payloadByCase.put(key + " number", validPayloadWith(key, Integer.valueOf(12)));
            payloadByCase.put(key + " boolean", validPayloadWith(key, Boolean.TRUE));
            payloadByCase.put(key + " object", validPayloadWith(key, new JSONObject()));
            payloadByCase.put(key + " array", validPayloadWith(key, new JSONArray()));
        }

        // when
        Map<String, GanttChartComponentState> stateByCase = moveEachOnFreshState(payloadByCase);

        // then
        assertEquals(24, stateByCase.size());
        assertInvalidRequestForEach(stateByCase, null);
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        verifyNotMutated(item);

        GanttChartComponentState textRowState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        move(textRowState, validPayloadWith("row", "12"));
        assertNotNull(textRowState.getMoveRequest());
        assertEquals("12", textRowState.getMoveRequest().getTargetRowName());
    }

    /**
     * An item id given as a JSON string, a number with a fraction or an exponent, an integer outside the {@code long} range,
     * a boolean, an object, or in hexadecimal, leading-zero or plus-signed form makes the payload an invalid request with a
     * null item id, before the resolver runs; the {@code long} bounds themselves reach the resolver and are rejected there
     * as not movable.
     */
    @Test
    public final void shouldRejectItemIdThatIsNotJsonIntegerInLongRange() throws Exception {
        // given
        GanttChartModifiableItem item = mockModifiableItem(MOVED_ITEM_ID, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
        stubResolverWith(boardWithOriginRowItem(item));

        String[][] replacements = { { "string", "\"7\"" }, { "fraction", "7.9" }, { "integral fraction", "7.0" },
                { "exponent", "7e0" }, { "fraction with exponent", "0.7e1" }, { "above long range", "9223372036854775808" },
                { "below long range", "-9223372036854775809" }, { "boolean", "true" }, { "object", "{\"id\":7}" },
                { "array", "[7]" }, { "hexadecimal", "0x7" }, { "leading zero", "07" }, { "plus sign", "+7" } };
        Map<String, String> payloadByCase = new LinkedHashMap<String, String>();
        for (String[] replacement : replacements) {
            payloadByCase.put(replacement[0], validPayloadTextWith("\"itemId\":7", "\"itemId\":" + replacement[1]));
        }

        GanttChartComponentState maxIdState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        GanttChartComponentState minIdState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);

        // when
        Map<String, GanttChartComponentState> stateByCase = moveEachOnFreshState(payloadByCase);
        move(maxIdState, validPayloadTextWith("\"itemId\":7", "\"itemId\":" + Long.MAX_VALUE));
        move(minIdState, validPayloadTextWith("\"itemId\":7", "\"itemId\":" + Long.MIN_VALUE));

        // then
        assertInvalidRequestForEach(stateByCase, null);
        verifyNotMutated(item);
        assertRejectedBy("long maximum", maxIdState, ITEM_NOT_MOVABLE);
        assertEquals(Long.MAX_VALUE, moveResult(maxIdState).getLong(ITEM_ID));
        assertRejectedBy("long minimum", minIdState, ITEM_NOT_MOVABLE);
        assertEquals(Long.MIN_VALUE, moveResult(minIdState).getLong(ITEM_ID));
        verify(resolver, times(2)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * A {@code dateFrom} that is not written exactly as {@code yyyy-MM-dd HH:mm:ss} with ASCII digits (single-digit month,
     * day, hour, minute or second, a five-digit year, a {@code T} separator, surrounding spaces, milliseconds, non-ASCII
     * digits) or that names no valid time is an invalid request carrying the item id, before the resolver runs.
     */
    @Test
    public final void shouldRejectDateFromNotInCanonicalFormat() throws Exception {
        // given
        GanttChartModifiableItem item = mockModifiableItem(MOVED_ITEM_ID, ORIGINAL_DATE_FROM, ORIGINAL_DATE_TO);
        stubResolverWith(boardWithOriginRowItem(item));

        String[] dates = { "2026-6-01 10:30:00", "2026-06-1 10:30:00", "2026-06-01 9:30:00", "2026-06-01 10:0:00",
                "2026-06-01 10:30:0", "02026-06-01 10:30:00", "2026-06-01T10:30:00", " 2026-06-01 10:30:00",
                "2026-06-01 10:30:00 ", "2026-06-01 10:30:00.000", "\uFF12\uFF10\uFF12\uFF16-06-01 10:30:00",
                "2026-06-01 25:99:00", "2026-02-30 10:30:00", "" };
        Map<String, String> payloadByCase = new LinkedHashMap<String, String>();
        for (String date : dates) {
            payloadByCase.put("dateFrom '" + date + "'", validPayloadWith("dateFrom", date));
        }

        // when
        Map<String, GanttChartComponentState> stateByCase = moveEachOnFreshState(payloadByCase);

        // then
        assertInvalidRequestForEach(stateByCase, MOVED_ITEM_ID);
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
        verifyNotMutated(item);
    }

    /** A board whose header dates are reversed carries a global error, and every drop on it is an invalid request. */
    @Test
    public final void shouldRejectMoveWhenScaleHasGlobalError() throws Exception {
        // given
        stubResolverForDay(2026, 6, 1);
        GanttChartComponentState state = createState(true, "2026-06-02", "2026-06-01");

        // when
        move(state, validPayload());

        // then
        assertRejectedBy(state, INVALID_REQUEST);
        assertTrue(moveResult(state).isNull(ITEM_ID));
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * A move-enabled state initialized without component content has no scale, and a valid drop on it is an invalid request
     * that renders only its moveResult, before the resolver runs.
     */
    @Test
    public final void shouldRejectMoveWhenStateHasNoScale() throws Exception {
        // given
        stubResolverForDay(2026, 6, 1);
        GanttChartComponentState state = createUninitializedState(true);
        JSONObject context = new JSONObject();
        context.put(CONTEXT_SCHEDULE_ID, SCHEDULE_ID);
        JSONObject json = new JSONObject();
        json.put("context", context);
        state.initialize(json, Locale.ENGLISH);

        // when
        move(state, validPayload());

        // then
        assertRejectedBy(state, INVALID_REQUEST);
        assertTrue(moveResult(state).isNull(ITEM_ID));
        assertEquals(Collections.singleton(MOVE_RESULT), keySet(content(state)));
        verify(resolver, never()).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
    }

    /**
     * A resolved item whose start or end is missing, not in the canonical {@code yyyy-MM-dd HH:mm:ss} form, or not a valid
     * time is an invalid request carrying the item id, and the item stays unchanged.
     */
    @Test
    public final void shouldRejectResolvedItemWithoutUsableDates() throws Exception {
        // given
        String[][] itemDates = { { "missing start", null, ORIGINAL_DATE_TO }, { "missing end", ORIGINAL_DATE_FROM, null },
                { "single-digit start hour", "2026-06-01 9:00:00", ORIGINAL_DATE_TO },
                { "malformed end", ORIGINAL_DATE_FROM, "not a date" },
                { "end without seconds", ORIGINAL_DATE_FROM, "2026-06-01 10:00" },
                { "invalid end minute", ORIGINAL_DATE_FROM, "2026-06-01 10:61:00" } };
        List<GanttChartModifiableItem> items = new ArrayList<GanttChartModifiableItem>();
        for (String[] dates : itemDates) {
            items.add(mockModifiableItem(MOVED_ITEM_ID, dates[1], dates[2]));
        }
        List<GanttChartComponentState> states = new ArrayList<GanttChartComponentState>();

        // when
        for (GanttChartModifiableItem item : items) {
            stubResolverWith(boardWithOriginRowItem(item));
            GanttChartComponentState state = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
            move(state, validPayload());
            states.add(state);
        }

        // then
        for (int index = 0; index < itemDates.length; index++) {
            assertRejectedBy(itemDates[index][0], states.get(index), INVALID_REQUEST);
            assertEquals(itemDates[index][0], 7L, moveResult(states.get(index)).getLong(ITEM_ID));
            verifyNotMutated(items.get(index));
        }
        verify(resolver, times(itemDates.length)).resolve(any(GanttChartScale.class), any(JSONObject.class),
                any(Locale.class));
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
     * Each event runs alone on its own fresh state. refresh and initialize render the board keys only, with no moveResult and
     * no move request, at zoom level H1 and H3. select, on a state whose selected entity id is 7, notifies the registered
     * field listener once with 7, renders no content with updateState false, exposes no move request and resolves no items:
     * the resolver runs once for refresh and once for initialize.
     */
    @Test
    public final void shouldRenderUnchangedContentForRefreshInitializeAndSelect() throws Exception {
        // given
        stubResolverForDay(2026, 6, 1);
        GanttChartComponentState refreshState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        GanttChartComponentState initializeState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO);
        GanttChartComponentState selectState = createState(true, HEADER_DATE_FROM, HEADER_DATE_TO, true, MOVED_ITEM_ID);
        FieldEntityIdChangeListener selectListener = mock(FieldEntityIdChangeListener.class);
        selectState.addFieldEntityIdChangeListener("selectListener", selectListener);

        // when
        perform(refreshState, REFRESH);
        perform(initializeState, INITIALIZE);
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

        verify(selectListener, times(1)).onFieldEntityIdChange(7L);
        verifyNoMoreInteractions(selectListener);
        JSONObject selectRender = selectState.render();
        assertFalse(selectRender.has("content"));
        assertFalse(selectRender.getBoolean("updateState"));
        assertNull(selectState.getMoveRequest());

        verify(resolver, times(2)).resolve(any(GanttChartScale.class), any(JSONObject.class), any(Locale.class));
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
