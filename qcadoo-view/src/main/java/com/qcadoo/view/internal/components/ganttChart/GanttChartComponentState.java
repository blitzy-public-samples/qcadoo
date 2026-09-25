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

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.TimeZone;

import org.apache.commons.lang3.StringEscapeUtils;
import org.joda.time.DateTime;
import org.joda.time.DateTimeZone;
import org.joda.time.LocalDateTime;
import org.joda.time.format.DateTimeFormat;
import org.joda.time.format.DateTimeFormatter;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import com.qcadoo.localization.api.utils.DateUtils;
import com.qcadoo.model.internal.api.ValueAndError;
import com.qcadoo.model.internal.types.DateType;
import com.qcadoo.view.api.components.ganttChart.GanttChartItem;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemResolver;
import com.qcadoo.view.api.components.ganttChart.GanttChartItemStrip.Orientation;
import com.qcadoo.view.internal.components.ganttChart.GanttChartScaleImpl.ZoomLevel;
import com.qcadoo.view.internal.states.AbstractComponentState;

public class GanttChartComponentState extends AbstractComponentState {

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

    /** Keys every moveItem payload must carry with a non-null value. */
    private static final String[] MOVE_PAYLOAD_KEYS = { L_ITEM_ID, L_ROW, L_DATE_FROM, L_ORIGINAL_ROW, L_ORIGINAL_NAME,
            L_ORIGINAL_DATE_FROM, L_ORIGINAL_DATE_TO };

    private static final String L_MOVE_ERROR_PREFIX = "move.error.";

    private static final String L_NOT_HANDLED = "notHandled";

    private static final String L_MOVE_DISABLED = "moveDisabled";

    private static final String L_INVALID_REQUEST = "invalidRequest";

    private static final String L_NONEXISTENT_TIME = "nonexistentTime";

    private static final String L_ITEM_NOT_MOVABLE = "itemNotMovable";

    private static final String L_TARGET_ROW_UNKNOWN = "targetRowUnknown";

    private static final String L_OFF_GRID = "offGrid";

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

