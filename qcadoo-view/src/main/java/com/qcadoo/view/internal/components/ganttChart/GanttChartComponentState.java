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

import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Set;
import java.util.TimeZone;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringEscapeUtils;
import org.codehaus.jackson.JsonFactory;
import org.codehaus.jackson.JsonParser;
import org.codehaus.jackson.JsonToken;
import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.joda.time.LocalDateTime;
import org.joda.time.format.DateTimeFormat;
import org.joda.time.format.DateTimeFormatter;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.qcadoo.localization.api.utils.DateUtils;
import com.qcadoo.model.internal.api.ValueAndError;
import com.qcadoo.model.internal.types.DateType;
import com.qcadoo.view.api.components.ganttChart.GanttChartItem;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemResolver;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemStrip.Orientation;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemTooltip;
import com.qcadoo.view.api.components.ganttChart.GanttChartScale;
import com.qcadoo.view.internal.components.ganttChart.GanttChartScaleImpl.ZoomLevel;
import com.qcadoo.view.internal.states.AbstractComponentState;

public class GanttChartComponentState extends AbstractComponentState {

    private static final Logger LOG = LoggerFactory.getLogger(GanttChartComponentState.class);

    public final GanttChartComponentEventPerformer eventPerformer = new GanttChartComponentEventPerformer();

    private GanttChartScaleImpl scale;

    private Orientation stripsOrientation;

    private String dateFromErrorMessage;

    private String dateToErrorMessage;

    private String globalErrorMessage;

    Map<String, List<GanttChartItem>> items;

    Map<String, List<GanttChartItem>> collisionItems;

    protected static final DateType DATETYPE = new DateType();

    private static final String L_MOVE_RESULT = "moveResult";

    private static final String L_ACCEPTED = "accepted";

    private static final String L_MESSAGE = "message";

    private static final String L_ITEM_ID = "itemId";

    private static final String L_ROW = "row";

    private static final String L_DATE_FROM = "dateFrom";

    private static final String L_ORIGINAL_ROW = "originalRow";

    private static final String L_ORIGINAL_NAME = "originalName";

    private static final String L_ORIGINAL_DATE_FROM = "originalDateFrom";

    private static final String L_ORIGINAL_DATE_TO = "originalDateTo";

    /** Keys every moveItem payload must carry with a JSON string value; {@code itemId} must carry a JSON integer. */
    private static final String[] MOVE_PAYLOAD_TEXT_KEYS = { L_ROW, L_DATE_FROM, L_ORIGINAL_ROW, L_ORIGINAL_NAME,
            L_ORIGINAL_DATE_FROM, L_ORIGINAL_DATE_TO };

    /** Member names a moveItem payload may hold: {@code itemId} and the keys of {@link #MOVE_PAYLOAD_TEXT_KEYS}. */
    private static final Set<String> MOVE_PAYLOAD_KEYS = Collections.unmodifiableSet(new HashSet<String>(Arrays.asList(
            L_ITEM_ID, L_ROW, L_DATE_FROM, L_ORIGINAL_ROW, L_ORIGINAL_NAME, L_ORIGINAL_DATE_FROM, L_ORIGINAL_DATE_TO)));

    /** Longest moveItem payload that is parsed, in characters; a longer payload is an invalid request. */
    private static final int MOVE_PAYLOAD_MAX_LENGTH = 16384;

    /** Longest JSON string value of a moveItem payload, in characters after unescaping. */
    private static final int MOVE_PAYLOAD_MAX_TEXT_LENGTH = 4096;

    /** Longest JSON integer of a moveItem payload, in characters of its text, minus sign included. */
    private static final int MOVE_PAYLOAD_MAX_INTEGER_LENGTH = 20;

    /**
     * Parser factory of the moveItem payload, reading standard JSON syntax only. Field-name canonicalization is disabled:
     * member names are not kept in a symbol table shared between parsers.
     */
    private static final JsonFactory MOVE_PAYLOAD_JSON_FACTORY = new JsonFactory().configure(
            JsonParser.Feature.CANONICALIZE_FIELD_NAMES, false);

    /** Canonical {@value DateUtils#L_DATE_TIME_FORMAT} text: four ASCII digits of year, two ASCII digits in every other field. */
    private static final Pattern MOVE_DATE_PATTERN = Pattern.compile("[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}");

    private static final String L_MOVE_ERROR_PREFIX = "move.error.";

    private static final String L_NOT_HANDLED = "notHandled";

    private static final String L_MOVE_DISABLED = "moveDisabled";

    private static final String L_INVALID_REQUEST = "invalidRequest";

    private static final String L_NONEXISTENT_TIME = "nonexistentTime";

    private static final String L_ITEM_NOT_MOVABLE = "itemNotMovable";

    private static final String L_TARGET_ROW_UNKNOWN = "targetRowUnknown";

    private static final String L_OFF_GRID = "offGrid";

    private static final String L_DATE_OUT_OF_RANGE = "dateOutOfRange";

    /** Earliest wall-clock year, inclusive, of the start and end of a moved item. */
    private static final int MOVE_MIN_YEAR = 1500;

    /** Latest wall-clock year, inclusive, of the start and end of a moved item. */
    private static final int MOVE_MAX_YEAR = 2500;

    /** Zone-free parser of wall-clock dates in the {@value DateUtils#L_DATE_TIME_FORMAT} format. */
    private static final DateTimeFormatter MOVE_DATE_FORMATTER = DateTimeFormat.forPattern(DateUtils.L_DATE_TIME_FORMAT);

    private final GanttChartItemResolver itemResolver;

    private final int defaultStartDay;

    private final int defaultEndDay;

    private final ZoomLevel defaultZoomLevel;

    private Long selectedEntityId;

    private JSONObject context;

    private final int itemsBorderWidth;

    private final String itemsBorderColor;

    private final boolean allowItemMove;

    /** Move built by the moveItem event of this request; null when no move ran or the move was rejected before the listeners. */
    private GanttChartMoveRequest moveRequest;

    /**
     * Move result of this request: set by the moveItem event and by {@link #rejectMove(String, String...)}, and replaced by
     * {@link #acceptMove()}; null while neither the moveItem event nor {@link #rejectMove(String, String...)} has set it.
     */
    private JSONObject moveResult;

    /** Whether {@link #acceptMove()} has finished re-resolving the chart of the accepted move of this request. */
    private boolean acceptedChartRefreshed;

    public GanttChartComponentState(final GanttChartItemResolver itemResolver, final GanttChartComponentPattern pattern) {
        super(pattern);
        this.itemResolver = itemResolver;
        this.defaultZoomLevel = pattern.getDefaultZoomLevel();
        this.defaultStartDay = pattern.getDefaultStartDay();
        this.defaultEndDay = pattern.getDefaultEndDay();
        this.stripsOrientation = pattern.getStripOrientation();
        this.itemsBorderWidth = pattern.getItemsBorderWidth();
        this.itemsBorderColor = pattern.getItemsBorderColor();
        this.allowItemMove = pattern.isAllowItemMove();
        registerEvent("refresh", eventPerformer, "refresh");
        registerEvent("initialize", eventPerformer, "initialize");
        registerEvent("select", eventPerformer, "selectEntity");
        registerEvent("moveItem", eventPerformer, "moveItem");
    }

    @Override
    protected void initializeContext(final JSONObject json) throws JSONException {
        super.initializeContext(json);
        this.context = json;
    }

    @Override
    public Object getFieldValue() {
        return selectedEntityId;
    }

    @Override
    protected void initializeContent(final JSONObject json) throws JSONException {

        JSONObject headerDataObject = json.getJSONObject("headerParameters");

        ZoomLevel zoomLevel = ZoomLevel.valueOf(headerDataObject.getString("scale"));

        String dateFromString = headerDataObject.getString("dateFrom");
        String dateToString = headerDataObject.getString("dateTo");

        DateTime now = new DateTime().withHourOfDay(0).withMinuteOfHour(0).withSecondOfMinute(0);

        Date dateFrom = now.plusDays(defaultStartDay).toDate();
        Date dateTo = now.plusDays(defaultEndDay).toDate();

        if (dateFromString == null || "".equals(dateFromString)) {
            dateFromErrorMessage = translate("errorMessage.emptyDate");
        } else {
            ValueAndError dateFromVaE = DATETYPE.toObject(null, dateFromString);
            if (dateFromVaE.getMessage() == null) {
                dateFrom = (Date) dateFromVaE.getValue();
            } else {
                dateFromErrorMessage = translate("errorMessage.dateNotValid");
            }
        }

        if (dateToString == null || "".equals(dateToString)) {
            dateToErrorMessage = translate("errorMessage.emptyDate");
        } else {
            ValueAndError dateToVaE = DATETYPE.toObject(null, dateToString);
            if (dateToVaE.getMessage() == null) {
                dateTo = (Date) dateToVaE.getValue();
            } else {
                dateToErrorMessage = translate("errorMessage.dateNotValid");
            }
        }

        scale = new GanttChartScaleImpl(this, zoomLevel, dateFrom, dateTo);

        if (dateFromErrorMessage == null && globalErrorMessage == null) {
            if (scale.isFromLargerThanTo()) {
                globalErrorMessage = translate("errorMessage.fromLargerThanTo");
            } else if (scale.isTooLargeRange()) {
                globalErrorMessage = translate("errorMessage.tooLargeRange", String.valueOf(scale.getMaxRangeInMonths()));
            }
        }

        if (json.has("selectedEntityId")) {
            selectedEntityId = json.getLong("selectedEntityId");
        }

    }

    /**
     * Renders the chart content:
     * <ul>
     * <li>a null move result, which holds while neither the moveItem event nor {@link #rejectMove(String, String...)} has run
     * in this request: the chart without a {@code moveResult} key;</li>
     * <li>a move result that is not accepted, including one set by {@link #rejectMove(String, String...)} without a moveItem
     * event: only that {@code moveResult};</li>
     * <li>an accepted move whose chart {@link #acceptMove()} has re-resolved: the whole chart together with its
     * {@code moveResult}; a {@link JSONException} or runtime exception thrown while that chart renders propagates
     * unchanged;</li>
     * <li>an accepted move whose chart {@link #acceptMove()} has not finished re-resolving: throws an
     * {@link IllegalStateException} naming the item id of the move result, and renders nothing.</li>
     * </ul>
     *
     * @return the rendered content
     * @throws JSONException
     *             when the chart cannot be written as JSON
     * @throws IllegalStateException
     *             when the chart of the accepted move has not been re-resolved
     */
    @Override
    protected JSONObject renderContent() throws JSONException {

        if (moveResult == null) {
            return renderChart();
        }

        if (!moveResult.optBoolean(L_ACCEPTED)) {
            return renderMoveResultOnly();
        }

        if (!acceptedChartRefreshed) {
            throw new IllegalStateException("The Gantt chart of the accepted move of item " + moveResult.opt(L_ITEM_ID)
                    + " has not been refreshed");
        }

        JSONObject json = renderChart();
        json.put(L_MOVE_RESULT, moveResult);
        return json;
    }