    /** Outcome of the moveItem event of this request; null when no move ran. */
    private JSONObject moveResult;

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
     * Renders the chart content. A move that is not accepted renders only its {@code moveResult}; an accepted move renders the
     * whole chart together with its {@code moveResult}; without a move the chart renders without a {@code moveResult} key.
     */
    @Override
    protected JSONObject renderContent() throws JSONException {

        if (moveResult != null && !moveResult.optBoolean(L_ACCEPTED)) {
            JSONObject rejectedMoveJson = new JSONObject();
            rejectedMoveJson.put(L_MOVE_RESULT, moveResult);
            return rejectedMoveJson;
        }

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

        if (moveResult != null) {
            json.put(L_MOVE_RESULT, moveResult);
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
     * Accepts the move: re-resolves the chart items and collisions, and marks the move result as accepted.
     */
    public void acceptMove() {
        eventPerformer.refresh(new String[0]);
        if (moveResult != null) {
            setMoveResult(moveResult.opt(L_ITEM_ID), true, null);
        }
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
     * Replaces the move result with a new one.
     *
     * @param itemId
     *            entity id of the moved item, or null when unknown
     * @param accepted
     *            whether the move is accepted
     * @param message
     *            message shown to the user, or null for none
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
         * Handles the moveItem event. The first argument is a JSON object with the keys {@code itemId}, {@code row},
         * {@code dateFrom}, {@code originalRow}, {@code originalName}, {@code originalDateFrom} and {@code originalDateTo};
         * dates use the {@value DateUtils#L_DATE_TIME_FORMAT} format and {@code dateFrom} is a wall-clock time of the JVM
         * default time zone.
         * <p>
         * The checks run in this order and the first failure rejects the move: moves allowed by the component, a valid chart
         * scale, a complete payload, a parseable {@code dateFrom}, a {@code dateFrom} that exists in the time zone, an item
         * with the given entity id among the resolved items, a resolved target row, and a {@code dateFrom} on the
         * {@link GanttChartComponentPattern#MOVE_GRID_MINUTES} grid. A passing move keeps the item's duration, sets the item's
         * new dates and positions through {@link GanttChartModifiableItem}, and becomes available from
         * {@link GanttChartComponentState#getMoveRequest()}. Its result stays "not handled" until a listener calls
         * {@link GanttChartComponentState#acceptMove()} or {@link GanttChartComponentState#rejectMove(String, String...)}.
         *
         * @param args
         *            event arguments, the first holding the JSON payload
         */
        public void moveItem(final String[] args) {
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

            JSONObject payload = parseMovePayload(args);
            Long itemId = null;
            if (payload != null) {
                itemId = parseItemId(payload);
            }
            if (itemId == null) {
                rejectWith(null, L_INVALID_REQUEST);
                return;
            }
            setMoveResult(itemId, false, notHandledMessage);

            String row = payload.optString(L_ROW);

            LocalDateTime wallClockFrom = parseWallClock(payload.optString(L_DATE_FROM));
            if (wallClockFrom == null) {
                rejectWith(itemId, L_INVALID_REQUEST);
                return;
            }
            Date dateFrom = toInstant(wallClockFrom);
            if (dateFrom == null) {
                rejectWith(itemId, L_NONEXISTENT_TIME);
                return;
            }

            Map<String, List<GanttChartItem>> resolvedItems = itemResolver.resolve(scale, context, getLocale());
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

            Date resolvedDateFrom = parseResolvedDate(item.getDateFrom());
            Date resolvedDateTo = parseResolvedDate(item.getDateTo());
            if (resolvedDateFrom == null || resolvedDateTo == null) {
                rejectWith(itemId, L_INVALID_REQUEST);
                return;
            }
            Date dateTo = new Date(dateFrom.getTime() + (resolvedDateTo.getTime() - resolvedDateFrom.getTime()));

            GanttChartItem proposal = scale.createGanttChartItem(row, item.getName(), item.getEntityId(), dateFrom, dateTo);
            GanttChartModifiableItem movedItem = (GanttChartModifiableItem) item;
            movedItem.setDateFrom(proposal.getDateFrom());
            movedItem.setDateTo(proposal.getDateTo());
            movedItem.setFrom(proposal.getFrom());
            movedItem.setTo(proposal.getTo());

            moveRequest = new GanttChartMoveRequest(item, row, payload.optString(L_ORIGINAL_ROW),
                    payload.optString(L_ORIGINAL_NAME), payload.optString(L_ORIGINAL_DATE_FROM),
                    payload.optString(L_ORIGINAL_DATE_TO), dateFrom, dateTo, context);
        }

        /**
         * Parses the moveItem payload.
         *
         * @param args
         *            event arguments
         * @return the payload, or null when the first argument is missing, is not a JSON object, or lacks a required key
         */
        private JSONObject parseMovePayload(final String[] args) {
            if (args == null || args.length == 0 || args[0] == null) {
                return null;
            }
            JSONObject payload;
            try {
                payload = new JSONObject(args[0]);
            } catch (JSONException e) {
                return null;
            }
            for (String key : MOVE_PAYLOAD_KEYS) {
                if (payload.isNull(key)) {
                    return null;
                }
            }
            return payload;
        }

        /**
         * Reads the entity id of the moved item from the payload.
         *
         * @param payload
         *            moveItem payload
         * @return the entity id, or null when it is not a number
         */
        private Long parseItemId(final JSONObject payload) {
            try {
                return payload.getLong(L_ITEM_ID);
            } catch (JSONException e) {
                return null;
            }
        }

        /**
         * Parses a wall-clock date in the {@value DateUtils#L_DATE_TIME_FORMAT} format.
         *
         * @param value
         *            date text
         * @return the wall-clock date, or null when the text is null or not a valid date
         */
        private LocalDateTime parseWallClock(final String value) {
            if (value == null) {
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
                return wallClock.toDateTime(DateTimeZone.forTimeZone(TimeZone.getDefault())).withEarlierOffsetAtOverlap()
                        .toDate();
            } catch (IllegalArgumentException e) {
                return null;
            }
        }

        /**
         * Converts a date of a resolved item to an instant of the JVM default time zone.
         *
         * @param value
         *            date text in the {@value DateUtils#L_DATE_TIME_FORMAT} format
         * @return the instant, or null when the text is not a valid, existing date
         */
        private Date parseResolvedDate(final String value) {
            LocalDateTime wallClock = parseWallClock(value);
            if (wallClock == null) {
                return null;
            }
            return toInstant(wallClock);
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

}