    private JSONObject renderMoveResultOnly() throws JSONException {
        JSONObject moveResultJson = new JSONObject();
        moveResultJson.put(L_MOVE_RESULT, moveResult);
        return moveResultJson;
    }

    /**
     * Renders the chart: the zoom level; for each header date, the date when it has no error message and its error message
     * otherwise; the global error message when there is one; and, without a global error message, the scale, strips
     * orientation, items border width, rows, items and collisions, together with the items border colour and the selected
     * entity id when each is set.
     *
     * @return the chart content without a {@code moveResult} key
     * @throws JSONException
     *             when the chart cannot be written as JSON
     */
    private JSONObject renderChart() throws JSONException {
        JSONObject json = new JSONObject();

        json.put("zoomLevel", scale.getZoomLevel().toString());

        json.put("dateFromErrorMessage", dateFromErrorMessage);
        json.put("dateToErrorMessage", dateToErrorMessage);
        if (dateFromErrorMessage == null) {
            json.put("dateFrom", DATETYPE.toString(scale.getDateFrom(), getLocale()));
        }
        if (dateToErrorMessage == null) {
            json.put("dateTo", DATETYPE.toString(scale.getDateTo(), getLocale()));
        }

        json.put("globalErrorMessage", globalErrorMessage);

        if (globalErrorMessage == null) {
            json.put("scale", scale.getAsJson());

            JSONArray rowsArray = new JSONArray();
            JSONArray itemsArray = new JSONArray();

            for (Map.Entry<String, List<GanttChartItem>> entry : items.entrySet()) {
                rowsArray.put(entry.getKey());
                for (GanttChartItem item : entry.getValue()) {
                    if (item != null) {
                        itemsArray.put(item.getAsJson());
                    }
                }
            }

            json.put("stripsOrientation", getStripsOrientation().getStringValue());
            json.put("itemsBorderColor", itemsBorderColor);
            json.put("itemsBorderWidth", itemsBorderWidth);
            json.put("rows", rowsArray);
            json.put("items", itemsArray);

            JSONArray collisionItemsArray = new JSONArray();
            for (Map.Entry<String, List<GanttChartItem>> entry : collisionItems.entrySet()) {
                for (GanttChartItem item : entry.getValue()) {
                    if (item != null) {
                        collisionItemsArray.put(item.getAsJson());
                    }
                }
            }
            json.put("collisions", collisionItemsArray);

            json.put("selectedEntityId", selectedEntityId);
        }

        return json;
    }

    private Orientation getStripsOrientation() {
        if (stripsOrientation == null) {
            return Orientation.HORIZONTAL;
        } else {
            return stripsOrientation;
        }
    }

    protected String translate(final String suffix, final String... args) {
        return getTranslationService().translate(getTranslationPath() + "." + suffix, "qcadooView.gantt." + suffix, getLocale(),
                args);
    }

    /**
     * Returns the move built by the moveItem event of this request.
     *
     * @return the move request, or null when no move ran or the framework rejected the move
     */
    public GanttChartMoveRequest getMoveRequest() {
        return moveRequest;
    }

    /**
     * Accepts the move: replaces the move result with an accepted result for the same item id, without a message, requests
     * rendering, and then re-resolves the chart items and collisions through the {@code refresh} event handler. Once the
     * re-resolution returns, the accepted result renders together with the refreshed chart. A runtime exception thrown while
     * the chart is re-resolved propagates unchanged; the accepted result then stays marked as not refreshed, so
     * {@link #renderContent()} throws an {@link IllegalStateException} instead of rendering it. Without a move result the chart
     * items and collisions are only re-resolved.
     *
     * @throws IllegalStateException
     *             when the item id of the move result cannot be written as JSON
     */
    public void acceptMove() {
        if (moveResult == null) {
            eventPerformer.refresh(new String[0]);
            return;
        }
        setMoveResult(moveResult.opt(L_ITEM_ID), true, null);
        acceptedChartRefreshed = false;
        requestRender();
        eventPerformer.refresh(new String[0]);
        acceptedChartRefreshed = true;
    }

    /**
     * Rejects the move with the translation of the given message key. Each argument is HTML-escaped before it is placed in the
     * translated message.
     *
     * @param messageKey
     *            full translation key of the rejection reason
     * @param args
     *            arguments of the translation
     */
    public void rejectMove(final String messageKey, final String... args) {
        String[] escapedArgs;
        if (args == null) {
            escapedArgs = new String[0];
        } else {
            escapedArgs = new String[args.length];
            for (int index = 0; index < args.length; index++) {
                escapedArgs[index] = StringEscapeUtils.escapeHtml4(args[index]);
            }
        }
        String message = getTranslationService().translate(messageKey, getLocale(), escapedArgs);
        setMoveResult(moveResult == null ? null : moveResult.opt(L_ITEM_ID), false, message);
        requestRender();
    }

    /**
     * Replaces the move result with a new one holding {@code itemId} ({@link JSONObject#NULL} for a null item id),
     * {@code accepted} and, only for a non-null message, {@code message}.
     *
     * @param itemId
     *            entity id of the moved item, or null when unknown
     * @param accepted
     *            whether the move is accepted
     * @param message
     *            message shown to the user, or null for none
     * @throws IllegalStateException
     *             caused by the {@link JSONException} thrown when {@code itemId} cannot be written as JSON
     */
    private void setMoveResult(final Object itemId, final boolean accepted, final String message) {
        JSONObject result = new JSONObject();
        try {
            result.put(L_ITEM_ID, itemId == null ? JSONObject.NULL : itemId);
            result.put(L_ACCEPTED, accepted);
            if (message != null) {
                result.put(L_MESSAGE, message);
            }
        } catch (JSONException e) {
            throw new IllegalStateException(e.getMessage(), e);
        }
        moveResult = result;
    }

    protected class GanttChartComponentEventPerformer {

        public void initialize(final String[] args) {
            DateTime now = new DateTime().withHourOfDay(0).withMinuteOfHour(0).withSecondOfMinute(0).withMillisOfSecond(0);
            scale = new GanttChartScaleImpl(GanttChartComponentState.this, defaultZoomLevel, now.plusDays(defaultStartDay)
                    .toDate(), now.plusDays(defaultEndDay).toDate());
            scale.setIsDatesSet(true);
            dateFromErrorMessage = null;
            dateToErrorMessage = null;
            globalErrorMessage = null;
            refresh(args);
        }

        public void refresh(final String[] args) {
            requestRender();
            requestUpdateState();
            if (globalErrorMessage != null) {
                return;
            }
            items = itemResolver.resolve(scale, context, getLocale());
            updateCollisionItems();
        }

        public void selectEntity(final String[] args) {
            notifyEntityIdChangeListeners(selectedEntityId);
        }

        /**
         * Handles the moveItem event through {@link #performMoveItem(String[])}. A runtime exception thrown there is handled by
         * {@link #failMove(RuntimeException)}: it is logged, no move request is exposed, and the move result becomes "not
         * handled" for the item id known so far. A runtime exception thrown while that failure is handled, such as by the
         * translation of the "not handled" message, propagates from this method.
         *
         * @param args
         *            event arguments, holding the JSON payload as their only element
         */
        public void moveItem(final String[] args) {
            try {
                performMoveItem(args);
            } catch (RuntimeException e) {
                failMove(e);
            }
        }

        /**
         * Rejects a move whose handling failed: logs the exception, clears the move request, requests rendering, and replaces
         * the move result with a "not handled" result that keeps the item id known so far.
         *
         * @param exception
         *            the exception thrown while the move was handled
         */
        private void failMove(final RuntimeException exception) {
            LOG.error("Failed to handle the moveItem event of the Gantt chart", exception);
            Object itemId = moveResult == null ? null : moveResult.opt(L_ITEM_ID);
            moveRequest = null;
            requestRender();
            setMoveResult(itemId, false, translate(L_MOVE_ERROR_PREFIX + L_NOT_HANDLED));
        }

        /**
         * Handles the moveItem event. The only argument is a JSON object in strict JSON syntax with the integer
         * {@code itemId} and the strings {@code row}, {@code dateFrom}, {@code originalRow}, {@code originalName},
         * {@code originalDateFrom} and {@code originalDateTo}; dates use the canonical {@value DateUtils#L_DATE_TIME_FORMAT}
         * format and {@code dateFrom} is a wall-clock time of the JVM default time zone.
         * <p>
         * The checks run in this order and the first failure rejects the move: moves allowed by the component, a valid chart
         * scale, a payload that passes {@link #parseMovePayload(String[])}, a component context within the bounds of
         * {@link GanttChartMoveRequest#isWithinContextBounds(JSONObject)}, a parseable {@code dateFrom}, a {@code dateFrom}
         * whose year lies between {@link GanttChartComponentState#MOVE_MIN_YEAR} and
         * {@link GanttChartComponentState#MOVE_MAX_YEAR}, a {@code dateFrom} that exists in the time zone, an item with the
         * given entity id among the resolved items, a resolved target row, a {@code dateFrom} on the
         * {@link GanttChartComponentPattern#MOVE_GRID_MINUTES} grid, a duration of the resolved item that
         * {@link #getResolvedDuration(GanttChartItem, GanttChartComponentState.ItemBoundsRecordingScale)} establishes, and a
         * new end whose wall-clock year in the time zone lies in the same range. The off-grid rejection carries the grid
         * step and both year rejections carry the two bounds as translation arguments. The resolver receives an
         * {@link ItemBoundsRecordingScale} over the component's scale. A passing move keeps the item's duration, sets the
         * item's new dates and positions through {@link GanttChartModifiableItem}, and becomes available from
         * {@link GanttChartComponentState#getMoveRequest()}, whose end is the new start plus that duration. Its result stays
         * "not handled" until a listener calls {@link GanttChartComponentState#acceptMove()} or
         * {@link GanttChartComponentState#rejectMove(String, String...)}.
         *
         * @param args
         *            event arguments, holding the JSON payload as their only element
         */
        private void performMoveItem(final String[] args) {
            moveRequest = null;
            requestRender();
            String notHandledMessage = translate(L_MOVE_ERROR_PREFIX + L_NOT_HANDLED);
            setMoveResult(null, false, notHandledMessage);

            if (!allowItemMove) {
                rejectWith(null, L_MOVE_DISABLED);
                return;
            }
            if (scale == null || globalErrorMessage != null) {
                rejectWith(null, L_INVALID_REQUEST);
                return;
            }

            MovePayload payload = parseMovePayload(args);
            if (payload == null) {
                rejectWith(null, L_INVALID_REQUEST);
                return;
            }
            Long itemId = payload.getItemId();
            setMoveResult(itemId, false, notHandledMessage);

            if (!GanttChartMoveRequest.isWithinContextBounds(context)) {
                rejectWith(itemId, L_INVALID_REQUEST);
                return;
            }

            String row = payload.getText(L_ROW);

            LocalDateTime wallClockFrom = parseWallClock(payload.getText(L_DATE_FROM));
            if (wallClockFrom == null) {
                rejectWith(itemId, L_INVALID_REQUEST);
                return;
            }
            if (!isWithinMoveYears(wallClockFrom.getYear())) {
                rejectWith(itemId, L_DATE_OUT_OF_RANGE, String.valueOf(MOVE_MIN_YEAR), String.valueOf(MOVE_MAX_YEAR));
                return;
            }
            Date dateFrom = toInstant(wallClockFrom);
            if (dateFrom == null) {
                rejectWith(itemId, L_NONEXISTENT_TIME);
                return;
            }

            ItemBoundsRecordingScale recordingScale = new ItemBoundsRecordingScale(scale);
            Map<String, List<GanttChartItem>> resolvedItems = itemResolver.resolve(recordingScale, context, getLocale());
            GanttChartItem item = findResolvedItem(resolvedItems, itemId);
            if (!(item instanceof GanttChartModifiableItem)) {
                rejectWith(itemId, L_ITEM_NOT_MOVABLE);
                return;
            }
            if (!resolvedItems.containsKey(row)) {
                rejectWith(itemId, L_TARGET_ROW_UNKNOWN);
                return;
            }
            if (!isOnGrid(wallClockFrom)) {
                rejectWith(itemId, L_OFF_GRID, String.valueOf(GanttChartComponentPattern.MOVE_GRID_MINUTES));
                return;
            }

            Long durationMillis = getResolvedDuration(item, recordingScale);
            if (durationMillis == null) {
                rejectWith(itemId, L_INVALID_REQUEST);
                return;
            }
            Date dateTo = new Date(dateFrom.getTime() + durationMillis.longValue());
            if (!isWithinMoveYears(new LocalDateTime(dateTo.getTime(), getDefaultZone()).getYear())) {
                rejectWith(itemId, L_DATE_OUT_OF_RANGE, String.valueOf(MOVE_MIN_YEAR), String.valueOf(MOVE_MAX_YEAR));
                return;
            }

            GanttChartItem proposal = scale.createGanttChartItem(row, item.getName(), item.getEntityId(), dateFrom, dateTo);
            GanttChartModifiableItem movedItem = (GanttChartModifiableItem) item;
            movedItem.setDateFrom(proposal.getDateFrom());
            movedItem.setDateTo(proposal.getDateTo());
            movedItem.setFrom(proposal.getFrom());
            movedItem.setTo(proposal.getTo());

            moveRequest = new GanttChartMoveRequest(item, row, payload.getText(L_ORIGINAL_ROW),
                    payload.getText(L_ORIGINAL_NAME), payload.getText(L_ORIGINAL_DATE_FROM),
                    payload.getText(L_ORIGINAL_DATE_TO), dateFrom, dateTo, context);
        }

        /**
         * Parses the moveItem payload.
         *
         * @param args
         *            event arguments
         * @return the payload, or null when {@code args} does not hold exactly one non-null element, when that element is
         *         longer than {@link GanttChartComponentState#MOVE_PAYLOAD_MAX_LENGTH} characters, when it is not one JSON
         *         object as read by {@link #readJsonObjectMembers(String)}, when {@code itemId} is not a JSON integer within
         *         the {@code long} range, or when any key of {@link GanttChartComponentState#MOVE_PAYLOAD_TEXT_KEYS} is missing
         *         or not a JSON string
         */
        private MovePayload parseMovePayload(final String[] args) {
            if (args == null || args.length != 1 || args[0] == null) {
                return null;
            }
            if (args[0].length() > MOVE_PAYLOAD_MAX_LENGTH) {
                return null;
            }
            Map<String, Object> members = readJsonObjectMembers(args[0]);
            if (members == null) {
                return null;
            }
            Object itemId = members.get(L_ITEM_ID);
            if (!(itemId instanceof Long)) {
                return null;
            }
            Map<String, String> textValues = new HashMap<String, String>();
            for (String key : MOVE_PAYLOAD_TEXT_KEYS) {
                Object value = members.get(key);
                if (!(value instanceof String)) {
                    return null;
                }
                textValues.put(key, (String) value);
            }
            return new MovePayload((Long) itemId, textValues);
        }

        /**
         * Reads the members of a JSON object written in strict JSON syntax: double-quoted names and strings, no comments, no
         * trailing commas, and decimal numbers without leading zeros. Only the names of
         * {@link GanttChartComponentState#MOVE_PAYLOAD_KEYS} are accepted, each at most once, and each value is read by
         * {@link #readJsonValue(JsonParser, JsonToken)}. Reading stops at the first member that breaks these rules.
         *
         * @param text
         *            JSON text
         * @return the members by name, each value being a {@link String} for a JSON string, a {@link Long} for a JSON integer
         *         within the {@code long} range, and the {@link JsonToken} of the value for any other accepted value; null when
         *         the text is not valid JSON, is not one JSON object, holds a member name outside
         *         {@link GanttChartComponentState#MOVE_PAYLOAD_KEYS}, repeats a member name, holds a value that
         *         {@link #readJsonValue(JsonParser, JsonToken)} rejects, or holds any content after the object
         */
        private Map<String, Object> readJsonObjectMembers(final String text) {
            try {
                JsonParser parser = MOVE_PAYLOAD_JSON_FACTORY.createJsonParser(text);
                try {
                    return readJsonObjectMembers(parser);
                } finally {
                    parser.close();
                }
            } catch (IOException e) {
                return null;
            }
        }

        /**
         * Reads the members of the JSON object the parser is positioned before. A member name outside
         * {@link GanttChartComponentState#MOVE_PAYLOAD_KEYS}, or one already read, ends the reading before its value is read.
         *
         * @param parser
         *            parser positioned before the first token
         * @return the members by name as described by {@link #readJsonObjectMembers(String)}, or null when the input is not one
         *         JSON object, holds a member name outside {@link GanttChartComponentState#MOVE_PAYLOAD_KEYS}, repeats a
         *         member name, holds a value that {@link #readJsonValue(JsonParser, JsonToken)} rejects, or holds content
         *         after the object
         * @throws IOException
         *             when the input read is not valid JSON
         */
        private Map<String, Object> readJsonObjectMembers(final JsonParser parser) throws IOException {
            if (parser.nextToken() != JsonToken.START_OBJECT) {
                return null;
            }
            Map<String, Object> members = new HashMap<String, Object>();
            while (parser.nextToken() == JsonToken.FIELD_NAME) {
                String name = parser.getCurrentName();
                if (!MOVE_PAYLOAD_KEYS.contains(name) || members.containsKey(name)) {
                    return null;
                }
                Object value = readJsonValue(parser, parser.nextToken());
                if (value == null) {
                    return null;
                }
                members.put(name, value);
            }
            if (parser.getCurrentToken() != JsonToken.END_OBJECT || parser.nextToken() != null) {
                return null;
            }
            return members;
        }

        /**
         * Reads the scalar JSON value starting at the given token. An object or an array is rejected at its first token,
         * without reading its content. A string longer than {@link GanttChartComponentState#MOVE_PAYLOAD_MAX_TEXT_LENGTH}
         * characters after unescaping is rejected before its text is copied into a {@link String}. An integer whose text is
         * longer than {@link GanttChartComponentState#MOVE_PAYLOAD_MAX_INTEGER_LENGTH} characters is rejected before its
         * number type or value is read.
         *
         * @param parser
         *            parser positioned at the value's first token
         * @param valueToken
         *            first token of the value
         * @return the text of a JSON string, the {@link Long} of a JSON integer within the {@code long} range, the token itself
         *         for an integer outside that range and for {@code true}, {@code false}, {@code null} and a number with a
         *         fraction or exponent, or null for a rejected value
         * @throws IOException
         *             when the value is not valid JSON
         */
        private Object readJsonValue(final JsonParser parser, final JsonToken valueToken) throws IOException {
            if (valueToken == JsonToken.VALUE_STRING) {
                if (parser.getTextLength() > MOVE_PAYLOAD_MAX_TEXT_LENGTH) {
                    return null;
                }
                return parser.getText();
            }
            if (valueToken == JsonToken.VALUE_NUMBER_INT) {
                if (parser.getTextLength() > MOVE_PAYLOAD_MAX_INTEGER_LENGTH) {
                    return null;
                }
                if (parser.getNumberType() != JsonParser.NumberType.BIG_INTEGER) {
                    return Long.valueOf(parser.getLongValue());
                }
                return valueToken;
            }
            if (valueToken == JsonToken.START_OBJECT || valueToken == JsonToken.START_ARRAY) {
                return null;
            }
            return valueToken;
        }

        /**
         * Parses a wall-clock date written exactly in the {@value DateUtils#L_DATE_TIME_FORMAT} format, with four digits of
         * year and two digits in every other field.
         *
         * @param value
         *            date text
         * @return the wall-clock date, or null when the text is null, has another form, or is not a valid date
         */
        private LocalDateTime parseWallClock(final String value) {
            if (value == null || !MOVE_DATE_PATTERN.matcher(value).matches()) {
                return null;
            }
            try {
                return MOVE_DATE_FORMATTER.parseLocalDateTime(value);
            } catch (IllegalArgumentException e) {
                return null;
            }
        }

        /**
         * Converts a wall-clock date to an instant of the JVM default time zone, taking the earlier offset in a time zone
         * overlap.
         *
         * @param wallClock
         *            wall-clock date
         * @return the instant, or null when the wall-clock date does not exist in the time zone
         */
        private Date toInstant(final LocalDateTime wallClock) {
            try {
                return wallClock.toDateTime(getDefaultZone()).withEarlierOffsetAtOverlap().toDate();
            } catch (IllegalArgumentException e) {
                return null;
            }
        }

        /**
         * Returns the duration of a resolved item in milliseconds. When the item was created through the recording scale
         * and its current dates are the recorded start and end read to the second in the JVM default time zone, the duration
         * is the recorded end minus the recorded start. Otherwise it is the difference of the item's dates read in that time
         * zone, provided each of them exists there with exactly one offset.
         *
         * @param item
         *            resolved item
         * @param recordingScale
         *            scale the item resolver received
         * @return the duration, or null when a date of the item is missing or not a valid date in the
         *         {@value DateUtils#L_DATE_TIME_FORMAT} format, or when an unrecorded date does not exist or occurs twice in
         *         the time zone
         */
        private Long getResolvedDuration(final GanttChartItem item, final ItemBoundsRecordingScale recordingScale) {
            LocalDateTime wallClockFrom = parseWallClock(item.getDateFrom());
            LocalDateTime wallClockTo = parseWallClock(item.getDateTo());
            if (wallClockFrom == null || wallClockTo == null) {
                return null;
            }
            DateTimeZone zone = getDefaultZone();
            long[] recordedBounds = recordingScale.getRecordedBounds(item);
            if (recordedBounds != null && wallClockFrom.equals(toWallClockSecond(recordedBounds[0], zone))
                    && wallClockTo.equals(toWallClockSecond(recordedBounds[1], zone))) {
                return Long.valueOf(recordedBounds[1] - recordedBounds[0]);
            }
            Date resolvedDateFrom = toUnambiguousInstant(wallClockFrom, zone);
            Date resolvedDateTo = toUnambiguousInstant(wallClockTo, zone);
            if (resolvedDateFrom == null || resolvedDateTo == null) {
                return null;
            }
            return Long.valueOf(resolvedDateTo.getTime() - resolvedDateFrom.getTime());
        }

        private LocalDateTime toWallClockSecond(final long millis, final DateTimeZone zone) {
            return new LocalDateTime(millis, zone).withMillisOfSecond(0);
        }

        /**
         * Converts a wall-clock date to the one instant it denotes in the given time zone.
         *
         * @param wallClock
         *            wall-clock date
         * @param zone
         *            time zone
         * @return the instant, or null when the wall-clock date does not exist in the time zone or occurs twice in it
         */
        private Date toUnambiguousInstant(final LocalDateTime wallClock, final DateTimeZone zone) {
            DateTime dateTime;
            try {
                dateTime = wallClock.toDateTime(zone);
            } catch (IllegalArgumentException e) {
                return null;
            }
            DateTime earlier = dateTime.withEarlierOffsetAtOverlap();
            if (earlier.getMillis() != dateTime.withLaterOffsetAtOverlap().getMillis()) {
                return null;
            }
            return earlier.toDate();
        }

        private DateTimeZone getDefaultZone() {
            return DateTimeZone.forTimeZone(TimeZone.getDefault());
        }

        /**
         * Finds the first resolved item with the given entity id.
         *
         * @param resolvedItems
         *            resolved items by row name, may be null
         * @param itemId
         *            entity id to look for
         * @return the item, or null when no resolved item has the entity id
         */
        private GanttChartItem findResolvedItem(final Map<String, List<GanttChartItem>> resolvedItems, final Long itemId) {
            if (resolvedItems == null) {
                return null;
            }
            for (List<GanttChartItem> rowItems : resolvedItems.values()) {
                if (rowItems == null) {
                    continue;
                }
                for (GanttChartItem rowItem : rowItems) {
                    if (rowItem != null && itemId.equals(rowItem.getEntityId())) {
                        return rowItem;
                    }
                }
            }
            return null;
        }

        /**
         * Checks whether a wall-clock date lies on the {@link GanttChartComponentPattern#MOVE_GRID_MINUTES} grid.
         *
         * @param wallClock
         *            wall-clock date
         * @return true when the minute of hour is a multiple of the grid step and seconds and milliseconds are 0
         */
        private boolean isOnGrid(final LocalDateTime wallClock) {
            return wallClock.getMinuteOfHour() % GanttChartComponentPattern.MOVE_GRID_MINUTES == 0
                    && wallClock.getSecondOfMinute() == 0 && wallClock.getMillisOfSecond() == 0;
        }

        /**
         * Rejects the move with the translation of {@code move.error.<errorKey>} and clears the move request.
         *
         * @param itemId
         *            entity id of the moved item, or null when unknown
         * @param errorKey
         *            last part of the translation key
         * @param errorArgs
         *            arguments of the translation
         */
        private void rejectWith(final Object itemId, final String errorKey, final String... errorArgs) {
            moveRequest = null;
            setMoveResult(itemId, false, translate(L_MOVE_ERROR_PREFIX + errorKey, errorArgs));
        }

        /**
         * Checks whether a wall-clock year lies between {@link GanttChartComponentState#MOVE_MIN_YEAR} and
         * {@link GanttChartComponentState#MOVE_MAX_YEAR}, both included.
         *
         * @param year
         *            wall-clock year
         * @return true when the year lies within the range
         */
        private boolean isWithinMoveYears(final int year) {
            return year >= MOVE_MIN_YEAR && year <= MOVE_MAX_YEAR;
        }

        private void updateCollisionItems() {
            collisionItems = new HashMap<String, List<GanttChartItem>>();
            for (Entry<String, List<GanttChartItem>> rowEntry : items.entrySet()) {

                List<GanttChartItem> sortedItems = new ArrayList<GanttChartItem>(rowEntry.getValue());
                Collections.sort(sortedItems, new Comparator<GanttChartItem>() {

                    @Override
                    public int compare(final GanttChartItem itemA, final GanttChartItem itemB) {
                        return Double.valueOf(itemA.getFrom()).compareTo(Double.valueOf(itemB.getFrom()));
                    }
                });

                List<GanttChartItem> collisionRow = getCollisionsList(sortedItems, rowEntry.getKey());
                if (!collisionRow.isEmpty()) {
                    collisionItems.put(rowEntry.getKey(), collisionRow);
                }

            }
        }

        private List<GanttChartItem> getCollisionsList(final List<GanttChartItem> sortedItems, final String row) {

            List<GanttChartItem> collisionRow = new ArrayList<GanttChartItem>();

            GanttChartConflictItem collisionItem = null;
            GanttChartItem previousItem = null;

            for (GanttChartItem item : sortedItems) {

                if (previousItem != null && item.getFrom() < previousItem.getTo()) {

                    if (collisionItem != null && item.getFrom() < collisionItem.getTo()) { // same collision

                        if (item.getTo() > collisionItem.getTo()) { // not entirely included in existing collision
                            if (item.getTo() > previousItem.getTo()) { // entirely included in previous item
                                collisionItem.setTo(item.getTo());
                                collisionItem.setDateTo(item.getDateTo());
                            } else {
                                collisionItem.setTo(previousItem.getTo());
                                collisionItem.setDateTo(previousItem.getDateTo());
                            }
                        }

                    } else { // different collision

                        if (collisionItem != null) {
                            collisionRow.add(collisionItem);
                        }

                        if (item.getTo() < previousItem.getTo()) { // entirely included in previous item
                            collisionItem = new GanttChartConflictItem(row, item.getDateFrom(), item.getDateTo(), item.getFrom(),
                                    item.getTo());
                        } else {
                            collisionItem = new GanttChartConflictItem(row, item.getDateFrom(), previousItem.getDateTo(),
                                    item.getFrom(), previousItem.getTo());
                        }
                        collisionItem.addItem(previousItem);

                    }

                    collisionItem.addItem(item);
                }

                if (previousItem == null || item.getTo() > previousItem.getTo()) {
                    previousItem = item;
                }
            }

            if (collisionItem != null) {
                collisionRow.add(collisionItem);
            }

            return collisionRow;
        }
    }

    /**
     * Values of a moveItem payload that passed the syntax and type checks: the entity id of the moved item and the texts of
     * the keys in {@link GanttChartComponentState#MOVE_PAYLOAD_TEXT_KEYS}.
     */
    private static final class MovePayload {

        private final Long itemId;

        private final Map<String, String> textValues;

        MovePayload(final Long itemId, final Map<String, String> textValues) {
            this.itemId = itemId;
            this.textValues = textValues;
        }

        Long getItemId() {
            return itemId;
        }

        String getText(final String key) {
            return textValues.get(key);
        }

    }

    /**
     * Chart scale handed to the item resolver by the moveItem event. Every {@link GanttChartScale} method is delegated to the
     * component's scale. An item created through it is recorded with the start and end instants it was created from when both
     * are non-null.
     */
    private static final class ItemBoundsRecordingScale implements GanttChartScale {

        private final GanttChartScale delegate;

        private final Map<GanttChartItem, long[]> boundsByItem = new IdentityHashMap<GanttChartItem, long[]>();

        ItemBoundsRecordingScale(final GanttChartScale delegate) {
            this.delegate = delegate;
        }

        @Override
        public Date getDateTo() {
            return delegate.getDateTo();
        }

        @Override
        public void setDateTo(final Date dateTo) {
            delegate.setDateTo(dateTo);
        }

        @Override
        public Date getDateFrom() {
            return delegate.getDateFrom();
        }

        @Override
        public void setDateFrom(final Date dateFrom) {
            delegate.setDateFrom(dateFrom);
        }

        @Override
        public GanttChartItem createGanttChartItem(final String rowName, final String name, final Long entityId,
                final Date dateFrom, final Date dateTo) {
            return record(delegate.createGanttChartItem(rowName, name, entityId, dateFrom, dateTo), dateFrom, dateTo);
        }

        @Override
        public GanttChartItem createGanttChartItem(final String rowName, final String label, final GanttChartItemTooltip tooltip,
                final Long entityId, final Date dateFrom, final Date dateTo) {
            return record(delegate.createGanttChartItem(rowName, label, tooltip, entityId, dateFrom, dateTo), dateFrom, dateTo);
        }

        @Override
        public Boolean getIsDatesSet() {
            return delegate.getIsDatesSet();
        }

        @Override
        public void setIsDatesSet(final Boolean isDatesSet) {
            delegate.setIsDatesSet(isDatesSet);
        }

        /**
         * Returns the start and end instants recorded for an item created through this scale.
         *
         * @param item
         *            resolved item
         * @return the start and end in milliseconds since the epoch, or null when no bounds were recorded for the item: it was
         *         not created through this scale, or it was created with a null start or end
         */
        long[] getRecordedBounds(final GanttChartItem item) {
            return boundsByItem.get(item);
        }

        /**
         * Records the item with the instants of the given start and end, when both are given.
         *
         * @param item
         *            created item
         * @param dateFrom
         *            start the item was created from
         * @param dateTo
         *            end the item was created from
         * @return the item
         */
        private GanttChartItem record(final GanttChartItem item, final Date dateFrom, final Date dateTo) {
            if (dateFrom != null && dateTo != null) {
                boundsByItem.put(item, new long[] { dateFrom.getTime(), dateTo.getTime() });
            }
            return item;
        }

    }

}
